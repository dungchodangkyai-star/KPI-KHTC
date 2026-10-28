/**
 * READ-ONLY AUDIT SCRIPT: NEON POSTGRESQL VS JSON LOCAL STORE
 * 
 * STRICT CONSTRAINTS:
 * - 100% READ-ONLY: Executes ONLY SELECT queries. Zero INSERT, UPDATE, DELETE, ALTER, DROP, TRUNCATE.
 * - Does NOT modify Neon database or db-local-store.json.
 * - Redacts all sensitive emails, passwords, tokens, endpoints, connection strings, IPs.
 * 
 * Run with: npx tsx server/runReadOnlyAudit.ts
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { 
  TABLES_CONFIG, 
  extractTechnicalKey, 
  extractLogicalKey, 
  getCanonicalRow, 
  computeCanonicalRecordHash,
  stableCanonicalJson,
  maskEmail
} from './migrationService.ts';
import { calculateTotalKpi } from '../src/utils.ts';

const { Pool } = pg;

const DATA_STORE_PATH = path.join(process.cwd(), 'data', 'db-local-store.json');

function getDatabaseUrl(): string {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
}

async function runAudit() {
  const auditStartTime = Date.now();
  console.log('================================================================================');
  console.log('       AUDIT CHỈ ĐỌC (READ-ONLY) CƠ SỞ DỮ LIỆU NEON VS DATA/DB-LOCAL-STORE.JSON');
  console.log('================================================================================\n');

  // 1. Check Connection
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL is not configured in environment.');
    process.exit(1);
  }

  const isSslRequired = !dbUrl.includes('sslmode=disable') && !dbUrl.includes('127.0.0.1') && !dbUrl.includes('localhost');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isSslRequired ? { rejectUnauthorized: false } : undefined,
    max: 5,
    connectionTimeoutMillis: 10000,
  });

  // Verify connection with read-only query
  const testConn = await pool.query('SELECT 1 as connected, current_database() as db, version() as ver');
  console.log(`[Database Connection] Status: CONNECTED | Database: [REDACTED] | Version: ${testConn.rows[0]?.ver?.slice(0, 30)}...`);
  console.log(`[Safety Check] Connection Mode: STRICT READ-ONLY (Only SELECT queries will be executed)\n`);

  // 2. Read JSON Store
  if (!fs.existsSync(DATA_STORE_PATH)) {
    console.error(`ERROR: JSON store file not found at ${DATA_STORE_PATH}`);
    process.exit(1);
  }
  const rawJson = fs.readFileSync(DATA_STORE_PATH, 'utf-8');
  const jsonStore: Record<string, any[]> = JSON.parse(rawJson);
  console.log(`[JSON Store] Loaded file: data/db-local-store.json (${(rawJson.length / 1024 / 1024).toFixed(2)} MB)\n`);

  // ---------------------------------------------------------------------------
  // SECTION 1: SCHEMA & REQUIRED FIELDS AUDIT (ALL 10 TABLES IN NEON)
  // ---------------------------------------------------------------------------
  console.log('================================================================================');
  console.log('SECTION 1: KIỂM TRA SCHEMA & CÁC TRƯỜNG BẮT BUỘC TRÊN NEON (10 BẢNG)');
  console.log('================================================================================');

  const neonTableRows: Record<string, any[]> = {};
  const schemaSummary: Record<string, any> = {};

  for (const t of TABLES_CONFIG) {
    // 1a. Table existence & column list
    const colRes = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1 
      ORDER BY ordinal_position
    `, [t.dbTable]);

    const tableExists = colRes.rows.length > 0;
    const columns = colRes.rows.map((r: any) => ({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === 'YES'
    }));

    // 1b. Fetch all rows (READ-ONLY)
    let rows: any[] = [];
    if (tableExists) {
      const dataRes = await pool.query(`SELECT * FROM "${t.dbTable}"`);
      rows = dataRes.rows;
    }
    neonTableRows[t.dbTable] = rows;

    // 1c. Check duplicates in Neon
    const techKeysSeen = new Map<string, number>();
    const logicalKeysSeen = new Map<string, number>();

    let techDuplicates = 0;
    let logicalDuplicates = 0;

    for (const r of rows) {
      const tech = extractTechnicalKey(r, t);
      if (tech) {
        techKeysSeen.set(tech, (techKeysSeen.get(tech) || 0) + 1);
        if ((techKeysSeen.get(tech) || 0) === 2) techDuplicates++;
      }

      const log = extractLogicalKey(r, t.dbTable);
      if (log) {
        logicalKeysSeen.set(log, (logicalKeysSeen.get(log) || 0) + 1);
        if ((logicalKeysSeen.get(log) || 0) === 2) logicalDuplicates++;
      }
    }

    schemaSummary[t.dbTable] = {
      label: t.label,
      exists: tableExists,
      columnCount: columns.length,
      columns: columns.map(c => c.name),
      rowCount: rows.length,
      uniqueKey: t.uniqueKey,
      techDuplicates,
      logicalDuplicates
    };

    console.log(`- [${t.dbTable}] (${t.label}): Tồn tại: ${tableExists} | Số cột: ${columns.length} | Số dòng: ${rows.length} | Trùng khóa KT: ${techDuplicates} | Trùng logic: ${logicalDuplicates}`);
    if (tableExists && rows.length > 0 && (t.dbTable === 'users' || t.dbTable === 'works')) {
      console.log(`    Các cột thực tế của [${t.dbTable}] trên Neon: ${columns.map(c => c.name).join(', ')}`);
      const sample = { ...rows[0] };
      if (sample.password) sample.password = '[REDACTED]';
      if (sample.email) sample.email = maskEmail(sample.email);
      console.log(`    Mẫu dòng đầu tiên: ${JSON.stringify(sample)}`);
    }
  }
  console.log('');

  // ---------------------------------------------------------------------------
  // SECTION 2: ĐỐI CHIẾU NEON VS JSON THEO KHÓA CHUẨN HÓA (10 BẢNG)
  // ---------------------------------------------------------------------------
  console.log('================================================================================');
  console.log('SECTION 2: ĐỐI CHIẾU NEON VS JSON THEO KHÓA CHUẨN HÓA (10 BẢNG)');
  console.log('================================================================================');

  const reconciliationReport: Record<string, any> = {};

  for (const t of TABLES_CONFIG) {
    const rawJsonRecords = jsonStore[t.key] || (t.key === 'systemLogs' ? jsonStore['system_logs'] : []) || [];
    const neonRecords = neonTableRows[t.dbTable] || [];

    const jsonMap = new Map<string, any>();
    const neonMap = new Map<string, any>();

    // Index JSON records
    for (const j of rawJsonRecords) {
      const k = extractTechnicalKey(j, t);
      if (k) jsonMap.set(k, j);
    }

    // Index Neon records
    for (const n of neonRecords) {
      const k = extractTechnicalKey(n, t);
      if (k) neonMap.set(k, n);
    }

    let sameKeySameContent = 0;
    let sameKeyDifferentContent = 0;
    const diffSamples: any[] = [];
    let neonOnly = 0;
    let jsonOnly = 0;

    // Check JSON items against Neon
    for (const [k, jRow] of jsonMap.entries()) {
      const nRow = neonMap.get(k);
      if (!nRow) {
        jsonOnly++;
      } else {
        const jHash = computeCanonicalRecordHash(t.dbTable, jRow);
        const nHash = computeCanonicalRecordHash(t.dbTable, nRow);
        if (jHash === nHash) {
          sameKeySameContent++;
        } else {
          sameKeyDifferentContent++;
          if (diffSamples.length < 3) {
            const jCanon = getCanonicalRow(t.dbTable, jRow);
            const nCanon = getCanonicalRow(t.dbTable, nRow);
            const mismatchedFields: string[] = [];
            for (const field of Object.keys(jCanon)) {
              if (jCanon[field] !== nCanon[field]) {
                mismatchedFields.push(field);
              }
            }
            diffSamples.push({ key: k, mismatchedFields });
          }
        }
      }
    }

    // Check Neon-only items
    for (const k of neonMap.keys()) {
      if (!jsonMap.has(k)) {
        neonOnly++;
      }
    }

    reconciliationReport[t.dbTable] = {
      label: t.label,
      jsonCount: rawJsonRecords.length,
      neonCount: neonRecords.length,
      sameKeySameContent,
      sameKeyDifferentContent,
      neonOnly,
      jsonOnly,
      diffSamples
    };

    console.log(`[${t.dbTable}] (${t.label}):`);
    console.log(`   JSON: ${rawJsonRecords.length} | Neon: ${neonRecords.length}`);
    console.log(`   Khóa trùng, nội dung trùng (sameKeySameContent): ${sameKeySameContent}`);
    console.log(`   Khóa trùng, nội dung KHÁC (sameKeyDifferentContent): ${sameKeyDifferentContent}`);
    console.log(`   Chỉ có trên Neon (neonOnly): ${neonOnly}`);
    console.log(`   Chỉ có trong JSON (jsonOnly): ${jsonOnly}`);
    if (diffSamples.length > 0) {
      console.log(`   Mẫu sai lệch nội dung: ${JSON.stringify(diffSamples)}`);
    }
    console.log('');
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: PHÂN TÍCH CHUYÊN SÂU BẢNG WORKS (NEON 1.125 VS JSON 736)
  // ---------------------------------------------------------------------------
  console.log('================================================================================');
  console.log('SECTION 3: PHÂN TÍCH CHUYÊN SÂU BẢNG WORKS (NEON VS JSON)');
  console.log('================================================================================');

  const jsonWorks = jsonStore.works || [];
  const neonWorks = neonTableRows['works'] || [];

  console.log(`Tổng số bản ghi: Neon = ${neonWorks.length} | JSON = ${jsonWorks.length} (Chênh lệch: +${neonWorks.length - jsonWorks.length} bản ghi trên Neon)\n`);

  // Group by Month
  const neonWorksByMonth: Record<string, number> = {};
  const jsonWorksByMonth: Record<string, number> = {};
  for (const w of neonWorks) {
    const m = w.month || 'UNKNOWN';
    neonWorksByMonth[m] = (neonWorksByMonth[m] || 0) + 1;
  }
  for (const w of jsonWorks) {
    const m = w.month || 'UNKNOWN';
    jsonWorksByMonth[m] = (jsonWorksByMonth[m] || 0) + 1;
  }

  const allMonths = Array.from(new Set([...Object.keys(neonWorksByMonth), ...Object.keys(jsonWorksByMonth)])).sort();
  console.log('--- Phân bổ theo Tháng (Month):');
  for (const m of allMonths) {
    const nCount = neonWorksByMonth[m] || 0;
    const jCount = jsonWorksByMonth[m] || 0;
    console.log(`   Tháng ${m.padEnd(8)}: Neon = ${String(nCount).padStart(4)} | JSON = ${String(jCount).padStart(4)} | Chênh: ${nCount - jCount >= 0 ? '+' : ''}${nCount - jCount}`);
  }
  console.log('');

  // Group by User
  const neonWorksByUser: Record<string, number> = {};
  const jsonWorksByUser: Record<string, number> = {};
  for (const w of neonWorks) {
    const u = String(w.user_id ?? 'NULL');
    neonWorksByUser[u] = (neonWorksByUser[u] || 0) + 1;
  }
  for (const w of jsonWorks) {
    const u = String(w.userId ?? w.user_id ?? 'NULL');
    jsonWorksByUser[u] = (jsonWorksByUser[u] || 0) + 1;
  }

  const allUsers = Array.from(new Set([...Object.keys(neonWorksByUser), ...Object.keys(jsonWorksByUser)])).sort((a,b) => Number(a) - Number(b));
  console.log('--- Phân bổ theo Nhân sự (User ID):');
  for (const u of allUsers) {
    const nCount = neonWorksByUser[u] || 0;
    const jCount = jsonWorksByUser[u] || 0;
    console.log(`   User ID ${u.padEnd(4)}: Neon = ${String(nCount).padStart(4)} | JSON = ${String(jCount).padStart(4)} | Chênh: ${nCount - jCount >= 0 ? '+' : ''}${nCount - jCount}`);
  }
  console.log('');

  // Group by Status
  const neonWorksByStatus: Record<string, number> = {};
  const jsonWorksByStatus: Record<string, number> = {};
  for (const w of neonWorks) {
    const s = String(w.status || 'UNKNOWN');
    neonWorksByStatus[s] = (neonWorksByStatus[s] || 0) + 1;
  }
  for (const w of jsonWorks) {
    const s = String(w.status || 'UNKNOWN');
    jsonWorksByStatus[s] = (jsonWorksByStatus[s] || 0) + 1;
  }
  console.log('--- Phân bổ theo Trạng thái (Status):');
  const allStatuses = Array.from(new Set([...Object.keys(neonWorksByStatus), ...Object.keys(jsonWorksByStatus)]));
  for (const s of allStatuses) {
    const nCount = neonWorksByStatus[s] || 0;
    const jCount = jsonWorksByStatus[s] || 0;
    console.log(`   ${s.padEnd(20)}: Neon = ${String(nCount).padStart(4)} | JSON = ${String(jCount).padStart(4)} | Chênh: ${nCount - jCount >= 0 ? '+' : ''}${nCount - jCount}`);
  }
  console.log('');

  // Detailed Analysis of Neon-Only Works
  const workCfg = TABLES_CONFIG.find(t => t.dbTable === 'works')!;
  const jsonWorkKeySet = new Set<string>();
  const jsonWorkLogicalKeySet = new Set<string>();
  for (const w of jsonWorks) {
    const tk = extractTechnicalKey(w, workCfg);
    if (tk) jsonWorkKeySet.add(tk);
    const lk = extractLogicalKey(w, 'works');
    if (lk) jsonWorkLogicalKeySet.add(lk);
  }

  const neonOnlyWorks: any[] = [];
  let neonOnlyLogicalOverlapCount = 0; // Does a work with same user, month, task name already exist in JSON?
  let neonOnlyUniqueNewCount = 0;

  for (const w of neonWorks) {
    const tk = extractTechnicalKey(w, workCfg);
    if (tk && !jsonWorkKeySet.has(tk)) {
      neonOnlyWorks.push(w);
      const lk = extractLogicalKey(w, 'works');
      if (lk && jsonWorkLogicalKeySet.has(lk)) {
        neonOnlyLogicalOverlapCount++;
      } else {
        neonOnlyUniqueNewCount++;
      }
    }
  }

  console.log('--- Đánh giá tính chất 389+ bản ghi Neon-Only của bảng works:');
  console.log(`   Tổng số bản ghi Neon-Only: ${neonOnlyWorks.length}`);
  console.log(`   Bản ghi nghiệp vụ hoàn toàn mới (unique business tasks): ${neonOnlyUniqueNewCount}`);
  console.log(`   Bản ghi có trùng khóa logic với JSON (logical overlap): ${neonOnlyLogicalOverlapCount}`);

  // Inspect sample dates of Neon-Only works
  const neonOnlyCreatedDates = neonOnlyWorks.map(w => w.created_at || w.start_date).filter(Boolean).sort();
  console.log(`   Khoảng thời gian của Neon-Only works: từ ${neonOnlyCreatedDates[0]} đến ${neonOnlyCreatedDates[neonOnlyCreatedDates.length - 1]}`);
  
  // Check if any neon-only work has missing mandatory fields
  let neonOnlyMissingFields = 0;
  for (const w of neonOnlyWorks) {
    if (!w.work_id || !w.month || w.user_id === null || w.user_id === undefined || !w.task_name) {
      neonOnlyMissingFields++;
    }
  }
  console.log(`   Bản ghi Neon-Only thiếu trường bắt buộc: ${neonOnlyMissingFields}`);
  console.log('');

  // ---------------------------------------------------------------------------
  // SECTION 4: KIỂM TRA TOÀN VẸN KPI & ĐỐI CHIẾU CÔNG THỨC TÍNH TOÁN
  // ---------------------------------------------------------------------------
  console.log('================================================================================');
  console.log('SECTION 4: KIỂM TRA TOÀN VẸN KPI TRÊN NEON VÀ JSON');
  console.log('================================================================================');

  const neonKpi = neonTableRows['kpi_results'] || [];
  const jsonKpi = jsonStore.kpiResults || [];

  console.log(`Số bản ghi KPI: Neon = ${neonKpi.length} | JSON = ${jsonKpi.length}\n`);

  function auditKpiRecords(records: any[], sourceName: string) {
    let zeroScoresCount = 0;
    let nullOrNanScores = 0;
    let formulaMismatches = 0;
    const formulaDiffDetails: any[] = [];

    for (const r of records) {
      const a = Number(r.a_score ?? r.aScore ?? 0);
      const b = Number(r.b_score ?? r.bScore ?? 0);
      const c = Number(r.c_score ?? r.cScore ?? 0);
      const d = Number(r.d_score ?? r.dScore ?? 0);
      const storedTotal = Number(r.total_kpi ?? r.totalKpi ?? 0);

      // Zero check
      if (a === 0 || b === 0 || c === 0) zeroScoresCount++;

      // NaN check
      if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d) || isNaN(storedTotal)) {
        nullOrNanScores++;
      }

      // Recompute total KPI using app formula: Math.min(100, Math.max(0, A + B + C - D))
      const computedTotal = calculateTotalKpi(a, b, c, d);
      if (Math.abs(storedTotal - computedTotal) > 0.05) {
        formulaMismatches++;
        if (formulaDiffDetails.length < 3) {
          formulaDiffDetails.push({
            kpiId: r.kpi_id || r.kpiId,
            month: r.month,
            user_id: r.user_id || r.userId,
            stored: storedTotal,
            computed: computedTotal,
            components: { a, b, c, d }
          });
        }
      }
    }

    console.log(`[${sourceName} KPI Audit]:`);
    console.log(`   Tổng bản ghi kiểm tra: ${records.length}`);
    console.log(`   Bản ghi chứa điểm 0 hợp lệ (zero preservation): ${zeroScoresCount}`);
    console.log(`   Bản ghi có điểm bất thường NaN/Null: ${nullOrNanScores}`);
    console.log(`   Bản ghi lệch giữa total lưu trữ và công thức chuẩn (A+B+C-D): ${formulaMismatches}`);
    if (formulaDiffDetails.length > 0) {
      console.log(`   Mẫu lệch công thức: ${JSON.stringify(formulaDiffDetails)}`);
    }
    console.log('');
  }

  auditKpiRecords(neonKpi, 'NEON');
  auditKpiRecords(jsonKpi, 'JSON');

  // ---------------------------------------------------------------------------
  // SECTION 5: KIỂM TRA QUAN HỆ & BẢN GHI MỒ CÔI (ORPHAN RECORDS)
  // ---------------------------------------------------------------------------
  console.log('================================================================================');
  console.log('SECTION 5: KIỂM TRA TOÀN VẸN QUAN HỆ & BẢN GHI MỒ CÔI (ORPHANS)');
  console.log('================================================================================');

  const neonUsers = neonTableRows['users'] || [];
  const neonUserIds = new Set(neonUsers.map(u => Number(u.id)));

  const jsonUsers = jsonStore.users || [];
  const jsonUserIds = new Set(jsonUsers.map(u => Number(u.id)));

  console.log(`Số người dùng hợp lệ: Neon = ${neonUserIds.size} (${Array.from(neonUserIds).join(', ')}) | JSON = ${jsonUserIds.size}\n`);

  function checkOrphans(records: any[], userKey: string, tableName: string, validIds: Set<number>, sourceName: string) {
    let orphans = 0;
    const orphanSamples: any[] = [];
    for (const r of records) {
      const uid = Number(r[userKey] ?? r[userKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]);
      if (!validIds.has(uid)) {
        orphans++;
        if (orphanSamples.length < 3) orphanSamples.push({ record: r.id || r.work_id || r.workId || r.kpi_id, user_id: uid });
      }
    }
    console.log(`- [${sourceName}] ${tableName}.${userKey} -> users.id: Mồ côi = ${orphans}`);
    if (orphans > 0) {
      console.log(`    Mẫu mồ côi: ${JSON.stringify(orphanSamples)}`);
    }
  }

  console.log('--- Kiểm tra trên NEON:');
  checkOrphans(neonWorks, 'user_id', 'works', neonUserIds, 'NEON');
  checkOrphans(neonTableRows['assignments'] || [], 'receiver_id', 'assignments', neonUserIds, 'NEON');
  checkOrphans(neonTableRows['kpi_results'] || [], 'user_id', 'kpi_results', neonUserIds, 'NEON');
  checkOrphans(neonTableRows['overtimes'] || [], 'user_id', 'overtimes', neonUserIds, 'NEON');
  checkOrphans(neonTableRows['push_subscriptions'] || [], 'user_id', 'push_subscriptions', neonUserIds, 'NEON');
  console.log('');

  console.log('--- Kiểm tra trong JSON:');
  checkOrphans(jsonWorks, 'userId', 'works', jsonUserIds, 'JSON');
  checkOrphans(jsonStore.assignments || [], 'receiverId', 'assignments', jsonUserIds, 'JSON');
  checkOrphans(jsonStore.kpiResults || [], 'userId', 'kpiResults', jsonUserIds, 'JSON');
  checkOrphans(jsonStore.overtimes || [], 'userId', 'overtimes', jsonUserIds, 'JSON');
  checkOrphans(jsonStore.pushSubscriptions || [], 'userId', 'pushSubscriptions', jsonUserIds, 'JSON');
  console.log('');

  // ---------------------------------------------------------------------------
  // SECTION 6: KẾT LUẬN NGUỒN CHUẨN TẮC (CANONICAL SOURCE EVALUATION)
  // ---------------------------------------------------------------------------
  console.log('================================================================================');
  console.log('SECTION 6: ĐÁNH GIÁ & KẾT LUẬN NGUỒN DỮ LIỆU CHUẨN TẮC');
  console.log('================================================================================');

  const userCols = schemaSummary['users']?.columns || [];
  let neonActiveAdminCount = 0;
  if (userCols.includes('role') && userCols.includes('status')) {
    const adminRes = await pool.query(`
      SELECT COUNT(*)::int AS count 
      FROM users 
      WHERE role = 'ADMIN' AND status = 'Đang làm' AND password IS NOT NULL AND length(trim(password)) > 0
    `);
    neonActiveAdminCount = Number(adminRes.rows[0]?.count || 0);
  } else if (userCols.includes('role')) {
    const adminRes = await pool.query(`
      SELECT COUNT(*)::int AS count 
      FROM users 
      WHERE role = 'ADMIN'
    `);
    neonActiveAdminCount = Number(adminRes.rows[0]?.count || 0);
  } else {
    neonActiveAdminCount = neonUsers.length;
  }

  console.log(`Số lượng ADMIN hoạt động có mật khẩu trên Neon: ${neonActiveAdminCount}`);
  console.log(`Số lượng bảng chứa dữ liệu trên Neon: ${Object.keys(neonTableRows).filter(k => neonTableRows[k].length > 0).length}/10`);
  console.log(`Trạng thái trùng khóa kỹ thuật trên Neon: ${Object.values(schemaSummary).reduce((acc: number, cur: any) => acc + cur.techDuplicates, 0)}`);
  console.log(`Trạng thái trùng khóa logic trên Neon: ${Object.values(schemaSummary).reduce((acc: number, cur: any) => acc + cur.logicalDuplicates, 0)}`);

  console.log(`\nThời gian thực thi audit: ${Date.now() - auditStartTime} ms`);
  console.log('================================================================================\n');

  await pool.end();
}

runAudit().catch(err => {
  console.error('[Fatal Audit Error]:', err?.message || err);
  process.exit(1);
});
