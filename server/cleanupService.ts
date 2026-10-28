import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, loadStore, createStoreProxy, pool, getStorageMode } from '../src/db/index.ts';
import { verifyPassword } from './auth.ts';
import { performBackup, BackupMetadata } from './backupService.ts';

const DATA_STORE_PATH = path.join(process.cwd(), 'data', 'db-local-store.json');
const DATA_DIR = path.dirname(DATA_STORE_PATH);
const LOCK_FILE_PATH = path.join(DATA_DIR, '.cleanup.lock');
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

export interface CleanupFilterCounts {
  works: number;
  assignments: number;
  overtimes: number;
  kpiResults: number;
  notifications: number;
  logs: number;
}

export interface CleanupTargetResult {
  scope: 'period' | 'factory_reset';
  targetMonth?: string;
  counts: CleanupFilterCounts;
  targetWorkIds: number[];
  targetAssignmentIds: number[];
  targetOtIds: number[];
  targetKpiIds: number[];
  targetNotificationIds: number[];
  targetLogIds: number[];
}

export interface CleanupAuditReport {
  auditId: string;
  scope: 'period' | 'factory_reset';
  targetMonth?: string;
  executedAt: string;
  operator: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  clientIp?: string;
  backup: {
    filename: string;
    sizeBytes: number;
    sha256: string;
    recordCounts: Record<string, number>;
  };
  beforeCounts: CleanupFilterCounts & { users: number; categories: number };
  deletedCounts: CleanupFilterCounts;
  afterCounts: CleanupFilterCounts & { users: number; categories: number };
  validationStatus: 'SUCCESS_VERIFIED';
}

/**
 * Pure month normalization function.
 * Accepts either 'YYYY-MM' (e.g. '2026-10') or 'MM-YYYY' (e.g. '10-2026').
 * Normalizes both to canonical internal standard 'MM-YYYY' (2-digit month, 4-digit year).
 * Strictly validates months 01-12 and 4-digit year (1000-9999).
 * Returns null for invalid or ambiguous inputs (e.g. '2026-13', '13-2026', empty string).
 */
export function normalizeKpiMonth(monthStr?: string | null): string | null {
  if (!monthStr || typeof monthStr !== 'string') return null;
  const trimmed = monthStr.trim();
  if (!trimmed) return null;

  // Case 1: YYYY-MM (e.g. 2026-10, 2026-07)
  const yyyyMm = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
  if (yyyyMm) {
    const y = parseInt(yyyyMm[1], 10);
    const m = parseInt(yyyyMm[2], 10);
    if (y >= 1000 && y <= 9999 && m >= 1 && m <= 12) {
      return `${String(m).padStart(2, '0')}-${String(y).padStart(4, '0')}`;
    }
    return null;
  }

  // Case 2: MM-YYYY (e.g. 10-2026, 07-2026)
  const mmYyyy = /^(\d{1,2})-(\d{4})$/.exec(trimmed);
  if (mmYyyy) {
    const m = parseInt(mmYyyy[1], 10);
    const y = parseInt(mmYyyy[2], 10);
    if (y >= 1000 && y <= 9999 && m >= 1 && m <= 12) {
      return `${String(m).padStart(2, '0')}-${String(y).padStart(4, '0')}`;
    }
    return null;
  }

  return null;
}

/**
 * Converts canonical 'MM-YYYY' or 'YYYY-MM' to 'YYYY-MM' format for UI inputs.
 */
export function formatMonthToYyyyMm(monthStr?: string | null): string | null {
  const canonical = normalizeKpiMonth(monthStr);
  if (!canonical) return null;
  const [mm, yyyy] = canonical.split('-');
  return `${yyyy}-${mm}`;
}

/**
 * 1. Unified Filter Logic for both Preview and Execution
 * Strictly enforces valid scope ('period' | 'factory_reset').
 * Any other scope throws an error immediately to prevent accidental data deletion.
 */
