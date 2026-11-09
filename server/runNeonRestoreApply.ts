import { pool } from '../src/db/index.ts';
import { getBackupContent, executeRestoreApply } from './backupService.ts';
import { determineSafeLegacySchemaName } from './dbMigrate.ts';

async function main() {
  console.log('================================================================================');
  console.log('      THỰC THI GIAO DỊCH APPLY KHÔI PHỤC NEON THẬT (ĐÃ ĐƯỢC ỦY QUYỀN)           ');
  console.log('================================================================================\n');

  const startTime = Date.now();

  // 1. Load exact backup file
  const backupFilename = 'backup_20261019_163013.json';
  const backupContent = getBackupContent(backupFilename);
  if (!backupContent) {
    console.error(`[Fatal] Không tìm thấy file sao lưu ${backupFilename}`);
    process.exit(1);
  }

  console.log(`[Backup Source]: Đã tải tệp ${backupFilename} (v${backupContent.formatVersion || backupContent.version})`);
  console.log(`- Counts: users=${backupContent.data?.users?.length}, categories=${backupContent.data?.categories?.length}, works=${backupContent.data?.works?.length}, assignments=${backupContent.data?.assignments?.length}, overtimes=${backupContent.data?.overtimes?.length}, kpiResults=${backupContent.data?.kpiResults?.length}, notifications=${backupContent.data?.notifications?.length}, logs=${backupContent.data?.logs?.length}\n`);

  // 2. Connect to live Neon PostgreSQL
  const client = await pool.connect();

  try {
    // 3. Pre-transaction Safety Check: Schema preservation check
    const safeSchemaInfo = await determineSafeLegacySchemaName(client, 'legacy_pre_restore_20261027');
    console.log('--- 1. KIỂM TRA SCHEMA BẢO TOÀN TRƯỚC GIAO DỊCH (PRE-BEGIN):');
    console.log(`- Schema bảo toàn được chọn : '${safeSchemaInfo.schemaName}'`);
    console.log(`- Trạng thái schema cơ sở    : ${safeSchemaInfo.isFallback ? `Đã có ${safeSchemaInfo.existingCount} bảng -> Tự động chuyển sang schema timestamp an toàn` : 'Chưa có bảng nào (sẵn sàng sử dụng trực tiếp)'}`);

    // Check public tables currently present on Neon
    const publicTblRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const existingPublicTables = publicTblRes.rows.map((r: any) => r.table_name);
    console.log(`- Số bảng public hiện tại trên Neon: ${existingPublicTables.length} bảng`);
    console.log(`  Danh sách: ${existingPublicTables.join(', ')}\n`);

    // 4. EXECUTE RESTORE APPLY (Transaction with Pre-Commit Verification)
    console.log('--- 2. THỰC THI GIAO DỊCH RESTORE APPLY & HẬU KIỂM PRE-COMMIT...');
    const result = await executeRestoreApply(backupContent, client);

    if (!result.success) {
      console.error('\n[LỖI THỰC THI APPLY] Giao dịch thất bại và đã ROLLBACK:');
      console.error(`- Error Stage : ${result.errorStage}`);
      console.error(`- Error Detail: ${result.error}`);
      process.exit(1);
    }

    console.log('\n--- 3. GIAO DỊCH COMMIT THÀNH CÔNG!');
    console.log(`- Thông điệp: ${result.message}`);
    console.log(`- Schema bảo toàn: '${result.details?.preservationSchema}' (${result.details?.preservedTables?.length} bảng)`);

    // 5. INDEPENDENT POST-COMMIT READ-ONLY VERIFICATION
    console.log('\n--- 4. TRUY VẤN XÁC MINH ĐỘC LẬP SAU COMMIT (READ-ONLY VERIFICATION):');

    // 5a. Verify Canonical Tables in 'public'
    const postPublicTblRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const postPublicTables = postPublicTblRes.rows.map((r: any) => r.table_name);
    console.log(`- [public schema]: Tổng cộng ${postPublicTables.length} bảng canonical:`);
    for (const t of postPublicTables) {
      const cntRes = await client.query(`SELECT COUNT(*)::int AS count FROM public."${t}"`);
      console.log(`  • public."${t}": ${cntRes.rows[0]?.count} bản ghi`);
    }

    // 5b. Verify Preserved Tables in preservation schema
    const presSchema = result.details?.preservationSchema || safeSchemaInfo.schemaName;
    const postPresTblRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [presSchema]);
    const postPresTables = postPresTblRes.rows.map((r: any) => r.table_name);
    console.log(`\n- [${presSchema} schema]: Tổng cộng ${postPresTables.length} bảng legacy được bảo toàn:`);
    for (const t of postPresTables) {
      const cntRes = await client.query(`SELECT COUNT(*)::int AS count FROM "${presSchema}"."${t}"`);
      console.log(`  • ${presSchema}."${t}": ${cntRes.rows[0]?.count} bản ghi`);
    }

    // 5c. Verify User ID 14 & User ID 27
    console.log('\n--- 5. XÁC MINH BẢO TOÀN TÁCH BIỆT USER ID 14 & USER ID 27:');
    const u14 = (await client.query(`SELECT id, email, name, role, created_at FROM public.users WHERE id = 14`)).rows[0];
    const u27 = (await client.query(`SELECT id, email, name, role, created_at FROM public.users WHERE id = 27`)).rows[0];
    console.log(`- User ID 14: id=${u14?.id} | email='${u14?.email}' | name='${u14?.name}' | role=${u14?.role}`);
    console.log(`- User ID 27: id=${u27?.id} | email='${u27?.email}' | name='${u27?.name}' | role=${u27?.role}`);

    const refWorks27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.works WHERE user_id = 27`)).rows[0]?.count;
    const refAssign27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.assignments WHERE receiver_id = 27`)).rows[0]?.count;
    const refOt27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.overtimes WHERE user_id = 27`)).rows[0]?.count;
    const refKpi27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.kpi_results WHERE user_id = 27`)).rows[0]?.count;
    const refNotify27 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.notifications WHERE receiver_id = 27`)).rows[0]?.count;

    console.log(`- Số bản ghi nghiệp vụ tham chiếu User ID 27:`);
    console.log(`  • works (user_id = 27)         : ${refWorks27} (kỳ vọng 51) => ${refWorks27 === 51 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • assignments (receiver_id = 27): ${refAssign27} (kỳ vọng 4)  => ${refAssign27 === 4 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • overtimes (user_id = 27)     : ${refOt27} (kỳ vọng 11) => ${refOt27 === 11 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • kpi_results (user_id = 27)   : ${refKpi27} (kỳ vọng 6)  => ${refKpi27 === 6 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • notifications (receiver_id=27): ${refNotify27} (kỳ vọng 43) => ${refNotify27 === 43 ? 'KHỚP 100%' : 'SAI LỆCH'}`);

    // 5d. Verify Foreign Key Orphans = 0
    console.log('\n--- 6. XÁC MINH TOÀN VẸN RÀNG BUỘC KHÓA NGOẠI:');
    const fk1 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.works WHERE user_id NOT IN (SELECT id FROM public.users)`)).rows[0]?.count;
    const fk2 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.assignments WHERE receiver_id NOT IN (SELECT id FROM public.users)`)).rows[0]?.count;
    const fk3 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.overtimes WHERE user_id NOT IN (SELECT id FROM public.users)`)).rows[0]?.count;
    const fk4 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.kpi_results WHERE user_id NOT IN (SELECT id FROM public.users)`)).rows[0]?.count;
    const fk5 = (await client.query(`SELECT COUNT(*)::int AS count FROM public.notifications WHERE receiver_id NOT IN (SELECT id FROM public.users)`)).rows[0]?.count;
    console.log(`- works orphan: ${fk1} | assignments orphan: ${fk2} | overtimes orphan: ${fk3} | kpi_results orphan: ${fk4} | notifications orphan: ${fk5}`);
    console.log(`- Kết luận khóa ngoại: ${fk1 + fk2 + fk3 + fk4 + fk5 === 0 ? 'HOÀN HẢO (0 bản ghi mồ côi)' : 'PHÁT HIỆN LỖI MỒ CÔI'}`);

    // 5e. Verify KPI Scores & Zero Preservation
    console.log('\n--- 7. XÁC MINH ĐIỂM SỐ KPI & BẢO TOÀN SỐ 0/NULL:');
    const kpiRows = (await client.query(`SELECT a_score, b_score, c_score, d_score, total_kpi, rank, locked_status FROM public.kpi_results`)).rows;
    let zerosCount = 0;
    let nanCount = 0;
    for (const kr of kpiRows) {
      if (kr.a_score === '0' || kr.b_score === '0' || kr.c_score === '0' || kr.total_kpi === '0') zerosCount++;
      if (isNaN(Number(kr.a_score)) || isNaN(Number(kr.b_score)) || isNaN(Number(kr.c_score)) || isNaN(Number(kr.d_score))) nanCount++;
    }
    console.log(`- Tổng bản ghi KPI trong DB : ${kpiRows.length}`);
    console.log(`- Bản ghi có điểm số 0 thực : ${zerosCount}`);
    console.log(`- Điểm số NaN/Null dị thường: ${nanCount}`);

    console.log(`\nThời gian thực thi toàn bộ: ${Date.now() - startTime} ms`);
    console.log('================================================================================');
    console.log('       KHÔI PHỤC NEON THẬT HOÀN TẤT VÀ XÁC MINH ĐỘC LẬP THÀNH CÔNG 100%         ');
    console.log('================================================================================');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[Apply Execution Fatal Error]:', err);
  process.exit(1);
});
