import ExcelJS from 'exceljs';
import { OrgConfig, Work, User, Category } from '../types';
import { formatScore, formatDate, cleanPosition, normalizeNFC } from '../utils';

export interface StatsExportOptions {
  orgConfig: OrgConfig;
  selectedMonths: string[];
  selectedUsers: User[];
  groupStats: any[];
  taskStats: any[];
  productStats: any[];
  employeeStats: any[];
  filteredWorks: Work[];
  totalWorks: number;
  totalCompleted: number;
  totalApproved: number;
  totalSelfScoreB?: number;
  totalApprovedScoreB?: number;
  totalScoreB?: number;
  totalProductQty: number;
}

// Style helper constants
const FONT_FAMILY = 'Times New Roman';
const PRIMARY_COLOR = '1F4E78';
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E78' }
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2EFDA' }
};
const SUB_TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF2CC' }
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } }
};
const DOUBLE_BOTTOM_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'double', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } }
};

/**
 * Adds administrative header (Cơ quan cấp trên, Đơn vị, Quốc hiệu, Tiêu đề)
 */
function addAdminHeader(
  ws: ExcelJS.Worksheet, 
  orgConfig: OrgConfig, 
  reportTitle: string, 
  monthsText: string, 
  scopeText: string,
  lastColLetter: string
) {
  // Row 1: Parent Agency & National Motto
  const r1 = ws.addRow([
    (orgConfig.parentAgency || 'BAN QUẢN LÝ DỰ ÁN').toUpperCase(),
    '',
    '',
    'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'
  ]);
  r1.font = { name: FONT_FAMILY, size: 10, bold: true };
  r1.alignment = { vertical: 'middle', horizontal: 'center' };

  // Row 2: Department & Independence
  const r2 = ws.addRow([
    (orgConfig.departmentName || 'PHÒNG KẾ HOẠCH - TÀI CHÍNH').toUpperCase(),
    '',
    '',
    'Độc lập - Tự do - Hạnh phúc'
  ]);
  r2.font = { name: FONT_FAMILY, size: 10, bold: true };
  r2.alignment = { vertical: 'middle', horizontal: 'center' };

  // Merge cells for headers
  ws.mergeCells('A1:C1');
  ws.mergeCells(`D1:${lastColLetter}1`);
  ws.mergeCells('A2:C2');
  ws.mergeCells(`D2:${lastColLetter}2`);

  // Row 3: Empty space
  ws.addRow([]);

  // Row 4: Main Report Title
  const r4 = ws.addRow([reportTitle.toUpperCase()]);
  r4.font = { name: FONT_FAMILY, size: 14, bold: true, color: { argb: 'FF1F4E78' } };
  r4.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.mergeCells(`A4:${lastColLetter}4`);

  // Row 5: Time period
  const r5 = ws.addRow([`Thời gian: ${monthsText}`]);
  r5.font = { name: FONT_FAMILY, size: 11, italic: true };
  r5.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.mergeCells(`A5:${lastColLetter}5`);

  // Row 6: Scope
  const r6 = ws.addRow([`Đối tượng: ${scopeText}`]);
  r6.font = { name: FONT_FAMILY, size: 10.5, italic: true };
  r6.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.mergeCells(`A6:${lastColLetter}6`);

  // Row 7: Empty row before table
  ws.addRow([]);
}

/**
 * Adds 3-column signature block at the bottom
 */
