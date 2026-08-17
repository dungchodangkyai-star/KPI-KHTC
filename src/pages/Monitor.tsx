import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Filter, RefreshCw, CheckCircle2, Clock, AlertCircle, 
  Calendar, User, ChevronRight, FileText, ExternalLink, Edit3, 
  Check, X, AlertTriangle, Briefcase, Plus, Send, Info, Eye
} from 'lucide-react';
import { STANDARD_MONTHS } from '../utils';

interface MetricCardProps {
  id: string;
  title: string;
  value: number;
  isActive: boolean;
  onClickDetail: () => void;
  colorClass?: string;
  danger?: boolean;
  warning?: boolean;
  success?: boolean;
}

const MetricCard = ({ 
  id,
  title, 
  value, 
  isActive, 
  onClickDetail, 
  colorClass = "text-[#1F4E78]", 
  danger = false,
  warning = false,
  success = false 
}: MetricCardProps) => {
  let borderClass = 'border-slate-300';
  let badgeColor = colorClass;
  let bgHover = 'hover:border-slate-400';

  if (isActive) {
    borderClass = 'border-[#1F4E78] ring-2 ring-[#1F4E78]/30 bg-blue-50/80 shadow-md';
  } else if (danger && value > 0) {
    borderClass = 'border-l-4 border-l-red-600 border-slate-300 bg-red-50/20';
    badgeColor = 'text-red-700';
  } else if (warning && value > 0) {
    borderClass = 'border-l-4 border-l-amber-600 border-slate-300 bg-amber-50/20';
    badgeColor = 'text-amber-800';
  } else if (success && value > 0) {
    borderClass = 'border-l-4 border-l-emerald-600 border-slate-300 bg-emerald-50/20';
    badgeColor = 'text-emerald-800';
  }

  return (
    <div 
      id={id}
      onClick={onClickDetail}
      className={`bg-white border p-4 rounded-xl flex flex-col justify-between min-h-[135px] shadow-2xs transition-all duration-200 cursor-pointer ${borderClass} ${bgHover} hover:shadow-sm`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-extrabold text-slate-900 leading-snug">{title}</span>
        {isActive && (
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#1F4E78] shrink-0 mt-0.5"></span>
        )}
      </div>
      <div className="flex items-baseline justify-between mt-2">
        <span className={`text-[30px] font-black tracking-tight leading-none ${badgeColor}`}>
          {value}
        </span>
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClickDetail();
          }}
          className={`px-3 py-1 text-xs font-black rounded-lg transition-colors flex items-center gap-1 ${
            isActive 
              ? 'bg-[#1F4E78] text-white shadow-2xs' 
              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
          }`}
        >
          <span>Xem</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

const formatMonth = (m: string) => {
  if (!m) return "";
  const cleanM = String(m).trim();
  if (cleanM.toLowerCase().includes('xóa mềm') || cleanM.toLowerCase().includes('xoa mem')) return "";
  
  if (!isNaN(Number(cleanM)) && Number(cleanM) > 20000) {
    const date = new Date((Number(cleanM) - 25569) * 86400 * 1000);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}-${yyyy}`;
  }
  
  const match = cleanM.match(/(0[1-9]|1[0-2])-(20\d{2})/);
  if (match) return match[0];
  const matchDot = cleanM.match(/(20\d{2})\.(0[1-9]|1[0-2])/);
  if (matchDot) return `${matchDot[2]}-${matchDot[1]}`;
  
  return cleanM;
};

const isSoftDeleted = (w: any) => {
  const haystack = `${w.month || ''} ${w.status || ''} ${w.leaderApproval || ''} ${w.dataStatus || ''}`.toLowerCase();
  return haystack.includes('xóa mềm') || haystack.includes('xoa mem') || haystack.includes('đã xóa') || haystack.includes('thu hồi');
};

export default function Monitor() {
  const [works, setWorks] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [overtimes, setOvertimes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Active selected card type
  const [monitorType, setMonitorType] = useState<string>("TOTAL");
  
  // Standard 12 months selector default to current month (e.g. 08-2026)
  const [selectedMonth, setSelectedMonth] = useState("08-2026");
  const [selectedEmployee, setSelectedEmployee] = useState("Tất cả");

  // Selected item for modal
  const [selectedItem, setSelectedItem] = useState<{ type: 'WORK' | 'ASSIGNMENT' | 'OVERTIME', data: any } | null>(null);
  const [modalFormData, setModalFormData] = useState<any>({});

  const detailRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [resWorks, resAssignments, resOvertimes, resUsers] = await Promise.all([
        fetch('/api/works'),
        fetch('/api/assignments'),
        fetch('/api/overtimes'),
        fetch('/api/users')
      ]);

      const [dataWorks, dataAssignments, dataOvertimes, dataUsers] = await Promise.all([
        resWorks.json(),
        resAssignments.json(),
        resOvertimes.json(),
        resUsers.json()
      ]);

      if (dataWorks.success) setWorks(dataWorks.data || []);
      if (dataAssignments.success) setAssignments(dataAssignments.data || []);
      if (dataOvertimes.success) setOvertimes(dataOvertimes.data || []);
      if (dataUsers.success) setUsers(dataUsers.data || []);
    } catch (err) {
      console.error("Fetch data error in Monitor:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const getDaysTo = (endDateStr: string | null | Date) => {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    if (isNaN(end.getTime())) return null;
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - now.getTime()) / 86400000);
  };

  const isDone = (status: string | null) => {
    if (!status) return false;
    const s = status.toLowerCase();
    return s.includes('hoàn thành') || s.includes('đã xong') || s.includes('đã duyệt');
  };

  const isApproved = (appr: string | null) => appr === 'Duyệt' || appr === 'Đã duyệt';

  // Filter Active Data
  const activeWorks = works.filter(w => !isSoftDeleted(w));
  const activeAssignments = assignments.filter(a => !isSoftDeleted(a));
  const activeOvertimes = overtimes.filter(o => !isSoftDeleted(o));

  // Filter by Month and Employee
  const filterByScope = (item: any, isOt = false) => {
    const itemMonth = formatMonth(item.month);
    const matchMonth = selectedMonth === "Tất cả" || itemMonth === selectedMonth;
    
    let userName = "";
    if (isOt) {
      userName = item.user?.name || "";
    } else if (item.receiver) {
      userName = item.receiver?.name || "";
    } else {
      userName = item.user?.name || "";
    }

    const matchEmployee = selectedEmployee === "Tất cả" || userName === selectedEmployee;
    return matchMonth && matchEmployee;
  };

  const scopedWorks = activeWorks.filter(w => filterByScope(w, false));
  const scopedAssignments = activeAssignments.filter(a => filterByScope(a, false));
  const scopedOvertimes = activeOvertimes.filter(o => filterByScope(o, true));

  // Compute 13 Work Metrics
  const workStats = {
    total: scopedWorks.length,
    needAction: scopedWorks.filter(w => !isDone(w.status) && !isApproved(w.leaderApproval)).length +
                scopedAssignments.filter(a => a.receiveStatus === 'Chưa xem' || a.receiveStatus === 'Đã xem').length,
    overdue: scopedWorks.filter(w => {
      const days = getDaysTo(w.endDate);
      return days !== null && days < 0 && !isDone(w.status) && !isApproved(w.leaderApproval);
    }).length,
    dueToday: scopedWorks.filter(w => {
      const days = getDaysTo(w.endDate);
      return days === 0 && !isDone(w.status) && !isApproved(w.leaderApproval);
    }).length,
    dueSoon: scopedWorks.filter(w => {
      const days = getDaysTo(w.endDate);
      return days !== null && days > 0 && days <= 2 && !isDone(w.status) && !isApproved(w.leaderApproval);
    }).length,
    notAccepted: scopedAssignments.filter(a => a.receiveStatus === 'Chưa xem' || a.receiveStatus === 'Đã xem').length,
    acceptedInProgress: scopedAssignments.filter(a => a.receiveStatus === 'Đã nhận - đang triển khai').length,
    acceptedNoKh: scopedAssignments.filter(a => (a.receiveStatus?.includes('Đã nhận') || a.receiveStatus?.includes('tiến hành')) && !a.workId).length,
    noEvidence: scopedWorks.filter(w => (!w.evidence || w.evidence.trim() === '') && !isApproved(w.leaderApproval)).length,
    pendingApproval: scopedWorks.filter(w => w.leaderApproval === 'Chưa duyệt' || w.leaderApproval === 'Chờ duyệt').length,
    needSupplement: scopedWorks.filter(w => w.leaderApproval === 'Cần bổ sung').length,
    rejected: scopedWorks.filter(w => w.leaderApproval === 'Không duyệt').length,
    dataError: scopedWorks.filter(w => !w.taskName || !w.month || (!w.userId && !w.user)).length
  };

  // Compute 6 Overtime Metrics
  const otStats = {
    otTotal: scopedOvertimes.length,
    otPending: scopedOvertimes.filter(o => o.approvalStatus === 'Chờ duyệt' || o.approvalStatus === 'Đã bổ sung').length,
    otNeedSupplement: scopedOvertimes.filter(o => o.approvalStatus === 'Cần bổ sung').length,
    otApproved: scopedOvertimes.filter(o => o.approvalStatus === 'Đã duyệt').length,
    otRejected: scopedOvertimes.filter(o => o.approvalStatus === 'Không duyệt').length,
    otNoResult: scopedOvertimes.filter(o => (!o.actualResult || o.actualResult.trim() === '') && !o.evidence).length
  };

  const handleCardClick = (type: string) => {
    setMonitorType(type);
    setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  // Determine which list to show in table
  const isOtCategory = monitorType.startsWith('OT_');
  const isAssignmentCategory = ['NOT_ACCEPTED', 'ACCEPTED_IN_PROGRESS', 'ACCEPTED_NO_KH'].includes(monitorType);

  const getMonitorTypeTitle = (type: string) => {
    const map: Record<string, string> = {
      'TOTAL': 'Tất cả công việc đang theo dõi',
      'NEED_ACTION': 'Danh sách việc cần xử lý ngay',
      'OVERDUE': 'Công việc đã quá hạn hoàn thành',
      'DUE_TODAY': 'Công việc đến hạn hôm nay',
      'DUE_SOON': 'Công việc sắp đến hạn (1-2 ngày tới)',
      'NOT_ACCEPTED': 'Nhiệm vụ được giao nhưng chuyên viên chưa nhận việc',
      'ACCEPTED_IN_PROGRESS': 'Nhiệm vụ đã tiếp nhận và đang triển khai',
      'ACCEPTED_NO_KH': 'Nhiệm vụ đã nhận nhưng chưa lập kế hoạch chi tiết',
      'NO_EVIDENCE': 'Công việc chưa cập nhật đường dẫn minh chứng/sản phẩm',
      'PENDING_APPROVAL': 'Công việc đang chờ Lãnh đạo duyệt',
      'NEED_SUPPLEMENT': 'Công việc bị yêu cầu bổ sung hồ sơ/minh chứng',
      'REJECTED': 'Công việc không được duyệt/cần xử lý lại',
      'DATA_ERROR': 'Công việc thiếu thông tin/dữ liệu lỗi',
      'OT_TOTAL': 'Tất cả danh sách đăng ký làm thêm ngoài giờ',
      'OT_PENDING': 'Đăng ký làm thêm ngoài giờ đang chờ phê duyệt',
      'OT_NEED_SUPPLEMENT': 'Đăng ký làm thêm ngoài giờ cần bổ sung minh chứng',
      'OT_APPROVED': 'Đăng ký làm thêm ngoài giờ đã được phê duyệt',
      'OT_REJECTED': 'Đăng ký làm thêm ngoài giờ không được duyệt',
      'OT_NO_RESULT': 'Làm thêm ngoài giờ chưa cập nhật kết quả/sản phẩm thực tế'
    };
    return map[type] || 'Danh sách chi tiết';
  };

  // Filtered Table Items
  let displayedWorks = scopedWorks;
  let displayedAssignments = scopedAssignments;
  let displayedOvertimes = scopedOvertimes;

  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    displayedWorks = displayedWorks.filter(w => 
      (w.taskName?.toLowerCase().includes(q)) || 
      (w.taskGroup?.toLowerCase().includes(q)) || 
      (w.taskCode?.toLowerCase().includes(q)) || 
      (w.user?.name?.toLowerCase().includes(q)) ||
      (w.detail?.toLowerCase().includes(q))
    );
    displayedAssignments = displayedAssignments.filter(a => 
      (a.taskName?.toLowerCase().includes(q)) || 
      (a.taskGroup?.toLowerCase().includes(q)) || 
      (a.receiver?.name?.toLowerCase().includes(q)) ||
      (a.detail?.toLowerCase().includes(q))
    );
    displayedOvertimes = displayedOvertimes.filter(o => 
      (o.content?.toLowerCase().includes(q)) || 
      (o.project?.toLowerCase().includes(q)) || 
      (o.user?.name?.toLowerCase().includes(q)) ||
      (o.reason?.toLowerCase().includes(q))
    );
  }

  // Filter by category
  if (!isOtCategory && !isAssignmentCategory) {
    switch (monitorType) {
      case 'NEED_ACTION':
        displayedWorks = displayedWorks.filter(w => !isDone(w.status) && !isApproved(w.leaderApproval));
        break;
      case 'OVERDUE':
        displayedWorks = displayedWorks.filter(w => {
          const d = getDaysTo(w.endDate);
          return d !== null && d < 0 && !isDone(w.status) && !isApproved(w.leaderApproval);
        });
        break;
      case 'DUE_TODAY':
        displayedWorks = displayedWorks.filter(w => {
          const d = getDaysTo(w.endDate);
          return d === 0 && !isDone(w.status) && !isApproved(w.leaderApproval);
        });
        break;
      case 'DUE_SOON':
        displayedWorks = displayedWorks.filter(w => {
          const d = getDaysTo(w.endDate);
          return d !== null && d > 0 && d <= 2 && !isDone(w.status) && !isApproved(w.leaderApproval);
        });
        break;
      case 'NO_EVIDENCE':
        displayedWorks = displayedWorks.filter(w => (!w.evidence || w.evidence.trim() === '') && !isApproved(w.leaderApproval));
        break;
      case 'PENDING_APPROVAL':
        displayedWorks = displayedWorks.filter(w => w.leaderApproval === 'Chưa duyệt' || w.leaderApproval === 'Chờ duyệt');
        break;
      case 'NEED_SUPPLEMENT':
        displayedWorks = displayedWorks.filter(w => w.leaderApproval === 'Cần bổ sung');
        break;
      case 'REJECTED':
        displayedWorks = displayedWorks.filter(w => w.leaderApproval === 'Không duyệt');
        break;
      case 'DATA_ERROR':
        displayedWorks = displayedWorks.filter(w => !w.taskName || !w.month || (!w.userId && !w.user));
        break;
      default:
        break;
    }
  } else if (isAssignmentCategory) {
    switch (monitorType) {
      case 'NOT_ACCEPTED':
        displayedAssignments = displayedAssignments.filter(a => a.receiveStatus === 'Chưa xem' || a.receiveStatus === 'Đã xem');
        break;
      case 'ACCEPTED_IN_PROGRESS':
        displayedAssignments = displayedAssignments.filter(a => a.receiveStatus === 'Đã nhận - đang triển khai');
        break;
      case 'ACCEPTED_NO_KH':
        displayedAssignments = displayedAssignments.filter(a => (a.receiveStatus?.includes('Đã nhận') || a.receiveStatus?.includes('tiến hành')) && !a.workId);
        break;
    }
  } else {
    // OT
    switch (monitorType) {
      case 'OT_PENDING':
        displayedOvertimes = displayedOvertimes.filter(o => o.approvalStatus === 'Chờ duyệt' || o.approvalStatus === 'Đã bổ sung');
        break;
      case 'OT_NEED_SUPPLEMENT':
        displayedOvertimes = displayedOvertimes.filter(o => o.approvalStatus === 'Cần bổ sung');
        break;
      case 'OT_APPROVED':
        displayedOvertimes = displayedOvertimes.filter(o => o.approvalStatus === 'Đã duyệt');
        break;
      case 'OT_REJECTED':
        displayedOvertimes = displayedOvertimes.filter(o => o.approvalStatus === 'Không duyệt');
        break;
      case 'OT_NO_RESULT':
        displayedOvertimes = displayedOvertimes.filter(o => (!o.actualResult || o.actualResult.trim() === '') && !o.evidence);
        break;
      default:
        break;
    }
  }

  // Open Modal Handler
  const openModal = (type: 'WORK' | 'ASSIGNMENT' | 'OVERTIME', data: any) => {
    setSelectedItem({ type, data });
    setModalFormData({
      ...data,
      status: data.status || 'Đang xử lý',
      leaderApproval: data.leaderApproval || 'Chưa duyệt',
      leaderNote: data.leaderNote || '',
      evidence: data.evidence || '',
      approvalStatus: data.approvalStatus || 'Chờ duyệt',
      approvedHours: data.approvedHours || data.totalRegHours || '3.5',
      approverNote: data.approverNote || '',
      actualResult: data.actualResult || '',
      receiveStatus: data.receiveStatus || 'Chưa xem'
    });
  };

  const handleSaveModal = async () => {
    if (!selectedItem) return;
    setIsUpdating(true);
    try {
      if (selectedItem.type === 'WORK') {
        const res = await fetch(`/api/works/${selectedItem.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modalFormData)
        });
        if (res.ok) {
          await fetchData();
          setSelectedItem(null);
        }
      } else if (selectedItem.type === 'ASSIGNMENT') {
        const res = await fetch(`/api/assignments/${selectedItem.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modalFormData)
        });
        if (res.ok) {
          await fetchData();
          setSelectedItem(null);
        }
      } else if (selectedItem.type === 'OVERTIME') {
        const res = await fetch(`/api/overtimes/${selectedItem.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modalFormData)
        });
        if (res.ok) {
          await fetchData();
          setSelectedItem(null);
        }
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleQuickApproveWork = async (id: number) => {
    try {
      await fetch(`/api/works/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderApproval: 'Duyệt', status: 'Hoàn thành' })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickApproveOt = async (id: number, hours: string) => {
    try {
      await fetch(`/api/overtimes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalStatus: 'Đã duyệt', approvedHours: hours })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6 h-full pb-12 px-2 sm:px-4">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-300 p-5 rounded-2xl bg-white shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/70 text-[#1F4E78] text-xs font-black mb-2 border border-blue-200">
            <Briefcase className="w-3.5 h-3.5" />
            <span>GIÁM SÁT TIẾN ĐỘ & ĐIỀU HÀNH</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0f2440] tracking-tight">
            Theo dõi công việc
          </h2>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Hệ thống giám sát điều hành công việc, tiến độ thực hiện và làm thêm ngoài giờ toàn phòng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 12 Months Standard Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 shadow-2xs">
            <Calendar className="w-4 h-4 text-[#1F4E78]" />
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider">Tháng:</label>
            <select 
              id="select-month-dropdown"
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-sm font-black text-[#1F4E78] outline-none cursor-pointer shadow-2xs"
            >
              <option value="Tất cả">Tất cả các tháng</option>
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>

          {/* Employee Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 shadow-2xs">
            <User className="w-4 h-4 text-[#1F4E78]" />
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider">Nhân sự:</label>
            <select 
              id="select-employee-dropdown"
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-sm font-black text-slate-900 outline-none cursor-pointer max-w-[180px] truncate shadow-2xs"
            >
              <option value="Tất cả">Tất cả nhân sự ({users.length})</option>
              {users.map(u => (
                <option key={u.id} value={u.name}>{u.name} ({u.position || 'CV'})</option>
              ))}
            </select>
          </div>

          <button 
            id="btn-refresh-monitor"
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-2 bg-[#1F4E78] hover:bg-[#173a5a] text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-sm transition-all active:scale-95 border border-blue-900"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Cập nhật</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: 13 Metric Cards - Báo cáo điều hành công việc */}
      <div className="bg-white border border-slate-300 rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#1F4E78]"></span>
            <h3 className="font-black text-slate-900 text-base sm:text-lg uppercase tracking-tight">
              Báo cáo điều hành công việc
            </h3>
          </div>
          <span className="text-xs font-black text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
            Tháng: <b className="text-[#1F4E78]">{selectedMonth}</b> | Nhân sự: <b className="text-[#1F4E78]">{selectedEmployee}</b>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
          <MetricCard 
            id="card-total"
            title="Tổng việc đang theo dõi" 
            value={workStats.total} 
            isActive={monitorType === 'TOTAL'}
            onClickDetail={() => handleCardClick('TOTAL')} 
          />
          <MetricCard 
            id="card-need-action"
            title="Việc cần xử lý" 
            value={workStats.needAction} 
            danger={workStats.needAction > 0} 
            isActive={monitorType === 'NEED_ACTION'}
            onClickDetail={() => handleCardClick('NEED_ACTION')} 
          />
          <MetricCard 
            id="card-overdue"
            title="Quá hạn" 
            value={workStats.overdue} 
            danger={workStats.overdue > 0} 
            isActive={monitorType === 'OVERDUE'}
            onClickDetail={() => handleCardClick('OVERDUE')} 
          />
          <MetricCard 
            id="card-due-today"
            title="Đến hạn hôm nay" 
            value={workStats.dueToday} 
            warning={workStats.dueToday > 0} 
            isActive={monitorType === 'DUE_TODAY'}
            onClickDetail={() => handleCardClick('DUE_TODAY')} 
          />
          <MetricCard 
            id="card-due-soon"
            title="Sắp đến hạn" 
            value={workStats.dueSoon} 
            isActive={monitorType === 'DUE_SOON'}
            onClickDetail={() => handleCardClick('DUE_SOON')} 
          />
          <MetricCard 
            id="card-not-accepted"
            title="Chưa nhận việc" 
            value={workStats.notAccepted} 
            warning={workStats.notAccepted > 0} 
            isActive={monitorType === 'NOT_ACCEPTED'}
            onClickDetail={() => handleCardClick('NOT_ACCEPTED')} 
          />
          <MetricCard 
            id="card-accepted-in-progress"
            title="Đã nhận - đang triển khai" 
            value={workStats.acceptedInProgress} 
            success={workStats.acceptedInProgress > 0}
            isActive={monitorType === 'ACCEPTED_IN_PROGRESS'}
            onClickDetail={() => handleCardClick('ACCEPTED_IN_PROGRESS')} 
          />
          <MetricCard 
            id="card-accepted-no-kh"
            title="Đã nhận nhưng chưa có KH" 
            value={workStats.acceptedNoKh} 
            danger={workStats.acceptedNoKh > 0} 
            isActive={monitorType === 'ACCEPTED_NO_KH'}
            onClickDetail={() => handleCardClick('ACCEPTED_NO_KH')} 
          />
          <MetricCard 
            id="card-no-evidence"
            title="Chưa cập nhật minh chứng" 
            value={workStats.noEvidence} 
            warning={workStats.noEvidence > 0} 
            isActive={monitorType === 'NO_EVIDENCE'}
            onClickDetail={() => handleCardClick('NO_EVIDENCE')} 
          />
          <MetricCard 
            id="card-pending-approval"
            title="Chờ duyệt" 
            value={workStats.pendingApproval} 
            isActive={monitorType === 'PENDING_APPROVAL'}
            onClickDetail={() => handleCardClick('PENDING_APPROVAL')} 
          />
          <MetricCard 
            id="card-need-supplement"
            title="Cần bổ sung" 
            value={workStats.needSupplement} 
            danger={workStats.needSupplement > 0} 
            isActive={monitorType === 'NEED_SUPPLEMENT'}
            onClickDetail={() => handleCardClick('NEED_SUPPLEMENT')} 
          />
          <MetricCard 
            id="card-rejected"
            title="Không duyệt / cần làm lại" 
            value={workStats.rejected} 
            danger={workStats.rejected > 0} 
            isActive={monitorType === 'REJECTED'}
            onClickDetail={() => handleCardClick('REJECTED')} 
          />
          <MetricCard 
            id="card-data-error"
            title="Dữ liệu lỗi / mồ côi" 
            value={workStats.dataError} 
            danger={workStats.dataError > 0} 
            isActive={monitorType === 'DATA_ERROR'}
            onClickDetail={() => handleCardClick('DATA_ERROR')} 
          />
        </div>
      </div>

      {/* SECTION 2: 6 Metric Cards - Theo dõi làm thêm ngoài giờ */}
      <div className="bg-white border border-slate-300 rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-600"></span>
            <h3 className="font-black text-slate-900 text-base sm:text-lg uppercase tracking-tight">
              Theo dõi làm thêm ngoài giờ
            </h3>
          </div>
          <span className="text-xs font-bold text-slate-600 italic bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
            Dữ liệu đọc trực tiếp từ hồ sơ đăng ký làm thêm thực tế
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <MetricCard 
            id="card-ot-total"
            title="Tổng đăng ký làm thêm" 
            value={otStats.otTotal} 
            isActive={monitorType === 'OT_TOTAL'}
            onClickDetail={() => handleCardClick('OT_TOTAL')} 
          />
          <MetricCard 
            id="card-ot-pending"
            title="Chờ duyệt làm thêm" 
            value={otStats.otPending} 
            warning={otStats.otPending > 0} 
            isActive={monitorType === 'OT_PENDING'}
            onClickDetail={() => handleCardClick('OT_PENDING')} 
          />
          <MetricCard 
            id="card-ot-need-supplement"
            title="Cần bổ sung làm thêm" 
            value={otStats.otNeedSupplement} 
            danger={otStats.otNeedSupplement > 0} 
            isActive={monitorType === 'OT_NEED_SUPPLEMENT'}
            onClickDetail={() => handleCardClick('OT_NEED_SUPPLEMENT')} 
          />
          <MetricCard 
            id="card-ot-approved"
            title="Làm thêm đã duyệt" 
            value={otStats.otApproved} 
            success={otStats.otApproved > 0} 
            isActive={monitorType === 'OT_APPROVED'}
            onClickDetail={() => handleCardClick('OT_APPROVED')} 
          />
          <MetricCard 
            id="card-ot-rejected"
            title="Làm thêm không duyệt" 
            value={otStats.otRejected} 
            danger={otStats.otRejected > 0} 
            isActive={monitorType === 'OT_REJECTED'}
            onClickDetail={() => handleCardClick('OT_REJECTED')} 
          />
          <MetricCard 
            id="card-ot-no-result"
            title="Chưa có kết quả / MC" 
            value={otStats.otNoResult} 
            warning={otStats.otNoResult > 0} 
            isActive={monitorType === 'OT_NO_RESULT'}
            onClickDetail={() => handleCardClick('OT_NO_RESULT')} 
          />
        </div>
      </div>

      {/* SECTION 3: Dynamic Detail Table */}
      <div 
        ref={detailRef} 
        id="detail-table-section"
        className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[450px]"
      >
        {/* Table Header Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-300 bg-gradient-to-r from-slate-100 to-blue-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-[#1F4E78] text-white shadow-2xs">
                Chi tiết
              </span>
              <h3 className="font-black text-slate-900 text-base sm:text-lg">
                {getMonitorTypeTitle(monitorType)}
              </h3>
            </div>
            <p className="text-xs font-medium text-slate-600 mt-1">
              Đang hiển thị {
                isOtCategory 
                  ? `${displayedOvertimes.length} bản ghi làm thêm` 
                  : isAssignmentCategory 
                    ? `${displayedAssignments.length} nhiệm vụ được giao`
                    : `${displayedWorks.length} công việc`
              }
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                id="input-table-search"
                type="text" 
                placeholder="Tìm tên việc, nhân sự, nội dung..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1F4E78] focus:border-[#1F4E78] outline-none shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Table Data */}
        <div className="overflow-x-auto custom-scrollbar">
          {isLoading ? (
            <div className="p-16 flex flex-col items-center justify-center text-slate-500 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-[#1F4E78]" /> 
              <span className="font-semibold text-sm">Đang tải và xử lý dữ liệu...</span>
            </div>
          ) : isOtCategory ? (
            /* OVERTIME TABLE */
            <table className="w-full text-left border-collapse text-sm min-w-[1000px]">
              <thead className="bg-[#1F4E78] text-white font-bold text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Mã & Ngày làm thêm</th>
                  <th className="p-3.5">Nhân viên</th>
                  <th className="p-3.5">Thời gian</th>
                  <th className="p-3.5">Nội dung & Lý do</th>
                  <th className="p-3.5">Dự án / Sản phẩm</th>
                  <th className="p-3.5">Trạng thái duyệt</th>
                  <th className="p-3.5">Kết quả & Minh chứng</th>
                  <th className="p-3.5 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedOvertimes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500 bg-white">
                      Không có bản ghi làm thêm nào trong nhóm này.
                    </td>
                  </tr>
                ) : (
                  displayedOvertimes.map((o) => {
                    let statusBadge = <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800">Chờ duyệt</span>;
                    if (o.approvalStatus === 'Đã duyệt') {
                      statusBadge = <span className="px-2 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-800">Đã duyệt ({o.approvedHours || o.totalRegHours}h)</span>;
                    } else if (o.approvalStatus === 'Cần bổ sung') {
                      statusBadge = <span className="px-2 py-1 rounded text-xs font-bold bg-orange-100 text-orange-800">Cần bổ sung</span>;
                    } else if (o.approvalStatus === 'Không duyệt') {
                      statusBadge = <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-800">Không duyệt</span>;
                    }

                    return (
                      <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 font-medium text-slate-900">
                          <span className="font-bold text-[#1F4E78]">{o.otId}</span>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {o.otDate ? new Date(o.otDate).toLocaleDateString('vi-VN') : '-'}
                          </div>
                        </td>
                        <td className="p-3.5 font-semibold text-slate-800">
                          {o.user?.name || `NV #${o.userId}`}
                          <div className="text-xs font-normal text-slate-500">{o.user?.position || 'Chuyên viên'}</div>
                        </td>
                        <td className="p-3.5 text-slate-700">
                          <span className="font-bold text-slate-800">{o.startTime} - {o.endTime}</span>
                          <div className="text-xs text-slate-500">{o.totalRegHours} giờ (Nghỉ {o.breakMinutes || 0}p)</div>
                        </td>
                        <td className="p-3.5 max-w-[280px]">
                          <div className="font-medium text-slate-900 line-clamp-2">{o.content}</div>
                          {o.reason && <div className="text-xs text-slate-500 italic mt-0.5 line-clamp-1">Lý do: {o.reason}</div>}
                        </td>
                        <td className="p-3.5 text-slate-700">
                          <span className="font-medium">{o.project || 'Toàn phòng'}</span>
                          <div className="text-xs text-slate-500">{o.expectedResult || '-'}</div>
                        </td>
                        <td className="p-3.5">{statusBadge}</td>
                        <td className="p-3.5 max-w-[180px]">
                          <div className="text-xs text-slate-800 line-clamp-1">{o.actualResult || 'Chưa cập nhật'}</div>
                          {o.evidence ? (
                            <a href={o.evidence} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                              <span>Xem minh chứng</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">Chưa có link</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {o.approvalStatus !== 'Đã duyệt' && (
                              <button 
                                onClick={() => handleQuickApproveOt(o.id, o.totalRegHours)}
                                title="Phê duyệt nhanh"
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => openModal('OVERTIME', o)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Chi tiết</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : isAssignmentCategory ? (
            /* ASSIGNMENT TABLE */
            <table className="w-full text-left border-collapse text-sm min-w-[1000px]">
              <thead className="bg-[#1F4E78] text-white font-bold text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Mã giao việc</th>
                  <th className="p-3.5">Người giao</th>
                  <th className="p-3.5">Người nhận</th>
                  <th className="p-3.5">Nhiệm vụ</th>
                  <th className="p-3.5">Thời hạn & Điểm</th>
                  <th className="p-3.5">Trạng thái nhận việc</th>
                  <th className="p-3.5">Sản phẩm yêu cầu</th>
                  <th className="p-3.5 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500 bg-white">
                      Không có nhiệm vụ giao việc nào trong nhóm này.
                    </td>
                  </tr>
                ) : (
                  displayedAssignments.map((a) => {
                    let receiveBadge = <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800">Chưa xem</span>;
                    if (a.receiveStatus === 'Đã nhận - đang triển khai') {
                      receiveBadge = <span className="px-2 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-800">Đã nhận - đang làm</span>;
                    } else if (a.receiveStatus === 'Đã xem') {
                      receiveBadge = <span className="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-800">Đã xem</span>;
                    }

                    return (
                      <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 font-medium text-slate-900">
                          <span className="font-bold text-[#1F4E78]">{a.assignmentId}</span>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {a.assignDate ? new Date(a.assignDate).toLocaleDateString('vi-VN') : '-'}
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-700 font-medium">
                          {a.assigner?.name || 'Lãnh đạo phòng'}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">
                          {a.receiver?.name || `NV #${a.receiverId}`}
                        </td>
                        <td className="p-3.5 max-w-[280px]">
                          <span className="text-xs font-bold text-slate-500 uppercase">{a.taskGroup}</span>
                          <div className="font-bold text-slate-800 leading-snug">{a.taskName}</div>
                          {a.detail && <div className="text-xs text-slate-600 mt-1 line-clamp-1">{a.detail}</div>}
                        </td>
                        <td className="p-3.5 text-slate-700">
                          <div className="font-bold text-slate-800">
                            {a.deadline ? new Date(a.deadline).toLocaleDateString('vi-VN') : '-'}
                          </div>
                          <div className="text-xs text-slate-500">Điểm: {a.baseScore} (Hệ số {a.suggestedCoef})</div>
                        </td>
                        <td className="p-3.5">{receiveBadge}</td>
                        <td className="p-3.5 text-slate-700">
                          <span className="font-medium text-xs">{a.productRequired || a.productType}</span>
                          <div className="text-xs text-slate-500">{a.productQty} {a.unit}</div>
                        </td>
                        <td className="p-3.5 text-center">
                          <button 
                            onClick={() => openModal('ASSIGNMENT', a)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 mx-auto"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Xem / Cập nhật</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* WORKS TABLE */
            <table className="w-full text-left border-collapse text-sm min-w-[1100px]">
              <thead className="bg-[#1F4E78] text-white font-bold text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Cảnh báo tiến độ</th>
                  <th className="p-3.5">Tháng</th>
                  <th className="p-3.5">Nhân viên</th>
                  <th className="p-3.5">Nhiệm vụ & Chi tiết</th>
                  <th className="p-3.5">Hạn & Thời gian</th>
                  <th className="p-3.5">Trạng thái</th>
                  <th className="p-3.5">Duyệt & Minh chứng</th>
                  <th className="p-3.5 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedWorks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500 bg-white">
                      Không tìm thấy công việc nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  displayedWorks.map((w) => {
                    const days = getDaysTo(w.endDate);
                    let alertBadge = <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">Bình thường</span>;

                    if (isDone(w.status)) {
                      alertBadge = <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">Đã hoàn thành</span>;
                    } else if (days === null) {
                      alertBadge = <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">Chưa đặt hạn</span>;
                    } else if (days < 0) {
                      alertBadge = <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">Quá hạn {Math.abs(days)} ngày</span>;
                    } else if (days === 0) {
                      alertBadge = <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 animate-pulse">Đến hạn hôm nay</span>;
                    } else if (days <= 2) {
                      alertBadge = <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-800">Sắp đến hạn ({days} ngày)</span>;
                    }

                    let approvalBadge = <span className="text-slate-500 font-medium">Chưa duyệt</span>;
                    if (w.leaderApproval === 'Duyệt') {
                      approvalBadge = <span className="text-emerald-700 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Đã duyệt</span>;
                    } else if (w.leaderApproval === 'Cần bổ sung') {
                      approvalBadge = <span className="text-amber-700 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Cần bổ sung</span>;
                    } else if (w.leaderApproval === 'Không duyệt') {
                      approvalBadge = <span className="text-red-700 font-bold flex items-center gap-1"><X className="w-3.5 h-3.5" /> Không duyệt</span>;
                    }

                    return (
                      <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5">
                          {alertBadge}
                          <div className="text-[11px] text-slate-400 mt-1 font-mono">{w.workId || `W-${w.id}`}</div>
                        </td>
                        <td className="p-3.5 text-xs font-bold text-slate-700 font-mono">
                          {formatMonth(w.month)}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">
                          {w.user?.name || `User #${w.userId}`}
                          <div className="text-xs font-normal text-slate-500">{w.user?.position || 'Chuyên viên'}</div>
                        </td>
                        <td className="p-3.5 max-w-[280px]">
                          <span className="text-xs font-bold text-[#1F4E78] uppercase">{w.taskGroup}</span>
                          <div className="font-bold text-slate-900 leading-snug">{w.taskName}</div>
                          {w.detail && <div className="text-xs text-slate-600 mt-0.5 line-clamp-1">{w.detail}</div>}
                        </td>
                        <td className="p-3.5 text-slate-700">
                          <div className="font-bold text-slate-800">
                            {w.endDate ? new Date(w.endDate).toLocaleDateString('vi-VN') : '-'}
                          </div>
                          <div className="text-xs text-slate-500">Giờ: {w.hours || 8}h | Điểm: {w.convertedScore || w.baseScore || '-'}</div>
                        </td>
                        <td className="p-3.5 text-slate-700">
                          <span className="font-medium text-xs px-2 py-1 bg-slate-100 rounded-md inline-block">
                            {w.status || 'Đang xử lý'}
                          </span>
                        </td>
                        <td className="p-3.5 max-w-[180px]">
                          <div className="text-xs">{approvalBadge}</div>
                          {w.evidence ? (
                            <a href={w.evidence} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1 truncate">
                              <span className="truncate">{w.evidence}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-xs text-red-500 italic mt-1 block">Chưa có MC</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {w.leaderApproval !== 'Duyệt' && (
                              <button 
                                onClick={() => handleQuickApproveWork(w.id)}
                                title="Phê duyệt nhanh"
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => openModal('WORK', w)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Sửa</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* SECTION 4: Detail & Edit Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 bg-[#1F4E78] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                <h3 className="font-bold text-lg">
                  {selectedItem.type === 'WORK' && 'Cập nhật & Phê duyệt công việc'}
                  {selectedItem.type === 'ASSIGNMENT' && 'Chi tiết nhiệm vụ giao việc'}
                  {selectedItem.type === 'OVERTIME' && 'Phê duyệt & Cập nhật làm thêm ngoài giờ'}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedItem(null)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 max-h-[75vh] overflow-y-auto space-y-4 text-sm">
              {selectedItem.type === 'WORK' && (
                <>
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-xs text-slate-500">Nhân sự:</span>
                      <div className="font-bold text-slate-800">{selectedItem.data.user?.name}</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Tháng:</span>
                      <div className="font-bold text-slate-800">{selectedItem.data.month}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-slate-500">Nhiệm vụ:</span>
                      <div className="font-bold text-slate-900">{selectedItem.data.taskGroup} - {selectedItem.data.taskName}</div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nội dung thực hiện chi tiết:</label>
                    <textarea 
                      value={modalFormData.detail || ''} 
                      onChange={(e) => setModalFormData({ ...modalFormData, detail: e.target.value })}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Trạng thái công việc:</label>
                      <select 
                        value={modalFormData.status}
                        onChange={(e) => setModalFormData({ ...modalFormData, status: e.target.value })}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
                      >
                        <option value="Đang xử lý">Đang xử lý</option>
                        <option value="Hoàn thành">Hoàn thành</option>
                        <option value="Tạm dừng">Tạm dừng</option>
                        <option value="Hủy">Hủy</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Phê duyệt của Lãnh đạo:</label>
                      <select 
                        value={modalFormData.leaderApproval}
                        onChange={(e) => setModalFormData({ ...modalFormData, leaderApproval: e.target.value })}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#1F4E78]"
                      >
                        <option value="Chưa duyệt">Chưa duyệt</option>
                        <option value="Duyệt">Duyệt</option>
                        <option value="Cần bổ sung">Cần bổ sung</option>
                        <option value="Không duyệt">Không duyệt</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Đường dẫn minh chứng / sản phẩm (URL Drive/PDF):</label>
                    <input 
                      type="text"
                      value={modalFormData.evidence || ''}
                      onChange={(e) => setModalFormData({ ...modalFormData, evidence: e.target.value })}
                      placeholder="https://drive.google.com/..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ý kiến nhận xét / Ghi chú của Lãnh đạo:</label>
                    <input 
                      type="text"
                      value={modalFormData.leaderNote || ''}
                      onChange={(e) => setModalFormData({ ...modalFormData, leaderNote: e.target.value })}
                      placeholder="Nhận xét chất lượng, lý do yêu cầu bổ sung..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
                    />
                  </div>
                </>
              )}

              {selectedItem.type === 'ASSIGNMENT' && (
                <>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <div className="font-bold text-[#1F4E78]">{selectedItem.data.assignmentId}</div>
                    <div className="font-bold text-slate-900 text-base">{selectedItem.data.taskName}</div>
                    <div className="text-slate-600 text-xs">{selectedItem.data.detail}</div>
                    <div className="flex gap-4 pt-2 border-t border-slate-200 text-xs">
                      <div>Người giao: <b>{selectedItem.data.assigner?.name}</b></div>
                      <div>Người nhận: <b>{selectedItem.data.receiver?.name}</b></div>
                      <div>Hạn: <b>{selectedItem.data.deadline ? new Date(selectedItem.data.deadline).toLocaleDateString('vi-VN') : '-'}</b></div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cập nhật tiếp nhận nhiệm vụ:</label>
                    <select 
                      value={modalFormData.receiveStatus}
                      onChange={(e) => setModalFormData({ ...modalFormData, receiveStatus: e.target.value })}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#1F4E78]"
                    >
                      <option value="Chưa xem">Chưa xem</option>
                      <option value="Đã xem">Đã xem</option>
                      <option value="Đã nhận - đang triển khai">Đã nhận - đang triển khai</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ghi chú phản hồi của chuyên viên:</label>
                    <input 
                      type="text"
                      value={modalFormData.receiverNote || ''}
                      onChange={(e) => setModalFormData({ ...modalFormData, receiverNote: e.target.value })}
                      placeholder="Phản hồi tiến độ..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
                    />
                  </div>
                </>
              )}

              {selectedItem.type === 'OVERTIME' && (
                <>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[#1F4E78]">{selectedItem.data.otId}</span>
                      <span className="font-bold text-slate-700">Ngày: {selectedItem.data.otDate ? new Date(selectedItem.data.otDate).toLocaleDateString('vi-VN') : '-'}</span>
                    </div>
                    <div className="font-bold text-slate-900">{selectedItem.data.content}</div>
                    <div className="text-xs text-slate-600">Lý do: {selectedItem.data.reason}</div>
                    <div className="text-xs text-slate-500">Thời gian: {selectedItem.data.startTime} - {selectedItem.data.endTime} (Đăng ký {selectedItem.data.totalRegHours} giờ)</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Trạng thái phê duyệt:</label>
                      <select 
                        value={modalFormData.approvalStatus}
                        onChange={(e) => setModalFormData({ ...modalFormData, approvalStatus: e.target.value })}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#1F4E78]"
                      >
                        <option value="Chờ duyệt">Chờ duyệt</option>
                        <option value="Đã duyệt">Đã duyệt</option>
                        <option value="Cần bổ sung">Cần bổ sung</option>
                        <option value="Không duyệt">Không duyệt</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Số giờ được duyệt (h):</label>
                      <input 
                        type="number"
                        step="0.5"
                        value={modalFormData.approvedHours || '3.5'}
                        onChange={(e) => setModalFormData({ ...modalFormData, approvedHours: e.target.value })}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Kết quả thực tế đã thực hiện:</label>
                    <textarea 
                      value={modalFormData.actualResult || ''}
                      onChange={(e) => setModalFormData({ ...modalFormData, actualResult: e.target.value })}
                      placeholder="Mô tả sản phẩm, hồ sơ hoàn thành sau ca làm thêm..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Đường dẫn minh chứng sản phẩm làm thêm:</label>
                    <input 
                      type="text"
                      value={modalFormData.evidence || ''}
                      onChange={(e) => setModalFormData({ ...modalFormData, evidence: e.target.value })}
                      placeholder="https://drive.google.com/..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ý kiến người duyệt:</label>
                    <input 
                      type="text"
                      value={modalFormData.approverNote || ''}
                      onChange={(e) => setModalFormData({ ...modalFormData, approverNote: e.target.value })}
                      placeholder="Nhận xét phê duyệt..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
              <button 
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleSaveModal}
                disabled={isUpdating}
                className="flex items-center gap-2 px-5 py-2 bg-[#1F4E78] hover:bg-[#15385b] text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Lưu thay đổi</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
