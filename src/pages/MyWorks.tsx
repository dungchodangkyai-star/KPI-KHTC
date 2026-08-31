import React, { useState, useEffect } from 'react';
import { 
  Briefcase, Calendar, Search, Filter, CheckCircle2, Clock, 
  AlertCircle, ExternalLink, Edit3, Trash2, Plus, ArrowUpDown, 
  RefreshCw, Check, X, FileText, Download, Eye, AlertTriangle,
  Award, Layers, User, ChevronDown, CheckSquare, Square,
  Building, Hash, FileSpreadsheet, Sparkles, HelpCircle, ShieldCheck,
  Send, MessageSquare, ArrowRight, UserCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { 
  STANDARD_MONTHS, 
  WORK_NATURE_COEFS, 
  DEFAULT_TASK_GROUPS, 
  DEFAULT_PRODUCT_TYPES,
  formatDate,
  formatDateInput,
  formatMonth,
  isSoftDeleted,
  getActiveLoggedInUser,
  formatScore,
  getWorkSelfConvertedScore,
  getWorkApprovedConvertedScore,
  getWorkStatusFactor,
  getWorkNatureList,
  setGlobalWorkNatures,
  getNatureCoef,
  WorkNatureItem,
  safeFetch,
  safeParseResponse
} from '../utils';
import { Work, User as UserType } from '../types';

export default function MyWorks() {
  const [works, setWorks] = useState<Work[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [filterApproval, setFilterApproval] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState<'all' | 'assigned' | 'self'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [workNatures, setWorkNatures] = useState<WorkNatureItem[]>(getWorkNatureList());

  // Selected Row IDs for Batch Operations
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modal States
  const [viewingWork, setViewingWork] = useState<Work | null>(null);
  const [editingWork, setEditingWork] = useState<any | null>(null);
  const [deletingWork, setDeletingWork] = useState<Work | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAccepting, setIsAccepting] = useState<number | null>(null);

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const fetchWorks = async () => {
    setIsLoading(true);
    try {
      const [resW, resU, resA, resC] = await Promise.all([
        safeFetch('/api/works'),
        safeFetch('/api/users'),
        safeFetch('/api/assignments'),
        safeFetch('/api/categories')
      ]);
      const [dW, dU, dA, dC] = await Promise.all([
        safeParseResponse(resW),
        safeParseResponse(resU),
        safeParseResponse(resA),
        safeParseResponse(resC)
      ]);
      if (dW.success) setWorks(dW.data || []);
      if (dA.success) setAssignments(dA.data || []);
      if (dC.success && Array.isArray(dC.data)) {
        setGlobalWorkNatures(dC.data);
        const dynNatures = getWorkNatureList(dC.data);
        setWorkNatures(dynNatures);
      }
      if (dU.success && dU.data?.length > 0) {
        setUsers(dU.data);
        const active = getActiveLoggedInUser(dU.data);
        setCurrentUser(active);
      }
    } catch (e) {
      console.error("Fetch works error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorks();

    const handleUserChange = () => {
      if (users.length > 0) {
        const active = getActiveLoggedInUser(users);
        setCurrentUser(active);
      }
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, [users.length]);

  const handleAcceptAssignment = async (assignId: number) => {
    setIsAccepting(assignId);
    try {
      const res = await safeFetch(`/api/assignments/${assignId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id })
      });
      const d = await safeParseResponse(res);
      if (d.success) {
        alert("Đã tiếp nhận nhiệm vụ thành công! Nhiệm vụ đã được chuyển vào danh sách công việc cá nhân của bạn để triển khai và tính điểm KPI.");
        fetchWorks();
      } else {
        alert("Lỗi: " + (d.error || "Không thể tiếp nhận nhiệm vụ"));
      }
    } catch (e) {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setIsAccepting(null);
    }
  };

  const handleDeclineAssignment = async (assignId: number) => {
    const reason = prompt("Nhập lý do từ chối hoặc đề xuất điều chỉnh nhiệm vụ giao:");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Vui lòng nêu rõ lý do để Lãnh đạo nắm được thông tin 2 chiều.");
      return;
    }

    try {
      const res = await safeFetch(`/api/assignments/${assignId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ declineReason: reason.trim(), userId: currentUser?.id })
      });
      const d = await safeParseResponse(res);
      if (d.success) {
        alert("Đã gửi phản hồi từ chối nhiệm vụ đến Lãnh đạo giao việc.");
        fetchWorks();
      } else {
        alert("Lỗi: " + (d.error || "Không thể gửi phản hồi"));
      }
    } catch (e) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  // Pending assignments for the current logged-in user
  const myPendingAssignments = assignments.filter(a => 
    currentUser && 
    a.receiverId === currentUser.id && 
    (!a.receiveStatus || a.receiveStatus.includes('Chưa') || a.receiveStatus.includes('Chờ'))
  );

  // Filtered Works List - STRICTLY FOR THE LOGGED-IN USER ONLY
  const filteredWorks = works.filter(w => {
    if (isSoftDeleted(w)) return false;
    
    // User filter: strictly current logged in user
    if (currentUser && w.userId !== currentUser.id) return false;

    // Month filter
    if (selectedMonth !== 'Tất cả' && formatMonth(w.month) !== selectedMonth) return false;
    
    // Source filter (all / assigned / self)
    if (filterSource === 'assigned' && !w.assignmentId && w.source !== 'Giao việc') return false;
    if (filterSource === 'self' && (w.assignmentId || w.source === 'Giao việc')) return false;

    // Group filter
    if (selectedGroup !== 'all' && w.taskGroup !== selectedGroup) return false;
    
    // Approval status filter
    if (filterApproval !== 'all') {
      const appr = String(w.leaderApproval || 'Chưa duyệt').trim();
      if (filterApproval === 'Đã duyệt' && appr !== 'Duyệt') return false;
      if (filterApproval === 'Chưa duyệt' && (appr === 'Duyệt' || appr === 'Cần bổ sung' || appr === 'Không duyệt')) return false;
      if (filterApproval === 'Cần bổ sung' && appr !== 'Cần bổ sung') return false;
      if (filterApproval === 'Không duyệt' && appr !== 'Không duyệt') return false;
    }
    
    // Progress status filter
    if (filterStatus !== 'all') {
      const st = String(w.status || 'Đang xử lý').trim();
      if (filterStatus === 'Hoàn thành' && st !== 'Hoàn thành') return false;
      if (filterStatus === 'Đang xử lý' && st !== 'Đang xử lý') return false;
      if (filterStatus === 'Chậm' && st !== 'Chậm') return false;
      if (filterStatus === 'Không hoàn thành' && st !== 'Không hoàn thành') return false;
    }
    
    // Full-text keyword search
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      const matchName = (w.taskName || '').toLowerCase().includes(kw);
      const matchCode = (w.taskCode || '').toLowerCase().includes(kw);
      const matchGroup = (w.taskGroup || '').toLowerCase().includes(kw);
      const matchDetail = (w.detail || '').toLowerCase().includes(kw);
      const matchProject = (w.project || '').toLowerCase().includes(kw);
      const matchRelated = (w.relatedUnit || '').toLowerCase().includes(kw);
      if (!matchName && !matchCode && !matchGroup && !matchDetail && !matchProject && !matchRelated) {
        return false;
      }
    }
    return true;
  });

  // KPI & Summary Metric calculations
  const totalRegistered = filteredWorks.length;
  const approvedWorks = filteredWorks.filter(w => w.leaderApproval === 'Duyệt');
  const totalApproved = approvedWorks.length;
  const totalPending = filteredWorks.filter(w => String(w.leaderApproval || 'Chưa duyệt') === 'Chưa duyệt').length;
  const totalSupplement = filteredWorks.filter(w => w.leaderApproval === 'Cần bổ sung').length;
  const totalRejected = filteredWorks.filter(w => w.leaderApproval === 'Không duyệt').length;
  const totalDelayed = filteredWorks.filter(w => w.status === 'Chậm').length;
  const approvalRate = totalRegistered > 0 ? Math.round((totalApproved / totalRegistered) * 100) : 0;
  
  const totalHours = filteredWorks.reduce((sum, w) => sum + (parseFloat(w.hours || '0') || 0), 0);
  const totalConvertedScore = approvedWorks.reduce((sum, w) => sum + getWorkApprovedConvertedScore(w), 0);

  // Modal Open Handlers
  const handleOpenView = (w: Work) => {
    setViewingWork(w);
  };

  const handleOpenEdit = (w: Work) => {
    const nature = w.proposedNature || (workNatures[0]?.name || 'Trung bình');
    const coef = w.coef || String(getNatureCoef(nature));
    const base = w.baseScore || '10';
    const baseNum = parseFloat(base) || 10;
    const coefNum = parseFloat(coef) || 0.8;
    const factor = getWorkStatusFactor(w.status || 'Đang xử lý');
    const computedSelfScore = String(Math.round(baseNum * coefNum * factor * 10) / 10);
    const selfScore = (w.selfConvertedScore !== undefined && w.selfConvertedScore !== null && String(w.selfConvertedScore).trim() !== '')
      ? String(w.selfConvertedScore)
      : computedSelfScore;

    setEditingWork({
      ...w,
      proposedNature: nature,
      coef,
      baseScore: base,
      selfConvertedScore: selfScore,
      convertedScore: selfScore,
      startDate: w.startDate ? formatDateInput(w.startDate) : '',
      endDate: w.endDate ? formatDateInput(w.endDate) : '',
      actualEndDate: w.actualEndDate ? formatDateInput(w.actualEndDate) : '',
      hours: w.hours || '8',
      days: w.days || 1,
      editNote: ''
    });
  };

  // Recompute converted score in edit modal
  const handleEditFieldChange = (field: string, value: any) => {
    const updated = { ...editingWork, [field]: value };
    
    // If nature changed, update coef
    if (field === 'proposedNature') {
      const coef = getNatureCoef(value);
      updated.coef = String(coef);
    }

    // 1. Recompute selfConvertedScore: Điểm chuẩn × Hệ số tính chất × Hệ số tiến độ
    const base = parseFloat(updated.baseScore || '10') || 10;
    const coef = parseFloat(updated.coef || '0.8') || 0.8;
    const factor = getWorkStatusFactor(updated.status);

    const computed = String(Math.round(base * coef * factor * 10) / 10);
    updated.selfConvertedScore = computed;
    updated.convertedScore = computed;
    setEditingWork(updated);
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingWork) return;
    setIsUpdating(true);
    try {
      const originalWork = works.find(w => w.id === editingWork.id);
      const isApprovedBefore = originalWork?.leaderApproval === 'Duyệt';
      
      // Kiểm tra các trường thực sự ảnh hưởng KPI: baseScore, coef, proposedNature, status, month, userId
      const isKpiFieldModified = originalWork && (
        String(editingWork.baseScore || '') !== String(originalWork.baseScore || '') ||
        String(editingWork.coef || '') !== String(originalWork.coef || '') ||
        String(editingWork.proposedNature || '') !== String(originalWork.proposedNature || '') ||
        String(editingWork.status || '') !== String(originalWork.status || '') ||
        String(editingWork.month || '') !== String(originalWork.month || '') ||
        Number(editingWork.userId || 0) !== Number(originalWork.userId || 0)
      );

      const payload: any = {
        ...editingWork,
        selfConvertedScore: editingWork.selfConvertedScore,
        convertedScore: editingWork.selfConvertedScore
      };

      // Chỉ chuyển về Chưa duyệt nếu thay đổi trường thực sự ảnh hưởng KPI
      if (isApprovedBefore && isKpiFieldModified) {
        payload.leaderApproval = 'Chưa duyệt';
        payload.approvedConvertedScore = null;
        payload.approvalDate = null;
        payload.approverId = null;
        const noteSuffix = 'Đã sửa sau duyệt - chuyển về Chưa duyệt để thẩm định lại';
        payload.editNote = payload.editNote?.trim() 
          ? `${payload.editNote.trim()} (${noteSuffix})` 
          : noteSuffix;
      }

      const res = await safeFetch(`/api/works/${editingWork.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await safeParseResponse(res);
      if (data.success) {
        setWorks(works.map(w => w.id === editingWork.id ? { ...w, ...data.data } : w));
        setEditingWork(null);
        if (isApprovedBefore && isKpiFieldModified) {
          alert("Công việc đã được cập nhật và tự động chuyển về trạng thái 'Chưa duyệt' do thay đổi các trường ảnh hưởng KPI.");
        } else {
          alert("Công việc đã được cập nhật thành công!");
        }
      } else {
        alert("Lỗi khi cập nhật công việc: " + (data.error || "Không xác định"));
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối tới máy chủ khi cập nhật công việc");
    } finally {
      setIsUpdating(false);
    }
  };

  // Confirm and execute soft delete
  const handleConfirmDelete = async () => {
    if (!deletingWork) return;
    if (deletingWork.leaderApproval === 'Duyệt') {
      alert("Công việc đã được Lãnh đạo phê duyệt! Nhân viên không thể tự xóa công việc đã duyệt. Vui lòng liên hệ Lãnh đạo phòng xử lý.");
      setDeletingWork(null);
      return;
    }
    try {
      const res = await safeFetch(`/api/works/${deletingWork.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason })
      });
      const data = await safeParseResponse(res);
      if (data.success) {
        setWorks(works.filter(w => w.id !== deletingWork.id));
        setDeletingWork(null);
        setDeleteReason("");
      } else {
        alert("Lỗi khi xóa công việc: " + (data.error || "Không thể xóa"));
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối tới máy chủ");
    }
  };

  // Selection toggle
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredWorks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredWorks.map(w => w.id));
    }
  };

  const toggleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredWorks.length === 0) {
      alert("Không có dữ liệu để xuất!");
      return;
    }
    const headers = [
      "STT", "Mã việc", "Tháng", "Nhân viên", "Email", "Vị trí", "Nhóm công việc",
      "Tên nhiệm vụ", "Nội dung chi tiết", "Ngày bắt đầu", "Giờ BĐ", "Ngày kết thúc",
      "Giờ KT", "Ngày hoàn thành thực tế", "Số ngày", "Tổng giờ", "Tính chất đề xuất",
      "Hệ số", "Điểm chuẩn", "Điểm quy đổi", "Trạng thái", "Minh chứng", "Loại sản phẩm",
      "Số lượng", "Đơn vị tính", "Dự án/Gói thầu", "Đơn vị liên quan", "Lý do chậm",
      "Miễn phạt", "Lãnh đạo duyệt", "Ghi chú lãnh đạo"
    ];

    const rows = filteredWorks.map((w, idx) => [
      idx + 1,
      `"${w.taskCode || ''}"`,
      `"${w.month || ''}"`,
      `"${w.user?.name || ''}"`,
      `"${w.user?.email || ''}"`,
      `"${w.user?.position || ''}"`,
      `"${w.taskGroup || ''}"`,
      `"${(w.taskName || '').replace(/"/g, '""')}"`,
      `"${(w.detail || '').replace(/"/g, '""')}"`,
      `"${w.startDate ? formatDate(w.startDate) : ''}"`,
      `"${w.startTime || ''}"`,
      `"${w.endDate ? formatDate(w.endDate) : ''}"`,
      `"${w.endTime || ''}"`,
      `"${w.actualEndDate ? formatDate(w.actualEndDate) : ''}"`,
      w.days || 1,
      w.hours || 8,
      `"${w.proposedNature || ''}"`,
      w.coef || 0.8,
      w.baseScore || 10,
      w.convertedScore || 8,
      `"${w.status || ''}"`,
      `"${w.evidence || ''}"`,
      `"${w.productType || ''}"`,
      w.productQty || 1,
      `"${w.unit || ''}"`,
      `"${(w.project || '').replace(/"/g, '""')}"`,
      `"${(w.relatedUnit || '').replace(/"/g, '""')}"`,
      `"${(w.lateReason || '').replace(/"/g, '""')}"`,
      `"${w.penaltyExemption || 'Không'}"`,
      `"${w.leaderApproval || 'Chưa duyệt'}"`,
      `"${(w.leaderNote || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `KH_Cong_viec_${selectedMonth}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1400px] mx-auto pb-16 px-2 sm:px-4">
      {/* Top Page Header */}
      <div className="bg-white border border-slate-300 p-5 rounded-2xl shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/80 text-[#1F4E78] text-xs font-black mb-2 border border-blue-200">
            <Briefcase className="w-3.5 h-3.5" />
            <span>SỔ TAY CÔNG VIỆC CÁ NHÂN</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0f2440] tracking-tight">
            Công việc của tôi
          </h2>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Tra cứu toàn bộ công việc đã đăng ký, cập nhật tiến độ, minh chứng và theo dõi kết quả duyệt của Lãnh đạo phòng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={fetchWorks}
            className="p-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xl shadow-2xs transition-colors"
            title="Tải lại dữ liệu mới nhất"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-black rounded-xl text-xs shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Xuất Excel / CSV</span>
          </button>

          <Link
            to="/input"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1F4E78] hover:bg-[#15385b] text-white font-black rounded-xl text-xs shadow-md transition-all active:scale-95 border border-blue-900"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm công việc mới</span>
          </Link>
        </div>
      </div>

      {/* Top Alert Banner for Pending Assignments */}
      {myPendingAssignments.length > 0 && (
        <div className="mb-6 bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-600 text-white rounded-xl shadow-2xs shrink-0 animate-bounce">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-amber-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Thông báo khẩn
                  </span>
                  <h3 className="font-black text-amber-950 text-base">
                    Bạn có {myPendingAssignments.length} nhiệm vụ được Lãnh đạo giao cần tiếp nhận
                  </h3>
                </div>
                <p className="text-xs text-amber-900 mt-1 font-bold">
                  Vui lòng kiểm tra nội dung phân công, hạn hoàn thành và nhấn nút <b>"Tiếp nhận việc"</b> để tự động đồng bộ vào danh sách công việc và tính điểm KPI.
                </p>
              </div>
            </div>
            <div className="text-xs font-black text-amber-900 bg-white px-3 py-1.5 rounded-xl border border-amber-300 shadow-2xs">
              {myPendingAssignments.length} việc đang chờ phản hồi
            </div>
          </div>

          {/* Pending Tasks Cards Grid */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {myPendingAssignments.map((a: any) => (
              <div key={a.id} className="bg-white border border-amber-300 rounded-xl p-3.5 shadow-2xs hover:shadow transition space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {a.taskCode && (
                      <span className="bg-[#1F4E78] text-white text-[10px] font-black px-1.5 py-0.5 rounded">
                        {a.taskCode}
                      </span>
                    )}
                    <span className="text-[11px] font-black text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {a.taskGroup}
                    </span>
                    <span className="text-[10px] font-black bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded">
                      {a.priority || 'Bình thường'}
                    </span>
                  </div>
                  <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                    Chờ nhận
                  </span>
                </div>

                <div className="font-black text-slate-900 text-sm">{a.taskName}</div>
                {a.detail && (
                  <div className="text-[11px] text-slate-700 font-medium bg-slate-50 p-2 rounded-lg border border-slate-200">
                    {a.detail}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-700 pt-1 border-t border-slate-200">
                  <div>
                    <span className="text-slate-500 font-bold">Hạn chót:</span>{' '}
                    <b className="text-slate-900">{a.deadline ? formatDate(a.deadline) : '-'}</b>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold">Điểm dự kiến:</span>{' '}
                    <b className="text-[#1F4E78] font-black">{a.expectedConvertedScore || 10} đ</b>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold">Sản phẩm yêu cầu:</span>{' '}
                    <b className="text-slate-900">{a.productRequired || 'Báo cáo / Hồ sơ'}</b>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold">Thời gian ước tính:</span>{' '}
                    <b className="text-slate-900">{a.hours || 8}h ({a.days || 1} ngày)</b>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => handleDeclineAssignment(a.id)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition border border-slate-300 shadow-2xs"
                  >
                    Từ chối / Đề xuất
                  </button>
                  <button
                    onClick={() => handleAcceptAssignment(a.id)}
                    disabled={isAccepting === a.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-xs shadow-2xs transition active:scale-95 disabled:opacity-50 border border-emerald-700"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{isAccepting === a.id ? 'Đang nhận...' : 'Tiếp nhận việc ngay'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI & Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-black text-slate-600 uppercase">Tổng việc</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalRegistered}</div>
          <span className="text-[10px] text-slate-500 font-bold">Trong kỳ chọn</span>
        </div>

        <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-sm flex flex-col justify-between border-l-4 border-l-emerald-600">
          <span className="text-[11px] font-black text-emerald-800 uppercase flex items-center justify-between">
            <span>Đã duyệt</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </span>
          <div className="text-2xl font-black text-emerald-800 mt-1">{totalApproved}</div>
          <span className="text-[10px] text-emerald-700 font-black">{approvalRate}% tỷ lệ duyệt</span>
        </div>

        <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-sm flex flex-col justify-between border-l-4 border-l-amber-500">
          <span className="text-[11px] font-black text-amber-800 uppercase flex items-center justify-between">
            <span>Chờ duyệt</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </span>
          <div className="text-2xl font-black text-amber-800 mt-1">{totalPending}</div>
          <span className="text-[10px] text-amber-700 font-bold">Đang chờ lãnh đạo</span>
        </div>

        <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-sm flex flex-col justify-between border-l-4 border-l-rose-600">
          <span className="text-[11px] font-black text-rose-800 uppercase flex items-center justify-between">
            <span>Bổ sung / Từ chối</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </span>
          <div className="text-2xl font-black text-rose-800 mt-1">{totalSupplement + totalRejected}</div>
          <span className="text-[10px] text-rose-700 font-bold">BS: {totalSupplement} | Từ chối: {totalRejected}</span>
        </div>

        <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-black text-slate-600 uppercase">Tổng giờ làm</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalHours}h</div>
          <span className="text-[10px] text-slate-500 font-bold">{Math.round(totalHours / 8)} ngày công</span>
        </div>

        <div className="bg-gradient-to-br from-[#1F4E78] to-[#15385b] text-white p-4 rounded-2xl shadow-sm flex flex-col justify-between border border-blue-900">
          <span className="text-[11px] font-black text-blue-100 uppercase flex items-center justify-between">
            <span>Điểm quy đổi (QĐ)</span>
            <Award className="w-4 h-4 text-amber-300" />
          </span>
          <div className="text-2xl font-black text-white mt-1">{formatScore(totalConvertedScore)}</div>
          <span className="text-[10px] text-blue-200 font-bold">Từ các việc đã duyệt</span>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm mb-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Month Selector */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">Tháng công tác</label>
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-[#1F4E78] shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent w-full text-xs font-black text-[#1F4E78] outline-none cursor-pointer"
              >
                <option value="Tất cả">Tất cả các tháng</option>
                {STANDARD_MONTHS.map(m => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Personal User Identity */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">Cá nhân thực hiện</label>
            <div className="flex items-center gap-2.5 bg-blue-50/80 border border-blue-300 px-3 py-1.5 rounded-xl shadow-2xs">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#17466e] to-[#2f75b5] text-white flex items-center justify-center text-[11px] font-black shrink-0 shadow-2xs">
                {getInitials(currentUser?.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-[#1F4E78] truncate" title={currentUser?.name}>
                  {currentUser?.name || 'Đang xác thực...'}
                </div>
                <div className="text-[10px] text-slate-600 font-bold truncate">
                  {currentUser?.position || 'Chuyên viên'}
                </div>
              </div>
            </div>
          </div>

          {/* Group Selector */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">Nhóm công việc</label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none shadow-2xs"
            >
              <option value="all">Tất cả nhóm việc</option>
              {DEFAULT_TASK_GROUPS.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Approval Status Selector */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">Trạng thái duyệt</label>
            <select
              value={filterApproval}
              onChange={(e) => setFilterApproval(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none shadow-2xs"
            >
              <option value="all">Tất cả trạng thái duyệt</option>
              <option value="Đã duyệt">Đã duyệt (Duyệt)</option>
              <option value="Chưa duyệt">Chưa duyệt (Đang chờ)</option>
              <option value="Cần bổ sung">Cần bổ sung hồ sơ</option>
              <option value="Không duyệt">Không duyệt</option>
            </select>
          </div>

          {/* Work Progress Status Selector */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">Tiến độ công việc</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none shadow-2xs"
            >
              <option value="all">Tất cả tiến độ</option>
              <option value="Đang xử lý">Đang xử lý</option>
              <option value="Hoàn thành">Hoàn thành</option>
              <option value="Chậm">Chậm tiến độ</option>
              <option value="Không hoàn thành">Không hoàn thành</option>
            </select>
          </div>
        </div>

        {/* Search input and source tabs */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Quick Source Tabs */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-300 shadow-2xs">
              <button
                onClick={() => setFilterSource('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  filterSource === 'all' 
                    ? 'bg-[#1F4E78] text-white shadow-2xs' 
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Tất cả nguồn ({works.filter(w => !isSoftDeleted(w) && (!currentUser || w.userId === currentUser.id)).length})
              </button>
              <button
                onClick={() => setFilterSource('assigned')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  filterSource === 'assigned' 
                    ? 'bg-indigo-700 text-white shadow-2xs' 
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Send className="w-3 h-3" />
                <span>Việc được giao ({works.filter(w => !isSoftDeleted(w) && (!currentUser || w.userId === currentUser.id) && (w.assignmentId || w.source === 'Giao việc')).length})</span>
              </button>
              <button
                onClick={() => setFilterSource('self')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  filterSource === 'self' 
                    ? 'bg-[#1F4E78] text-white shadow-2xs' 
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Việc tự lập ({works.filter(w => !isSoftDeleted(w) && (!currentUser || w.userId === currentUser.id) && !w.assignmentId && w.source !== 'Giao việc').length})
              </button>
            </div>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm theo tên nhiệm vụ, mã việc, dự án, nội dung..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#1F4E78] text-white border-b-2 border-slate-300 uppercase tracking-wider font-black">
                <th className="py-3 px-3 text-center w-10">
                  <button onClick={toggleSelectAll} className="p-0.5 hover:text-slate-200">
                    {selectedIds.length === filteredWorks.length && filteredWorks.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-white" />
                    ) : (
                      <Square className="w-4 h-4 text-blue-200" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-3 text-center w-12 border-l border-blue-900">STT</th>
                <th className="py-3 px-3 text-center min-w-[80px] border-l border-blue-900">Tháng</th>
                <th className="py-3 px-3 min-w-[280px] border-l border-blue-900">Mã việc & Tên nhiệm vụ</th>
                <th className="py-3 px-3 min-w-[170px] border-l border-blue-900">Nội dung & Minh chứng</th>
                <th className="py-3 px-3 text-center min-w-[130px] border-l border-blue-900">Thời gian</th>
                <th className="py-3 px-3 text-center min-w-[110px] border-l border-blue-900">Sản phẩm</th>
                <th className="py-3 px-3 text-center min-w-[110px] border-l border-blue-900">Tính chất & Điểm</th>
                <th className="py-3 px-3 text-center min-w-[120px] border-l border-blue-900">Tiến độ & Trạng thái</th>
                <th className="py-3 px-3 text-center min-w-[120px] border-l border-blue-900">Lãnh đạo duyệt</th>
                <th className="py-3 px-3 text-center min-w-[100px] border-l border-blue-900">Thao tác</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-300 font-medium text-slate-800">
              {filteredWorks.map((w, idx) => {
                const isSelected = selectedIds.includes(w.id);
                // Sanitize task code from showing email address
                const cleanCode = w.taskCode && !w.taskCode.includes('@') && !w.taskCode.toLowerCase().includes('.com') ? w.taskCode : null;
                return (
                  <tr key={w.id} className={`hover:bg-blue-50/40 transition-colors ${isSelected ? 'bg-blue-50/60' : ''}`}>
                    {/* Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(w.id)}
                        className="rounded text-[#1F4E78] focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* STT */}
                    <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>

                    {/* Tháng */}
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 bg-slate-100 text-[#1F4E78] font-black rounded-lg text-[11px]">
                        {formatMonth(w.month)}
                      </span>
                    </td>

                    {/* Tên việc & Nhóm việc */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        {cleanCode && (
                          <span className="px-1.5 py-0.5 bg-[#1F4E78] text-white font-black rounded text-[10px] tracking-wide">
                            {cleanCode}
                          </span>
                        )}
                        {(w.assignmentId || w.source === 'Giao việc') ? (
                          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 rounded text-[10px] flex items-center gap-1">
                            <Send className="w-2.5 h-2.5" />
                            <span>Lãnh đạo giao</span>
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 font-medium rounded text-[10px]">
                            Tự lập
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-slate-500">
                          {w.taskGroup}
                        </span>
                      </div>
                      <div className="font-bold text-slate-900 leading-snug">{w.taskName}</div>
                      {w.project && (
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                          <Building className="w-2.5 h-2.5 text-slate-400" />
                          <span className="line-clamp-1">{w.project}</span>
                        </div>
                      )}
                    </td>

                    {/* Nội dung chi tiết & Minh chứng */}
                    <td className="py-3 px-3">
                      {w.detail ? (
                        <div className="text-slate-700 line-clamp-2 text-[11px]">{w.detail}</div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Chưa nhập nội dung chi tiết</span>
                      )}

                      {w.evidence ? (
                        <a 
                          href={w.evidence.startsWith('http') ? w.evidence : `https://${w.evidence}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-bold hover:underline mt-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="truncate max-w-[120px]">Xem minh chứng</span>
                        </a>
                      ) : (
                        <div className="text-[10px] text-amber-600 font-semibold mt-1">
                          Chưa có minh chứng
                        </div>
                      )}
                    </td>

                    {/* Thời gian */}
                    <td className="py-3 px-3 text-center">
                      <div className="font-semibold text-slate-800 text-[11px]">
                        {w.startDate ? formatDate(w.startDate) : '-'} → {w.endDate ? formatDate(w.endDate) : '-'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {w.hours || 8} giờ ({w.days || 1} ngày)
                      </div>
                      {w.actualEndDate && (
                        <div className="text-[10px] text-emerald-700 font-semibold">
                          Thực tế: {formatDate(w.actualEndDate)}
                        </div>
                      )}
                    </td>

                    {/* Sản phẩm */}
                    <td className="py-3 px-3 text-center">
                      <div className="font-bold text-slate-800">
                        {w.productQty || 1} {w.unit || 'SP'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {w.productType || 'Báo cáo'}
                      </div>
                    </td>

                    {/* Tính chất & Điểm */}
                    <td className="py-3 px-3 text-center">
                      <div className="inline-block px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-bold text-[10px] mb-0.5">
                        {w.proposedNature || 'Trung bình'} (K={formatScore(w.coef)})
                      </div>
                      <div className="text-xs font-black text-[#1F4E78]">
                        QĐ: {formatScore(getWorkSelfConvertedScore(w))} <span className="text-[10px] font-normal text-slate-400">(Đc: {formatScore(w.baseScore)})</span>
                      </div>
                    </td>

                    {/* Tiến độ */}
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full font-black text-[10px] shadow-2xs ${
                        w.status === 'Hoàn thành' ? 'bg-emerald-100 text-emerald-800' :
                        w.status === 'Chậm' ? 'bg-rose-100 text-rose-800' :
                        w.status === 'Không hoàn thành' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {w.status || 'Đang xử lý'}
                      </span>
                      {w.lateReason && (
                        <div className="text-[10px] text-rose-600 font-medium mt-0.5 line-clamp-1" title={w.lateReason}>
                          {w.lateReason}
                        </div>
                      )}
                    </td>

                    {/* Duyệt lãnh đạo */}
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full font-black text-[10px] shadow-2xs ${
                        w.leaderApproval === 'Duyệt' ? 'bg-emerald-100 text-emerald-800' :
                        w.leaderApproval === 'Cần bổ sung' ? 'bg-amber-100 text-amber-800' :
                        w.leaderApproval === 'Không duyệt' ? 'bg-red-100 text-red-800' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {w.leaderApproval || 'Chưa duyệt'}
                      </span>
                      {w.leaderNote && (
                        <div className="text-[10px] text-slate-600 font-medium mt-1 line-clamp-1 bg-slate-50 p-1 rounded border border-slate-200" title={w.leaderNote}>
                          {w.leaderNote}
                        </div>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          onClick={() => handleOpenView(w)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Xem chi tiết đầy đủ"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleOpenEdit(w)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Cập nhật tiến độ / Sửa"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => {
                            if (w.leaderApproval === 'Duyệt') {
                              alert("Công việc này đã được Lãnh đạo phê duyệt chính thức. Bạn không thể tự xóa công việc đã duyệt. Vui lòng liên hệ Lãnh đạo phòng xử lý hoặc chuyển công việc về luồng chờ duyệt.");
                              return;
                            }
                            setDeletingWork(w);
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            w.leaderApproval === 'Duyệt' 
                              ? 'text-slate-300 hover:text-slate-400 hover:bg-slate-100 cursor-not-allowed' 
                              : 'text-red-600 hover:bg-red-100'
                          }`}
                          title={w.leaderApproval === 'Duyệt' ? "Công việc đã duyệt (Không thể tự xóa)" : "Xóa công việc"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredWorks.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <FileText className="w-10 h-10 text-slate-300 stroke-[1.5]" />
                      <div>
                        <div className="text-sm font-bold text-slate-700">Không tìm thấy công việc phù hợp</div>
                        <p className="text-xs text-slate-400 mt-1">Hãy thử thay đổi điều kiện lọc tháng, nhân sự hoặc bấm Thêm công việc mới.</p>
                      </div>
                      <Link
                        to="/input"
                        className="mt-2 px-4 py-2 bg-[#1F4E78] text-white text-xs font-bold rounded-xl shadow-xs"
                      >
                        Đăng ký công việc mới ngay
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* VIEW DETAILS MODAL */}
      {viewingWork && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-[#1F4E78] text-white rounded text-[10px] font-black">
                    {viewingWork.taskCode || 'KH'}
                  </span>
                  <span className="text-xs font-bold text-[#1F4E78]">{viewingWork.month}</span>
                </div>
                <h3 className="font-black text-slate-900 text-lg sm:text-xl mt-1">
                  {viewingWork.taskName}
                </h3>
              </div>

              <button 
                onClick={() => setViewingWork(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 text-xs text-slate-700">
              {/* Box 1: Personnel & Group */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Người thực hiện</span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{viewingWork.user?.name || viewingWork.userId}</div>
                  <div className="text-[11px] text-slate-500">{viewingWork.user?.position || 'Chuyên viên'}</div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Nhóm công việc</span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{viewingWork.taskGroup}</div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Trạng thái duyệt</span>
                  <div className="mt-1">
                    <span className={`px-2.5 py-1 rounded-full font-black text-xs ${
                      viewingWork.leaderApproval === 'Duyệt' ? 'bg-emerald-100 text-emerald-800' :
                      viewingWork.leaderApproval === 'Cần bổ sung' ? 'bg-amber-100 text-amber-800' :
                      viewingWork.leaderApproval === 'Không duyệt' ? 'bg-red-100 text-red-800' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {viewingWork.leaderApproval || 'Chưa duyệt'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 2: Detail */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Nội dung chi tiết</span>
                <div className="mt-1.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 leading-relaxed font-medium">
                  {viewingWork.detail || 'Không có mô tả chi tiết.'}
                </div>
              </div>

              {/* Box 3: Time & Scoring */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Thời gian</span>
                  <div className="font-bold text-slate-900 mt-1">{viewingWork.startDate ? formatDate(viewingWork.startDate) : '-'} → {viewingWork.endDate ? formatDate(viewingWork.endDate) : '-'}</div>
                  <div className="text-[10px] text-slate-500">{viewingWork.hours || 8}h ({viewingWork.days || 1} ngày)</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Tính chất (K)</span>
                  <div className="font-bold text-slate-900 mt-1">{viewingWork.proposedNature || 'Trung bình'}</div>
                  <div className="text-[10px] text-slate-500">Hệ số: {formatScore(viewingWork.coef)}</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Điểm chuẩn (Đc)</span>
                  <div className="font-bold text-slate-900 text-base mt-0.5">{formatScore(viewingWork.baseScore)}</div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Điểm quy đổi (QĐ)</span>
                  <div className="font-black text-emerald-800 text-lg mt-0.5">{formatScore(viewingWork.convertedScore)}</div>
                </div>
              </div>

              {/* Box 4: Product & Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Sản phẩm đầu ra</span>
                  <div className="font-bold text-slate-900">{viewingWork.productQty || 1} {viewingWork.unit || 'Sản phẩm'} - {viewingWork.productType}</div>
                  {viewingWork.project && (
                    <div className="text-[11px] text-slate-600">Dự án: <b>{viewingWork.project}</b></div>
                  )}
                  {viewingWork.relatedUnit && (
                    <div className="text-[11px] text-slate-600">Đơn vị liên quan: <b>{viewingWork.relatedUnit}</b></div>
                  )}
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Minh chứng & Ý kiến lãnh đạo</span>
                  {viewingWork.evidence ? (
                    <div>
                      <a 
                        href={viewingWork.evidence.startsWith('http') ? viewingWork.evidence : `https://${viewingWork.evidence}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-blue-600 font-bold hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="break-all">{viewingWork.evidence}</span>
                      </a>
                    </div>
                  ) : (
                    <div className="text-amber-600 font-medium">Chưa cung cấp đường dẫn minh chứng</div>
                  )}

                  {viewingWork.leaderNote && (
                    <div className="mt-2 p-2 bg-white rounded border border-slate-200 text-slate-700">
                      <b>Nhận xét của lãnh đạo:</b> {viewingWork.leaderNote}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setViewingWork(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Đóng
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const target = viewingWork;
                  setViewingWork(null);
                  handleOpenEdit(target);
                }}
                className="px-5 py-2.5 bg-[#1F4E78] hover:bg-[#15385b] text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Chỉnh sửa công việc này</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL WITH ALL COMPREHENSIVE FIELDS */}
      {editingWork && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-bold text-[#1F4E78] uppercase tracking-wider">Cập nhật công việc</span>
                <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-[#1F4E78]" />
                  <span>{editingWork.taskName || 'Chỉnh sửa công việc'}</span>
                </h3>
              </div>
              <button 
                onClick={() => setEditingWork(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Cảnh báo khi sửa công việc đã duyệt */}
              {editingWork.leaderApproval === 'Duyệt' && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-start gap-2.5 text-amber-900 shadow-2xs">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <div className="font-black text-amber-950">Lưu ý quan trọng: Công việc đã được Lãnh đạo phê duyệt</div>
                    <p className="mt-0.5 text-slate-700">
                      Khi bạn lưu các thay đổi về điểm chuẩn, tính chất, tiến độ hoặc nội dung công việc, hệ thống sẽ <b>tự động chuyển về trạng thái 'Chưa duyệt'</b>, xóa điểm duyệt cũ ({formatScore(editingWork.approvedConvertedScore || editingWork.convertedScore)} đ) và đưa vào luồng chờ Lãnh đạo thẩm định lại.
                    </p>
                  </div>
                </div>
              )}

              {/* Task Name & Code */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-700 mb-1">Tên nhiệm vụ / Công việc <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={editingWork.taskName || ''} 
                    onChange={(e) => handleEditFieldChange('taskName', e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-[#1F4E78]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mã việc</label>
                  <input 
                    type="text" 
                    value={editingWork.taskCode || ''} 
                    onChange={(e) => handleEditFieldChange('taskCode', e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none uppercase"
                  />
                </div>
              </div>

              {/* Progress & Nature */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tiến độ thực hiện</label>
                  <select
                    value={editingWork.status || 'Đang xử lý'}
                    onChange={(e) => handleEditFieldChange('status', e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="Đang xử lý">Đang xử lý (0.7)</option>
                    <option value="Hoàn thành">Hoàn thành (1.0)</option>
                    <option value="Chậm">Chậm tiến độ (0.5)</option>
                    <option value="Không hoàn thành">Không hoàn thành (0.0)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tính chất NV đề xuất</label>
                  <select
                    value={editingWork.proposedNature || (workNatures[0]?.name || 'Trung bình')}
                    onChange={(e) => handleEditFieldChange('proposedNature', e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    {workNatures.map(nat => (
                      <option key={nat.code || nat.name} value={nat.name}>
                        {nat.name} ({formatScore(nat.coef)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Điểm chuẩn (Đc)</label>
                  <input 
                    type="number"
                    step="0.5"
                    value={editingWork.baseScore || '10'}
                    onChange={(e) => handleEditFieldChange('baseScore', e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-center"
                  />
                </div>

                <div>
                  <label className="block font-bold text-emerald-800 mb-1">Điểm quy đổi (QĐ)</label>
                  <input 
                    type="text"
                    readOnly
                    value={editingWork.convertedScore || '8'}
                    className="w-full p-2 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-black text-emerald-800 text-center cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Dates & Times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày bắt đầu</label>
                  <input 
                    type="date"
                    value={editingWork.startDate || ''}
                    onChange={(e) => handleEditFieldChange('startDate', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hạn kết thúc</label>
                  <input 
                    type="date"
                    value={editingWork.endDate || ''}
                    onChange={(e) => handleEditFieldChange('endDate', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày HT thực tế</label>
                  <input 
                    type="date"
                    value={editingWork.actualEndDate || ''}
                    onChange={(e) => handleEditFieldChange('actualEndDate', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tổng giờ / Ngày</label>
                  <div className="flex gap-1.5">
                    <input 
                      type="number"
                      step="0.5"
                      value={editingWork.hours || '8'}
                      onChange={(e) => handleEditFieldChange('hours', e.target.value)}
                      className="w-1/2 p-2 border border-slate-300 rounded-xl text-xs font-bold text-center"
                      placeholder="Giờ"
                    />
                    <input 
                      type="number"
                      min="1"
                      value={editingWork.days || 1}
                      onChange={(e) => handleEditFieldChange('days', parseInt(e.target.value || '1'))}
                      className="w-1/2 p-2 border border-slate-300 rounded-xl text-xs font-bold text-center"
                      placeholder="Ngày"
                    />
                  </div>
                </div>
              </div>

              {/* Products & Projects */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Loại sản phẩm</label>
                  <select
                    value={editingWork.productType || 'Báo cáo'}
                    onChange={(e) => handleEditFieldChange('productType', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs"
                  >
                    {DEFAULT_PRODUCT_TYPES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số lượng & Đơn vị</label>
                  <div className="flex gap-1.5">
                    <input 
                      type="number"
                      min="1"
                      value={editingWork.productQty || 1}
                      onChange={(e) => handleEditFieldChange('productQty', parseInt(e.target.value || '1'))}
                      className="w-1/2 p-2 border border-slate-300 rounded-xl text-xs font-bold text-center"
                    />
                    <input 
                      type="text"
                      value={editingWork.unit || 'Sản phẩm'}
                      onChange={(e) => handleEditFieldChange('unit', e.target.value)}
                      className="w-1/2 p-2 border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Dự án / Gói thầu</label>
                  <input 
                    type="text"
                    value={editingWork.project || ''}
                    onChange={(e) => handleEditFieldChange('project', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs"
                    placeholder="Tên dự án..."
                  />
                </div>
              </div>

              {/* Detail Content */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nội dung chi tiết</label>
                <textarea 
                  rows={3}
                  value={editingWork.detail || ''} 
                  onChange={(e) => handleEditFieldChange('detail', e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              {/* Evidence */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Đường dẫn minh chứng kết quả (URL Google Drive / File PDF / Link)</label>
                <input 
                  type="text" 
                  value={editingWork.evidence || ''} 
                  onChange={(e) => handleEditFieldChange('evidence', e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs text-blue-600 font-medium"
                />
              </div>

              {/* Late reason & Penalty exemption */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Lý do chậm tiến độ (nếu có)</label>
                  <input 
                    type="text" 
                    value={editingWork.lateReason || ''} 
                    onChange={(e) => handleEditFieldChange('lateReason', e.target.value)}
                    placeholder="Nhập lý do khách quan..."
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Đề xuất miễn phạt</label>
                  <select
                    value={editingWork.penaltyExemption || 'Không'}
                    onChange={(e) => handleEditFieldChange('penaltyExemption', e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    <option value="Không">Không</option>
                    <option value="Có">Có đề xuất miễn phạt</option>
                  </select>
                </div>
              </div>

              {/* Edit Note */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú lần chỉnh sửa này</label>
                <input 
                  type="text" 
                  value={editingWork.editNote || ''} 
                  onChange={(e) => handleEditFieldChange('editNote', e.target.value)}
                  placeholder="VD: Cập nhật link minh chứng đợt 2, điều chỉnh số ngày..."
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setEditingWork(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Hủy
              </button>
              <button 
                type="button" 
                disabled={isUpdating}
                onClick={handleSaveEdit}
                className="px-6 py-2 bg-[#1F4E78] hover:bg-[#15385b] text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Lưu thay đổi & Cập nhật KPI</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SOFT DELETE CONFIRMATION MODAL */}
      {deletingWork && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">Xác nhận xóa công việc</h3>
                <p className="text-xs text-slate-500">Thao tác này sẽ thực hiện xóa mềm an toàn.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 mb-4 text-xs">
              <div className="font-bold text-slate-900">{deletingWork.taskName}</div>
              <div className="text-slate-500 mt-1">Tháng: <b>{deletingWork.month}</b> | Người thực hiện: <b>{deletingWork.user?.name}</b></div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">Lý do xóa công việc (tùy chọn)</label>
              <input 
                type="text" 
                value={deleteReason} 
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="VD: Trùng lặp, hủy kế hoạch..." 
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setDeletingWork(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Hủy bỏ
              </button>
              <button 
                type="button" 
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác nhận xóa mềm</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
