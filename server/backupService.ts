import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
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

    // Read all tables from one consistent, read-only snapshot.
    const [
      allUsers, allWorks, allAssignments, allOvertimes,
      allCategories, allKpiResults, allNotifications, allLogs
    ] = await db.transaction(async (tx) => {
      await tx.execute(sql.raw('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'));
      return Promise.all([
        tx.query.users.findMany(), tx.query.works.findMany(),
        tx.query.assignments.findMany(), tx.query.overtimes.findMany(),
        tx.query.categories.findMany(), tx.query.kpiResults.findMany(),
        tx.query.notifications.findMany(), tx.query.systemLogs.findMany()
      ]);
    });

    const timestamp = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(timestamp.getDate())}_${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
    const id = `backup_${dateStr}`;
    const filename = `${id}.json`;
    const filePath = path.join(BACKUP_DIR, filename);

    const recordCounts = {
      users: allUsers.length, works: allWorks.length,
      assignments: allAssignments.length, overtimes: allOvertimes.length,
      categories: allCategories.length, kpiResults: allKpiResults.length,
      notifications: allNotifications.length, logs: allLogs.length
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
  success: boolean; message?: string; error?: string; statusCode?: number;
}> {
  const groups = ['users','categories','works','assignments','overtimes','kpiResults','notifications','logs'] as const;
  const object = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
  if (!object(backupData)) return { success:false, statusCode:400, error:'Dữ liệu sao lưu phải là JSON object.' };

  let bytes = 0;
  try { bytes = Buffer.byteLength(JSON.stringify(backupData), 'utf8'); }
  catch { return { success:false, statusCode:400, error:'JSON sao lưu không hợp lệ.' }; }
  if (bytes > 25 * 1024 * 1024) return { success:false, statusCode:413, error:'File sao lưu vượt giới hạn 25 MB.' };

  const version = String(backupData.formatVersion || backupData.version || '');
  if (version !== '2.0' && version !== '2.1')
    return { success:false, statusCode:400, error:'Phiên bản sao lưu không được hỗ trợ: ' + (version || 'không xác định') };
  if (!object(backupData.data)) return { success:false, statusCode:400, error:'File sao lưu thiếu data.' };

  const keys: Record<string,string[]> = {
    users:['id','name','email'], categories:['id','code','name','type'], works:['id','workId','month','userId'],
    assignments:['id','assignmentId','month','assignerId','receiverId'], overtimes:['id','otId','month','userId','otDate'],
    kpiResults:['id','kpiId','month','userId'], notifications:['id','notifyId','receiverId'], logs:['id','logId']
  };
  for (const group of groups) {
    const rows = backupData.data[group];
    if (!Array.isArray(rows)) return { success:false, statusCode:400, error:'Thiếu hoặc sai kiểu data.' + group };
    for (let i=0;i<rows.length;i++) {
      if (!object(rows[i])) return { success:false, statusCode:400, error:'Bản ghi ' + group + '[' + i + '] không hợp lệ.' };
      for (const key of keys[group]) {
        if (rows[i][key] === undefined || rows[i][key] === null || rows[i][key] === '')
          return { success:false, statusCode:400, error:'Bản ghi ' + group + '[' + i + '] thiếu ' + key };
      }
    }
    if (object(backupData.counts) && backupData.counts[group] !== undefined &&
        Number(backupData.counts[group]) !== rows.length)
      return { success:false, statusCode:400, error:'Metadata count của ' + group + ' không khớp.' };
  }

  // Validate primary/natural keys and foreign-key references before opening a write transaction.
  const validationErrors: string[] = [];
  const unique = (group: typeof groups[number], field: string) => {
    const seen = new Set<string>();
    for (const row of backupData.data[group]) {
      const value = String(row[field]);
      if (seen.has(value)) validationErrors.push('Trùng ' + group + '.' + field + ': ' + value);
      seen.add(value);
    }
  };
  for (const group of groups) unique(group, 'id');
  unique('users','email'); unique('categories','code'); unique('works','workId');
  unique('assignments','assignmentId'); unique('overtimes','otId'); unique('kpiResults','kpiId');
  unique('notifications','notifyId'); unique('logs','logId');

  for (const group of groups) {
    for (const row of backupData.data[group]) {
      const id = Number(row.id);
      if (!Number.isInteger(id) || id <= 0) validationErrors.push(group + '.id không hợp lệ: ' + row.id);
    }
  }

  const ids = (group: typeof groups[number]) =>
    new Set<number>(backupData.data[group].map((row:any) => Number(row.id)));
  const userIds = ids('users');
  const workIds = ids('works');
  const foreignKey = (group: typeof groups[number], field: string, validIds: Set<number>, optional=false) => {
    for (const row of backupData.data[group]) {
      const value = row[field];
      if (optional && (value === null || value === undefined || value === '')) continue;
      const id = Number(value);
      if (!Number.isInteger(id) || !validIds.has(id))
        validationErrors.push(group + '.' + field + ' tham chiếu mã không tồn tại: ' + value);
    }
  };
  foreignKey('works','userId',userIds);
  foreignKey('works','approverId',userIds,true);
  foreignKey('assignments','assignerId',userIds);
  foreignKey('assignments','receiverId',userIds);
  foreignKey('assignments','workId',workIds,true);
  foreignKey('overtimes','userId',userIds);
  foreignKey('overtimes','approverId',userIds,true);
  foreignKey('kpiResults','userId',userIds);
  foreignKey('notifications','senderId',userIds,true);
  foreignKey('notifications','receiverId',userIds);
  foreignKey('logs','userId',userIds,true);

  if (validationErrors.length) {
    return {
      success:false,
      statusCode:400,
      error:'File sao lưu không toàn vẹn: ' + validationErrors.slice(0,10).join('; ') +
        (validationErrors.length > 10 ? '; và ' + (validationErrors.length - 10) + ' lỗi khác.' : '')
    };
  }

  const dates = (source:any, fields:string[]) => {
    const row={...source};
    for(const field of fields) {
      if(row[field]===null || row[field]===undefined || row[field]==='') { row[field]=null; continue; }
      const d=row[field] instanceof Date ? row[field] : new Date(row[field]);
      if(Number.isNaN(d.getTime())) throw new Error('Ngày không hợp lệ tại ' + field);
      row[field]=d;
    }
    return row;
  };
  const upsert = async(tx:any, table:any, rows:any[], target:any, unique:string, fields:string[]=[]) => {
    for(const source of rows) {
      const row=dates(source,fields), set={...row};
      delete set.id; delete set[unique];
      await tx.insert(table).values(row).onConflictDoUpdate({target,set});
    }
  };

  try {
    const d=backupData.data;
    await db.transaction(async(tx)=>{
      await upsert(tx,categories,d.categories,categories.code,'code');
      await upsert(tx,users,d.users,users.email,'email',['lastLoginAt','createdAt','updatedAt']);
      await upsert(tx,works,d.works,works.workId,'workId',['startDate','endDate','actualEndDate','approvalDate','createdAt','updatedAt']);
      await upsert(tx,assignments,d.assignments,assignments.assignmentId,'assignmentId',['assignDate','startDate','deadline','viewDate','receiveDate','updatedAt']);
      await upsert(tx,overtimes,d.overtimes,overtimes.otId,'otId',['regDate','otDate','approvalDate','updatedAt']);
      await upsert(tx,kpiResults,d.kpiResults,kpiResults.kpiId,'kpiId',['updatedAt']);
      await upsert(tx,notifications,d.notifications,notifications.notifyId,'notifyId',['createdAt','viewDate']);
      await upsert(tx,systemLogs,d.logs,systemLogs.logId,'logId',['createdAt']);

      const tables=['users','categories','works','assignments','overtimes','kpi_results','notifications','system_logs'];
      for(const name of tables) {
        const q="SELECT setval(pg_get_serial_sequence('" + name + "','id'),COALESCE((SELECT MAX(id) FROM " + name + "),1),(SELECT COUNT(*)>0 FROM " + name + "))";
        await tx.execute(sql.raw(q));
      }
    });
    return {success:true,message:'Khôi phục giao dịch thành công đủ 8 nhóm dữ liệu.'};
  } catch(e:any) {
    console.error('Restore transaction rolled back:',e);
    return {success:false,statusCode:500,error:'Khôi phục thất bại; toàn bộ giao dịch đã rollback: ' + (e?.message || String(e))};
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