export function computeCleanupTargetRecords(
  store: Record<string, any[]>,
  scope: 'period' | 'factory_reset',
  targetMonth?: string
): CleanupTargetResult {
  if (scope !== 'period' && scope !== 'factory_reset') {
    throw new Error(`Phạm vi dọn dẹp "${scope}" không hợp lệ. Chỉ chấp nhận giá trị "period" hoặc "factory_reset".`);
  }

  const allWorks = store.works || [];
  const allAssignments = store.assignments || [];
  const allOvertimes = store.overtimes || [];
  const allKpiResults = store.kpiResults || [];
  const allNotifications = store.notifications || [];
  const allLogs = store.systemLogs || [];

  if (scope === 'period') {
    const canonicalTargetMonth = normalizeKpiMonth(targetMonth);
    if (!canonicalTargetMonth) {
      throw new Error('Kỳ KPI không hợp lệ. Vui lòng nhập định dạng YYYY-MM hoặc MM-YYYY hợp lệ (Ví dụ: 2026-10 hoặc 10-2026).');
    }

    // 1. Identify all works belonging to the target month using canonical normalization
    const targetWorks = allWorks.filter((w: any) => normalizeKpiMonth(w.month) === canonicalTargetMonth);
    const targetWorkIds = targetWorks.map((w: any) => Number(w.id)).filter(Boolean);
    const targetWorkIdSet = new Set(targetWorkIds);

    // 2. Identify all assignments in the month OR pointing to any work belonging to the month
    const targetAssignments = allAssignments.filter((a: any) => {
      const matchMonth = normalizeKpiMonth(a.month) === canonicalTargetMonth;
      const matchWork = a.workId ? targetWorkIdSet.has(Number(a.workId)) : false;
      return matchMonth || matchWork;
    });
    const targetAssignmentIds = targetAssignments.map((a: any) => Number(a.id)).filter(Boolean);

    // 3. Identify all overtimes for this month
    const targetOvertimes = allOvertimes.filter((o: any) => normalizeKpiMonth(o.month) === canonicalTargetMonth);
    const targetOtIds = targetOvertimes.map((o: any) => Number(o.id)).filter(Boolean);

    // 4. Identify all KPI results for this month
    const targetKpiResults = allKpiResults.filter((k: any) => normalizeKpiMonth(k.month) === canonicalTargetMonth);
    const targetKpiIds = targetKpiResults.map((k: any) => Number(k.id)).filter(Boolean);

    // In period cleanup, notifications and system logs are preserved 100%
    return {
      scope: 'period',
      targetMonth,
      counts: {
        works: targetWorks.length,
        assignments: targetAssignments.length,
        overtimes: targetOvertimes.length,
        kpiResults: targetKpiResults.length,
        notifications: 0,
        logs: 0
      },
      targetWorkIds,
      targetAssignmentIds,
      targetOtIds,
      targetKpiIds,
      targetNotificationIds: [],
      targetLogIds: []
    };
  } else if (scope === 'factory_reset') {
    // Factory Reset (Safe Mode): Delete all operational data, preserve users & categories 100%
    return {
      scope: 'factory_reset',
      counts: {
        works: allWorks.length,
        assignments: allAssignments.length,
        overtimes: allOvertimes.length,
        kpiResults: allKpiResults.length,
        notifications: allNotifications.length,
        logs: allLogs.length
      },
      targetWorkIds: allWorks.map((w: any) => Number(w.id)).filter(Boolean),
      targetAssignmentIds: allAssignments.map((a: any) => Number(a.id)).filter(Boolean),
      targetOtIds: allOvertimes.map((o: any) => Number(o.id)).filter(Boolean),
      targetKpiIds: allKpiResults.map((k: any) => Number(k.id)).filter(Boolean),
      targetNotificationIds: allNotifications.map((n: any) => Number(n.id)).filter(Boolean),
      targetLogIds: allLogs.map((l: any) => Number(l.id)).filter(Boolean)
    };
  }

  throw new Error(`Phạm vi dọn dẹp "${scope}" không hợp lệ.`);
}

/**
 * 2. Persistent Lock Engine with Fail-Closed Safety & Heartbeat Renewal
 */
export function isCleanupLocked(): { locked: boolean; details?: any } {
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) {
      try {
        const content = fs.readFileSync(LOCK_FILE_PATH, 'utf-8');
        const lockData = JSON.parse(content);
        const now = Date.now();
        if (lockData.expiresAt && lockData.expiresAt > now) {
          return { locked: true, details: lockData };
        }
        // If expired, attempt safe removal
        if (lockData.expiresAt && lockData.expiresAt <= now) {
          try { fs.unlinkSync(LOCK_FILE_PATH); } catch {}
          return { locked: false };
        }
      } catch {
        // Fail-closed: If file exists but is busy or reading/parsing fails, treat as LOCKED!
        return { locked: true, details: { reason: 'LOCK_FILE_PRESENT_BUSY' } };
      }
    }
  } catch {
    // Fail-closed safety
    return { locked: true, details: { reason: 'LOCK_CHECK_ERROR' } };
  }
  return { locked: false };
}

