import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.ts';
import { users, works, assignments, overtimes, categories, kpiResults, notifications, systemLogs } from '../src/db/schema.ts';
import { 
  ensureDatabaseSchema, 
  validateSchemaPreflight, 
  movePublicTablesToLegacySchema,
  determineSafeLegacySchemaName,
  type SchemaPreflightResult 
} from './dbMigrate.ts';
import { stableCanonicalJson } from './migrationService.ts';

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'hourly' | 'weekly';
  dailyTime: string; // e.g. "23:30"
  weeklyDay?: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  maxCopies: number; // e.g. 30 (auto prune older than maxCopies)
  offsite: {
    enabled: boolean;
    provider: 'webhook' | 'google_drive' | 'onedrive' | 'nas_api';
    destinationUrl: string; // Webhook URL or Cloud/NAS API endpoint
    authHeaderName?: string; // e.g. "Authorization" or "x-api-key"
    authHeaderValue?: string; // e.g. "Bearer token_xyz"
    sendAsMultipart?: boolean;
  };
  lastBackupAt?: string;
  lastBackupStatus?: 'success' | 'failed' | 'idle';
  lastBackupMessage?: string;
}

export interface BackupMetadata {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  recordCounts: {
    users: number;
    works: number;
    assignments: number;
    overtimes: number;
    categories: number;
    kpiResults: number;
    notifications: number;
    logs: number;
  };
  triggerType: 'auto_scheduled' | 'manual';
  offsiteSynced?: boolean;
  offsiteMessage?: string;
}

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
const CONFIG_FILE = path.join(process.cwd(), 'data', 'backup-config.json');

const DEFAULT_BACKUP_CONFIG: BackupScheduleConfig = {
  enabled: true,
  frequency: 'daily',
  dailyTime: '23:30',
  weeklyDay: 0,
  maxCopies: 30,
  offsite: {
    enabled: false,
    provider: 'google_drive',
    destinationUrl: '',
    authHeaderName: '',
    authHeaderValue: '',
    sendAsMultipart: false
  },
  lastBackupAt: '',
  lastBackupStatus: 'idle',
  lastBackupMessage: 'Chưa có bản sao lưu nào được thực hiện'
};

let cachedBackupConfig: BackupScheduleConfig | null = null;

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function mergeBackupConfig(base: BackupScheduleConfig, incoming?: Partial<BackupScheduleConfig> | null): BackupScheduleConfig {
  if (!incoming) return { ...base, offsite: { ...base.offsite } };
  return {
    ...base,
    ...incoming,
    offsite: {
      ...base.offsite,
      ...(incoming.offsite || {})
    }
  };
}

export async function getEffectiveBackupConfigAsync(): Promise<BackupScheduleConfig> {
  // 1. Try reading from Database (categories table with code 'SYSTEM_BACKUP_CONFIG')
  try {
    const dbCat = await db.query.categories.findFirst({
      where: (cat, { eq, and }) => and(eq(cat.code, 'SYSTEM_BACKUP_CONFIG'), eq(cat.type, 'SYSTEM_CONFIG'))
    });
    if (dbCat && dbCat.properties) {
      const merged = mergeBackupConfig(DEFAULT_BACKUP_CONFIG, dbCat.properties as any);
      cachedBackupConfig = merged;
      // also write to local file for fast offline reads
      try {
        ensureDir(path.dirname(CONFIG_FILE));
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
      } catch {}
      return merged;
    }
  } catch (err) {
    console.error('Error reading backup config from DB:', err);
  }

  // 2. Fallback to cached memory or local JSON file
  if (cachedBackupConfig) {
    return cachedBackupConfig;
  }

  try {
    ensureDir(path.dirname(CONFIG_FILE));
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const merged = mergeBackupConfig(DEFAULT_BACKUP_CONFIG, parsed);
      cachedBackupConfig = merged;
      return merged;
    }
  } catch (e) {
    console.error('Error reading backup config from file:', e);
  }

  cachedBackupConfig = { ...DEFAULT_BACKUP_CONFIG, offsite: { ...DEFAULT_BACKUP_CONFIG.offsite } };
  return cachedBackupConfig;
}

export function getBackupConfig(): BackupScheduleConfig {
  if (cachedBackupConfig) {
    return cachedBackupConfig;
  }
  try {
    ensureDir(path.dirname(CONFIG_FILE));
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const merged = mergeBackupConfig(DEFAULT_BACKUP_CONFIG, parsed);
      cachedBackupConfig = merged;
      return merged;
    }
  } catch (e) {
    console.error('Error reading backup config:', e);
  }
  return DEFAULT_BACKUP_CONFIG;
}

export async function saveBackupConfigAsync(cfg: Partial<BackupScheduleConfig>): Promise<BackupScheduleConfig> {
  const current = await getEffectiveBackupConfigAsync();
  const updated = mergeBackupConfig(current, cfg);
  cachedBackupConfig = updated;

  // 1. Save to local JSON file
  try {
    ensureDir(path.dirname(CONFIG_FILE));
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving backup config to file:', e);
  }

  // 2. Persist to PostgreSQL Database (categories table)
  try {
    await db.insert(categories).values({
      code: 'SYSTEM_BACKUP_CONFIG',
      name: 'Cấu hình Sao lưu & Đám mây Ngoại vi',
      type: 'SYSTEM_CONFIG',
      properties: updated,
      status: 'Đang áp dụng',
      order: 2
    }).onConflictDoUpdate({
      target: categories.code,
      set: {
        name: 'Cấu hình Sao lưu & Đám mây Ngoại vi',
        properties: updated,
        status: 'Đang áp dụng',
        order: 2
      }
    });
  } catch (err) {
    console.error('Error persisting backup config to DB:', err);
  }

  return updated;
}

export function saveBackupConfig(cfg: Partial<BackupScheduleConfig>): BackupScheduleConfig {
  const current = getBackupConfig();
  const updated = mergeBackupConfig(current, cfg);
  cachedBackupConfig = updated;

  try {
    ensureDir(path.dirname(CONFIG_FILE));
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving backup config to file:', e);
  }

  // Fire and forget DB persist in sync wrapper
  db.insert(categories).values({
    code: 'SYSTEM_BACKUP_CONFIG',
    name: 'Cấu hình Sao lưu & Đám mây Ngoại vi',
    type: 'SYSTEM_CONFIG',
    properties: updated,
    status: 'Đang áp dụng',
    order: 2
  }).onConflictDoUpdate({
    target: categories.code,
    set: {
      name: 'Cấu hình Sao lưu & Đám mây Ngoại vi',
      properties: updated,
      status: 'Đang áp dụng',
      order: 2
    }
  }).catch(err => console.error('Error async persisting backup config to DB:', err));

  return updated;
}

/**
 * Perform a full system backup snapshot
 */
