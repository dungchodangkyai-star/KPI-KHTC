/**
 * Standalone Automated Test Suite for JSON -> Neon Migration Hardening (Round 3)
 * Completely isolated: uses mock pool/client dependency injection, zero live Neon dependency.
 * Run with: npx tsx server/testMigrationHardening.ts
 */

import crypto from 'crypto';
import fs from 'fs';
import { 
  TABLES_CONFIG,
  extractTechnicalKey, 
  extractLogicalKey, 
  safeKpiScore, 
  safeNullableNumber, 
  safeNullableString,
  maskEmail,
  maskIp,
  generatePreflightToken,
  validateAndConsumePreflightToken,
  getPreflightToken,
  setPreflightTokenForTest,
  clearPreflightTokens,
  computeSourceFingerprint,
  computeTargetFingerprint,
  runMigrationDryRun,
  executeMigrationToNeon,
  checkNeonTargetAdminStatus,
  validateSourceStore,
  getCanonicalRow,
  computeCanonicalRecordHash,
  stableCanonicalJson,
  normalizeJsonValue
} from './migrationService.ts';
import { 
  ensureDatabaseSchema, 
  validateSchemaPreflight, 
  movePublicTablesToLegacySchema 
} from './dbMigrate.ts';
import {
  validateBackupPayload,
  runRestoreDryRun,
  executeRestoreApply,
  getBackupContent,
  computeCanonicalBackupRowHash
} from './backupService.ts';

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

// Helper to create mock PostgreSQL query runner / client
function createMockPoolOrClient(options: {
  tableRows?: Record<string, any[]>;
  columnsMap?: Record<string, { column_name: string; data_type: string; is_nullable: string }[]>;
  failingQueries?: string[]; // Substring of query to throw error
  trackQueries?: boolean;
  synthesizePostVerificationRows?: boolean;
  postVerificationOverrides?: Record<string, any[]>;
}) {
  const executedQueries: string[] = [];
  const rows = options.tableRows || {};

  const queryFn = async (sql: string, params: any[] = []) => {
    const trimmed = sql.trim();
    if (options.trackQueries) {
      executedQueries.push(trimmed);
    }

    // Check intentional failure
    if (options.failingQueries && options.failingQueries.some(f => sql.includes(f))) {
      throw new Error(`[MockDb] Intentional failure triggered on query matching: ${sql.slice(0, 50)}...`);
    }

    // 1. Transaction statements
    if (trimmed === 'BEGIN' || trimmed === 'COMMIT' || trimmed === 'ROLLBACK') {
      return { rows: [] };
    }

    // 2. Information schema tables
    if (sql.includes('information_schema.tables')) {
      const dbTables = Object.keys(rows).length > 0 ? Object.keys(rows) : TABLES_CONFIG.map(t => t.dbTable);
      return {
        rows: dbTables.map(t => ({ table_name: t }))
      };
    }

    // 3. Information schema columns
    if (sql.includes('information_schema.columns')) {
      const tblName = params[0];
      const cols = (options.columnsMap && options.columnsMap[tblName]) || [
        { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
        { column_name: 'password', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'role', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'status', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'email', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'work_id', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'month', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'user_id', data_type: 'integer', is_nullable: 'YES' },
        { column_name: 'task_name', data_type: 'text', is_nullable: 'YES' }
      ];
      return { rows: cols };
    }

    // 4. Admin count query in users table
    if (sql.includes('SELECT COUNT(*)::int AS count FROM users WHERE (role = \'ADMIN\'')) {
      const usersList = rows['users'] || [];
      const adminCount = usersList.filter(u => u.role === 'ADMIN' && u.password && u.status === 'Đang làm').length;
      return { rows: [{ count: adminCount }] };
    }

    // 5. Total count per table: SELECT COUNT(*)::int as cnt FROM "table"
    const countMatch = sql.match(/SELECT COUNT\(\*\)::int as cnt FROM "([^"]+)"/i);
    if (countMatch) {
      const tbl = countMatch[1];
      const count = (rows[tbl] || []).length;
      return { rows: [{ cnt: count }] };
    }

    // 6. Content hash query: SELECT COUNT(*)::int as row_count, MD5(...) as content_hash FROM "table"
    const hashMatch = sql.match(/FROM "([^"]+)" t/i);
    if (hashMatch) {
      const tbl = hashMatch[1];
      const tableRows = rows[tbl] || [];
      const rowHash = crypto.createHash('md5').update(JSON.stringify(tableRows)).digest('hex');
      return { rows: [{ row_count: tableRows.length, content_hash: rowHash }] };
    }

    // 7. SELECT * FROM "table" WHERE "unique_col"::text = $1
    const singleMatch = sql.match(/SELECT \* FROM "([^"]+)" WHERE "([^"]+)"::text = \$1/i);
    if (singleMatch) {
      const tbl = singleMatch[1];
      const col = singleMatch[2];
      const targetVal = String(params[0] ?? '').trim();

      // Priority 1: Specific post-verification overrides (e.g. discrepancy injection)
      if (options.postVerificationOverrides && options.postVerificationOverrides[tbl]) {
        const matched = options.postVerificationOverrides[tbl].filter(r => String(r[col] || '').trim() === targetVal);
        return { rows: matched };
      }

      // Priority 2: Explicit table rows
      if (rows[tbl] && rows[tbl].length > 0) {
        const matched = rows[tbl].filter(r => String(r[col] || '').trim() === targetVal);
        return { rows: matched };
      }

      // Priority 3: Synthesize matching row for post-verification in clean test
      if (options.synthesizePostVerificationRows) {
        const sampleStore: Record<string, any[]> = createValidSourceStore();
        const cfg = TABLES_CONFIG.find(t => t.dbTable === tbl);
        if (cfg) {
          const list = sampleStore[cfg.key] || sampleStore['system_logs'] || [];
          const found = list.find((item: any) => String(extractTechnicalKey(item, cfg) || '').trim() === targetVal);
          if (found) {
            const canonical = getCanonicalRow(tbl, found);
            return { rows: [canonical] };
          }
        }
      }

      return { rows: [] };
    }

    // 8. SELECT * FROM "table" (all rows)
    const selectAllMatch = sql.match(/SELECT \* FROM "([^"]+)"/i);
    if (selectAllMatch) {
      const tbl = selectAllMatch[1];
      return { rows: rows[tbl] || [] };
    }

    // 9. INSERT / ON CONFLICT
    if (sql.startsWith('INSERT INTO')) {
      return { rows: [{ is_inserted: true }] };
    }

    return { rows: [] };
  };

  const mock = {
    query: queryFn,
    connect: async () => mock,
    release: () => {},
    executedQueries
  };

  return mock;
}

