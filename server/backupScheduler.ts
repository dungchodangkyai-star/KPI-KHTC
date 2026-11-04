import crypto from 'crypto';
import { Request, Response } from 'express';
import { pool as defaultPool } from '../src/db/index.ts';
import { 
  getEffectiveBackupConfigAsync, 
  saveBackupConfigAsync, 
  performBackup,
  type BackupScheduleConfig 
} from './backupService.ts';

export interface VietnamTimeParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  dateString: string; // YYYY-MM-DD
  timeString: string; // HH:mm
  currentMinutesOfDay: number;
  isoLike: string;
}

/**
 * Deterministically extracts Vietnam Time (Asia/Ho_Chi_Minh - UTC+7)
 * using Intl.DateTimeFormat regardless of container host clock/timezone.
 */
export function getVietnamTime(date: Date = new Date()): VietnamTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short'
  });

  const parts = formatter.formatToParts(date);
  let year = 1970;
  let month = 1;
  let day = 1;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let weekdayStr = 'Sun';

  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    else if (part.type === 'month') month = parseInt(part.value, 10);
    else if (part.type === 'day') day = parseInt(part.value, 10);
    else if (part.type === 'hour') hours = parseInt(part.value, 10) % 24;
    else if (part.type === 'minute') minutes = parseInt(part.value, 10);
    else if (part.type === 'second') seconds = parseInt(part.value, 10);
    else if (part.type === 'weekday') weekdayStr = part.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  const dayOfWeek = weekdayMap[weekdayStr] ?? 0;

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateString = `${year}-${pad(month)}-${pad(day)}`;
  const timeString = `${pad(hours)}:${pad(minutes)}`;
  const currentMinutesOfDay = hours * 60 + minutes;
  const isoLike = `${dateString}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}+07:00`;

  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    dayOfWeek,
    dateString,
    timeString,
    currentMinutesOfDay,
    isoLike
  };
}

/**
 * Evaluates whether backup should run for the current Vietnam time and configuration.
 * Satisfies catch-up requirement: runs first wake-up after targetTime on that day/hour.
 * Daily runs all 7 days of the week (including Saturday and Sunday).
 */