function addSignatureBlock(
  ws: ExcelJS.Worksheet, 
  orgConfig: OrgConfig, 
  userName: string,
  startColLetter: string,
  midColLetter: string,
  endColLetter: string
) {
  ws.addRow([]);
  
  // Date line
  const dateRow = ws.addRow(['', '', '', '', '', '', `${orgConfig.location || 'Đắk Lắk'}, ngày ...... tháng ...... năm ......`]);
  dateRow.font = { name: FONT_FAMILY, size: 11, italic: true };
  dateRow.alignment = { horizontal: 'right' };
  
  ws.addRow([]);

  // Titles row
  const titlesRow = ws.addRow([
    orgConfig.creatorTitle || 'NGƯỜI LẬP BIỂU',
    '',
    '',
    orgConfig.approverTitle || 'LÃNH ĐẠO PHÒNG',
    '',
    '',
    orgConfig.leaderTitle || 'THỦ TRƯỞNG ĐƠN VỊ'
  ]);
  titlesRow.font = { name: FONT_FAMILY, size: 11, bold: true };
  titlesRow.alignment = { horizontal: 'center' };

  // Subtitle (Ký, ghi rõ họ tên)
  const subRow = ws.addRow([
    '(Ký, ghi rõ họ tên)',
    '',
    '',
    '(Ký, ghi rõ họ tên)',
    '',
    '',
    '(Ký, đóng dấu)'
  ]);
  subRow.font = { name: FONT_FAMILY, size: 10, italic: true, color: { argb: 'FF555555' } };
  subRow.alignment = { horizontal: 'center' };

  // Space for physical signature
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);

  // Names row
  const namesRow = ws.addRow([
    userName || '',
    '',
    '',
    '',
    '',
    '',
    'Giám đốc'
  ]);
  namesRow.font = { name: FONT_FAMILY, size: 11, bold: true };
  namesRow.alignment = { horizontal: 'center' };
}

/**
 * Auto-fits columns width
 */
function autoFitColumns(ws: ExcelJS.Worksheet, minWidth = 10, maxWidth = 55) {
  ws.columns.forEach((column) => {
    let maxLen = 0;
    column.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
      // Don't calculate width from title merged rows
      if (rowNumber > 7) {
        const cellLen = cell.value ? String(cell.value).length : 0;
        if (cellLen > maxLen) {
          maxLen = cellLen;
        }
      }
    });
    column.width = Math.min(maxWidth, Math.max(minWidth, maxLen + 3));
  });
}

/**
 * Generates the full professional Excel file
 */
