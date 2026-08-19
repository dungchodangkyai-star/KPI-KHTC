import fs from 'fs';
import path from 'path';
import { db } from '../src/db/index.ts';
import { users, works, assignments, overtimes, categories, kpiResults, notifications, systemLogs } from '../src/db/schema.ts';

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'hourly' | 'weekly';
  dailyTime: string; // e.g. "23:30"
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

    // 1. Fetch all data from database
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
      db.query.users.findMany(),
      db.query.works.findMany(),
      db.query.assignments.findMany(),
      db.query.overtimes.findMany(),
      db.query.categories.findMany(),
      db.query.kpiResults.findMany(),
      db.query.notifications.findMany(),
      db.query.systemLogs.findMany()
    ]);

    const timestamp = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(timestamp.getDate())}_${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
    const id = `backup_${dateStr}`;
    const filename = `${id}.json`;
    const filePath = path.join(BACKUP_DIR, filename);

    const backupPayload = {
      version: '2.0',
      system: 'PMO1 Task & KPI Management',
      createdAt: timestamp.toISOString(),
      triggerType,
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
      recordCounts: {
        users: allUsers.length,
        works: allWorks.length,
        assignments: allAssignments.length,
        overtimes: allOvertimes.length,
        categories: allCategories.length
      },
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
    const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

    const res = await fetch(offsiteConfig.destinationUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      redirect: 'follow', // Follow Google Web App 302 redirects
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      return { success: true, message: `Đã lưu vào Google Drive thành công (HTTP ${res.status})` };
    } else {
      const txt = await res.text().catch(() => '');
      return { success: false, message: `Ngoại vi trả về HTTP ${res.status}: ${txt.slice(0, 100)}` };
    }
  } catch (e: any) {
    return { success: false, message: `Không thể kết nối đến Webhook Google Drive: ${e?.message || String(e)}` };
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
            categories: parsed.data?.categories?.length || 0
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
}> {
  try {
    if (!backupData || !backupData.data) {
      return { success: false, error: 'Dữ liệu file sao lưu không hợp lệ hoặc thiếu cấu trúc data.' };
    }

    const { users: bUsers, works: bWorks, assignments: bAssignments, overtimes: bOvertimes, categories: bCategories } = backupData.data;

    // 1. Restore Categories
    if (Array.isArray(bCategories) && bCategories.length > 0) {
      for (const cat of bCategories) {
        await db.insert(categories).values(cat).onConflictDoNothing();
      }
    }

    // 2. Restore Users
    if (Array.isArray(bUsers) && bUsers.length > 0) {
      for (const u of bUsers) {
        await db.insert(users).values({
          ...u,
          updatedAt: new Date()
        }).onConflictDoUpdate({
          target: users.email,
          set: {
            name: u.name,
            phone: u.phone,
            zalo: u.zalo,
            position: u.position,
            group: u.group,
            role: u.role,
            status: u.status,
            permissions: u.permissions,
            updatedAt: new Date()
          }
        });
      }
    }

    // 3. Restore Works
    if (Array.isArray(bWorks) && bWorks.length > 0) {
      for (const w of bWorks) {
        await db.insert(works).values({
          ...w,
          startDate: w.startDate ? new Date(w.startDate) : null,
          endDate: w.endDate ? new Date(w.endDate) : null,
          actualEndDate: w.actualEndDate ? new Date(w.actualEndDate) : null,
          approvalDate: w.approvalDate ? new Date(w.approvalDate) : null,
          createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
          updatedAt: new Date()
        }).onConflictDoNothing();
      }
    }

    // 4. Restore Assignments
    if (Array.isArray(bAssignments) && bAssignments.length > 0) {
      for (const a of bAssignments) {
        await db.insert(assignments).values({
          ...a,
          assignedDate: a.assignedDate ? new Date(a.assignedDate) : new Date(),
          deadline: a.deadline ? new Date(a.deadline) : null,
          completedDate: a.completedDate ? new Date(a.completedDate) : null,
          createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
          updatedAt: new Date()
        }).onConflictDoNothing();
      }
    }

    // 5. Restore Overtimes
    if (Array.isArray(bOvertimes) && bOvertimes.length > 0) {
      for (const ot of bOvertimes) {
        await db.insert(overtimes).values({
          ...ot,
          date: ot.date ? new Date(ot.date) : new Date(),
          approvalDate: ot.approvalDate ? new Date(ot.approvalDate) : null,
          createdAt: ot.createdAt ? new Date(ot.createdAt) : new Date(),
          updatedAt: new Date()
        }).onConflictDoNothing();
      }
    }

    return {
      success: true,
      message: `Khôi phục thành công! Đã phục hồi ${bWorks?.length || 0} công việc, ${bUsers?.length || 0} nhân sự, ${bAssignments?.length || 0} phân công.`
    };
  } catch (e: any) {
    console.error('Error restoring backup:', e);
    return { success: false, error: e?.message || String(e) };
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
      }
    } catch (err) {
      console.error('[BackupScheduler] Error running background schedule check:', err);
    }
  }, 60000);

  console.log('[BackupScheduler] Backup Scheduler service initialized successfully.');
}
