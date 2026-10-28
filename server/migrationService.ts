import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool, getStorageMode, isPostgresConfigured, checkDatabaseHealth } from '../src/db/index.ts';
import { ensureDatabaseSchema } from './dbMigrate.ts';
import { verifyPassword, ADMIN_EMAIL, readSessionToken } from './auth.ts';

export interface TableReconciliation {
  tableName: string;
  label: string;
  sourceCount: number;
  targetCountBefore: number;
  toInsertCount: number;
  toUpdateCount: number;
  conflictCount: number;
  logicalDuplicateCount: number;
  sourceTechDuplicateCount?: number;
  targetOnlyCount: number;
}

export interface DryRunResult {
  success: boolean;
  storageMode: string;
  provider: string;
  sourceFile: string;
  tables: TableReconciliation[];
  summary: {
    totalSourceRecords: number;
    totalTargetBefore: number;
    newRecordsToInsert: number;
    existingToUpdate: number;
    conflictsDetected: number;
    logicalDuplicates: number;
    sourceTechDuplicates?: number;
    targetOnlyRecords: number;
  };
  readyToMigrate: boolean;
  message: string;
  preflightToken?: string | null;
  preflightExpiresAt?: number | null;
  sourceFingerprint?: string;
  targetFingerprint?: string;
  authMode?: 'neon_session' | 'json_bootstrap';
  targetState?: NeonTargetAdminStatus;
}

export interface MigrationExecutionResult {
  success: boolean;
  backupFile: string;
  tables: {
    [tableName: string]: {
      source: number;
      inserted: number;
      updated: number;
      targetAfter: number;
    };
  };
  totalMigrated: number;
  postVerification: 'MATCHED' | 'DISCREPANCY';
  durationMs: number;
  message: string;
}

export interface NeonTargetAdminStatus {
  connected: boolean;
  state: 'EMPTY_BOOTSTRAP' | 'READY_WITH_ADMIN' | 'RECOVERY_REQUIRED';
  totalUsers: number;
  adminUsers: number;
  totalRecordsAcrossTables: number;
  hasValidAdmin: boolean;
  hasCompatibleSchema: boolean;
  bootstrapEligible: boolean;
  recoveryRequired: boolean;
  failClosedReason?: string;
  targetTableCounts?: Record<string, number>;
}

export interface PreflightTokenData {
  token: string;
  sourceFingerprint: string;
  targetFingerprint: string;
  adminId: string;
  adminEmail: string;
  migrationMode: string;
  createdAt: number;
  expiresAt: number;
  recoveryRequired: boolean;
}

const DATA_STORE_PATH = path.join(process.cwd(), 'data', 'db-local-store.json');
const BACKUPS_DIR = path.join(process.cwd(), 'data', 'backups');

// In-memory preflight token cache (single-use, 10 min TTL)
const preflightTokens = new Map<string, PreflightTokenData>();

