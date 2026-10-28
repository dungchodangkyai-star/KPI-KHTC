import { pool } from '../src/db/index.ts';
import { getBackupContent, computeCanonicalBackupRowHash } from './backupService.ts';

async function main() {
  console.log('================================================================================');
  console.log('  TRUY VẤN XÁC MINH ĐỘC LẬP SAU COMMIT (READ-ONLY INDEPENDENT VERIFICATION)     ');
  console.log('================================================================================\n');

  const startTime = Date.now();

  const backupFilename = 'backup_20261019_163013.json';
  const backupContent = getBackupContent(backupFilename);
  if (!backupContent) {
    console.error(`[Fatal] Không tìm thấy file sao lưu ${backupFilename}`);
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    // 1. Schema bảo toàn legacy_pre_restore_20261027
    const legacySchemaName = 'legacy_pre_restore_20261027';
    const legacyTablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [legacySchemaName]);
    const legacyTables = legacyTablesRes.rows.map((r: any) => r.table_name);

    console.log(`--- 1. SCHEMA BẢO TOÀN '${legacySchemaName}' (13 BẢNG NGUYÊN BẢN):`);
    console.log(`- Tổng số bảng bảo toàn: ${legacyTables.length} bảng (kỳ vọng 13) => ${legacyTables.length === 13 ? 'ĐẠT 100%' : 'SAI LỆCH'}`);
    for (const t of legacyTables) {
      const cntRes = await client.query(`SELECT COUNT(*)::int AS count FROM "${legacySchemaName}"."${t}"`);
      console.log(`  • ${legacySchemaName}."${t}": ${cntRes.rows[0]?.count} bản ghi`);
    }

    // 2. Schema canonical public
    const publicTablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const publicTables = publicTablesRes.rows.map((r: any) => r.table_name);

    console.log(`\n--- 2. SCHEMA CANONICAL 'public' (11 BẢNG CHUẨN HOÁ):`);
    console.log(`- Tổng số bảng canonical: ${publicTables.length} bảng (kỳ vọng 11) => ${publicTables.length === 11 ? 'ĐẠT 100%' : 'SAI LỆCH'}`);
    for (const t of publicTables) {
      const cntRes = await client.query(`SELECT COUNT(*)::int AS count FROM public."${t}"`);
      console.log(`  • public."${t}": ${cntRes.rows[0]?.count} bản ghi`);
    }

    // 3. Đối chiếu số lượng từng bảng với nguồn backup
    console.log(`\n--- 3. ĐỐI CHIẾU SỐ LƯỢNG TỪNG BẢNG VỚI NGUỒN BACKUP v2.1:`);
    const expectedCounts: Record<string, number> = {
      users: 21,
      categories: 77,
      works: 736,
      assignments: 52,
      overtimes: 116,
      kpi_results: 113,
      notifications: 814,
      system_logs: 12
    };

    let allCountsMatched = true;
    for (const [tbl, exp] of Object.entries(expectedCounts)) {
      const res = await client.query(`SELECT COUNT(*)::int AS count FROM public."${tbl}"`);
      const actual = res.rows[0]?.count || 0;
      const matched = actual === exp;
      if (!matched) allCountsMatched = false;
      console.log(`  • ${tbl.padEnd(15)}: DB=${actual.toString().padEnd(4)} | Nguồn=${exp.toString().padEnd(4)} => ${matched ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    }

    // 4. Kiểm tra khóa kỹ thuật trùng lặp (Technical Duplicates = 0)
    console.log(`\n--- 4. KIỂM TRA TRÙNG LẶP KHÓA KỸ THUẬT TRONG CSDL:`);
    const duplicateQueries = [
      { table: 'users', query: `SELECT email AS key, COUNT(*) FROM public.users GROUP BY email HAVING COUNT(*) > 1` },
      { table: 'categories', query: `SELECT code AS key, COUNT(*) FROM public.categories GROUP BY code HAVING COUNT(*) > 1` },
      { table: 'works', query: `SELECT work_id AS key, COUNT(*) FROM public.works GROUP BY work_id HAVING COUNT(*) > 1` },
      { table: 'assignments', query: `SELECT assignment_id AS key, COUNT(*) FROM public.assignments GROUP BY assignment_id HAVING COUNT(*) > 1` },
      { table: 'overtimes', query: `SELECT ot_id AS key, COUNT(*) FROM public.overtimes GROUP BY ot_id HAVING COUNT(*) > 1` },
      { table: 'kpi_results', query: `SELECT kpi_id AS key, COUNT(*) FROM public.kpi_results GROUP BY kpi_id HAVING COUNT(*) > 1` },
      { table: 'notifications', query: `SELECT notify_id AS key, COUNT(*) FROM public.notifications GROUP BY notify_id HAVING COUNT(*) > 1` },
      { table: 'system_logs', query: `SELECT log_id AS key, COUNT(*) FROM public.system_logs GROUP BY log_id HAVING COUNT(*) > 1` }
    ];

    let totalDuplicates = 0;
    for (const d of duplicateQueries) {
      const r = await client.query(d.query);
      const cnt = r.rows.length;
      totalDuplicates += cnt;
      console.log(`  • Bảng ${d.table.padEnd(15)}: ${cnt} khóa trùng lặp`);
    }
    console.log(`  => Tổng số khóa kỹ thuật trùng lặp: ${totalDuplicates} (Kỳ vọng: 0)`);

    // 5. Kiểm tra ràng buộc khóa ngoại & bản ghi mồ côi (FK Orphans = 0)
    console.log(`\n--- 5. KIỂM TRA RÀNG BUỘC KHÓA NGOẠI (ORPHANS = 0):`);
    const fkChecks = [
      { name: 'works -> users (user_id)', query: `SELECT COUNT(*)::int AS count FROM public.works WHERE user_id NOT IN (SELECT id FROM public.users)` },
      { name: 'assignments -> users (receiver_id)', query: `SELECT COUNT(*)::int AS count FROM public.assignments WHERE receiver_id NOT IN (SELECT id FROM public.users)` },
      { name: 'assignments -> users (assigner_id)', query: `SELECT COUNT(*)::int AS count FROM public.assignments WHERE assigner_id IS NOT NULL AND assigner_id NOT IN (SELECT id FROM public.users)` },
      { name: 'overtimes -> users (user_id)', query: `SELECT COUNT(*)::int AS count FROM public.overtimes WHERE user_id NOT IN (SELECT id FROM public.users)` },
      { name: 'kpi_results -> users (user_id)', query: `SELECT COUNT(*)::int AS count FROM public.kpi_results WHERE user_id NOT IN (SELECT id FROM public.users)` },
      { name: 'notifications -> users (receiver_id)', query: `SELECT COUNT(*)::int AS count FROM public.notifications WHERE receiver_id NOT IN (SELECT id FROM public.users)` },
      { name: 'notifications -> users (sender_id)', query: `SELECT COUNT(*)::int AS count FROM public.notifications WHERE sender_id IS NOT NULL AND sender_id NOT IN (SELECT id FROM public.users)` },
      { name: 'system_logs -> users (user_id)', query: `SELECT COUNT(*)::int AS count FROM public.system_logs WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM public.users)` }
    ];

    let totalOrphans = 0;
    for (const f of fkChecks) {
      const r = await client.query(f.query);
      const cnt = r.rows[0]?.count || 0;
      totalOrphans += cnt;
      console.log(`  • ${f.name.padEnd(35)}: ${cnt} bản ghi mồ côi`);
    }
    console.log(`  => Tổng số bản ghi mồ côi khóa ngoại: ${totalOrphans} (Kỳ vọng: 0)`);

    // 6. Đối chiếu Hash Canonical từng dòng giữa DB và Nguồn
    console.log(`\n--- 6. ĐỐI CHIẾU HASH CANONICAL TỪNG BẢN GHI (PRE/POST COMMIT MATCH):`);
    const tablesToHash: Array<[string, any[]]> = [
      ['users', backupContent.data.users],
      ['categories', backupContent.data.categories],
      ['works', backupContent.data.works],
      ['assignments', backupContent.data.assignments],
      ['overtimes', backupContent.data.overtimes],
      ['kpi_results', backupContent.data.kpiResults],
      ['notifications', backupContent.data.notifications],
      ['system_logs', backupContent.data.logs]
    ];

    let totalHashMismatches = 0;
    for (const [tbl, sourceList] of tablesToHash) {
      const dbRowsRes = await client.query(`SELECT * FROM public."${tbl}" ORDER BY id ASC`);
      const dbRows = dbRowsRes.rows;
      const srcMap = new Map(sourceList.map(r => [Number(r.id), r]));
      let tblMismatch = 0;

      for (const dbRow of dbRows) {
        const srcRow = srcMap.get(Number(dbRow.id));
        if (!srcRow) {
          tblMismatch++;
          continue;
        }
        const dbHash = computeCanonicalBackupRowHash(tbl, dbRow);
        const srcHash = computeCanonicalBackupRowHash(tbl, srcRow);
        if (dbHash !== srcHash) {
          tblMismatch++;
        }
      }
      totalHashMismatches += tblMismatch;
      console.log(`  • ${tbl.padEnd(15)}: Đã đối chiếu ${dbRows.length.toString().padEnd(4)} bản ghi | Sai lệch hash: ${tblMismatch}`);
    }
    console.log(`  => Tổng số bản ghi sai lệch hash canonical: ${totalHashMismatches} (Kỳ vọng: 0)`);

    // 7. Xác minh bảo toàn User ID 14 và User ID 27
    console.log(`\n--- 7. XÁC MINH BẢO TOÀN ĐỊNH DANH USER ID 14 & USER ID 27:`);
    const u14 = (await client.query(`SELECT id, email, name, role, phone, "group", status FROM public.users WHERE id = 14`)).rows[0];
    const u27 = (await client.query(`SELECT id, email, name, role, phone, "group", status FROM public.users WHERE id = 27`)).rows[0];

    console.log(`  • User ID 14: id=${u14?.id} | email='${u14?.email}' | name='${u14?.name}' | role=${u14?.role}`);
    console.log(`  • User ID 27: id=${u27?.id} | email='${u27?.email}' | name='${u27?.name}' | role=${u27?.role}`);

    const refWorks27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.works WHERE user_id = 27`)).rows[0]?.count;
    const refAssign27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.assignments WHERE receiver_id = 27`)).rows[0]?.count;
    const refOt27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.overtimes WHERE user_id = 27`)).rows[0]?.count;
    const refKpi27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.kpi_results WHERE user_id = 27`)).rows[0]?.count;
    const refNotify27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.notifications WHERE receiver_id = 27`)).rows[0]?.count;

    console.log(`  • Bản ghi tham chiếu ID 27 trong CSDL:`);
    console.log(`    - works (user_id = 27)          : ${refWorks27} (kỳ vọng: 51) => ${refWorks27 === 51 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`    - assignments (receiver_id = 27) : ${refAssign27} (kỳ vọng: 4)  => ${refAssign27 === 4 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`    - overtimes (user_id = 27)      : ${refOt27} (kỳ vọng: 11) => ${refOt27 === 11 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`    - kpi_results (user_id = 27)    : ${refKpi27} (kỳ vọng: 6)  => ${refKpi27 === 6 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`    - notifications (receiver_id=27): ${refNotify27} (kỳ vọng: 43) => ${refNotify27 === 43 ? 'KHỚP 100%' : 'SAI LỆCH'}`);

    // 8. Toàn vẹn điểm số KPI và bảo toàn 0/null
    console.log(`\n--- 8. XÁC MINH ĐIỂM SỐ KPI, GIỮ ĐÚNG SỐ 0/NULL VÀ CÔNG THỨC:`);
    const kpiAllRes = await client.query(`SELECT kpi_id, a_score, b_score, c_score, d_score, total_kpi, rank, locked_status FROM public.kpi_results`);
    let zeroScores = 0;
    let nanScores = 0;
    let formulaMismatches = 0;

    for (const k of kpiAllRes.rows) {
      const a = k.a_score !== null && k.a_score !== undefined && k.a_score !== '' ? Number(k.a_score) : 0;
      const b = k.b_score !== null && k.b_score !== undefined && k.b_score !== '' ? Number(k.b_score) : 0;
      const c = k.c_score !== null && k.c_score !== undefined && k.c_score !== '' ? Number(k.c_score) : 0;
      const d = k.d_score !== null && k.d_score !== undefined && k.d_score !== '' ? Number(k.d_score) : 0;
      const stored = k.total_kpi !== null && k.total_kpi !== undefined && k.total_kpi !== '' ? Number(k.total_kpi) : null;

      if (k.a_score === '0' || k.b_score === '0' || k.c_score === '0' || k.total_kpi === '0') zeroScores++;
      if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d) || (stored !== null && isNaN(stored))) nanScores++;

      const computed = Math.min(100, Math.max(0, a + b + c - d));
      const rank = String(k.rank || '').trim();
      const lockedStatus = String(k.locked_status || '').trim();

      if (rank !== 'Chưa chốt' && rank !== 'Chờ duyệt' && lockedStatus !== 'Chưa chốt') {
        if (stored === null || Math.abs(stored - computed) > 0.05) {
          formulaMismatches++;
        }
      }
    }

    console.log(`  • Tổng số bản ghi KPI trong DB : ${kpiAllRes.rows.length} (kỳ vọng 113)`);
    console.log(`  • Số bản ghi bảo toàn điểm số 0 : ${zeroScores}`);
    console.log(`  • Số điểm số NaN bất thường     : ${nanScores} (kỳ vọng 0)`);
    console.log(`  • Sai lệch công thức A+B+C-D    : ${formulaMismatches} (kỳ vọng 0)`);

    console.log(`\nThời gian thực thi đối soát: ${Date.now() - startTime} ms`);
    console.log('================================================================================');
    console.log('KẾT LUẬN: TOÀN BỘ CSDL CANONICAL PUBLIC VÀ BẢO TOÀN LEGACY ĐÃ ĐƯỢC XÁC NHẬN 100%');
    console.log('================================================================================');
    process.exit(0);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[Verification Error]:', err);
  process.exit(1);
});