export async function performBackup(triggerType: 'auto_scheduled' | 'manual' = 'manual'): Promise<{
  success: boolean;
  metadata?: BackupMetadata;
  error?: string;
}> {
  try {
    ensureDir(BACKUP_DIR);

    // 1. Ensure database schema is synchronized before snapshot
    try {
      await ensureDatabaseSchema();
    } catch (e) {
      console.warn('Database schema sync check during backup:', e);
    }

    // Read every table with resilience
    const [
      allUsers,
      allWorks,
      allAssignments,
      allOvertimes,
      allCategories,
      allKpiResults,
      allNotifications,
      allLogs
    ] = await Promise.all([
      db.query.users.findMany().catch((err) => { console.error('Error reading users in backup:', err); return []; }),
      db.query.works.findMany().catch((err) => { console.error('Error reading works in backup:', err); return []; }),
      db.query.assignments.findMany().catch((err) => { console.error('Error reading assignments in backup:', err); return []; }),
      db.query.overtimes.findMany().catch((err) => { console.error('Error reading overtimes in backup:', err); return []; }),
      db.query.categories.findMany().catch((err) => { console.error('Error reading categories in backup:', err); return []; }),
      db.query.kpiResults.findMany().catch((err) => { console.error('Error reading kpiResults in backup:', err); return []; }),
      db.query.notifications.findMany().catch((err) => { console.error('Error reading notifications in backup:', err); return []; }),
      db.query.systemLogs.findMany().catch((err) => { console.error('Error reading systemLogs in backup:', err); return []; })
    ]);

    const timestamp = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(timestamp.getDate())}_${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
    const id = `backup_${dateStr}`;
    const filename = `${id}.json`;
    const filePath = path.join(BACKUP_DIR, filename);

    const recordCounts = {
      users: allUsers.length,
      works: allWorks.length,
      assignments: allAssignments.length,
      overtimes: allOvertimes.length,
      categories: allCategories.length,
      kpiResults: allKpiResults.length,
      notifications: allNotifications.length,
      logs: allLogs.length
    };

    const backupPayload = {
      formatVersion: '2.1',
      version: '2.1',
      system: 'PMO1 Task & KPI Management',
      createdAt: timestamp.toISOString(),
      triggerType,
      counts: recordCounts,
      data: {
        users: allUsers,
        works: allWorks,
        assignments: allAssignments,
        overtimes: allOvertimes,
        categories: allCategories,
        kpiResults: allKpiResults,
        notifications: allNotifications,
        logs: allLogs
      }
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    fs.writeFileSync(filePath, jsonString, 'utf-8');
    const stats = fs.statSync(filePath);

    const metadata: BackupMetadata = {
      id,
      filename,
      createdAt: timestamp.toISOString(),
      sizeBytes: stats.size,
      recordCounts,
      triggerType,
      offsiteSynced: false
    };

    // 2. Offsite sync if configured
    const config = await getEffectiveBackupConfigAsync();
    let offsiteResultText = '';
    if (config.offsite?.enabled && config.offsite.destinationUrl) {
      try {
        const offsiteRes = await pushToOffsite(config.offsite, metadata, jsonString);
        metadata.offsiteSynced = offsiteRes.success;
        metadata.offsiteMessage = offsiteRes.message;
        offsiteResultText = ` • Đám mây: ${offsiteRes.message}`;
      } catch (err: any) {
        metadata.offsiteSynced = false;
        metadata.offsiteMessage = `Lỗi ngoại vi: ${err?.message || String(err)}`;
        offsiteResultText = ` • Đám mây lỗi: ${err?.message || String(err)}`;
      }
    }

    // 3. Auto prune old backups to maintain maxCopies
    await autoPruneBackups(config.maxCopies || 30);

    // 4. Update status in config
    await saveBackupConfigAsync({
      lastBackupAt: timestamp.toISOString(),
      lastBackupStatus: 'success',
      lastBackupMessage: `Sao lưu thành công ${allWorks.length} công việc, ${allUsers.length} nhân sự (${(stats.size / 1024).toFixed(1)} KB)${offsiteResultText}`
    });

    return { success: true, metadata };
  } catch (error: any) {
    console.error('Error performing backup:', error);
    await saveBackupConfigAsync({
      lastBackupAt: new Date().toISOString(),
      lastBackupStatus: 'failed',
      lastBackupMessage: `Lỗi sao lưu: ${error?.message || String(error)}`
    });
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Push backup to Offsite URL (Google Drive/OneDrive webhook, NAS API, Custom API)
 */
async function pushToOffsite(
  offsiteConfig: BackupScheduleConfig['offsite'],
  meta: BackupMetadata,
  jsonString: string
): Promise<{ success: boolean; message: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-backup-id': meta.id,
      'x-backup-filename': meta.filename,
      'x-backup-time': meta.createdAt
    };

    if (offsiteConfig.authHeaderName && offsiteConfig.authHeaderValue) {
      headers[offsiteConfig.authHeaderName] = offsiteConfig.authHeaderValue;
    }

    const payload = {
      id: meta.id,
      filename: meta.filename,
      createdAt: meta.createdAt,
      provider: offsiteConfig.provider,
      metadata: meta,
      contentBase64: Buffer.from(jsonString, 'utf-8').toString('base64'),
      contentJson: JSON.parse(jsonString)
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000); // 35s timeout

    const res = await fetch(offsiteConfig.destinationUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      redirect: 'follow', // Follow Google Web App 302 redirects
      signal: controller.signal
    });
    clearTimeout(timeout);

    const providerNames: Record<string, string> = {
      google_drive: 'Google Drive',
      onedrive: 'OneDrive',
      nas_api: 'NAS Storage',
      webhook: 'Webhook Ngoại vi'
    };
    const pName = providerNames[offsiteConfig.provider] || 'Ngoại vi';

    const rawText = await res.text().catch(() => '');
    let bodyRes: any = null;
    try {
      bodyRes = JSON.parse(rawText);
    } catch {}

    if (res.ok) {
      if (bodyRes && bodyRes.success === false) {
        return {
          success: false,
          message: `${pName} xử lý thất bại: ${bodyRes.error || bodyRes.message || 'Lỗi không xác định trong script'}`
        };
      }

      if (!bodyRes && rawText.includes('<html')) {
        return {
          success: false,
          message: `${pName} trả về HTML thay vì JSON. Nguyên nhân: Hàm doPost(e) chưa đặt ở ngoài cùng (bị lồng trong myFunction) hoặc Web App chưa bật quyền 'Anyone'.`
        };
      }

      const extra = bodyRes?.message ? ` (${bodyRes.message})` : '';
      return { success: true, message: `Đã đẩy lên ${pName} thành công (HTTP ${res.status})${extra}` };
    } else {
      return {
        success: false,
        message: `${pName} trả về HTTP ${res.status}: ${rawText.slice(0, 150)}`
      };
    }
  } catch (e: any) {
    return { success: false, message: `Không thể kết nối đến máy chủ ngoại vi: ${e?.message || String(e)}` };
  }
}

/**
 * Manually push an existing backup file to offsite cloud
 */
export async function pushExistingBackupToOffsite(filename: string): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getEffectiveBackupConfigAsync();
    if (!config.offsite?.enabled || !config.offsite?.destinationUrl) {
      return { success: false, message: 'Chưa cấu hình hoặc chưa bật chế độ Lưu trữ Ngoại vi (Offsite Cloud).' };
    }

    const safeName = path.basename(filename);
    const target = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(target)) {
      return { success: false, message: 'Không tìm thấy file sao lưu trên hệ thống.' };
    }

    const content = fs.readFileSync(target, 'utf-8');
    const stats = fs.statSync(target);
    const parsed = JSON.parse(content);

    const meta: BackupMetadata = {
      id: safeName.replace('.json', ''),
      filename: safeName,
      createdAt: parsed.createdAt || stats.mtime.toISOString(),
      sizeBytes: stats.size,
      recordCounts: {
        users: parsed.data?.users?.length || 0,
        works: parsed.data?.works?.length || 0,
        assignments: parsed.data?.assignments?.length || 0,
        overtimes: parsed.data?.overtimes?.length || 0,
        categories: parsed.data?.categories?.length || 0,
        kpiResults: parsed.data?.kpiResults?.length || 0,
        notifications: parsed.data?.notifications?.length || 0,
        logs: parsed.data?.logs?.length || 0
      },
      triggerType: parsed.triggerType || 'manual'
    };

    return await pushToOffsite(config.offsite, meta, content);
  } catch (e: any) {
    return { success: false, message: `Lỗi khi đẩy file lên đám mây ngoại vi: ${e?.message || String(e)}` };
  }
}

/**
 * List all existing backup files with metadata
 */
export function listBackups(): BackupMetadata[] {
  try {
    ensureDir(BACKUP_DIR);
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
    const list: BackupMetadata[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        
        list.push({
          id: file.replace('.json', ''),
          filename: file,
          createdAt: parsed.createdAt || stats.mtime.toISOString(),
          sizeBytes: stats.size,
          recordCounts: {
            users: parsed.data?.users?.length || 0,
            works: parsed.data?.works?.length || 0,
            assignments: parsed.data?.assignments?.length || 0,
            overtimes: parsed.data?.overtimes?.length || 0,
            categories: parsed.data?.categories?.length || 0,
            kpiResults: parsed.data?.kpiResults?.length || 0,
            notifications: parsed.data?.notifications?.length || 0,
            logs: parsed.data?.logs?.length || 0
          },
          triggerType: parsed.triggerType || 'manual'
        });
      } catch (err) {
        console.error(`Error reading backup item ${file}:`, err);
      }
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (e) {
    console.error('Error listing backups:', e);
    return [];
  }
}

/**
 * Delete a specific backup file
 */
export function deleteBackupFile(filename: string): boolean {
  try {
    const safeName = path.basename(filename);
    const target = path.join(BACKUP_DIR, safeName);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      return true;
    }
  } catch (e) {
    console.error('Error deleting backup:', e);
  }
  return false;
}

/**
 * Auto prune old backup files if count exceeds maxCopies
 */
export async function autoPruneBackups(maxCopies = 30): Promise<number> {
  try {
    const backups = listBackups();
    if (backups.length <= maxCopies) {
      return 0;
    }
    const toDelete = backups.slice(maxCopies);
    let deletedCount = 0;
    for (const item of toDelete) {
      if (deleteBackupFile(item.filename)) {
        deletedCount++;
      }
    }
    return deletedCount;
  } catch (e) {
    console.error('Error pruning backups:', e);
    return 0;
  }
}

/**
 * Get raw backup content for download or restore.
 * Supports exact path, .json suffix, public/assets/aistudio fallback, and prefix search.
 */
export function getBackupContent(filename: string): any {
  if (!filename || typeof filename !== 'string') return null;
  const safeName = path.basename(filename.trim());
  const searchDirs = [
    BACKUP_DIR,
    path.join(process.cwd(), 'data', 'backups'),
    path.join(process.cwd(), 'public', 'assets', 'aistudio')
  ];

  // 1. Direct file name checks
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const candidates = [
      path.join(dir, safeName),
      path.join(dir, safeName.endsWith('.json') ? safeName : `${safeName}.json`)
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          const raw = fs.readFileSync(c, 'utf-8');
          return JSON.parse(raw);
        } catch (err) {
          console.error(`[BackupContent] Error parsing JSON from ${c}:`, err);
        }
      }
    }
  }

  // 2. Prefix matching (e.g. backup_20261019_163013 matching backup_20261019_163013_9fd0cb18.json)
  const prefix = safeName.replace(/\.json$/, '');
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      const match = files.find(f => (f.startsWith(prefix) || f.includes(prefix)) && f.endsWith('.json'));
      if (match) {
        const fullPath = path.join(dir, match);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {}
  }

  return null;
}