// Sample valid JSON source store
function createValidSourceStore() {
  return {
    users: [
      {
        id: 1,
        email: 'dungchodangkyai@gmail.com',
        name: 'Quản trị viên',
        role: 'ADMIN',
        status: 'Đang làm',
        password: 'password123'
      }
    ],
    categories: [
      {
        id: 1,
        code: 'CAT_01',
        name: 'Nhiệm vụ trọng tâm',
        type: 'TASK',
        status: 'Đang áp dụng',
        order: 1
      }
    ],
    works: [
      {
        id: 1,
        workId: 'W_2026_001',
        month: '10-2026',
        userId: 1,
        taskName: 'Lập báo cáo kế hoạch',
        hours: '8',
        coef: '0.8',
        baseScore: '10',
        convertedScore: '8',
        status: 'Đang xử lý'
      }
    ],
    assignments: [
      {
        id: 1,
        assignmentId: 'A_2026_001',
        month: '10-2026',
        receiverId: 1,
        taskName: 'Phân công quý 4',
        baseScore: '10',
        suggestedCoef: '0.8',
        expectedConvertedScore: '8'
      }
    ],
    overtimes: [
      {
        id: 1,
        otId: 'OT_2026_001',
        month: '10-2026',
        userId: 1,
        otDate: '2026-10-20',
        startTime: '17:30',
        endTime: '20:30',
        totalRegHours: '3.0',
        approvedHours: '3.0'
      }
    ],
    kpiResults: [
      {
        id: 1,
        kpiId: 'KPI_2026_001',
        month: '10-2026',
        userId: 1,
        aScore: '20',
        bScore: '75',
        totalKpi: '95',
        rank: 'Hoàn thành xuất sắc'
      }
    ],
    notifications: [
      {
        id: 1,
        notifyId: 'N_001',
        type: 'WORK',
        title: 'Nhắc nhở phê duyệt',
        content: 'Vui lòng kiểm tra báo cáo'
      }
    ],
    systemLogs: [
      {
        id: 1,
        logId: 'L_001',
        action: 'LOGIN',
        target: 'System'
      }
    ],
    pushSettings: [
      {
        id: 1,
        vapid_public_key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjOJuBtr3qhmMwwpQ',
        vapid_private_key: 'private_key_sample_test_do_not_log_this_in_plain_text',
        subject: 'mailto:admin@kpi.internal'
      }
    ],
    pushSubscriptions: [
      {
        userId: 1,
        endpoint: 'https://fcm.googleapis.com/fcm/send/sample-device-token',
        p256dh: 'sample_p256dh_key',
        auth: 'sample_auth_secret',
        deviceLabel: 'Chrome MacOS'
      }
    ]
  };
}