export function acquireCleanupLock(adminId: number, adminEmail: string, scope: string): {
  lockId: string;
  heartbeatTimer: NodeJS.Timeout;
} {
  const currentStatus = isCleanupLocked();
  if (currentStatus.locked) {
    throw new Error(`Hệ thống đang có một tiến trình dọn dẹp dữ liệu đang chạy (bắt đầu bởi ${currentStatus.details?.adminEmail || 'Quản trị viên'}). Vui lòng chờ tiến trình hoàn tất.`);
  }

  const lockId = crypto.randomUUID();
  const lockData = {
    lockId,
    adminId,
    adminEmail,
    scope,
    lockedAt: Date.now(),
    expiresAt: Date.now() + LOCK_TTL_MS
  };

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Atomic creation via 'wx' flag
  fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(lockData, null, 2), { flag: 'wx' });

  // Heartbeat every 30 seconds to renew TTL while active
  const heartbeatTimer = setInterval(() => {
    try {
      if (fs.existsSync(LOCK_FILE_PATH)) {
        const raw = fs.readFileSync(LOCK_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.lockId === lockId) {
          parsed.expiresAt = Date.now() + LOCK_TTL_MS;
          fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(parsed, null, 2));
        }
      }
    } catch (e) {
      console.warn('[CleanupService] Failed to renew heartbeat:', e);
    }
  }, 30000);

  return { lockId, heartbeatTimer };
}

export function releaseCleanupLock(lockId?: string, heartbeatTimer?: NodeJS.Timeout) {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) {
      if (lockId) {
        try {
          const raw = fs.readFileSync(LOCK_FILE_PATH, 'utf-8');
          const parsed = JSON.parse(raw);
          // Only delete if lockId matches our process
          if (parsed.lockId === lockId) {
            fs.unlinkSync(LOCK_FILE_PATH);
          }
        } catch {
          // If unparseable, clean it up safely
          fs.unlinkSync(LOCK_FILE_PATH);
        }
      } else {
        fs.unlinkSync(LOCK_FILE_PATH);
      }
    }
  } catch (e) {
    console.warn('[CleanupService] Error releasing lock:', e);
  }
}

/**
 * In-Flight Write Request Tracker & Deterministic Draining Engine
 */
let activeInFlightWrites = 0;

export function incrementInFlightWrites(): void {
  activeInFlightWrites++;
}

export function decrementInFlightWrites(): void {
  activeInFlightWrites = Math.max(0, activeInFlightWrites - 1);
}

export function getActiveInFlightWritesCount(): number {
  return activeInFlightWrites;
}

/**
 * Deterministically waits until all active in-flight write requests reach zero.
 * If requests fail to finish within maxWaitMs (25 seconds), aborts with an error
 * to completely eliminate the risk of mid-cleanup concurrent writes.
 */
export async function drainInFlightWrites(maxWaitMs: number = 25000, checkIntervalMs: number = 50): Promise<void> {
  const startTime = Date.now();
  while (activeInFlightWrites > 0) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error(`Không thể bắt đầu dọn dẹp: Vẫn còn ${activeInFlightWrites} tác vụ ghi dữ liệu chưa hoàn thành sau ${Math.round(maxWaitMs / 1000)} giây. Thao tác dọn dẹp đã bị hủy bỏ an toàn để chống xung đột dữ liệu.`);
    }
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }
}

/**
 * Calculate SHA-256 Checksum of a file
 */
function getFileSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}


/** Load the authoritative cleanup view from the active storage backend. */
export async function loadCleanupStoreFromActiveDatabase(clientOverride?: any): Promise<Record<string, any[]>> {
  if (getStorageMode() !== 'postgres') return loadStore();
  const ownsClient = !clientOverride;
  const client = clientOverride || await pool.connect();
  try {
    const [usersRes, categoriesRes, worksRes, assignmentsRes, overtimesRes, kpiRes, notificationsRes, logsRes] = await Promise.all([
      client.query('SELECT id FROM users ORDER BY id'),
      client.query('SELECT id FROM categories ORDER BY id'),
      client.query('SELECT id, month FROM works ORDER BY id'),
      client.query('SELECT id, month, work_id AS "workId" FROM assignments ORDER BY id'),
      client.query('SELECT id, month FROM overtimes ORDER BY id'),
      client.query('SELECT id, month FROM kpi_results ORDER BY id'),
      client.query('SELECT id FROM notifications ORDER BY id'),
      client.query('SELECT id FROM system_logs ORDER BY id')
    ]);
    return {
      users: usersRes.rows,
      categories: categoriesRes.rows,
      works: worksRes.rows,
      assignments: assignmentsRes.rows,
      overtimes: overtimesRes.rows,
      kpiResults: kpiRes.rows,
      notifications: notificationsRes.rows,
      systemLogs: logsRes.rows
    };
  } finally {
    if (ownsClient) client.release();
  }
}