/**
 * Compute canonical deterministic hash of a table row for Pre-Commit verification
 */
export function computeCanonicalBackupRowHash(tableName: string, row: any): string {
  if (!row) return '';
  const hash = crypto.createHash('sha256');

  let normalizedStr = '';
  switch (tableName) {
    case 'users': {
      const email = String(row.email || '').trim();
      normalizedStr = [
        row.id,
        row.uid || '',
        String(row.name || '').trim(),
        email,
        row.phone || '',
        row.zalo || '',
        row.position || '',
        row.group || '',
        row.role || '',
        row.status || '',
        row.permissions ? stableCanonicalJson(row.permissions) : '',
        row.password || '',
        row.mustChangePassword ? 'true' : (row.must_change_password ? 'true' : 'false')
      ].join('|');
      break;
    }
    case 'categories': {
      const code = String(row.code || '').trim().toUpperCase();
      normalizedStr = [
        row.id,
        code,
        String(row.name || '').trim(),
        row.type || '',
        stableCanonicalJson(row.properties || {}),
        row.status || '',
        row.order ?? row.order_num ?? 0,
        row.description || '',
        row.parentId ?? row.parent_id ?? '',
        row.isActive !== undefined ? String(row.isActive) : (row.is_active !== undefined ? String(row.is_active) : 'true')
      ].join('|');
      break;
    }
    case 'works': {
      const workId = String(row.workId || row.work_id || '').trim();
      normalizedStr = [
        row.id,
        workId,
        row.month || '',
        row.userId ?? row.user_id,
        row.taskGroup || row.task_group || '',
        row.taskName || row.task_name || '',
        row.taskCode || row.task_code || '',
        row.detail || '',
        row.hours || '',
        row.days ?? '',
        row.status || '',
        row.proposedNature || row.proposed_nature || '',
        row.approvedNature || row.approved_nature || '',
        row.coef || '',
        row.baseScore || row.base_score || '',
        row.convertedScore || row.converted_score || '',
        row.selfConvertedScore || row.self_converted_score || '',
        row.approvedConvertedScore || row.approved_converted_score || '',
        row.leaderApproval || row.leader_approval || ''
      ].join('|');
      break;
    }
    case 'assignments': {
      const assignmentId = String(row.assignmentId || row.assignment_id || '').trim();
      normalizedStr = [
        row.id,
        assignmentId,
        row.month || '',
        row.assignerId ?? row.assigner_id,
        row.receiverId ?? row.receiver_id,
        row.taskName || row.task_name || '',
        row.taskCode || row.task_code || '',
        row.baseScore || row.base_score || '',
        row.expectedConvertedScore || row.expected_converted_score || '',
        row.priority || '',
        row.receiveStatus || row.receive_status || ''
      ].join('|');
      break;
    }
    case 'overtimes': {
      const otId = String(row.otId || row.ot_id || '').trim();
      const rawOtDate = row.otDate ?? row.ot_date;
      const otDate = rawOtDate instanceof Date ? rawOtDate.toISOString().slice(0, 10) : String(rawOtDate || '').slice(0, 10);
      normalizedStr = [
        row.id,
        otId,
        row.month || '',
        row.userId ?? row.user_id,
        otDate,
        row.startTime || row.start_time || '',
        row.endTime || row.end_time || '',
        row.totalRegHours || row.total_reg_hours || '',
        row.approvalStatus || row.approval_status || '',
        row.approvedHours || row.approved_hours || ''
      ].join('|');
      break;
    }
    case 'kpi_results': {
      const kpiId = String(row.kpiId || row.kpi_id || '').trim();
      normalizedStr = [
        row.id,
        kpiId,
        row.month || '',
        row.userId ?? row.user_id,
        row.aScore || row.a_score || '',
        row.bScore || row.b_score || '',
        row.cScore || row.c_score || '',
        row.dScore || row.d_score || '',
        row.c1Score || row.c1_score || '',
        row.totalKpi || row.total_kpi || '',
        row.rank || '',
        row.registeredWorks ?? row.registered_works ?? 0,
        row.approvedWorks ?? row.approved_works ?? 0,
        row.pendingWorks ?? row.pending_works ?? 0,
        row.supplementWorks ?? row.supplement_works ?? 0,
        row.rejectedWorks ?? row.rejected_works ?? 0,
        row.lockedStatus || row.locked_status || '',
        stableCanonicalJson(row.detailsA || row.details_a || {}),
        stableCanonicalJson(row.detailsB || row.details_b || {}),
        stableCanonicalJson(row.detailsC || row.details_c || {}),
        stableCanonicalJson(row.detailsD || row.details_d || {})
      ].join('|');
      break;
    }
    case 'notifications': {
      const notifyId = String(row.notifyId || row.notify_id || '').trim();
      normalizedStr = [
        row.id,
        notifyId,
        row.senderId ?? row.sender_id ?? '',
        row.receiverId ?? row.receiver_id,
        row.type || '',
        String(row.title || '').trim(),
        String(row.content || '').trim(),
        row.status || ''
      ].join('|');
      break;
    }
    case 'system_logs': {
      const logId = String(row.logId || row.log_id || '').trim();
      normalizedStr = [
        row.id,
        logId,
        row.userId ?? row.user_id ?? '',
        row.action || '',
        row.target || '',
        row.result || '',
        stableCanonicalJson(row.details || {})
      ].join('|');
      break;
    }
    default:
      normalizedStr = JSON.stringify(row);
  }

  hash.update(normalizedStr);
  return hash.digest('hex');
}

export interface BackupValidationReport {
  valid: boolean;
  formatVersion: string;
  counts: {
    users: number;
    categories: number;
    works: number;
    assignments: number;
    overtimes: number;
    kpiResults: number;
    notifications: number;
    logs: number;
  };
  technicalDuplicates: Array<{ table: string; key: string; value: any; index: number }>;
  orphanRecords: Array<{ table: string; field: string; value: any; recordId: any }>;
  kpiAudit: {
    totalChecked: number;
    zeroScoresPreserved: number;
    nanOrNullAnomalies: number;
    formulaMatches: number;
    unfinalizedAllowedZeroOrNull: number;
    formulaMismatches: Array<{ kpiId: string; stored: any; computed: number; rank: string }>;
  };
  canonicalHashMap: Map<string, string>; // "table:key" -> canonicalHash
  warnings: string[];
  errors: string[];
}

/**
 * Rigorous pre-restore validator for JSON backup v2.0/v2.1
 * Verifies payload format, required fields, duplicates, FK integrity, and KPI scores.
 */
