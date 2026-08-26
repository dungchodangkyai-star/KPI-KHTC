import React, { useState, useEffect } from 'react';
import { 
  Award, Users, Briefcase, Download, Printer, RefreshCw, 
  Calendar, Search, Filter, Eye, ChevronRight, CheckCircle2, 
  AlertCircle, Star, Zap, Layers, FileText, ArrowLeft, ArrowRight,
  TrendingUp, BarChart3, Clock, Sparkles, Building2, UserCheck,
  CheckSquare, Square, Check, X, SlidersHorizontal, ChevronDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  STANDARD_MONTHS, 
  KPI_A_CRITERIA, 
  safeFetchJson, 
  normalizeNFC, 
  formatDate, 
  getActiveLoggedInUser,
  isLeadershipRole,
  formatScore,
  formatScoreWithUnit,
  formatPercent,
  cleanPosition
} from '../utils';
import { useOrgConfig } from '../contexts/OrgContext';
import { useNavigate, useLocation } from 'react-router-dom';

export default function DepartmentKpiSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orgConfig } = useOrgConfig();
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active Tab View: 'SUMMARY_TABLE' | 'INDIVIDUAL_LOOKUP' | 'WORK_STATS' | 'PRINT_VIEW'
  const [activeTab, setActiveTab] = useState<'SUMMARY_TABLE' | 'INDIVIDUAL_LOOKUP' | 'WORK_STATS' | 'PRINT_VIEW'>(
    location.pathname === '/print-department' ? 'PRINT_VIEW' : 'SUMMARY_TABLE'
  );

  // Helper to format selfRank display and export accurately without incorrect fallbacks
  const getSelfRankDisplay = (u: any) => {
    const hasSelfA = u?.scores?.selfA !== null && u?.scores?.selfA !== undefined;
    if (!hasSelfA) return 'Chưa tự chấm A';
    if (!u?.selfRank) return 'Chưa xếp loại';
    return u.selfRank;
  };

  // Filter & Search in Table
  const [searchTerm, setSearchTerm] = useState('');
  const [rankSource, setRankSource] = useState<'LEADER' | 'SELF'>('LEADER');
  const [rankFilter, setRankFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Selection of personnel to include in print & export
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [showPrintSelectionPanel, setShowPrintSelectionPanel] = useState(true);

  // Individual Lookup State
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [individualKpiData, setIndividualKpiData] = useState<any>(null);
  const [individualLoading, setIndividualLoading] = useState(false);
  const [showDetailB, setShowDetailB] = useState(true);
  const [showDetailC, setShowDetailC] = useState(true);
  const [showDetailD, setShowDetailD] = useState(false);

  // Fetch department summary data
  const fetchDepartmentSummary = async (month = selectedMonth) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      const d = await safeFetchJson(`/api/kpi/department-summary?month=${month}`, undefined, 3);
      if (d.success && d.data) {
        setSummaryData(d.data);
        
        // Initialize or synchronize selected users for print
        if (d.data.users && d.data.users.length > 0) {
          const allIds = d.data.users.map((u: any) => u.id);
          setSelectedUserIds(prev => {
            if (prev.length === 0) return allIds;
            // Keep valid existing selections or fallback to all
            const valid = prev.filter(id => allIds.includes(id));
            return valid.length > 0 ? valid : allIds;
          });

          if (!selectedUserId || !d.data.users.find((u: any) => u.id === selectedUserId)) {
            setSelectedUserId(d.data.users[0].id);
          }
        }
      } else if (d.error) {
        setErrorMsg(d.error);
      }
    } catch (err: any) {
      console.warn("Fetch dept KPI summary warning:", err);
      setErrorMsg("Không thể tải bảng tổng hợp KPI phòng. Đang thử lại...");
    } finally {
      setLoading(false);
    }
  };

  // Load individual detail KPI when user is picked in lookup tab
  const loadIndividualDetail = async (month: string, uId: number) => {
    try {
      setIndividualLoading(true);
      const d = await safeFetchJson(`/api/kpi/detail?month=${month}&userId=${uId}`, undefined, 3);
      if (d.success && d.data) {
        setIndividualKpiData(d.data);
      }
    } catch (e: any) {
      console.warn("Load individual KPI detail warning:", e);
    } finally {
      setIndividualLoading(false);
    }
  };

  useEffect(() => {
    // Current logged in user
    const usersReq = safeFetchJson<any[]>('/api/users').then(res => {
      if (res.success && res.data) {
        const u = getActiveLoggedInUser(res.data);
        setCurrentUser(u);
      }
    });

    fetchDepartmentSummary(selectedMonth);
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadIndividualDetail(selectedMonth, selectedUserId);
    }
  }, [selectedUserId, selectedMonth]);

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    fetchDepartmentSummary(m);
    if (selectedUserId) {
      loadIndividualDetail(m, selectedUserId);
    }
  };

  const handleRecalculateAll = async () => {
    try {
      setRecalculating(true);
      setSuccessMsg(null);
      setErrorMsg(null);
      const res = await safeFetchJson('/api/kpi/recalculate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth })
      });
      if (res.success) {
        setSuccessMsg(`Đã tính toán lại toàn bộ KPI tháng ${selectedMonth} thành công!`);
        await fetchDepartmentSummary(selectedMonth);
        if (selectedUserId) {
          await loadIndividualDetail(selectedMonth, selectedUserId);
        }
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setErrorMsg(res.error || 'Tính toán lại thất bại.');
      }
    } catch (e: any) {
      setErrorMsg('Lỗi kết nối khi tính toán lại KPI.');
    } finally {
      setRecalculating(false);
    }
  };

  const handleOpenIndividual = (uId: number) => {
    setSelectedUserId(uId);
    setActiveTab('INDIVIDUAL_LOOKUP');
    loadIndividualDetail(selectedMonth, uId);
  };

  // Selection helper functions
  const handleToggleUser = (uId: number) => {
    setSelectedUserIds(prev => 
      prev.includes(uId) ? prev.filter(id => id !== uId) : [...prev, uId]
    );
  };

  const handleSelectAll = () => {
    if (!summaryData?.users) return;
    setSelectedUserIds(summaryData.users.map((u: any) => u.id));
  };

  const handleDeselectAll = () => {
    setSelectedUserIds([]);
  };

  const handleSelectFiltered = () => {
    setSelectedUserIds(filteredUsers.map(u => u.id));
  };

  const handleSelectOnlyApproved = () => {
    if (!summaryData?.users) return;
    const approved = summaryData.users
      .filter((u: any) => u.scores?.approvedKpiTotal !== null && u.scores?.approvedKpiTotal !== undefined)
      .map((u: any) => u.id);
    setSelectedUserIds(approved);
  };

  const handleSelectOnlyLeaders = () => {
    if (!summaryData?.users) return;
    const leaders = summaryData.users
      .filter((u: any) => u.isLeaderOrAbove)
      .map((u: any) => u.id);
    setSelectedUserIds(leaders);
  };

  const handleSelectOnlyStaff = () => {
    if (!summaryData?.users) return;
    const staff = summaryData.users
      .filter((u: any) => !u.isLeaderOrAbove)
      .map((u: any) => u.id);
    setSelectedUserIds(staff);
  };

  // Export Excel function with selected personnel
  const handleExportExcel = () => {
    if (!summaryData || !summaryData.users) return;

    const allUsers: any[] = summaryData.users || [];
    const targetUsers = allUsers.filter((u: any) => selectedUserIds.includes(u.id));
    const exportList = targetUsers.length > 0 ? targetUsers : allUsers;

    const dataRows = exportList.map((u: any, idx: number) => {
      const isBApproved = (u.taskCounts?.approved || 0) > 0;
      const isApproved = u.scores?.approvedKpiTotal !== null && u.scores?.approvedKpiTotal !== undefined;
      const approvedB1 = isBApproved && u.scores?.approvedB1 !== undefined && u.scores?.approvedB1 !== null ? formatScore(u.scores.approvedB1) : (u.isLeaderOrAbove ? '-' : 'Chờ duyệt');
      const approvedB2 = isBApproved && u.scores?.approvedB2 !== undefined && u.scores?.approvedB2 !== null ? formatScore(u.scores.approvedB2) : (u.isLeaderOrAbove ? '-' : 'Chờ duyệt');
      const approvedBTotal = isBApproved && u.scores?.approvedBTotal !== undefined && u.scores?.approvedBTotal !== null ? formatScore(u.scores.approvedBTotal) : (u.isLeaderOrAbove ? '-' : 'Chờ duyệt');

      return {
        "STT": idx + 1,
        "Họ và tên": u.name,
        "Vị trí công tác": cleanPosition(u.position),
        "Số việc thực hiện": u.taskCounts?.total || 0,
        "Số việc đã duyệt": u.taskCounts?.approved || 0,
        "B1 tự chấm": formatScore(u.scores?.selfB1 ?? 0),
        "B2 tự chấm": formatScore(u.scores?.selfB2 ?? 0),
        "Tổng B tự chấm": formatScore(u.scores?.selfBTotal ?? 0),
        "B1 duyệt": approvedB1,
        "B2 duyệt": approvedB2,
        "Tổng B duyệt": approvedBTotal,
        "Điểm tự đánh giá": u.scores?.selfKpiTotal !== null && u.scores?.selfKpiTotal !== undefined ? formatScore(u.scores.selfKpiTotal) : '0',
        "Điểm lãnh đạo duyệt": isApproved ? formatScore(u.scores.approvedKpiTotal) : (u.isLeaderOrAbove ? '' : 'Chờ duyệt'),
        "Tự xếp loại": getSelfRankDisplay(u),
        // CONSTRAINT: Vị trí từ phó phòng trở lên bỏ trống lãnh đạo xếp
        "Lãnh đạo xếp": u.isLeaderOrAbove ? '' : (u.leaderRankDisplay || (isApproved ? u.approvedRank : 'Chờ duyệt'))
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `KPI_Phong_${selectedMonth}`);
    XLSX.writeFile(wb, `Tong_Hop_KPI_Phong_${selectedMonth}.xlsx`);
  };

  // Export Word Document with Rock-Solid Tables and Selected Personnel
  const handleExportWord = () => {
    const allUsers: any[] = summaryData?.users || [];
    const targetUsers = allUsers.filter((u: any) => selectedUserIds.includes(u.id));
    const exportList = targetUsers.length > 0 ? targetUsers : allUsers;
    
    // Generate clean, inline-styled rows for MS Word
    const tableRowsHtml = exportList.map((u: any, idx: number) => {
      const isBApproved = (u.taskCounts?.approved || 0) > 0;
      const isApproved = u.scores?.approvedKpiTotal !== null && u.scores?.approvedKpiTotal !== undefined;
      const selfB1 = formatScore(u.scores?.selfB1 ?? 0);
      const selfB2 = formatScore(u.scores?.selfB2 ?? 0);
      const selfBTotal = formatScore(u.scores?.selfBTotal ?? 0);
      const selfBDisplay = `${selfB1} / ${selfB2} / <b>${selfBTotal}</b>`;

      const approvedB1 = formatScore(u.scores?.approvedB1 ?? 0);
      const approvedB2 = formatScore(u.scores?.approvedB2 ?? 0);
      const approvedBTotal = formatScore(u.scores?.approvedBTotal ?? 0);
      const approvedBDisplay = isBApproved && u.scores?.approvedBTotal !== undefined && u.scores?.approvedBTotal !== null 
        ? `${approvedB1} / ${approvedB2} / <b>${approvedBTotal}</b>` 
        : (u.isLeaderOrAbove ? '-' : 'Chờ duyệt');

      const selfScore = u.scores?.selfKpiTotal !== null && u.scores?.selfKpiTotal !== undefined ? formatScore(u.scores.selfKpiTotal) : '-';
      const approvedScore = isApproved ? formatScore(u.scores.approvedKpiTotal) : (u.isLeaderOrAbove ? '-' : 'Chờ duyệt');
      const selfRank = getSelfRankDisplay(u);
      const leaderRank = u.isLeaderOrAbove ? '' : (isApproved ? (u.approvedRank || '-') : 'Chờ duyệt');

      return `
        <tr>
          <td style="border: 1px solid #000000; padding: 6px 4px; text-align: center;">${idx + 1}</td>
          <td style="border: 1px solid #000000; padding: 6px 6px; font-weight: bold; text-align: left;">${normalizeNFC(u.name || '')}</td>
          <td style="border: 1px solid #000000; padding: 6px 6px; text-align: left;">${normalizeNFC(cleanPosition(u.position))}</td>
          <td style="border: 1px solid #000000; padding: 6px 4px; text-align: center;">${selfBDisplay}</td>
          <td style="border: 1px solid #000000; padding: 6px 4px; text-align: center;">${approvedBDisplay}</td>
          <td style="border: 1px solid #000000; padding: 6px 4px; text-align: center; font-weight: bold;">${selfScore}</td>
          <td style="border: 1px solid #000000; padding: 6px 4px; text-align: center; font-weight: bold;">${approvedScore}</td>
          <td style="border: 1px solid #000000; padding: 6px 6px; text-align: center;">${normalizeNFC(selfRank)}</td>
          <td style="border: 1px solid #000000; padding: 6px 6px; text-align: center;">${normalizeNFC(leaderRank)}</td>
        </tr>
      `;
    }).join('');

    const docContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Tong_Hop_KPI_${selectedMonth}_Phong_KHTC</title>
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
      size: 29.7cm 21.0cm; /* Landscape A4 */
      margin: 1.5cm 1.5cm 1.5cm 1.5cm;
      mso-header-margin: 35.4pt;
      mso-footer-margin: 35.4pt;
      mso-paper-source: 0;
    }
    div.Section1 { page: Section1; }
    body, div, p, span, table, th, td {
      font-family: "Times New Roman", Times, serif !important;
      color: #000000;
      line-height: 1.35;
      font-size: 11pt;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      width: 100%;
    }
    table.header-table {
      width: 100%;
      border: none;
      margin-bottom: 16px;
    }
    table.header-table td {
      border: none;
      vertical-align: top;
      text-align: center;
      padding: 0;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
      mso-border-alt: solid windowtext .5pt;
      margin-top: 14px;
      margin-bottom: 14px;
    }
    table.data-table th {
      border: 1px solid #000000;
      mso-border-alt: solid windowtext .5pt;
      background-color: #f2f2f2;
      text-align: center;
      font-weight: bold;
      padding: 6px 4px;
      font-size: 11pt;
    }
    table.data-table td {
      border: 1px solid #000000;
      mso-border-alt: solid windowtext .5pt;
      padding: 5px 4px;
      font-size: 10.5pt;
    }
    table.sig-table {
      width: 100%;
      border: none;
      margin-top: 24px;
    }
    table.sig-table td {
      border: none;
      vertical-align: top;
      text-align: center;
      padding: 0 8px;
    }
  </style>
</head>
<body>
  <div class="Section1">
    <!-- Header 2 Columns -->
    <table class="header-table" style="width: 100%; border: none; border-collapse: collapse;">
      <tr>
        <td style="width: 45%; text-align: center; vertical-align: top; border: none;">
          <div style="font-size: 10.5pt; font-weight: bold; text-transform: uppercase;">${normalizeNFC(orgConfig.parentAgency || 'BAN QUẢN LÝ DỰ ÁN ĐẦU TƯ XÂY DỰNG')}</div>
          <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase; margin-top: 2px;">${normalizeNFC(orgConfig.departmentName || 'PHÒNG KẾ HOẠCH - TÀI CHÍNH')}</div>
          <div style="width: 120px; border-bottom: 1px solid #000000; margin: 4px auto 0 auto;"></div>
        </td>
        <td style="width: 55%; text-align: center; vertical-align: top; border: none;">
          <div style="font-size: 10.5pt; font-weight: bold; text-transform: uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div style="font-size: 11pt; font-weight: bold; margin-top: 2px;">Độc lập - Tự do - Hạnh phúc</div>
          <div style="width: 140px; border-bottom: 1px solid #000000; margin: 4px auto 0 auto;"></div>
        </td>
      </tr>
    </table>

    <!-- Title -->
    <div style="text-align: center; margin: 18px 0 12px 0;">
      <div style="font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
        BẢNG TỔNG HỢP ĐÁNH GIÁ VÀ XẾP LOẠI HIỆU QUẢ CÔNG VIỆC (KPI)
      </div>
      <div style="font-size: 11pt; font-style: italic; font-weight: bold; margin-top: 4px;">
        Tháng ${selectedMonth} — Đơn vị: ${normalizeNFC(orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính')}
      </div>
    </div>

    <!-- Main Table -->
    <table class="data-table" border="1" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid #000000;">
      <thead>
        <tr style="background-color: #f2f2f2;">
          <th style="border: 1px solid #000000; width: 35px; text-align: center; padding: 6px 4px; font-weight: bold;">STT</th>
          <th style="border: 1px solid #000000; width: 160px; text-align: center; padding: 6px 6px; font-weight: bold;">Tên nhân sự</th>
          <th style="border: 1px solid #000000; width: 130px; text-align: center; padding: 6px 6px; font-weight: bold;">Vị trí</th>
          <th style="border: 1px solid #000000; width: 105px; text-align: center; padding: 6px 4px; font-weight: bold;">B tự chấm<br/><span style="font-size: 8.5pt; font-weight: normal;">(B1 / B2 / Tổng)</span></th>
          <th style="border: 1px solid #000000; width: 105px; text-align: center; padding: 6px 4px; font-weight: bold;">B duyệt<br/><span style="font-size: 8.5pt; font-weight: normal;">(B1 / B2 / Tổng)</span></th>
          <th style="border: 1px solid #000000; width: 90px; text-align: center; padding: 6px 4px; font-weight: bold;">Điểm tự đánh giá</th>
          <th style="border: 1px solid #000000; width: 95px; text-align: center; padding: 6px 4px; font-weight: bold;">Điểm lãnh đạo duyệt</th>
          <th style="border: 1px solid #000000; width: 110px; text-align: center; padding: 6px 6px; font-weight: bold;">Tự xếp loại</th>
          <th style="border: 1px solid #000000; width: 110px; text-align: center; padding: 6px 6px; font-weight: bold;">Lãnh đạo xếp</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>

    <!-- Notes -->
    <div style="font-size: 10pt; line-height: 1.5; margin-top: 10px; margin-bottom: 16px;">
      <p style="margin: 2px 0;">• Tổng số nhân sự trong danh sách: <strong>${exportList.length}</strong> đồng chí.</p>
      <p style="margin: 2px 0;">• Tổng số đầu mục công việc toàn phòng trong tháng: <strong>${stats.totalWorks || 0}</strong> nhiệm vụ (Đã hoàn thành duyệt: <strong>${stats.approvedWorks || 0}</strong> nhiệm vụ).</p>
      <p style="margin: 2px 0; font-style: italic;">• Ghi chú: Căn cứ quy chế đánh giá, đối với các vị trí từ Phó Trưởng phòng trở lên chỉ có cột Tự xếp loại, cột Lãnh đạo xếp để trống theo quy định.</p>
    </div>

    <!-- Date line -->
    <div style="text-align: right; font-style: italic; font-size: 11pt; margin-top: 10px; margin-bottom: 12px; padding-right: 20px;">
      ${normalizeNFC(orgConfig.location || 'Đắk Lắk')}, ngày ...... tháng ...... năm ......
    </div>

    <!-- Signatures 3 Columns -->
    <table class="sig-table" style="width: 100%; border: none; border-collapse: collapse; margin-top: 10px;">
      <tr>
        <td style="width: 33.3%; text-align: center; vertical-align: top; border: none;">
          <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase;">${normalizeNFC(orgConfig.creatorTitle || 'NGƯỜI LẬP BIỂU')}</div>
          <div style="font-size: 10pt; font-style: italic; margin-top: 2px;">(Ký, ghi rõ họ tên)</div>
          <div style="height: 70px;"></div>
          <div style="font-size: 11pt; font-weight: bold;">${currentUser?.name || 'Nguyễn Thị Hải Hà'}</div>
        </td>
        <td style="width: 33.3%; text-align: center; vertical-align: top; border: none;">
          <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase;">${normalizeNFC(orgConfig.approverTitle || 'LÃNH ĐẠO PHÒNG')}</div>
          <div style="font-size: 10pt; font-style: italic; margin-top: 2px;">(Ký, ghi rõ họ tên)</div>
          <div style="height: 70px;"></div>
          <div style="font-size: 11pt; font-weight: bold;">Khuất Văn Sơn</div>
        </td>
        <td style="width: 33.3%; text-align: center; vertical-align: top; border: none;">
          <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase;">${normalizeNFC(orgConfig.leaderTitle || 'THỦ TRƯỞNG ĐƠN VỊ')}</div>
          <div style="font-size: 10pt; font-style: italic; margin-top: 2px;">(Ký, đóng dấu)</div>
          <div style="height: 70px;"></div>
          <div style="font-size: 11pt; font-weight: bold;">Giám đốc</div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;

    const blob = new Blob(['\ufeff', docContent], {
      type: 'application/msword;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Tong_Hop_KPI_${selectedMonth}_Phong_KHTC.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  // Filtered table rows
  const usersList: any[] = summaryData?.users || [];
  const filteredUsers = usersList.filter(u => {
    const matchSearch = !searchTerm || 
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchRank = true;
    if (rankSource === 'SELF') {
      // 1. TỰ XẾP LOẠI:
      // - Chỉ lọc theo selfRank; chưa tự chấm A thuộc 'Chờ hoàn tất' (PENDING)
      const hasSelfA = u.scores?.selfA !== null && u.scores?.selfA !== undefined;
      const selfRankStr = u.selfRank || '';
      const isPendingSelf = !hasSelfA || selfRankStr.includes('Chưa') || selfRankStr.includes('Chờ') || !selfRankStr;

      if (rankFilter === 'ALL') {
        matchRank = true;
      } else if (rankFilter === 'PENDING') {
        matchRank = isPendingSelf;
      } else {
        if (isPendingSelf) {
          matchRank = false;
        } else if (rankFilter === 'EXCELLENT') {
          matchRank = selfRankStr.includes('xuất sắc') || selfRankStr.includes('Xuất sắc');
        } else if (rankFilter === 'GOOD') {
          matchRank = selfRankStr.includes('tốt') || selfRankStr.includes('Tốt');
        } else if (rankFilter === 'STANDARD') {
          matchRank = selfRankStr === 'Hoàn thành' || selfRankStr === 'Hoàn thành nhiệm vụ' || (selfRankStr.includes('Hoàn thành') && !selfRankStr.includes('xuất sắc') && !selfRankStr.includes('tốt') && !selfRankStr.includes('Không'));
        } else if (rankFilter === 'FAIL') {
          matchRank = selfRankStr.includes('Không hoàn thành') || selfRankStr.includes('Không HT');
        }
      }
    } else {
      // 2. LÃNH ĐẠO XẾP LOẠI:
      // - Phó phòng trở lên không đưa vào kết quả lọc xếp loại lãnh đạo
      if (u.isLeaderOrAbove) {
        return false;
      }

      // - Trạng thái lãnh đạo “Chờ duyệt” dựa vào approvedKpiTotal null/undefined hoặc approvedRank = “Chờ duyệt”
      // - Hồ sơ chưa hoàn tất A/C/D không được đưa vào nhóm xếp loại chính thức
      const hasApprovedTotal = u.scores?.approvedKpiTotal !== null && u.scores?.approvedKpiTotal !== undefined;
      const approvedRankStr = u.approvedRank || '';
      const isPendingApproved = !hasApprovedTotal || approvedRankStr === 'Chờ duyệt' || approvedRankStr.includes('Chưa') || !approvedRankStr;

      if (rankFilter === 'ALL') {
        matchRank = true;
      } else if (rankFilter === 'PENDING') {
        matchRank = isPendingApproved;
      } else {
        if (isPendingApproved) {
          matchRank = false;
        } else if (rankFilter === 'EXCELLENT') {
          matchRank = approvedRankStr.includes('xuất sắc') || approvedRankStr.includes('Xuất sắc');
        } else if (rankFilter === 'GOOD') {
          matchRank = approvedRankStr.includes('tốt') || approvedRankStr.includes('Tốt');
        } else if (rankFilter === 'STANDARD') {
          matchRank = approvedRankStr === 'Hoàn thành' || approvedRankStr === 'Hoàn thành nhiệm vụ' || (approvedRankStr.includes('Hoàn thành') && !approvedRankStr.includes('xuất sắc') && !approvedRankStr.includes('tốt') && !approvedRankStr.includes('Không'));
        } else if (rankFilter === 'FAIL') {
          matchRank = approvedRankStr.includes('Không hoàn thành') || approvedRankStr.includes('Không HT');
        }
      }
    }

    let matchRole = true;
    if (roleFilter === 'LEADER') matchRole = u.isLeaderOrAbove;
    else if (roleFilter === 'STAFF') matchRole = !u.isLeaderOrAbove;

    return matchSearch && matchRank && matchRole;
  });

  // Rank badge styling helper
  const getRankBadgeClass = (rankStr: string) => {
    if (!rankStr || rankStr === 'Chưa xếp' || rankStr === 'Chưa xếp loại' || rankStr === 'Chưa tự chấm' || rankStr === 'Chưa tự chấm A' || rankStr === 'Chờ duyệt' || rankStr === '-') {
      return 'bg-slate-100 text-slate-600 border-slate-200';
    }
    if (rankStr.includes('xuất sắc') || rankStr.includes('Xuất sắc')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
    }
    if (rankStr.includes('tốt') || rankStr.includes('Tốt')) {
      return 'bg-blue-50 text-blue-800 border-blue-200 font-bold';
    }
    if (rankStr.includes('Không hoàn thành') || rankStr.includes('Không HT')) {
      return 'bg-rose-50 text-rose-800 border-rose-200 font-bold';
    }
    return 'bg-amber-50 text-amber-800 border-amber-200 font-bold';
  };

  const stats = summaryData?.stats || {};
  const taskGroupSummary = summaryData?.taskGroupSummary || {};
  const natureDistribution = summaryData?.natureDistribution || {};

  // Individual lookup data shortcuts (aligned strictly with PersonalKpi.tsx)
  const indUser = individualKpiData?.user;
  const indSum = individualKpiData?.summary;
  const indDetA = individualKpiData?.detailsA;
  const indDetC = individualKpiData?.detailsC;
  const indDetD = individualKpiData?.detailsD;
  const indAllTasks = (individualKpiData?.works && individualKpiData.works.length > 0)
    ? individualKpiData.works
    : (individualKpiData?.approvedTasks || []);
  const indApprovedTasks = individualKpiData?.approvedTasks || [];

  // Scores A
  const indScoreASelf = indDetA?.selfTotal !== null && indDetA?.selfTotal !== undefined ? indDetA.selfTotal : null;
  const indScoreAApproved = indDetA?.approvedTotal !== null && indDetA?.approvedTotal !== undefined ? indDetA.approvedTotal : null;
  const indIsStatusAApproved = indDetA?.statusA === 'Đã duyệt';
  const indIsStatusCApproved = indDetC?.statusC === 'Đã duyệt';
  const indIsStatusDApproved = indDetD?.statusD === 'Đã duyệt';
  const indIsAllApproved = indIsStatusAApproved && indIsStatusCApproved && indIsStatusDApproved && indScoreAApproved !== null && indScoreAApproved !== undefined;

  // Scores B (Self & Approved)
  const indSelfB1 = indSum?.selfB1 ?? 0;
  const indSelfB2 = indSum?.selfB2 ?? 0;
  const indSelfBTotal = indSum?.selfBTotal ?? 0;

  const indApprovedWorksCount = indSum?.approvedWorks ?? indApprovedTasks.length ?? 0;
  const indHasApprovedWorks = indApprovedWorksCount > 0;
  const indApprovedB1 = indSum?.approvedB1 ?? 0;
  const indApprovedB2 = indSum?.approvedB2 ?? 0;
  const indApprovedBTotal = indSum?.approvedBTotal ?? 0;

  // Scores C (Self automatic C & Approved C)
  const indSelfAutoC1 = indDetC?.selfAutoC1 ?? indDetC?.autoC1 ?? indDetC?.c1 ?? 0;
  const indApprovedAutoC1 = indDetC?.approvedAutoC1 ?? indDetC?.autoC1 ?? indDetC?.c1 ?? 0;
  const indSelfC = Math.min(10, indSelfAutoC1);
  const indScoreC1 = indApprovedAutoC1;
  const indScoreC2 = indDetC?.c2 ?? 0;
  const indApprovedC = Math.min(10, indScoreC1 + indScoreC2);

  // Scores D (Self automatic D & Approved D)
  const indAutoDTotal = indDetD?.totalAutoD !== undefined
    ? indDetD.totalAutoD
    : (indDetD?.items || []).reduce((s: number, it: any) => s + (parseFloat(it.autoD || '0') || 0), 0);
  const indSelfD = indAutoDTotal;

  const indApprovedD = indDetD?.totalOfficialD !== undefined
    ? indDetD.totalOfficialD
    : (indDetD?.items || []).reduce(
        (s: number, it: any) => s + (parseFloat(it.officialD !== undefined ? it.officialD : (it.autoD || '0')) || 0),
        0
      );

  // Server-authoritative totals & rankings for individual lookup
  const indTotalSelf = individualKpiData?.selfKpiTotal ?? indSum?.selfKpiTotal ?? 0;
  const indSelfRankText = individualKpiData?.selfRank ?? indSum?.selfRank ?? 'Chưa xếp loại';
  const indTotalApproved = individualKpiData?.approvedKpiTotal ?? indSum?.approvedKpiTotal ?? null;
  const indRankText = individualKpiData?.approvedRank ?? indSum?.approvedRank ?? 'Chờ duyệt';

  const getIndRankBg = (rank: string) => {
    const r = (rank || '').toLowerCase();
    if (r.includes('xuất sắc')) return 'bg-emerald-100 text-emerald-950 border-emerald-300';
    if (r.includes('tốt')) return 'bg-blue-100 text-blue-950 border-blue-300';
    if (r.includes('không hoàn thành') || r.includes('không ht')) return 'bg-rose-100 text-rose-950 border-rose-300';
    if (r.includes('hoàn thành')) return 'bg-amber-100 text-amber-950 border-amber-300';
    return 'bg-slate-100 text-slate-900 border-slate-300';
  };

  const indRankBg = getIndRankBg(indRankText);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 font-sans print:max-w-none print:m-0 print:p-0 print:space-y-0 print:pb-0">
      {/* Top Header & Navigation Banner - Hidden on print */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden no-print">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-[#1F4E78] to-[#173a5a] text-white rounded-2xl shadow-md border border-[#173a5a]">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-[26px] font-black text-[#0f2440] tracking-tight">
                Tổng hợp & Tra cứu KPI {orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính'}
              </h1>
              <p className="text-xs md:text-sm font-medium text-slate-600 mt-0.5">
                Báo cáo tổng hợp KPI toàn phòng tháng <strong className="text-[#1F4E78]">{selectedMonth}</strong>, tra cứu KPI chi tiết từng nhân sự và thống kê khối lượng công việc
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={handleRecalculateAll}
            disabled={recalculating}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
            title="Tính toán và cập nhật lại điểm toàn bộ phòng theo dữ liệu mới nhất"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-700 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Đang tính lại...' : 'Tính lại KPI phòng'}
          </button>

          <button
            onClick={handleExportWord}
            className="bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
            title="Tải bảng tổng hợp KPI phòng định dạng Word chuẩn văn bản hành chính"
          >
            <FileText className="w-3.5 h-3.5 text-[#1F4E78]" />
            Tải Word (.doc)
          </button>

          <button
            onClick={handleExportExcel}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
            title="Tải bảng tổng hợp KPI phòng định dạng Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            Tải Excel (.xlsx)
          </button>

          <button
            onClick={() => {
              setActiveTab('PRINT_VIEW');
              setTimeout(() => window.print(), 300);
            }}
            className="bg-gradient-to-r from-[#1F4E78] to-[#2B6CB0] hover:from-[#173a5a] hover:to-[#1F4E78] text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition shadow-sm cursor-pointer border border-blue-900"
          >
            <Printer className="w-3.5 h-3.5" />
            In tổng hợp phòng
          </button>
        </div>
      </div>

      {/* Notifications / Alerts - Hidden on print */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 px-4 py-3 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2.5 animate-fadeIn shadow-2xs print:hidden no-print">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-300 text-rose-950 px-4 py-3 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2.5 animate-fadeIn shadow-2xs print:hidden no-print">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Control & Tab Switcher Bar - Hidden on print */}
      <div className="bg-white p-3.5 md:p-4 rounded-2xl border border-slate-300 shadow-sm flex flex-wrap items-center justify-between gap-4 print:hidden no-print">
        {/* Month Selector */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-[#1F4E78] rounded-xl border border-blue-200">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider">Tháng đánh giá:</label>
            <select
              value={selectedMonth}
              onChange={e => handleMonthChange(e.target.value)}
              className="bg-white border-2 border-slate-300 rounded-xl px-3 py-1.5 text-xs md:text-sm font-black text-[#0f2440] focus:outline-none focus:border-[#1F4E78] shadow-2xs"
            >
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => fetchDepartmentSummary(selectedMonth)}
            disabled={loading}
            className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-3.5 py-1.5 rounded-xl text-xs font-black transition shadow-2xs cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Đang tải...' : 'Xem số liệu'}
          </button>
        </div>

        {/* 4 Feature Tabs Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-200/90 p-1.5 rounded-xl border border-slate-300 text-xs font-bold">
          <button
            onClick={() => setActiveTab('SUMMARY_TABLE')}
            className={`px-3.5 py-2 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'SUMMARY_TABLE'
                ? 'bg-[#1F4E78] text-white font-black shadow-md border border-blue-900'
                : 'text-slate-800 hover:text-[#1F4E78] hover:bg-white/80 font-bold'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Bảng tổng hợp KPI</span>
          </button>

          <button
            onClick={() => setActiveTab('INDIVIDUAL_LOOKUP')}
            className={`px-3.5 py-2 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'INDIVIDUAL_LOOKUP'
                ? 'bg-[#1F4E78] text-white font-black shadow-md border border-blue-900'
                : 'text-slate-800 hover:text-[#1F4E78] hover:bg-white/80 font-bold'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Tra cứu KPI cá nhân</span>
          </button>

          <button
            onClick={() => setActiveTab('WORK_STATS')}
            className={`px-3.5 py-2 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'WORK_STATS'
                ? 'bg-[#1F4E78] text-white font-black shadow-md border border-blue-900'
                : 'text-slate-800 hover:text-[#1F4E78] hover:bg-white/80 font-bold'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Thống kê công việc phòng</span>
          </button>

          <button
            onClick={() => setActiveTab('PRINT_VIEW')}
            className={`px-3.5 py-2 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'PRINT_VIEW'
                ? 'bg-[#1F4E78] text-white font-black shadow-md border border-blue-900'
                : 'text-slate-800 hover:text-[#1F4E78] hover:bg-white/80 font-bold'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Bản in / Xuất báo cáo</span>
          </button>
        </div>
      </div>

      {/* 4 TOP EXECUTIVE METRICS CARDS - Hidden on print */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden no-print">
        {/* Card 1: Nhân sự */}
        <div className="bg-white rounded-2xl border-t-4 border-t-blue-600 border-x border-b border-slate-300 p-4.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Tổng số nhân sự
            </span>
            <span className="p-1.5 bg-blue-100 text-blue-900 rounded-lg border border-blue-200">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-slate-900">
              {stats.totalUsers || usersList.length}
            </span>
            <span className="text-xs font-bold text-slate-500">nhân sự</span>
          </div>
          <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between">
            <span>Tự chấm A: <strong className="text-blue-900 font-black">{stats.evaluatedSelfUsers || 0}/{stats.totalUsers || 0}</strong></span>
            <span>Đã duyệt: <strong className="text-emerald-800 font-black">{stats.approvedUsers || 0}/{stats.totalUsers || 0}</strong></span>
          </div>
        </div>

        {/* Card 2: Đầu mục công việc */}
        <div className="bg-white rounded-2xl border-t-4 border-t-indigo-600 border-x border-b border-slate-300 p-4.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Tổng đầu mục công việc
            </span>
            <span className="p-1.5 bg-indigo-100 text-indigo-900 rounded-lg border border-indigo-200">
              <Briefcase className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-indigo-950">
              {stats.totalWorks || 0}
            </span>
            <span className="text-xs font-bold text-slate-500">nhiệm vụ</span>
          </div>
          <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between">
            <span>Đã duyệt: <strong className="text-emerald-800 font-black">{stats.approvedWorks || 0}</strong></span>
            <span>Hoàn thành: <strong className="text-indigo-900 font-black">{stats.completedWorks || 0}</strong></span>
          </div>
        </div>

        {/* Card 3: Khối lượng & Điểm quy đổi B */}
        <div className="bg-white rounded-2xl border-t-4 border-t-emerald-600 border-x border-b border-slate-300 p-4.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Tổng điểm quy đổi phòng
            </span>
            <span className="p-1.5 bg-emerald-100 text-emerald-900 rounded-lg border border-emerald-200">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-emerald-950">
              {formatScore(stats.deptConvertedScore)}
            </span>
            <span className="text-xs font-bold text-slate-500">điểm Q.Đổi</span>
          </div>
          <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between">
            <span>Tính chất (C1): <strong className="text-slate-900 font-black">+{formatScore(stats.deptNatureTotal)}đ</strong></span>
            <span>BQ phòng: <strong className="text-slate-900 font-black">{formatScore(stats.avgDeptNature)}đ</strong></span>
          </div>
        </div>

        {/* Card 4: Cơ cấu xếp loại toàn phòng */}
        <div className="bg-white rounded-2xl border-t-4 border-t-amber-500 border-x border-b border-slate-300 p-4 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Cơ cấu xếp loại KPI
            </span>
            <span className="p-1.5 bg-amber-100 text-amber-900 rounded-lg border border-amber-200">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>

          {/* Tự xếp loại */}
          <div className="space-y-1">
            <div className="text-[11px] font-black text-slate-700 flex items-center justify-between">
              <span>Tự xếp loại</span>
              <span className="text-[11px] text-slate-500 font-medium">
                Chưa tự chấm: <strong className="text-amber-800 font-black">{stats.selfRankCounts?.pending ?? 0}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-950 border border-emerald-300" title="Hoàn thành xuất sắc">
                XS: {stats.selfRankCounts?.excellent ?? 0}
              </span>
              <span className="font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-950 border border-blue-300" title="Hoàn thành tốt">
                Tốt: {stats.selfRankCounts?.good ?? 0}
              </span>
              <span className="font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300" title="Hoàn thành nhiệm vụ">
                HT: {stats.selfRankCounts?.standard ?? 0}
              </span>
              <span className="font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-950 border border-rose-300" title="Không hoàn thành">
                KHT: {stats.selfRankCounts?.fail ?? 0}
              </span>
            </div>
          </div>

          {/* Lãnh đạo xếp loại */}
          <div className="space-y-1 pt-1.5 border-t border-slate-200">
            <div className="text-[11px] font-black text-slate-700 flex items-center justify-between">
              <span>Lãnh đạo xếp loại</span>
              <span className="text-[11px] text-slate-500 font-medium">
                Chờ duyệt: <strong className="text-amber-800 font-black">{stats.approvedRankCounts?.pending ?? stats.rankCounts?.pending ?? 0}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-950 border border-emerald-300" title="Hoàn thành xuất sắc">
                XS: {stats.approvedRankCounts?.excellent ?? stats.rankCounts?.excellent ?? 0}
              </span>
              <span className="font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-950 border border-blue-300" title="Hoàn thành tốt">
                Tốt: {stats.approvedRankCounts?.good ?? stats.rankCounts?.good ?? 0}
              </span>
              <span className="font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300" title="Hoàn thành nhiệm vụ">
                HT: {stats.approvedRankCounts?.standard ?? stats.rankCounts?.standard ?? 0}
              </span>
              <span className="font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-950 border border-rose-300" title="Không hoàn thành">
                KHT: {stats.approvedRankCounts?.fail ?? stats.rankCounts?.fail ?? 0}
              </span>
            </div>
          </div>

          <div className="text-[10.5px] text-slate-600 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 flex items-center justify-between">
            <span>Phó phòng trở lên: <strong className="text-slate-900 font-bold">{stats.leaderCount || stats.approvedRankCounts?.leader || 2}</strong></span>
            <span className="italic text-slate-500">(không xếp loại LĐ)</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BẢNG TỔNG HỢP KPI PHÒNG (MAIN TABLE WITH REQUIRED COLUMNS & SELECTION) */}
      {/* ========================================================================= */}
      {activeTab === 'SUMMARY_TABLE' && (
        <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden space-y-0 print:hidden no-print">
          {/* Table Header & Search Filter Bar */}
          <div className="p-4 md:p-5 bg-gradient-to-r from-slate-100 to-blue-50/40 border-b border-slate-300 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-[#0f2440] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
                Bảng tổng hợp kết quả đánh giá KPI {orgConfig.departmentName || 'Phòng KHTC'} tháng {selectedMonth}
              </h2>
              <p className="text-xs font-medium text-slate-600 mt-0.5">
                (Tích chọn nhân sự để xuất báo cáo hoặc in; Vị trí từ Phó phòng trở lên cột Lãnh đạo xếp để trống)
              </p>
            </div>

            {/* Search & Filters */}
            <div className="flex items-center flex-wrap gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Tìm theo tên, vị trí..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="bg-white border-2 border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1F4E78] w-44 shadow-2xs"
                />
              </div>

              {/* Lựa chọn nguồn xếp loại */}
              <div className="flex items-center gap-1.5">
                <select
                  value={rankSource}
                  onChange={e => setRankSource(e.target.value as 'LEADER' | 'SELF')}
                  className="bg-blue-50/90 border-2 border-blue-300 text-[#1F4E78] rounded-xl px-2.5 py-1.5 text-xs font-black focus:outline-none focus:border-[#1F4E78] shadow-2xs cursor-pointer"
                  title="Chọn nguồn xếp loại: Lãnh đạo xếp loại hoặc Tự xếp loại"
                >
                  <option value="LEADER">Lãnh đạo xếp loại</option>
                  <option value="SELF">Tự xếp loại</option>
                </select>
              </div>

              {/* Lựa chọn mức xếp loại */}
              <select
                value={rankFilter}
                onChange={e => setRankFilter(e.target.value)}
                className="bg-white border-2 border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#1F4E78] shadow-2xs"
              >
                <option value="ALL">Tất cả xếp loại</option>
                <option value="EXCELLENT">Xuất sắc</option>
                <option value="GOOD">Tốt</option>
                <option value="STANDARD">Hoàn thành</option>
                <option value="FAIL">Không hoàn thành</option>
                <option value="PENDING">
                  {rankSource === 'SELF' ? 'Chờ hoàn tất (Chưa tự chấm A)' : 'Chờ duyệt (Chưa hoàn tất A/C/D)'}
                </option>
              </select>

              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="bg-white border-2 border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#1F4E78] shadow-2xs"
              >
                <option value="ALL">Tất cả chức danh</option>
                <option value="LEADER">Lãnh đạo (Phó phòng+)</option>
                <option value="STAFF">Chuyên viên / Nhân viên</option>
              </select>
            </div>
          </div>

          {/* Quick Personnel Selection Toolbar for Print & Export */}
          <div className="bg-blue-100/60 border-b border-blue-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-[#1F4E78] text-white rounded-md">
                <CheckSquare className="w-3.5 h-3.5" />
              </span>
              <span className="font-black text-[#0f2440]">
                Đã chọn: <strong className="text-[#1F4E78] font-black text-sm">{selectedUserIds.length}</strong>/{usersList.length} nhân sự đưa vào bảng in / xuất file
              </span>
              {selectedUserIds.length === 0 && (
                <span className="text-rose-700 font-bold italic text-[11px]">
                  (Vui lòng chọn ít nhất 1 nhân sự)
                </span>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-1.5 font-bold">
              <button
                onClick={handleSelectAll}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 transition cursor-pointer text-[11px] shadow-2xs"
              >
                Chọn tất cả ({usersList.length})
              </button>
              <button
                onClick={handleDeselectAll}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 transition cursor-pointer text-[11px] shadow-2xs"
              >
                Bỏ chọn
              </button>
              <button
                onClick={handleSelectFiltered}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 text-[#1F4E78] border border-blue-300 transition cursor-pointer text-[11px] shadow-2xs"
                title="Chọn các nhân sự đang hiển thị theo kết quả tìm kiếm/lọc"
              >
                Chọn theo bộ lọc ({filteredUsers.length})
              </button>
              <button
                onClick={handleSelectOnlyApproved}
                className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border border-emerald-300 transition cursor-pointer text-[11px] shadow-2xs"
              >
                Chỉ người đã duyệt
              </button>
              <button
                onClick={handleSelectOnlyStaff}
                className="px-2.5 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-950 border border-indigo-300 transition cursor-pointer text-[11px] shadow-2xs"
              >
                Chỉ chuyên viên
              </button>
              <button
                onClick={handleSelectOnlyLeaders}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 transition cursor-pointer text-[11px] shadow-2xs"
              >
                Chỉ lãnh đạo
              </button>
            </div>
          </div>

          {/* TABLE CONTAINER WITH HIGH-CONTRAST HEADER */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1F4E78] text-white font-black uppercase tracking-wider">
                <tr>
                  <th className="p-3.5 text-center w-12">
                    <input
                      type="checkbox"
                      checked={usersList.length > 0 && selectedUserIds.length === usersList.length}
                      onChange={e => {
                        if (e.target.checked) handleSelectAll();
                        else handleDeselectAll();
                      }}
                      className="w-4 h-4 text-[#1F4E78] rounded border-white focus:ring-blue-500 cursor-pointer bg-white"
                      title="Chọn/Bỏ chọn tất cả nhân sự"
                    />
                  </th>
                  <th className="p-3.5 text-center w-12">STT</th>
                  <th className="p-3.5 min-w-[170px]">Tên nhân sự</th>
                  <th className="p-3.5 min-w-[150px]">Vị trí</th>
                  <th className="p-3.5 text-center min-w-[125px]">B tự chấm</th>
                  <th className="p-3.5 text-center min-w-[125px]">B lãnh đạo duyệt</th>
                  <th className="p-3.5 text-center min-w-[115px]">Điểm tự đánh giá</th>
                  <th className="p-3.5 text-center min-w-[125px]">Điểm lãnh đạo duyệt</th>
                  <th className="p-3.5 text-center min-w-[130px]">Tự xếp loại</th>
                  <th className="p-3.5 text-center min-w-[130px]">Lãnh đạo xếp</th>
                  <th className="p-3.5 text-center w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 bg-white">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-500 font-semibold">
                      Không tìm thấy nhân sự phù hợp với bộ lọc tìm kiếm.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u: any, idx: number) => {
                    const isSelected = selectedUserIds.includes(u.id);
                    const isBApproved = (u.taskCounts?.approved || 0) > 0;
                    const isApproved = u.scores?.approvedKpiTotal !== null && u.scores?.approvedKpiTotal !== undefined;
                    const selfScore = u.scores?.selfKpiTotal !== null && u.scores?.selfKpiTotal !== undefined ? u.scores.selfKpiTotal : null;
                    const approvedScore = isApproved ? u.scores.approvedKpiTotal : null;

                    return (
                      <tr 
                        key={u.id || idx} 
                        className={`transition-colors ${
                          isSelected 
                            ? 'bg-blue-50/70 hover:bg-blue-100/60 ring-1 ring-inset ring-blue-200' 
                            : 'bg-white hover:bg-slate-100/80 opacity-75'
                        } ${u.isLeaderOrAbove ? 'border-l-4 border-l-amber-500' : ''}`}
                      >
                        {/* Checkbox Column */}
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleUser(u.id)}
                            className="w-4 h-4 text-[#1F4E78] rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                            title={`Tích để đưa ${u.name} vào bảng tổng hợp in/xuất`}
                          />
                        </td>

                        {/* STT */}
                        <td className="p-3.5 text-center font-black text-slate-700">
                          {idx + 1}
                        </td>

                        {/* Tên nhân sự */}
                        <td className="p-3.5">
                          <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                            <span 
                              onClick={() => handleToggleUser(u.id)} 
                              className="cursor-pointer hover:text-[#1F4E78] transition-colors"
                            >
                              {u.name}
                            </span>
                            {u.isLeaderOrAbove && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                Lãnh đạo
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-medium text-slate-600 mt-0.5">
                            {u.email}
                          </div>
                        </td>

                        {/* Vị trí */}
                        <td className="p-3.5 text-slate-800 font-bold">
                          {cleanPosition(u.position)}
                        </td>

                        {/* B tự chấm */}
                        <td className="p-3.5 text-center">
                          <div className="inline-flex flex-col items-center">
                            <div className="inline-block px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900 font-black text-xs border border-blue-200 shadow-2xs">
                              {formatScore(u.scores?.selfBTotal ?? 0)}
                              <span className="text-[10px] font-bold text-blue-700 ml-0.5">/60</span>
                            </div>
                            <div className="text-[10px] text-slate-600 font-semibold mt-0.5 whitespace-nowrap">
                              B1: {formatScore(u.scores?.selfB1 ?? 0)} | B2: {formatScore(u.scores?.selfB2 ?? 0)}
                            </div>
                          </div>
                        </td>

                        {/* B lãnh đạo duyệt */}
                        <td className="p-3.5 text-center">
                          {isBApproved && u.scores?.approvedBTotal !== undefined && u.scores?.approvedBTotal !== null ? (
                            <div className="inline-flex flex-col items-center">
                              <div className="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-950 font-black text-xs border border-emerald-200 shadow-2xs">
                                {formatScore(u.scores.approvedBTotal)}
                                <span className="text-[10px] font-bold text-emerald-700 ml-0.5">/60</span>
                              </div>
                              <div className="text-[10px] text-slate-600 font-semibold mt-0.5 whitespace-nowrap">
                                B1: {formatScore(u.scores.approvedB1 ?? 0)} | B2: {formatScore(u.scores.approvedB2 ?? 0)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-amber-900 italic text-[11px] bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 font-bold">
                              Chờ duyệt
                            </span>
                          )}
                        </td>

                        {/* Điểm tự đánh giá */}
                        <td className="p-3.5 text-center">
                          {selfScore !== null && selfScore !== undefined ? (
                            <div className="inline-flex flex-col items-center">
                              <div className="inline-block px-3 py-1 rounded-lg bg-blue-100 text-blue-950 font-black text-sm border border-blue-300 shadow-2xs">
                                {formatScore(selfScore)}
                                <span className="text-[10px] font-bold text-blue-700 ml-0.5">/100</span>
                              </div>
                              {u.scores?.selfA === null && (
                                <span className="text-[10px] text-amber-800 font-semibold mt-0.5" title="Chưa thực hiện tự chấm điểm A (chưa cộng điểm A)">
                                  Chưa chấm A
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">-</span>
                          )}
                        </td>

                        {/* Điểm lãnh đạo duyệt */}
                        <td className="p-3.5 text-center">
                          {approvedScore !== null ? (
                            <div className="inline-block px-3 py-1 rounded-lg bg-emerald-100 text-emerald-950 font-black text-sm border border-emerald-300 shadow-2xs">
                              {formatScore(approvedScore)}
                              <span className="text-[10px] font-bold text-emerald-700 ml-0.5">/100</span>
                            </div>
                          ) : (
                            <span className="text-amber-900 italic text-[11px] bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 font-bold">
                              Chờ duyệt
                            </span>
                          )}
                        </td>

                        {/* Tự xếp loại */}
                        <td className="p-3.5 text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${getRankBadgeClass(getSelfRankDisplay(u))}`}>
                            {getSelfRankDisplay(u)}
                          </span>
                        </td>

                        {/* Lãnh đạo xếp (CONSTRAINT: Vị trí từ phó phòng trở lên BỎ TRỐNG) */}
                        <td className="p-3.5 text-center">
                          {u.isLeaderOrAbove ? (
                            <span 
                              className="text-slate-400 font-mono font-black text-sm" 
                              title="Quy định: Vị trí từ Phó phòng trở lên chỉ có tự xếp loại, lãnh đạo xếp bỏ trống"
                            >
                              -
                            </span>
                          ) : isApproved && u.approvedRank && u.approvedRank !== 'Chờ duyệt' ? (
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${getRankBadgeClass(u.approvedRank)}`}>
                              {u.approvedRank}
                            </span>
                          ) : (
                            <span className="text-slate-600 italic text-[11px] bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-300 font-bold">
                              Chờ duyệt
                            </span>
                          )}
                        </td>

                        {/* Thao tác */}
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenIndividual(u.id)}
                              className="p-1.5 rounded-lg bg-blue-100 text-[#1F4E78] hover:bg-blue-200 transition cursor-pointer border border-blue-300 shadow-2xs"
                              title="Xem tra cứu chi tiết KPI của nhân sự này"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                navigate(`/print-personal?userId=${u.id}&month=${selectedMonth}`);
                              }}
                              className="p-1.5 rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300 transition cursor-pointer border border-slate-300 shadow-2xs"
                              title="In phiếu KPI cá nhân"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Note */}
          <div className="p-4 bg-slate-100 border-t border-slate-300 text-xs text-slate-800 flex flex-wrap items-center justify-between gap-2 font-medium">
            <div>
              Hiển thị: <strong className="text-[#1F4E78]">{filteredUsers.length}</strong> / <strong>{usersList.length}</strong> nhân sự của {orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính'}.
              {rankSource === 'LEADER' ? (
                <span className="ml-2 text-slate-500 text-[11px] font-normal italic">
                  (Đang lọc theo: Lãnh đạo xếp loại — Phó phòng trở lên không đưa vào kết quả)
                </span>
              ) : (
                <span className="ml-2 text-slate-500 text-[11px] font-normal italic">
                  (Đang lọc theo: Tự xếp loại)
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-600 italic font-semibold">
              * Ghi chú: Tổng điểm KPI = A (Nội quy tối đa 30) + B (Nhiệm vụ tối đa 60) + C (Thưởng tối đa 10) - D (Trừ vi phạm).
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TRA CỨU KPI TỪNG CÁ NHÂN THEO THÁNG (ADMIN DETAILED LOOKUP) */}
      {/* ========================================================================= */}
      {activeTab === 'INDIVIDUAL_LOOKUP' && (
        <div className="space-y-6 print:hidden no-print">
          {/* User Selector Dropdown in Tra cứu */}
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-300 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-[#1F4E78] to-[#173a5a] text-white rounded-xl shadow-xs">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1">
                  Chọn nhân sự cần tra cứu KPI chi tiết:
                </label>
                <select
                  value={selectedUserId || ''}
                  onChange={e => {
                    const uId = Number(e.target.value);
                    setSelectedUserId(uId);
                    loadIndividualDetail(selectedMonth, uId);
                  }}
                  className="bg-white border-2 border-[#1F4E78] rounded-xl px-4 py-2 text-sm font-black text-[#0f2440] focus:outline-none min-w-[280px] shadow-2xs"
                >
                  {usersList.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {cleanPosition(u.position)} {u.isLeaderOrAbove ? '(Lãnh đạo)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick action buttons for the selected user */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (selectedUserId) {
                    loadIndividualDetail(selectedMonth, selectedUserId);
                  }
                }}
                disabled={individualLoading}
                className="bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${individualLoading ? 'animate-spin' : ''}`} />
                Làm mới
              </button>

              <button
                onClick={() => {
                  if (selectedUserId) {
                    navigate(`/print-personal?userId=${selectedUserId}&month=${selectedMonth}`);
                  } else {
                    navigate(`/print-personal?month=${selectedMonth}`);
                  }
                }}
                className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition shadow-sm cursor-pointer border border-blue-900"
              >
                <FileText className="w-3.5 h-3.5" />
                In phiếu KPI nhân sự này
              </button>
            </div>
          </div>

          {/* INDIVIDUAL KPI CONTENT (Matches PersonalKpi view exactly) */}
          {individualLoading ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-300 text-center text-slate-700 font-bold text-sm shadow-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#1F4E78]" />
              Đang tải dữ liệu chi tiết KPI của nhân sự...
            </div>
          ) : !individualKpiData ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-300 text-center text-slate-600 font-bold text-sm shadow-sm">
              Chưa có dữ liệu KPI cho nhân sự được chọn.
            </div>
          ) : (
            <div className="space-y-6">
              {/* 4 SUMMARY METRIC CARDS FOR SELECTED USER */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Tổng KPI */}
                <div className="bg-white rounded-2xl border-t-4 border-t-[#1F4E78] border-x border-b border-slate-300 p-5 shadow-sm space-y-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Tổng KPI ({selectedMonth})
                  </span>
                  <div className="flex items-baseline gap-2">
                    {indIsAllApproved && indTotalApproved !== null ? (
                      <>
                        <span className="text-3xl font-black text-slate-900">{formatScore(indTotalApproved)}</span>
                        <span className="text-sm font-bold text-slate-500">/ 100</span>
                      </>
                    ) : (
                      <span className="text-2xl font-black text-amber-700">Chờ duyệt</span>
                    )}
                  </div>
                  <div>
                    <span
                      className={`inline-block text-xs font-black px-3 py-1 rounded-full border shadow-2xs ${indRankBg}`}
                    >
                      {indRankText}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-500 pt-1">
                    Tự chấm (tạm tính): <strong className="text-blue-900">{formatScore(indTotalSelf)}đ</strong>
                    {indScoreASelf === null && <span className="text-amber-700 font-bold block mt-0.5">(Chưa tự chấm A)</span>}
                  </div>
                </div>

                {/* Card 2: Điểm A */}
                <div className="bg-white rounded-2xl border-t-4 border-t-blue-600 border-x border-b border-slate-300 p-5 shadow-sm space-y-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Điểm A - Nội quy & Kỷ luật
                  </span>
                  <div className="flex items-baseline gap-2">
                    {indIsStatusAApproved && indScoreAApproved !== null ? (
                      <>
                        <span className="text-3xl font-black text-blue-950">
                          {formatScore(indScoreAApproved)}
                        </span>
                        <span className="text-sm font-bold text-slate-500">/ 30</span>
                      </>
                    ) : (
                      <span className="text-2xl font-black text-amber-700">Chờ duyệt</span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    Tự chấm: <strong className="text-blue-900">{indScoreASelf !== null ? `${formatScore(indScoreASelf)}đ` : 'Chưa tự chấm A'}</strong> | Duyệt:{' '}
                    <strong className="text-emerald-800">{indIsStatusAApproved && indScoreAApproved !== null ? `${formatScore(indScoreAApproved)}đ` : 'Chờ duyệt'}</strong>
                  </div>
                </div>

                {/* Card 3: Điểm B */}
                <div className="bg-white rounded-2xl border-t-4 border-t-indigo-600 border-x border-b border-slate-300 p-5 shadow-sm space-y-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Điểm B - Nhiệm vụ thường xuyên
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-indigo-950">
                      {indHasApprovedWorks ? formatScore(indApprovedBTotal) : formatScore(indSelfBTotal)}
                    </span>
                    <span className="text-sm font-bold text-slate-500">/ 60</span>
                  </div>
                  <div className="text-xs font-bold text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200 space-y-0.5">
                    <div>Tự chấm: <strong>{formatScore(indSelfBTotal)}đ</strong> (B1: {formatScore(indSelfB1)}đ + B2: {formatScore(indSelfB2)}đ)</div>
                    <div>Duyệt: <strong className={indHasApprovedWorks ? 'text-emerald-800' : 'text-amber-700'}>{indHasApprovedWorks ? `${formatScore(indApprovedBTotal)}đ (B1: ${formatScore(indApprovedB1)}đ + B2: ${formatScore(indApprovedB2)}đ)` : 'Chờ duyệt'}</strong></div>
                  </div>
                </div>

                {/* Card 4: Điểm C & D */}
                <div className="bg-white rounded-2xl border-t-4 border-t-emerald-600 border-x border-b border-slate-300 p-5 shadow-sm space-y-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Thưởng (C) / Phạt (D)
                  </span>
                  <div className="flex items-baseline gap-2">
                    {indIsStatusCApproved && indIsStatusDApproved ? (
                      <>
                        <span className="text-3xl font-black text-emerald-900">+{formatScore(indApprovedC)}</span>
                        <span className="text-2xl font-black text-rose-800 ml-2">-{formatScore(indApprovedD)}</span>
                      </>
                    ) : (
                      <span className="text-2xl font-black text-amber-700">Chờ duyệt</span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200 space-y-0.5">
                    <div>C tự động: <strong>+{formatScore(indSelfC)}đ</strong> | C duyệt: <strong className={indIsStatusCApproved ? 'text-emerald-800' : 'text-amber-700'}>{indIsStatusCApproved ? `+${formatScore(indApprovedC)}đ` : 'Chờ duyệt'}</strong></div>
                    <div>D tự động: <strong>-{formatScore(indSelfD)}đ</strong> | D duyệt: <strong className={indIsStatusDApproved ? 'text-rose-800' : 'text-amber-700'}>{indIsStatusDApproved ? `-${formatScore(indApprovedD)}đ` : 'Chờ duyệt'}</strong></div>
                  </div>
                </div>
              </div>

              {/* OVERALL KPI FORMULA TABLE */}
              <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-100 to-blue-50/40 px-6 py-4 border-b border-slate-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-[#1F4E78]" />
                    <h2 className="text-base font-black text-[#0f2440]">
                      Cơ cấu tính điểm KPI của {indUser?.name} tháng {selectedMonth}
                    </h2>
                  </div>
                  <span className="text-xs font-black text-[#1F4E78] bg-blue-100/80 px-3 py-1 rounded-lg border border-blue-200">
                    Công thức: Total = A + B + C - D
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#1F4E78] text-white font-black text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5 w-16 text-center">Mục</th>
                        <th className="px-6 py-3.5">Hạng mục đánh giá</th>
                        <th className="px-6 py-3.5 text-center w-28">Điểm tối đa</th>
                        <th className="px-6 py-3.5 text-center w-36">Tự chấm</th>
                        <th className="px-6 py-3.5 text-center w-36">Lãnh đạo duyệt</th>
                        <th className="px-6 py-3.5">Ghi chú / Căn cứ tính</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300 bg-white">
                      {/* Row A */}
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-black text-center text-[#1F4E78]">A</td>
                        <td className="px-6 py-4">
                          <div className="font-extrabold text-slate-900">Chấp hành nội quy, quy chế</div>
                          <div className="text-xs font-medium text-slate-600 mt-0.5">7 tiêu chí chuẩn (A1 - A7)</div>
                        </td>
                        <td className="px-6 py-4 text-center font-black text-slate-800">30</td>
                        <td className="px-6 py-4 text-center font-black text-blue-900">
                          {indScoreASelf !== null ? `${formatScore(indScoreASelf)}đ` : <span className="text-amber-800 font-bold italic text-xs">Chưa tự chấm</span>}
                        </td>
                        <td className="px-6 py-4 text-center font-black text-emerald-900">
                          {indIsStatusAApproved && indScoreAApproved !== null ? `${formatScore(indScoreAApproved)}đ` : <span className="text-amber-800 font-bold italic text-xs">Chờ duyệt</span>}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                          {indIsStatusAApproved && indScoreAApproved !== null
                            ? 'Lãnh đạo phòng đã phê duyệt'
                            : indDetA?.statusA === 'Đã tự chấm'
                            ? 'Cá nhân tự chấm, chờ duyệt'
                            : 'Cá nhân chưa thực hiện tự chấm A'}
                        </td>
                      </tr>

                      {/* Row B */}
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-black text-center text-[#1F4E78]">B</td>
                        <td className="px-6 py-4">
                          <div className="font-extrabold text-slate-900">Nhiệm vụ thường xuyên (B1 + B2)</div>
                          <div className="text-xs font-medium text-slate-600 mt-0.5">
                            Tự chấm: B1 ({formatScore(indSelfB1)}đ) + B2 ({formatScore(indSelfB2)}đ) | Duyệt: {indHasApprovedWorks ? `B1 (${formatScore(indApprovedB1)}đ) + B2 (${formatScore(indApprovedB2)}đ)` : 'Chờ duyệt'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-black text-slate-800">60</td>
                        <td className="px-6 py-4 text-center font-black text-blue-900">
                          <div>{formatScore(indSelfBTotal)}đ</div>
                          <div className="text-[11px] font-normal text-slate-500">B1: {formatScore(indSelfB1)} | B2: {formatScore(indSelfB2)}</div>
                        </td>
                        <td className="px-6 py-4 text-center font-black text-indigo-950">
                          {indHasApprovedWorks ? (
                            <div>
                              <div>{formatScore(indApprovedBTotal)}đ</div>
                              <div className="text-[11px] font-normal text-slate-500">B1: {formatScore(indApprovedB1)} | B2: {formatScore(indApprovedB2)}</div>
                            </div>
                          ) : (
                            <span className="text-amber-800 font-bold italic text-xs">Chờ duyệt</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                          <div className="space-y-1">
                            <div>
                              Tự chấm: Tỷ trọng cá nhân <strong>{formatPercent(indSum?.selfPersonalShare)}</strong> (Bình quân phòng: {formatPercent(indSum?.selfAvgShare)})
                            </div>
                            <div>
                              {indHasApprovedWorks ? (
                                <>
                                  Duyệt: Tỷ trọng cá nhân <strong>{formatPercent(indSum?.personalShare)}</strong> (Bình quân phòng: {formatPercent(indSum?.avgShare)})
                                </>
                              ) : (
                                <>
                                  Duyệt: <strong className="text-amber-800">Chờ duyệt</strong>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Row C */}
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-black text-center text-[#1F4E78]">C</td>
                        <td className="px-6 py-4">
                          <div className="font-extrabold text-slate-900">Điểm thưởng / Việc khó / Tính chất (C1 + C2)</div>
                          <div className="text-xs font-medium text-slate-600 mt-0.5">
                            C1 (Tự động từ tính chất việc): +{formatScore(indSelfC)}đ | C2 (Lãnh đạo thưởng): +{formatScore(indScoreC2)}đ
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-black text-slate-800">10</td>
                        <td className="px-6 py-4 text-center font-black text-emerald-900">+{formatScore(indSelfC)}đ</td>
                        <td className="px-6 py-4 text-center font-black text-emerald-900">
                          {indIsStatusCApproved ? `+${formatScore(indApprovedC)}đ` : <span className="text-amber-800 font-bold italic text-xs">Chờ duyệt</span>}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                          C1: {formatScore(indDetC?.personalNatureTotal)}đ tính chất việc (BQ phòng: {formatScore(indDetC?.avgDeptNature)}đ) • C2:{' '}
                          {indScoreC2 > 0 ? `Lãnh đạo thưởng +${formatScore(indScoreC2)}đ` : '0đ'}
                        </td>
                      </tr>

                      {/* Row D */}
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-black text-center text-rose-700">D</td>
                        <td className="px-6 py-4">
                          <div className="font-extrabold text-rose-950">Điểm phạt vi phạm</div>
                          <div className="text-xs font-medium text-slate-600 mt-0.5">Trừ điểm chậm tiến độ, chất lượng không đạt</div>
                        </td>
                        <td className="px-6 py-4 text-center font-black text-slate-700">Trừ</td>
                        <td className="px-6 py-4 text-center font-black text-rose-800">
                          {indSelfD > 0 ? `-${formatScore(indSelfD)}đ` : '0đ'}
                        </td>
                        <td className="px-6 py-4 text-center font-black text-rose-800">
                          {indIsStatusDApproved ? (indApprovedD > 0 ? `-${formatScore(indApprovedD)}đ` : '0đ') : <span className="text-amber-800 font-bold italic text-xs">Chờ duyệt</span>}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                          {indDetD?.items?.length > 0 ? `${indDetD.items.length} vi phạm ghi nhận` : 'Không có vi phạm trừ điểm'}
                        </td>
                      </tr>

                      {/* Total Row */}
                      <tr className="bg-blue-50/80 font-black text-slate-900 border-t-2 border-slate-300">
                        <td className="px-6 py-4 text-center text-[#1F4E78] font-black text-lg">∑</td>
                        <td className="px-6 py-4">
                          <div className="text-base font-black text-[#0f2440]">
                            TỔNG ĐIỂM KPI THÁNG {selectedMonth}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center text-base font-black text-slate-800">100</td>
                        <td className="px-6 py-4 text-center text-base font-black text-blue-950">
                          <div>{formatScore(indTotalSelf)}đ</div>
                          {indScoreASelf === null ? (
                            <div className="text-[11px] font-bold text-amber-700">Chưa tự chấm A (Tạm tính)</div>
                          ) : (
                            <div className="text-[11px] font-bold text-blue-700">{indSelfRankText}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center text-xl font-black text-[#1F4E78]">
                          {indIsAllApproved && indTotalApproved !== null ? (
                            `${formatScore(indTotalApproved)}đ`
                          ) : (
                            <span className="text-sm font-black text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300">
                              Chờ duyệt
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-[#1F4E78]">
                          {indIsAllApproved && indTotalApproved !== null ? (
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${indRankBg}`}>
                              {indRankText} ({formatScore(indTotalApproved)}/100)
                            </span>
                          ) : (
                            <span className="inline-block px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                              Chờ duyệt
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detail A: 7 Criteria */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-blue-700" />
                    <h3 className="font-bold text-slate-900">
                      Chi tiết 7 tiêu chí Điểm A - Chấp hành nội quy, kỷ luật ({indIsStatusAApproved && indScoreAApproved !== null ? `${formatScore(indScoreAApproved)}/30đ` : 'Chờ duyệt'})
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-slate-500">
                    Trạng thái: <strong>{indIsStatusAApproved ? 'Đã duyệt' : (indDetA?.statusA || 'Chưa tự chấm')}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {KPI_A_CRITERIA.map(crit => {
                    const sItem = indDetA?.scores?.[crit.code];
                    const sSelf = sItem?.self ?? null;
                    const sApp = sItem?.approved ?? null;
                    return (
                      <div
                        key={crit.code}
                        className="p-3.5 rounded-xl border border-slate-200 bg-[#f8fafc] flex flex-col justify-between"
                      >
                        <div>
                          <div className="font-bold text-xs text-[#0f2440] mb-1">
                            {crit.code} - {crit.name}
                          </div>
                          <p className="text-[11px] text-slate-600 line-clamp-2">{crit.desc}</p>
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                          <span className="text-slate-500 text-[11px]">Tối đa: <strong>{crit.maxScore}đ</strong></span>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-800">Tự: <strong>{formatScore(sSelf, '-')}đ</strong></span>
                            <span className="text-emerald-700 font-bold">Duyệt: <strong>{indIsStatusAApproved && sApp !== null ? `${formatScore(sApp)}đ` : 'Chờ duyệt'}</strong></span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detail B: Tasks List */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-700" />
                    <h3 className="font-bold text-slate-900">
                      Chi tiết Điểm B - Danh sách công việc ({indAllTasks.length} việc tự chấm | {indApprovedTasks.length} việc đã duyệt | Tự chấm: {formatScore(indSelfBTotal)}đ - Duyệt: {indHasApprovedWorks ? `${formatScore(indApprovedBTotal)}đ` : 'Chờ duyệt'})
                    </h3>
                  </div>
                </div>

                <div className="p-4 overflow-x-auto">
                  {indAllTasks.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      Chưa có công việc nào được ghi nhận trong tháng {selectedMonth}.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                        <tr>
                          <th className="p-3 text-center">STT</th>
                          <th className="p-3">Mã & Nhóm việc</th>
                          <th className="p-3">Tên nhiệm vụ / Chi tiết</th>
                          <th className="p-3 text-center">Tính chất</th>
                          <th className="p-3 text-center">Hệ số</th>
                          <th className="p-3 text-center">Điểm gốc</th>
                          <th className="p-3 text-center">Điểm tự chấm (Q.Đổi)</th>
                          <th className="p-3 text-center">Điểm duyệt (Q.Đổi)</th>
                          <th className="p-3 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {indAllTasks.map((t: any, idx: number) => {
                          const isTaskApproved = t.leaderApproval === 'Duyệt';
                          const isTaskRejected = t.leaderApproval === 'Không duyệt';
                          const selfScore = t.selfConvertedScore !== undefined && t.selfConvertedScore !== null ? t.selfConvertedScore : t.convertedScore;
                          const appScore = t.approvedConvertedScore !== undefined && t.approvedConvertedScore !== null ? t.approvedConvertedScore : t.convertedScore;

                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                              <td className="p-3">
                                <span className="font-mono font-bold text-[#1F4E78]">{t.taskCode || t.workId}</span>
                                <div className="text-slate-500 text-[11px]">{t.taskGroup}</div>
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-800">{t.taskName}</div>
                                <div className="text-slate-500 text-[11px] line-clamp-1">{t.detail}</div>
                              </td>
                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                                  {t.approvedNature || t.proposedNature || t.nature || 'Trung bình'}
                                </span>
                              </td>
                              <td className="p-3 text-center font-bold">{formatScore(t.coef)}</td>
                              <td className="p-3 text-center font-bold text-slate-700">{formatScore(t.baseScore)}</td>
                              <td className="p-3 text-center font-bold text-blue-900">{formatScore(selfScore)}</td>
                              <td className="p-3 text-center font-bold">
                                {isTaskApproved ? (
                                  <span className="text-emerald-700">{formatScore(appScore)}</span>
                                ) : isTaskRejected ? (
                                  <span className="text-rose-700 font-semibold">Không duyệt</span>
                                ) : (
                                  <span className="text-amber-700 font-semibold">Chờ duyệt</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full font-bold border text-[11px] ${
                                    isTaskApproved
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : isTaskRejected
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}
                                >
                                  {isTaskApproved ? 'Đã duyệt' : isTaskRejected ? 'Không duyệt' : 'Chờ duyệt'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Detail C: Bonus points */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-slate-900">
                      Chi tiết Điểm C - Điểm thưởng / Việc khó / Tính chất (Tự động: +{formatScore(indSelfC)}đ | Duyệt: {indIsStatusCApproved ? `+${formatScore(indApprovedC)}đ` : 'Chờ duyệt'})
                    </h3>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                    <div className="text-xs font-bold text-amber-800 mb-1">C1 - Thưởng tính chất công việc tự động: +{formatScore(indScoreC1)}đ</div>
                    <div className="text-[11px] text-slate-600">
                      Tổng điểm tính chất cá nhân: {formatScore(indDetC?.personalNatureTotal)}đ<br/>
                      Tổng điểm tính chất bình quân phòng: {formatScore(indDetC?.avgDeptNature)}đ
                    </div>
                  </div>
                  <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                    <div className="text-xs font-bold text-emerald-800 mb-1">C2 - Điểm thưởng lãnh đạo đánh giá: +{formatScore(indScoreC2)}đ</div>
                    <div className="text-[11px] text-slate-600">
                      Lý do: {indDetC?.noteC2 || 'Không có ghi chú'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detail D: Penalty points */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-600" />
                    <h3 className="font-bold text-slate-900">
                      Chi tiết Điểm D - Điểm phạt vi phạm (Tự động: -{formatScore(indSelfD)}đ | Duyệt: {indIsStatusDApproved ? `-${formatScore(indApprovedD)}đ` : 'Chờ duyệt'})
                    </h3>
                  </div>
                </div>
                <div className="p-4 overflow-x-auto">
                  {!indDetD?.items || indDetD.items.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      Không có vi phạm trừ điểm nào được ghi nhận.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-rose-50 text-rose-900 font-bold uppercase border-b border-rose-200">
                        <tr>
                          <th className="p-3 text-center">STT</th>
                          <th className="p-3">Loại vi phạm / Nội dung</th>
                          <th className="p-3 text-center">Hệ thống ghi nhận</th>
                          <th className="p-3 text-center">Phê duyệt (Lãnh đạo)</th>
                          <th className="p-3 text-center">Lý do / Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {indDetD.items.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-3">
                              <span className="font-bold text-rose-900 block">{item.group || 'Công việc chuyên môn'}</span>
                              <span className="text-slate-600 text-[11px]">{item.content}</span>
                            </td>
                            <td className="p-3 text-center text-slate-500 font-bold">-{formatScore(item.autoD)}đ</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                                item.decision === 'Miễn phạt' ? 'bg-emerald-100 text-emerald-800' :
                                item.decision === 'Giảm phạt' ? 'bg-amber-100 text-amber-800' :
                                'bg-rose-100 text-rose-800'
                              }`}>
                                {item.decision}: -{formatScore(item.officialD)}đ
                              </span>
                            </td>
                            <td className="p-3 text-center text-[11px] text-slate-500">{item.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: THỐNG KÊ CÔNG VIỆC PHÒNG & TỔNG ĐẦU MỤC CÔNG VIỆC */}
      {/* ========================================================================= */}
      {activeTab === 'WORK_STATS' && (
        <div className="space-y-6 print:hidden no-print">
          {/* Section 1: Breakdown by Task Group */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-[#1F4E78]" />
                <h3 className="font-black text-[#0f2440] text-base">
                  Thống kê đầu mục công việc theo Nhóm chuyên môn (Tháng {selectedMonth})
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">
                Tổng cộng: <strong>{stats.totalWorks || 0}</strong> đầu việc
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-3 text-center w-12">STT</th>
                    <th className="p-3">Nhóm công việc chuyên môn</th>
                    <th className="p-3 text-center w-28">Tổng đầu việc</th>
                    <th className="p-3 text-center w-28">Đã duyệt</th>
                    <th className="p-3 text-center w-28">Hoàn thành</th>
                    <th className="p-3 text-center w-32">Tổng điểm Q.Đổi</th>
                    <th className="p-3 text-center w-28">Tỷ trọng nhóm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {Object.keys(taskGroupSummary).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        Chưa có dữ liệu công việc trong tháng {selectedMonth}.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(taskGroupSummary).map(([groupName, gStats]: [string, any], idx: number) => {
                      const totalW = stats.totalWorks || 1;
                      const share = Math.round(((gStats.total || 0) / totalW) * 100);
                      return (
                        <tr key={groupName} className="hover:bg-slate-50">
                          <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="p-3 font-bold text-slate-900">{groupName}</td>
                          <td className="p-3 text-center font-black text-indigo-900">{gStats.total} việc</td>
                          <td className="p-3 text-center font-bold text-emerald-700">{gStats.approved} việc</td>
                          <td className="p-3 text-center text-slate-700">{gStats.completed} việc</td>
                          <td className="p-3 text-center font-black text-[#1F4E78]">{formatScore(gStats.score)}đ</td>
                          <td className="p-3 text-center font-bold text-slate-700">{formatPercent(share)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Distribution by Task Nature */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-700" />
                <h3 className="font-black text-[#0f2440] text-base">
                  Phân bố Mức độ phức tạp & Tính chất công việc toàn phòng
                </h3>
              </div>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                Tổng điểm tính chất phòng: +{formatScore(stats.deptNatureTotal)}đ
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
              {[
                { name: 'Đặc biệt phức tạp', pts: '+3đ/việc', count: natureDistribution['Đặc biệt phức tạp'] || 0, bg: 'bg-purple-50 text-purple-800 border-purple-200' },
                { name: 'Rất phức tạp', pts: '+2đ/việc', count: natureDistribution['Rất phức tạp'] || 0, bg: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
                { name: 'Phức tạp', pts: '+1đ/việc', count: natureDistribution['Phức tạp'] || 0, bg: 'bg-blue-50 text-blue-800 border-blue-200' },
                { name: 'Trung bình', pts: '0đ/việc', count: natureDistribution['Trung bình'] || 0, bg: 'bg-slate-100 text-slate-700 border-slate-200' },
                { name: 'Đơn giản', pts: '0đ/việc', count: natureDistribution['Đơn giản'] || 0, bg: 'bg-slate-100 text-slate-700 border-slate-200' },
              ].map(nat => (
                <div key={nat.name} className={`p-4 rounded-xl border ${nat.bg} flex flex-col justify-between space-y-2`}>
                  <div>
                    <div className="font-bold text-xs">{nat.name}</div>
                    <div className="text-[11px] opacity-80">{nat.pts}</div>
                  </div>
                  <div className="text-2xl font-black">{nat.count} <span className="text-xs font-normal">việc</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: BẢN IN / XUẤT BÁO CÁO PHÒNG (STANDARD VIETNAMESE ADMIN FORMAT) */}
      {/* ========================================================================= */}
      {activeTab === 'PRINT_VIEW' && (() => {
        // Calculate print list based on selection
        const printUsersList = usersList.filter(u => selectedUserIds.includes(u.id));

        return (
          <div className="space-y-6">
            {/* Action Bar for Printing & Personnel Selection Settings */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 no-print print:hidden">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#1F4E78] text-white rounded-xl shadow-xs">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-[#0f2440] flex items-center gap-2">
                    <span>Xem trước bản in Bảng tổng hợp KPI Phòng {selectedMonth}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
                      Đã chọn: {printUsersList.length}/{usersList.length} nhân sự
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tùy chọn nhân sự đưa vào biểu trước khi in hoặc xuất báo cáo chuẩn Nghị định 30/2020/NĐ-CP
                  </p>
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                <button
                  onClick={() => setShowPrintSelectionPanel(!showPrintSelectionPanel)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
                  {showPrintSelectionPanel ? 'Ẩn chọn nhân sự' : 'Tùy chọn nhân sự in'}
                </button>

                <button
                  onClick={handleExportWord}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="Tải file Word danh sách nhân sự đã chọn"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Tải Word (.doc)
                </button>

                <button
                  onClick={handleExportExcel}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="Tải file Excel danh sách nhân sự đã chọn"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải Excel (.xlsx)
                </button>

                <button
                  onClick={handlePrint}
                  disabled={printUsersList.length === 0}
                  className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Printer className="w-3.5 h-3.5" />
                  In biểu (Ctrl + P)
                </button>
              </div>
            </div>

            {/* Interactive Personnel Selection Box (no-print) */}
            {showPrintSelectionPanel && (
              <div className="bg-slate-50 border border-blue-200 rounded-2xl p-5 shadow-xs space-y-4 no-print print:hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-[#1F4E78]" />
                    <h3 className="text-sm font-bold text-[#0f2440]">
                      Chọn danh sách nhân sự đưa vào bảng tổng hợp trước khi in
                    </h3>
                  </div>

                  {/* Fast Action Buttons */}
                  <div className="flex items-center flex-wrap gap-1.5 font-semibold text-xs">
                    <button
                      onClick={handleSelectAll}
                      className="px-2.5 py-1 rounded bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-900 border border-slate-300 hover:border-blue-300 transition cursor-pointer text-[11px]"
                    >
                      Chọn tất cả ({usersList.length})
                    </button>
                    <button
                      onClick={handleDeselectAll}
                      className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer text-[11px]"
                    >
                      Bỏ chọn hết
                    </button>
                    <button
                      onClick={handleSelectOnlyApproved}
                      className="px-2.5 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 transition cursor-pointer text-[11px]"
                    >
                      Chỉ người đã duyệt
                    </button>
                    <button
                      onClick={handleSelectOnlyStaff}
                      className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition cursor-pointer text-[11px]"
                    >
                      Chỉ chuyên viên
                    </button>
                    <button
                      onClick={handleSelectOnlyLeaders}
                      className="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition cursor-pointer text-[11px]"
                    >
                      Chỉ lãnh đạo
                    </button>
                  </div>
                </div>

                {/* Personnel Selection Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {usersList.map((u: any) => {
                    const isChecked = selectedUserIds.includes(u.id);
                    const approvedScore = u.scores?.approvedKpiTotal !== null && u.scores?.approvedKpiTotal !== undefined ? u.scores.approvedKpiTotal : null;

                    return (
                      <div
                        key={u.id}
                        onClick={() => handleToggleUser(u.id)}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-center gap-2.5 select-none ${
                          isChecked 
                            ? 'bg-white border-blue-400 shadow-xs ring-1 ring-blue-300' 
                            : 'bg-slate-100/70 border-slate-200 opacity-60 hover:opacity-100 hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by parent div
                          className="w-4 h-4 text-[#1F4E78] rounded border-slate-300 focus:ring-blue-500 cursor-pointer pointer-events-none"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs text-[#0f2440] truncate flex items-center gap-1.5">
                            <span className="truncate">{u.name}</span>
                            {u.isLeaderOrAbove && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800 flex-shrink-0">
                                Lãnh đạo
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {cleanPosition(u.position)} • {approvedScore !== null ? `${approvedScore}đ` : 'Chưa duyệt'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PRINT DOCUMENT PAPER (Standard A4 Landscape) */}
            <div 
              id="department-kpi-print-area"
              className="bg-white p-8 md:p-12 rounded-2xl border border-slate-200 shadow-md text-black font-serif print:p-0 print:border-none print:shadow-none max-w-5xl mx-auto"
              style={{ fontFamily: '"Times New Roman", Times, serif' }}
            >
              {/* Header: National Emblem & Unit - 2 Columns Table */}
              <table className="w-full border-collapse border-none mb-4" style={{ width: '100%', border: 'none', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ border: 'none' }}>
                    <td style={{ width: '45%', textAlign: 'center', verticalAlign: 'top', border: 'none', padding: 0 }}>
                      <div className="text-xs font-bold uppercase tracking-wider">{orgConfig.parentAgency || 'BAN QUẢN LÝ DỰ ÁN ĐẦU TƯ XÂY DỰNG'}</div>
                      <div className="text-xs font-black uppercase text-[#0f2440] mt-0.5">{orgConfig.departmentName || 'PHÒNG KẾ HOẠCH - TÀI CHÍNH'}</div>
                      <div style={{ width: '120px', borderBottom: '1px solid #000000', margin: '4px auto 0 auto' }}></div>
                    </td>
                    <td style={{ width: '55%', textAlign: 'center', verticalAlign: 'top', border: 'none', padding: 0 }}>
                      <div className="text-xs font-bold uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                      <div className="text-xs font-bold mt-0.5">Độc lập - Tự do - Hạnh phúc</div>
                      <div style={{ width: '140px', borderBottom: '1px solid #000000', margin: '4px auto 0 auto' }}></div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Document Title */}
              <div className="text-center py-5">
                <h2 className="text-lg md:text-xl font-black uppercase tracking-tight">
                  BẢNG TỔNG HỢP ĐÁNH GIÁ VÀ XẾP LOẠI HIỆU QUẢ CÔNG VIỆC (KPI)
                </h2>
                <p className="text-sm font-bold italic mt-1">
                  Tháng {selectedMonth} — Đơn vị: {orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính'}
                </p>
              </div>

              {/* Department Summary Table with Explicit Cell Borders */}
              {printUsersList.length === 0 ? (
                <div className="p-10 border border-dashed border-slate-300 rounded-xl text-center space-y-3 my-4">
                  <p className="text-slate-500 font-sans text-sm">
                    Chưa có nhân sự nào được chọn để đưa vào bảng tổng hợp.
                  </p>
                  <button
                    onClick={handleSelectAll}
                    className="bg-[#1F4E78] text-white px-4 py-2 rounded-xl text-xs font-bold font-sans transition cursor-pointer shadow-xs"
                  >
                    Chọn tất cả ({usersList.length}) nhân sự
                  </button>
                </div>
              ) : (
                <table 
                  className="w-full border-collapse border border-black text-xs my-4" 
                  style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black' }}
                >
                  <thead>
                    <tr className="bg-slate-100/90 font-bold text-center" style={{ backgroundColor: '#f2f2f2' }}>
                      <th className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 4px', width: '35px' }}>STT</th>
                      <th className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 6px', width: '160px' }}>Tên nhân sự</th>
                      <th className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 6px', width: '130px' }}>Vị trí</th>
                      <th className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 4px', width: '105px' }}>
                        B tự chấm<br/><span style={{ fontSize: '8.5pt', fontWeight: 'normal' }}>(B1 / B2 / Tổng)</span>
                      </th>
                      <th className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 4px', width: '105px' }}>
                        B duyệt<br/><span style={{ fontSize: '8.5pt', fontWeight: 'normal' }}>(B1 / B2 / Tổng)</span>
                      </th>
                      <th className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 4px', width: '90px' }}>Điểm tự đánh giá</th>
                      <th className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 4px', width: '95px' }}>Điểm lãnh đạo duyệt</th>
                      <th className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 6px', width: '110px' }}>Tự xếp loại</th>
                      <th className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 6px', width: '110px' }}>Lãnh đạo xếp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printUsersList.map((u: any, idx: number) => {
                      const isBApproved = (u.taskCounts?.approved || 0) > 0;
                      const isApproved = u.scores?.approvedKpiTotal !== null && u.scores?.approvedKpiTotal !== undefined;
                      const selfB1 = formatScore(u.scores?.selfB1 ?? 0);
                      const selfB2 = formatScore(u.scores?.selfB2 ?? 0);
                      const selfBTotal = formatScore(u.scores?.selfBTotal ?? 0);
                      const selfBDisplay = `${selfB1} / ${selfB2} / ${selfBTotal}`;

                      const approvedB1 = formatScore(u.scores?.approvedB1 ?? 0);
                      const approvedB2 = formatScore(u.scores?.approvedB2 ?? 0);
                      const approvedBTotal = formatScore(u.scores?.approvedBTotal ?? 0);
                      const approvedBDisplay = isBApproved && u.scores?.approvedBTotal !== undefined && u.scores?.approvedBTotal !== null 
                        ? `${approvedB1} / ${approvedB2} / ${approvedBTotal}` 
                        : (u.isLeaderOrAbove ? '-' : 'Chờ duyệt');

                      const selfScore = u.scores?.selfKpiTotal !== null && u.scores?.selfKpiTotal !== undefined ? u.scores.selfKpiTotal : null;
                      const approvedScore = isApproved ? u.scores.approvedKpiTotal : null;

                      return (
                        <tr key={u.id || idx}>
                          <td className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 4px', textAlign: 'center' }}>{idx + 1}</td>
                          <td className="border border-black p-2 font-bold" style={{ border: '1px solid black', padding: '6px 6px', textAlign: 'left' }}>{u.name}</td>
                          <td className="border border-black p-2" style={{ border: '1px solid black', padding: '6px 6px', textAlign: 'left' }}>{cleanPosition(u.position)}</td>
                          <td className="border border-black p-2 text-center font-bold" style={{ border: '1px solid black', padding: '6px 4px', textAlign: 'center' }}>
                            {selfBDisplay}
                          </td>
                          <td className="border border-black p-2 text-center font-bold" style={{ border: '1px solid black', padding: '6px 4px', textAlign: 'center' }}>
                            {approvedBDisplay}
                          </td>
                          <td className="border border-black p-2 text-center font-bold" style={{ border: '1px solid black', padding: '6px 4px', textAlign: 'center' }}>
                            {selfScore !== null ? formatScore(selfScore) : '-'}
                          </td>
                          <td className="border border-black p-2 text-center font-bold" style={{ border: '1px solid black', padding: '6px 4px', textAlign: 'center' }}>
                            {approvedScore !== null ? formatScore(approvedScore) : (u.isLeaderOrAbove ? '-' : 'Chờ duyệt')}
                          </td>
                          <td className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 6px', textAlign: 'center' }}>{getSelfRankDisplay(u)}</td>
                          {/* CONSTRAINT: Vị trí từ phó phòng trở lên bỏ trống */}
                          <td className="border border-black p-2 text-center" style={{ border: '1px solid black', padding: '6px 6px', textAlign: 'center' }}>
                            {u.isLeaderOrAbove ? '' : (isApproved ? (u.approvedRank || '-') : 'Chờ duyệt')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Note & Summary Stats */}
              <div className="text-xs italic space-y-1 mt-3">
                <p>• Tổng số nhân sự trong danh sách: <strong>{printUsersList.length}</strong> đồng chí.</p>
                <p>• Tổng số đầu mục công việc toàn phòng trong tháng: <strong>{stats.totalWorks || 0}</strong> nhiệm vụ (Đã hoàn thành duyệt: <strong>{stats.approvedWorks || 0}</strong> nhiệm vụ).</p>
                <p>• Ghi chú: Căn cứ quy chế đánh giá, đối với các vị trí từ Phó Trưởng phòng trở lên chỉ có cột Tự xếp loại, cột Lãnh đạo xếp để trống theo quy định.</p>
              </div>

              {/* Date line */}
              <div className="text-right italic text-xs pt-4 pr-6">
                {orgConfig.location || 'Đắk Lắk'}, ngày ...... tháng ...... năm ......
              </div>

              {/* Signature Block - 3 Columns Table */}
              <table className="w-full border-none mt-6" style={{ width: '100%', border: 'none', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ border: 'none' }}>
                    <td style={{ width: '33.3%', textAlign: 'center', verticalAlign: 'top', border: 'none', padding: '0 8px' }}>
                      <div className="font-bold uppercase text-xs">{orgConfig.creatorTitle || 'NGƯỜI LẬP BIỂU'}</div>
                      <div className="text-slate-500 italic text-[10px] mt-0.5">(Ký, ghi rõ họ tên)</div>
                      <div className="h-16"></div>
                      <div className="font-bold text-xs">{currentUser?.name || 'Nguyễn Thị Hải Hà'}</div>
                    </td>

                    <td style={{ width: '33.3%', textAlign: 'center', verticalAlign: 'top', border: 'none', padding: '0 8px' }}>
                      <div className="font-bold uppercase text-xs">{orgConfig.approverTitle || 'LÃNH ĐẠO PHÒNG'}</div>
                      <div className="text-slate-500 italic text-[10px] mt-0.5">(Ký, ghi rõ họ tên)</div>
                      <div className="h-16"></div>
                      <div className="font-bold text-xs">Khuất Văn Sơn</div>
                    </td>

                    <td style={{ width: '33.3%', textAlign: 'center', verticalAlign: 'top', border: 'none', padding: '0 8px' }}>
                      <div className="font-bold uppercase text-xs">{orgConfig.leaderTitle || 'THỦ TRƯỞNG ĐƠN VỊ'}</div>
                      <div className="text-slate-500 italic text-[10px] mt-0.5">(Ký, đóng dấu)</div>
                      <div className="h-16"></div>
                      <div className="font-bold text-xs">Giám đốc</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