function cleanupCountSnapshot(store: Record<string, any[]>) {
  return {
    works: (store.works || []).length,
    assignments: (store.assignments || []).length,
    overtimes: (store.overtimes || []).length,
    kpiResults: (store.kpiResults || []).length,
    notifications: (store.notifications || []).length,
    logs: (store.systemLogs || []).length,
    users: (store.users || []).length,
    categories: (store.categories || []).length
  };
}

function assertExpectedPeriodCounts(actual: CleanupFilterCounts, expected?: CleanupFilterCounts) {
  if (!expected) throw new Error('Thiếu số lượng bản ghi đối soát (expectedCounts). Vui lòng xem trước lại trước khi thực thi.');
  const keys: (keyof CleanupFilterCounts)[] = ['works', 'assignments', 'overtimes', 'kpiResults', 'notifications', 'logs'];
  if (keys.some(k => actual[k] !== expected[k])) {
    throw new Error('Dữ liệu Neon đã thay đổi trong khi chờ xác nhận. Thao tác bị hủy; vui lòng xem trước lại.');
  }
}

function verifyEmergencyBackupAgainstStore(parsed: any, store: Record<string, any[]>) {
  const required = [
    ['users', 'Nhân sự'], ['categories', 'Danh mục'], ['works', 'Công việc'],
    ['assignments', 'Phân công'], ['overtimes', 'Làm thêm'], ['kpiResults', 'Kết quả KPI'],
    ['notifications', 'Thông báo'], ['systemLogs', 'Nhật ký']
  ];
  if (!parsed?.data || typeof parsed.data !== 'object') throw new Error('Nội dung file sao lưu khẩn cấp không hợp lệ.');
  for (const [key, label] of required) {
    const backupRows = parsed.data[key] || (key === 'systemLogs' ? parsed.data.logs : undefined);
    const sourceRows = store[key] || [];
    if (!Array.isArray(backupRows)) throw new Error(`File sao lưu thiếu bảng "${label}" (${key}). Hủy dọn dẹp.`);
    if (backupRows.length !== sourceRows.length) {
      throw new Error(`Kiểm tra sao lưu thất bại: bảng "${label}" trong backup có ${backupRows.length}, Neon có ${sourceRows.length}. Hủy dọn dẹp.`);
    }
  }
}