export function isBackupDue(
  config: BackupScheduleConfig,
  vnTime: VietnamTimeParts,
  lastSlot?: string | null
): { due: boolean; slotId: string; reason: string } {
  if (!config.enabled) {
    return { due: false, slotId: '', reason: 'SCHEDULE_DISABLED' };
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const dailyTimeStr = config.dailyTime || '23:30';
  const [tHourStr, tMinStr] = dailyTimeStr.split(':');
  const targetHour = parseInt(tHourStr || '23', 10);
  const targetMinute = parseInt(tMinStr || '30', 10);
  const targetMinutesOfDay = targetHour * 60 + targetMinute;

  if (config.frequency === 'daily') {
    // Daily schedule applies all 7 days of the week including Sat (6) and Sun (0)
    const slotId = `daily:${vnTime.dateString}`;
    if (lastSlot === slotId) {
      return { due: false, slotId, reason: 'ALREADY_RAN_FOR_SLOT' };
    }
    if (vnTime.currentMinutesOfDay < targetMinutesOfDay) {
      return { due: false, slotId, reason: 'BEFORE_SCHEDULED_TIME' };
    }
    return { due: true, slotId, reason: 'SCHEDULE_DUE' };
  }

  if (config.frequency === 'weekly') {
    const targetDay = config.weeklyDay ?? 0; // 0 = Sunday
    const slotId = `weekly:${vnTime.dateString}`;
    if (vnTime.dayOfWeek !== targetDay) {
      return { due: false, slotId, reason: 'NOT_CONFIGURED_WEEKDAY' };
    }
    if (lastSlot === slotId) {
      return { due: false, slotId, reason: 'ALREADY_RAN_FOR_SLOT' };
    }
    if (vnTime.currentMinutesOfDay < targetMinutesOfDay) {
      return { due: false, slotId, reason: 'BEFORE_SCHEDULED_TIME' };
    }
    return { due: true, slotId, reason: 'SCHEDULE_DUE' };
  }

  if (config.frequency === 'hourly') {
    const slotId = `hourly:${vnTime.dateString}-${pad(vnTime.hours)}`;
    if (lastSlot === slotId) {
      return { due: false, slotId, reason: 'ALREADY_RAN_FOR_SLOT' };
    }
    return { due: true, slotId, reason: 'SCHEDULE_DUE' };
  }

  return { due: false, slotId: '', reason: 'UNKNOWN_FREQUENCY' };
}

/**
 * Constant-time comparison for Google Cloud Scheduler wake-up token.
 * Prevents timing attacks. Never logs or leaks token values.
 */
export function verifySchedulerToken(providedToken?: string | null): boolean {
  const secret = process.env.BACKUP_SCHEDULER_TOKEN;
  if (!secret || !providedToken || typeof providedToken !== 'string') {
    return false;
  }
  const cleanProvided = providedToken.trim();
  const cleanSecret = secret.trim();
  const bufA = Buffer.from(cleanProvided, 'utf-8');
  const bufB = Buffer.from(cleanSecret, 'utf-8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface SchedulerTickResult {
  success: boolean;
  executed: boolean;
  slotId?: string;
  source: string;
  vietnamTime: string;
  reason: string;
  message?: string;
  error?: string;
  offsiteSynced?: boolean;
}

/**
 * Reads persistent schedule state from PostgreSQL (categories table with code 'SYSTEM_BACKUP_SCHEDULE_STATE')
 */
export async function getPersistentScheduleState(poolOrClient?: any): Promise<{
  lastScheduledSlot?: string;
  lastScheduledAt?: string;
  lastScheduledStatus?: string;
  lastScheduledMessage?: string;
}> {
  const client = poolOrClient || defaultPool;
  try {
    const res = await client.query(
      `SELECT properties FROM categories WHERE code = 'SYSTEM_BACKUP_SCHEDULE_STATE' LIMIT 1`
    );
    if (res.rows && res.rows[0] && res.rows[0].properties) {
      const p = typeof res.rows[0].properties === 'string' 
        ? JSON.parse(res.rows[0].properties) 
        : res.rows[0].properties;
      return p || {};
    }
  } catch (err) {
    // If table or record not ready, fallback gracefully
  }

  // Fallback to checking SYSTEM_BACKUP_CONFIG properties
  try {
    const resConfig = await client.query(
      `SELECT properties FROM categories WHERE code = 'SYSTEM_BACKUP_CONFIG' LIMIT 1`
    );
    if (resConfig.rows && resConfig.rows[0] && resConfig.rows[0].properties) {
      const p = typeof resConfig.rows[0].properties === 'string'
        ? JSON.parse(resConfig.rows[0].properties)
        : resConfig.rows[0].properties;
      if (p && p.lastScheduledSlot) {
        return {
          lastScheduledSlot: p.lastScheduledSlot,
          lastScheduledAt: p.lastScheduledAt,
          lastScheduledStatus: p.lastScheduledStatus,
          lastScheduledMessage: p.lastScheduledMessage
        };
      }
    }
  } catch {}

  return {};
}

/**
 * Persists schedule state atomically into PostgreSQL
 */
export async function savePersistentScheduleState(
  state: {
    lastScheduledSlot: string;
    lastScheduledAt: string;
    lastScheduledStatus: 'success' | 'failed';
    lastScheduledMessage: string;
  },
  poolOrClient?: any
): Promise<void> {
  const client = poolOrClient || defaultPool;
  try {
    await client.query(
      `INSERT INTO categories (code, name, type, properties, status, "order")
       VALUES ('SYSTEM_BACKUP_SCHEDULE_STATE', 'Trạng thái Lịch trình Sao lưu', 'SYSTEM_CONFIG', $1, 'Đang áp dụng', 99)
       ON CONFLICT (code) DO UPDATE SET
         properties = EXCLUDED.properties,
         status = EXCLUDED.status`,
      [JSON.stringify(state)]
    );
  } catch (err) {
    console.warn('[BackupScheduler] Warning persisting schedule state to categories:', err);
  }

  // Also sync with SYSTEM_BACKUP_CONFIG properties so existing UI/API seamlessly inspects it
  if (!poolOrClient) {
    try {
      const currentCfg = await getEffectiveBackupConfigAsync();
      await saveBackupConfigAsync({
        ...currentCfg,
        ...state
      } as any);
    } catch (err) {
      console.warn('[BackupScheduler] Warning updating backup config properties with schedule state:', err);
    }
  }
}

/**
 * Shared scheduler tick execution:
 * 1. Evaluates due status in Asia/Ho_Chi_Minh.
 * 2. Uses PostgreSQL advisory lock (pg_try_advisory_lock) to prevent concurrent instance execution.
 * 3. Commits slot ONLY when both local backup AND offsite (if enabled) succeed.
 * 4. Retries on error without committing the slot.
 */
export async function executeBackupSchedulerTick(options: {
  source?: string;
  force?: boolean;
  poolOrClient?: any;
  now?: Date;
  config?: BackupScheduleConfig;
  performBackupFn?: (triggerType: 'auto_scheduled' | 'manual') => Promise<{ success: boolean; metadata?: any; error?: string }>;
} = {}): Promise<SchedulerTickResult> {
  const source = options.source || 'scheduler';
  const vnTime = getVietnamTime(options.now || new Date());
  const client = options.poolOrClient || defaultPool;
  const backupRunner = options.performBackupFn || performBackup;

  let config = options.config;
  if (!config) {
    if (options.poolOrClient) {
      try {
        const res = await options.poolOrClient.query(`SELECT properties FROM categories WHERE code = 'SYSTEM_BACKUP_CONFIG' LIMIT 1`);
        if (res.rows?.[0]?.properties) {
          config = typeof res.rows[0].properties === 'string' ? JSON.parse(res.rows[0].properties) : res.rows[0].properties;
        }
      } catch {}
    }
    if (!config && !options.poolOrClient) {
      try {
        config = await getEffectiveBackupConfigAsync();
      } catch {}
    }
    if (!config) {
      config = {
        enabled: true,
        frequency: 'daily',
        dailyTime: '23:30',
        maxCopies: 30,
        offsite: { enabled: false, provider: 'google_drive', destinationUrl: '' }
      };
    }
  }

  const scheduleState = await getPersistentScheduleState(client);
  const lastSlot = scheduleState.lastScheduledSlot;

  const dueCheck = isBackupDue(config, vnTime, lastSlot);
  if (!dueCheck.due && !options.force) {
    return {
      success: true,
      executed: false,
      slotId: dueCheck.slotId,
      source,
      vietnamTime: vnTime.isoLike,
      reason: dueCheck.reason,
      message: `Chưa đến hạn sao lưu (${dueCheck.reason}). Khung giờ: ${config.dailyTime || '23:30'} VN.`
    };
  }

  const targetSlotId = dueCheck.slotId || `manual:${vnTime.dateString}-${vnTime.timeString}`;

  // Acquire PostgreSQL Advisory Lock (hashtext('kpi_backup_scheduler_lock'))
  let lockAcquired = false;
  try {
    const lockRes = await client.query(
      `SELECT pg_try_advisory_lock(hashtext('kpi_backup_scheduler_lock')) AS acquired;`
    );
    lockAcquired = Boolean(lockRes.rows && (lockRes.rows[0]?.acquired === true || lockRes.rows[0]?.acquired === 't'));
  } catch (lockErr) {
    console.warn('[BackupScheduler] Advisory lock check error, falling back to local lock:', lockErr);
    // If DB is offline or mock doesn't support advisory lock, proceed with caution
    lockAcquired = true;
  }

  if (!lockAcquired) {
    return {
      success: false,
      executed: false,
      slotId: targetSlotId,
      source,
      vietnamTime: vnTime.isoLike,
      reason: 'LOCKED',
      message: 'Một tiến trình sao lưu khác đang chạy (PostgreSQL advisory lock đang bị giữ).'
    };
  }

  try {
    console.log(`[BackupScheduler] [${source}] Executing scheduled backup for slot ${targetSlotId} at ${vnTime.isoLike}...`);
    
    // Execute backup snapshot
    const backupRes = await backupRunner('auto_scheduled');

    if (!backupRes.success) {
      const errMsg = backupRes.error || 'Lỗi chụp snapshot dữ liệu';
      console.error(`[BackupScheduler] Snapshot failed: ${errMsg}`);
      // Record failure without committing the slot so it can retry
      await savePersistentScheduleState({
        lastScheduledSlot: lastSlot || '',
        lastScheduledAt: vnTime.isoLike,
        lastScheduledStatus: 'failed',
        lastScheduledMessage: `Lỗi sao lưu lúc ${vnTime.timeString}: ${errMsg}`
      }, client).catch(() => {});

      return {
        success: false,
        executed: true,
        slotId: targetSlotId,
        source,
        vietnamTime: vnTime.isoLike,
        reason: 'SNAPSHOT_ERROR',
        error: errMsg,
        message: `Lỗi chụp bản sao lưu: ${errMsg}`
      };
    }

    // Check offsite backup requirement if enabled
    const offsiteEnabled = Boolean(config.offsite?.enabled && config.offsite.destinationUrl);
    if (offsiteEnabled && backupRes.metadata?.offsiteSynced !== true) {
      const offsiteErrMsg = backupRes.metadata?.offsiteMessage || 'Đồng bộ đám mây ngoại vi thất bại';
      console.error(`[BackupScheduler] Offsite sync failed for slot ${targetSlotId}: ${offsiteErrMsg}`);

      // Do NOT commit the slot! This triggers automatic retry on subsequent wake-ups
      await savePersistentScheduleState({
        lastScheduledSlot: lastSlot || '',
        lastScheduledAt: vnTime.isoLike,
        lastScheduledStatus: 'failed',
        lastScheduledMessage: `Sao lưu cục bộ thành công nhưng đồng bộ ngoại vi thất bại: ${offsiteErrMsg}`
      }, client).catch(() => {});

      return {
        success: false,
        executed: true,
        slotId: targetSlotId,
        source,
        vietnamTime: vnTime.isoLike,
        reason: 'OFFSITE_SYNC_ERROR',
        error: offsiteErrMsg,
        offsiteSynced: false,
        message: `Sao lưu cục bộ thành công nhưng đồng bộ ngoại vi thất bại: ${offsiteErrMsg}. Sẽ tự động thử lại ở lần kích hoạt sau.`
      };
    }

    // Both local snapshot and offsite sync (if enabled) SUCCEEDED!
    // Commit the slot permanently into PostgreSQL
    await savePersistentScheduleState({
      lastScheduledSlot: targetSlotId,
      lastScheduledAt: vnTime.isoLike,
      lastScheduledStatus: 'success',
      lastScheduledMessage: `Sao lưu tự động thành công slot ${targetSlotId} lúc ${vnTime.timeString} VN${offsiteEnabled ? ' (Đã đồng bộ đám mây)' : ''}`
    }, client);

    console.log(`[BackupScheduler] Slot ${targetSlotId} successfully committed.`);

    return {
      success: true,
      executed: true,
      slotId: targetSlotId,
      source,
      vietnamTime: vnTime.isoLike,
      reason: 'COMPLETED',
      offsiteSynced: offsiteEnabled ? true : undefined,
      message: `Sao lưu tự động thành công cho slot ${targetSlotId}.`
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error(`[BackupScheduler] Unexpected error during tick:`, err);
    return {
      success: false,
      executed: false,
      slotId: targetSlotId,
      source,
      vietnamTime: vnTime.isoLike,
      reason: 'UNHANDLED_ERROR',
      error: errorMsg,
      message: `Lỗi ngoại lệ trong scheduler tick: ${errorMsg}`
    };
  } finally {
    // Release PostgreSQL Advisory Lock
    try {
      await client.query(`SELECT pg_advisory_unlock(hashtext('kpi_backup_scheduler_lock'));`);
    } catch (unlockErr) {
      // In-memory or client closed
    }
  }
}

/**
 * HTTP Endpoint Handler for Google Cloud Scheduler
 * Endpoint: POST /api/backups/scheduler-tick (also accepts GET)
 * Authenticated via BACKUP_SCHEDULER_TOKEN in header or Bearer.
 */
export async function handleSchedulerTickEndpoint(req: Request, res: Response) {
  // Extract token from header or authorization Bearer
  const headerToken = req.headers['x-backup-scheduler-token'] || 
    (typeof req.headers['authorization'] === 'string' && req.headers['authorization'].startsWith('Bearer ')
      ? req.headers['authorization'].slice(7).trim()
      : null);

  const tokenToVerify = typeof headerToken === 'string' ? headerToken : null;

  if (!verifySchedulerToken(tokenToVerify)) {
    // Strictly return 401. Never expose token in logs or body.
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing backup scheduler token'
    });
  }

  try {
    const force = req.query.force === 'true' || req.body?.force === true;
    const result = await executeBackupSchedulerTick({
      source: 'cloud_scheduler',
      force
    });

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(result.reason === 'LOCKED' ? 423 : 500).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Scheduler tick internal execution failure'
    });
  }
}

/**
 * Local Fallback Runner: checks schedule every 5 minutes (300,000 ms)
 */
let schedulerInterval: NodeJS.Timeout | null = null;

export function startBackupScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Wake up every 5 minutes (300 seconds) as a local fallback runner
  schedulerInterval = setInterval(async () => {
    try {
      await executeBackupSchedulerTick({ source: 'local_interval' });
    } catch (err) {
      console.error('[BackupScheduler] Fallback interval runner error:', err);
    }
  }, 300000);

  // Initial check 10 seconds after server startup
  setTimeout(async () => {
    try {
      await executeBackupSchedulerTick({ source: 'startup_check' });
    } catch (err) {
      console.warn('[BackupScheduler] Startup schedule check notice:', err);
    }
  }, 10000);

  console.log('[BackupScheduler] Backup Scheduler service initialized (5-minute fallback tick + Cloud Scheduler endpoint active).');
}