export async function exportFullStatsExcel(options: StatsExportOptions) {
  const {
    orgConfig,
    selectedMonths,
    selectedUsers,
    groupStats,
    taskStats,
    productStats,
    employeeStats,
    filteredWorks,
    totalWorks,
    totalCompleted,
    totalApproved,
    totalSelfScoreB,
    totalApprovedScoreB,
    totalScoreB,
    totalProductQty
  } = options;

  const monthsText = selectedMonths.length === 0 
    ? 'Tất cả các tháng' 
    : selectedMonths.length === 1 
      ? `Tháng ${selectedMonths[0]}` 
      : selectedMonths.length >= 12 
        ? 'Cả năm 2026' 
        : `Các tháng: ${selectedMonths.join(', ')}`;

  const scopeText = selectedUsers.length === 0 || selectedUsers.length >= 10
    ? `Toàn thể nhân sự ${orgConfig.departmentName || 'Phòng'}`
    : `Nhân sự được chọn (${selectedUsers.map(u => u.name).join(', ')})`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = orgConfig.departmentName || 'KPI Management';
  workbook.created = new Date();

  // ==========================================
  // SHEET 1: TỔNG HỢP THEO NHÓM VIỆC
  // ==========================================
  const wsGroup = workbook.addWorksheet('Tổng hợp theo Nhóm việc', {
    views: [{ showGridLines: true }]
  });
  addAdminHeader(wsGroup, orgConfig, 'BÁO CÁO THỐNG KÊ CÔNG VIỆC THEO NHÓM NHIỆM VỤ', monthsText, scopeText, 'J');

  // Table Headers
  const groupHeaders = [
    'STT',
    'Nhóm công việc',
    'Tổng số việc',
    'Việc được giao',
    'Đã hoàn thành',
    'Đã phê duyệt',
    'Chậm tiến độ',
    'Tỷ lệ hoàn thành (%)',
    'Điểm quy đổi công việc tự chấm',
    'Điểm quy đổi công việc đã duyệt'
  ];
  const groupHeaderRow = wsGroup.addRow(groupHeaders);
  groupHeaderRow.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  groupHeaderRow.fill = HEADER_FILL;
  groupHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  groupHeaderRow.height = 28;
  groupHeaderRow.eachCell((cell) => { cell.border = THIN_BORDER; });

  // Rows
  groupStats.forEach((st, idx) => {
    const selfScore = st.totalSelfScore !== undefined ? st.totalSelfScore : (st.totalSelfScoreB || 0);
    const approvedScore = st.totalApprovedScore !== undefined ? st.totalApprovedScore : (st.totalApprovedScoreB || 0);

    const r = wsGroup.addRow([
      idx + 1,
      st.group,
      st.count,
      st.assignCount,
      st.done,
      st.approved,
      st.delayed || 0,
      `${st.doneRate}%`,
      selfScore,
      approvedScore
    ]);
    r.font = { name: FONT_FAMILY, size: 11 };
    r.alignment = { vertical: 'middle' };
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(9).numFmt = '#,##0.00';
    r.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(10).numFmt = '#,##0.00';
    r.eachCell((cell) => { cell.border = THIN_BORDER; });
  });

  // Total Row
  const totalGroupDone = groupStats.reduce((a, b) => a + b.done, 0);
  const totalGroupAssign = groupStats.reduce((a, b) => a + b.assignCount, 0);
  const totalGroupApproved = groupStats.reduce((a, b) => a + b.approved, 0);
  const totalGroupDelayed = groupStats.reduce((a, b) => a + (b.delayed || 0), 0);
  const totalGroupDoneRate = totalWorks > 0 ? Math.round((totalCompleted / totalWorks) * 100) : 0;
  const totalGroupSelfScore = totalSelfScoreB !== undefined ? totalSelfScoreB : groupStats.reduce((a, b) => a + (b.totalSelfScore || 0), 0);
  const totalGroupApprovedScore = totalApprovedScoreB !== undefined ? totalApprovedScoreB : groupStats.reduce((a, b) => a + (b.totalApprovedScore || 0), 0);

  const groupTotalRow = wsGroup.addRow([
    '',
    'TỔNG CỘNG',
    totalWorks,
    totalGroupAssign,
    totalGroupDone,
    totalGroupApproved,
    totalGroupDelayed,
    `${totalGroupDoneRate}%`,
    Math.round(totalGroupSelfScore * 100) / 100,
    Math.round(totalGroupApprovedScore * 100) / 100
  ]);
  groupTotalRow.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF0F2440' } };
  groupTotalRow.fill = TOTAL_FILL;
  groupTotalRow.alignment = { vertical: 'middle' };
  groupTotalRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
  groupTotalRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
  groupTotalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  groupTotalRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  groupTotalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
  groupTotalRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
  groupTotalRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
  groupTotalRow.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
  groupTotalRow.getCell(9).numFmt = '#,##0.00';
  groupTotalRow.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
  groupTotalRow.getCell(10).numFmt = '#,##0.00';
  groupTotalRow.eachCell((cell) => { cell.border = DOUBLE_BOTTOM_BORDER; });

  addSignatureBlock(wsGroup, orgConfig, '', 'A', 'E', 'H');
  autoFitColumns(wsGroup);

  // ==========================================
  // SHEET 2: TỔNG HỢP THEO NHIỆM VỤ
  // ==========================================
  const wsTask = workbook.addWorksheet('Tổng hợp theo Nhiệm vụ', {
    views: [{ showGridLines: true }]
  });
  addAdminHeader(wsTask, orgConfig, 'BÁO CÁO THỐNG KÊ CÔNG VIỆC THEO DANH MỤC NHIỆM VỤ', monthsText, scopeText, 'I');

  const taskHeaders = [
    'STT',
    'Mã NV',
    'Tên nhiệm vụ công việc',
    'Nhóm công việc',
    'Số việc phát sinh',
    'Đã hoàn thành',
    'Tỷ lệ xong (%)',
    'Điểm quy đổi công việc tự chấm',
    'Điểm quy đổi công việc đã duyệt'
  ];
  const taskHeaderRow = wsTask.addRow(taskHeaders);
  taskHeaderRow.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  taskHeaderRow.fill = HEADER_FILL;
  taskHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  taskHeaderRow.height = 28;
  taskHeaderRow.eachCell((cell) => { cell.border = THIN_BORDER; });

  taskStats.forEach((st, idx) => {
    const selfScore = st.totalSelfScore !== undefined ? st.totalSelfScore : (st.totalSelfScoreB || 0);
    const approvedScore = st.totalApprovedScore !== undefined ? st.totalApprovedScore : (st.totalApprovedScoreB || 0);

    const r = wsTask.addRow([
      idx + 1,
      st.code || '-',
      st.name,
      st.group,
      st.count,
      st.done,
      `${st.doneRate}%`,
      selfScore,
      approvedScore
    ]);
    r.font = { name: FONT_FAMILY, size: 11 };
    r.alignment = { vertical: 'middle' };
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(8).numFmt = '#,##0.00';
    r.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(9).numFmt = '#,##0.00';
    r.eachCell((cell) => { cell.border = THIN_BORDER; });
  });

  const totalTaskSelfScore = totalSelfScoreB !== undefined ? totalSelfScoreB : taskStats.reduce((a, b) => a + (b.totalSelfScore || 0), 0);
  const totalTaskApprovedScore = totalApprovedScoreB !== undefined ? totalApprovedScoreB : taskStats.reduce((a, b) => a + (b.totalApprovedScore || 0), 0);

  const taskTotalRow = wsTask.addRow([
    '',
    '',
    'TỔNG CỘNG',
    '',
    totalWorks,
    totalCompleted,
    `${totalGroupDoneRate}%`,
    Math.round(totalTaskSelfScore * 100) / 100,
    Math.round(totalTaskApprovedScore * 100) / 100
  ]);
  taskTotalRow.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF0F2440' } };
  taskTotalRow.fill = TOTAL_FILL;
  taskTotalRow.alignment = { vertical: 'middle' };
  taskTotalRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
  taskTotalRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  taskTotalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
  taskTotalRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
  taskTotalRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
  taskTotalRow.getCell(8).numFmt = '#,##0.00';
  taskTotalRow.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
  taskTotalRow.getCell(9).numFmt = '#,##0.00';
  taskTotalRow.eachCell((cell) => { cell.border = DOUBLE_BOTTOM_BORDER; });

  addSignatureBlock(wsTask, orgConfig, '', 'A', 'D', 'G');
  autoFitColumns(wsTask);

  // ==========================================
  // SHEET 3: TỔNG HỢP THEO LOẠI SẢN PHẨM
  // ==========================================
  const wsProduct = workbook.addWorksheet('Tổng hợp theo Loại sản phẩm', {
    views: [{ showGridLines: true }]
  });
  addAdminHeader(wsProduct, orgConfig, 'BÁO CÁO THỐNG KÊ SẢN PHẨM ĐẦU RA CỦA PHÒNG', monthsText, scopeText, 'H');

  const prodHeaders = [
    'STT',
    'Loại sản phẩm',
    'Đơn vị tính',
    'Tổng số lượng sản phẩm',
    'Số công việc tạo ra SP',
    'Số SP đã hoàn thành',
    'Điểm quy đổi công việc tự chấm',
    'Điểm quy đổi công việc đã duyệt'
  ];
  const prodHeaderRow = wsProduct.addRow(prodHeaders);
  prodHeaderRow.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  prodHeaderRow.fill = HEADER_FILL;
  prodHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  prodHeaderRow.height = 28;
  prodHeaderRow.eachCell((cell) => { cell.border = THIN_BORDER; });

  productStats.forEach((st, idx) => {
    const selfScore = st.totalSelfScore !== undefined ? st.totalSelfScore : (st.totalSelfScoreB || 0);
    const approvedScore = st.totalApprovedScore !== undefined ? st.totalApprovedScore : (st.totalApprovedScoreB || 0);

    const r = wsProduct.addRow([
      idx + 1,
      st.productType,
      st.unit || 'Sản phẩm',
      st.totalQty,
      st.workCount,
      st.doneCount,
      selfScore,
      approvedScore
    ]);
    r.font = { name: FONT_FAMILY, size: 11 };
    r.alignment = { vertical: 'middle' };
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(7).numFmt = '#,##0.00';
    r.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(8).numFmt = '#,##0.00';
    r.eachCell((cell) => { cell.border = THIN_BORDER; });
  });

  const totalProdQtySum = productStats.reduce((a, b) => a + b.totalQty, 0);
  const totalProdSelfScoreSum = productStats.reduce((a, b) => a + (b.totalSelfScore || 0), 0);
  const totalProdApprovedScoreSum = productStats.reduce((a, b) => a + (b.totalApprovedScore || 0), 0);

  const prodTotalRow = wsProduct.addRow([
    '',
    'TỔNG CỘNG',
    '',
    totalProdQtySum,
    totalWorks,
    totalCompleted,
    Math.round(totalProdSelfScoreSum * 100) / 100,
    Math.round(totalProdApprovedScoreSum * 100) / 100
  ]);
  prodTotalRow.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF0F2440' } };
  prodTotalRow.fill = TOTAL_FILL;
  prodTotalRow.alignment = { vertical: 'middle' };
  prodTotalRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
  prodTotalRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
  prodTotalRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  prodTotalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
  prodTotalRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
  prodTotalRow.getCell(7).numFmt = '#,##0.00';
  prodTotalRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
  prodTotalRow.getCell(8).numFmt = '#,##0.00';
  prodTotalRow.eachCell((cell) => { cell.border = DOUBLE_BOTTOM_BORDER; });

  addSignatureBlock(wsProduct, orgConfig, '', 'A', 'C', 'F');
  autoFitColumns(wsProduct);

  // ==========================================
  // SHEET 4: THEO DÕI THEO NHÂN SỰ
  // ==========================================
  const wsStaff = workbook.addWorksheet('Thống kê theo Nhân sự', {
    views: [{ showGridLines: true }]
  });
  addAdminHeader(wsStaff, orgConfig, 'BÁO CÁO HIỆU SUẤT CÔNG VIỆC VÀ ĐIỂM KPI TỪNG NHÂN SỰ', monthsText, scopeText, 'L');

  const staffHeaders = [
    'STT',
    'Họ và tên nhân sự',
    'Chức vụ',
    'Tổng việc',
    'Việc được giao',
    'Đã hoàn thành',
    'Đã phê duyệt',
    'Chậm tiến độ',
    'Tỷ lệ hoàn thành (%)',
    'Điểm quy đổi công việc tự chấm',
    'Điểm quy đổi công việc đã duyệt',
    'Giờ làm thêm (OT)'
  ];
  const staffHeaderRow = wsStaff.addRow(staffHeaders);
  staffHeaderRow.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  staffHeaderRow.fill = HEADER_FILL;
  staffHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  staffHeaderRow.height = 28;
  staffHeaderRow.eachCell((cell) => { cell.border = THIN_BORDER; });

  employeeStats.forEach((st, idx) => {
    const selfScore = st.totalSelfScoreB !== undefined ? st.totalSelfScoreB : (st.totalSelfScore || 0);
    const approvedScore = st.totalApprovedScoreB !== undefined ? st.totalApprovedScoreB : (st.totalApprovedScore || 0);

    const r = wsStaff.addRow([
      idx + 1,
      st.user.name,
      cleanPosition(st.user.position),
      st.totalCount,
      st.assignedCount,
      st.completedCount,
      st.approvedCount,
      st.delayedCount,
      `${st.completionRate}%`,
      selfScore,
      approvedScore,
      st.totalOtHours > 0 ? st.totalOtHours : '-'
    ]);
    r.font = { name: FONT_FAMILY, size: 11 };
    r.alignment = { vertical: 'middle' };
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(10).numFmt = '#,##0.00';
    r.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(11).numFmt = '#,##0.00';
    r.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };
    r.eachCell((cell) => { cell.border = THIN_BORDER; });
  });

  const totalStaffSelfScore = totalSelfScoreB !== undefined ? totalSelfScoreB : employeeStats.reduce((a, b) => a + (b.totalSelfScoreB || 0), 0);
  const totalStaffApprovedScore = totalApprovedScoreB !== undefined ? totalApprovedScoreB : employeeStats.reduce((a, b) => a + (b.totalApprovedScoreB || 0), 0);
  const totalStaffOt = employeeStats.reduce((a, b) => a + (b.totalOtHours || 0), 0);

  const staffTotalRow = wsStaff.addRow([
    '',
    'TỔNG CỘNG',
    '',
    totalWorks,
    employeeStats.reduce((a, b) => a + b.assignedCount, 0),
    totalCompleted,
    totalApproved,
    employeeStats.reduce((a, b) => a + b.delayedCount, 0),
    `${totalGroupDoneRate}%`,
    Math.round(totalStaffSelfScore * 100) / 100,
    Math.round(totalStaffApprovedScore * 100) / 100,
    totalStaffOt > 0 ? totalStaffOt : '-'
  ]);
  staffTotalRow.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF0F2440' } };
  staffTotalRow.fill = TOTAL_FILL;
  staffTotalRow.alignment = { vertical: 'middle' };
  staffTotalRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
  staffTotalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  staffTotalRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  staffTotalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
  staffTotalRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
  staffTotalRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
  staffTotalRow.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
  staffTotalRow.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
  staffTotalRow.getCell(10).numFmt = '#,##0.00';
  staffTotalRow.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
  staffTotalRow.getCell(11).numFmt = '#,##0.00';
  staffTotalRow.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };
  staffTotalRow.eachCell((cell) => { cell.border = DOUBLE_BOTTOM_BORDER; });

  addSignatureBlock(wsStaff, orgConfig, '', 'A', 'E', 'I');
  autoFitColumns(wsStaff);

  // ==========================================
  // SHEET 5: SỔ CHI TIẾT CÔNG VIỆC
  // ==========================================
  const wsDetail = workbook.addWorksheet('Danh sách công việc chi tiết', {
    views: [{ showGridLines: true }]
  });
  addAdminHeader(wsDetail, orgConfig, 'DANH SÁCH CHI TIẾT CÔNG VIỆC THỰC HIỆN CỦA PHÒNG', monthsText, scopeText, 'T');

  const detailHeaders = [
    'STT',
    'Tháng',
    'Mã việc',
    'Người thực hiện',
    'Nhóm công việc',
    'Tên nhiệm vụ',
    'Dự án / Hạng mục',
    'Nội dung chi tiết',
    'Loại sản phẩm',
    'SL',
    'ĐVT',
    'Tính chất',
    'Điểm chuẩn',
    'Điểm quy đổi công việc tự chấm',
    'Điểm quy đổi công việc đã duyệt',
    'Tiến độ',
    'Lãnh đạo duyệt',
    'Ngày bắt đầu',
    'Hạn hoàn thành',
    'Ngày hoàn thành thực tế'
  ];
  const detailHeaderRow = wsDetail.addRow(detailHeaders);
  detailHeaderRow.font = { name: FONT_FAMILY, size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  detailHeaderRow.fill = HEADER_FILL;
  detailHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  detailHeaderRow.height = 28;
  detailHeaderRow.eachCell((cell) => { cell.border = THIN_BORDER; });

  filteredWorks.forEach((w, idx) => {
    const selfScore = w.selfConvertedScore !== undefined && w.selfConvertedScore !== null 
      ? (parseFloat(w.selfConvertedScore) || 0) 
      : (parseFloat(w.convertedScore || '0') || 0);
    const approvedScore = w.leaderApproval === 'Duyệt'
      ? (w.approvedConvertedScore !== undefined && w.approvedConvertedScore !== null 
          ? (parseFloat(w.approvedConvertedScore) || 0) 
          : (parseFloat(w.convertedScore || '0') || 0))
      : 0;

    const r = wsDetail.addRow([
      idx + 1,
      w.month || '',
      w.taskCode || w.workId,
      w.user?.name || '',
      w.taskGroup || '',
      w.taskName || '',
      w.project || '',
      w.detail || '',
      w.productType || '',
      w.productQty || 1,
      w.unit || '',
      w.approvedNature || w.proposedNature || '',
      parseFloat(w.baseScore || '0') || '',
      selfScore,
      approvedScore,
      w.status || '',
      w.leaderApproval || 'Chưa duyệt',
      formatDate(w.startDate),
      formatDate(w.endDate),
      formatDate(w.actualEndDate)
    ]);
    r.font = { name: FONT_FAMILY, size: 10 };
    r.alignment = { vertical: 'middle' };
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(5).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(6).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(8).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    r.getCell(9).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(14).numFmt = '#,##0.00';
    r.getCell(15).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(15).numFmt = '#,##0.00';
    r.getCell(16).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(17).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(18).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(19).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(20).alignment = { horizontal: 'center', vertical: 'middle' };
    r.eachCell((cell) => { cell.border = THIN_BORDER; });
  });

  autoFitColumns(wsDetail, 8, 45);

  // Generate and download buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  
  const cleanOrgName = (orgConfig.shortName || 'PHONG').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanMonthName = selectedMonths.length === 1 
    ? selectedMonths[0] 
    : selectedMonths.length >= 12 
      ? 'Nam_2026' 
      : `${selectedMonths.length}_Thang`;

  const fileName = `Bao_cao_thong_ke_cong_viec_${cleanMonthName}_${cleanOrgName}.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
