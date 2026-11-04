/**
 * Automated Test Suite for Backup Scheduler Hardening
 * Tests:
 * 1. 23:30 VN Time Intl extraction and schedule evaluation
 * 2. Weekend (T7, CN) daily execution (runs all 7 days)
 * 3. Catch-up execution (waking up after 23:30 within the same day)
 * 4. Duplicate prevention (same slot ID check + PostgreSQL advisory lock)
 * 5. Not-yet-due check (before target time)
 * 6. Cloud Scheduler token verification (constant-time check, 401 on invalid/missing)
 * 7. Slot commit atomicity (offsite failure prevents slot commit, allows retry)
 */

import { 
  getVietnamTime, 
  isBackupDue, 
  verifySchedulerToken,
  executeBackupSchedulerTick,
  handleSchedulerTickEndpoint
} from './backupScheduler.ts';
import type { BackupScheduleConfig } from './backupService.ts';
import { fileURLToPath } from 'url';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
  }
}

// Mock PostgreSQL client for scheduler tests
function createMockSchedulerDb(options: {
  lockAcquired?: boolean;
  scheduleState?: any;
  failLockQuery?: boolean;
}) {
  const executedQueries: { sql: string; params?: any[] }[] = [];
  let currentState = options.scheduleState || null;

  return {
    executedQueries,
    query: async (sql: string, params: any[] = []) => {
      executedQueries.push({ sql, params });

      // Advisory lock
      if (sql.includes('pg_try_advisory_lock')) {
        if (options.failLockQuery) throw new Error('Lock query failed');
        return { rows: [{ acquired: options.lockAcquired !== false }] };
      }

      // Advisory unlock
      if (sql.includes('pg_advisory_unlock')) {
        return { rows: [{ unlocked: true }] };
      }

      // Select properties from categories
      if (sql.includes("SELECT properties FROM categories WHERE code = 'SYSTEM_BACKUP_SCHEDULE_STATE'")) {
        return { rows: currentState ? [{ properties: currentState }] : [] };
      }

      // Upsert into categories
      if (sql.includes("INSERT INTO categories (code, name, type, properties, status, \"order\")")) {
        try {
          currentState = JSON.parse(params[0]);
        } catch {
          currentState = params[0];
        }
        return { rows: [{ code: 'SYSTEM_BACKUP_SCHEDULE_STATE', properties: currentState }] };
      }

      return { rows: [] };
    },
    getCurrentState: () => currentState
  };
}