export function validateBackupPayload(backupData: any): BackupValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const technicalDuplicates: Array<{ table: string; key: string; value: any; index: number }> = [];
  const orphanRecords: Array<{ table: string; field: string; value: any; recordId: any }> = [];
  const canonicalHashMap = new Map<string, string>();

  const isObject = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);

  if (!isObject(backupData)) {
    return {
      valid: false,
      formatVersion: 'unknown',
      counts: { users: 0, categories: 0, works: 0, assignments: 0, overtimes: 0, kpiResults: 0, notifications: 0, logs: 0 },
      technicalDuplicates: [],
      orphanRecords: [],
      kpiAudit: { totalChecked: 0, zeroScoresPreserved: 0, nanOrNullAnomalies: 0, formulaMatches: 0, unfinalizedAllowedZeroOrNull: 0, formulaMismatches: [] },
      canonicalHashMap: new Map(),
      warnings: [],
      errors: ['Dữ liệu sao lưu phải là một đối tượng JSON hợp lệ.']
    };
  }

  const formatVersion = String(backupData.formatVersion || backupData.version || '');
  if (formatVersion !== '2.0' && formatVersion !== '2.1') {
    errors.push(`Phiên bản sao lưu không được hỗ trợ: '${formatVersion}'. Hệ thống chỉ hỗ trợ v2.0 hoặc v2.1.`);
  }

  if (!isObject(backupData.data)) {
    errors.push('File sao lưu thiếu đối tượng data chứa dữ liệu các bảng.');
    return {
      valid: false,
      formatVersion,
      counts: { users: 0, categories: 0, works: 0, assignments: 0, overtimes: 0, kpiResults: 0, notifications: 0, logs: 0 },
      technicalDuplicates: [],
      orphanRecords: [],
      kpiAudit: { totalChecked: 0, zeroScoresPreserved: 0, nanOrNullAnomalies: 0, formulaMatches: 0, unfinalizedAllowedZeroOrNull: 0, formulaMismatches: [] },
      canonicalHashMap: new Map(),
      warnings: [],
      errors
    };
  }

  const data = backupData.data;
  const groups = ['users', 'categories', 'works', 'assignments', 'overtimes', 'kpiResults', 'notifications', 'logs'] as const;
  const counts = {
    users: Array.isArray(data.users) ? data.users.length : 0,
    categories: Array.isArray(data.categories) ? data.categories.length : 0,
    works: Array.isArray(data.works) ? data.works.length : 0,
    assignments: Array.isArray(data.assignments) ? data.assignments.length : 0,
    overtimes: Array.isArray(data.overtimes) ? data.overtimes.length : 0,
    kpiResults: Array.isArray(data.kpiResults) ? data.kpiResults.length : 0,
    notifications: Array.isArray(data.notifications) ? data.notifications.length : 0,
    logs: Array.isArray(data.logs) ? data.logs.length : 0
  };

  const requiredKeys: Record<string, string[]> = {
    users: ['id', 'name', 'email'],
    categories: ['id', 'code', 'name', 'type'],
    works: ['id', 'workId', 'month', 'userId'],
    assignments: ['id', 'assignmentId', 'month', 'assignerId', 'receiverId'],
    overtimes: ['id', 'otId', 'month', 'userId', 'otDate'],
    kpiResults: ['id', 'kpiId', 'month', 'userId'],
    notifications: ['id', 'notifyId', 'receiverId'],
    logs: ['id', 'logId']
  };

  // 1. Validate required fields and technical duplicate keys within source
  for (const group of groups) {
    const rows = data[group];
    if (!Array.isArray(rows)) {
      errors.push(`Nhóm data.${group} không tồn tại hoặc không phải là mảng.`);
      continue;
    }

    const seenIds = new Set<number>();
    const seenBusinessKeys = new Set<string>();
    const seenEmailsLower = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!isObject(r)) {
        errors.push(`data.${group}[${i}] không phải là một đối tượng hợp lệ.`);
        continue;
      }

      // Check required fields
      for (const reqKey of requiredKeys[group] || []) {
        if (r[reqKey] === undefined || r[reqKey] === null || r[reqKey] === '') {
          errors.push(`data.${group}[${i}] thiếu trường bắt buộc: ${reqKey}`);
        }
      }

      // Check integer ID duplicate
      const idNum = Number(r.id);
      if (seenIds.has(idNum)) {
        technicalDuplicates.push({ table: group, key: 'id', value: idNum, index: i });
      } else {
        seenIds.add(idNum);
      }

      // Check business unique key duplicate
      let bKey: string | null = null;
      if (group === 'users') {
        bKey = String(r.email || '').trim();
        const lowerEmail = bKey.toLowerCase();
        if (seenEmailsLower.has(lowerEmail) && !seenBusinessKeys.has(bKey)) {
          warnings.push(`[Cảnh báo không chặn] Bản ghi users #${i} (ID: ${r.id}) có email '${bKey}' chỉ khác chữ hoa/thường với tài khoản khác. Hai bản ghi được bảo toàn nguyên vẹn độc lập do PostgreSQL UNIQUE(email) phân biệt chữ hoa/thường (case-sensitive) và ID được giữ nguyên.`);
        }
        seenEmailsLower.add(lowerEmail);
      }
      else if (group === 'categories') bKey = String(r.code || '').trim().toUpperCase();
      else if (group === 'works') bKey = String(r.workId || r.work_id || '').trim();
      else if (group === 'assignments') bKey = String(r.assignmentId || r.assignment_id || '').trim();
      else if (group === 'overtimes') bKey = String(r.otId || r.ot_id || '').trim();
      else if (group === 'kpiResults') bKey = String(r.kpiId || r.kpi_id || '').trim();
      else if (group === 'notifications') bKey = String(r.notifyId || r.notify_id || '').trim();
      else if (group === 'logs') bKey = String(r.logId || r.log_id || '').trim();

      if (bKey) {
        if (seenBusinessKeys.has(bKey)) {
          technicalDuplicates.push({ table: group, key: 'business_key', value: bKey, index: i });
        } else {
          seenBusinessKeys.add(bKey);
        }
      }

      // Compute canonical hash
      const dbTableName = group === 'kpiResults' ? 'kpi_results' : (group === 'logs' ? 'system_logs' : group);
      const rowHash = computeCanonicalBackupRowHash(dbTableName, r);
      canonicalHashMap.set(`${dbTableName}:${bKey || idNum}`, rowHash);
    }
  }

  // 2. Foreign Key Integrity Check (users -> works, assignments, overtimes, kpiResults, notifications, logs)
  const validUserIds = new Set<number>((data.users || []).map((u: any) => Number(u.id)));

  const checkFk = (groupName: string, fieldName: string, rows: any[], recordIdField: string, optional = false) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const val = r[fieldName];
      if (val === null || val === undefined) {
        if (!optional) orphanRecords.push({ table: groupName, field: fieldName, value: val, recordId: r[recordIdField] });
        continue;
      }
      const numVal = Number(val);
      if (!validUserIds.has(numVal)) {
        orphanRecords.push({ table: groupName, field: fieldName, value: numVal, recordId: r[recordIdField] });
      }
    }
  };

  checkFk('works', 'userId', data.works, 'workId');
  checkFk('assignments', 'assignerId', data.assignments, 'assignmentId', true);
  checkFk('assignments', 'receiverId', data.assignments, 'assignmentId');
  checkFk('overtimes', 'userId', data.overtimes, 'otId');
  checkFk('kpiResults', 'userId', data.kpiResults, 'kpiId');
  checkFk('notifications', 'receiverId', data.notifications, 'notifyId');
  checkFk('notifications', 'senderId', data.notifications, 'notifyId', true);
  checkFk('logs', 'userId', data.logs, 'logId', true);

  // 3. KPI Integrity & Zero Preservation Audit
  const kpiAudit = {
    totalChecked: 0,
    zeroScoresPreserved: 0,
    nanOrNullAnomalies: 0,
    formulaMatches: 0,
    unfinalizedAllowedZeroOrNull: 0,
    formulaMismatches: [] as Array<{ kpiId: string; stored: any; computed: number; rank: string }>
  };

  if (Array.isArray(data.kpiResults)) {
    kpiAudit.totalChecked = data.kpiResults.length;
    for (const k of data.kpiResults) {
      const a = k.aScore !== null && k.aScore !== undefined && k.aScore !== '' ? Number(k.aScore) : 0;
      const b = k.bScore !== null && k.bScore !== undefined && k.bScore !== '' ? Number(k.bScore) : 0;
      const c = k.cScore !== null && k.cScore !== undefined && k.cScore !== '' ? Number(k.cScore) : 0;
      const d = k.dScore !== null && k.dScore !== undefined && k.dScore !== '' ? Number(k.dScore) : 0;
      const stored = k.totalKpi !== null && k.totalKpi !== undefined && k.totalKpi !== '' ? Number(k.totalKpi) : null;

      // Zero check
      if (k.aScore === 0 || k.aScore === '0' || k.bScore === 0 || k.bScore === '0' || k.cScore === 0 || k.cScore === '0' || k.totalKpi === 0 || k.totalKpi === '0') {
        kpiAudit.zeroScoresPreserved++;
      }

      // NaN check
      if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d) || (stored !== null && isNaN(stored))) {
        kpiAudit.nanOrNullAnomalies++;
      }

      const computed = Math.min(100, Math.max(0, a + b + c - d));
      const rank = String(k.rank || '').trim();
      const lockedStatus = String(k.lockedStatus || '').trim();

      // Business rule: unfinalized KPI records are permitted to have totalKpi = 0 or null
      if (rank === 'Chưa chốt' || rank === 'Chờ duyệt' || lockedStatus === 'Chưa chốt') {
        kpiAudit.unfinalizedAllowedZeroOrNull++;
        kpiAudit.formulaMatches++;
      } else {
        // Finalized record must match computed formula
        if (stored !== null && Math.abs(stored - computed) <= 0.05) {
          kpiAudit.formulaMatches++;
        } else {
          kpiAudit.formulaMismatches.push({
            kpiId: k.kpiId,
            stored,
            computed,
            rank
          });
        }
      }
    }
  }

  if (technicalDuplicates.length > 0) {
    errors.push(`Phát hiện ${technicalDuplicates.length} khóa kỹ thuật bị trùng lặp trong file sao lưu.`);
  }
  if (orphanRecords.length > 0) {
    errors.push(`Phát hiện ${orphanRecords.length} bản ghi mồ côi (tham chiếu userId không tồn tại trong bảng users).`);
  }
  if (kpiAudit.nanOrNullAnomalies > 0) {
    errors.push(`Phát hiện ${kpiAudit.nanOrNullAnomalies} giá trị NaN/bất thường trong bảng KPI.`);
  }

  return {
    valid: errors.length === 0,
    formatVersion,
    counts,
    technicalDuplicates,
    orphanRecords,
    kpiAudit,
    canonicalHashMap,
    warnings,
    errors
  };
}

export interface RestoreDryRunResult {
  success: boolean;
  mode: 'dry-run';
  readyToApply: boolean;
  targetDbState: {
    isLegacySchema: boolean;
    existingPublicTables: string[];
    tablesToPreserve: string[];
    targetPreservationSchema: string;
    canonicalTablesToCreate: string[];
    incompatibleColumns: any[];
  };
  backupStats: {
    formatVersion: string;
    recordCounts: Record<string, number>;
    technicalDuplicates: number;
    foreignKeyOrphans: number;
    kpiAudit: any;
    warnings: string[];
  };
  errors: string[];
  message: string;
}

/**
 * Phase 1: Pure READ-ONLY Dry Run inspection
 * Validates Neon state and backup data without touching or modifying any database tables.
 */