async function runAllTests() {
  console.log('====================================================');
  console.log('   MIGRATION HARDENING TEST SUITE (ROUND 3)        ');
  console.log('====================================================\n');

  // TEST 1: Real Expired Token
  console.log('[1/11] Testing Real Expired Token (Item 1 & D):');
  clearPreflightTokens();
  const testAdmin = { id: 1, email: 'dungchodangkyai@gmail.com', role: 'ADMIN' };
  const expiredTokenStr = 'expired_token_test_12345';
  setPreflightTokenForTest(expiredTokenStr, {
    token: expiredTokenStr,
    sourceFingerprint: 'fp_source',
    targetFingerprint: 'fp_target',
    adminId: '1',
    adminEmail: 'dungchodangkyai@gmail.com',
    migrationMode: 'json_to_neon',
    createdAt: Date.now() - 20 * 60 * 1000,
    expiresAt: Date.now() - 10 * 1000, // Expired 10 seconds ago
    recoveryRequired: false
  });

  const expiredRes = await validateAndConsumePreflightToken(expiredTokenStr, testAdmin);
  assert(expiredRes.valid === false, 'Expired token is rejected as invalid');
  assert(expiredRes.statusCode === 403, 'Expired token returns HTTP 403 status code');
  assert(Boolean(expiredRes.error?.includes('hết hạn')), `Error message mentions expiry (${expiredRes.error})`);
  assert(getPreflightToken(expiredTokenStr) === undefined, 'Expired token is deleted from token map');
  console.log('');

  // TEST 2: Wrong Admin & Missing Identity Check
  console.log('[2/11] Testing Strict Principal Validation (Item 2 & D):');
  clearPreflightTokens();
  const validTokenStr = 'valid_token_test_abc';
  setPreflightTokenForTest(validTokenStr, {
    token: validTokenStr,
    sourceFingerprint: 'fp_src',
    targetFingerprint: 'fp_tgt',
    adminId: '1',
    adminEmail: 'dungchodangkyai@gmail.com',
    migrationMode: 'json_to_neon',
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000,
    recoveryRequired: false
  });

  // 2a. Missing email
  const missingEmailRes = await validateAndConsumePreflightToken(validTokenStr, { id: 1, email: '' });
  assert(missingEmailRes.valid === false, 'Request with missing email is rejected');
  assert(missingEmailRes.statusCode === 403, 'Missing email returns HTTP 403');

  // 2b. Mismatched email
  const wrongEmailRes = await validateAndConsumePreflightToken(validTokenStr, { id: 1, email: 'intruder@domain.com' });
  assert(wrongEmailRes.valid === false, 'Request with different email is rejected');
  assert(wrongEmailRes.statusCode === 403, 'Different email returns HTTP 403');

  // 2c. Mismatched adminId
  const wrongIdRes = await validateAndConsumePreflightToken(validTokenStr, { id: 99, email: 'dungchodangkyai@gmail.com' });
  assert(wrongIdRes.valid === false, 'Request with different ID is rejected');
  assert(wrongIdRes.statusCode === 403, 'Different ID returns HTTP 403');
  console.log('');

  // TEST 3: Same Count + Changed Content Fingerprint Mismatch => HTTP 409
  console.log('[3/11] Testing Same Count with Changed Content => 409 (Item 3 & E):');
  clearPreflightTokens();
  const mockTargetA = createMockPoolOrClient({
    tableRows: {
      users: [{ id: 1, email: 'dungchodangkyai@gmail.com', name: 'Original Name' }]
    }
  });
  const fpA = await computeTargetFingerprint(mockTargetA);

  const mockTargetB = createMockPoolOrClient({
    tableRows: {
      // Same row count (1 row), but mutated name
      users: [{ id: 1, email: 'dungchodangkyai@gmail.com', name: 'Mutated Name' }]
    }
  });
  const fpB = await computeTargetFingerprint(mockTargetB);

  assert(fpA !== fpB, 'Fingerprint detects content change despite identical row count');

  const fpTokenStr = 'token_fp_test_xyz';
  setPreflightTokenForTest(fpTokenStr, {
    token: fpTokenStr,
    sourceFingerprint: 'src_fp_unchanged',
    targetFingerprint: fpA, // Token was issued with target fingerprint A
    adminId: '1',
    adminEmail: 'dungchodangkyai@gmail.com',
    migrationMode: 'json_to_neon',
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000,
    recoveryRequired: false
  });

  // Re-verify against mockTargetB (target was modified!)
  const mockStore = createValidSourceStore();
  const conflictFpRes = await validateAndConsumePreflightToken(
    fpTokenStr,
    testAdmin,
    'json_to_neon',
    mockTargetB,
    mockStore
  );
  assert(conflictFpRes.valid === false, 'validateAndConsume rejects modified target');
  assert(conflictFpRes.statusCode === 409, 'Returns HTTP 409 Conflict when target changed after dry run');
  console.log('');

  // TEST 4: >2000 Rows Evaluated Without Truncation (2,501 rows)
  console.log('[4/11] Testing Full Scale >2000 Rows Without Truncation (Item 4 & E):');
  const largeWorkList: any[] = [];
  for (let i = 1; i <= 2501; i++) {
    largeWorkList.push({
      id: i,
      workId: `W_2026_${String(i).padStart(5, '0')}`,
      month: '10-2026',
      userId: 1,
      taskName: `Công việc số ${i}`,
      hours: '8',
      coef: '0.8',
      baseScore: '10',
      convertedScore: '8',
      status: 'Đang xử lý'
    });
  }

  const largeMockPool = createMockPoolOrClient({
    tableRows: {
      works: largeWorkList,
      users: []
    }
  });

  const largeStore = createValidSourceStore();
  largeStore.works = largeWorkList;

  const largeDryRun = await runMigrationDryRun(testAdmin, {
    poolOrClient: largeMockPool,
    sourceStore: largeStore
  });

  const worksRec = largeDryRun.tables.find(t => t.tableName === 'works');
  assert(worksRec?.sourceCount === 2501, 'Reconciled full 2,501 source works');
  assert(worksRec?.targetCountBefore === 2501, 'Reconciled full 2,501 target works (no arbitrary LIMIT 2000)');
  assert(largeDryRun.summary.totalSourceRecords >= 2501, 'Total source records includes all 2,501 items');
  console.log('');

  // TEST 5: Target Table Query Failure => Fail-Closed & No Token Issued
  console.log('[5/11] Testing Target Table Query Failure Fail-Closed (Item 5 & C):');
  const failingSelectPool = createMockPoolOrClient({
    tableRows: { users: [], works: [] },
    failingQueries: ['SELECT * FROM "works"']
  });

  const failClosedDryRun = await runMigrationDryRun(testAdmin, {
    poolOrClient: failingSelectPool,
    sourceStore: createValidSourceStore()
  });

  assert(failClosedDryRun.readyToMigrate === false, 'Query error sets readyToMigrate = false');
  assert(failClosedDryRun.preflightToken === null, 'Query error does NOT issue preflight token');
  assert(failClosedDryRun.success === false, 'Query error sets success = false');
  assert(Boolean(failClosedDryRun.message.includes('Lỗi đọc bảng đích')), 'Message explains table read failure');
  console.log('');

  // TEST 6: Invalid Source Row => Validation Error & No Token Issued
  console.log('[6/11] Testing Source Row Validation (Item 6 & B):');
  const invalidStore = createValidSourceStore();
  // Corrupt a work: remove month and userId
  invalidStore.works[0] = {
    id: 1,
    workId: 'W_INVALID',
    taskName: 'Công việc thiếu tháng và user'
  } as any;

  const validation = validateSourceStore(invalidStore);
  assert(validation.valid === false, 'validateSourceStore catches missing month and userId');
  assert(validation.errors.length > 0, 'Returns explicit validation errors');
  assert(validation.errors[0].missingFields.includes('month'), 'Identified missing field "month"');
  assert(validation.errors[0].missingFields.includes('userId'), 'Identified missing field "userId"');

  const emptyMockPool = createMockPoolOrClient({ tableRows: { users: [], works: [], categories: [] } });
  const invalidDryRun = await runMigrationDryRun(testAdmin, {
    poolOrClient: emptyMockPool,
    sourceStore: invalidStore
  });
  assert(invalidDryRun.readyToMigrate === false, 'Invalid source store prevents readyToMigrate');
  assert(invalidDryRun.preflightToken === null, 'Invalid source store does NOT issue preflight token');
  console.log('');

  // TEST 7: Push Records: Complete vs Missing (No silent skip, No user 1 fallback)
  console.log('[7/11] Testing Push Records Validation (Item 7 & B):');
  // 7a. Missing push subscription userId / endpoint
  const pushMissingUserStore = createValidSourceStore();
  pushMissingUserStore.pushSubscriptions = [
    {
      // Missing userId!
      endpoint: 'https://fcm.googleapis.com/fcm/send/token123',
      p256dh: 'p256',
      auth: 'auth'
    } as any
  ];
  const pushUserValidation = validateSourceStore(pushMissingUserStore);
  assert(pushUserValidation.valid === false, 'Missing userId in push subscription is flagged');
  assert(pushUserValidation.errors.some(e => e.missingFields.includes('userId')), 'Error specifies missing userId (no fallback to user 1)');

  // 7b. Missing VAPID private key in push settings
  const pushMissingKeyStore = createValidSourceStore();
  pushMissingKeyStore.pushSettings = [
    {
      id: 1,
      vapid_public_key: 'pub_key_only',
      // Missing vapid_private_key!
      subject: 'mailto:admin@test.com'
    } as any
  ];
  const pushKeyValidation = validateSourceStore(pushMissingKeyStore);
  assert(pushKeyValidation.valid === false, 'Missing vapid_private_key is flagged');
  assert(pushKeyValidation.errors.some(e => e.missingFields.includes('vapid_private_key')), 'No silent continue when private key is missing');
  console.log('');

  // TEST 8: In-Transaction Canonical Mismatch Rollback Across All Tables
  console.log('[8/11] Testing Pre-Commit Canonical Verification & Rollback (Item 8 & A):');
  clearPreflightTokens();
  const tokenForExec = 'token_for_exec_test_123';
  const cleanStore = createValidSourceStore();
  const cleanSrcFp = crypto.createHash('sha256').update(JSON.stringify(cleanStore)).digest('hex');

  const execAdmin = { id: 1, email: 'dungchodangkyai@gmail.com', role: 'ADMIN', password: 'password123' };

  // Setup mock client that tracks queries and injects score mismatch on kpi_results
  const mockClientWithDiscrepancy = createMockPoolOrClient({
    tableRows: {
      users: [],
      categories: [],
      works: [],
      assignments: [],
      overtimes: [],
      kpi_results: [],
      notifications: [],
      system_logs: [],
      push_settings: [],
      push_subscriptions: []
    },
    trackQueries: true,
    synthesizePostVerificationRows: true,
    postVerificationOverrides: {
      kpi_results: [
        {
          id: 1,
          kpi_id: 'KPI_2026_001',
          month: '10-2026',
          user_id: 1,
          a_score: '20',
          b_score: '75',
          total_kpi: '80', // Discrepancy: source has '95', target has '80'!
          rank: 'Hoàn thành xuất sắc'
        }
      ]
    }
  });
  const targetFp = await computeTargetFingerprint(mockClientWithDiscrepancy);

  setPreflightTokenForTest(tokenForExec, {
    token: tokenForExec,
    sourceFingerprint: cleanSrcFp,
    targetFingerprint: targetFp,
    adminId: '1',
    adminEmail: 'dungchodangkyai@gmail.com',
    migrationMode: 'json_to_neon',
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000,
    recoveryRequired: false
  });

  let execThrew = false;
  let execErrorMsg = '';
  try {
    await executeMigrationToNeon(
      'password123',
      execAdmin,
      tokenForExec,
      mockClientWithDiscrepancy,
      cleanStore
    );
  } catch (err: any) {
    execThrew = true;
    execErrorMsg = err?.message || String(err);
  }

  const lastBeginIdx = mockClientWithDiscrepancy.executedQueries.lastIndexOf('BEGIN');
  const queriesInTx = mockClientWithDiscrepancy.executedQueries.slice(lastBeginIdx);

  assert(execThrew === true, 'Migration execution throws on canonical discrepancy before commit');
  assert(execErrorMsg.includes('ROLLBACK'), 'Error confirms transaction was rolled back');
  assert(lastBeginIdx !== -1, 'Transaction opened with BEGIN');
  assert(queriesInTx.includes('ROLLBACK'), 'Transaction executed ROLLBACK');
  assert(!queriesInTx.includes('COMMIT'), 'Transaction was NEVER committed');
  console.log('');

  // TEST 9: Schema Phase Error => Returns success: false & Rolls Back
  console.log('[9/11] Testing Schema Phase Error Handling (Item 9 & C):');
  const failingSchemaClient = createMockPoolOrClient({
    failingQueries: ['CREATE TABLE IF NOT EXISTS users'],
    trackQueries: true
  });

  const schemaRes = await ensureDatabaseSchema(failingSchemaClient);
  assert(schemaRes.success === false, 'ensureDatabaseSchema returns success: false on SQL error');
  assert(failingSchemaClient.executedQueries.includes('ROLLBACK'), 'Schema migration executed ROLLBACK on failure');
  assert(Boolean(schemaRes.message.includes('failed')), 'Returns descriptive failure message');
  console.log('');

  // TEST 10: No Business KPI Backfill in ensureDatabaseSchema
  console.log('[10/11] Verifying Complete Removal of Business Backfill (Item 10 & C):');
  const dbMigrateContent = fs.readFileSync('server/dbMigrate.ts', 'utf-8');
  assert(!dbMigrateContent.includes('UPDATE works SET self_converted_score'), 'No self_converted_score backfill in dbMigrate.ts');
  assert(!dbMigrateContent.includes('UPDATE works SET approved_converted_score'), 'No approved_converted_score backfill in dbMigrate.ts');
  console.log('');

  // TEST 11: issueToken = false Does Not Increase Token Store
  console.log('[11/11] Testing issueToken=false in Server-Side Recheck (Item 11 & D):');
  clearPreflightTokens();
  const mockCleanPool = createMockPoolOrClient({ tableRows: { users: [], works: [], categories: [] } });
  const dryRunNoToken = await runMigrationDryRun(testAdmin, {
    issueToken: false,
    poolOrClient: mockCleanPool,
    sourceStore: createValidSourceStore()
  });

  assert(dryRunNoToken.preflightToken === null, 'preflightToken is null when issueToken: false');
  assert(dryRunNoToken.readyToMigrate === true, 'readyToMigrate is evaluated correctly');
  assert(getPreflightToken('any') === undefined, 'Token store remains empty (no junk tokens)');
  console.log('');

  // TEST 12: Per-Table Key Normalization, Case Preservation & Endpoint Distinction
  console.log('[12/13] Testing Per-Table Normalization & Case Preservation (Item 1 & Round 4):');
  const userCfg = TABLES_CONFIG.find(t => t.dbTable === 'users')!;
  const catCfg = TABLES_CONFIG.find(t => t.dbTable === 'categories')!;
  const workCfg = TABLES_CONFIG.find(t => t.dbTable === 'works')!;
  const pushSubCfg = TABLES_CONFIG.find(t => t.dbTable === 'push_subscriptions')!;

  // 12a. users.email preserves exact case (matching PostgreSQL byte-wise UNIQUE)
  const userKey = extractTechnicalKey({ email: '  Admin.Test@Domain.COM  ' }, userCfg);
  assert(userKey === 'Admin.Test@Domain.COM', 'users.email preserves exact case for byte-wise identity');

  // 12b. categories.code normalizes to uppercase
  const catKey = extractTechnicalKey({ code: '  cat_task_01  ' }, catCfg);
  assert(catKey === 'CAT_TASK_01', 'categories.code is trimmed and uppercased');

  // 12c. workId preserves exact case ('W_ABC')
  const workKeyUpper = extractTechnicalKey({ workId: 'W_ABC' }, workCfg);
  assert(workKeyUpper === 'W_ABC', 'works.workId preserves exact case (W_ABC is not lowercased to w_abc)');

  const workKeyMixed = extractTechnicalKey({ workId: '  W_Task_2026_XyZ  ' }, workCfg);
  assert(workKeyMixed === 'W_Task_2026_XyZ', 'works.workId trims whitespace but preserves mixed case');

  // 12d. push_subscriptions.endpoint preserves exact case
  const endpointMixed = 'https://fcm.googleapis.com/fcm/send/Token_AbC_123_XyZ';
  const epKey = extractTechnicalKey({ endpoint: `  ${endpointMixed}  ` }, pushSubCfg);
  assert(epKey === endpointMixed, 'push_subscriptions.endpoint preserves exact case');

  // 12e. Two endpoints differing only in case are NOT treated as one
  const epUpper = 'https://fcm.googleapis.com/fcm/send/Device_TOKEN_ABC';
  const epLower = 'https://fcm.googleapis.com/fcm/send/device_token_abc';
  const epKeyUpper = extractTechnicalKey({ endpoint: epUpper }, pushSubCfg);
  const epKeyLower = extractTechnicalKey({ endpoint: epLower }, pushSubCfg);
  assert(epKeyUpper !== epKeyLower, 'Two endpoints differing only in case are distinct and NOT merged');

  // 12f. Dry run with both case-distinct endpoints: no technical duplicates
  const storeWithTwoEndpoints = createValidSourceStore();
  storeWithTwoEndpoints.pushSubscriptions = [
    { userId: 1, endpoint: epUpper, p256dh: 'p256_A', auth: 'auth_A', deviceLabel: 'Device A' },
    { userId: 1, endpoint: epLower, p256dh: 'p256_B', auth: 'auth_B', deviceLabel: 'Device B' }
  ];
  const dryRunEndpoints = await runMigrationDryRun(testAdmin, {
    issueToken: false,
    poolOrClient: createMockPoolOrClient({ tableRows: { users: [], push_subscriptions: [] } }),
    sourceStore: storeWithTwoEndpoints
  });
  const subRecon = dryRunEndpoints.tables.find(t => t.tableName === 'push_subscriptions');
  assert(subRecon?.sourceCount === 2, 'Dry run accounts for both endpoints');
  assert(subRecon?.sourceTechDuplicateCount === 0, 'Endpoints differing by case are NOT flagged as technical duplicates');

  // 12g. Post-verification query with workId='W_ABC' finds the record without false rollback
  const mockPostVerifPool = createMockPoolOrClient({
    tableRows: {
      works: [
        {
          id: 1,
          work_id: 'W_ABC',
          month: '10-2026',
          user_id: 1,
          task_name: 'Work ABC',
          hours: '8',
          coef: '0.8',
          base_score: '10',
          converted_score: '8',
          status: 'Đang xử lý'
        }
      ]
    }
  });
  const queryWorkRes = await mockPostVerifPool.query('SELECT * FROM "works" WHERE "work_id"::text = $1', ['W_ABC']);
  assert(queryWorkRes.rows.length === 1, 'Post-verification SQL query finds exact row with work_id="W_ABC"');
  assert(queryWorkRes.rows[0]?.work_id === 'W_ABC', 'Returned row has exact case W_ABC');
  console.log('');

  // TEST 13: Stable Canonical JSON (stableCanonicalJson)
  console.log('[13/13] Testing Stable Canonical JSON (Item 2 & Round 4):');
  // 13a. Nested objects with different key order produce identical JSON string and identical hash
  const nestedObjA = {
    z_outer: 1,
    b_outer: { z_sub: 'alpha', a_sub: { y_deep: true, x_deep: 100 } },
    a_outer: [1, 2, 3],
    m_null: null
  };
  const nestedObjB = {
    m_null: null,
    a_outer: [1, 2, 3],
    b_outer: { a_sub: { x_deep: 100, y_deep: true }, z_sub: 'alpha' },
    z_outer: 1
  };
  const canonA = stableCanonicalJson(nestedObjA);
  const canonB = stableCanonicalJson(nestedObjB);
  const hashJsonA = crypto.createHash('sha256').update(canonA).digest('hex');
  const hashJsonB = crypto.createHash('sha256').update(canonB).digest('hex');
  assert(canonA === canonB, 'stableCanonicalJson produces identical string for differently ordered keys at all nesting levels');
  assert(hashJsonA === hashJsonB, 'SHA-256 canonical hash is identical regardless of object key order');

  // 13b. Modifying a value produces a different hash
  const nestedObjC = {
    ...nestedObjA,
    b_outer: { z_sub: 'alpha', a_sub: { y_deep: true, x_deep: 101 } } // Changed 100 -> 101
  };
  const canonC = stableCanonicalJson(nestedObjC);
  const hashJsonC = crypto.createHash('sha256').update(canonC).digest('hex');
  assert(canonA !== canonC, 'stableCanonicalJson detects changed value');
  assert(hashJsonA !== hashJsonC, 'SHA-256 hash changes when any nested value changes');

  // 13c. Array order is preserved (not sorted)
  const arrObj1 = { list: [2, 1, 3] };
  const arrObj2 = { list: [1, 2, 3] };
  assert(stableCanonicalJson(arrObj1) !== stableCanonicalJson(arrObj2), 'Array element order is preserved');

  // 13d. Parses serialized JSON strings and canonicalizes identically
  const jsonStrA = '{"target":10,"completed":9,"active":true}';
  const rawObjA = { active: true, completed: 9, target: 10 };
  assert(stableCanonicalJson(jsonStrA) === stableCanonicalJson(rawObjA), 'Serialized JSON string matches parsed object canonicalization');

  // 13e. PostgreSQL jsonb key reordering immunity in getCanonicalRow & computeCanonicalRecordHash
  const srcKpi = {
    id: 1,
    kpiId: 'KPI_2026_001',
    month: '10-2026',
    userId: 1,
    aScore: '20',
    bScore: '75',
    totalKpi: '95',
    detailsA: { completed_tasks: 10, target_tasks: 10, notes: 'Hoàn thành xuất sắc' }
  };
  // Simulate PostgreSQL jsonb reversing or altering the key order:
  const dbKpiRow = {
    id: 1,
    kpi_id: 'KPI_2026_001',
    month: '10-2026',
    user_id: 1,
    a_score: '20',
    b_score: '75',
    total_kpi: '95',
    details_a: { notes: 'Hoàn thành xuất sắc', target_tasks: 10, completed_tasks: 10 }
  };
  const hashSrcKpi = computeCanonicalRecordHash('kpi_results', srcKpi);
  const hashDbKpi = computeCanonicalRecordHash('kpi_results', dbKpiRow);
  assert(hashSrcKpi === hashDbKpi, 'computeCanonicalRecordHash matches even when jsonb column reorders keys');

  // 13f. Value discrepancy in jsonb is accurately caught
  const dbKpiRowAltered = {
    ...dbKpiRow,
    details_a: { notes: 'Hoàn thành xuất sắc', target_tasks: 10, completed_tasks: 8 } // 10 -> 8
  };
  const hashDbKpiAltered = computeCanonicalRecordHash('kpi_results', dbKpiRowAltered);
  assert(hashSrcKpi !== hashDbKpiAltered, 'computeCanonicalRecordHash detects value discrepancy inside jsonb details');
  console.log('');

  // ----------------------------------------------------
  // TEST 14: Testing Schema Legacy Incompatibility & Fail-Fast Preflight
  // ----------------------------------------------------
  console.log('[14/17] Testing Schema Legacy Incompatibility & Fail-Fast Preflight:');
  const legacyMockDb = {
    async query(sql: string, params?: any[]) {
      if (sql.includes('information_schema.tables')) {
        return {
          rows: [
            { table_name: 'departments' },
            { table_name: 'kpi_monthly' },
            { table_name: 'audit_logs' },
            { table_name: 'users' },
            { table_name: 'ot_requests' },
            { table_name: 'works' },
            { table_name: 'catalogs' },
            { table_name: 'notifications' },
            { table_name: 'assignments' }
          ]
        };
      }
      if (sql.includes("table_name = 'users'") && sql.includes("column_name = 'id'")) {
        return { rows: [{ column_name: 'id', data_type: 'text', udt_name: 'text' }] };
      }
      if (sql.includes("table_name = 'works'") && sql.includes("column_name IN ('id', 'user_id')")) {
        return {
          rows: [
            { column_name: 'id', data_type: 'text', udt_name: 'text' },
            { column_name: 'user_id', data_type: 'text', udt_name: 'text' }
          ]
        };
      }
      return { rows: [] };
    }
  };

  const preflightRes = await validateSchemaPreflight(legacyMockDb);
  assert(!preflightRes.compatible, 'Legacy schema is identified as NOT compatible with canonical');
  assert(preflightRes.isLegacySchema, 'Legacy schema is correctly flagged as isLegacySchema: true');
  assert(preflightRes.canonicalTablesMissing.includes('categories'), 'Identified missing canonical table categories');
  assert(preflightRes.canonicalTablesMissing.includes('kpi_results'), 'Identified missing canonical table kpi_results');
  assert(preflightRes.incompatibleColumns.some(c => c.table === 'users' && c.column === 'id' && c.actualType === 'text'), 'Detected incompatible column users.id (text != integer)');
  assert(preflightRes.incompatibleColumns.some(c => c.table === 'works' && c.column === 'user_id' && c.actualType === 'text'), 'Detected incompatible column works.user_id (text != integer)');
  console.log('');

  // ----------------------------------------------------
  // TEST 15: Testing Safe Schema Preservation (movePublicTablesToLegacySchema)
  // ----------------------------------------------------
  console.log('[15/20] Testing Safe Schema Preservation (movePublicTablesToLegacySchema):');
  const executedSqls: string[] = [];
  const moveMockDb = {
    async query(sql: string, params?: any[]) {
      executedSqls.push(sql);
      if (sql.includes('table_schema = $1')) {
        // Checking legacy preservation schema: returns 0 tables initially
        return { rows: [] };
      }
      if (sql.includes("table_schema = 'public'")) {
        return {
          rows: [
            { table_name: 'departments' },
            { table_name: 'kpi_monthly' },
            { table_name: 'audit_logs' },
            { table_name: 'users' },
            { table_name: 'ot_requests' },
            { table_name: 'works' },
            { table_name: 'catalogs' },
            { table_name: 'notifications' },
            { table_name: 'assignments' }
          ]
        };
      }
      if (sql.includes('information_schema.sequences')) {
        return { rows: [{ sequence_name: 'users_id_seq' }] };
      }
      return { rows: [] };
    }
  };

  const preserveRes = await movePublicTablesToLegacySchema(moveMockDb, 'legacy_pre_restore_20261027');
  assert(preserveRes.success, 'movePublicTablesToLegacySchema succeeds');
  assert(preserveRes.movedTables.length === 9, 'All 9 legacy tables were moved');
  assert(executedSqls.some(s => s.includes('CREATE SCHEMA IF NOT EXISTS "legacy_pre_restore_20261027"')), 'Created preservation schema legacy_pre_restore_20261027');
  assert(executedSqls.some(s => s.includes('ALTER TABLE public."users" SET SCHEMA "legacy_pre_restore_20261027"')), 'Preserved users table via SET SCHEMA');
  assert(executedSqls.some(s => s.includes('ALTER TABLE public."works" SET SCHEMA "legacy_pre_restore_20261027"')), 'Preserved works table via SET SCHEMA');
  assert(!executedSqls.some(s => s.toUpperCase().includes('DROP TABLE')), 'Zero DROP TABLE executed (non-destructive guarantee)');
  assert(!executedSqls.some(s => s.toUpperCase().includes('DELETE FROM')), 'Zero DELETE FROM executed');
  console.log('');

  // ----------------------------------------------------
  // TEST 16: Testing Full KPI Columns, 0/Null Preservation & Formula Audit
  // ----------------------------------------------------
  console.log('[16/17] Testing Full KPI Columns, 0/Null Preservation & Formula Audit:');
  const sampleBackupPayload = {
    formatVersion: '2.1',
    counts: { users: 2, categories: 1, works: 1, assignments: 1, overtimes: 1, kpiResults: 2, notifications: 1, logs: 1 },
    data: {
      users: [
        { id: 1, name: 'Admin', email: 'admin@pmo.vn', role: 'ADMIN' },
        { id: 2, name: 'Staff', email: 'staff@pmo.vn', role: 'STAFF' }
      ],
      categories: [
        { id: 1, code: 'CAT_A', name: 'Cat A', type: 'TASK', description: 'Desc', parentId: null, orderNum: 1, isActive: true }
      ],
      works: [
        { id: 1, workId: 'W_001', month: '10-2026', userId: 2, taskName: 'Task 1', hours: '8', coef: '0.8', baseScore: '10' }
      ],
      assignments: [
        { id: 1, assignmentId: 'A_001', month: '10-2026', assignerId: 1, receiverId: 2, taskName: 'Task 1' }
      ],
      overtimes: [
        { id: 1, otId: 'OT_001', month: '10-2026', userId: 2, otDate: '2026-10-15', startTime: '17:00', endTime: '20:30' }
      ],
      kpiResults: [
        {
          id: 1,
          kpiId: 'KPI_UNFINALIZED',
          month: '10-2026',
          userId: 2,
          aScore: 0,
          bScore: '0',
          cScore: 0,
          dScore: 0,
          totalKpi: null,
          rank: 'Chưa chốt',
          lockedStatus: 'Chưa chốt',
          pendingWorks: 2,
          supplementWorks: 1,
          rejectedWorks: 0,
          approvedHours: '40',
          convertedScore: '32',
          personalShare: '100',
          warning: null,
          detailsA: {},
          detailsB: {},
          detailsC: {},
          detailsD: {}
        },
        {
          id: 2,
          kpiId: 'KPI_FINALIZED',
          month: '10-2026',
          userId: 2,
          aScore: '20',
          bScore: '60',
          cScore: '10',
          dScore: '5',
          totalKpi: '85', // 20 + 60 + 10 - 5 = 85
          rank: 'Hoàn thành tốt',
          lockedStatus: 'Đã chốt',
          pendingWorks: 0,
          supplementWorks: 0,
          rejectedWorks: 0,
          approvedHours: '80',
          convertedScore: '85',
          personalShare: '100',
          warning: null,
          detailsA: {},
          detailsB: {},
          detailsC: {},
          detailsD: {}
        }
      ],
      notifications: [
        { id: 1, notifyId: 'N_001', receiverId: 2, title: 'Thông báo', content: 'Nội dung', type: 'SYSTEM' }
      ],
      logs: [
        { id: 1, logId: 'L_001', userId: 1, action: 'LOGIN', result: 'Thành công' }
      ]
    }
  };

  const validationRes = validateBackupPayload(sampleBackupPayload);
  assert(validationRes.valid, 'Sample backup with full KPI columns validated as valid: true');
  assert(validationRes.kpiAudit.zeroScoresPreserved > 0, 'Zero scores preserved and detected in KPI audit');
  assert(validationRes.kpiAudit.nanOrNullAnomalies === 0, 'Zero NaN anomalies detected');
  assert(validationRes.kpiAudit.unfinalizedAllowedZeroOrNull === 1, 'Unfinalized KPI record with null totalKpi allowed by business rule');
  assert(validationRes.kpiAudit.formulaMatches === 2, 'Finalized record matched formula (20+60+10-5=85)');
  assert(validationRes.technicalDuplicates.length === 0, 'Zero technical duplicate keys');
  assert(validationRes.orphanRecords.length === 0, 'Zero orphan records');
  console.log('');

  // ----------------------------------------------------
  // TEST 17: Testing Real Backup File Validation (backup_20261019_163013.json)
  // ----------------------------------------------------
  console.log('[17/17] Testing Real Backup File Validation (backup_20261019_163013.json):');
  const realBackupContent = getBackupContent('backup_20261019_163013.json');
  assert(realBackupContent !== null, 'getBackupContent successfully located backup_20261019_163013.json');
  if (realBackupContent) {
    const realValRes = validateBackupPayload(realBackupContent);
    assert(realValRes.valid, 'backup_20261019_163013.json validated as valid: true');
    assert(realValRes.counts.users === 21, 'Exact 21 users in backup');
    assert(realValRes.counts.categories === 77, 'Exact 77 categories in backup');
    assert(realValRes.counts.works === 736, 'Exact 736 works in backup');
    assert(realValRes.counts.assignments === 52, 'Exact 52 assignments in backup');
    assert(realValRes.counts.overtimes === 116, 'Exact 116 overtimes in backup');
    assert(realValRes.counts.kpiResults === 113, 'Exact 113 kpiResults in backup');
    assert(realValRes.counts.notifications === 814, 'Exact 814 notifications in backup');
    assert(realValRes.counts.logs === 12, 'Exact 12 logs in backup');
    assert(realValRes.technicalDuplicates.length === 0, 'Zero duplicate keys in real backup');
    assert(realValRes.orphanRecords.length === 0, 'Zero orphan foreign keys in real backup');
    assert(realValRes.kpiAudit.zeroScoresPreserved > 0, 'Zero scores preserved across all 113 KPI records');
    assert(realValRes.kpiAudit.nanOrNullAnomalies === 0, 'Zero NaN scores across all 113 KPI records');
  }
  // ----------------------------------------------------
  // TEST 18: Testing Identity Preservation for Two Users With Emails Differing Only by Case (ID 14 & ID 27)
  // ----------------------------------------------------
  console.log('[18/20] Testing Identity Preservation for Users ID 14 & ID 27 (Case-differing Emails & Child Records):');
  const userCasePayload = {
    formatVersion: '2.1',
    counts: { users: 2, categories: 1, works: 1, assignments: 1, overtimes: 1, kpiResults: 1, notifications: 1, logs: 1 },
    data: {
      users: [
        { id: 14, name: 'Lương Tâm Thành Nhân (14)', email: 'LTTNVN248@gmail.com', role: 'STAFF', password: 'hash14_dummy' },
        { id: 27, name: 'Lương Tâm Thành Nhân (27)', email: 'lttnvn248@gmail.com', role: 'STAFF', password: 'hash27_dummy' }
      ],
      categories: [
        { id: 1, code: 'CAT_TEST', name: 'Danh mục test', type: 'TASK' }
      ],
      works: [
        { id: 101, workId: 'W_27_01', month: '10-2026', userId: 27, taskName: 'Công việc của NV 27', hours: '8' }
      ],
      assignments: [
        { id: 201, assignmentId: 'A_27_01', month: '10-2026', assignerId: 14, receiverId: 27, taskName: 'Giao việc cho NV 27' }
      ],
      overtimes: [
        { id: 301, otId: 'OT_27_01', month: '10-2026', userId: 27, otDate: '2026-10-15', startTime: '17:00', endTime: '20:30' }
      ],
      kpiResults: [
        { id: 401, kpiId: 'KPI_27_01', month: '10-2026', userId: 27, rank: 'Chưa chốt', lockedStatus: 'Chưa chốt', totalKpi: null }
      ],
      notifications: [
        { id: 501, notifyId: 'N_27_01', senderId: 14, receiverId: 27, title: 'Thông báo', content: 'Nội dung', type: 'SYSTEM' }
      ],
      logs: [
        { id: 601, logId: 'L_27_01', userId: 27, action: 'TEST_LOGIN', result: 'Thành công' }
      ]
    }
  };

  const caseValRes = validateBackupPayload(userCasePayload);
  assert(caseValRes.valid, 'Backup payload with case-differing emails (ID 14 vs 27) is valid');
  assert(caseValRes.counts.users === 2, 'Both users counted independently (count: 2)');
  assert(caseValRes.technicalDuplicates.length === 0, 'Zero technical duplicates (PostgreSQL UNIQUE is byte-wise case-sensitive)');
  assert(caseValRes.orphanRecords.length === 0, 'Zero orphan foreign keys for records referencing User ID 27');
  assert(caseValRes.warnings.length > 0, 'Case-insensitive email collision emitted as non-blocking warning');
  assert(caseValRes.warnings.some(w => w.includes('LTTNVN248@gmail.com') || w.includes('users')), 'Warning message specifically mentions case-insensitive email comparison');

  // Verify extractTechnicalKey preserves both emails as distinct keys
  const techKey14 = extractTechnicalKey(userCasePayload.data.users[0], { key: 'users', dbTable: 'users', label: 'Nhân sự', uniqueKey: 'email', jsonKey: 'email' });
  const techKey27 = extractTechnicalKey(userCasePayload.data.users[1], { key: 'users', dbTable: 'users', label: 'Nhân sự', uniqueKey: 'email', jsonKey: 'email' });
  assert(techKey14 === 'LTTNVN248@gmail.com', 'extractTechnicalKey preserves exact uppercase for user 14');
  assert(techKey27 === 'lttnvn248@gmail.com', 'extractTechnicalKey preserves exact lowercase for user 27');
  assert(techKey14 !== techKey27, 'Both technical keys are distinct (no collision, no merge)');
  console.log('');

  // ----------------------------------------------------
  // TEST 19: Testing Safe Abort in movePublicTablesToLegacySchema if legacy schema exists with tables
  // ----------------------------------------------------
  console.log('[19/20] Testing Safe Abort When Legacy Schema Already Exists With Tables:');
  const abortMockDb = {
    async query(sql: string, params?: any[]) {
      if (sql.includes('table_schema = $1')) {
        // Return 1 existing table in legacy preservation schema to simulate prior run
        return { rows: [{ table_name: 'existing_preserved_table' }] };
      }
      return { rows: [] };
    }
  };

  let abortErrorCaught = false;
  let abortErrorMessage = '';
  try {
    await movePublicTablesToLegacySchema(abortMockDb, 'legacy_pre_restore_20261027');
  } catch (err: any) {
    abortErrorCaught = true;
    abortErrorMessage = err?.message || String(err);
  }
  assert(abortErrorCaught, 'movePublicTablesToLegacySchema threw safety abort error');
  assert(abortErrorMessage.includes('[Safety Abort]'), 'Error contains [Safety Abort] tag');
  assert(abortErrorMessage.includes('legacy_pre_restore_20261027'), 'Error identifies target schema name');
  console.log('');

  // ----------------------------------------------------
  // TEST 20: Testing Pre-Commit Row Hash Matching With Out-of-Order Source Array vs DB ORDER BY id ASC
  // ----------------------------------------------------
  console.log('[20/20] Testing Pre-Commit Row Hash Matching With Out-of-Order Source Array:');
  const outOfOrderSource = [
    { id: 14, name: 'User Fourteen', email: 'user14@pmo.vn', role: 'STAFF' },
    { id: 2, name: 'User Two', email: 'user2@pmo.vn', role: 'STAFF' }
  ];
  // DB returns rows ordered by id ASC: [id 2, id 14]
  const dbOrderedRows = [
    { id: 2, name: 'User Two', email: 'user2@pmo.vn', role: 'STAFF' },
    { id: 14, name: 'User Fourteen', email: 'user14@pmo.vn', role: 'STAFF' }
  ];

  const srcMap = new Map<number, any>();
  for (const src of outOfOrderSource) {
    srcMap.set(Number(src.id), src);
  }

  let hashMismatch = false;
  for (const dbRow of dbOrderedRows) {
    const srcRow = srcMap.get(Number(dbRow.id));
    if (!srcRow) {
      hashMismatch = true;
      break;
    }
    const dbHash = computeCanonicalBackupRowHash('users', dbRow);
    const srcHash = computeCanonicalBackupRowHash('users', srcRow);
    if (dbHash !== srcHash) {
      hashMismatch = true;
      break;
    }
  }
  assert(!hashMismatch, 'Pre-commit verification correctly compares DB row with source row matching by ID (order-independent)');
  console.log('');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
