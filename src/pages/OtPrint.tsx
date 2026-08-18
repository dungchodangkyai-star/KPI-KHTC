import React, { useState, useEffect } from 'react';
import { Printer, Calendar, ArrowLeft, Download, FileText, User, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { STANDARD_MONTHS, getActiveLoggedInUser, normalizeNFC, formatDate, cleanPosition } from '../utils';
import { useOrgConfig } from '../contexts/OrgContext';

export default function OtPrint() {
  const navigate = useNavigate();
  const { orgConfig } = useOrgConfig();
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [overtimes, setOvertimes] = useState<any[]>([]);
  
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
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
        setSelectedUserId(active ? String(active.id) : String(dU.data[0].id));
      }
      if (dO.success) setOvertimes(dO.data || []);
    } catch (e) {
      console.error("Fetch OT print error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInit();

    const handleUserChange = () => {
      if (users.length > 0) {
        const active = getActiveLoggedInUser(users);
        setCurrentUser(active);
        if (active) setSelectedUserId(String(active.id));
      }
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, [users.length]);

  const activeUser = users.find(u => String(u.id) === String(selectedUserId)) || currentUser;

  const formatMonth = (m: string) => {
    if (!m) return "";
    const match = m.match(/(0[1-9]|1[0-2])-(20\d{2})/);
    return match ? match[0] : m;
  };

  const printData = overtimes.filter(o => {
    if (o.isDeleted) return false;
    if (formatMonth(o.month) !== selectedMonth) return false;
    if (activeUser && o.userId !== activeUser.id) return false;
    if (selectedStatus === 'approved' && o.approvalStatus !== 'Đã duyệt') return false;
    if (selectedStatus === 'pending' && o.approvalStatus !== 'Chờ duyệt') return false;
    return true;
  });

  const totalDays = new Set(printData.map(d => d.otDate || d.date)).size;
  
  const calculateHours = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 + m2/60) - (h1 + m1/60);
    return diff > 0 ? Number(diff.toFixed(1)) : 0;
  };
  
  const totalRegHours = printData.reduce((acc, curr) => {
    const hrs = curr.totalRegHours ? parseFloat(curr.totalRegHours) : calculateHours(curr.startTime, curr.endTime);
    return acc + (isNaN(hrs) ? 0 : hrs);
  }, 0);

  const totalApprovedHours = printData.reduce((acc, curr) => {
    if (curr.approvalStatus === 'Đã duyệt') {
      const hrs = curr.approvedHours ? parseFloat(curr.approvedHours) : (curr.totalRegHours ? parseFloat(curr.totalRegHours) : calculateHours(curr.startTime, curr.endTime));
      return acc + (isNaN(hrs) ? 0 : hrs);
    }
    return acc;
  }, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExportWord = () => {
    const printArea = document.getElementById('ot-print-document');
    if (!printArea) return;

    const rawHtml = printArea.innerHTML;
    const cleanHtml = normalizeNFC(rawHtml);

    const docContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Bang_Tong_Hop_Lam_Them_${selectedMonth}_${(activeUser?.name || 'NhanVien')}</title>
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
    downloadLink.download = `Bang_Tong_Hop_Lam_Them_${selectedMonth}_${(activeUser?.name || 'NhanVien').replace(/\s+/g, '_')}.doc`;
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16 font-sans print:max-w-none print:m-0 print:p-0 print:space-y-0 print:pb-0">
      {/* Top Header & Action Controls (Hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/ot-my')}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-[#0f2440]">In bảng tổng hợp làm thêm ngoài giờ</h1>
            <p className="text-xs text-slate-500">
              Định dạng chuẩn khổ A4, đầy đủ quốc hiệu, tiêu ngữ, bảng chi tiết và chữ ký 3 bên sẵn sàng in hoặc xuất Word
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

      {/* Filters (Hidden when printing) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 print:hidden no-print">
        <div className="flex flex-wrap items-center gap-3">
          {/* Month */}
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

          {/* User selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Nhân sự:</label>
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({cleanPosition(u.position)})</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Dữ liệu in:</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
            >
              <option value="all">Tất cả đăng ký ({printData.length})</option>
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
          Tổng số lượt in: <b className="text-[#1F4E78]">{printData.length} lượt</b> ({totalRegHours}h ĐK / {totalApprovedHours}h duyệt)
        </div>
      </div>

      {/* PRINT AREA CONTAINER - Standard A4 styling */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 print:border-none print:shadow-none print:p-0 print:m-0">
        <div
          id="ot-print-document"
          className="font-document max-w-[780px] mx-auto text-[12pt] leading-[1.35] text-black bg-white"
          style={{ fontFamily: '"Noto Serif", "Times New Roman", Times, "Liberation Serif", serif' }}
        >
          {/* Header 2 Columns - Administrative Standard */}
          <table className="w-full border-none mb-4" style={{ borderCollapse: 'collapse', border: 'none', width: '100%' }}>
            <tbody>
              <tr style={{ border: 'none' }}>
                <td className="w-1/2 text-center align-top p-0" style={{ border: 'none', textAlign: 'center', verticalAlign: 'top', width: '48%' }}>
                  <div style={{ fontSize: '10.5pt', fontWeight: 'bold', textTransform: 'uppercase' }}>{normalizeNFC(orgConfig.parentAgency || 'BAN QUẢN LÝ DỰ ÁN ĐẦU TƯ XDCT')}</div>
                  <div style={{ fontSize: '10.5pt', fontWeight: 'bold', textTransform: 'uppercase' }}>{normalizeNFC(orgConfig.departmentName || 'PHÒNG KẾ HOẠCH - TÀI CHÍNH')}</div>
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

          {/* Document Title */}
          <div style={{ textAlign: 'center', margin: '22px 0 16px 0' }}>
            <h1 style={{ fontSize: '15pt', fontWeight: 'bold', textTransform: 'uppercase', margin: 0, letterSpacing: '0.2px' }}>
              {normalizeNFC('BẢNG TỔNG HỢP LÀM THÊM NGOÀI GIỜ')}
            </h1>
            <div style={{ fontSize: '11.5pt', fontStyle: 'italic', marginTop: '4px' }}>
              {normalizeNFC(`Tháng ${selectedMonth}`)}
            </div>
          </div>

          {/* Employee Information */}
          <div style={{ fontSize: '11.5pt', marginBottom: '14px', lineHeight: '1.5' }}>
            <table className="w-full border-none" style={{ borderCollapse: 'collapse', border: 'none', width: '100%' }}>
              <tbody>
                <tr style={{ border: 'none' }}>
                  <td style={{ border: 'none', padding: '2px 0', width: '50%' }}>
                    <span style={{ fontWeight: 'bold' }}>{normalizeNFC('Đơn vị: ')}</span>
                    <span>{normalizeNFC(orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính')}</span>
                  </td>
                  <td style={{ border: 'none', padding: '2px 0', width: '50%' }}>
                    <span style={{ fontWeight: 'bold' }}>{normalizeNFC('Vị trí công tác: ')}</span>
                    <span>{normalizeNFC(cleanPosition(activeUser?.position))}</span>
                  </td>
                </tr>
                <tr style={{ border: 'none' }}>
                  <td style={{ border: 'none', padding: '2px 0', width: '50%' }}>
                    <span style={{ fontWeight: 'bold' }}>{normalizeNFC('Họ và tên: ')}</span>
                    <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>
                      {normalizeNFC(activeUser?.name || '....................................')}
                    </span>
                  </td>
                  <td style={{ border: 'none', padding: '2px 0', width: '50%' }}>
                    <span style={{ fontWeight: 'bold' }}>{normalizeNFC('Tháng làm thêm: ')}</span>
                    <span>{normalizeNFC(selectedMonth)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* MAIN OVERTIME TABLE */}
          <table
            className="border-table"
            style={{ width: '100%', fontSize: '10.5pt', margin: '10px 0', borderCollapse: 'collapse', border: '1px solid black' }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2' }}>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '32px', fontWeight: 'bold' }}>
                  {normalizeNFC('STT')}
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '75px', fontWeight: 'bold' }}>
                  {normalizeNFC('Ngày làm thêm')}
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '75px', fontWeight: 'bold' }}>
                  {normalizeNFC('Thời gian')}
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '48px', fontWeight: 'bold' }}>
                  {normalizeNFC('Giờ ĐK')}
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '48px', fontWeight: 'bold' }}>
                  {normalizeNFC('Giờ duyệt')}
                </th>
                <th style={{ padding: '6px 6px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>
                  {normalizeNFC('Nội dung đăng ký & Lý do')}
                </th>
                <th style={{ padding: '6px 6px', border: '1px solid black', textAlign: 'center', width: '130px', fontWeight: 'bold' }}>
                  {normalizeNFC('Kết quả thực hiện / Minh chứng')}
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '70px', fontWeight: 'bold' }}>
                  {normalizeNFC('Ghi chú duyệt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {printData.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '16px 8px', border: '1px solid black', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                    {normalizeNFC('Không có dữ liệu làm thêm phù hợp với bộ lọc trong tháng này.')}
                  </td>
                </tr>
              ) : (
                printData.map((row, idx) => {
                  const regHrs = row.totalRegHours ? parseFloat(row.totalRegHours) : calculateHours(row.startTime, row.endTime);
                  const isApproved = row.approvalStatus === 'Đã duyệt';
                  const appHrs = isApproved ? (row.approvedHours ? parseFloat(row.approvedHours) : regHrs) : '';
                  const rowDate = row.otDate || row.date;

                  return (
                    <tr key={row.id || idx}>
                      <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center' }}>
                        {rowDate ? formatDate(rowDate) : '-'}
                      </td>
                      <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontSize: '9.5pt' }}>
                        {row.startTime} - {row.endTime}
                      </td>
                      <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>
                        {regHrs}
                      </td>
                      <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', color: isApproved ? '#1F4E78' : '#000' }}>
                        {appHrs}
                      </td>
                      <td style={{ padding: '5px 6px', border: '1px solid black', textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold' }}>{normalizeNFC(row.content || '')}</div>
                        {row.reason && (
                          <div style={{ fontSize: '9.5pt', color: '#333', fontStyle: 'italic', marginTop: '2px' }}>
                            {normalizeNFC(`Lý do: ${row.reason}`)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '5px 6px', border: '1px solid black', textAlign: 'left', fontSize: '9.5pt' }}>
                        <div>{normalizeNFC(row.actualResult || (isApproved ? 'Đã hoàn thành theo đăng ký' : 'Chưa báo cáo'))}</div>
                        {row.evidence && (
                          <div style={{ fontStyle: 'italic', color: '#555', marginTop: '2px', fontSize: '8.5pt' }}>
                            {normalizeNFC(`(MC: Có đính kèm)`)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontSize: '9pt' }}>
                        {normalizeNFC(row.approvalNote || row.note || (isApproved ? 'Đồng ý' : (row.approvalStatus || '')))}
                      </td>
                    </tr>
                  );
                })
              )}

              {/* Total summary row */}
              {printData.length > 0 && (
                <tr style={{ backgroundColor: '#fafafa', fontWeight: 'bold' }}>
                  <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center' }} colSpan={3}>
                    <span style={{ textTransform: 'uppercase', fontSize: '10.5pt' }}>
                      {normalizeNFC('Tổng cộng')}
                    </span>
                  </td>
                  <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontSize: '11pt' }}>
                    {totalRegHours}
                  </td>
                  <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontSize: '11pt', color: '#1F4E78' }}>
                    {totalApprovedHours}
                  </td>
                  <td style={{ padding: '6px 6px', border: '1px solid black', textAlign: 'left' }} colSpan={4}>
                    <span>{normalizeNFC(`Tổng số: ${totalDays} ngày làm thêm ngoài giờ (${printData.length} lượt)`)}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Quick Summary Text */}
          <div style={{ fontSize: '11pt', fontWeight: 'bold', margin: '14px 0', lineHeight: '1.6' }}>
            <div>{normalizeNFC(`- Tổng số ngày làm thêm: ${totalDays} ngày`)}</div>
            <div>{normalizeNFC(`- Tổng số giờ làm thêm đăng ký: ${totalRegHours} giờ`)}</div>
            <div>{normalizeNFC(`- Tổng số giờ làm thêm được duyệt: ${totalApprovedHours} giờ`)}</div>
          </div>

          {/* Signatures Section - 3 Columns */}
          <div style={{ marginTop: '24px', marginBottom: '16px' }}>
            <div style={{ textAlign: 'right', fontStyle: 'italic', fontSize: '11pt', marginBottom: '14px' }}>
              {normalizeNFC(`${orgConfig.location || 'Đắk Lắk'}, ngày ...... tháng ...... năm ......`)}
            </div>

            <table style={{ width: '100%', border: 'none', borderCollapse: 'collapse', textAlign: 'center' }}>
              <tbody>
                <tr style={{ border: 'none' }}>
                  <td style={{ width: '33.3%', padding: 0, verticalAlign: 'top', border: 'none', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10.5pt' }}>
                      {normalizeNFC('NGƯỜI ĐĂNG KÝ LÀM THÊM')}
                    </div>
                    <div style={{ fontStyle: 'italic', fontSize: '9.5pt', marginBottom: '60px' }}>
                      {normalizeNFC('(Ký, ghi rõ họ tên)')}
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>
                      {normalizeNFC(activeUser?.name || '')}
                    </div>
                  </td>
                  <td style={{ width: '33.3%', padding: 0, verticalAlign: 'top', border: 'none', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10.5pt' }}>
                      {normalizeNFC(orgConfig.approverTitle || 'LÃNH ĐẠO PHÒNG')}
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
                      {normalizeNFC(orgConfig.leaderTitle || 'VĂN PHÒNG / LÃNH ĐẠO BAN')}
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