export async function runRestoreDryRun(
  backupData: any, 
  poolOrClient?: any
): Promise<RestoreDryRunResult> {
  const preflight: SchemaPreflightResult = await validateSchemaPreflight(poolOrClient);
  const validation: BackupValidationReport = validateBackupPayload(backupData);

  const canonicalTablesToCreate = [
    'users', 'categories', 'works', 'assignments', 'overtimes', 
    'kpi_results', 'notifications', 'system_logs', 'push_settings', 
    'push_subscriptions', 'migration_metadata'
  ];

  const targetPreservationSchema = 'legacy_pre_restore_20261027';
  const readyToApply = validation.valid && validation.errors.length === 0;

  let message = '';
  if (readyToApply) {
    message = `[DRY-RUN HOÀN TẤT - SẴN SÀNG KHÔI PHỤC] File backup hợp lệ 100% (${validation.counts.users} users, ${validation.counts.categories} categories, ${validation.counts.works} works, ${validation.counts.assignments} assignments, ${validation.counts.overtimes} overtimes, ${validation.counts.kpiResults} kpiResults, ${validation.counts.notifications} notifications, ${validation.counts.logs} logs). Sẽ bảo toàn ${preflight.existingPublicTables.length} bảng hiện hữu sang '${targetPreservationSchema}' và tạo schema canonical chuẩn trong 'public'.`;
  } else {
    message = `[DRY-RUN CẢNH BÁO] Phát hiện lỗi trong dữ liệu sao lưu: ${validation.errors.join('; ')}`;
  }

  return {
    success: validation.valid,
    mode: 'dry-run',
    readyToApply,
    targetDbState: {
      isLegacySchema: preflight.isLegacySchema,
      existingPublicTables: preflight.existingPublicTables,
      tablesToPreserve: preflight.existingPublicTables,
      targetPreservationSchema,
      canonicalTablesToCreate,
      incompatibleColumns: preflight.incompatibleColumns
    },
    backupStats: {
      formatVersion: validation.formatVersion,
      recordCounts: validation.counts,
      technicalDuplicates: validation.technicalDuplicates.length,
      foreignKeyOrphans: validation.orphanRecords.length,
      kpiAudit: validation.kpiAudit,
      warnings: validation.warnings || []
    },
    errors: validation.errors,
    message
  };
}

/**
 * Phase 2: Transactional Restore APPLY
 * Preserves existing public tables to legacy_pre_restore_20261027, creates canonical schema,
 * inserts rows preserving IDs, codes, 0s, nulls, hashes, and executes pre-commit verification.
 */