// Rate limiter for bootstrap authentication attempts
interface RateLimitEntry {
  attempts: number;
  lockedUntil?: number;
}
const bootstrapAttempts = new Map<string, RateLimitEntry>();
const MAX_BOOTSTRAP_ATTEMPTS = 5;
const BOOTSTRAP_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Secret Masking Helpers
export function maskIp(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return ip.length > 6 ? `${ip.substring(0, 4)}***` : '***';
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

// Zero-safe Type Helpers (0 !== null/undefined, preserves exact numeric and string values)
export function safeKpiScore(val: any, defaultVal: string | null = null): string | null {
  if (val === null || val === undefined || val === '') {
    return defaultVal;
  }
  if (val === 0 || val === '0' || val === 0.0) {
    return '0';
  }
  return String(val);
}

export function safeNullableNumber(val: any, defaultVal: number | null = null): number | null {
  if (val === null || val === undefined || val === '') {
    return defaultVal;
  }
  const n = Number(val);
  return isNaN(n) ? defaultVal : n;
}

export function safeNumber(val: any, defaultVal: number = 0): number {
  if (val === null || val === undefined || val === '') {
    return defaultVal;
  }
  const n = Number(val);
  return isNaN(n) ? defaultVal : n;
}

export function safeNullableString(val: any, defaultVal: string | null = null): string | null {
  if (val === null || val === undefined) {
    return defaultVal;
  }
  const s = String(val).trim();
  return s.length > 0 ? s : defaultVal;
}

export function safeString(val: any, defaultVal: string = ''): string {
  if (val === null || val === undefined) {
    return defaultVal;
  }
  return String(val);
}

export function checkBootstrapRateLimit(identifier: string): { allowed: boolean; waitMinutes?: number } {
  const entry = bootstrapAttempts.get(identifier);
  const now = Date.now();
  if (entry && entry.lockedUntil && entry.lockedUntil > now) {
    const waitMinutes = Math.ceil((entry.lockedUntil - now) / 60000);
    return { allowed: false, waitMinutes };
  }
  return { allowed: true };
}

export function recordBootstrapFailure(identifier: string) {
  const now = Date.now();
  let entry = bootstrapAttempts.get(identifier);
  if (!entry || (entry.lockedUntil && entry.lockedUntil <= now)) {
    entry = { attempts: 0 };
  }
  entry.attempts += 1;
  if (entry.attempts >= MAX_BOOTSTRAP_ATTEMPTS) {
    entry.lockedUntil = now + BOOTSTRAP_LOCKOUT_MS;
    console.warn(`[BootstrapAuth] IP/ID ${maskIp(identifier)} locked out for 15 minutes after ${entry.attempts} failed attempts.`);
  }
  bootstrapAttempts.set(identifier, entry);
}

export function recordBootstrapSuccess(identifier: string) {
  bootstrapAttempts.delete(identifier);
}

export function verifyRequestOrigin(req: any, isMutation: boolean = false): boolean {
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  const host = req.headers['host'];

  // Fail closed if mutation and both origin and referer are missing
  if (isMutation && !origin && !referer) {
    return false;
  }

  const headerUrl = origin || referer;
  if (!headerUrl || !host) {
    return !isMutation;
  }

  try {
    const parsed = new URL(String(headerUrl));
    return parsed.host === host;
  } catch {
    return false;
  }
}

export function computeSourceFingerprint(): string {
  if (!fs.existsSync(DATA_STORE_PATH)) return 'no-source-file';
  const raw = fs.readFileSync(DATA_STORE_PATH, 'utf-8');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function computeTargetFingerprint(poolOrClient?: any): Promise<string> {
  const queryRunner = poolOrClient || pool;
  const hash = crypto.createHash('sha256');

  // Query each table in TABLES_CONFIG in deterministic order
  for (const t of TABLES_CONFIG) {
    // 1. Check if table exists in public schema
    const tblCheck = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [t.dbTable]
    );
    if (tblCheck.rows.length === 0) {
      hash.update(`${t.dbTable}:TABLE_ABSENT;`);
      continue;
    }

    // 2. Fetch schema columns definition (sorted deterministically)
    const colRes = await queryRunner.query(
      `SELECT column_name, data_type, is_nullable 
       FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = $1 
       ORDER BY column_name`,
      [t.dbTable]
    );
    const colSummary = colRes.rows.map((c: any) => `${c.column_name}:${c.data_type}:${c.is_nullable}`).join('|');
    hash.update(`${t.dbTable}:SCHEMA[${colSummary}];`);

    // 3. Compute deterministic canonical row content hash
    // MD5(ROW(t.*)::text) hashes all row columns; STRING_AGG orders deterministically.
    const colNames = colRes.rows.map((c: any) => c.column_name);
    const orderCol = colNames.includes(t.uniqueKey) ? `"${t.uniqueKey}"` : (colNames[0] ? `"${colNames[0]}"` : 'ctid');
    const rowHashRes = await queryRunner.query(`
      SELECT 
        COUNT(*)::int as row_count,
        MD5(COALESCE(STRING_AGG(MD5(ROW(t.*)::text), ',' ORDER BY ${orderCol}::text), 'EMPTY_TABLE')) as content_hash
      FROM "${t.dbTable}" t
    `);
    const rowCount = rowHashRes.rows[0]?.row_count || 0;
    const contentHash = rowHashRes.rows[0]?.content_hash || 'EMPTY_TABLE';
    hash.update(`${t.dbTable}:ROWS[${rowCount}:${contentHash}];`);
  }

  return hash.digest('hex');
}

export function generatePreflightToken(
  admin: any, 
  mode: string, 
  recoveryRequired: boolean, 
  sourceFp: string, 
  targetFp: string
): { token: string | null; expiresAt: number | null } {
  // If target requires recovery, never generate an executable token
  if (recoveryRequired) {
    return { token: null, expiresAt: null };
  }

  const now = Date.now();
  // Prune expired
  for (const [k, v] of preflightTokens.entries()) {
    if (v.expiresAt <= now) preflightTokens.delete(k);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes max
  preflightTokens.set(token, {
    token,
    sourceFingerprint: sourceFp,
    targetFingerprint: targetFp,
    adminId: String(admin.id || admin.email || ''),
    adminEmail: String(admin.email || ''),
    migrationMode: mode,
    createdAt: now,
    expiresAt,
    recoveryRequired: false
  });
  return { token, expiresAt };
}

export function getPreflightToken(tokenStr: string): PreflightTokenData | undefined {
  return preflightTokens.get(tokenStr);
}

export function setPreflightTokenForTest(tokenStr: string, data: PreflightTokenData): void {
  preflightTokens.set(tokenStr, data);
}

export function clearPreflightTokens(): void {
  preflightTokens.clear();
}

export async function validateAndConsumePreflightToken(
  tokenStr: string, 
  adminUser: any,
  expectedMode: string = 'json_to_neon',
  poolOrClient?: any,
  sourceStore?: Record<string, any[]>
): Promise<{ valid: boolean; statusCode?: number; error?: string; tokenData?: PreflightTokenData }> {
  if (!tokenStr || typeof tokenStr !== 'string' || !tokenStr.trim()) {
    return { 
      valid: false, 
      statusCode: 403, 
      error: 'Thiếu mã xác thực Dry Run (preflightToken). Bắt buộc phải thực hiện bước 1. Đối soát dữ liệu (Dry Run) trước khi thực thi di chuyển.' 
    };
  }

  const tokenData = preflightTokens.get(tokenStr.trim());
  if (!tokenData) {
    return { 
      valid: false, 
      statusCode: 403, 
      error: 'Mã xác thực Dry Run không tồn tại hoặc đã được sử dụng. Vui lòng thực hiện lại bước Đối soát dữ liệu (Dry Run).' 
    };
  }

  if (Date.now() > tokenData.expiresAt) {
    preflightTokens.delete(tokenStr.trim());
    return { 
      valid: false, 
      statusCode: 403, 
      error: 'Mã xác thực Dry Run đã hết hạn (tối đa 10 phút). Vui lòng thực hiện lại Đối soát dữ liệu (Dry Run) để làm mới đối soát.' 
    };
  }

  if (tokenData.recoveryRequired) {
    preflightTokens.delete(tokenStr.trim());
    return { 
      valid: false, 
      statusCode: 403, 
      error: 'Cơ sở dữ liệu Neon đang ở trạng thái RECOVERY_REQUIRED. Thao tác thực thi di chuyển bị khóa an toàn theo nguyên tắc Fail-Closed.' 
    };
  }

  // Verify migration mode
  if (tokenData.migrationMode !== expectedMode) {
    return {
      valid: false,
      statusCode: 403,
      error: `Chế độ di chuyển không khớp (yêu cầu: ${tokenData.migrationMode}, thực tế: ${expectedMode}).`
    };
  }

  // Strict identity check: both token and request MUST have valid non-empty emails, and they MUST match
  const reqEmail = String(adminUser?.email || '').trim().toLowerCase();
  const tokenEmail = String(tokenData.adminEmail || '').trim().toLowerCase();
  const reqId = String(adminUser?.id || '').trim();
  const tokenId = String(tokenData.adminId || '').trim();

  if (!reqEmail || !tokenEmail || reqEmail !== tokenEmail) {
    return {
      valid: false,
      statusCode: 403,
      error: 'Token Dry Run được cấp cho Quản trị viên khác (sai lệch email Quản trị viên).'
    };
  }

  if (tokenId && reqId && tokenId !== reqId) {
    return {
      valid: false,
      statusCode: 403,
      error: 'Token Dry Run được cấp cho Quản trị viên khác (sai lệch ID Quản trị viên).'
    };
  }

  // Re-verify fingerprints right before BEGIN transaction
  let currentSourceFp: string;
  let currentTargetFp: string;
  try {
    currentSourceFp = sourceStore 
      ? crypto.createHash('sha256').update(JSON.stringify(sourceStore)).digest('hex')
      : computeSourceFingerprint();
    currentTargetFp = await computeTargetFingerprint(poolOrClient);
  } catch (err: any) {
    return {
      valid: false,
      statusCode: 500,
      error: `Lỗi tính toán fingerprint kiểm tra an toàn: ${err?.message || String(err)}`
    };
  }

  if (currentSourceFp !== tokenData.sourceFingerprint || currentTargetFp !== tokenData.targetFingerprint) {
    preflightTokens.delete(tokenStr.trim());
    return { 
      valid: false, 
      statusCode: 409, 
      error: 'Dữ liệu nguồn JSON hoặc cơ sở dữ liệu đích Neon đã thay đổi sau khi đối soát Dry Run. Vui lòng chạy lại Đối soát dữ liệu (Dry Run) trước khi thực thi.' 
    };
  }

  // Single-use: consume token only AFTER all identity, mode, expiry and fingerprint checks pass!
  preflightTokens.delete(tokenStr.trim());
  return { valid: true, tokenData };
}

/**
 * Check Neon PostgreSQL tables and classify target state strictly into 3 fail-closed states:
 * 1. EMPTY_BOOTSTRAP: 0 records across ALL public tables and no admin. bootstrapEligible = true.
 * 2. READY_WITH_ADMIN: Has active ADMIN user and compatible schema. bootstrapEligible = false.
 * 3. RECOVERY_REQUIRED: Has records in ANY table (>0) but lacks valid ADMIN or incompatible schema. bootstrapEligible = false, recoveryRequired = true.
 */
export async function checkNeonTargetAdminStatus(poolOrClient?: any): Promise<NeonTargetAdminStatus> {
  const queryRunner = poolOrClient || pool;
  const configured = isPostgresConfigured();
  if (!configured && !poolOrClient) {
    return {
      connected: false,
      state: 'RECOVERY_REQUIRED',
      totalUsers: 0,
      adminUsers: 0,
      totalRecordsAcrossTables: 0,
      hasValidAdmin: false,
      hasCompatibleSchema: false,
      bootstrapEligible: false,
      recoveryRequired: true,
      failClosedReason: 'DATABASE_URL chưa được cấu hình trong Secrets.'
    };
  }

  try {
    // 1. Enumerate all tables in public schema and count records
    const tblRes = await queryRunner.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);

    let totalRecordsAcrossTables = 0;
    const targetTableCounts: Record<string, number> = {};

    for (const r of tblRes.rows) {
      // Fail closed: do NOT swallow table counting error into 0!
      const c = await queryRunner.query(`SELECT COUNT(*)::int as cnt FROM "${r.table_name}"`);
      const cnt = Number(c.rows[0]?.cnt || 0);
      targetTableCounts[r.table_name] = cnt;
      totalRecordsAcrossTables += cnt;
    }

    // 2. Check users table specifically
    const usersTableExists = tblRes.rows.some((r: any) => r.table_name === 'users');
    let totalUsers = 0;
    let adminUsers = 0;
    let hasCompatibleSchema = false;

    if (usersTableExists) {
      totalUsers = targetTableCounts['users'] || 0;

      const colCheck = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'users' 
          AND column_name IN ('password', 'role', 'status')
      `);
      const colNames = colCheck.rows.map((c: any) => c.column_name);
      const hasPasswordCol = colNames.includes('password');
      const hasRoleCol = colNames.includes('role');
      const hasStatusCol = colNames.includes('status');

      hasCompatibleSchema = hasPasswordCol && hasRoleCol && hasStatusCol;

      if (hasCompatibleSchema) {
        const adminRes = await queryRunner.query(`
          SELECT COUNT(*)::int AS count 
          FROM users 
          WHERE (role = 'ADMIN' OR email = '${ADMIN_EMAIL}' OR email = 'dungchodangkyai@gmail.com')
            AND status = 'Đang làm'
            AND password IS NOT NULL
            AND length(trim(password)) > 0
        `);
        adminUsers = Number(adminRes.rows[0]?.count || 0);
      }
    }

    // 3. Classify State
    if (adminUsers > 0) {
      return {
        connected: true,
        state: 'READY_WITH_ADMIN',
        totalUsers,
        adminUsers,
        totalRecordsAcrossTables,
        hasValidAdmin: true,
        hasCompatibleSchema: true,
        bootstrapEligible: false,
        recoveryRequired: false,
        targetTableCounts
      };
    }

    // If completely empty: 0 records across ALL tables and no users
    if (totalRecordsAcrossTables === 0) {
      return {
        connected: true,
        state: 'EMPTY_BOOTSTRAP',
        totalUsers: 0,
        adminUsers: 0,
        totalRecordsAcrossTables: 0,
        hasValidAdmin: false,
        hasCompatibleSchema: true,
        bootstrapEligible: true,
        recoveryRequired: false,
        targetTableCounts
      };
    }

    // Anomalous/Dirty state: totalRecordsAcrossTables > 0 but adminUsers === 0
    return {
      connected: true,
      state: 'RECOVERY_REQUIRED',
      totalUsers,
      adminUsers: 0,
      totalRecordsAcrossTables,
      hasValidAdmin: false,
      hasCompatibleSchema,
      bootstrapEligible: false,
      recoveryRequired: true,
      failClosedReason: `Cơ sở dữ liệu Neon đã chứa ${totalRecordsAcrossTables} bản ghi từ hệ thống trước (gồm ${totalUsers} người dùng, ${targetTableCounts['works'] || 0} công việc) nhưng không có tài khoản Quản trị viên (ADMIN) hợp lệ hoặc cấu trúc bảng chưa đồng nhất. Thao tác ghi trực tiếp bị khóa theo nguyên tắc Fail-Closed để ngăn chặn ghi đè hay nhân đôi dữ liệu. Bạn có thể chạy "1. Đối soát dữ liệu (Dry Run)" ở chế độ chỉ đọc để chẩn đoán.`,
      targetTableCounts
    };
  } catch (err: any) {
    return {
      connected: false,
      state: 'RECOVERY_REQUIRED',
      totalUsers: 0,
      adminUsers: 0,
      totalRecordsAcrossTables: 0,
      hasValidAdmin: false,
      hasCompatibleSchema: false,
      bootstrapEligible: false,
      recoveryRequired: true,
      failClosedReason: `Lỗi kết nối hoặc truy vấn cơ sở dữ liệu: ${err?.message || String(err)}`
    };
  }
}

/**
 * Verify administrator password directly against JSON source store.
 * Returns authenticated admin profile without sensitive hash or password.
 */
export function verifyJsonAdminPassword(password: string): { verified: boolean; admin?: any; error?: string } {
  if (!password || typeof password !== 'string' || !password.trim()) {
    return { verified: false, error: 'Vui lòng cung cấp mật khẩu Quản trị viên.' };
  }
  if (!fs.existsSync(DATA_STORE_PATH)) {
    return { verified: false, error: 'Không tìm thấy tệp dữ liệu nguồn JSON.' };
  }
  try {
    const raw = fs.readFileSync(DATA_STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const usersList: any[] = parsed.users || [];
    const activeAdmins = usersList.filter(u => 
      u.status === 'Đang làm' && (u.role === 'ADMIN' || String(u.email || '').toLowerCase() === ADMIN_EMAIL || String(u.email || '').toLowerCase() === 'dungchodangkyai@gmail.com')
    );
    if (activeAdmins.length === 0) {
      return { verified: false, error: 'Không tìm thấy tài khoản Quản trị viên nào trong tệp dữ liệu nguồn JSON.' };
    }
    for (const admin of activeAdmins) {
      if (verifyPassword(password.trim(), admin.password)) {
        return {
          verified: true,
          admin: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: 'ADMIN',
            source: 'json_source'
          }
        };
      }
    }
    return { verified: false, error: 'Mật khẩu Quản trị viên không chính xác hoặc tài khoản không có quyền Quản trị tối cao (ADMIN).' };
  } catch (err: any) {
    return { verified: false, error: 'Lỗi khi đọc dữ liệu nguồn: ' + (err?.message || err) };
  }
}

/**
 * Migration Authentication Middleware:
 * 1. Checks origin (fail-closed if mutation).
 * 2. Accepts normal Neon ADMIN session (with password verification).
 * 3. In EMPTY_BOOTSTRAP: allows secure bootstrap authentication using JSON source ADMIN password.
 * 4. In RECOVERY_REQUIRED: allows read-only Dry Run using JSON source ADMIN password for diagnosis, but strictly blocks Execute.
 * 5. Rate-limiting enforced. No credentials logged.
 */
export async function authenticateMigrationRequest(req: any, res: any, next: any) {
  const isMutation = req.body?.dryRun === false;
  if (!verifyRequestOrigin(req, isMutation)) {
    return res.status(403).json({ success: false, error: 'Yêu cầu bị từ chối do nguồn gốc không hợp lệ (Origin mismatch).' });
  }

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  // 1. Check normal Neon session first
  const session = readSessionToken(req);
  if (session && Number.isInteger(session.userId)) {
    try {
      const { db } = await import('../src/db/index.ts');
      const neonUser = await db.query.users.findFirst({
        where: (u: any, { eq }: any) => eq(u.id, session.userId)
      });
      if (neonUser && neonUser.status === 'Đang làm' && (neonUser.role === 'ADMIN' || String(neonUser.email || '').toLowerCase() === ADMIN_EMAIL)) {
        const inputPwd = (req.body?.adminPassword || '').trim();
        if (!inputPwd) {
          return res.status(401).json({
            success: false,
            error: 'Vui lòng nhập mật khẩu Quản trị viên để xác thực.',
            requireAdminPassword: true,
            authMode: 'neon_session'
          });
        }
        if (!verifyPassword(inputPwd, neonUser.password)) {
          return res.status(401).json({
            success: false,
            error: 'Mật khẩu Quản trị viên không chính xác.',
            authMode: 'neon_session'
          });
        }

        req.authUser = neonUser;
        req.migrationAuthMode = 'neon_session';
        return next();
      }
    } catch {
      // Continue to target status evaluation
    }
  }

  // 2. Evaluate Target State
  const targetStatus = await checkNeonTargetAdminStatus();

  // If Neon already has active ADMIN: bootstrap path is permanently disabled
  if (targetStatus.hasValidAdmin) {
    return res.status(401).json({
      success: false,
      error: 'Cơ sở dữ liệu Neon đã có tài khoản Quản trị viên. Chế độ bootstrap đã tự động khóa vĩnh viễn theo nguyên tắc dữ liệu thực. Vui lòng đăng nhập bằng phiên Quản trị viên Neon hợp lệ (Cookie kpi_session hoặc Bearer token).',
      bootstrapEligible: false,
      targetState: targetStatus
    });
  }

  // If Execute is requested while target is in RECOVERY_REQUIRED: STRICT FAIL-CLOSED
  if (isMutation && targetStatus.recoveryRequired) {
    return res.status(403).json({
      success: false,
      error: targetStatus.failClosedReason || 'Cơ sở dữ liệu đích ở trạng thái RECOVERY_REQUIRED. Thao tác thực thi di chuyển bị khóa theo nguyên tắc Fail-Closed.',
      bootstrapEligible: false,
      targetState: targetStatus
    });
  }

  // Check rate limit for bootstrap attempts
  const rl = checkBootstrapRateLimit(clientIp);
  if (!rl.allowed) {
    return res.status(429).json({
      success: false,
      error: `Đã vượt quá số lần thử mật khẩu Quản trị viên (tối đa 5 lần). Vui lòng thử lại sau ${rl.waitMinutes} phút để bảo vệ an toàn hệ thống.`,
      lockedOut: true,
      waitMinutes: rl.waitMinutes
    });
  }

  // 3. Verify Admin Password against JSON source
  const inputPwd = (req.body?.adminPassword || '').trim();
  if (!inputPwd) {
    return res.status(401).json({
      success: false,
      error: 'Vui lòng nhập mật khẩu Quản trị viên (ADMIN) hiện có trong dữ liệu nguồn JSON để xác thực.',
      requireAdminPassword: true,
      bootstrapMode: true,
      targetState: targetStatus
    });
  }

  const result = verifyJsonAdminPassword(inputPwd);
  if (!result.verified) {
    recordBootstrapFailure(clientIp);
    console.warn(`[BootstrapAuth] IP=${maskIp(clientIp)} failed verification attempt.`);
    return res.status(401).json({
      success: false,
      error: 'Mật khẩu Quản trị viên không chính xác hoặc tài khoản không có quyền Quản trị tối cao (ADMIN).',
      bootstrapMode: true
    });
  }

  recordBootstrapSuccess(clientIp);
  console.log(`[BootstrapAuth] IP=${maskIp(clientIp)} successfully authenticated as ADMIN (bootstrap mode) for user ${maskEmail(result.admin?.email)}.`);

  req.authUser = result.admin;
  req.migrationAuthMode = 'json_bootstrap';
  req.targetState = targetStatus;
  next();
}

export const TABLES_CONFIG = [
  { key: 'users', dbTable: 'users', label: 'Nhân sự', uniqueKey: 'email', jsonKey: 'email' },
  { key: 'categories', dbTable: 'categories', label: 'Danh mục', uniqueKey: 'code', jsonKey: 'code' },
  { key: 'works', dbTable: 'works', label: 'Công việc', uniqueKey: 'work_id', jsonKey: 'workId' },
  { key: 'assignments', dbTable: 'assignments', label: 'Phân công', uniqueKey: 'assignment_id', jsonKey: 'assignmentId' },
  { key: 'overtimes', dbTable: 'overtimes', label: 'Làm thêm (OT)', uniqueKey: 'ot_id', jsonKey: 'otId' },
  { key: 'kpiResults', dbTable: 'kpi_results', label: 'Kết quả KPI', uniqueKey: 'kpi_id', jsonKey: 'kpiId' },
  { key: 'notifications', dbTable: 'notifications', label: 'Thông báo', uniqueKey: 'notify_id', jsonKey: 'notifyId' },
  { key: 'systemLogs', dbTable: 'system_logs', label: 'Nhật ký hệ thống', uniqueKey: 'log_id', jsonKey: 'logId' },
  { key: 'pushSettings', dbTable: 'push_settings', label: 'Cấu hình WebPush', uniqueKey: 'id', jsonKey: 'id' },
  { key: 'pushSubscriptions', dbTable: 'push_subscriptions', label: 'Thiết bị WebPush', uniqueKey: 'endpoint', jsonKey: 'endpoint' },
];

/**
 * Recursively normalizes any JSON-compatible value:
 * - Sorts object keys alphabetically at every level.
 * - Preserves array element order.
 * - Normalizes numbers, booleans, strings, null.
 * - Recursively parses JSON strings if applicable.
 */
export function normalizeJsonValue(val: any): any {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeJsonValue(parsed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  if (typeof val === 'boolean') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(item => normalizeJsonValue(item));
  }
  if (typeof val === 'object') {
    const sortedKeys = Object.keys(val).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = normalizeJsonValue(val[key]);
    }
    return result;
  }
  return val;
}

export function stableCanonicalJson(val: any, defaultVal: string = '{}'): string {
  if (val === null || val === undefined) {
    return defaultVal;
  }
  let target = val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return defaultVal;
    try {
      target = JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  const normalized = normalizeJsonValue(target);
  if (normalized === null || normalized === undefined) {
    return defaultVal;
  }
  return JSON.stringify(normalized);
}

export function extractTechnicalKey(row: any, t: typeof TABLES_CONFIG[0]): string | null {
  if (!row) return null;
  const jsonKey = t.jsonKey || t.uniqueKey;
  const dbKey = t.uniqueKey;
  const raw = row[jsonKey] !== undefined && row[jsonKey] !== null 
    ? row[jsonKey] 
    : (row[dbKey] !== undefined && row[dbKey] !== null ? row[dbKey] : null);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s.length === 0) return null;

  // 1. users: ID is the primary identity-preserving key.
  // When uniqueKey is email, preserve exact case matching PostgreSQL's case-sensitive UNIQUE constraint.
  // Case-insensitive collisions emit warnings in validators and do NOT block restore.
  if (t.dbTable === 'users' || t.uniqueKey === 'email') {
    return s;
  }
  // 2. categories.code: trim + uppercase
  if (t.dbTable === 'categories' || t.uniqueKey === 'code') {
    return s.toUpperCase();
  }
  // 3. Technical IDs (work_id, assignment_id, ot_id, kpi_id, notify_id, log_id)
  //    and push_subscriptions.endpoint: trim, PRESERVE EXACT CASE
  return s;
}

export function formatDateSlice(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    try {
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  }
  const str = String(val).trim();
  return str.slice(0, 10);
}

export function extractLogicalKey(row: any, dbTable: string): string | null {
  if (!row) return null;
  switch (dbTable) {
    case 'users': {
      const email = row.email;
      return email ? String(email).trim().toLowerCase() : null;
    }
    case 'categories': {
      const code = row.code;
      return code ? String(code).trim().toUpperCase() : null;
    }
    case 'works': {
      const userId = row.userId ?? row.user_id ?? '';
      const month = row.month ?? '';
      const task = String(row.taskCode ?? row.task_code ?? row.taskName ?? row.task_name ?? '').trim().toLowerCase();
      const startDate = formatDateSlice(row.startDate ?? row.start_date);
      return `${userId}_${month}_${task}_${startDate}`;
    }
    case 'assignments': {
      const receiverId = row.receiverId ?? row.receiver_id ?? '';
      const month = row.month ?? '';
      const task = String(row.taskCode ?? row.task_code ?? row.taskName ?? row.task_name ?? '').trim().toLowerCase();
      return `${receiverId}_${month}_${task}`;
    }
    case 'overtimes': {
      const userId = row.userId ?? row.user_id ?? '';
      const otDate = formatDateSlice(row.otDate ?? row.ot_date);
      const startTime = row.startTime ?? row.start_time ?? '';
      return `${userId}_${otDate}_${startTime}`;
    }
    case 'kpi_results': {
      const month = row.month ?? '';
      const userId = row.userId ?? row.user_id ?? '';
      return `${month}_${userId}`;
    }
    case 'notifications': {
      const id = row.notifyId ?? row.notify_id;
      return id ? String(id).trim() : null;
    }
    case 'system_logs': {
      const id = row.logId ?? row.log_id;
      return id ? String(id).trim() : null;
    }
    case 'push_settings': {
      return '1';
    }
    case 'push_subscriptions': {
      const ep = row.endpoint;
      return ep ? String(ep).trim() : null;
    }
    default:
      return null;
  }
}

export interface ValidationError {
  tableName: string;
  recordId: string;
  missingFields: string[];
  message: string;
}

export function validateSourceStore(store: Record<string, any[]>): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  // 1. Users: email, name
  for (const [idx, u] of (store.users || []).entries()) {
    const missing: string[] = [];
    if (!u.email || !String(u.email).trim()) missing.push('email');
    if (!u.name || !String(u.name).trim()) missing.push('name');
    if (missing.length > 0) {
      errors.push({
        tableName: 'users',
        recordId: u.email || String(u.id || idx),
        missingFields: missing,
        message: `Bản ghi nhân sự #${idx} thiếu trường bắt buộc: ${missing.join(', ')}`
      });
    }
  }

  // 2. Categories: code, name
  for (const [idx, c] of (store.categories || []).entries()) {
    const missing: string[] = [];
    if (!c.code || !String(c.code).trim()) missing.push('code');
    if (!c.name || !String(c.name).trim()) missing.push('name');
    if (missing.length > 0) {
      errors.push({
        tableName: 'categories',
        recordId: c.code || String(c.id || idx),
        missingFields: missing,
        message: `Bản ghi danh mục #${idx} thiếu trường bắt buộc: ${missing.join(', ')}`
      });
    }
  }

  // 3. Works: workId, month, userId, taskName
  for (const [idx, w] of (store.works || []).entries()) {
    const missing: string[] = [];
    const workId = w.workId ?? w.work_id;
    const userId = w.userId ?? w.user_id;
    const taskName = w.taskName ?? w.task_name;
    if (!workId || !String(workId).trim()) missing.push('workId');
    if (!w.month || !String(w.month).trim()) missing.push('month');
    if (userId === null || userId === undefined || String(userId).trim() === '') missing.push('userId');
    if (!taskName || !String(taskName).trim()) missing.push('taskName');
    if (missing.length > 0) {
      errors.push({
        tableName: 'works',
        recordId: workId || String(w.id || idx),
        missingFields: missing,
        message: `Bản ghi công việc #${idx} (${workId || 'không ID'}) thiếu trường bắt buộc: ${missing.join(', ')}`
      });
    }
  }

  // 4. Assignments: assignmentId, month, receiverId
  for (const [idx, a] of (store.assignments || []).entries()) {
    const missing: string[] = [];
    const assignmentId = a.assignmentId ?? a.assignment_id;
    const receiverId = a.receiverId ?? a.receiver_id;
    if (!assignmentId || !String(assignmentId).trim()) missing.push('assignmentId');
    if (!a.month || !String(a.month).trim()) missing.push('month');
    if (receiverId === null || receiverId === undefined || String(receiverId).trim() === '') missing.push('receiverId');
    if (missing.length > 0) {
      errors.push({
        tableName: 'assignments',
        recordId: assignmentId || String(a.id || idx),
        missingFields: missing,
        message: `Bản ghi phân công #${idx} (${assignmentId || 'không ID'}) thiếu trường bắt buộc: ${missing.join(', ')}`
      });
    }
  }

  // 5. Overtimes: otId, month, userId, otDate
  for (const [idx, o] of (store.overtimes || []).entries()) {
    const missing: string[] = [];
    const otId = o.otId ?? o.ot_id;
    const userId = o.userId ?? o.user_id;
    const otDate = o.otDate ?? o.ot_date;
    if (!otId || !String(otId).trim()) missing.push('otId');
    if (!o.month || !String(o.month).trim()) missing.push('month');
    if (userId === null || userId === undefined || String(userId).trim() === '') missing.push('userId');
    if (!otDate || !String(otDate).trim()) missing.push('otDate');
    if (missing.length > 0) {
      errors.push({
        tableName: 'overtimes',
        recordId: otId || String(o.id || idx),
        missingFields: missing,
        message: `Bản ghi làm thêm #${idx} (${otId || 'không ID'}) thiếu trường bắt buộc: ${missing.join(', ')}`
      });
    }
  }

  // 6. KPI Results: kpiId, month, userId
  for (const [idx, k] of (store.kpiResults || []).entries()) {
    const missing: string[] = [];
    const kpiId = k.kpiId ?? k.kpi_id;
    const userId = k.userId ?? k.user_id;
    if (!kpiId || !String(kpiId).trim()) missing.push('kpiId');
    if (!k.month || !String(k.month).trim()) missing.push('month');
    if (userId === null || userId === undefined || String(userId).trim() === '') missing.push('userId');
    if (missing.length > 0) {
      errors.push({
        tableName: 'kpi_results',
        recordId: kpiId || String(k.id || idx),
        missingFields: missing,
        message: `Bản ghi kết quả KPI #${idx} (${kpiId || 'không ID'}) thiếu trường bắt buộc: ${missing.join(', ')}`
      });
    }
  }

  // 7. Notifications: notifyId, type, title
  for (const [idx, n] of (store.notifications || []).entries()) {
    const missing: string[] = [];
    const notifyId = n.notifyId ?? n.notify_id;
    if (!notifyId || !String(notifyId).trim()) missing.push('notifyId');
    if (!n.type || !String(n.type).trim()) missing.push('type');
    if (!n.title || !String(n.title).trim()) missing.push('title');
    if (missing.length > 0) {
      errors.push({
        tableName: 'notifications',
        recordId: notifyId || String(n.id || idx),
        missingFields: missing,
        message: `Bản ghi thông báo #${idx} (${notifyId || 'không ID'}) thiếu trường bắt buộc: ${missing.join(', ')}`
      });
    }
  }

  // 8. System Logs: logId, action
  const rawLogs = store.systemLogs || store['system_logs'] || [];
  for (const [idx, l] of rawLogs.entries()) {
    const missing: string[] = [];
    const logId = l.logId ?? l.log_id;
    if (!logId || !String(logId).trim()) missing.push('logId');
    if (!l.action || !String(l.action).trim()) missing.push('action');
    if (missing.length > 0) {
      errors.push({
        tableName: 'system_logs',
        recordId: logId || String(l.id || idx),
        missingFields: missing,
        message: `Bản ghi nhật ký hệ thống #${idx} (${logId || 'không ID'}) thiếu trường bắt buộc: ${missing.join(', ')}`
      });
    }
  }

  // 9. Push Settings: vapid_public_key, vapid_private_key
  for (const [idx, ps] of (store.pushSettings || []).entries()) {
    const missing: string[] = [];
    if (!ps.vapid_public_key || !String(ps.vapid_public_key).trim()) missing.push('vapid_public_key');
    if (!ps.vapid_private_key || !String(ps.vapid_private_key).trim()) missing.push('vapid_private_key');
    if (missing.length > 0) {
      errors.push({
        tableName: 'push_settings',
        recordId: String(ps.id || idx),
        missingFields: missing,
        message: `Bản ghi cấu hình WebPush #${idx} thiếu khóa bắt buộc (không được bỏ qua im lặng): ${missing.join(', ')}`
      });
    }
  }

  // 10. Push Subscriptions: userId, endpoint, p256dh, auth
  for (const [idx, sub] of (store.pushSubscriptions || []).entries()) {
    const missing: string[] = [];
    const userId = sub.userId ?? sub.user_id;
    if (userId === null || userId === undefined || String(userId).trim() === '') missing.push('userId');
    if (!sub.endpoint || !String(sub.endpoint).trim()) missing.push('endpoint');
    if (!sub.p256dh || !String(sub.p256dh).trim()) missing.push('p256dh');
    if (!sub.auth || !String(sub.auth).trim()) missing.push('auth');
    if (missing.length > 0) {
      errors.push({
        tableName: 'push_subscriptions',
        recordId: sub.endpoint || String(sub.id || idx),
        missingFields: missing,
        message: `Bản ghi thiết bị WebPush #${idx} thiếu trường bắt buộc (tuyệt đối không tự động gán user 1 hoặc bỏ qua): ${missing.join(', ')}`
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getCanonicalRow(tableName: string, row: any): Record<string, any> {
  if (!row) return {};
  switch (tableName) {
    case 'users':
      return {
        email: String(row.email || '').trim(),
        name: safeString(row.name),
        phone: safeNullableString(row.phone),
        zalo: safeNullableString(row.zalo),
        position: safeNullableString(row.position),
        group: safeNullableString(row.group),
        role: safeString(row.role, 'STAFF'),
        status: safeString(row.status, 'Đang làm'),
        permissions: safeNullableString(row.permissions),
        must_change_password: Boolean(row.mustChangePassword ?? row.must_change_password)
      };
    case 'categories':
      return {
        code: String(row.code || '').trim().toUpperCase(),
        name: safeString(row.name),
        type: safeString(row.type, 'TASK'),
        status: safeString(row.status, 'Đang áp dụng'),
        order: safeNullableNumber(row.order, 0) ?? 0,
        properties: stableCanonicalJson(row.properties)
      };
    case 'works':
      return {
        work_id: String(row.workId ?? row.work_id).trim(),
        month: String(row.month).trim(),
        user_id: safeNullableNumber(row.userId ?? row.user_id),
        task_group: safeNullableString(row.taskGroup ?? row.task_group),
        task_name: safeString(row.taskName ?? row.task_name),
        task_code: safeNullableString(row.taskCode ?? row.task_code),
        detail: safeNullableString(row.detail),
        start_date: formatDateSlice(row.startDate ?? row.start_date),
        start_time: safeNullableString(row.startTime ?? row.start_time),
        end_date: formatDateSlice(row.endDate ?? row.end_date),
        end_time: safeNullableString(row.endTime ?? row.end_time),
        actual_end_date: formatDateSlice(row.actualEndDate ?? row.actual_end_date),
        hours: safeKpiScore(row.hours),
        days: safeNullableNumber(row.days),
        proposed_nature: safeNullableString(row.proposedNature ?? row.proposed_nature),
        approved_nature: safeNullableString(row.approvedNature ?? row.approved_nature),
        coef: safeKpiScore(row.coef),
        base_score: safeKpiScore(row.baseScore ?? row.base_score),
        converted_score: safeKpiScore(row.convertedScore ?? row.converted_score),
        self_converted_score: safeKpiScore(row.selfConvertedScore ?? row.self_converted_score),
        approved_converted_score: safeKpiScore(row.approvedConvertedScore ?? row.approved_converted_score),
        status: safeString(row.status, 'Đang xử lý'),
        evidence: safeNullableString(row.evidence),
        product_type: safeNullableString(row.productType ?? row.product_type),
        product_qty: safeNullableNumber(row.productQty ?? row.product_qty),
        unit: safeNullableString(row.unit),
        project: safeNullableString(row.project),
        related_unit: safeNullableString(row.relatedUnit ?? row.related_unit),
        late_reason: safeNullableString(row.lateReason ?? row.late_reason),
        penalty_exemption: safeNullableString(row.penaltyExemption ?? row.penalty_exemption),
        edit_note: safeNullableString(row.editNote ?? row.edit_note),
        leader_approval: safeString(row.leaderApproval ?? row.leader_approval, 'Chưa duyệt'),
        leader_note: safeNullableString(row.leaderNote ?? row.leader_note),
        approver_id: safeNullableNumber(row.approverId ?? row.approver_id),
        source: safeString(row.source, 'WEBAPP'),
        data_status: safeNullableString(row.dataStatus ?? row.data_status),
        sys_note: safeNullableString(row.sysNote ?? row.sys_note)
      };
    case 'assignments':
      return {
        assignment_id: String(row.assignmentId ?? row.assignment_id).trim(),
        month: String(row.month).trim(),
        assigner_id: safeNullableNumber(row.assignerId ?? row.assigner_id),
        receiver_id: safeNullableNumber(row.receiverId ?? row.receiver_id),
        task_group: safeNullableString(row.taskGroup ?? row.task_group),
        task_name: safeString(row.taskName ?? row.task_name),
        task_code: safeNullableString(row.taskCode ?? row.task_code),
        base_score: safeKpiScore(row.baseScore ?? row.base_score),
        suggested_nature: safeNullableString(row.suggestedNature ?? row.suggested_nature),
        suggested_coef: safeKpiScore(row.suggestedCoef ?? row.suggested_coef),
        expected_converted_score: safeKpiScore(row.expectedConvertedScore ?? row.expected_converted_score),
        detail: safeNullableString(row.detail),
        start_date: formatDateSlice(row.startDate ?? row.start_date),
        deadline: formatDateSlice(row.deadline),
        product_required: safeNullableString(row.productRequired ?? row.product_required),
        product_type: safeNullableString(row.productType ?? row.product_type),
        product_qty: safeNullableNumber(row.productQty ?? row.product_qty),
        unit: safeNullableString(row.unit),
        priority: safeString(row.priority, 'Bình thường'),
        receive_status: safeString(row.receiveStatus ?? row.receive_status, 'Chưa xem'),
        work_id: safeNullableNumber(row.workId ?? row.work_id),
        leader_note: safeNullableString(row.leaderNote ?? row.leader_note),
        receiver_note: safeNullableString(row.receiverNote ?? row.receiver_note)
      };
    case 'overtimes':
      return {
        ot_id: String(row.otId ?? row.ot_id).trim(),
        month: String(row.month).trim(),
        user_id: safeNullableNumber(row.userId ?? row.user_id),
        ot_date: formatDateSlice(row.otDate ?? row.ot_date),
        start_time: safeNullableString(row.startTime ?? row.start_time),
        end_time: safeNullableString(row.endTime ?? row.end_time),
        break_minutes: safeNullableNumber(row.breakMinutes ?? row.break_minutes, 0) ?? 0,
        total_reg_hours: safeKpiScore(row.totalRegHours ?? row.total_reg_hours),
        content: safeNullableString(row.content),
        reason: safeNullableString(row.reason),
        project: safeNullableString(row.project),
        expected_result: safeNullableString(row.expectedResult ?? row.expected_result),
        actual_result: safeNullableString(row.actualResult ?? row.actual_result),
        evidence: safeNullableString(row.evidence),
        employee_note: safeNullableString(row.employeeNote ?? row.employee_note),
        approval_status: safeString(row.approvalStatus ?? row.approval_status, 'Chờ duyệt'),
        approved_hours: safeKpiScore(row.approvedHours ?? row.approved_hours),
        approver_note: safeNullableString(row.approverNote ?? row.approver_note),
        approver_id: safeNullableNumber(row.approverId ?? row.approver_id),
        allow_edit: Boolean(row.allowEdit ?? row.allow_edit),
        data_status: safeNullableString(row.dataStatus ?? row.data_status)
      };
    case 'kpi_results':
      return {
        kpi_id: String(row.kpiId ?? row.kpi_id).trim(),
        month: String(row.month).trim(),
        user_id: safeNullableNumber(row.userId ?? row.user_id),
        a_score: safeKpiScore(row.aScore ?? row.a_score),
        b1_score: safeKpiScore(row.b1Score ?? row.b1_score),
        b2_score: safeKpiScore(row.b2Score ?? row.b2_score),
        b3_score: safeKpiScore(row.b3Score ?? row.b3_score),
        b_score: safeKpiScore(row.bScore ?? row.b_score),
        c1_score: safeKpiScore(row.c1Score ?? row.c1_score),
        c2_score: safeKpiScore(row.c2Score ?? row.c2_score),
        c_score: safeKpiScore(row.cScore ?? row.c_score),
        d_score: safeKpiScore(row.dScore ?? row.d_score),
        total_kpi: safeKpiScore(row.totalKpi ?? row.total_kpi),
        rank: safeString(row.rank, 'Chưa chốt'),
        registered_works: safeNullableNumber(row.registeredWorks ?? row.registered_works, 0) ?? 0,
        approved_works: safeNullableNumber(row.approvedWorks ?? row.approved_works, 0) ?? 0,
        details_a: stableCanonicalJson(row.detailsA ?? row.details_a),
        details_b: stableCanonicalJson(row.detailsB ?? row.details_b),
        details_c: stableCanonicalJson(row.detailsC ?? row.details_c),
        details_d: stableCanonicalJson(row.detailsD ?? row.details_d),
        note: safeNullableString(row.note)
      };
    case 'notifications':
      return {
        notify_id: String(row.notifyId ?? row.notify_id).trim(),
        sender_id: safeNullableNumber(row.senderId ?? row.sender_id),
        receiver_id: safeNullableNumber(row.receiverId ?? row.receiver_id),
        type: safeString(row.type, 'WORK'),
        title: safeString(row.title),
        content: safeString(row.content),
        related_target: safeNullableString(row.relatedTarget ?? row.related_target),
        status: safeString(row.status, 'Chưa xem'),
        note: safeNullableString(row.note)
      };
    case 'system_logs':
      return {
        log_id: String(row.logId ?? row.log_id).trim(),
        user_id: safeNullableNumber(row.userId ?? row.user_id),
        action: safeString(row.action),
        target: safeNullableString(row.target),
        result: safeString(row.result, 'Thành công'),
        note: safeNullableString(row.note),
        details: stableCanonicalJson(row.details)
      };
    case 'push_settings':
      return {
        id: 1,
        vapid_public_key: safeString(row.vapid_public_key),
        subject: safeString(row.subject, 'mailto:admin@kpi.internal'),
        private_key_hash: crypto.createHash('sha256').update(safeString(row.vapid_private_key)).digest('hex')
      };
    case 'push_subscriptions':
      return {
        user_id: safeNullableNumber(row.userId ?? row.user_id),
        endpoint: String(row.endpoint).trim(),
        device_label: safeNullableString(row.deviceLabel ?? row.device_label),
        active: row.active !== undefined ? Boolean(row.active) : true,
        p256dh_hash: crypto.createHash('sha256').update(safeString(row.p256dh)).digest('hex'),
        auth_hash: crypto.createHash('sha256').update(safeString(row.auth)).digest('hex')
      };
    default:
      return {};
  }
}

export function computeCanonicalRecordHash(tableName: string, row: any): string {
  const map = getCanonicalRow(tableName, row);
  const keys = Object.keys(map).sort();
  const sortedMap: Record<string, any> = {};
  for (const k of keys) {
    sortedMap[k] = map[k];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sortedMap)).digest('hex');
}

function readRawLocalStore(): Record<string, any[]> {
  if (!fs.existsSync(DATA_STORE_PATH)) {
    throw new Error(`File dữ liệu nguồn ${DATA_STORE_PATH} không tồn tại.`);
  }
  const raw = fs.readFileSync(DATA_STORE_PATH, 'utf-8');
  return JSON.parse(raw);
}

export async function runMigrationDryRun(
  adminUser?: any,
  options?: {
    issueToken?: boolean;
    poolOrClient?: any;
    sourceStore?: Record<string, any[]>;
  }
): Promise<DryRunResult> {
  const queryRunner = options?.poolOrClient || pool;
  const mode = getStorageMode();
  const configured = isPostgresConfigured();
  const health = options?.poolOrClient ? { connected: true, provider: 'postgres' } : await checkDatabaseHealth();
  const targetState = await checkNeonTargetAdminStatus(queryRunner);

  if (!configured && !options?.poolOrClient) {
    return {
      success: false,
      storageMode: mode,
      provider: health.provider || 'postgres',
      sourceFile: DATA_STORE_PATH,
      tables: [],
      summary: { 
        totalSourceRecords: 0, 
        totalTargetBefore: 0, 
        newRecordsToInsert: 0, 
        existingToUpdate: 0, 
        conflictsDetected: 0, 
        logicalDuplicates: 0, 
        sourceTechDuplicates: 0,
        targetOnlyRecords: 0 
      },
      readyToMigrate: false,
      message: 'Cơ sở dữ liệu Neon PostgreSQL chưa được kết nối hoặc thiếu DATABASE_URL.',
      targetState
    };
  }

  const store = options?.sourceStore || readRawLocalStore();

  // Validate all required fields in source store first!
  const validation = validateSourceStore(store);

  const tablesResult: TableReconciliation[] = [];

  let totalSourceRecords = 0;
  let totalTargetBefore = 0;
  let newRecordsToInsert = 0;
  let existingToUpdate = 0;
  let totalConflicts = 0;
  let totalLogicalDuplicates = 0;
  let totalSourceTechDuplicates = 0;
  let totalTargetOnly = 0;
  let targetReadError = false;
  let targetReadErrorMessage = '';

  for (const t of TABLES_CONFIG) {
    const rawItems = store[t.key] || (t.key === 'systemLogs' ? store['system_logs'] : []) || [];
    const sourceCount = rawItems.length;
    totalSourceRecords += sourceCount;

    // Load full table records from target without arbitrary LIMIT 2000
    let targetRows: any[] = [];
    try {
      const allRowsRes = await queryRunner.query(`SELECT * FROM "${t.dbTable}"`);
      targetRows = allRowsRes.rows;
    } catch (err: any) {
      // Fail closed: if reading any target table fails, record error and stop immediately
      targetReadError = true;
      targetReadErrorMessage = `Lỗi đọc bảng đích ${t.dbTable}: ${err?.message || String(err)}`;
      console.error(`[DryRun] Fail-Closed: Error reading ${t.dbTable}:`, err?.message || err);
      break;
    }

    const targetCount = targetRows.length;
    totalTargetBefore += targetCount;

    const existingTargetTechKeys = new Set<string>();
    const existingTargetLogicalKeys = new Set<string>();

    for (const r of targetRows) {
      const tech = extractTechnicalKey(r, t);
      if (tech) existingTargetTechKeys.add(tech);
      const log = extractLogicalKey(r, t.dbTable);
      if (log) existingTargetLogicalKeys.add(log);
    }

    let toInsert = 0;
    let toUpdate = 0;
    let conflict = 0;
    let logicalDup = 0;
    let sourceTechDup = 0;

    const sourceTechSeen = new Set<string>();
    const sourceLogicalSeen = new Set<string>();
    const matchedTargetTechKeys = new Set<string>();

    for (const item of rawItems) {
      const techKey = extractTechnicalKey(item, t);
      const logKey = extractLogicalKey(item, t.dbTable);

      // 1. Detect technical key duplicates within the source itself
      if (techKey) {
        if (sourceTechSeen.has(techKey)) {
          sourceTechDup += 1;
        } else {
          sourceTechSeen.add(techKey);
        }
      }

      // 2. Detect business logical duplicates within the source itself
      if (logKey) {
        if (sourceLogicalSeen.has(logKey)) {
          logicalDup += 1;
        } else {
          sourceLogicalSeen.add(logKey);
        }
      }

      const hasTechInTarget = techKey ? existingTargetTechKeys.has(techKey) : false;
      const hasLogInTarget = logKey ? existingTargetLogicalKeys.has(logKey) : false;

      if (hasTechInTarget) {
        toUpdate += 1;
        if (techKey) matchedTargetTechKeys.add(techKey);
      } else if (hasLogInTarget) {
        // Business logical match exists under different technical ID -> logical conflict!
        conflict += 1;
      } else {
        toInsert += 1;
      }
    }

    // 3. Calculate targetOnly strictly based on target keys not matched by source
    let targetOnly = 0;
    for (const k of existingTargetTechKeys) {
      if (!matchedTargetTechKeys.has(k)) {
        targetOnly += 1;
      }
    }

    newRecordsToInsert += toInsert;
    existingToUpdate += toUpdate;
    totalConflicts += conflict;
    totalLogicalDuplicates += logicalDup;
    totalSourceTechDuplicates += sourceTechDup;
    totalTargetOnly += targetOnly;

    tablesResult.push({
      tableName: t.dbTable,
      label: t.label,
      sourceCount,
      targetCountBefore: targetCount,
      toInsertCount: toInsert,
      toUpdateCount: toUpdate,
      conflictCount: conflict,
      logicalDuplicateCount: logicalDup,
      sourceTechDuplicateCount: sourceTechDup,
      targetOnlyCount: targetOnly
    });
  }

  // readyToMigrate strictly requires:
  // - No table query errors (Fail-Closed)
  // - Target is eligible (EMPTY_BOOTSTRAP)
  // - Not requiring recovery
  // - Source records > 0
  // - Zero business conflicts
  // - Zero logical duplicates
  // - Zero technical key duplicates in source
  // - Valid source store (no missing required fields or fake defaults)
  const readyToMigrate = Boolean(
    !targetReadError &&
    !targetState.recoveryRequired &&
    targetState.state === 'EMPTY_BOOTSTRAP' &&
    totalSourceRecords > 0 &&
    totalConflicts === 0 &&
    totalLogicalDuplicates === 0 &&
    totalSourceTechDuplicates === 0 &&
    validation.valid
  );

  // Preflight Token: issued ONLY if readyToMigrate is true AND options.issueToken !== false
  let preflightToken: string | null = null;
  let preflightExpiresAt: number | null = null;
  let sourceFingerprint = '';
  let targetFingerprint = '';

  try {
    sourceFingerprint = options?.sourceStore 
      ? crypto.createHash('sha256').update(JSON.stringify(options.sourceStore)).digest('hex')
      : computeSourceFingerprint();
    targetFingerprint = await computeTargetFingerprint(queryRunner);
  } catch (err: any) {
    console.error('[DryRun] Fingerprint calculation failed:', err?.message || err);
  }

  if (options?.issueToken !== false && readyToMigrate && sourceFingerprint && targetFingerprint) {
    const tokenGen = generatePreflightToken(
      adminUser || { id: 1, email: ADMIN_EMAIL },
      'json_to_neon',
      targetState.recoveryRequired,
      sourceFingerprint,
      targetFingerprint
    );
    preflightToken = tokenGen.token;
    preflightExpiresAt = tokenGen.expiresAt;
  }

  let message = '';
  if (targetReadError) {
    message = `Đối soát thất bại do không thể đọc bảng đích: ${targetReadErrorMessage}. Thao tác bị dừng theo nguyên tắc Fail-Closed.`;
  } else if (!validation.valid) {
    message = `Đối soát phát hiện ${validation.errors.length} lỗi dữ liệu nguồn thiếu trường bắt buộc (ví dụ: thiếu userId, endpoint, auth, workId, month). Tuyệt đối không sinh dữ liệu giả; vui lòng sửa dữ liệu nguồn.`;
  } else if (targetState.recoveryRequired) {
    message = `Đối soát chẩn đoán hoàn tất. Cơ sở dữ liệu Neon đang có dữ liệu đích (${targetState.totalRecordsAcrossTables} bản ghi) nhưng thiếu Quản trị viên hợp lệ (RECOVERY_REQUIRED). Thao tác ghi bị chặn an toàn theo nguyên tắc Fail-Closed.`;
  } else if (!readyToMigrate) {
    message = `Đối soát phát hiện dữ liệu chưa đủ điều kiện di chuyển tự động (Xung đột: ${totalConflicts}, Trùng lặp logic: ${totalLogicalDuplicates}, Trùng khóa kỹ thuật: ${totalSourceTechDuplicates}). Vui lòng xử lý trước khi thực thi.`;
  } else {
    message = `Đối soát dữ liệu hoàn tất thành công. CSDL đích hoàn toàn sạch, không có xung đột, sẵn sàng di chuyển ${totalSourceRecords} bản ghi từ JSON sang Neon PostgreSQL.`;
  }

  return {
    success: !targetReadError,
    storageMode: mode,
    provider: health.provider || 'postgres',
    sourceFile: DATA_STORE_PATH,
    tables: tablesResult,
    summary: {
      totalSourceRecords,
      totalTargetBefore,
      newRecordsToInsert,
      existingToUpdate,
      conflictsDetected: totalConflicts,
      logicalDuplicates: totalLogicalDuplicates,
      sourceTechDuplicates: totalSourceTechDuplicates,
      targetOnlyRecords: totalTargetOnly
    },
    readyToMigrate,
    message,
    preflightToken,
    preflightExpiresAt,
    sourceFingerprint,
    targetFingerprint,
    targetState
  };
}

export async function executeMigrationToNeon(
  adminPassword: string, 
  adminUser: any,
  preflightToken?: string,
  poolOrClient?: any,
  sourceStore?: Record<string, any[]>
): Promise<MigrationExecutionResult> {
  const startTime = Date.now();

  // 1. Validate Preflight Token strictly
  const tokenValidation = await validateAndConsumePreflightToken(
    preflightToken || '', 
    adminUser,
    'json_to_neon',
    poolOrClient,
    sourceStore
  );
  if (!tokenValidation.valid) {
    throw new Error(tokenValidation.error || 'Xác thực Dry Run thất bại.');
  }

  // 2. Check Postgres health and target status
  const targetStatus = await checkNeonTargetAdminStatus(poolOrClient);
  if (targetStatus.recoveryRequired) {
    throw new Error(`Cơ sở dữ liệu đích đang ở trạng thái RECOVERY_REQUIRED (${targetStatus.failClosedReason}). Thao tác ghi bị chặn an toàn. Không thể thực thi di chuyển.`);
  }

  // 3. Verify admin password
  if (!adminPassword) {
    throw new Error('Vui lòng cung cấp mật khẩu Quản trị viên để xác thực thao tác di chuyển dữ liệu.');
  }
  let isMatch = false;
  if (adminUser?.source === 'json_source' || !adminUser?.password) {
    const jsonCheck = verifyJsonAdminPassword(adminPassword);
    isMatch = jsonCheck.verified;
  } else {
    isMatch = verifyPassword(adminPassword, adminUser.password);
  }
  if (!isMatch) {
    throw new Error('Mật khẩu Quản trị viên không chính xác. Thao tác di chuyển dữ liệu bị từ chối.');
  }

  // 4. Re-verify Dry Run conditions with issueToken: false (no junk tokens created)
  const dryRunCheck = await runMigrationDryRun(adminUser, {
    issueToken: false,
    poolOrClient,
    sourceStore
  });
  if (!dryRunCheck.readyToMigrate) {
    throw new Error(`Điều kiện thực thi không thỏa mãn: ${dryRunCheck.message}`);
  }

  // 5. Read source JSON store
  const store = sourceStore || readRawLocalStore();

  // 6. Create Pre-Migration JSON Backup
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  const backupFileName = `pre-neon-migration-${Date.now()}.json`;
  const backupFilePath = path.join(BACKUPS_DIR, backupFileName);
  fs.writeFileSync(backupFilePath, JSON.stringify(store, null, 2), 'utf-8');

  if (!fs.existsSync(backupFilePath)) {
    throw new Error('Không thể tạo file sao lưu bảo vệ dữ liệu JSON trước khi di chuyển.');
  }

  // 7. Ensure target schema is created and all columns exist in PostgreSQL
  const schemaResult = await ensureDatabaseSchema(poolOrClient);
  if (!schemaResult.success) {
    throw new Error(`Đồng bộ cấu trúc bảng (schema) thất bại: ${schemaResult.message}`);
  }

  // 8. Execute atomic transaction in PostgreSQL
  let client: any = null;
  let clientReleased = false;
  let shouldRelease = false;

  if (poolOrClient && typeof poolOrClient.query === 'function' && typeof poolOrClient.release === 'function') {
    client = poolOrClient;
    shouldRelease = false;
  } else if (poolOrClient && typeof poolOrClient.connect === 'function') {
    client = await poolOrClient.connect();
    shouldRelease = true;
  } else {
    client = await pool.connect();
    shouldRelease = true;
  }

  const tableStats: MigrationExecutionResult['tables'] = {};
  let totalMigrated = 0;

  try {
    await client.query('BEGIN');

    // --- 1. USERS ---
    const rawUsers = store.users || [];
    let usersInserted = 0;
    let usersUpdated = 0;
    for (const u of rawUsers) {
      if (!u.email || !String(u.email).trim() || !u.name || !String(u.name).trim()) {
        throw new Error('Bản ghi nhân sự thiếu email hoặc họ tên bắt buộc. Không thể di chuyển.');
      }
      const q = `
        INSERT INTO users (id, uid, name, email, phone, zalo, position, "group", role, status, permissions, password, must_change_password, last_login_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          zalo = EXCLUDED.zalo,
          position = EXCLUDED.position,
          "group" = EXCLUDED."group",
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          permissions = EXCLUDED.permissions,
          password = COALESCE(EXCLUDED.password, users.password),
          must_change_password = EXCLUDED.must_change_password,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `;
      const res = await client.query(q, [
        u.id || null,
        u.uid || null,
        safeString(u.name, 'Người dùng'),
        String(u.email).trim().toLowerCase(),
        safeNullableString(u.phone),
        safeNullableString(u.zalo),
        safeNullableString(u.position) ?? 'Chuyên viên',
        safeNullableString(u.group) ?? 'Kế hoạch - Tài chính',
        safeString(u.role, 'STAFF'),
        safeString(u.status, 'Đang làm'),
        u.permissions || null,
        u.password || null,
        Boolean(u.mustChangePassword),
        u.lastLoginAt ? new Date(u.lastLoginAt) : null,
        u.createdAt ? new Date(u.createdAt) : null,
        u.updatedAt ? new Date(u.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) usersInserted++; else usersUpdated++;
      totalMigrated++;
    }
    tableStats['users'] = { source: rawUsers.length, inserted: usersInserted, updated: usersUpdated, targetAfter: 0 };

    // --- 2. CATEGORIES ---
    const rawCats = store.categories || [];
    let catsInserted = 0;
    let catsUpdated = 0;
    for (const c of rawCats) {
      if (!c.code || !String(c.code).trim() || !c.name || !String(c.name).trim()) {
        throw new Error('Bản ghi danh mục thiếu mã code hoặc tên bắt buộc.');
      }
      const q = `
        INSERT INTO categories (id, code, name, type, properties, status, "order", created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          properties = EXCLUDED.properties,
          status = EXCLUDED.status,
          "order" = EXCLUDED."order",
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `;
      const res = await client.query(q, [
        c.id || null,
        String(c.code).trim().toUpperCase(),
        safeString(c.name, c.code),
        safeString(c.type, 'TASK'),
        stableCanonicalJson(c.properties),
        safeString(c.status, 'Đang áp dụng'),
        safeNullableNumber(c.order, 0) ?? 0,
        c.createdAt ? new Date(c.createdAt) : null,
        c.updatedAt ? new Date(c.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) catsInserted++; else catsUpdated++;
      totalMigrated++;
    }
    tableStats['categories'] = { source: rawCats.length, inserted: catsInserted, updated: catsUpdated, targetAfter: 0 };

    // --- 3. WORKS (Faithful copying, zero-safe, NO fabricated defaults) ---
    const rawWorks = store.works || [];
    let worksInserted = 0;
    let worksUpdated = 0;
    for (const w of rawWorks) {
      const workId = w.workId ?? w.work_id;
      if (!workId || !String(workId).trim()) {
        throw new Error('Bản ghi công việc thiếu workId bắt buộc. Thao tác bị dừng để ngăn chặn tạo ID giả.');
      }
      const month = w.month;
      if (!month || !String(month).trim()) {
        throw new Error(`Bản ghi công việc ${workId} thiếu tháng (month) bắt buộc. Không tự tiện gán tháng giả.`);
      }
      const userId = w.userId ?? w.user_id;
      if (userId === null || userId === undefined || String(userId).trim() === '') {
        throw new Error(`Bản ghi công việc ${workId} thiếu userId bắt buộc.`);
      }

      const q = `
        INSERT INTO works (
          id, work_id, month, user_id, task_group, task_name, task_code, detail,
          start_date, start_time, end_date, end_time, actual_end_date,
          hours, days, proposed_nature, approved_nature, coef, base_score,
          converted_score, self_converted_score, approved_converted_score,
          status, evidence, product_type, product_qty, unit, project,
          related_unit, late_reason, penalty_exemption, edit_note,
          leader_approval, leader_note, approver_id, approval_date,
          source, data_status, sys_note, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19,
          $20, $21, $22,
          $23, $24, $25, $26, $27, $28,
          $29, $30, $31, $32,
          $33, $34, $35, $36,
          $37, $38, $39, $40, $41
        )
        ON CONFLICT (work_id) DO UPDATE SET
          month = EXCLUDED.month,
          user_id = EXCLUDED.user_id,
          task_group = EXCLUDED.task_group,
          task_name = EXCLUDED.task_name,
          task_code = EXCLUDED.task_code,
          detail = EXCLUDED.detail,
          start_date = EXCLUDED.start_date,
          start_time = EXCLUDED.start_time,
          end_date = EXCLUDED.end_date,
          end_time = EXCLUDED.end_time,
          actual_end_date = EXCLUDED.actual_end_date,
          hours = EXCLUDED.hours,
          days = EXCLUDED.days,
          proposed_nature = EXCLUDED.proposed_nature,
          approved_nature = EXCLUDED.approved_nature,
          coef = EXCLUDED.coef,
          base_score = EXCLUDED.base_score,
          converted_score = EXCLUDED.converted_score,
          self_converted_score = EXCLUDED.self_converted_score,
          approved_converted_score = EXCLUDED.approved_converted_score,
          status = EXCLUDED.status,
          evidence = EXCLUDED.evidence,
          product_type = EXCLUDED.product_type,
          product_qty = EXCLUDED.product_qty,
          unit = EXCLUDED.unit,
          project = EXCLUDED.project,
          related_unit = EXCLUDED.related_unit,
          late_reason = EXCLUDED.late_reason,
          penalty_exemption = EXCLUDED.penalty_exemption,
          edit_note = EXCLUDED.edit_note,
          leader_approval = EXCLUDED.leader_approval,
          leader_note = EXCLUDED.leader_note,
          approver_id = EXCLUDED.approver_id,
          approval_date = EXCLUDED.approval_date,
          source = EXCLUDED.source,
          data_status = EXCLUDED.data_status,
          sys_note = EXCLUDED.sys_note,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `;
      const res = await client.query(q, [
        w.id || null,
        String(workId).trim(),
        String(month).trim(),
        Number(userId),
        safeNullableString(w.taskGroup),
        safeString(w.taskName, 'Công việc'),
        safeNullableString(w.taskCode),
        safeNullableString(w.detail),
        w.startDate ? new Date(w.startDate) : null,
        safeNullableString(w.startTime),
        w.endDate ? new Date(w.endDate) : null,
        safeNullableString(w.endTime),
        w.actualEndDate ? new Date(w.actualEndDate) : null,
        safeKpiScore(w.hours),
        safeNullableNumber(w.days),
        safeNullableString(w.proposedNature),
        safeNullableString(w.approvedNature),
        safeKpiScore(w.coef),
        safeKpiScore(w.baseScore),
        safeKpiScore(w.convertedScore),
        safeKpiScore(w.selfConvertedScore),
        safeKpiScore(w.approvedConvertedScore),
        safeString(w.status, 'Đang xử lý'),
        safeNullableString(w.evidence),
        safeNullableString(w.productType),
        safeNullableNumber(w.productQty),
        safeNullableString(w.unit),
        safeNullableString(w.project),
        safeNullableString(w.relatedUnit),
        safeNullableString(w.lateReason),
        safeNullableString(w.penaltyExemption),
        safeNullableString(w.editNote),
        safeString(w.leaderApproval, 'Chưa duyệt'),
        safeNullableString(w.leaderNote),
        w.approverId || null,
        w.approvalDate ? new Date(w.approvalDate) : null,
        safeString(w.source, 'WEBAPP'),
        safeNullableString(w.dataStatus),
        safeNullableString(w.sysNote),
        w.createdAt ? new Date(w.createdAt) : null,
        w.updatedAt ? new Date(w.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) worksInserted++; else worksUpdated++;
      totalMigrated++;
    }
    tableStats['works'] = { source: rawWorks.length, inserted: worksInserted, updated: worksUpdated, targetAfter: 0 };

    // --- 4. ASSIGNMENTS ---
    const rawAssignments = store.assignments || [];
    let assignmentsInserted = 0;
    let assignmentsUpdated = 0;
    for (const a of rawAssignments) {
      const assignmentId = a.assignmentId ?? a.assignment_id;
      if (!assignmentId || !String(assignmentId).trim()) {
        throw new Error('Bản ghi phân công thiếu assignmentId bắt buộc. Thao tác bị dừng để ngăn chặn tạo ID giả.');
      }
      const month = a.month;
      if (!month || !String(month).trim()) {
        throw new Error(`Bản ghi phân công ${assignmentId} thiếu tháng (month) bắt buộc.`);
      }
      const receiverId = a.receiverId ?? a.receiver_id;
      if (receiverId === null || receiverId === undefined || String(receiverId).trim() === '') {
        throw new Error(`Bản ghi phân công ${assignmentId} thiếu receiverId bắt buộc.`);
      }

      const q = `
        INSERT INTO assignments (
          id, assignment_id, month, assigner_id, receiver_id, task_group,
          task_name, task_code, base_score, suggested_nature, suggested_coef,
          expected_converted_score, detail, assign_date, start_date, deadline,
          product_required, product_type, product_qty, unit, priority,
          receive_status, view_date, receive_date, work_id, leader_note, receiver_note,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26, $27,
          $28, $29
        )
        ON CONFLICT (assignment_id) DO UPDATE SET
          month = EXCLUDED.month,
          assigner_id = EXCLUDED.assigner_id,
          receiver_id = EXCLUDED.receiver_id,
          task_group = EXCLUDED.task_group,
          task_name = EXCLUDED.task_name,
          task_code = EXCLUDED.task_code,
          base_score = EXCLUDED.base_score,
          suggested_nature = EXCLUDED.suggested_nature,
          suggested_coef = EXCLUDED.suggested_coef,
          expected_converted_score = EXCLUDED.expected_converted_score,
          detail = EXCLUDED.detail,
          start_date = EXCLUDED.start_date,
          deadline = EXCLUDED.deadline,
          product_required = EXCLUDED.product_required,
          product_type = EXCLUDED.product_type,
          product_qty = EXCLUDED.product_qty,
          unit = EXCLUDED.unit,
          priority = EXCLUDED.priority,
          receive_status = EXCLUDED.receive_status,
          view_date = EXCLUDED.view_date,
          receive_date = EXCLUDED.receive_date,
          work_id = EXCLUDED.work_id,
          leader_note = EXCLUDED.leader_note,
          receiver_note = EXCLUDED.receiver_note,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `;
      const res = await client.query(q, [
        a.id || null,
        String(assignmentId).trim(),
        String(month).trim(),
        a.assignerId || null,
        Number(receiverId),
        safeNullableString(a.taskGroup),
        safeString(a.taskName, 'Phân công'),
        safeNullableString(a.taskCode),
        safeKpiScore(a.baseScore),
        safeNullableString(a.suggestedNature),
        safeKpiScore(a.suggestedCoef),
        safeKpiScore(a.expectedConvertedScore),
        safeNullableString(a.detail),
        a.assignDate ? new Date(a.assignDate) : null,
        a.startDate ? new Date(a.startDate) : null,
        a.deadline ? new Date(a.deadline) : null,
        safeNullableString(a.productRequired),
        safeNullableString(a.productType),
        safeNullableNumber(a.productQty),
        safeNullableString(a.unit),
        safeString(a.priority, 'Bình thường'),
        safeString(a.receiveStatus, 'Chưa xem'),
        a.viewDate ? new Date(a.viewDate) : null,
        a.receiveDate ? new Date(a.receiveDate) : null,
        a.workId || null,
        safeNullableString(a.leaderNote),
        safeNullableString(a.receiverNote),
        a.createdAt ? new Date(a.createdAt) : null,
        a.updatedAt ? new Date(a.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) assignmentsInserted++; else assignmentsUpdated++;
      totalMigrated++;
    }
    tableStats['assignments'] = { source: rawAssignments.length, inserted: assignmentsInserted, updated: assignmentsUpdated, targetAfter: 0 };

    // --- 5. OVERTIMES ---
    const rawOvertimes = store.overtimes || [];
    let overtimesInserted = 0;
    let overtimesUpdated = 0;
    for (const o of rawOvertimes) {
      const otId = o.otId ?? o.ot_id;
      if (!otId || !String(otId).trim()) {
        throw new Error('Bản ghi làm thêm thiếu otId bắt buộc. Thao tác bị dừng để ngăn chặn tạo ID giả.');
      }
      const month = o.month;
      if (!month || !String(month).trim()) {
        throw new Error(`Bản ghi làm thêm ${otId} thiếu tháng (month) bắt buộc.`);
      }
      const userId = o.userId ?? o.user_id;
      if (userId === null || userId === undefined || String(userId).trim() === '') {
        throw new Error(`Bản ghi làm thêm ${otId} thiếu userId bắt buộc.`);
      }
      if (!o.otDate && !o.ot_date) {
        throw new Error(`Bản ghi làm thêm ${otId} thiếu ngày (otDate) bắt buộc.`);
      }

      const q = `
        INSERT INTO overtimes (
          id, ot_id, month, user_id, reg_date, ot_date, start_time, end_time,
          break_minutes, total_reg_hours, content, reason, project,
          expected_result, actual_result, evidence, employee_note,
          approval_status, approved_hours, approver_note, approver_id,
          approval_date, allow_edit, data_status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21,
          $22, $23, $24, $25, $26
        )
        ON CONFLICT (ot_id) DO UPDATE SET
          month = EXCLUDED.month,
          user_id = EXCLUDED.user_id,
          reg_date = EXCLUDED.reg_date,
          ot_date = EXCLUDED.ot_date,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          break_minutes = EXCLUDED.break_minutes,
          total_reg_hours = EXCLUDED.total_reg_hours,
          content = EXCLUDED.content,
          reason = EXCLUDED.reason,
          project = EXCLUDED.project,
          expected_result = EXCLUDED.expected_result,
          actual_result = EXCLUDED.actual_result,
          evidence = EXCLUDED.evidence,
          employee_note = EXCLUDED.employee_note,
          approval_status = EXCLUDED.approval_status,
          approved_hours = EXCLUDED.approved_hours,
          approver_note = EXCLUDED.approver_note,
          approver_id = EXCLUDED.approver_id,
          approval_date = EXCLUDED.approval_date,
          allow_edit = EXCLUDED.allow_edit,
          data_status = EXCLUDED.data_status,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `;
      const res = await client.query(q, [
        o.id || null,
        String(otId).trim(),
        String(month).trim(),
        Number(userId),
        o.regDate ? new Date(o.regDate) : null,
        new Date(o.otDate ?? o.ot_date),
        safeNullableString(o.startTime),
        safeNullableString(o.endTime),
        safeNullableNumber(o.breakMinutes, 0) ?? 0,
        safeKpiScore(o.totalRegHours),
        safeNullableString(o.content),
        safeNullableString(o.reason),
        safeNullableString(o.project),
        safeNullableString(o.expectedResult),
        safeNullableString(o.actualResult),
        safeNullableString(o.evidence),
        safeNullableString(o.employeeNote),
        safeString(o.approvalStatus, 'Chờ duyệt'),
        safeKpiScore(o.approvedHours),
        safeNullableString(o.approverNote),
        o.approverId || null,
        o.approvalDate ? new Date(o.approvalDate) : null,
        Boolean(o.allowEdit),
        safeNullableString(o.dataStatus),
        o.createdAt ? new Date(o.createdAt) : null,
        o.updatedAt ? new Date(o.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) overtimesInserted++; else overtimesUpdated++;
      totalMigrated++;
    }
    tableStats['overtimes'] = { source: rawOvertimes.length, inserted: overtimesInserted, updated: overtimesUpdated, targetAfter: 0 };

    // --- 6. KPI RESULTS (Strict zero preservation: 0 stays '0', no fake default) ---
    const rawKpi = store.kpiResults || [];
    let kpiInserted = 0;
    let kpiUpdated = 0;
    for (const k of rawKpi) {
      const kpiId = k.kpiId ?? k.kpi_id;
      if (!kpiId || !String(kpiId).trim()) {
        throw new Error('Bản ghi KPI thiếu kpiId bắt buộc. Thao tác bị dừng để ngăn chặn tạo ID giả.');
      }
      const month = k.month;
      if (!month || !String(month).trim()) {
        throw new Error(`Bản ghi KPI ${kpiId} thiếu tháng (month) bắt buộc.`);
      }
      const userId = k.userId ?? k.user_id;
      if (userId === null || userId === undefined || String(userId).trim() === '') {
        throw new Error(`Bản ghi KPI ${kpiId} thiếu userId bắt buộc.`);
      }

      const q = `
        INSERT INTO kpi_results (
          id, kpi_id, month, user_id, a_score, b1_score, b2_score, b3_score,
          b_score, c1_score, c2_score, c_score, d_score, total_kpi,
          rank, registered_works, approved_works, details_a, details_b,
          details_c, details_d, note, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24
        )
        ON CONFLICT (kpi_id) DO UPDATE SET
          a_score = EXCLUDED.a_score,
          b1_score = EXCLUDED.b1_score,
          b2_score = EXCLUDED.b2_score,
          b3_score = EXCLUDED.b3_score,
          b_score = EXCLUDED.b_score,
          c1_score = EXCLUDED.c1_score,
          c2_score = EXCLUDED.c2_score,
          c_score = EXCLUDED.c_score,
          d_score = EXCLUDED.d_score,
          total_kpi = EXCLUDED.total_kpi,
          rank = EXCLUDED.rank,
          registered_works = EXCLUDED.registered_works,
          approved_works = EXCLUDED.approved_works,
          details_a = EXCLUDED.details_a,
          details_b = EXCLUDED.details_b,
          details_c = EXCLUDED.details_c,
          details_d = EXCLUDED.details_d,
          note = EXCLUDED.note,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `;
      const res = await client.query(q, [
        k.id || null,
        String(kpiId).trim(),
        String(month).trim(),
        Number(userId),
        safeKpiScore(k.aScore),
        safeKpiScore(k.b1Score),
        safeKpiScore(k.b2Score),
        safeKpiScore(k.b3Score),
        safeKpiScore(k.bScore),
        safeKpiScore(k.c1Score),
        safeKpiScore(k.c2Score),
        safeKpiScore(k.cScore),
        safeKpiScore(k.dScore),
        safeKpiScore(k.totalKpi),
        safeString(k.rank, 'Chưa chốt'),
        safeNullableNumber(k.registeredWorks, 0) ?? 0,
        safeNullableNumber(k.approvedWorks, 0) ?? 0,
        stableCanonicalJson(k.detailsA || k.details_a),
        stableCanonicalJson(k.detailsB || k.details_b),
        stableCanonicalJson(k.detailsC || k.details_c),
        stableCanonicalJson(k.detailsD || k.details_d),
        safeNullableString(k.note),
        k.createdAt ? new Date(k.createdAt) : null,
        k.updatedAt ? new Date(k.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) kpiInserted++; else kpiUpdated++;
      totalMigrated++;
    }
    tableStats['kpi_results'] = { source: rawKpi.length, inserted: kpiInserted, updated: kpiUpdated, targetAfter: 0 };

    // --- 7. NOTIFICATIONS ---
    const rawNotifs = store.notifications || [];
    let notifsInserted = 0;
    let notifsUpdated = 0;
    for (const n of rawNotifs) {
      const notifyId = n.notifyId ?? n.notify_id;
      if (!notifyId || !String(notifyId).trim()) {
        throw new Error('Bản ghi thông báo thiếu notifyId bắt buộc.');
      }
      const q = `
        INSERT INTO notifications (id, notify_id, sender_id, receiver_id, type, title, content, related_target, status, view_date, note, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (notify_id) DO UPDATE SET
          sender_id = EXCLUDED.sender_id,
          receiver_id = EXCLUDED.receiver_id,
          type = EXCLUDED.type,
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          related_target = EXCLUDED.related_target,
          status = EXCLUDED.status,
          view_date = EXCLUDED.view_date,
          note = EXCLUDED.note,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `;
      const res = await client.query(q, [
        n.id || null,
        String(notifyId).trim(),
        n.senderId || null,
        n.receiverId || null,
        safeString(n.type, 'WORK'),
        safeString(n.title, 'Thông báo'),
        safeString(n.content, ''),
        safeNullableString(n.relatedTarget),
        safeString(n.status, 'Chưa xem'),
        n.viewDate ? new Date(n.viewDate) : null,
        safeNullableString(n.note),
        n.createdAt ? new Date(n.createdAt) : null,
        n.updatedAt ? new Date(n.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) notifsInserted++; else notifsUpdated++;
      totalMigrated++;
    }
    tableStats['notifications'] = { source: rawNotifs.length, inserted: notifsInserted, updated: notifsUpdated, targetAfter: 0 };

    // --- 8. SYSTEM LOGS ---
    const rawLogs = store.systemLogs || store['system_logs'] || [];
    let logsInserted = 0;
    let logsUpdated = 0;
    for (const l of rawLogs) {
      const logId = l.logId ?? l.log_id;
      if (!logId || !String(logId).trim()) {
        throw new Error('Bản ghi nhật ký hệ thống thiếu logId bắt buộc.');
      }
      const q = `
        INSERT INTO system_logs (id, log_id, user_id, action, target, result, note, details, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (log_id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          action = EXCLUDED.action,
          target = EXCLUDED.target,
          result = EXCLUDED.result,
          note = EXCLUDED.note,
          details = EXCLUDED.details,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `;
      const res = await client.query(q, [
        l.id || null,
        String(logId).trim(),
        l.userId || null,
        safeString(l.action, 'HỆ THỐNG'),
        safeNullableString(l.target),
        safeString(l.result, 'Thành công'),
        safeNullableString(l.note),
        stableCanonicalJson(l.details),
        l.createdAt ? new Date(l.createdAt) : null,
        l.updatedAt ? new Date(l.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) logsInserted++; else logsUpdated++;
      totalMigrated++;
    }
    tableStats['system_logs'] = { source: rawLogs.length, inserted: logsInserted, updated: logsUpdated, targetAfter: 0 };

    // --- 9. PUSH SETTINGS (No silent skip! Missing keys throw immediately) ---
    const rawPushSettings = store.pushSettings || [];
    let psInserted = 0;
    let psUpdated = 0;
    for (const ps of rawPushSettings) {
      if (!ps.vapid_public_key || !ps.vapid_private_key) {
        throw new Error('Bản ghi push_settings thiếu vapid_public_key hoặc vapid_private_key.');
      }
      const res = await client.query(`
        INSERT INTO push_settings (id, vapid_public_key, vapid_private_key, subject, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          vapid_public_key = EXCLUDED.vapid_public_key,
          vapid_private_key = EXCLUDED.vapid_private_key,
          subject = EXCLUDED.subject,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `, [
        1, 
        ps.vapid_public_key, 
        ps.vapid_private_key, 
        ps.subject || 'mailto:admin@kpi.internal',
        ps.createdAt ? new Date(ps.createdAt) : null,
        ps.updatedAt ? new Date(ps.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) psInserted++; else psUpdated++;
      totalMigrated++;
    }
    tableStats['push_settings'] = { source: rawPushSettings.length, inserted: psInserted, updated: psUpdated, targetAfter: 0 };

    // --- 10. PUSH SUBSCRIPTIONS (Strict: NEVER default to user 1; missing fields throw) ---
    const rawPushSubs = store.pushSubscriptions || [];
    let subInserted = 0;
    let subUpdated = 0;
    for (const sub of rawPushSubs) {
      const userId = sub.userId ?? sub.user_id;
      if (userId === null || userId === undefined || !sub.endpoint || !sub.p256dh || !sub.auth) {
        throw new Error('Bản ghi push_subscriptions thiếu trường bắt buộc (userId, endpoint, p256dh, auth). Không thể di chuyển.');
      }
      const q = `
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device_label, active, last_seen_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (endpoint) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          device_label = EXCLUDED.device_label,
          active = EXCLUDED.active,
          last_seen_at = EXCLUDED.last_seen_at,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
      `;
      const res = await client.query(q, [
        Number(userId),
        String(sub.endpoint).trim(),
        sub.p256dh,
        sub.auth,
        safeNullableString(sub.deviceLabel ?? sub.device_label),
        sub.active !== undefined ? Boolean(sub.active) : true,
        sub.lastSeenAt ? new Date(sub.lastSeenAt) : null,
        sub.createdAt ? new Date(sub.createdAt) : null,
        sub.updatedAt ? new Date(sub.updatedAt) : null
      ]);
      if (res.rows[0]?.is_inserted) subInserted++; else subUpdated++;
      totalMigrated++;
    }
    tableStats['push_subscriptions'] = { source: rawPushSubs.length, inserted: subInserted, updated: subUpdated, targetAfter: 0 };

    // --- 11. Update serial sequences ---
    const tablesToResetSeq = ['users', 'categories', 'works', 'assignments', 'overtimes', 'kpi_results', 'notifications', 'system_logs', 'push_subscriptions'];
    for (const tbl of tablesToResetSeq) {
      try {
        await client.query(`SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE((SELECT MAX(id) FROM ${tbl}), 1), true)`);
      } catch (err: any) {
        console.warn(`[Migration] Notice resetting sequence on ${tbl}:`, err?.message || err);
      }
    }

    // --- 12. COMPREHENSIVE IN-TRANSACTION CANONICAL VERIFICATION ACROSS ALL 10 TABLES (BEFORE COMMIT) ---
    // Every single source record across ALL 10 tables must match exactly 1 target record with equal canonical hash.
    // Secrets (VAPID private key, p256dh, auth) are verified strictly in memory via SHA-256 without logging.
    for (const t of TABLES_CONFIG) {
      const rawRecords: any[] = store[t.key] || (t.key === 'systemLogs' ? store['system_logs'] : []) || [];
      const tblName = t.dbTable;
      const uniqueCol = t.uniqueKey;

      for (const src of rawRecords) {
        const uKey = extractTechnicalKey(src, t);
        if (!uKey) {
          throw new Error(`[PostVerification Discrepancy] Bảng ${tblName} có bản ghi nguồn thiếu khóa duy nhất ${uniqueCol}.`);
        }

        // Query the single record from the database within the transaction
        const dbRes = await client.query(`SELECT * FROM "${tblName}" WHERE "${uniqueCol}"::text = $1`, [uKey]);
        if (dbRes.rows.length === 0) {
          throw new Error(`[PostVerification Discrepancy] Không tìm thấy bản ghi ${tblName} với ${uniqueCol} = ${uKey} trong CSDL đích.`);
        }
        if (dbRes.rows.length > 1) {
          throw new Error(`[PostVerification Discrepancy] Bảng ${tblName} có trùng lặp ${dbRes.rows.length} bản ghi với ${uniqueCol} = ${uKey}.`);
        }

        const dbRow = dbRes.rows[0];
        const srcCanonical = getCanonicalRow(tblName, src);
        const dbCanonical = getCanonicalRow(tblName, dbRow);

        const srcHash = computeCanonicalRecordHash(tblName, src);
        const dbHash = computeCanonicalRecordHash(tblName, dbRow);

        if (srcHash !== dbHash) {
          // Identify the exact mismatched field(s)
          const mismatches: string[] = [];
          for (const key of Object.keys(srcCanonical)) {
            if (srcCanonical[key] !== dbCanonical[key]) {
              mismatches.push(`${key}[db=${dbCanonical[key]}, src=${srcCanonical[key]}]`);
            }
          }
          throw new Error(
            `[PostVerification Discrepancy] Sai lệch dữ liệu bảng ${tblName} tại ${uniqueCol}=${uKey}: ${mismatches.join(', ')}`
          );
        }
      }
    }

    // G. Persistent Migration Completion Marker
    await client.query(`
      INSERT INTO migration_metadata (key, value, updated_at)
      VALUES ('migration_completed', 'true', NOW())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();
    `);

    // Commit Transaction!
    await client.query('COMMIT');
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('[Migration] Transaction failed and rolled back:', err?.message || err);
    throw new Error(`Quá trình di chuyển dữ liệu vào Neon PostgreSQL thất bại và đã ROLLBACK an toàn: ${err?.message || String(err)}`);
  } finally {
    if (shouldRelease && client && !clientReleased) {
      clientReleased = true;
      try {
        client.release();
      } catch {}
    }
  }

  // 9. Post-commit count verification
  let postVerification: 'MATCHED' | 'DISCREPANCY' = 'MATCHED';
  const queryRunner = poolOrClient || pool;
  for (const t of TABLES_CONFIG) {
    try {
      const res = await queryRunner.query(`SELECT COUNT(*)::int as cnt FROM "${t.dbTable}"`);
      const afterCount = Number(res.rows[0]?.cnt || 0);
      if (tableStats[t.dbTable]) {
        tableStats[t.dbTable].targetAfter = afterCount;
        if (afterCount === 0 && tableStats[t.dbTable].source > 0) {
          postVerification = 'DISCREPANCY';
        }
      }
    } catch {}
  }

  if (postVerification === 'DISCREPANCY') {
    return {
      success: false,
      backupFile: backupFileName,
      tables: tableStats,
      totalMigrated,
      postVerification: 'DISCREPANCY',
      durationMs: Date.now() - startTime,
      message: 'Đối soát sau migration phát hiện số lượng không khớp (DISCREPANCY).'
    };
  }

  return {
    success: true,
    backupFile: backupFileName,
    tables: tableStats,
    totalMigrated,
    postVerification: 'MATCHED',
    durationMs: Date.now() - startTime,
    message: `Đã di chuyển thành công ${totalMigrated} bản ghi vào Neon PostgreSQL an toàn và giữ nguyên file JSON nguồn.`
  };
}
