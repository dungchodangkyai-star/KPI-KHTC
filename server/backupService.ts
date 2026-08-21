import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import { users, works, assignments, overtimes, categories, kpiResults, notifications, systemLogs } from '../src/db/schema.ts';
import { ensureDatabaseSchema } from './dbMigrate.ts';

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

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getBackupConfig(): BackupScheduleConfig {
  try {
    ensureDir(path.dirname(CONFIG_FILE));
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_BACKUP_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Error reading backup config:', e);
  }
  return DEFAULT_BACKUP_CONFIG;
}

export function saveBackupConfig(cfg: Partial<BackupScheduleConfig>): BackupScheduleConfig {
  const current = getBackupConfig();
  const updated: BackupScheduleConfig = {
    ...current,
    ...cfg,
    offsite: {
      ...current.offsite,
      ...(cfg.offsite || {})
    }
  };
  try {
    ensureDir(path.dirname(CONFIG_FILE));
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving backup config:', e);
  }
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
    const config = getBackupConfig();
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
    saveBackupConfig({
      lastBackupAt: timestamp.toISOString(),
      lastBackupStatus: 'success',
      lastBackupMessage: `Sao lưu thành công ${allWorks.length} công việc, ${allUsers.length} nhân sự (${(stats.size / 1024).toFixed(1)} KB)${offsiteResultText}`
    });

    return { success: true, metadata };
  } catch (error: any) {
    console.error('Error performing backup:', error);
    saveBackupConfig({
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
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

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

    if (res.ok) {
      let extra = '';
      try {
        const bodyRes = await res.json();
        if (bodyRes?.message) extra = ` (${bodyRes.message})`;
      } catch {}
      return { success: true, message: `Đã đẩy lên ${pName} thành công (HTTP ${res.status})${extra}` };
    } else {
      const txt = await res.text().catch(() => '');
      return { success: false, message: `${pName} trả về HTTP ${res.status}: ${txt.slice(0, 120)}` };
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
    const config = getBackupConfig();
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
 * Get raw backup content for download or restore
 */
export function getBackupContent(filename: string): any {
  const safeName = path.basename(filename);
  const target = path.join(BACKUP_DIR, safeName);
  if (fs.existsSync(target)) {
    const raw = fs.readFileSync(target, 'utf-8');
    return JSON.parse(raw);
  }
  return null;
}

/**
 * Restore system data from a backup snapshot
 */
export async function restoreFromBackup(backupData: any): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  statusCode?: number;
}> {
  const groups = ['users', 'categories', 'works', 'assignments', 'overtimes', 'kpiResults', 'notifications', 'logs'] as const;
  const isObject = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);

  if (!isObject(backupData)) {
    return { success: false, statusCode: 400, error: 'Dữ liệu sao lưu phải là một đối tượng JSON.' };
  }

  let payloadBytes = 0;
  try {
    payloadBytes = Buffer.byteLength(JSON.stringify(backupData), 'utf8');
  } catch {
    return { success: false, statusCode: 400, error: 'Dữ liệu sao lưu không thể chuyển thành JSON hợp lệ.' };
  }
  if (payloadBytes > 25 * 1024 * 1024) {
    return { success: false, statusCode: 413, error: 'File sao lưu vượt giới hạn 25 MB.' };
  }

  const version = String(backupData.formatVersion || backupData.version || '');
  if (version !== '2.0' && version !== '2.1') {
    return { success: false, statusCode: 400, error: 'Phiên bản sao lưu không được hỗ trợ: ' + (version || 'không xác định') };
  }
  if (!isObject(backupData.data)) {
    return { success: false, statusCode: 400, error: 'File sao lưu thiếu đối tượng data.' };
  }

  const requiredKeys: Record<string, string[]> = {
    users: ['name', 'email'],
    categories: ['code', 'name', 'type'],
    works: ['workId', 'month', 'userId'],
    assignments: ['assignmentId', 'month', 'assignerId', 'receiverId'],
    overtimes: ['otId', 'month', 'userId', 'otDate'],
    kpiResults: ['kpiId', 'month', 'userId'],
    notifications: ['notifyId', 'receiverId'],
    logs: ['logId']
  };

  for (const group of groups) {
    const rows = backupData.data[group];
    if (!Array.isArray(rows)) {
      return { success: false, statusCode: 400, error: 'Thiếu nhóm bắt buộc hoặc sai kiểu: data.' + group };
    }
    for (let index = 0; index < rows.length; index++) {
      if (!isObject(rows[index])) {
        return { success: false, statusCode: 400, error: 'Bản ghi data.' + group + '[' + index + '] không hợp lệ.' };
      }
      for (const key of requiredKeys[group]) {
        const value = rows[index][key];
        if (value === undefined || value === null || value === '') {
          return { success: false, statusCode: 400, error: 'Bản ghi data.' + group + '[' + index + '] thiếu ' + key };
        }
      }
    }
  }

  if (isObject(backupData.counts)) {
    for (const group of groups) {
      if (backupData.counts[group] !== undefined &&
          Number(backupData.counts[group]) !== backupData.data[group].length) {
        return { success: false, statusCode: 400, error: 'Số lượng metadata của ' + group + ' không khớp nội dung.' };
      }
    }
  }

  const normalizeDates = (row: any, fields: string[]) => {
    const normalized = { ...row };
    for (const field of fields) {
      if (normalized[field] === null || normalized[field] === undefined || normalized[field] === '') {
        normalized[field] = null;
        continue;
      }
      const parsed = normalized[field] instanceof Date ? normalized[field] : new Date(normalized[field]);
      if (Number.isNaN(parsed.getTime())) throw new Error('Ngày không hợp lệ tại trường ' + field);
      normalized[field] = parsed;
    }
    return normalized;
  };

  const upsertRows = async (
    tx: any,
    table: any,
    rows: any[],
    conflictTarget: any,
    uniqueKey: string,
    dateFields: string[] = []
  ) => {
    for (const sourceRow of rows) {
      const row = normalizeDates(sourceRow, dateFields);
      const updateValues = { ...row };
      delete updateValues.id;
      delete updateValues[uniqueKey];
      await tx.insert(table).values(row).onConflictDoUpdate({
        target: conflictTarget,
        set: updateValues
      });
    }
  };

  try {
    try {
      await ensureDatabaseSchema();
    } catch (e) {
      console.warn('Database schema sync check during restore:', e);
    }

    const data = backupData.data;
    await db.transaction(async (tx) => {
      await upsertRows(tx, categories, data.categories, categories.code, 'code', ['createdAt', 'updatedAt']);
      await upsertRows(tx, users, data.users, users.email, 'email', ['lastLoginAt', 'createdAt', 'updatedAt']);
      await upsertRows(tx, works, data.works, works.workId, 'workId',
        ['startDate', 'endDate', 'actualEndDate', 'approvalDate', 'createdAt', 'updatedAt']);
      await upsertRows(tx, assignments, data.assignments, assignments.assignmentId, 'assignmentId',
        ['assignDate', 'startDate', 'deadline', 'viewDate', 'receiveDate', 'createdAt', 'updatedAt']);
      await upsertRows(tx, overtimes, data.overtimes, overtimes.otId, 'otId',
        ['regDate', 'otDate', 'approvalDate', 'createdAt', 'updatedAt']);
      await upsertRows(tx, kpiResults, data.kpiResults, kpiResults.kpiId, 'kpiId', ['createdAt', 'updatedAt']);
      await upsertRows(tx, notifications, data.notifications, notifications.notifyId, 'notifyId', ['createdAt', 'viewDate', 'updatedAt']);
      await upsertRows(tx, systemLogs, data.logs, systemLogs.logId, 'logId', ['createdAt', 'updatedAt']);

      const sequenceTables = ['users', 'categories', 'works', 'assignments', 'overtimes', 'kpi_results', 'notifications', 'system_logs'];
      for (const tableName of sequenceTables) {
        const statement = "SELECT setval(pg_get_serial_sequence('" + tableName +
          "', 'id'), COALESCE((SELECT MAX(id) FROM " + tableName +
          "), 1), (SELECT COUNT(*) > 0 FROM " + tableName + "))";
        await tx.execute(sql.raw(statement));
      }
    });

    return {
      success: true,
      message: 'Khôi phục giao dịch thành công: ' +
        data.users.length + ' nhân sự, ' +
        data.works.length + ' công việc, ' +
        data.assignments.length + ' phân công, ' +
        data.overtimes.length + ' làm thêm, ' +
        data.categories.length + ' danh mục, ' +
        data.kpiResults.length + ' KPI, ' +
        data.notifications.length + ' thông báo và ' +
        data.logs.length + ' nhật ký.'
    };
  } catch (e: any) {
    console.error('Restore transaction rolled back:', e);
    return {
      success: false,
      statusCode: 500,
      error: 'Khôi phục thất bại; toàn bộ giao dịch đã rollback: ' + (e?.message || String(e))
    };
  }
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
      const config = getBackupConfig();
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