export async function executeRestoreApply(
  backupData: any, 
  poolOrClient?: any
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  errorStage?: string;
  table?: string;
  statusCode?: number;
  details?: any;
}> {
  // 1. Validate payload before opening transaction
  const validation = validateBackupPayload(backupData);
  if (!validation.valid || validation.errors.length > 0) {
    return {
      success: false,
      statusCode: 400,
      errorStage: 'PREFLIGHT_PAYLOAD',
      error: `Dữ liệu sao lưu không đạt điều kiện khôi phục: ${validation.errors.join('; ')}`
    };
  }

  let client: any = null;
  let shouldRelease = false;

  try {
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

    // 1. Determine whether database is legacy or already canonical
    const preflight = await validateSchemaPreflight(client);
    const isLegacy = preflight.isLegacySchema;
    let safeSchemaName = 'legacy_pre_restore_20261027';
    let movedTables: string[] = [];

    if (isLegacy) {
      const safeSchemaInfo = await determineSafeLegacySchemaName(client, 'legacy_pre_restore_20261027');
      safeSchemaName = safeSchemaInfo.schemaName;
      console.log(`[RestoreApply] Database hiện là legacy. Schema bảo toàn mục tiêu: '${safeSchemaName}' (${safeSchemaInfo.isFallback ? `Đã có ${safeSchemaInfo.existingCount} bảng ở schema cơ sở, tự động tạo schema timestamp duy nhất` : 'Schema cơ sở trống, sử dụng trực tiếp'}).`);
    } else {
      console.log(`[RestoreApply] Database public đã ở chuẩn Canonical. Thực hiện khôi phục idempotent tại chỗ, bảo toàn 100% schema và không tạo schema legacy mới.`);
    }

    await client.query('BEGIN');

    // 2. Phase 1: Move existing public tables to designated legacy preservation schema ONLY if legacy
    if (isLegacy) {
      const preserveResult = await movePublicTablesToLegacySchema(client, safeSchemaName);
      movedTables = preserveResult.movedTables;
      console.log('[RestoreApply]', preserveResult.message);
    }

    // 3. Phase 2: Create canonical schema in public (idempotent CREATE TABLE IF NOT EXISTS)
    const schemaResult = await ensureDatabaseSchema(client);
    if (!schemaResult.success) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 500,
        errorStage: 'SCHEMA_CREATION',
        error: `Không thể tạo schema canonical: ${schemaResult.message}`,
        details: schemaResult.errorDetail
      };
    }

    // 4. Phase 3: Preflight verify new schema
    const postSchemaPreflight = await validateSchemaPreflight(client);
    if (!postSchemaPreflight.compatible) {
      await client.query('ROLLBACK');
      return {
        success: false,
        statusCode: 500,
        errorStage: 'SCHEMA_VERIFICATION',
        error: `Schema public sau khi tạo chưa đạt chuẩn canonical: ${postSchemaPreflight.message}`,
        details: postSchemaPreflight.incompatibleColumns
      };
    }

    const data = backupData.data;

    // Canonical restore must replace the six operational tables exactly.
    // Without this step, rows created after the snapshot (for example login/cleanup logs)
    // remain beside restored rows and make both counts and KPI history incorrect.
    if (!isLegacy) {
      await client.query('DELETE FROM notifications');
      await client.query('DELETE FROM assignments');
      await client.query('DELETE FROM overtimes');
      await client.query('DELETE FROM kpi_results');
      await client.query('DELETE FROM works');
      await client.query('DELETE FROM system_logs');
    }

    // Helper: Parse date or keep null (never fabricate Date.now())
    const toDateOrNull = (val: any): Date | null => {
      if (val === null || val === undefined || val === '') return null;
      if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    // Helper: Zero-safe text
    const toZeroSafeText = (val: any): string | null => {
      if (val === null || val === undefined || val === '') return null;
      if (val === 0 || val === '0') return '0';
      return String(val);
    };

    // 5. Phase 4: Insert records in exact canonical order
    // Table 1: USERS
    for (const u of data.users) {
      await client.query(`
        INSERT INTO users (
          id, uid, name, email, phone, zalo, position, "group", role, status,
          permissions, password, must_change_password, last_login_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          uid = EXCLUDED.uid,
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          zalo = EXCLUDED.zalo,
          position = EXCLUDED.position,
          "group" = EXCLUDED."group",
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          permissions = EXCLUDED.permissions,
          password = EXCLUDED.password,
          must_change_password = EXCLUDED.must_change_password,
          last_login_at = EXCLUDED.last_login_at,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        u.id,
        u.uid || null,
        u.name,
        String(u.email || '').trim(),
        u.phone || null,
        u.zalo || null,
        u.position || 'Chuyên viên',
        u.group || 'Kế hoạch - Tài chính',
        u.role || 'STAFF',
        u.status || 'Đang làm',
        u.permissions ? (typeof u.permissions === 'string' ? u.permissions : JSON.stringify(u.permissions)) : null,
        u.password || null,
        Boolean(u.mustChangePassword ?? u.must_change_password ?? false),
        toDateOrNull(u.lastLoginAt || u.last_login_at),
        toDateOrNull(u.createdAt || u.created_at) || new Date(),
        toDateOrNull(u.updatedAt || u.updated_at) || new Date()
      ]);
    }

    // Table 2: CATEGORIES
    for (const c of data.categories) {
      await client.query(`
        INSERT INTO categories (
          id, code, name, type, properties, status, "order",
          description, parent_id, order_num, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          properties = EXCLUDED.properties,
          status = EXCLUDED.status,
          "order" = EXCLUDED."order",
          description = EXCLUDED.description,
          parent_id = EXCLUDED.parent_id,
          order_num = EXCLUDED.order_num,
          is_active = EXCLUDED.is_active,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        c.id,
        String(c.code || '').trim().toUpperCase(),
        c.name,
        c.type || 'TASK',
        stableCanonicalJson(c.properties || {}),
        c.status || 'Đang áp dụng',
        c.order ?? c.order_num ?? 0,
        c.description || null,
        c.parentId ?? c.parent_id ?? null,
        c.orderNum ?? c.order_num ?? null,
        c.isActive !== undefined ? Boolean(c.isActive) : (c.is_active !== undefined ? Boolean(c.is_active) : true),
        toDateOrNull(c.createdAt || c.created_at) || new Date(),
        toDateOrNull(c.updatedAt || c.updated_at) || new Date()
      ]);
    }

    // Table 3: WORKS
    for (const w of data.works) {
      await client.query(`
        INSERT INTO works (
          id, work_id, month, user_id, task_group, task_name, task_code, detail,
          start_date, start_time, end_date, end_time, actual_end_date, hours, days,
          proposed_nature, approved_nature, coef, base_score, converted_score,
          self_converted_score, approved_converted_score, status, evidence,
          product_type, product_qty, unit, project, related_unit, late_reason,
          penalty_exemption, edit_note, leader_approval, leader_note, approver_id,
          approval_date, source, data_status, sys_note, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22, $23, $24,
          $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35,
          $36, $37, $38, $39, $40, $41
        )
        ON CONFLICT (id) DO UPDATE SET
          work_id = EXCLUDED.work_id,
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
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        w.id,
        String(w.workId || w.work_id || '').trim(),
        w.month,
        w.userId ?? w.user_id,
        w.taskGroup || w.task_group || null,
        w.taskName || w.task_name || null,
        w.taskCode || w.task_code || null,
        w.detail || null,
        toDateOrNull(w.startDate || w.start_date),
        w.startTime || w.start_time || null,
        toDateOrNull(w.endDate || w.end_date),
        w.endTime || w.end_time || null,
        toDateOrNull(w.actualEndDate || w.actual_end_date),
        toZeroSafeText(w.hours),
        w.days !== null && w.days !== undefined ? Number(w.days) : null,
        w.proposedNature || w.proposed_nature || 'Trung bình',
        w.approvedNature || w.approved_nature || null,
        toZeroSafeText(w.coef),
        toZeroSafeText(w.baseScore ?? w.base_score),
        toZeroSafeText(w.convertedScore ?? w.converted_score),
        toZeroSafeText(w.selfConvertedScore ?? w.self_converted_score),
        toZeroSafeText(w.approvedConvertedScore ?? w.approved_converted_score),
        w.status || 'Đang xử lý',
        w.evidence || null,
        w.productType || w.product_type || null,
        w.productQty !== null && w.productQty !== undefined ? Number(w.productQty) : (w.product_qty !== null && w.product_qty !== undefined ? Number(w.product_qty) : null),
        w.unit || null,
        w.project || null,
        w.relatedUnit || w.related_unit || null,
        w.lateReason || w.late_reason || null,
        w.penaltyExemption || w.penalty_exemption || 'Không',
        w.editNote || w.edit_note || null,
        w.leaderApproval || w.leader_approval || 'Chưa duyệt',
        w.leaderNote || w.leader_note || null,
        w.approverId ?? w.approver_id ?? null,
        toDateOrNull(w.approvalDate || w.approval_date),
        w.source || 'WEBAPP',
        w.dataStatus || w.data_status || null,
        w.sysNote || w.sys_note || null,
        toDateOrNull(w.createdAt || w.created_at) || new Date(),
        toDateOrNull(w.updatedAt || w.updated_at) || new Date()
      ]);
    }

    // Table 4: ASSIGNMENTS
    for (const a of data.assignments) {
      await client.query(`
        INSERT INTO assignments (
          id, assignment_id, month, assigner_id, receiver_id, task_group,
          task_name, task_code, base_score, suggested_nature, suggested_coef,
          expected_converted_score, detail, assign_date, start_date, deadline,
          product_required, product_type, product_qty, unit, priority,
          receive_status, view_date, receive_date, work_id, leader_note,
          receiver_note, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26,
          $27, $28, $29
        )
        ON CONFLICT (id) DO UPDATE SET
          assignment_id = EXCLUDED.assignment_id,
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
          assign_date = EXCLUDED.assign_date,
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
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        a.id,
        String(a.assignmentId || a.assignment_id || '').trim(),
        a.month,
        a.assignerId ?? a.assigner_id ?? null,
        a.receiverId ?? a.receiver_id,
        a.taskGroup || a.task_group || null,
        a.taskName || a.task_name || null,
        a.taskCode || a.task_code || null,
        toZeroSafeText(a.baseScore ?? a.base_score),
        a.suggestedNature || a.suggested_nature || null,
        toZeroSafeText(a.suggestedCoef ?? a.suggested_coef),
        toZeroSafeText(a.expectedConvertedScore ?? a.expected_converted_score),
        a.detail || null,
        toDateOrNull(a.assignDate || a.assign_date) || new Date(),
        toDateOrNull(a.startDate || a.start_date),
        toDateOrNull(a.deadline),
        a.productRequired || a.product_required || null,
        a.productType || a.product_type || null,
        a.productQty !== null && a.productQty !== undefined ? Number(a.productQty) : (a.product_qty !== null && a.product_qty !== undefined ? Number(a.product_qty) : null),
        a.unit || null,
        a.priority || 'Bình thường',
        a.receiveStatus || a.receive_status || 'Chưa xem',
        toDateOrNull(a.viewDate || a.view_date),
        toDateOrNull(a.receiveDate || a.receive_date),
        a.workId ?? a.work_id ?? null,
        a.leaderNote || a.leader_note || null,
        a.receiverNote || a.receiver_note || null,
        toDateOrNull(a.createdAt || a.created_at) || new Date(),
        toDateOrNull(a.updatedAt || a.updated_at) || new Date()
      ]);
    }

    // Table 5: OVERTIMES
    for (const o of data.overtimes) {
      await client.query(`
        INSERT INTO overtimes (
          id, ot_id, month, user_id, reg_date, ot_date, start_time, end_time,
          break_minutes, total_reg_hours, content, reason, project, expected_result,
          actual_result, evidence, employee_note, approval_status, approved_hours,
          approver_note, approver_id, approval_date, allow_edit, data_status,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24,
          $25, $26
        )
        ON CONFLICT (id) DO UPDATE SET
          ot_id = EXCLUDED.ot_id,
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
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        o.id,
        String(o.otId || o.ot_id || '').trim(),
        o.month,
        o.userId ?? o.user_id,
        toDateOrNull(o.regDate || o.reg_date) || new Date(),
        toDateOrNull(o.otDate || o.ot_date) || new Date(),
        o.startTime || o.start_time || '17:00',
        o.endTime || o.end_time || '20:30',
        o.breakMinutes !== null && o.breakMinutes !== undefined ? Number(o.breakMinutes) : (o.break_minutes !== null && o.break_minutes !== undefined ? Number(o.break_minutes) : 0),
        toZeroSafeText(o.totalRegHours ?? o.total_reg_hours),
        o.content || null,
        o.reason || null,
        o.project || null,
        o.expectedResult || o.expected_result || null,
        o.actualResult || o.actual_result || null,
        o.evidence || null,
        o.employeeNote || o.employee_note || null,
        o.approvalStatus || o.approval_status || 'Chờ duyệt',
        toZeroSafeText(o.approvedHours ?? o.approved_hours),
        o.approverNote || o.approver_note || null,
        o.approverId ?? o.approver_id ?? null,
        toDateOrNull(o.approvalDate || o.approval_date),
        Boolean(o.allowEdit ?? o.allow_edit ?? false),
        o.dataStatus || o.data_status || null,
        toDateOrNull(o.createdAt || o.created_at) || new Date(),
        toDateOrNull(o.updatedAt || o.updated_at) || new Date()
      ]);
    }

    // Table 6: KPI_RESULTS
    for (const k of data.kpiResults) {
      await client.query(`
        INSERT INTO kpi_results (
          id, kpi_id, month, user_id, a_score, b1_score, b2_score, b3_score,
          b_score, c1_score, c2_score, c_score, d_score, total_kpi, rank,
          registered_works, approved_works, pending_works, supplement_works, rejected_works,
          approved_hours, converted_score, personal_share, warning, locked_status,
          details_a, details_b, details_c, details_d, note, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25,
          $26, $27, $28, $29, $30, $31, $32
        )
        ON CONFLICT (id) DO UPDATE SET
          kpi_id = EXCLUDED.kpi_id,
          month = EXCLUDED.month,
          user_id = EXCLUDED.user_id,
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
          pending_works = EXCLUDED.pending_works,
          supplement_works = EXCLUDED.supplement_works,
          rejected_works = EXCLUDED.rejected_works,
          approved_hours = EXCLUDED.approved_hours,
          converted_score = EXCLUDED.converted_score,
          personal_share = EXCLUDED.personal_share,
          warning = EXCLUDED.warning,
          locked_status = EXCLUDED.locked_status,
          details_a = EXCLUDED.details_a,
          details_b = EXCLUDED.details_b,
          details_c = EXCLUDED.details_c,
          details_d = EXCLUDED.details_d,
          note = EXCLUDED.note,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        k.id,
        String(k.kpiId || k.kpi_id || '').trim(),
        k.month,
        k.userId ?? k.user_id,
        toZeroSafeText(k.aScore ?? k.a_score),
        toZeroSafeText(k.b1Score ?? k.b1_score),
        toZeroSafeText(k.b2Score ?? k.b2_score),
        toZeroSafeText(k.b3Score ?? k.b3_score),
        toZeroSafeText(k.bScore ?? k.b_score),
        toZeroSafeText(k.c1Score ?? k.c1_score),
        toZeroSafeText(k.c2Score ?? k.c2_score),
        toZeroSafeText(k.cScore ?? k.c_score),
        toZeroSafeText(k.dScore ?? k.d_score),
        toZeroSafeText(k.totalKpi ?? k.total_kpi),
        k.rank || 'Chưa chốt',
        k.registeredWorks !== null && k.registeredWorks !== undefined ? Number(k.registeredWorks) : (k.registered_works !== null && k.registered_works !== undefined ? Number(k.registered_works) : 0),
        k.approvedWorks !== null && k.approvedWorks !== undefined ? Number(k.approvedWorks) : (k.approved_works !== null && k.approved_works !== undefined ? Number(k.approved_works) : 0),
        k.pendingWorks !== null && k.pendingWorks !== undefined ? Number(k.pendingWorks) : (k.pending_works !== null && k.pending_works !== undefined ? Number(k.pending_works) : 0),
        k.supplementWorks !== null && k.supplementWorks !== undefined ? Number(k.supplementWorks) : (k.supplement_works !== null && k.supplement_works !== undefined ? Number(k.supplement_works) : 0),
        k.rejectedWorks !== null && k.rejectedWorks !== undefined ? Number(k.rejectedWorks) : (k.rejected_works !== null && k.rejected_works !== undefined ? Number(k.rejected_works) : 0),
        toZeroSafeText(k.approvedHours ?? k.approved_hours),
        toZeroSafeText(k.convertedScore ?? k.converted_score),
        toZeroSafeText(k.personalShare ?? k.personal_share),
        k.warning || null,
        k.lockedStatus || k.locked_status || 'Chưa chốt',
        stableCanonicalJson(k.detailsA ?? k.details_a ?? {}),
        stableCanonicalJson(k.detailsB ?? k.details_b ?? {}),
        stableCanonicalJson(k.detailsC ?? k.details_c ?? {}),
        stableCanonicalJson(k.detailsD ?? k.details_d ?? {}),
        k.note || null,
        toDateOrNull(k.createdAt || k.created_at) || new Date(),
        toDateOrNull(k.updatedAt || k.updated_at) || new Date()
      ]);
    }

    // Table 7: NOTIFICATIONS
    for (const n of data.notifications) {
      await client.query(`
        INSERT INTO notifications (
          id, notify_id, sender_id, receiver_id, type, title, content,
          related_target, status, view_date, note, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          notify_id = EXCLUDED.notify_id,
          sender_id = EXCLUDED.sender_id,
          receiver_id = EXCLUDED.receiver_id,
          type = EXCLUDED.type,
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          related_target = EXCLUDED.related_target,
          status = EXCLUDED.status,
          view_date = EXCLUDED.view_date,
          note = EXCLUDED.note,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        n.id,
        String(n.notifyId || n.notify_id || '').trim(),
        n.senderId ?? n.sender_id ?? null,
        n.receiverId ?? n.receiver_id,
        n.type || 'SYSTEM',
        n.title,
        n.content,
        n.relatedTarget || n.related_target || null,
        n.status || 'Chưa xem',
        toDateOrNull(n.viewDate || n.view_date),
        n.note || null,
        toDateOrNull(n.createdAt || n.created_at) || new Date(),
        toDateOrNull(n.updatedAt || n.updated_at) || new Date()
      ]);
    }

    // Table 8: SYSTEM_LOGS
    for (const l of data.logs) {
      await client.query(`
        INSERT INTO system_logs (
          id, log_id, user_id, action, target, result, note, details, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          log_id = EXCLUDED.log_id,
          user_id = EXCLUDED.user_id,
          action = EXCLUDED.action,
          target = EXCLUDED.target,
          result = EXCLUDED.result,
          note = EXCLUDED.note,
          details = EXCLUDED.details,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        l.id,
        String(l.logId || l.log_id || '').trim(),
        l.userId ?? l.user_id ?? null,
        l.action,
        l.target || null,
        l.result || 'Thành công',
        l.note || null,
        stableCanonicalJson(l.details || {}),
        toDateOrNull(l.createdAt || l.created_at) || new Date(),
        toDateOrNull(l.updatedAt || l.updated_at) || new Date()
      ]);
    }

    // 6. Phase 5: Reset PostgreSQL serial sequences
    const sequenceTables = ['users', 'categories', 'works', 'assignments', 'overtimes', 'kpi_results', 'notifications', 'system_logs'];
    for (const tName of sequenceTables) {
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence($1, 'id'), 
          COALESCE((SELECT MAX(id) FROM ${tName}), 1), 
          (SELECT COUNT(*) > 0 FROM ${tName})
        )
      `, [tName]);
    }

    // 7. Phase 6: HẬU KIỂM TRƯỚC COMMIT (Pre-Commit Verification)
    // 7.1. Check exact row counts
    const tableSourceCounts: Record<string, number> = {
      users: data.users.length,
      categories: data.categories.length,
      works: data.works.length,
      assignments: data.assignments.length,
      overtimes: data.overtimes.length,
      kpi_results: data.kpiResults.length,
      notifications: data.notifications.length,
      system_logs: data.logs.length
    };

    for (const [tbl, expectedCount] of Object.entries(tableSourceCounts)) {
      const countRes = await client.query(`SELECT COUNT(*)::int AS count FROM "${tbl}"`);
      const actualCount = countRes.rows[0]?.count || 0;
      if (actualCount !== expectedCount) {
        throw new Error(`[PreCommitVerification] Sai lệch số lượng tại bảng ${tbl}: DB=${actualCount}, Nguồn=${expectedCount}`);
      }
    }

    // 7.2. Check Foreign Key Integrity in Database
    const fkChecks = [
      { table: 'works', query: 'SELECT COUNT(*)::int AS count FROM works WHERE user_id NOT IN (SELECT id FROM users)' },
      { table: 'assignments', query: 'SELECT COUNT(*)::int AS count FROM assignments WHERE receiver_id NOT IN (SELECT id FROM users)' },
      { table: 'overtimes', query: 'SELECT COUNT(*)::int AS count FROM overtimes WHERE user_id NOT IN (SELECT id FROM users)' },
      { table: 'kpi_results', query: 'SELECT COUNT(*)::int AS count FROM kpi_results WHERE user_id NOT IN (SELECT id FROM users)' },
      { table: 'notifications', query: 'SELECT COUNT(*)::int AS count FROM notifications WHERE receiver_id NOT IN (SELECT id FROM users)' }
    ];

    for (const fk of fkChecks) {
      const fkRes = await client.query(fk.query);
      const orphanCount = fkRes.rows[0]?.count || 0;
      if (orphanCount > 0) {
        throw new Error(`[PreCommitVerification] Ràng buộc khóa ngoại bị vi phạm tại bảng ${fk.table}: có ${orphanCount} bản ghi mồ côi.`);
      }
    }

    // 7.3. Record-level Canonical Hash Verification
    for (const [tbl, sourceList] of [
      ['users', data.users],
      ['categories', data.categories],
      ['works', data.works],
      ['assignments', data.assignments],
      ['overtimes', data.overtimes],
      ['kpi_results', data.kpiResults],
      ['notifications', data.notifications],
      ['system_logs', data.logs]
    ] as const) {
      const dbRowsRes = await client.query(`SELECT * FROM "${tbl}" ORDER BY id ASC`);
      const dbRows = dbRowsRes.rows;
      if (dbRows.length !== sourceList.length) {
        throw new Error(`[PreCommitVerification] Số lượng dòng đọc lại từ ${tbl} (${dbRows.length}) khác nguồn (${sourceList.length}).`);
      }

      const srcMap = new Map<number, any>();
      for (const src of sourceList) {
        srcMap.set(Number(src.id), src);
      }

      for (const dbRow of dbRows) {
        const srcRow = srcMap.get(Number(dbRow.id));
        if (!srcRow) {
          throw new Error(`[PreCommitVerification] Không tìm thấy bản ghi nguồn tương ứng với DB row ID=${dbRow.id} trong bảng ${tbl}.`);
        }
        const dbHash = computeCanonicalBackupRowHash(tbl, dbRow);
        const srcHash = computeCanonicalBackupRowHash(tbl, srcRow);
        if (dbHash !== srcHash) {
          throw new Error(`[PreCommitVerification] Sai lệch hash tại bảng ${tbl}, dòng ID=${dbRow.id}. Dữ liệu ghi không khớp với nguồn!`);
        }
      }
    }

    // 7.4. Explicit Pre-Commit Verification of User ID 14 and User ID 27
    const u14Res = await client.query(`SELECT id, email, name, role FROM users WHERE id = 14`);
    const u27Res = await client.query(`SELECT id, email, name, role FROM users WHERE id = 27`);
    if (u14Res.rows.length !== 1 || u27Res.rows.length !== 1) {
      throw new Error(`[PreCommitVerification] Thiếu User ID 14 hoặc User ID 27 trong bảng users (ID 14 tồn tại: ${u14Res.rows.length}, ID 27 tồn tại: ${u27Res.rows.length}).`);
    }
    const dbEmail14 = u14Res.rows[0]?.email;
    const dbEmail27 = u27Res.rows[0]?.email;
    if (dbEmail14 !== 'LTTNVN248@gmail.com' || dbEmail27 !== 'lttnvn248@gmail.com') {
      throw new Error(`[PreCommitVerification] Sai lệch email của User 14 hoặc 27: user14='${dbEmail14}' (mong đợi 'LTTNVN248@gmail.com'), user27='${dbEmail27}' (mong đợi 'lttnvn248@gmail.com').`);
    }

    // Verify all child references for User ID 27 in DB
    const w27Res = await client.query(`SELECT COUNT(*)::int AS count FROM works WHERE user_id = 27`);
    const a27Res = await client.query(`SELECT COUNT(*)::int AS count FROM assignments WHERE receiver_id = 27`);
    const o27Res = await client.query(`SELECT COUNT(*)::int AS count FROM overtimes WHERE user_id = 27`);
    const k27Res = await client.query(`SELECT COUNT(*)::int AS count FROM kpi_results WHERE user_id = 27`);
    const n27Res = await client.query(`SELECT COUNT(*)::int AS count FROM notifications WHERE receiver_id = 27`);

    const w27Count = w27Res.rows[0]?.count || 0;
    const a27Count = a27Res.rows[0]?.count || 0;
    const o27Count = o27Res.rows[0]?.count || 0;
    const k27Count = k27Res.rows[0]?.count || 0;
    const n27Count = n27Res.rows[0]?.count || 0;

    if (w27Count !== 51 || a27Count !== 4 || o27Count !== 11 || k27Count !== 6 || n27Count !== 43) {
      throw new Error(`[PreCommitVerification] Sai lệch số lượng tham chiếu đến User ID 27: works=${w27Count} (mong đợi 51), assignments=${a27Count} (mong đợi 4), overtimes=${o27Count} (mong đợi 11), kpiResults=${k27Count} (mong đợi 6), notifications=${n27Count} (mong đợi 43).`);
    }

    // 7.5. Technical Duplicates Check in Database
    const duplicateQueries = [
      { table: 'users', query: `SELECT email AS key, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1` },
      { table: 'categories', query: `SELECT code AS key, COUNT(*) FROM categories GROUP BY code HAVING COUNT(*) > 1` },
      { table: 'works', query: `SELECT work_id AS key, COUNT(*) FROM works GROUP BY work_id HAVING COUNT(*) > 1` },
      { table: 'assignments', query: `SELECT assignment_id AS key, COUNT(*) FROM assignments GROUP BY assignment_id HAVING COUNT(*) > 1` },
      { table: 'overtimes', query: `SELECT ot_id AS key, COUNT(*) FROM overtimes GROUP BY ot_id HAVING COUNT(*) > 1` },
      { table: 'kpi_results', query: `SELECT kpi_id AS key, COUNT(*) FROM kpi_results GROUP BY kpi_id HAVING COUNT(*) > 1` },
      { table: 'notifications', query: `SELECT notify_id AS key, COUNT(*) FROM notifications GROUP BY notify_id HAVING COUNT(*) > 1` },
      { table: 'system_logs', query: `SELECT log_id AS key, COUNT(*) FROM system_logs GROUP BY log_id HAVING COUNT(*) > 1` }
    ];

    for (const dup of duplicateQueries) {
      const dupRes = await client.query(dup.query);
      if (dupRes.rows.length > 0) {
        throw new Error(`[PreCommitVerification] Phát hiện ${dupRes.rows.length} khóa kỹ thuật trùng lặp trong CSDL tại bảng ${dup.table}.`);
      }
    }

    // 7.6. KPI Scores, Zero/Null & Formula Verification in Database
    const dbKpiAllRes = await client.query(`SELECT kpi_id, a_score, b_score, c_score, d_score, total_kpi, rank, locked_status FROM kpi_results`);
    for (const k of dbKpiAllRes.rows) {
      const a = k.a_score !== null && k.a_score !== undefined && k.a_score !== '' ? Number(k.a_score) : 0;
      const b = k.b_score !== null && k.b_score !== undefined && k.b_score !== '' ? Number(k.b_score) : 0;
      const c = k.c_score !== null && k.c_score !== undefined && k.c_score !== '' ? Number(k.c_score) : 0;
      const d = k.d_score !== null && k.d_score !== undefined && k.d_score !== '' ? Number(k.d_score) : 0;
      const stored = k.total_kpi !== null && k.total_kpi !== undefined && k.total_kpi !== '' ? Number(k.total_kpi) : null;

      if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d) || (stored !== null && isNaN(stored))) {
        throw new Error(`[PreCommitVerification] Bản ghi KPI ${k.kpi_id} có giá trị NaN bất thường trong DB.`);
      }

      const computed = Math.min(100, Math.max(0, a + b + c - d));
      const rank = String(k.rank || '').trim();
      const lockedStatus = String(k.locked_status || '').trim();

      if (rank !== 'Chưa chốt' && rank !== 'Chờ duyệt' && lockedStatus !== 'Chưa chốt') {
        if (stored === null || Math.abs(stored - computed) > 0.05) {
          throw new Error(`[PreCommitVerification] Sai lệch công thức KPI tại ${k.kpi_id}: lưu=${stored}, tính=${computed}.`);
        }
      }
    }

    // 8. Phase 7: COMMIT TRANSACTION
    await client.query('COMMIT');

    const preservationMessage = isLegacy
      ? `Đã bảo toàn các bảng trước đây sang schema '${safeSchemaName}'.`
      : 'Schema canonical hiện hữu được giữ nguyên.';
    const successMessage = `Khôi phục thành công 100% dữ liệu: ${data.users.length} nhân sự, ${data.categories.length} danh mục, ${data.works.length} công việc, ${data.assignments.length} phân công, ${data.overtimes.length} ca làm thêm, ${data.kpiResults.length} KPI, ${data.notifications.length} thông báo và ${data.logs.length} nhật ký. ${preservationMessage}`;

    return {
      success: true,
      statusCode: 200,
      message: successMessage,
      details: {
        applied: true,
        preservationSchema: isLegacy ? safeSchemaName : null,
        preservedTables: movedTables,
        restoredCounts: tableSourceCounts,
        user14: { id: 14, email: dbEmail14 },
        user27: {
          id: 27,
          email: dbEmail27,
          references: {
            works: w27Count,
            assignments: a27Count,
            overtimes: o27Count,
            kpiResults: k27Count,
            notifications: n27Count
          }
        }
      }
    };
  } catch (err: any) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {}
    }
    console.error('[RestoreApply] Transaction failed and rolled back:', err?.message || String(err));
    return {
      success: false,
      statusCode: 500,
      errorStage: 'RESTORE_TRANSACTION',
      error: `Giao dịch khôi phục thất bại và đã rollback toàn bộ: ${err?.message || String(err)}`
    };
  } finally {
    if (shouldRelease && client) {
      try {
        client.release();
      } catch {}
    }
  }
}

/**
 * Restore system data from a backup snapshot (Unified Two-Phase Entrypoint)
 * Defaults to 'dry-run' mode for safety.
 */
export async function restoreFromBackup(
  backupData: any,
  options?: { mode?: 'dry-run' | 'apply'; poolOrClient?: any; adminUser?: any }
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  errorStage?: string;
  table?: string;
  statusCode?: number;
  details?: any;
}> {
  const mode = options?.mode || 'dry-run';

  if (mode === 'dry-run') {
    const dryRunResult = await runRestoreDryRun(backupData, options?.poolOrClient);
    return {
      success: dryRunResult.success,
      statusCode: dryRunResult.success ? 200 : 400,
      message: dryRunResult.message,
      error: dryRunResult.readyToApply ? undefined : dryRunResult.message,
      errorStage: 'DRY_RUN',
      details: dryRunResult
    };
  }

  // mode === 'apply'
  return await executeRestoreApply(backupData, options?.poolOrClient);
}


/**
 * Background runner checking schedule every minute
 */
let schedulerInterval: any = null;

export function startBackupScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Check every 60 seconds
  schedulerInterval = setInterval(async () => {
    try {
      const config = await getEffectiveBackupConfigAsync();
      if (!config.enabled) return;

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const currentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      if (config.frequency === 'daily') {
        const targetTime = config.dailyTime || '23:30';
        if (currentTimeStr === targetTime) {
          // Check if already backed up in last 5 minutes to prevent duplicate
          const lastBackup = config.lastBackupAt ? new Date(config.lastBackupAt) : null;
          const diffMs = lastBackup ? now.getTime() - lastBackup.getTime() : 99999999;
          if (diffMs > 120000) {
            console.log(`[BackupScheduler] Triggering scheduled daily backup at ${currentTimeStr}...`);
            await performBackup('auto_scheduled');
          }
        }
      } else if (config.frequency === 'hourly') {
        if (now.getMinutes() === 0) {
          const lastBackup = config.lastBackupAt ? new Date(config.lastBackupAt) : null;
          const diffMs = lastBackup ? now.getTime() - lastBackup.getTime() : 99999999;
          if (diffMs > 120000) {
            console.log(`[BackupScheduler] Triggering scheduled hourly backup at ${currentTimeStr}...`);
            await performBackup('auto_scheduled');
          }
        }
      } else if (config.frequency === 'weekly') {
        const targetDay = config.weeklyDay ?? 0; // 0 = Sunday
        const targetTime = config.dailyTime || '23:30';
        if (now.getDay() === targetDay && currentTimeStr === targetTime) {
          const lastBackup = config.lastBackupAt ? new Date(config.lastBackupAt) : null;
          const diffMs = lastBackup ? now.getTime() - lastBackup.getTime() : 99999999;
          if (diffMs > 120000) {
            console.log(`[BackupScheduler] Triggering scheduled weekly backup on day ${targetDay} at ${currentTimeStr}...`);
            await performBackup('auto_scheduled');
          }
        }
      }
    } catch (err) {
      console.error('[BackupScheduler] Error running background schedule check:', err);
    }
  }, 60000);

  console.log('[BackupScheduler] Backup Scheduler service initialized successfully.');
}