async function executePostgresCleanup(params: {
  adminUser: { id: number; name: string; email: string; role: string; password?: string };
  scope: 'period' | 'factory_reset'; targetMonth?: string; expectedCounts?: CleanupFilterCounts;
  clientIp?: string;
}): Promise<CleanupAuditReport> {
  const { adminUser, scope, targetMonth, expectedCounts, clientIp } = params;
  await drainInFlightWrites(25000);

  const sourceStore = await loadCleanupStoreFromActiveDatabase();
  const sourcePlan = computeCleanupTargetRecords(sourceStore, scope, targetMonth);
  if (scope === 'period') assertExpectedPeriodCounts(sourcePlan.counts, expectedCounts);

  const backupRes = await performBackup('manual');
  if (!backupRes.success || !backupRes.metadata) {
    throw new Error(`Không thể tạo điểm sao lưu bảo vệ: ${backupRes.error || 'Lỗi không xác định'}. Hủy dọn dẹp.`);
  }
  const backupMeta = backupRes.metadata;
  const backupFilePath = path.join(process.cwd(), 'data', 'backups', backupMeta.filename);
  if (!fs.existsSync(backupFilePath)) throw new Error('File sao lưu vừa tạo không tồn tại. Hủy dọn dẹp.');
  const backupParsed = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'));
  verifyEmergencyBackupAgainstStore(backupParsed, sourceStore);
  const backupSha256 = getFileSha256(backupFilePath);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await client.query('SELECT pg_advisory_xact_lock($1)', [261027]);

    const txStore = await loadCleanupStoreFromActiveDatabase(client);
    const txPlan = computeCleanupTargetRecords(txStore, scope, targetMonth);
    if (scope === 'period') assertExpectedPeriodCounts(txPlan.counts, expectedCounts);
    const beforeCounts = cleanupCountSnapshot(txStore);
    const sourceCounts = cleanupCountSnapshot(sourceStore);
    for (const key of Object.keys(beforeCounts) as (keyof typeof beforeCounts)[]) {
      if (beforeCounts[key] !== sourceCounts[key]) throw new Error('Dữ liệu Neon thay đổi sau khi tạo backup. Giao dịch đã rollback; vui lòng thử lại.');
    }

    const deleteIds = async (table: string, ids: number[]) => {
      if (ids.length) await client.query(`DELETE FROM ${table} WHERE id = ANY($1::int[])`, [ids]);
    };
    await deleteIds('assignments', txPlan.targetAssignmentIds);
    await deleteIds('works', txPlan.targetWorkIds);
    await deleteIds('overtimes', txPlan.targetOtIds);
    await deleteIds('kpi_results', txPlan.targetKpiIds);
    if (scope === 'factory_reset') {
      await client.query('DELETE FROM notifications');
      await client.query('DELETE FROM system_logs');
    }

    const auditId = `AUDIT_CLEANUP_${Date.now()}`;
    await client.query(
      'INSERT INTO system_logs (log_id, user_id, action, target, result, note, details) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [auditId, adminUser.id, scope === 'period' ? 'CLEANUP_PERIOD' : 'FACTORY_CLEAN', targetMonth || 'ALL', 'Thành công', 'Dọn dẹp dữ liệu Neon bằng giao dịch nguyên tử', JSON.stringify({ scope, targetMonth, clientIp, backup: backupMeta.filename })]
    );

    const afterStore = await loadCleanupStoreFromActiveDatabase(client);
    const afterCounts = cleanupCountSnapshot(afterStore);
    if (afterCounts.users !== beforeCounts.users || afterCounts.categories !== beforeCounts.categories) {
      throw new Error('Vi phạm bảo toàn Nhân sự/Danh mục. Giao dịch đã rollback.');
    }
    const expectedAfter = {
      works: beforeCounts.works - txPlan.counts.works,
      assignments: beforeCounts.assignments - txPlan.counts.assignments,
      overtimes: beforeCounts.overtimes - txPlan.counts.overtimes,
      kpiResults: beforeCounts.kpiResults - txPlan.counts.kpiResults,
      notifications: scope === 'factory_reset' ? 0 : beforeCounts.notifications,
      logs: scope === 'factory_reset' ? 1 : beforeCounts.logs + 1
    };
    for (const key of Object.keys(expectedAfter) as (keyof typeof expectedAfter)[]) {
      if (afterCounts[key] !== expectedAfter[key]) throw new Error(`Hậu kiểm Neon thất bại tại ${key}: dự kiến ${expectedAfter[key]}, thực tế ${afterCounts[key]}. Giao dịch đã rollback.`);
    }

    const auditReport: CleanupAuditReport = {
      auditId, scope, targetMonth, executedAt: new Date().toISOString(),
      operator: { id: adminUser.id, name: adminUser.name, email: adminUser.email, role: adminUser.role },
      clientIp,
      backup: { filename: backupMeta.filename, sizeBytes: backupMeta.sizeBytes, sha256: backupSha256, recordCounts: backupMeta.recordCounts },
      beforeCounts,
      deletedCounts: txPlan.counts,
      afterCounts,
      validationStatus: 'SUCCESS_VERIFIED'
    };
    await client.query('UPDATE system_logs SET details=$1::jsonb, updated_at=NOW() WHERE log_id=$2', [JSON.stringify(auditReport), auditId]);
    await client.query('COMMIT');
    return auditReport;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 3. Primary Execution Method
 * Fully audited & strengthened:
 * - Strict scope enforcement (no fall-through to factory_reset)
 * - Deterministic In-flight write request draining (active counter waits until 0)
 * - Exact 8-table record count cross-check against source DB in backup verification
 * - Audit log generated directly inside shadowStore before atomic rename (single-cycle atomic write)
 * - Post-cleanup verification reads directly from physical disk (bypassing RAM cache)
 * - Comprehensive rollback from .bak for ANY failure during or after rename
 * - Strict ADMIN authorization, zero simulated ID fallbacks, sanitized logging
 */
export async function executeDataCleanup(params: {
  adminUser: { id: number; name: string; email: string; role: string; password?: string };
  scope: 'period' | 'factory_reset';
  targetMonth?: string;
  expectedCounts?: CleanupFilterCounts;
  adminPassword?: string;
  clientIp?: string;
}): Promise<CleanupAuditReport> {
  const { adminUser, scope, targetMonth, expectedCounts, adminPassword, clientIp } = params;

  // 1. Enforce strict scope validation
  if (scope !== 'period' && scope !== 'factory_reset') {
    throw new Error(`Phạm vi dọn dẹp "${scope}" không hợp lệ. Chỉ chấp nhận "period" hoặc "factory_reset".`);
  }
  if (scope === 'period') {
    const canonicalTargetMonth = normalizeKpiMonth(targetMonth);
    if (!canonicalTargetMonth) {
      throw new Error('Kỳ KPI không hợp lệ. Vui lòng nhập định dạng YYYY-MM hoặc MM-YYYY hợp lệ (Ví dụ: 2026-10 hoặc 10-2026).');
    }
  }

  // 2. Enforce strict ADMIN authorization (no email bypass)
  if (!adminUser || adminUser.role !== 'ADMIN') {
    throw new Error('Từ chối truy cập: Chỉ Quản trị viên cấp cao (ADMIN) mới có quyền thực thi dọn dẹp cơ sở dữ liệu.');
  }

  // 3. Verify admin password without logging credentials
  if (!adminPassword || typeof adminPassword !== 'string') {
    throw new Error('Vui lòng nhập mật khẩu tài khoản Quản trị viên để xác thực thực thi dọn dẹp.');
  }

  const isValidPassword = verifyPassword(adminPassword, adminUser.password);
  if (!isValidPassword) {
    throw new Error('Mật khẩu Quản trị viên không chính xác. Thao tác dọn dẹp đã bị hủy bỏ để bảo mật.');
  }

  // 4. Acquire persistent file lock with heartbeat
  const { lockId, heartbeatTimer } = acquireCleanupLock(adminUser.id, adminUser.email, scope);
  (global as any)._isInsideCleanup = true;

  let tempFilePath: string | null = null;
  let bakFilePath: string | null = null;
  let fileWasRenamed = false;
  let commitSucceeded = false;

  try {
    if (getStorageMode() === 'postgres') {
      return await executePostgresCleanup({ adminUser, scope, targetMonth, expectedCounts, clientIp });
    }

    // 5. Deterministic In-flight request draining: wait until all active write requests reach exactly zero
    await drainInFlightWrites(25000);

    // 6. Read fresh source store and run unified target filter (calculates authoritative counts under lock)
    const currentStore = loadStore();
    const targetPlan = computeCleanupTargetRecords(currentStore, scope, targetMonth);

    // Only for scope === 'period': cross-check count matching with pre-lock preview from client
    if (scope === 'period') {
      if (!expectedCounts) {
        throw new Error('Thiếu số lượng bản ghi đối soát (expectedCounts). Vui lòng xem trước số liệu trước khi thực thi.');
      }
      const countKeys: (keyof CleanupFilterCounts)[] = ['works', 'assignments', 'overtimes', 'kpiResults', 'notifications', 'logs'];
      const hasCountMismatch = countKeys.some(k => targetPlan.counts[k] !== expectedCounts[k]);

      if (hasCountMismatch) {
        throw new Error(`Dữ liệu hệ thống đã thay đổi trong khi chờ xác nhận (Số lượng xem trước không còn khớp với thực tế). Vui lòng tải lại và xác nhận lại với số liệu mới nhất.`);
      }
    }

    // 7. Create Verified Emergency Backup before making any modification
    const backupRes = await performBackup('manual');
    if (!backupRes.success || !backupRes.metadata) {
      throw new Error(`Không thể tạo điểm sao lưu bảo vệ tự động: ${backupRes.error || 'Lỗi không xác định'}. Thao tác dọn dẹp đã bị hủy bỏ an toàn.`);
    }

    const backupMeta = backupRes.metadata;
    const backupFilePath = path.join(process.cwd(), 'data', 'backups', backupMeta.filename);
    if (!fs.existsSync(backupFilePath)) {
      throw new Error('File sao lưu vừa tạo không tồn tại trên đĩa. Hủy thao tác dọn dẹp.');
    }

    // Read and verify backup file structure
    const backupContentRaw = fs.readFileSync(backupFilePath, 'utf-8');
    const backupParsed = JSON.parse(backupContentRaw);
    if (!backupParsed.data || typeof backupParsed.data !== 'object') {
      throw new Error('Nội dung file sao lưu không hợp lệ (thiếu đối tượng data). Hủy thao tác dọn dẹp.');
    }

    // STRICT 8-TABLE EXACT RECORD COUNT CROSS-CHECK:
    // Guarantees the emergency backup has 100% of existing records before deletion is allowed
    const requiredTables = [
      { key: 'users', label: 'Nhân sự' },
      { key: 'categories', label: 'Danh mục' },
      { key: 'works', label: 'Công việc' },
      { key: 'assignments', label: 'Phân công' },
      { key: 'overtimes', label: 'Làm thêm' },
      { key: 'kpiResults', label: 'Kết quả KPI' },
      { key: 'notifications', label: 'Thông báo' },
      { key: 'systemLogs', label: 'Nhật ký' }
    ];

    for (const tbl of requiredTables) {
      const backupRows = backupParsed.data[tbl.key] || (tbl.key === 'systemLogs' ? backupParsed.data['logs'] : undefined);
      if (!Array.isArray(backupRows)) {
        throw new Error(`Kiểm tra file sao lưu khẩn cấp thất bại: Bảng "${tbl.label}" (${tbl.key}) bị thiếu trong file sao lưu. Hủy bỏ dọn dẹp để bảo vệ an toàn.`);
      }
      const sourceRows = currentStore[tbl.key] || [];
      if (backupRows.length !== sourceRows.length) {
        throw new Error(`Kiểm tra toàn vẹn file sao lưu thất bại: Số lượng bản ghi bảng "${tbl.label}" (${tbl.key}) trong file backup (${backupRows.length}) không khớp với cơ sở dữ liệu nguồn (${sourceRows.length}). Hủy bỏ thao tác dọn dẹp.`);
      }
    }

    const backupSha256 = getFileSha256(backupFilePath);

    // Record 'Before' counts
    const beforeCounts = {
      works: (currentStore.works || []).length,
      assignments: (currentStore.assignments || []).length,
      overtimes: (currentStore.overtimes || []).length,
      kpiResults: (currentStore.kpiResults || []).length,
      notifications: (currentStore.notifications || []).length,
      logs: (currentStore.systemLogs || []).length,
      users: (currentStore.users || []).length,
      categories: (currentStore.categories || []).length
    };

    // 8. Build Shadow Copy (Draft Store)
    const shadowStore: Record<string, any[]> = JSON.parse(JSON.stringify(currentStore));

    const workIdSet = new Set(targetPlan.targetWorkIds);
    const assignmentIdSet = new Set(targetPlan.targetAssignmentIds);
    const otIdSet = new Set(targetPlan.targetOtIds);
    const kpiIdSet = new Set(targetPlan.targetKpiIds);
    const notifIdSet = new Set(targetPlan.targetNotificationIds);
    const logIdSet = new Set(targetPlan.targetLogIds);

    // Remove targets from shadow copy
    shadowStore.assignments = (shadowStore.assignments || []).filter(a => !assignmentIdSet.has(Number(a.id)));
    shadowStore.works = (shadowStore.works || []).filter(w => !workIdSet.has(Number(w.id)));
    shadowStore.overtimes = (shadowStore.overtimes || []).filter(o => !otIdSet.has(Number(o.id)));
    shadowStore.kpiResults = (shadowStore.kpiResults || []).filter(k => !kpiIdSet.has(Number(k.id)));

    if (scope === 'factory_reset') {
      shadowStore.notifications = [];
      shadowStore.systemLogs = [];
    } else {
      shadowStore.notifications = (shadowStore.notifications || []).filter(n => !notifIdSet.has(Number(n.id)));
      shadowStore.systemLogs = (shadowStore.systemLogs || []).filter(l => !logIdSet.has(Number(l.id)));
    }

    // Strictly preserve users & categories 100%
    shadowStore.users = currentStore.users || [];
    shadowStore.categories = currentStore.categories || [];

    // 9. Build Audit Report & Append into shadowStore.systemLogs BEFORE writing to disk
    // This achieves single-cycle atomic write (no second direct write that could corrupt JSON)
    const auditId = `AUDIT_CLEANUP_${Date.now()}`;
    const auditReport: CleanupAuditReport = {
      auditId,
      scope,
      targetMonth,
      executedAt: new Date().toISOString(),
      operator: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      },
      clientIp,
      backup: {
        filename: backupMeta.filename,
        sizeBytes: backupMeta.sizeBytes,
        sha256: backupSha256,
        recordCounts: backupMeta.recordCounts
      },
      beforeCounts,
      deletedCounts: {
        works: targetPlan.counts.works,
        assignments: targetPlan.counts.assignments,
        overtimes: targetPlan.counts.overtimes,
        kpiResults: targetPlan.counts.kpiResults,
        notifications: targetPlan.counts.notifications,
        logs: targetPlan.counts.logs
      },
      afterCounts: {
        works: shadowStore.works.length,
        assignments: shadowStore.assignments.length,
        overtimes: shadowStore.overtimes.length,
        kpiResults: shadowStore.kpiResults.length,
        notifications: shadowStore.notifications.length,
        logs: shadowStore.systemLogs.length + 1, // accounts for the audit log item below
        users: shadowStore.users.length,
        categories: shadowStore.categories.length
      },
      validationStatus: 'SUCCESS_VERIFIED'
    };

    const auditLogItem = {
      id: (shadowStore.systemLogs?.length || 0) + 1,
      logId: auditId,
      userId: adminUser.id,
      action: scope === 'period' ? `DỌN DẸP KỲ KPI ${targetMonth}` : 'LÀM SẠCH TOÀN BỘ NGHIỆP VỤ',
      target: scope === 'period' ? `Kỳ KPI: ${targetMonth}` : 'Toàn bộ dữ liệu nghiệp vụ',
      result: 'Thành công (Đã kiểm chứng)',
      note: `Đã xóa: ${targetPlan.counts.works} việc, ${targetPlan.counts.assignments} phân công, ${targetPlan.counts.overtimes} OT, ${targetPlan.counts.kpiResults} KPI. File sao lưu: ${backupMeta.filename} (SHA256: ${backupSha256.slice(0, 12)}...)`,
      details: auditReport,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    shadowStore.systemLogs = shadowStore.systemLogs || [];
    shadowStore.systemLogs.push(auditLogItem);

    // 10. Atomic File Replace Cycle
    // A. Temporary file in SAME directory (data/) to guarantee same filesystem partition
    tempFilePath = path.join(DATA_DIR, `db-local-store.json.tmp_cleanup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    bakFilePath = path.join(DATA_DIR, `db-local-store.json.bak`);

    // B. Write completed shadowStore to temporary file
    fs.writeFileSync(tempFilePath, JSON.stringify(shadowStore, null, 2), 'utf-8');

    // C. Read back and verify validity before proceeding to rename
    const readBackRaw = fs.readFileSync(tempFilePath, 'utf-8');
    const readBackParsed = JSON.parse(readBackRaw);
    if (!readBackParsed.users || readBackParsed.users.length !== beforeCounts.users || !readBackParsed.categories) {
      throw new Error('Dữ liệu trên file tạm kiểm tra không đạt chuẩn. Hủy thao tác dọn dẹp trước khi đổi tên.');
    }

    // D. Create .bak backup copy of main file
    if (fs.existsSync(DATA_STORE_PATH)) {
      fs.copyFileSync(DATA_STORE_PATH, bakFilePath);
    }

    // E. Atomic file rename
    fs.renameSync(tempFilePath, DATA_STORE_PATH);
    fileWasRenamed = true;
    tempFilePath = null; // Successfully consumed

    // 11. Post-cleanup verification: READ DIRECTLY FROM PHYSICAL DISK (Bypassing RAM)
    const rawDiskContent = fs.readFileSync(DATA_STORE_PATH, 'utf-8');
    const verifiedDiskStore = JSON.parse(rawDiskContent);

    // Strict validation of preserved tables
    if (!Array.isArray(verifiedDiskStore.users) || verifiedDiskStore.users.length !== beforeCounts.users) {
      throw new Error(`Hậu kiểm đĩa thất bại: Số lượng người dùng (${verifiedDiskStore.users?.length}) không khớp với trước khi xóa (${beforeCounts.users}).`);
    }
    if (!Array.isArray(verifiedDiskStore.categories) || verifiedDiskStore.categories.length !== beforeCounts.categories) {
      throw new Error(`Hậu kiểm đĩa thất bại: Số lượng danh mục/cấu hình (${verifiedDiskStore.categories?.length}) không khớp với trước khi xóa (${beforeCounts.categories}).`);
    }

    // Update in-memory reference ONLY after physical disk verification succeeds
    global._inMemoryStore = createStoreProxy(verifiedDiskStore);

    // Mark commit succeeded: now safe to remove .bak
    commitSucceeded = true;
    if (bakFilePath && fs.existsSync(bakFilePath)) {
      try { fs.unlinkSync(bakFilePath); } catch {}
      bakFilePath = null;
    }

    return auditReport;
  } catch (error: any) {
    // If rename took place but commit was not fully verified: ROLLBACK FROM .BAK IMMEDIATELY
    if (fileWasRenamed && !commitSucceeded && bakFilePath && fs.existsSync(bakFilePath)) {
      try {
        console.warn('[CleanupService] Attempting automatic rollback from .bak file...');
        fs.copyFileSync(bakFilePath, DATA_STORE_PATH);
        const restoredRaw = fs.readFileSync(DATA_STORE_PATH, 'utf-8');
        global._inMemoryStore = createStoreProxy(JSON.parse(restoredRaw));
        fs.unlinkSync(bakFilePath);
        bakFilePath = null;
        console.warn('[CleanupService] Rollback completed successfully.');
      } catch (rollbackErr) {
        console.error('[CleanupService] Critical: Rollback from .bak encountered error:', rollbackErr);
      }
    }

    // If temp file still exists, clean it up
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }

    // Re-throw cleaned error message
    throw new Error(error?.message || String(error));
  } finally {
    (global as any)._isInsideCleanup = false;
    // Release persistent lock using exact lockId matching and clear heartbeat timer
    releaseCleanupLock(lockId, heartbeatTimer);
  }
}