export async function runBackupSchedulerTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n================================================================');
  console.log(' RUNNING BACKUP SCHEDULER HARDENING TESTS');
  console.log('================================================================');

  const baseConfig: BackupScheduleConfig = {
    enabled: true,
    frequency: 'daily',
    dailyTime: '23:30',
    maxCopies: 30,
    offsite: {
      enabled: false,
      provider: 'google_drive',
      destinationUrl: ''
    }
  };

  // ---------------------------------------------------------------------------
  // Test 1: 23:30 VN Timezone extraction via Intl.DateTimeFormat
  // ---------------------------------------------------------------------------
  console.log('\n[Test Group 1: 23:30 VN Timezone & Intl Extraction]');
  {
    // UTC 2026-11-03T16:30:00Z corresponds to 2026-11-03 23:30:00 in Asia/Ho_Chi_Minh (UTC+7)
    const utcDate = new Date('2026-11-03T16:30:00.000Z');
    const vnTime = getVietnamTime(utcDate);

    assert(vnTime.year === 2026, 'Year extracted correctly as 2026 in Asia/Ho_Chi_Minh');
    assert(vnTime.month === 11, 'Month extracted correctly as 11 in Asia/Ho_Chi_Minh');
    assert(vnTime.day === 3, 'Day extracted correctly as 3 in Asia/Ho_Chi_Minh');
    assert(vnTime.hours === 23, 'Hour extracted correctly as 23 (regardless of host system timezone)');
    assert(vnTime.minutes === 30, 'Minute extracted correctly as 30');
    assert(vnTime.dateString === '2026-11-03', 'DateString matches 2026-11-03');
    assert(vnTime.timeString === '23:30', 'TimeString matches 23:30');

    // Evaluation at 23:30 VN
    const due = isBackupDue(baseConfig, vnTime, null);
    assert(due.due === true, 'Backup is due at 23:30 VN for daily schedule');
    assert(due.slotId === 'daily:2026-11-03', 'Slot ID is daily:2026-11-03');
  }

  // ---------------------------------------------------------------------------
  // Test 2: Weekend (T7, CN) Daily Execution
  // ---------------------------------------------------------------------------
  console.log('\n[Test Group 2: Weekend (T7, CN) Execution]');
  {
    // Saturday: 2026-11-07T16:30:00Z -> Sat 2026-11-07 23:30 VN
    const satDate = new Date('2026-11-07T16:30:00.000Z');
    const satVn = getVietnamTime(satDate);
    assert(satVn.dayOfWeek === 6, 'Saturday correctly recognized as dayOfWeek = 6');
    const satDue = isBackupDue(baseConfig, satVn, null);
    assert(satDue.due === true, 'Daily backup executes on Saturday (T7)');
    assert(satDue.slotId === 'daily:2026-11-07', 'Saturday slot ID is daily:2026-11-07');

    // Sunday: 2026-11-08T16:30:00Z -> Sun 2026-11-08 23:30 VN
    const sunDate = new Date('2026-11-08T16:30:00.000Z');
    const sunVn = getVietnamTime(sunDate);
    assert(sunVn.dayOfWeek === 0, 'Sunday correctly recognized as dayOfWeek = 0');
    const sunDue = isBackupDue(baseConfig, sunVn, null);
    assert(sunDue.due === true, 'Daily backup executes on Sunday (CN)');
    assert(sunDue.slotId === 'daily:2026-11-08', 'Sunday slot ID is daily:2026-11-08');
  }

  // ---------------------------------------------------------------------------
  // Test 3: Catch-up / Chạy bù (Waking up after target minute)
  // ---------------------------------------------------------------------------
  console.log('\n[Test Group 3: Catch-up Execution (Chạy bù)]');
  {
    // Scheduler wakes up at 23:35 VN (target was 23:30)
    const lateDate1 = new Date('2026-11-03T16:35:00.000Z'); // 23:35 VN
    const lateVn1 = getVietnamTime(lateDate1);
    const lateDue1 = isBackupDue(baseConfig, lateVn1, null);
    assert(lateDue1.due === true, 'Catch-up: wakes up at 23:35 VN and executes backup');
    assert(lateDue1.slotId === 'daily:2026-11-03', 'Slot ID correctly identified for catch-up');

    // Scheduler wakes up at 23:59 VN (target was 23:30)
    const lateDate2 = new Date('2026-11-03T16:59:00.000Z'); // 23:59 VN
    const lateVn2 = getVietnamTime(lateDate2);
    const lateDue2 = isBackupDue(baseConfig, lateVn2, null);
    assert(lateDue2.due === true, 'Catch-up: wakes up at 23:59 VN before midnight and executes backup');
  }

  // ---------------------------------------------------------------------------
  // Test 4: Duplicate Prevention & Concurrency Protection
  // ---------------------------------------------------------------------------
  console.log('\n[Test Group 4: Duplicate Prevention & Concurrency Lock]');
  {
    // Same slot already committed: tick at 23:35 after slot was already completed
    const lateDate = new Date('2026-11-03T16:35:00.000Z');
    const lateVn = getVietnamTime(lateDate);
    const dupCheck = isBackupDue(baseConfig, lateVn, 'daily:2026-11-03');
    assert(dupCheck.due === false, 'Duplicate prevention: slot already completed today, does not run again');
    assert(dupCheck.reason === 'ALREADY_RAN_FOR_SLOT', 'Reason is ALREADY_RAN_FOR_SLOT');

    // Concurrent instance prevention via advisory lock
    const mockDbLocked = createMockSchedulerDb({ lockAcquired: false });
    const lockResult = await executeBackupSchedulerTick({
      poolOrClient: mockDbLocked,
      now: new Date('2026-11-03T16:30:00.000Z'),
      force: true
    });
    assert(lockResult.success === false, 'Fails safely when Postgres advisory lock cannot be acquired');
    assert(lockResult.reason === 'LOCKED', 'Returns LOCKED reason when another instance is executing');
  }

  // ---------------------------------------------------------------------------
  // Test 5: Not-yet-due Check (Chưa đến giờ)
  // ---------------------------------------------------------------------------
  console.log('\n[Test Group 5: Not-yet-due Check]');
  {
    // At 22:00 VN (scheduled for 23:30)
    const earlyDate = new Date('2026-11-03T15:00:00.000Z'); // 22:00 VN
    const earlyVn = getVietnamTime(earlyDate);
    const earlyDue = isBackupDue(baseConfig, earlyVn, null);
    assert(earlyDue.due === false, 'Not due at 22:00 VN when scheduled for 23:30 VN');
    assert(earlyDue.reason === 'BEFORE_SCHEDULED_TIME', 'Reason is BEFORE_SCHEDULED_TIME');

    // Weekly schedule on wrong weekday
    const weeklyConfig: BackupScheduleConfig = {
      ...baseConfig,
      frequency: 'weekly',
      weeklyDay: 1 // Monday
    };
    // Sunday 2026-11-08 at 23:30 VN
    const sunDate = new Date('2026-11-08T16:30:00.000Z');
    const sunVn = getVietnamTime(sunDate);
    const weeklyDue = isBackupDue(weeklyConfig, sunVn, null);
    assert(weeklyDue.due === false, 'Weekly backup does not run on wrong day of week');
    assert(weeklyDue.reason === 'NOT_CONFIGURED_WEEKDAY', 'Reason is NOT_CONFIGURED_WEEKDAY');
  }

  // ---------------------------------------------------------------------------
  // Test 6: Cloud Scheduler Token Verification (Constant-time, 401 on invalid)
  // ---------------------------------------------------------------------------
  console.log('\n[Test Group 6: Cloud Scheduler Token Verification (401 Protection)]');
  {
    const originalToken = process.env.BACKUP_SCHEDULER_TOKEN;
    process.env.BACKUP_SCHEDULER_TOKEN = 'top-secret-scheduler-token-9988';

    // 1. Missing token
    assert(verifySchedulerToken(undefined) === false, 'Rejects undefined token');
    assert(verifySchedulerToken(null) === false, 'Rejects null token');
    assert(verifySchedulerToken('') === false, 'Rejects empty token');

    // 2. Wrong token (same length)
    assert(verifySchedulerToken('top-secret-scheduler-token-0000') === false, 'Rejects incorrect token of same length');

    // 3. Wrong token (different length)
    assert(verifySchedulerToken('short') === false, 'Rejects token of different length');

    // 4. Exact match
    assert(verifySchedulerToken('top-secret-scheduler-token-9988') === true, 'Accepts valid matching token in constant time');

    // 5. Test HTTP endpoint 401 response
    let statusSent = 0;
    let jsonSent: any = null;
    const mockReq = {
      headers: { 'x-backup-scheduler-token': 'wrong-token' },
      query: {},
      body: {}
    } as any;
    const mockRes = {
      status: (code: number) => { statusSent = code; return mockRes; },
      json: (data: any) => { jsonSent = data; return mockRes; }
    } as any;

    await handleSchedulerTickEndpoint(mockReq, mockRes);
    assert(statusSent === 401, 'Endpoint returns HTTP 401 on invalid token');
    assert(jsonSent?.success === false, 'Endpoint returns success: false on invalid token');
    assert(typeof jsonSent?.error === 'string', 'Endpoint returns clear error message');

    // Restore env
    if (originalToken !== undefined) {
      process.env.BACKUP_SCHEDULER_TOKEN = originalToken;
    } else {
      delete process.env.BACKUP_SCHEDULER_TOKEN;
    }
  }

  // ---------------------------------------------------------------------------
  // Test 7: Persistence & Slot Commit (Local & Offsite Atomicity)
  // ---------------------------------------------------------------------------
  console.log('\n[Test Group 7: Persistent Schedule State & Mock Commit]');
  {
    const mockDb = createMockSchedulerDb({ lockAcquired: true, scheduleState: null });
    
    // Simulate successful tick with mock DB
    const res = await executeBackupSchedulerTick({
      poolOrClient: mockDb,
      now: new Date('2026-11-03T16:30:00.000Z'), // 23:30 VN
      force: true,
      performBackupFn: async () => ({
        success: true,
        metadata: {
          id: 'test_backup_001',
          filename: 'test_backup_001.json',
          createdAt: new Date().toISOString(),
          sizeBytes: 1024,
          recordCounts: { users: 21, works: 736, assignments: 52, overtimes: 116, categories: 12, kpiResults: 113, notifications: 0, logs: 0 },
          triggerType: 'auto_scheduled',
          offsiteSynced: true
        }
      })
    });

    assert(res.success === true, 'Tick executed successfully with mock DB');
    assert(res.executed === true, 'Backup was triggered');
    assert(mockDb.executedQueries.some(q => q.sql.includes('pg_try_advisory_lock')), 'PostgreSQL advisory lock was requested');
    assert(mockDb.executedQueries.some(q => q.sql.includes('pg_advisory_unlock')), 'PostgreSQL advisory lock was released');

    // Sub-test 7b: Offsite sync failure prevents slot commit (triggers retry on next tick)
    const mockDbOffsiteFail = createMockSchedulerDb({ lockAcquired: true, scheduleState: null });
    const failRes = await executeBackupSchedulerTick({
      poolOrClient: mockDbOffsiteFail,
      now: new Date('2026-11-03T16:30:00.000Z'),
      force: true,
      performBackupFn: async () => ({
        success: false,
        error: 'Network timeout pushing to offsite webhook'
      })
    });

    assert(failRes.success === false, 'Tick reports failure when backup snapshot/offsite fails');
    assert(mockDbOffsiteFail.getCurrentState()?.lastScheduledSlot !== 'daily:2026-11-03', 'Slot is NOT committed on failure, allowing automatic retry on next wake-up');
  }

  console.log('\n================================================================');
  console.log(` SCHEDULER TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  return { passed, failed };
}

// If executed directly via tsx. Use normalized filesystem paths so this also
// works on Windows paths containing drive letters, spaces and Vietnamese text.
const currentTestFile = path.resolve(fileURLToPath(import.meta.url));
const invokedTestFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedTestFile && currentTestFile === invokedTestFile) {
  runBackupSchedulerTests().then(results => {
    if (results.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }).catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
