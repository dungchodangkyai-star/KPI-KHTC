import React, { useState, useEffect } from 'react';
import { STANDARD_MONTHS, getActiveLoggedInUser, normalizeNFC, safeFetchJson, formatScore, cleanPosition } from '../utils';
import { Printer, Download, ArrowLeft, Calendar, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrgConfig } from '../contexts/OrgContext';

export default function PrintPersonalKpi() {
  const navigate = useNavigate();
  const { orgConfig } = useOrgConfig();
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [kpiData, setKpiData] = useState<any>(null);

  const fetchUserAndData = async (targetMonth = selectedMonth) => {
    try {
      setLoading(true);
      const dU = await safeFetchJson<any[]>('/api/users', undefined, 3);
      if (dU.success && dU.data && dU.data.length > 0) {
        const activeUser = getActiveLoggedInUser(dU.data);
        setCurrentUser(activeUser);
        if (activeUser) {
          await loadKpiDetail(targetMonth, activeUser.id);
        }
      }
    } catch (err) {
      console.warn("Fetch user notice in print:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserAndData(selectedMonth);

    const handleUserChange = () => {
      fetchUserAndData(selectedMonth);
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, []);

  const loadKpiDetail = async (month: string, uId: number) => {
    try {
      setLoading(true);
      const d = await safeFetchJson(`/api/kpi/detail?month=${month}&userId=${uId}`, undefined, 3);
      if (d.success && d.data) {
        setKpiData(d.data);
      }
    } catch (e) {
      console.warn("Load KPI print data notice:", e);
    } finally {
      setLoading(false);
    }
  };


  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    if (currentUser) {
      loadKpiDetail(m, currentUser.id);
    }
  };

  const u = kpiData?.user || currentUser;
  const sum = kpiData?.summary;
  const detA = kpiData?.detailsA;
  const detC = kpiData?.detailsC;
  const detD = kpiData?.detailsD;

  // Scores
  const selfA = detA?.selfTotal !== null && detA?.selfTotal !== undefined ? detA.selfTotal : null;
  const approvedA = detA?.approvedTotal !== null && detA?.approvedTotal !== undefined ? detA.approvedTotal : null;

  const scoreB = sum?.bTotal ?? 0;
  const scoreB1 = sum?.b1 ?? 0;
  const scoreB2 = sum?.b2 ?? 0;

  const scoreC1 = detC?.c1 ?? detC?.autoC1 ?? 0;
  const scoreC2 = detC?.c2 ?? 0;
  const scoreC = Math.min(10, scoreC1 + scoreC2);

  const scoreD = (detD?.items || []).reduce(
    (s: number, it: any) => s + (parseFloat(it.officialD ?? (it.autoD || '0')) || 0),
    0
  );

  // Totals
  const totalSelf = selfA !== null ? Math.min(100, Math.max(0, selfA + scoreB + scoreC - scoreD)) : null;
  const totalApproved = approvedA !== null ? Math.min(100, Math.max(0, approvedA + scoreB + scoreC - scoreD)) : Math.min(100, Math.max(0, scoreB + scoreC - scoreD));

  const getRank = (score: number | null) => {
    if (score === null) return normalizeNFC('Chưa xếp loại');
    if (score >= 95) return normalizeNFC('Hoàn thành xuất sắc');
    if (score >= 80) return normalizeNFC('Hoàn thành tốt');
    if (score >= 65) return normalizeNFC('Hoàn thành');
    return normalizeNFC('Không hoàn thành');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportWord = () => {
    const printArea = document.getElementById('kpi-print-document');
    if (!printArea) return;

    const rawHtml = printArea.innerHTML;
    const cleanHtml = normalizeNFC(rawHtml);

    const docContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Phieu_KPI_${selectedMonth}_${(u?.name || 'NhanVien')}</title>
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
      margin: 1.5cm 1.5cm 1.5cm 1.5cm;
      mso-header-margin: 30pt;
      mso-footer-margin: 30pt;
      mso-paper-source: 0;
    }
    div.Section1 { page: Section1; }
    body, div, p, span, table, th, td {
      font-family: "Times New Roman", Times, serif !important;
      color: #000000;
      line-height: 1.35;
      font-size: 11.5pt;
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
    downloadLink.download = `Phieu_KPI_${selectedMonth}_${(u?.name || 'NhanVien').replace(/\s+/g, '_')}.doc`;
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16 font-sans print:max-w-none print:m-0 print:p-0 print:space-y-0 print:pb-0">
      {/* Top Header & Controls (Hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/kpi')}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-[#0f2440]">In phiếu kết quả KPI cá nhân</h1>
            <p className="text-xs text-slate-500">
              Định dạng chuẩn 01 trang A4 dọc, phông chữ hành chính chuẩn, sẵn sàng in hoặc xuất Word
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

      {/* Filter Bar (Hidden when printing - strictly Month filter only) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 print:hidden no-print">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-50 rounded-lg text-[#1F4E78]">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-700">Tháng đánh giá:</label>
            <select
              value={selectedMonth}
              onChange={e => handleMonthChange(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-[#1F4E78]"
            >
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => currentUser && loadKpiDetail(selectedMonth, currentUser.id)}
            className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-4 py-1.5 rounded-lg text-sm font-bold transition shadow-sm cursor-pointer"
          >
            Cập nhật phiếu
          </button>
        </div>

        <div className="text-sm font-semibold text-slate-600">
          Nhân sự: <strong className="text-[#0f2440]">{u?.name || 'Đang tải...'}</strong>
        </div>
      </div>

      {/* PRINT AREA CONTAINER - Balanced 1-page A4 styling */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 print:border-none print:shadow-none print:p-0 print:m-0">
        <div
          id="kpi-print-document"
          className="font-document max-w-[800px] mx-auto text-[12pt] leading-[1.35] text-black bg-white print:max-w-none print:w-full"
          style={{ fontFamily: '"Noto Serif", "Times New Roman", Times, "Liberation Serif", serif' }}
        >
          {/* Header 2 Columns */}
          <table className="w-full border-none" style={{ borderCollapse: 'collapse', border: 'none', width: '100%', marginBottom: '16px' }}>
            <tbody>
              <tr style={{ border: 'none' }}>
                <td className="w-1/2 text-center align-top p-0" style={{ border: 'none', textAlign: 'center', verticalAlign: 'top', width: '50%' }}>
                  <div style={{ fontSize: '10.5pt', fontWeight: 'bold', textTransform: 'uppercase' }}>{normalizeNFC(orgConfig.parentAgency || 'BAN QUẢN LÝ DỰ ÁN ĐẦU TƯ XDCT')}</div>
                  <div style={{ fontSize: '10.5pt', fontWeight: 'bold', textTransform: 'uppercase' }}>{normalizeNFC(orgConfig.departmentName || 'PHÒNG KẾ HOẠCH - TÀI CHÍNH')}</div>
                  <div style={{ width: '85px', borderBottom: '1px solid black', margin: '4px auto 0 auto' }}></div>
                </td>
                <td className="w-1/2 text-center align-top p-0" style={{ border: 'none', textAlign: 'center', verticalAlign: 'top', width: '50%' }}>
                  <div style={{ fontSize: '10.5pt', fontWeight: 'bold', textTransform: 'uppercase' }}>{normalizeNFC('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM')}</div>
                  <div style={{ fontSize: '11pt', fontWeight: 'bold' }}>{normalizeNFC('Độc lập - Tự do - Hạnh phúc')}</div>
                  <div style={{ width: '130px', borderBottom: '1px solid black', margin: '4px auto 0 auto' }}></div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Document Title */}
          <div style={{ textAlign: 'center', margin: '18px 0 16px 0' }}>
            <h1 style={{ fontSize: '14.5pt', fontWeight: 'bold', textTransform: 'uppercase', margin: 0, letterSpacing: '0.2px' }}>
              {normalizeNFC('PHIẾU TỔNG HỢP KẾT QUẢ KPI THÁNG')}
            </h1>
            <div style={{ fontSize: '11.5pt', fontStyle: 'italic', marginTop: '4px' }}>
              {normalizeNFC(`Tháng đánh giá: ${selectedMonth}`)}
            </div>
          </div>

          {/* Employee Information */}
          <div style={{ fontSize: '11.5pt', marginBottom: '16px', lineHeight: '1.5' }}>
            <div style={{ display: 'flex', marginBottom: '5px' }}>
              <span style={{ width: '180px', fontWeight: 'bold' }}>{normalizeNFC('Họ và tên nhân sự:')}</span>
              <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12pt' }}>
                {normalizeNFC(u?.name || '................................................')}
              </span>
            </div>
            <div style={{ display: 'flex', marginBottom: '5px' }}>
              <span style={{ width: '180px', fontWeight: 'bold' }}>{normalizeNFC('Chức vụ / Vị trí:')}</span>
              <span>{normalizeNFC(cleanPosition(u?.position))}</span>
            </div>
            <div style={{ display: 'flex', marginBottom: '5px' }}>
              <span style={{ width: '180px', fontWeight: 'bold' }}>{normalizeNFC('Phòng chuyên môn:')}</span>
              <span>{normalizeNFC(orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính')}</span>
            </div>
          </div>

          {/* MAIN EVALUATION TABLE */}
          <table
            className="border-table"
            style={{ width: '100%', fontSize: '10.5pt', margin: '14px 0', borderCollapse: 'collapse', border: '1px solid black' }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2' }}>
                <th style={{ padding: '6px 3px', border: '1px solid black', textAlign: 'center', width: '35px', fontWeight: 'bold' }}>{normalizeNFC('TT')}</th>
                <th style={{ padding: '6px 6px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>{normalizeNFC('Nội dung đánh giá')}</th>
                <th style={{ padding: '6px 3px', border: '1px solid black', textAlign: 'center', width: '60px', fontWeight: 'bold' }}>
                  <div>{normalizeNFC('Điểm')}</div>
                  <div>{normalizeNFC('tối đa')}</div>
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '100px', fontWeight: 'bold' }}>
                  <div>{normalizeNFC('Cá nhân')}</div>
                  <div>{normalizeNFC('tự chấm')}</div>
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '110px', fontWeight: 'bold' }}>
                  <div>{normalizeNFC('Lãnh đạo phòng')}</div>
                  <div>{normalizeNFC('đánh giá')}</div>
                </th>
                <th style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', width: '95px', fontWeight: 'bold' }}>
                  <div>{normalizeNFC('Giám đốc Ban')}</div>
                  <div>{normalizeNFC('đánh giá')}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Row A */}
              <tr>
                <td style={{ padding: '5px 3px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>1</td>
                <td style={{ padding: '5px 6px', border: '1px solid black' }}>
                  <div style={{ fontWeight: 'bold' }}>{normalizeNFC('Điểm A - Chấp hành nội quy, quy chế')}</div>
                  <div style={{ fontSize: '9.5pt', color: '#444', fontStyle: 'italic' }}>
                    {normalizeNFC('(Giờ giấc, kỷ luật, phối hợp, ứng dụng công nghệ)')}
                  </div>
                </td>
                <td style={{ padding: '5px 3px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>30</td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', color: '#0f2440' }}>
                  {selfA !== null ? `${formatScore(selfA)}` : normalizeNFC('Chưa tự chấm')}
                </td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', color: '#1F4E78' }}>
                  {approvedA !== null ? `${formatScore(approvedA)}` : normalizeNFC('Chưa duyệt')}
                </td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center' }}></td>
              </tr>

              {/* Row B */}
              <tr>
                <td style={{ padding: '5px 3px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>2</td>
                <td style={{ padding: '5px 6px', border: '1px solid black' }}>
                  <div style={{ fontWeight: 'bold' }}>{normalizeNFC('Điểm B - Thực hiện nhiệm vụ thường xuyên')}</div>
                  <div style={{ fontSize: '9.5pt', color: '#444', fontStyle: 'italic' }}>
                    {normalizeNFC(`(B1: ${formatScore(scoreB1)}đ + B2: ${formatScore(scoreB2)}đ; ${sum?.approvedWorks || 0} việc đã duyệt)`)}
                  </div>
                </td>
                <td style={{ padding: '5px 3px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>60</td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>{formatScore(scoreB)}</td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>{formatScore(scoreB)}</td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center' }}></td>
              </tr>

              {/* Row C */}
              <tr>
                <td style={{ padding: '5px 3px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>3</td>
                <td style={{ padding: '5px 6px', border: '1px solid black' }}>
                  <div style={{ fontWeight: 'bold' }}>{normalizeNFC('Điểm C - Thưởng/tính chất công việc/việc khó')}</div>
                  <div style={{ fontSize: '9.5pt', color: '#444', fontStyle: 'italic' }}>
                    {normalizeNFC(`(C1 tự động: ${formatScore(scoreC1)}đ; C2 lãnh đạo chấm: ${formatScore(scoreC2)}đ)`)}
                  </div>
                </td>
                <td style={{ padding: '5px 3px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>10</td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>+{formatScore(scoreC)}</td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>+{formatScore(scoreC)}</td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center' }}></td>
              </tr>

              {/* Row D */}
              <tr>
                <td style={{ padding: '5px 3px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}>4</td>
                <td style={{ padding: '5px 6px', border: '1px solid black' }}>
                  <div style={{ fontWeight: 'bold' }}>{normalizeNFC('Điểm D - Điểm phạt vi phạm')}</div>
                  <div style={{ fontSize: '9.5pt', color: '#444', fontStyle: 'italic' }}>
                    {normalizeNFC('(Chậm tiến độ, không hoàn thành, không đạt yêu cầu)')}
                  </div>
                </td>
                <td style={{ padding: '5px 3px', border: '1px solid black', textAlign: 'center', fontStyle: 'italic' }}>{normalizeNFC('Trừ')}</td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', color: '#b91c1c' }}>
                  {scoreD > 0 ? `-${formatScore(scoreD)}` : '0'}
                </td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', color: '#b91c1c' }}>
                  {scoreD > 0 ? `-${formatScore(scoreD)}` : '0'}
                </td>
                <td style={{ padding: '5px 4px', border: '1px solid black', textAlign: 'center' }}></td>
              </tr>

              {/* Total Row */}
              <tr style={{ backgroundColor: '#fafafa' }}>
                <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }} colSpan={2}>
                  <span style={{ textTransform: 'uppercase', fontSize: '11pt', fontWeight: 'bold' }}>
                    {normalizeNFC('Tổng điểm KPI: A + B + C - D')}
                  </span>
                </td>
                <td style={{ padding: '6px 3px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', fontSize: '11pt' }}>100</td>
                <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', fontSize: '11.5pt', color: '#0f2440' }}>
                  {totalSelf !== null ? formatScore(totalSelf) : '-'}
                </td>
                <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', fontSize: '11.5pt', color: '#1F4E78' }}>
                  {formatScore(totalApproved)}
                </td>
                <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center' }}></td>
              </tr>

              {/* Rank Row */}
              <tr style={{ backgroundColor: '#fafafa' }}>
                <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }} colSpan={2}>
                  <span style={{ textTransform: 'uppercase', fontSize: '11pt', fontWeight: 'bold' }}>
                    {normalizeNFC('Xếp loại KPI tháng')}
                  </span>
                </td>
                <td style={{ padding: '6px 3px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold' }}></td>
                <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', fontSize: '10.5pt' }}>
                  {getRank(totalSelf)}
                </td>
                <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center', fontWeight: 'bold', fontSize: '10.5pt' }}>
                  {getRank(totalApproved)}
                </td>
                <td style={{ padding: '6px 4px', border: '1px solid black', textAlign: 'center' }}></td>
              </tr>
            </tbody>
          </table>

          {/* Notes on Grading Standards */}
          <div style={{ fontSize: '10pt', lineHeight: '1.4', margin: '12px 0 16px 0' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>{normalizeNFC('Ghi chú tóm tắt căn cứ đánh giá:')}</div>
            <div>
              {normalizeNFC('1. Điểm A (30đ): Chấp hành nội quy, kỷ luật lao động và phối hợp công tác; điểm chính thức áp dụng theo kết quả phê duyệt của lãnh đạo phòng.')}
            </div>
            <div>
              {normalizeNFC(`2. Điểm B (60đ): Điểm quy đổi công việc cá nhân: ${formatScore(sum?.convertedScore)}đ, tỷ trọng cá nhân: ${formatScore(sum?.personalShare)}%, tỷ trọng bình quân phòng: ${formatScore(sum?.avgShare)}%.`)}
            </div>
            <div>
              {normalizeNFC(`3. Điểm C (10đ): Điểm tính chất tự động C1: ${formatScore(scoreC1)}đ; Điểm việc khó/đột xuất C2: ${formatScore(scoreC2)}đ.`)}
            </div>
            <div>
              {normalizeNFC('4. Quy định xếp loại: Từ 95 điểm trở lên: Hoàn thành xuất sắc nhiệm vụ; Từ 80 đến dưới 95 điểm: Hoàn thành tốt nhiệm vụ; Từ 65 đến dưới 80 điểm: Hoàn thành nhiệm vụ; Dưới 65 điểm: Không hoàn thành nhiệm vụ.')}
            </div>
          </div>

          {/* Signatures Section */}
          <div className="signature-block avoid-page-break" style={{ marginTop: '16px', marginBottom: '0' }}>
            <div style={{ textAlign: 'right', fontStyle: 'italic', fontSize: '11pt', marginBottom: '12px' }}>
              {normalizeNFC(`${orgConfig.location || 'Đắk Lắk'}, ngày ...... tháng ...... năm ......`)}
            </div>

            <table style={{ width: '100%', border: 'none', borderCollapse: 'collapse', textAlign: 'center' }}>
              <tbody>
                <tr style={{ border: 'none' }}>
                  <td style={{ width: '33.3%', padding: 0, verticalAlign: 'top', border: 'none', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11pt' }}>{normalizeNFC(orgConfig.creatorTitle || 'NGƯỜI TỰ ĐÁNH GIÁ')}</div>
                    <div style={{ fontStyle: 'italic', fontSize: '10pt', marginBottom: '70px' }}>{normalizeNFC('(Ký, ghi rõ họ tên)')}</div>
                    <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>{normalizeNFC(u?.name || '')}</div>
                  </td>
                  <td style={{ width: '33.3%', padding: 0, verticalAlign: 'top', border: 'none', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11pt' }}>{normalizeNFC(orgConfig.approverTitle || 'LÃNH ĐẠO PHÒNG')}</div>
                    <div style={{ fontStyle: 'italic', fontSize: '10pt', marginBottom: '70px' }}>{normalizeNFC('(Ký, ghi rõ họ tên)')}</div>
                    <div style={{ minHeight: '1.4em' }}></div>
                  </td>
                  <td style={{ width: '33.3%', padding: 0, verticalAlign: 'top', border: 'none', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11pt' }}>{normalizeNFC(orgConfig.leaderTitle || 'THỦ TRƯỞNG ĐƠN VỊ')}</div>
                    <div style={{ fontStyle: 'italic', fontSize: '10pt', marginBottom: '70px' }}>{normalizeNFC('(Ký, ghi rõ họ tên)')}</div>
                    <div style={{ minHeight: '1.4em' }}></div>
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
