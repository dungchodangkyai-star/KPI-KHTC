import React, { useState, useEffect } from 'react';
import { 
  Send, UserCheck, Clock, CheckCircle2, AlertCircle, RefreshCw, 
  Search, Edit3, Trash2, BellRing, Eye, FileText, Download, 
  ChevronDown, Layers, ShieldCheck, HelpCircle, Sparkles, Filter, Check, X, ArrowUpDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  STANDARD_MONTHS, 
  WORK_NATURE_COEFS, 
  DEFAULT_TASK_GROUPS, 
  DEFAULT_TASKS, 
  DEFAULT_PRODUCT_TYPES,
  formatDate, 
  formatDateInput, 
  formatMonth,
  getActiveLoggedInUser 
} from '../utils';
import { User, Assignment, Work } from '../types';

export default function AssignTask() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Filter state for assigned table
  const [selectedFilterMonth, setSelectedFilterMonth] = useState('08-2026');
  const [filterReceiverId, setFilterReceiverId] = useState<number | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState("");

  // Edit / Details / Remind modal state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingAssignment, setViewingAssignment] = useState<Assignment | null>(null);
  const [remindTarget, setRemindTarget] = useState<Assignment | null>(null);
  const [remindNote, setRemindNote] = useState("");
  const [isReminding, setIsReminding] = useState(false);

  // Form State matching the exact layout of screenshot
  const [formData, setFormData] = useState({
    month: '08-2026',
    receiverId: 0,
    taskGroup: 'Báo cáo - thống kê',
    taskName: '',
    taskCode: '',
    baseScore: 10,
    suggestedNature: 'Trung bình',
    suggestedCoef: 0.8,
    productType: 'Báo cáo',
    unit: 'Sản phẩm',
    productQty: 1,
    detail: '',
    startDate: formatDateInput(new Date()),
    deadline: formatDateInput(new Date(Date.now() + 3 * 86400000)),
    productRequired: '',
    priority: 'Bình thường',
    leaderNote: ''
  });

  // Calculate expected converted score
  const expectedScore = Math.round((Number(formData.baseScore) * Number(formData.suggestedCoef) * Number(formData.productQty || 1)) * 10) / 10;

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [resUsers, resAssign, resWorks] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/assignments'),
        fetch('/api/works')
      ]);

      const [dUsers, dAssign, dWorks] = await Promise.all([
        resUsers.json(),
        resAssign.json(),
        resWorks.json()
      ]);

      if (dUsers.success && dUsers.data?.length > 0) {
        setUsers(dUsers.data);
        const active = getActiveLoggedInUser(dUsers.data);
        setCurrentUser(active);
      }
      if (dAssign.success) setAssignments(dAssign.data || []);
      if (dWorks.success) setWorks(dWorks.data || []);
    } catch (e) {
      console.error("Fetch assign data error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();

    const handleUserChange = () => {
      if (users.length > 0) {
        const active = getActiveLoggedInUser(users);
        setCurrentUser(active);
      }
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, [users.length]);

  // Handle task group change
  const handleGroupChange = (group: string) => {
    const defaultTasks = DEFAULT_TASKS[group] || [];
    const firstTask = defaultTasks[0];
    if (firstTask) {
      const nature = firstTask.nature || 'Trung bình';
      const coefObj = WORK_NATURE_COEFS[nature] || { coef: 0.8 };
      setFormData(prev => ({
        ...prev,
        taskGroup: group,
        taskName: firstTask.name,
        taskCode: firstTask.code,
        baseScore: firstTask.score,
        suggestedNature: nature,
        suggestedCoef: coefObj.coef,
        productType: firstTask.productType || 'Báo cáo',
        unit: firstTask.unit || 'Sản phẩm',
        productRequired: firstTask.productType || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        taskGroup: group,
        taskName: '',
        taskCode: '',
        baseScore: 10,
        suggestedNature: 'Trung bình',
        suggestedCoef: 0.8
      }));
    }
  };

  // Handle task selection
  const handleTaskSelect = (taskName: string) => {
    const list = DEFAULT_TASKS[formData.taskGroup] || [];
    const found = list.find(t => t.name === taskName);
    if (found) {
      const coefObj = WORK_NATURE_COEFS[found.nature] || { coef: 0.8 };
      setFormData(prev => ({
        ...prev,
        taskName: found.name,
        taskCode: found.code,
        baseScore: found.score,
        suggestedNature: found.nature,
        suggestedCoef: coefObj.coef,
        productType: found.productType || 'Báo cáo',
        unit: found.unit || 'Sản phẩm',
        productRequired: found.productType || ''
      }));
    } else {
      setFormData(prev => ({ ...prev, taskName }));
    }
  };

  // Handle nature change
  const handleNatureChange = (nature: string) => {
    const coefObj = WORK_NATURE_COEFS[nature] || { coef: 0.8 };
    setFormData(prev => ({
      ...prev,
      suggestedNature: nature,
      suggestedCoef: coefObj.coef
    }));
  };

  // Reset Form
  const handleResetForm = () => {
    setEditingId(null);
    setFormData({
      month: selectedFilterMonth,
      receiverId: 0,
      taskGroup: 'Kế hoạch vốn',
      taskName: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn',
      taskCode: 'KH01',
      baseScore: 10,
      suggestedNature: 'Trung bình',
      suggestedCoef: 0.8,
      productType: 'Bảng tổng hợp',
      unit: 'Bảng',
      productQty: 1,
      detail: '',
      startDate: formatDateInput(new Date()),
      deadline: formatDateInput(new Date(Date.now() + 3 * 86400000)),
      productRequired: 'Bảng tổng hợp vốn',
      priority: 'Bình thường',
      leaderNote: ''
    });
  };

  // Submit Assignment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.receiverId || formData.receiverId === 0) {
      setErrorMessage("Vui lòng chọn nhân viên nhận việc!");
      return;
    }
    if (!formData.taskName.trim()) {
      setErrorMessage("Vui lòng nhập hoặc chọn tên nhiệm vụ!");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const payload = {
        ...formData,
        assignerId: currentUser?.id || 1,
        assignerName: currentUser?.name || 'Lãnh đạo phòng',
        expectedConvertedScore: expectedScore,
        baseScore: String(formData.baseScore),
        suggestedCoef: String(formData.suggestedCoef),
        productQty: Number(formData.productQty) || 1
      };

      let res;
      if (editingId) {
        res = await fetch(`/api/assignments/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const d = await res.json();
      if (d.success) {
        setSuccessMessage(editingId ? "Đã cập nhật nhiệm vụ thành công!" : "Đã giao việc thành công cho nhân viên! Thông báo đã được gửi đi.");
        handleResetForm();
        fetchAllData();
        setTimeout(() => setSuccessMessage(""), 5000);
      } else {
        setErrorMessage(d.error || d.message || "Có lỗi xảy ra khi giao việc!");
      }
    } catch (err: any) {
      setErrorMessage(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start edit assignment
  const handleStartEdit = (a: Assignment) => {
    if (a.receiveStatus?.includes('Đã nhận')) {
      alert("Nhiệm vụ này đã được nhân viên tiếp nhận! Muốn thay đổi nội dung chính, vui lòng thu hồi rồi giao lại để bảo đảm dữ liệu kế hoạch không bị lệch.");
      return;
    }
    setEditingId(a.id);
    setFormData({
      month: a.month || '08-2026',
      receiverId: a.receiverId || 0,
      taskGroup: a.taskGroup || 'Kế hoạch vốn',
      taskName: a.taskName || '',
      taskCode: a.taskCode || '',
      baseScore: Number(a.baseScore) || 10,
      suggestedNature: a.suggestedNature || 'Trung bình',
      suggestedCoef: Number(a.suggestedCoef) || 0.8,
      productType: a.productType || 'Báo cáo',
      unit: a.unit || 'Sản phẩm',
      productQty: a.productQty || 1,
      detail: a.detail || '',
      startDate: formatDateInput(a.startDate),
      deadline: formatDateInput(a.deadline),
      productRequired: a.productRequired || '',
      priority: a.priority || 'Bình thường',
      leaderNote: a.leaderNote || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Revoke Assignment
  const handleRevoke = async (a: Assignment) => {
    if (!window.confirm(`Bạn có chắc chắn muốn thu hồi nhiệm vụ [${a.taskCode || ''}] "${a.taskName}" đã giao cho ${a.receiver?.name}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/assignments/${a.id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        setSuccessMessage("Đã thu hồi việc đã giao thành công!");
        fetchAllData();
        setTimeout(() => setSuccessMessage(""), 4000);
      }
    } catch (e) {
      alert("Lỗi khi thu hồi: " + String(e));
    }
  };

  // Send Remind
  const handleSendRemind = async () => {
    if (!remindTarget) return;
    setIsReminding(true);
    try {
      const res = await fetch(`/api/assignments/${remindTarget.id}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: remindNote || `Lãnh đạo nhắc nhở nhiệm vụ: [${remindTarget.taskCode || ''}] ${remindTarget.taskName}. Vui lòng khẩn trương tiếp nhận và báo cáo tiến độ!`,
          senderName: currentUser?.name || 'Lãnh đạo phòng'
        })
      });
      const d = await res.json();
      if (d.success) {
        alert(d.message);
        setRemindTarget(null);
        setRemindNote("");
      }
    } catch (e) {
      alert("Lỗi khi gửi nhắc việc: " + String(e));
    } finally {
      setIsReminding(false);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const dataToExport = filteredAssignments.map((a, idx) => ({
      "STT": idx + 1,
      "Mã GV": a.assignmentId,
      "Tháng": a.month,
      "Nhân viên nhận": a.receiver?.name || '-',
      "Chức danh": a.receiver?.position || 'Chuyên viên',
      "Nhóm công việc": a.taskGroup || '-',
      "Mã việc": a.taskCode || '-',
      "Tên nhiệm vụ": a.taskName || '-',
      "Tính chất": a.suggestedNature || 'Trung bình',
      "Hệ số": a.suggestedCoef || '0.8',
      "Điểm chuẩn": a.baseScore || '10',
      "Điểm QĐ dự kiến": a.expectedConvertedScore || '-',
      "Sản phẩm yêu cầu": a.productRequired || '-',
      "Số lượng": a.productQty || 1,
      "Đơn vị tính": a.unit || 'Sản phẩm',
      "Mức ưu tiên": a.priority || 'Bình thường',
      "Ngày giao": formatDate(a.assignDate),
      "Hạn hoàn thành": formatDate(a.deadline),
      "Trạng thái tiếp nhận": a.receiveStatus || 'Chờ nhận việc',
      "Ngày tiếp nhận": formatDate(a.receiveDate),
      "Ghi chú lãnh đạo": a.leaderNote || '',
      "Phản hồi nhân viên": a.receiverNote || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_sach_giao_viec");
    XLSX.writeFile(wb, `Danh_sach_giao_viec_${selectedFilterMonth}.xlsx`);
  };

  // Filtered Assignments
  const filteredAssignments = assignments.filter(a => {
    if (selectedFilterMonth !== 'Tất cả' && formatMonth(a.month) !== selectedFilterMonth) return false;
    if (filterReceiverId !== 'all' && a.receiverId !== filterReceiverId) return false;
    if (filterStatus !== 'all') {
      if (filterStatus === 'pending' && (a.receiveStatus?.includes('Chưa') || a.receiveStatus?.includes('Chờ'))) return true;
      if (filterStatus === 'accepted' && a.receiveStatus?.includes('Đã nhận')) return true;
      if (filterStatus === 'declined' && a.receiveStatus?.includes('Từ chối')) return true;
      if (filterStatus === 'revoked' && a.receiveStatus?.includes('thu hồi')) return true;
      if (filterStatus === 'completed' && a.receiveStatus?.includes('hoàn thành')) return true;
      if (a.receiveStatus !== filterStatus) return false;
    }
    if (filterPriority !== 'all' && a.priority !== filterPriority) return false;

    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      const matchName = (a.taskName || '').toLowerCase().includes(kw);
      const matchCode = (a.taskCode || '').toLowerCase().includes(kw);
      const matchUser = (a.receiver?.name || '').toLowerCase().includes(kw);
      const matchDetail = (a.detail || '').toLowerCase().includes(kw);
      if (!matchName && !matchCode && !matchUser && !matchDetail) return false;
    }
    return true;
  });

  // Calculate stats for current filter month
  const monthAssignments = assignments.filter(a => selectedFilterMonth === 'Tất cả' || formatMonth(a.month) === selectedFilterMonth);
  const totalCount = monthAssignments.length;
  const pendingCount = monthAssignments.filter(a => a.receiveStatus?.includes('Chưa') || a.receiveStatus?.includes('Chờ')).length;
  const acceptedCount = monthAssignments.filter(a => a.receiveStatus?.includes('Đã nhận')).length;
  const completedCount = monthAssignments.filter(a => {
    if (a.receiveStatus?.includes('hoàn thành')) return true;
    if (a.workId) {
      const w = works.find(x => x.id === a.workId);
      return w && (w.status === 'Hoàn thành' || w.leaderApproval === 'Duyệt');
    }
    return false;
  }).length;
  const revokedCount = monthAssignments.filter(a => a.receiveStatus?.includes('thu hồi') || a.receiveStatus?.includes('Từ chối')).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-[#1F4E78] uppercase tracking-wider">
                Điều hành & Phê duyệt
              </span>
              <span className="text-xs font-semibold text-slate-500">Mã quy trình: GV-08</span>
            </div>
            <h1 className="text-2xl font-black text-[#1F4E78] tracking-tight">Giao việc cho nhân viên</h1>
            <p className="text-xs text-slate-600 max-w-4xl mt-1 leading-relaxed">
              Quản trị/lãnh đạo giao việc, nhắc việc, sửa việc chưa nhận và thu hồi việc đã giao. 
              Việc đã nhận muốn thay đổi nội dung chính thì thu hồi rồi giao lại để bảo đảm dữ liệu KH không lệch.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={fetchAllData} 
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Đồng bộ</span>
            </button>
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        {/* Notifications / Alerts */}
        {successMessage && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Main Form: Giao việc cho nhân viên - Styled precisely as screenshot */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[#1F4E78]" />
            <h2 className="text-base font-black text-[#1F4E78]">
              {editingId ? `Chỉnh sửa nhiệm vụ đã giao (#${editingId})` : 'Thông tin giao nhiệm vụ mới'}
            </h2>
          </div>
          {editingId && (
            <button 
              onClick={handleResetForm}
              className="text-xs font-bold text-slate-500 hover:text-slate-700 underline"
            >
              Hủy sửa / Tạo mới
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Row 1: Tháng | Nhân viên nhận | Nhóm công việc | Tên nhiệm vụ */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Tháng</label>
              <select
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              >
                {STANDARD_MONTHS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">
                Nhân viên nhận <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.receiverId}
                onChange={(e) => setFormData({ ...formData, receiverId: parseInt(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              >
                <option value={0}>-- Chọn nhân viên --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.position || 'Chuyên viên'})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Nhóm công việc</label>
              <select
                value={formData.taskGroup}
                onChange={(e) => handleGroupChange(e.target.value)}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              >
                {DEFAULT_TASK_GROUPS.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Tên nhiệm vụ</label>
              <select
                value={formData.taskName}
                onChange={(e) => handleTaskSelect(e.target.value)}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] truncate"
              >
                <option value="">-- Chọn hoặc nhập nhiệm vụ --</option>
                {(DEFAULT_TASKS[formData.taskGroup] || []).map(t => (
                  <option key={t.code} value={t.name}>{t.code} - {t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Mã việc | Điểm chuẩn | Tính chất công việc | Hệ số */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Mã việc</label>
              <input
                type="text"
                value={formData.taskCode}
                onChange={(e) => setFormData({ ...formData, taskCode: e.target.value })}
                placeholder="VD: BC02, KH01..."
                className="w-full bg-white border border-slate-300 text-sm font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Điểm chuẩn</label>
              <input
                type="number"
                step="0.5"
                value={formData.baseScore}
                onChange={(e) => setFormData({ ...formData, baseScore: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 text-sm font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Tính chất công việc</label>
              <select
                value={formData.suggestedNature}
                onChange={(e) => handleNatureChange(e.target.value)}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              >
                {Object.keys(WORK_NATURE_COEFS).map(nat => (
                  <option key={nat} value={nat}>{nat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Hệ số</label>
              <input
                type="number"
                step="0.1"
                value={formData.suggestedCoef}
                onChange={(e) => setFormData({ ...formData, suggestedCoef: parseFloat(e.target.value) || 0.8 })}
                className="w-full bg-white border border-slate-300 text-sm font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              />
            </div>
          </div>

          {/* Row 3: Điểm quy đổi dự kiến | Loại sản phẩm | Đơn vị tính | Số lượng sản phẩm */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                <span>Điểm quy đổi dự kiến</span>
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">Tự tính</span>
              </label>
              <input
                type="text"
                readOnly
                value={expectedScore}
                className="w-full bg-slate-100 border border-slate-200 text-sm font-black text-[#1F4E78] rounded-xl px-3.5 py-2.5 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Loại sản phẩm</label>
              <select
                value={formData.productType}
                onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              >
                {DEFAULT_PRODUCT_TYPES.map(pt => (
                  <option key={pt} value={pt}>{pt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Đơn vị tính</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              >
                <option value="Sản phẩm">Sản phẩm</option>
                <option value="Báo cáo">Báo cáo</option>
                <option value="Tờ trình">Tờ trình</option>
                <option value="Hồ sơ">Hồ sơ</option>
                <option value="Dự án">Dự án</option>
                <option value="Bộ">Bộ</option>
                <option value="Văn bản">Văn bản</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Số lượng sản phẩm</label>
              <input
                type="number"
                min="1"
                value={formData.productQty}
                onChange={(e) => setFormData({ ...formData, productQty: parseInt(e.target.value) || 1 })}
                className="w-full bg-white border border-slate-300 text-sm font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              />
            </div>
          </div>

          {/* Row 4: Nội dung/yêu cầu giao việc */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1.5">Nội dung/yêu cầu giao việc</label>
            <textarea
              rows={3}
              value={formData.detail}
              onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
              placeholder="Nhập chi tiết yêu cầu, phạm vi xử lý, chỉ đạo cụ thể của lãnh đạo đối với nhân viên..."
              className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl p-3.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
            />
          </div>

          {/* Row 5: Ngày bắt đầu yêu cầu | Hạn hoàn thành | Sản phẩm yêu cầu | Mức ưu tiên */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Ngày bắt đầu yêu cầu</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Hạn hoàn thành</label>
              <input
                type="date"
                value={formData.deadline}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Sản phẩm yêu cầu</label>
              <input
                type="text"
                value={formData.productRequired}
                onChange={(e) => setFormData({ ...formData, productRequired: e.target.value })}
                placeholder="VD: Báo cáo GSDT, Tờ trình..."
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5">Mức ưu tiên</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              >
                <option value="Bình thường">Bình thường</option>
                <option value="Cao">Cao</option>
                <option value="Khẩn cấp">Khẩn cấp</option>
              </select>
            </div>
          </div>

          {/* Row 6: Ghi chú lãnh đạo */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1.5">Ghi chú lãnh đạo</label>
            <input
              type="text"
              value={formData.leaderNote}
              onChange={(e) => setFormData({ ...formData, leaderNote: e.target.value })}
              placeholder="Ghi chú thêm từ Lãnh đạo phòng (nếu có)..."
              className="w-full bg-white border border-slate-300 text-sm font-medium text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-3 border-t border-slate-200">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-[#1F4E78] hover:bg-[#173e60] text-white text-sm font-bold px-6 py-3 rounded-xl transition-all shadow-md active:scale-98 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang lưu...' : (editingId ? 'Cập nhật nhiệm vụ' : 'Giao việc ngay')}</span>
            </button>

            <button
              type="button"
              onClick={handleResetForm}
              className="px-5 py-3 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Làm mới form
            </button>
          </div>
        </form>
      </div>

      {/* 2-Way Statistics & Monitoring Panel for Leader */}
      <div className="space-y-4">
        {/* KPI Metric Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng việc đã giao</div>
            <div className="text-2xl font-black text-[#1F4E78] mt-1">{totalCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Tháng {selectedFilterMonth}</div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200 bg-gradient-to-br from-white to-amber-50/50">
            <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Chờ tiếp nhận</span>
            </div>
            <div className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-medium">Cần đôn đốc/nhắc việc</div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-blue-200 bg-gradient-to-br from-white to-blue-50/50">
            <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Đã nhận & Đang làm</span>
            </div>
            <div className="text-2xl font-black text-blue-600 mt-1">{acceptedCount}</div>
            <div className="text-[11px] text-blue-700 mt-0.5 font-medium">Đang triển khai</div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/50">
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Đã xong / Chờ duyệt</span>
            </div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{completedCount}</div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">Tính điểm KPI</div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Đã thu hồi / Từ chối</div>
            <div className="text-2xl font-black text-slate-600 mt-1">{revokedCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Không tính KPI</div>
          </div>
        </div>

        {/* Assigned Tasks Management Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wide">
                Bảng theo dõi & Báo cáo công việc đã giao
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cập nhật tương tác 2 chiều, trạng thái nhận việc và tính điểm KPI của nhân sự
              </p>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedFilterMonth}
                onChange={(e) => setSelectedFilterMonth(e.target.value)}
                className="bg-white border border-slate-300 text-xs font-bold text-slate-800 rounded-xl px-3 py-2 outline-none"
              >
                <option value="Tất cả">Tất cả các tháng</option>
                {STANDARD_MONTHS.map(m => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>

              <select
                value={filterReceiverId}
                onChange={(e) => setFilterReceiverId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="bg-white border border-slate-300 text-xs font-bold text-slate-800 rounded-xl px-3 py-2 outline-none"
              >
                <option value="all">Tất cả nhân sự nhận</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-white border border-slate-300 text-xs font-bold text-slate-800 rounded-xl px-3 py-2 outline-none"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">Chờ tiếp nhận</option>
                <option value="accepted">Đã tiếp nhận</option>
                <option value="completed">Đã hoàn thành</option>
                <option value="declined">Từ chối việc</option>
                <option value="revoked">Đã thu hồi</option>
              </select>

              <div className="relative">
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Tìm mã việc, tên..."
                  className="w-44 bg-white border border-slate-300 text-xs font-medium text-slate-800 rounded-xl pl-8 pr-3 py-2 outline-none"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1F4E78] text-white font-bold border-b border-blue-900">
                  <th className="py-3 px-3 text-center w-10">STT</th>
                  <th className="py-3 px-3">Mã & Nhóm việc</th>
                  <th className="py-3 px-3">Tên nhiệm vụ giao</th>
                  <th className="py-3 px-3">Người nhận</th>
                  <th className="py-3 px-3 text-center">Hạn chót</th>
                  <th className="py-3 px-3 text-center">Mức ưu tiên</th>
                  <th className="py-3 px-3 text-center">Điểm QĐ</th>
                  <th className="py-3 px-3">Trạng thái 2 chiều</th>
                  <th className="py-3 px-3 text-center">Thao tác lãnh đạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400">
                      Không có nhiệm vụ giao việc nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map((a, idx) => {
                    const isAccepted = a.receiveStatus?.includes('Đã nhận');
                    const isDeclined = a.receiveStatus?.includes('Từ chối');
                    const isRevoked = a.receiveStatus?.includes('thu hồi');
                    const isPending = !isAccepted && !isDeclined && !isRevoked;

                    return (
                      <tr key={a.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="py-3 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-[#1F4E78] block">{a.taskCode || a.assignmentId}</span>
                          <span className="text-[10px] text-slate-500 truncate block max-w-[120px]">{a.taskGroup}</span>
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <div className="font-bold text-slate-800 line-clamp-2">{a.taskName}</div>
                          {a.detail && (
                            <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{a.detail}</div>
                          )}
                          {a.productRequired && (
                            <div className="text-[10px] text-blue-700 font-semibold mt-0.5">
                              Sản phẩm: {a.productRequired} ({a.productQty || 1} {a.unit || 'SP'})
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800">{a.receiver?.name || '-'}</div>
                          <div className="text-[10px] text-slate-500">{a.receiver?.position || 'Chuyên viên'}</div>
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-slate-700">
                          {formatDate(a.deadline)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {a.priority === 'Khẩn cấp' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 border border-red-200">
                              Khẩn cấp
                            </span>
                          ) : a.priority === 'Cao' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                              Cao
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                              Bình thường
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-black text-[#1F4E78]">
                          {a.expectedConvertedScore || a.baseScore || '-'}
                        </td>
                        <td className="py-3 px-3">
                          {isPending && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3" /> Chờ nhận việc
                              </span>
                              <div className="text-[10px] text-slate-400">Giao lúc: {formatDate(a.assignDate)}</div>
                            </div>
                          )}
                          {isAccepted && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> Đã nhận việc
                              </span>
                              <div className="text-[10px] text-emerald-700">Nhận lúc: {formatDate(a.receiveDate)}</div>
                            </div>
                          )}
                          {isDeclined && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-red-100 text-red-800 border border-red-200">
                                <X className="w-3 h-3" /> Từ chối nhận
                              </span>
                              {a.receiverNote && (
                                <div className="text-[10px] text-red-600 font-medium">Lý do: {a.receiverNote}</div>
                              )}
                            </div>
                          )}
                          {isRevoked && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                              Đã thu hồi
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-1">
                            {/* Remind Button */}
                            {isPending && (
                              <button
                                onClick={() => { setRemindTarget(a); setRemindNote(""); }}
                                title="Nhắc nhở nhân viên nhận việc"
                                className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors"
                              >
                                <BellRing className="w-4 h-4" />
                              </button>
                            )}

                            {/* View / 2-way Details */}
                            <button
                              onClick={() => setViewingAssignment(a)}
                              title="Xem chi tiết báo cáo 2 chiều"
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Edit Button (only if not accepted) */}
                            {!isAccepted && !isRevoked && (
                              <button
                                onClick={() => handleStartEdit(a)}
                                title="Chỉnh sửa nhiệm vụ"
                                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}

                            {/* Revoke Button */}
                            {!isRevoked && (
                              <button
                                onClick={() => handleRevoke(a)}
                                title="Thu hồi việc đã giao"
                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Remind Modal */}
      {remindTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
                <BellRing className="w-4 h-4" />
                <span>Gửi thông báo nhắc việc</span>
              </div>
              <button onClick={() => setRemindTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <p><span className="font-bold text-slate-700">Người nhận:</span> {remindTarget.receiver?.name} ({remindTarget.receiver?.position})</p>
              <p><span className="font-bold text-slate-700">Nhiệm vụ:</span> [{remindTarget.taskCode}] {remindTarget.taskName}</p>
              <p><span className="font-bold text-slate-700">Hạn chót:</span> {formatDate(remindTarget.deadline)}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nội dung nhắc nhở / Chỉ đạo thêm</label>
              <textarea
                rows={3}
                value={remindNote}
                onChange={(e) => setRemindNote(e.target.value)}
                placeholder="VD: Đề nghị khẩn trương tiếp nhận nhiệm vụ và nộp sản phẩm trước 17h00 hôm nay..."
                className="w-full text-xs p-3 border border-slate-300 rounded-xl outline-none focus:border-[#1F4E78]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRemindTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Đóng
              </button>
              <button
                onClick={handleSendRemind}
                disabled={isReminding}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isReminding ? 'Đang gửi...' : 'Gửi nhắc nhở ngay'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewing Assignment Details Modal (2-Way Log) */}
      {viewingAssignment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-[#1F4E78] font-bold text-sm">
                <FileText className="w-4 h-4" />
                <span>Chi tiết báo cáo tương tác 2 chiều</span>
              </div>
              <button onClick={() => setViewingAssignment(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 text-xs space-y-2">
              <div className="font-bold text-[#1F4E78] text-sm">[{viewingAssignment.taskCode}] {viewingAssignment.taskName}</div>
              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <div><span className="font-bold">Tháng:</span> {viewingAssignment.month}</div>
                <div><span className="font-bold">Mức ưu tiên:</span> {viewingAssignment.priority}</div>
                <div><span className="font-bold">Người giao:</span> {viewingAssignment.assigner?.name || 'Lãnh đạo phòng'}</div>
                <div><span className="font-bold">Người nhận:</span> {viewingAssignment.receiver?.name}</div>
                <div><span className="font-bold">Ngày giao:</span> {formatDate(viewingAssignment.assignDate)}</div>
                <div><span className="font-bold">Hạn hoàn thành:</span> {formatDate(viewingAssignment.deadline)}</div>
                <div><span className="font-bold">Điểm chuẩn:</span> {viewingAssignment.baseScore}</div>
                <div><span className="font-bold">Điểm QĐ dự kiến:</span> {viewingAssignment.expectedConvertedScore}</div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <h4 className="font-bold text-slate-800 mb-1">Nội dung / Yêu cầu chi tiết của Lãnh đạo:</h4>
                <p className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 leading-relaxed">
                  {viewingAssignment.detail || 'Không có yêu cầu chi tiết bằng văn bản.'}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">Tiến trình tương tác 2 chiều:</h4>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-slate-600">1. Lãnh đạo phát lệnh giao việc</span>
                    <span className="font-bold text-[#1F4E78]">{formatDate(viewingAssignment.assignDate)}</span>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-slate-600">2. Trạng thái tiếp nhận</span>
                    <span className={`font-bold ${viewingAssignment.receiveStatus?.includes('Đã nhận') ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {viewingAssignment.receiveStatus || 'Chờ nhận việc'}
                    </span>
                  </div>
                  {viewingAssignment.receiveDate && (
                    <div className="p-2.5 flex items-center justify-between">
                      <span className="text-slate-600">3. Thời gian nhân viên tiếp nhận</span>
                      <span className="font-bold text-emerald-700">{formatDate(viewingAssignment.receiveDate)}</span>
                    </div>
                  )}
                  {viewingAssignment.receiverNote && (
                    <div className="p-2.5">
                      <span className="text-slate-600 block mb-0.5">Phản hồi / Ghi chú của nhân viên:</span>
                      <span className="font-medium text-slate-800 italic">"{viewingAssignment.receiverNote}"</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setViewingAssignment(null)}
                className="px-5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
