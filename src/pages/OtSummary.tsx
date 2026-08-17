import React, { useState, useEffect } from 'react';
import { Printer, Calendar, ArrowLeft, Download, FileText, User, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { STANDARD_MONTHS, getActiveLoggedInUser, normalizeNFC } from '../utils';

export default function OtSummary() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [overtimes, setOvertimes] = useState<any[]>([]);
  
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isLoading, setIsLoading] = useState(false);

  const fetchInit = async () => {
    try {
      setIsLoading(true);
      const [resU, resO] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/overtimes')
      ]);
      const [dU, dO] = await Promise.all([resU.json(), resO.json()]);
      if (dU.success && dU.data?.length > 0) {
        setUsers(dU.data);
        const active = getActiveLoggedInUser(dU.data);
        setCurrentUser(active);
      }
      if (dO.success) setOvertimes(dO.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInit();
  }, []);

  const formatMonth = (m: string) => {
    if (!m) return "";
    const match = m.match(/(0[1-9]|1[0-2])-(20\d{2})/);
    return match ? match[0] : m;
  };

  const calculateHours = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 + m2/60) - (h1 + m1/60);
    return diff > 0 ? Number(diff.toFixed(1)) : 0;
  };

  // Group overtimes by user for the selected month
  const getSummaryData = () => {
    const filteredOvertimes = overtimes.filter(o => {
      if (o.isDeleted) return false;
      if (formatMonth(o.month) !== selectedMonth) return false;
      if (selectedUserId !== 'all' && o.userId !== Number(selectedUserId)) return false;
      if (selectedStatus === 'approved' && o.approvalStatus !== 'Đã duyệt') return false;
      if (selectedStatus === 'pending' && o.approvalStatus !== 'Chờ duyệt') return false;
      return true;
    });

    const summaryMap = new Map();
    
    // Initialize users
    const targetUsers = selectedUserId === 'all' 
      ? users 
      : users.filter(u => u.id === Number(selectedUserId));

    targetUsers.forEach(u => {
      summaryMap.set(u.id, { 
        userId: u.id,
        name: u.name, 
        position: u.position || u.role || 'Chuyên viên',
        count: 0, 
        days: new Set(), 
        totalHours: 0, 
        approvedHours: 0 
      });
    });

    // Accumulate
    filteredOvertimes.forEach(o => {
      if (!summaryMap.has(o.userId)) return;
      const stats = summaryMap.get(o.userId);
      stats.count += 1;
      stats.days.add(o.otDate || o.date);
      const regHrs = o.totalRegHours ? parseFloat(o.totalRegHours) : calculateHours(o.startTime, o.endTime);
      stats.totalHours += (isNaN(regHrs) ? 0 : regHrs);
      if (o.approvalStatus === 'Đã duyệt') {
        const appHrs = o.approvedHours ? parseFloat(o.approvedHours) : regHrs;
        stats.approvedHours += (isNaN(appHrs) ? 0 : appHrs);
      }
    });

    return Array.from(summaryMap.values()).filter(s => s.count > 0 || selectedUserId !== 'all');
  };

  const summaryData = getSummaryData();
  const grandTotalCount = summaryData.reduce((acc, s) => acc + s.count, 0);
  const grandTotalDays = summaryData.reduce((acc, s) => acc + s.days.size, 0);
  const grandTotalHours = summaryData.reduce((acc, s) => acc + s.totalHours, 0);
  const grandTotalApproved = summaryData.reduce((acc, s) => acc + s.approvedHours, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExportWord = () => {
    const printArea = document.getElementById('ot-summary-document');
    if (!printArea) return;

    const rawHtml = printArea.innerHTML;
    const cleanHtml = normalizeNFC(rawHtml);

    const docContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Tong_Hop_Lam_Them_Phong_${selectedMonth}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 21.0cm 29.7cm;
      margin: 2.0cm 1.5cm 1.5cm 2.0cm;
      mso-header-margin: 35.4pt;
      mso-footer-margin: 35.4pt;
      mso-paper-source: 0;
    }
    div.Section1 { page: Section1; }
    body, div, p, span, table, th, td {
      font-family: "Times New Roman", Times, serif !important;
      color: #000000;
      line-height: 1.35;
      font-size: 12pt;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-top: 8px;
      margin-bottom: 8px;
    }
    table.border-table, table.border-table th, table.border-table td {
      border: 1px solid #000000;
    }
    th, td {
      padding: 5px 6px;
    }
    th {
      background-color: #f2f2f2;
      text-align: center;
      font-weight: bold;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .font-bold { font-weight: bold; }
    .italic { font-style: italic; }
    .uppercase { text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="Section1">
    ${cleanHtml}
  </div>
</body>
</html>`;

    const blob = new Blob(['\ufeff', docContent], {
      type: 'application/msword;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    document.body.appendChild(downloadLink);
    downloadLink.href = url;
    downloadLink.download = `Tong_Hop_Lam_Them_Phong_${selectedMonth}.doc`;
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16 font-sans">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-[#0f2440]">Tổng hợp làm thêm ngoài giờ toàn phòng</h1>
            <p className="text-xs text-slate-500">
              Định dạng chuẩn A4 dọc, tổng hợp số lượt, số ngày và số giờ làm thêm ngoài giờ của toàn bộ nhân sự trong phòng
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportWord}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-700" />
            Tải file Word (.doc)
          </button>

          <button
            onClick={handlePrint}
            className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            In / Lưu PDF
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Tháng:</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
            >
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Nhân viên:</label>
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
            >
              <option value="all">Tất cả nhân viên ({users.length})</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.position || u.role})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Trạng thái:</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
            >
              <option value="all">Tất cả đăng ký</option>
              <option value="approved">Chỉ đăng ký đã duyệt</option>
              <option value="pending">Chỉ đăng ký chờ duyệt</option>
            </select>
          </div>

          <button
            onClick={fetchInit}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="text-xs font-semibold text-slate-600">
          Tổng cộng: <b className="text-[#1F4E78]">{summaryData.length} nhân sự</b> ({grandTotalHours}h ĐK / {grandTotalApproved}h duyệt)
        </div>
      </div>

      {/* PRINT AREA CONTAINER */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 print:border-none print:shadow-none print:p-0 print:m-0">
        <div
          id="ot-summary-document"
          className="font-document max-w-[780px] mx-auto text-[12pt] leading-[1.35] text-black bg-white"
          style={{ fontFamily: '"Noto Serif", "Times New Roman", Times, "Liberation Serif", serif' }}
        >
          {/* Header 2 Columns */}
          <table className="w-full border-none mb-4" style={{ borderCollapse: 'collapse', border: 'none', width: '100%' }}>
            <tbody>
              <tr style={{ border: 'none' }}>
                <td className="w-1/2 text-center align-top p-0" style={{ border: 'none', textAlign: 'center', verticalAlign: 'top', width: '48%' }}>
                  <div style={{ fontSize: '11pt', fontWeight: 'bold' }}>{normalizeNFC('UBND TỈNH ĐẮK LẮK')}</div>
                  <div style={{ fontSize: '10.5pt', fontWeight: 'bold' }}>{normalizeNFC('BAN QLDA ĐẦU TƯ XDCT')}</div>
                  <div style={{ fontSize: '10.5pt', fontWeight: 'bold' }}>{normalizeNFC('GIAO THÔNG VÀ NÔNG NGHIỆP PTNT')}</div>
                  <div style={{ width: '90px', borderBottom: '1px solid black', margin: '4px auto 0 auto' }}></div>
                </td>
                <td className="w-1/2 text-center align-top p-0" style={{ border: 'none', textAlign: 'center', verticalAlign: 'top', width: '52%' }}>
                  <div style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase' }}>{normalizeNFC('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM')}</div>
                  <div style={{ fontSize: '11.5pt', fontWeight: 'bold' }}>{normalizeNFC('Độc lập - Tự do - Hạnh phúc')}</div>
                  <div style={{ width: '140px', borderBottom: '1px solid black', margin: '4px auto 0 auto' }}></div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Title */}
          <div style={{ textAlign: 'center', margin: '22px 0 16px 0' }}>
            <h1 style={{ fontSize: '15pt', fontWeight: 'bold', textTransform: 'uppercase', margin: 0, letterSpacing: '0.2px' }}>
              {normalizeNFC('BẢNG TỔNG HỢP LÀM THÊM NGOÀI GIỜ')}
            </h1>
            <div style={{ fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>
              {normalizeNFC('PHÒNG KẾ HOẠCH - TÀI CHÍNH')}
            </div>
            <div style={{ fontSize: '11.5pt', fontStyle: 'italic', marginTop: '4px' }}>
              {normalizeNFC(`Tháng ${selectedMonth}`)}
            </div>
          </div>

          {/* Table */}
          <table
            className="border-table"
            style={{ width: '100%', fontSize: '11pt', margin: '12px 0', borderCollapse: 'collapse', border: '1px solid black' }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2' }}>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '38px', fontWeight: 'bold' }}>
                  {normalizeNFC('STT')}
                </th>
                <th style={{ padding: '6px 6px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>
                  {normalizeNFC('Họ và tên nhân sự')}
                </th>
                <th style={{ padding: '6px 6px', border: '1px solid black', textAlign: 'center', width: '120px', fontWeight: 'bold' }}>
                  {normalizeNFC('Vị trí')}
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '80px', fontWeight: 'bold' }}>
                  {normalizeNFC('Số lượt ĐK')}
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '80px', fontWeight: 'bold' }}>
                  {normalizeNFC('Số ngày ĐK')}
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '80px', fontWeight: 'bold' }}>
                  {normalizeNFC('Tổng giờ ĐK')}
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '90px', fontWeight: 'bold' }}>
                  {normalizeNFC('Giờ được duyệt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {summaryData.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '16px 8px', border: '1px solid black', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                    {normalizeNFC('Không có dữ liệu làm thêm phù hợp với bộ lọc trong tháng này.')}
                  </td>
                </tr>
              ) : (
                summaryData.map((row, idx) => (
                  <tr key={row.userId || idx}>
                    <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '5px 8px', border: '1px solid black', fontWeight: 'bold' }}>
                      {normalizeNFC(row.name)}
                    </td>
                    <td style={{ padding: '5px 6px', border: '1px solid black', textAlign: 'center' }}>
                      {normalizeNFC(row.position)}
                    </td>
                    <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center' }}>
                      {row.count}
                    </td>
                    <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center' }}>
                      {row.days.size}
                    </td>
                    <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>
                      {row.totalHours}
                    </td>
                    <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', color: '#1F4E78' }}>
                      {row.approvedHours}
                    </td>
                  </tr>
                ))
              )}

              {/* Grand Total */}
              {summaryData.length > 0 && (
                <tr style={{ backgroundColor: '#fafafa', fontWeight: 'bold' }}>
                  <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center' }} colSpan={3}>
                    <span style={{ textTransform: 'uppercase', fontSize: '11pt' }}>
                      {normalizeNFC('Tổng cộng')}
                    </span>
                  </td>
                  <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontSize: '11.5pt' }}>
                    {grandTotalCount}
                  </td>
                  <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontSize: '11.5pt' }}>
                    {grandTotalDays}
                  </td>
                  <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontSize: '11.5pt' }}>
                    {grandTotalHours}
                  </td>
                  <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontSize: '11.5pt', color: '#1F4E78' }}>
                    {grandTotalApproved}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Summary notes */}
          <div style={{ fontSize: '11pt', fontWeight: 'bold', margin: '14px 0', lineHeight: '1.6' }}>
            <div>{normalizeNFC(`- Tổng số nhân sự làm thêm ngoài giờ: ${summaryData.filter(s => s.count > 0).length} cán bộ`)}</div>
            <div>{normalizeNFC(`- Tổng số giờ làm thêm đăng ký toàn phòng: ${grandTotalHours} giờ`)}</div>
            <div>{normalizeNFC(`- Tổng số giờ làm thêm đã được phê duyệt: ${grandTotalApproved} giờ`)}</div>
          </div>

          {/* Signatures */}
          <div style={{ marginTop: '28px', marginBottom: '16px' }}>
            <div style={{ textAlign: 'right', fontStyle: 'italic', fontSize: '11pt', marginBottom: '14px' }}>
              {normalizeNFC('Đắk Lắk, ngày ...... tháng ...... năm ......')}
            </div>

            <table style={{ width: '100%', border: 'none', borderCollapse: 'collapse', textAlign: 'center' }}>
              <tbody>
                <tr style={{ border: 'none' }}>
                  <td style={{ width: '33.3%', padding: 0, verticalAlign: 'top', border: 'none', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10.5pt' }}>
                      {normalizeNFC('NGƯỜI LẬP BẢNG')}
                    </div>
                    <div style={{ fontStyle: 'italic', fontSize: '9.5pt', marginBottom: '60px' }}>
                      {normalizeNFC('(Ký, ghi rõ họ tên)')}
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>
                      {normalizeNFC(currentUser?.name || '')}
                    </div>
                  </td>
                  <td style={{ width: '33.3%', padding: 0, verticalAlign: 'top', border: 'none', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10.5pt' }}>
                      {normalizeNFC('LÃNH ĐẠO PHÒNG')}
                    </div>
                    <div style={{ fontStyle: 'italic', fontSize: '9.5pt', marginBottom: '60px' }}>
                      {normalizeNFC('(Ký, ghi rõ họ tên)')}
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>
                      {normalizeNFC('Khuất Văn Sơn')}
                    </div>
                  </td>
                  <td style={{ width: '33.3%', padding: 0, verticalAlign: 'top', border: 'none', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10.5pt' }}>
                      {normalizeNFC('VĂN PHÒNG BAN')}
                    </div>
                    <div style={{ fontStyle: 'italic', fontSize: '9.5pt', marginBottom: '60px' }}>
                      {normalizeNFC('(Ký, ghi rõ họ tên)')}
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '11pt' }}></div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
