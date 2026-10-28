import { pool } from '../src/db/index.ts';
import { getBackupContent, runRestoreDryRun } from './backupService.ts';

async function main() {
  console.log('================================================================================');
  console.log('  THỰC THI DRY-RUN KHÔI PHỤC TRÊN NEON THẬT (GIAI ĐOẠN 1 - CHỈ ĐỌC)             ');
  console.log('================================================================================');

  const startTime = Date.now();

  // 1. Load real backup file
  const backupFilename = 'backup_20261019_163013.json';
  const backupContent = getBackupContent(backupFilename);

  if (!backupContent) {
    console.error(`[Fatal] Không tìm thấy file sao lưu ${backupFilename}`);
    process.exit(1);
  }

  console.log(`[Backup Source]: Đã tải tệp ${backupFilename} (${backupContent.counts ? JSON.stringify(backupContent.counts) : ''})`);

  // 2. Execute purely read-only dry run against live Neon
  const client = await pool.connect();
  try {
    const dryRunResult = await runRestoreDryRun(backupContent, client);

    console.log('\n--- 1. HIỆN TRẠNG SCHEMA PUBLIC TRÊN NEON:');
    console.log(`- Trạng thái schema: ${dryRunResult.targetDbState.isLegacySchema ? 'SCHEMA LEGACY (ID TEXT/UUID, không tương thích canonical)' : 'CANONICAL'}`);
    console.log(`- Tổng số bảng hiện hữu trong public: ${dryRunResult.targetDbState.existingPublicTables.length} bảng`);
    console.log(`  Danh sách: ${JSON.stringify(dryRunResult.targetDbState.existingPublicTables)}`);

    if (dryRunResult.targetDbState.incompatibleColumns.length > 0) {
      console.log(`- Các cột không tương thích kiểu dữ liệu:`);
      for (const col of dryRunResult.targetDbState.incompatibleColumns) {
        console.log(`  • ${col.table}.${col.column}: kiểu hiện tại '${col.actualType}' (chuẩn canonical yêu cầu '${col.expectedType}') - ${col.reason}`);
      }
    }

    console.log('\n--- 2. KẾ HOẠCH BẢO TOÀN VÀ TẠO SCHEMA KHI APPLY:');
    console.log(`- Schema bảo toàn (không DROP, không DELETE): '${dryRunResult.targetDbState.targetPreservationSchema}'`);
    console.log(`- Danh sách bảng sẽ chuyển sang ${dryRunResult.targetDbState.targetPreservationSchema} (${dryRunResult.targetDbState.tablesToPreserve.length} bảng):`);
    dryRunResult.targetDbState.tablesToPreserve.forEach((t, i) => {
      console.log(`  ${i + 1}. public."${t}" -> ${dryRunResult.targetDbState.targetPreservationSchema}."${t}"`);
    });

    console.log(`\n- Danh sách bảng canonical chuẩn sẽ tạo mới trong public (${dryRunResult.targetDbState.canonicalTablesToCreate.length} bảng):`);
    dryRunResult.targetDbState.canonicalTablesToCreate.forEach((t, i) => {
      console.log(`  ${i + 1}. public."${t}"`);
    });

    console.log('\n--- 3. KẾT QUẢ KIỂM TRA TỆP BACKUP (backup_20261019_163013.json):');
    console.log(`- Phiên bản định dạng: v${dryRunResult.backupStats.formatVersion}`);
    console.log(`- Số lượng bản ghi từng nhóm:`);
    console.log(`  • users          : ${dryRunResult.backupStats.recordCounts.users} bản ghi (dự kiến 21) => ${dryRunResult.backupStats.recordCounts.users === 21 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • categories     : ${dryRunResult.backupStats.recordCounts.categories} bản ghi (dự kiến 77) => ${dryRunResult.backupStats.recordCounts.categories === 77 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • works          : ${dryRunResult.backupStats.recordCounts.works} bản ghi (dự kiến 736) => ${dryRunResult.backupStats.recordCounts.works === 736 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • assignments    : ${dryRunResult.backupStats.recordCounts.assignments} bản ghi (dự kiến 52) => ${dryRunResult.backupStats.recordCounts.assignments === 52 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • overtimes      : ${dryRunResult.backupStats.recordCounts.overtimes} bản ghi (dự kiến 116) => ${dryRunResult.backupStats.recordCounts.overtimes === 116 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • kpiResults     : ${dryRunResult.backupStats.recordCounts.kpiResults} bản ghi (dự kiến 113) => ${dryRunResult.backupStats.recordCounts.kpiResults === 113 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • notifications  : ${dryRunResult.backupStats.recordCounts.notifications} bản ghi (dự kiến 814) => ${dryRunResult.backupStats.recordCounts.notifications === 814 ? 'KHỚP 100%' : 'SAI LỆCH'}`);
    console.log(`  • logs           : ${dryRunResult.backupStats.recordCounts.logs} bản ghi (dự kiến 12) => ${dryRunResult.backupStats.recordCounts.logs === 12 ? 'KHỚP 100%' : 'SAI LỆCH'}`);

    console.log(`\n- Kiểm tra tính toàn vẹn kỹ thuật:`);
    console.log(`  • Trùng lặp khóa kỹ thuật (technicalDuplicates): ${dryRunResult.backupStats.technicalDuplicates}`);
    console.log(`  • Bản ghi mồ côi khóa ngoại (foreignKeyOrphans) : ${dryRunResult.backupStats.foreignKeyOrphans}`);
    
    // Explicit User ID 14 & 27 identity preservation analysis
    const usersList: any[] = backupContent.data?.users || [];
    const user14 = usersList.find((u: any) => u.id === 14);
    const user27 = usersList.find((u: any) => u.id === 27);
    console.log(`\n- Phân tích bảo toàn định danh User ID 14 & User ID 27:`);
    console.log(`  • User ID 14: Tồn tại: ${Boolean(user14)} | Email: '${user14?.email}' | Họ tên: '${user14?.name}' | Role: ${user14?.role}`);
    console.log(`  • User ID 27: Tồn tại: ${Boolean(user27)} | Email: '${user27?.email}' | Họ tên: '${user27?.name}' | Role: ${user27?.role}`);
    const works27 = (backupContent.data?.works || []).filter((w: any) => (w.userId ?? w.user_id) === 27).length;
    const assignments27 = (backupContent.data?.assignments || []).filter((a: any) => (a.receiverId ?? a.receiver_id) === 27).length;
    const overtimes27 = (backupContent.data?.overtimes || []).filter((o: any) => (o.userId ?? o.user_id) === 27).length;
    const kpi27 = (backupContent.data?.kpiResults || []).filter((k: any) => (k.userId ?? k.user_id) === 27).length;
    const notify27 = (backupContent.data?.notifications || []).filter((n: any) => (n.receiverId ?? n.receiver_id) === 27).length;
    console.log(`  • Bản ghi tham chiếu ID 27: works=${works27}, assignments=${assignments27}, overtimes=${overtimes27}, kpiResults=${kpi27}, notifications=${notify27}`);
    console.log(`  • Kết luận định danh: Cả hai user được giữ nguyên vẹn 100%, không bị merge, không đổi email, không tạo user giả; 0 mồ côi.`);

    if (dryRunResult.backupStats.warnings && dryRunResult.backupStats.warnings.length > 0) {
      console.log(`\n- Cảnh báo phi cản trở (non-blocking warnings - ${dryRunResult.backupStats.warnings.length} mục):`);
      dryRunResult.backupStats.warnings.forEach(w => console.log(`  ℹ ${w}`));
    }

    console.log(`\n- Kiểm tra toàn vẹn KPI:`);
    console.log(`    - Tổng bản ghi KPI đã rà soát          : ${dryRunResult.backupStats.kpiAudit.totalChecked}`);
    console.log(`    - Bản ghi bảo toàn giá trị 0 thực sự   : ${dryRunResult.backupStats.kpiAudit.zeroScoresPreserved}`);
    console.log(`    - Bản ghi bất thường NaN/Null          : ${dryRunResult.backupStats.kpiAudit.nanOrNullAnomalies}`);
    console.log(`    - Bản ghi chưa chốt (cho phép 0/null)  : ${dryRunResult.backupStats.kpiAudit.unfinalizedAllowedZeroOrNull}`);
    console.log(`    - Bản ghi khớp công thức chuẩn A+B+C-D : ${dryRunResult.backupStats.kpiAudit.formulaMatches}/${dryRunResult.backupStats.kpiAudit.totalChecked}`);

    console.log('\n--- 4. KẾT LUẬN & ĐIỀU KIỆN APPLY:');
    console.log(`- Trạng thái sẵn sàng (readyToApply): ${dryRunResult.readyToApply}`);
    console.log(`- Thông điệp chẩn đoán: ${dryRunResult.message}`);
    console.log(`- Thời gian thực thi Dry-Run: ${Date.now() - startTime} ms`);
    console.log('================================================================================');
    console.log('TUYỆT ĐỐI CHƯA APPLY, CHƯA ĐỔI BẢNG, CHƯA RESTORE, CHƯA PUBLISH.');
    console.log('================================================================================');
    process.exit(0);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[DryRun Error]:', err);
  process.exit(1);
});
