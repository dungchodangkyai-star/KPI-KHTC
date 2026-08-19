import React, { useState, useEffect } from 'react';
import { 
  Send, UserCheck, Clock, CheckCircle2, AlertCircle, RefreshCw, 
  Search, Edit3, Trash2, BellRing, Eye, FileText, Download, 
  ChevronDown, Layers, ShieldCheck, HelpCircle, Sparkles, Filter, Check, X, ArrowUpDown,
  Zap, Settings, MessageSquare, Phone, Users, ExternalLink, Sliders, CheckSquare, Square
} from 'lucide-react';
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
import { exportStyledExcel, ExportColumn } from '../excelUtils';
import { User, Assignment, Work } from '../types';

interface SelectedReceiver {
  userId: number;
  userName: string;
  userPhone: string;
  position: string;
  role: 'Chủ trì' | 'Phối hợp';
  coef: number;
}

interface ZaloConfig {
  method: 'webhook' | 'group_webhook' | 'oa_zns' | 'direct_app';
  webhookUrl?: string;
  groupWebhookUrl?: string;
  oaAccessToken?: string;
  oaTemplateId?: string;
  senderName?: string;
  senderPhone?: string;
  defaultTemplate?: string;
}

export default function AssignTask() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Flow Selection: 1 = Internal Only, 2 = 1-Click Zalo Automation
  const [assignmentFlow, setAssignmentFlow] = useState<'internal' | 'zalo'>('zalo');

  // Multi-receiver state
  const [selectedReceivers, setSelectedReceivers] = useState<SelectedReceiver[]>([]);

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

  // Zalo Settings Modal State
  const [showZaloModal, setShowZaloModal] = useState(false);
  const [zaloConfig, setZaloConfig] = useState<ZaloConfig>({
    method: 'webhook',
    webhookUrl: '',
    groupWebhookUrl: '',
    senderName: 'Lãnh đạo Phòng KHTC',
    senderPhone: '',
    defaultTemplate: ''
  });
  const [isSavingZalo, setIsSavingZalo] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [isTestingZalo, setIsTestingZalo] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    month: '08-2026',
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

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [resUsers, resAssign, resWorks, resZalo] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/assignments'),
        fetch('/api/works'),
        fetch('/api/zalo/config')
      ]);

      const [dUsers, dAssign, dWorks, dZalo] = await Promise.all([
        resUsers.json(),
        resAssign.json(),
        resWorks.json(),
        resZalo.json()
      ]);

      if (dUsers.success && dUsers.data?.length > 0) {
        setUsers(dUsers.data);
        const active = getActiveLoggedInUser(dUsers.data);
        setCurrentUser(active);

        // Initial default receiver if none selected
        if (selectedReceivers.length === 0) {
          const firstUser = dUsers.data[0];
          setSelectedReceivers([{
            userId: firstUser.id,
            userName: firstUser.name,
            userPhone: firstUser.phone || '',
            position: firstUser.position || 'Chuyên viên',
            role: 'Chủ trì',
            coef: 0.8
          }]);
        }
      }
      if (dAssign.success) setAssignments(dAssign.data || []);
      if (dWorks.success) setWorks(dWorks.data || []);
      if (dZalo.success && dZalo.data) {
        setZaloConfig(dZalo.data);
        if (dZalo.data.senderPhone) setTestPhone(dZalo.data.senderPhone);
      }
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
    // Update coef in selected receivers for primary lead
    setSelectedReceivers(prev => prev.map(r => r.role === 'Chủ trì' ? { ...r, coef: coefObj.coef } : r));
  };

  // Multi-receiver helper
  const handleToggleUser = (user: User) => {
    setSelectedReceivers(prev => {
      const exists = prev.find(r => r.userId === user.id);
      if (exists) {
        if (prev.length === 1) {
          alert("Nhiệm vụ cần ít nhất 1 nhân sự phụ trách!");
          return prev;
        }
        return prev.filter(r => r.userId !== user.id);
      } else {
        const hasLeader = prev.some(r => r.role === 'Chủ trì');
        const defaultRole = hasLeader ? 'Phối hợp' : 'Chủ trì';
        const defaultCoef = defaultRole === 'Chủ trì' ? formData.suggestedCoef : 0.4;
        return [...prev, {
          userId: user.id,
          userName: user.name,
          userPhone: user.phone || '',
          position: user.position || 'Chuyên viên',
          role: defaultRole,
          coef: defaultCoef
        }];
      }
    });
  };

  const handleUpdateReceiverRole = (userId: number, role: 'Chủ trì' | 'Phối hợp') => {
    setSelectedReceivers(prev => prev.map(r => {
      if (r.userId === userId) {
        const newCoef = role === 'Chủ trì' ? formData.suggestedCoef : 0.4;
        return { ...r, role, coef: newCoef };
      }
      return r;
    }));
  };

  const handleUpdateReceiverCoef = (userId: number, coef: number) => {
    setSelectedReceivers(prev => prev.map(r => r.userId === userId ? { ...r, coef } : r));
  };

  // Reset Form
  const handleResetForm = () => {
    setEditingId(null);
    setFormData({
      month: selectedFilterMonth,
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

  // Submit Assignment (Supports 2 Flows & Multi-Receivers)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedReceivers.length === 0) {
      setErrorMessage("Vui lòng chọn ít nhất một nhân sự nhận nhiệm vụ!");
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
        flow: assignmentFlow,
        sendZalo: assignmentFlow === 'zalo',
        assignerId: currentUser?.id || 1,
        assignerName: currentUser?.name || 'Lãnh đạo phòng',
        baseScore: String(formData.baseScore),
        suggestedCoef: String(formData.suggestedCoef),
        productQty: Number(formData.productQty) || 1,
        receivers: selectedReceivers.map(r => ({
          userId: r.userId,
          userName: r.userName,
          userPhone: r.userPhone,
          role: r.role,
          coef: r.coef
        }))
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
        let msg = editingId ? "Đã cập nhật nhiệm vụ thành công!" : `Đã giao việc thành công cho ${selectedReceivers.length} nhân sự!`;
        if (assignmentFlow === 'zalo' && d.zaloResults?.length > 0) {
          msg += ` Đã kích hoạt bắn tin Zalo 1-Click.`;
        }
        setSuccessMessage(msg);
        handleResetForm();
        fetchAllData();
        setTimeout(() => setSuccessMessage(""), 6000);
      } else {
        setErrorMessage(d.error || d.message || "Có lỗi xảy ra khi giao việc!");
      }
    } catch (err: any) {
      setErrorMessage(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Instant 1-Click Zalo Trigger for single row
  const handleInstantZalo = async (a: Assignment) => {
    try {
      const res = await fetch('/api/zalo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverName: a.receiver?.name || 'Cán bộ',
          receiverPhone: a.receiver?.phone || '',
          assignerName: currentUser?.name || 'Lãnh đạo Phòng',
          taskName: a.taskName,
          taskCode: a.taskCode,
          taskGroup: a.taskGroup,
          score: a.baseScore,
          coef: a.suggestedCoef,
          productRequired: a.productRequired,
          deadline: a.deadline ? new Date(a.deadline).toLocaleDateString('vi-VN') : '',
          leaderNote: a.leaderNote || 'Thực hiện đúng tiến độ quy định',
          role: 'Chủ trì'
        })
      });
      const d = await res.json();
      if (d.directLink) {
        window.open(d.directLink, '_blank');
      }
      setSuccessMessage(`Đã kích hoạt Zalo gửi tới ${a.receiver?.name}!`);
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (e: any) {
      alert("Lỗi kết nối Zalo: " + String(e));
    }
  };

  // Start edit assignment
  const handleStartEdit = (a: Assignment) => {
    if (a.receiveStatus?.includes('Đã nhận')) {
      alert("Nhiệm vụ này đã được nhân viên tiếp nhận! Muốn thay đổi nội dung chính, vui lòng thu hồi rồi giao lại để bảo đảm dữ liệu kế hoạch không bị lệch.");
      return;
    }
    setEditingId(a.id);
    if (a.receiver) {
      setSelectedReceivers([{
        userId: a.receiver.id,
        userName: a.receiver.name,
        userPhone: a.receiver.phone || '',
        position: a.receiver.position || 'Chuyên viên',
        role: 'Chủ trì',
        coef: Number(a.suggestedCoef) || 0.8
      }]);
    }
    setFormData({
      month: a.month || '08-2026',
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

  // Save Zalo Config
  const handleSaveZaloConfig = async () => {
    setIsSavingZalo(true);
    try {
      const res = await fetch('/api/zalo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zaloConfig)
      });
      const d = await res.json();
      if (d.success) {
        alert("Đã lưu cấu hình Zalo thành công!");
        setShowZaloModal(false);
      } else {
        alert("Lỗi: " + d.error);
      }
    } catch (e) {
      alert("Lỗi khi lưu cấu hình Zalo: " + String(e));
    } finally {
      setIsSavingZalo(false);
    }
  };

  // Test Zalo Connection
  const handleTestZalo = async () => {
    setIsTestingZalo(true);
    try {
      const res = await fetch('/api/zalo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, name: 'Cán bộ thử nghiệm' })
      });
      const d = await res.json();
      if (d.directLink) {
        window.open(d.directLink, '_blank');
      }
      alert(d.message || "Đã gửi thử nghiệm thành công!");
    } catch (e) {
      alert("Lỗi kiểm tra Zalo: " + String(e));
    } finally {
      setIsTestingZalo(false);
    }
  };

  // Export Excel Styled (#1F4E78)
  const handleExportExcel = async () => {
    const cols: ExportColumn[] = [
      { header: 'STT', key: 'stt', width: 8, align: 'center' },
      { header: 'Mã GV', key: 'assignmentId', width: 18, align: 'center' },
      { header: 'Tháng', key: 'month', width: 12, align: 'center' },
      { header: 'Nhân viên nhận việc', key: 'receiverName', width: 26, align: 'left' },
      { header: 'Chức danh', key: 'position', width: 18, align: 'center' },
      { header: 'Nhóm công việc', key: 'taskGroup', width: 24, align: 'left' },
      { header: 'Mã việc', key: 'taskCode', width: 14, align: 'center' },
      { header: 'Tên nhiệm vụ / Công việc', key: 'taskName', width: 44, align: 'left' },
      { header: 'Tính chất', key: 'suggestedNature', width: 16, align: 'center' },
      { header: 'Hệ số K', key: 'suggestedCoef', width: 12, align: 'center' },
      { header: 'Điểm chuẩn', key: 'baseScore', width: 14, align: 'center' },
      { header: 'Điểm QĐ dự kiến', key: 'expectedConvertedScore', width: 16, align: 'center' },
      { header: 'Sản phẩm yêu cầu', key: 'productRequired', width: 24, align: 'left' },
      { header: 'Số lượng', key: 'productQty', width: 10, align: 'center' },
      { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
      { header: 'Mức ưu tiên', key: 'priority', width: 16, align: 'center' },
      { header: 'Ngày giao việc', key: 'assignDate', width: 16, align: 'center' },
      { header: 'Hạn hoàn thành', key: 'deadline', width: 16, align: 'center' },
      { header: 'Trạng thái tiếp nhận', key: 'receiveStatus', width: 20, align: 'center' },
      { header: 'Ghi chú chỉ đạo', key: 'leaderNote', width: 32, align: 'left' },
    ];

    const dataToExport = filteredAssignments.map((a, idx) => ({
      stt: idx + 1,
      assignmentId: a.assignmentId,
      month: a.month,
      receiverName: a.receiver?.name || '-',
      position: a.receiver?.position || 'Chuyên viên',
      taskGroup: a.taskGroup || '-',
      taskCode: a.taskCode || '-',
      taskName: a.taskName || '-',
      suggestedNature: a.suggestedNature || 'Trung bình',
      suggestedCoef: a.suggestedCoef || '0.8',
      baseScore: a.baseScore || '10',
      expectedConvertedScore: a.expectedConvertedScore || '-',
      productRequired: a.productRequired || '-',
      productQty: a.productQty || 1,
      unit: a.unit || 'Sản phẩm',
      priority: a.priority || 'Bình thường',
      assignDate: formatDate(a.assignDate),
      deadline: formatDate(a.deadline),
      receiveStatus: a.receiveStatus || 'Chờ nhận việc',
      leaderNote: a.leaderNote || ''
    }));

    await exportStyledExcel(dataToExport, cols, `Danh_Sach_Giao_Viec_${selectedFilterMonth}.xlsx`, 'Giao_Viec');
    setSuccessMessage("Đã xuất danh sách giao việc định dạng Navy Blue #1F4E78!");
    setTimeout(() => setSuccessMessage(""), 4000);
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

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-[#1F4E78] uppercase tracking-wider">
                Điều hành 2 Luồng & Tự động Zalo
              </span>
              <span className="text-xs font-semibold text-slate-500">Mã quy trình: GV-08</span>
            </div>
            <h1 className="text-2xl font-black text-[#1F4E78] tracking-tight flex items-center gap-2">
              <span>Giao việc cho nhân viên</span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                1-Click Zalo
              </span>
            </h1>
            <p className="text-xs text-slate-600 max-w-4xl mt-1 leading-relaxed">
              Hỗ trợ giao 1 việc cho nhiều nhân sự (Chủ trì & Phối hợp), điều phối 2 luồng: Giao nội bộ & Tự động gửi Zalo thông báo tức thì.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button 
              onClick={() => setShowZaloModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-blue-600" />
              <span>⚙️ Cấu hình Zalo & Mẫu tin</span>
            </button>

            <button 
              onClick={fetchAllData} 
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Đồng bộ</span>
            </button>
            
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Xuất Excel (#1F4E78)</span>
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

      {/* 2-Column Form & Setup Area */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{editingId ? `Chỉnh sửa giao việc (#${editingId})` : 'Tạo mới phiếu giao nhiệm vụ'}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Chọn chế độ phát hành & thiết lập phân công công việc</p>
          </div>

          {/* 2 Flow Selector Tabs */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setAssignmentFlow('internal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                assignmentFlow === 'internal' 
                  ? 'bg-white text-slate-800 shadow-xs border border-slate-200' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>🔘 Luồng 1: Nội bộ</span>
            </button>
            <button
              type="button"
              onClick={() => setAssignmentFlow('zalo')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                assignmentFlow === 'zalo' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:text-blue-700'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>⚡ Luồng 2: Giao & Tự động Zalo 1-Click</span>
            </button>
          </div>
        </div>

        {/* Section 1: Multi-Receiver Selection & Roles */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1F4E78]" />
              <label className="text-xs font-black text-slate-800 uppercase tracking-wide">
                Nhân sự tiếp nhận ({selectedReceivers.length} người được chọn)
              </label>
            </div>
            <span className="text-[11px] text-slate-500">
              Nhấp vào nhân sự để chọn/bỏ chọn, phân vai trò ⭐ Chủ trì (100%) hoặc 👥 Phối hợp (K riêng)
            </span>
          </div>

          {/* User Multi-select chips */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {users.map(u => {
              const isSelected = selectedReceivers.some(r => r.userId === u.id);
              const receiverObj = selectedReceivers.find(r => r.userId === u.id);
              return (
                <div
                  key={u.id}
                  onClick={() => handleToggleUser(u)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between select-none ${
                    isSelected 
                      ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-400' 
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 truncate">{u.name}</span>
                    {isSelected ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{u.position || 'Chuyên viên'}</span>
                    {isSelected && (
                      <span className={`px-1.5 py-0.2 rounded font-bold ${receiverObj?.role === 'Chủ trì' ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-700'}`}>
                        {receiverObj?.role}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Receivers Detailed Table */}
          {selectedReceivers.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="text-[11px] font-bold text-slate-600 mb-2">Bảng điều phối vai trò & hệ số:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {selectedReceivers.map(r => (
                  <div key={r.userId} className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-slate-200 shadow-2xs text-xs">
                    <div className="truncate">
                      <div className="font-bold text-slate-800 truncate">{r.userName}</div>
                      <div className="text-[10px] text-slate-500">{r.userPhone || 'Chưa có SĐT'}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={r.role}
                        onChange={(e) => handleUpdateReceiverRole(r.userId, e.target.value as any)}
                        className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-xs font-bold text-slate-700 outline-none"
                      >
                        <option value="Chủ trì">⭐ Chủ trì</option>
                        <option value="Phối hợp">👥 Phối hợp</option>
                      </select>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-500 font-bold">K:</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="2.0"
                          value={r.coef}
                          onChange={(e) => handleUpdateReceiverCoef(r.userId, Number(e.target.value))}
                          className="w-12 px-1 py-0.5 border border-slate-200 rounded text-xs font-bold text-center"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Task Details */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3 space-y-1">
            <label className="text-xs font-bold text-slate-700">Tháng giao việc</label>
            <select
              value={formData.month}
              onChange={(e) => setFormData(prev => ({ ...prev, month: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#1F4E78]"
            >
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4 space-y-1">
            <label className="text-xs font-bold text-slate-700">Nhóm công việc</label>
            <select
              value={formData.taskGroup}
              onChange={(e) => handleGroupChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#1F4E78]"
            >
              {DEFAULT_TASK_GROUPS.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5 space-y-1">
            <label className="text-xs font-bold text-slate-700">Mẫu nhiệm vụ chuẩn</label>
            <select
              value={formData.taskName}
              onChange={(e) => handleTaskSelect(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#1F4E78]"
            >
              {(DEFAULT_TASKS[formData.taskGroup] || []).map(t => (
                <option key={t.code} value={t.name}>[{t.code}] {t.name}</option>
              ))}
              <option value="CUSTOM">-- Nhập nhiệm vụ khác --</option>
            </select>
          </div>
        </div>

        {/* Task Name & Code */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3 space-y-1">
            <label className="text-xs font-bold text-slate-700">Mã việc</label>
            <input
              type="text"
              value={formData.taskCode}
              onChange={(e) => setFormData(prev => ({ ...prev, taskCode: e.target.value }))}
              placeholder="VD: KH01"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#1F4E78]"
            />
          </div>

          <div className="md:col-span-9 space-y-1">
            <label className="text-xs font-bold text-slate-700">Tên nhiệm vụ / Công việc chỉ đạo <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formData.taskName}
              onChange={(e) => setFormData(prev => ({ ...prev, taskName: e.target.value }))}
              placeholder="Nhập tên nhiệm vụ giao việc..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#1F4E78]"
              required
            />
          </div>
        </div>

        {/* KPI Scoring Parameters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">Điểm chuẩn (Đc)</label>
            <input
              type="number"
              value={formData.baseScore}
              onChange={(e) => setFormData(prev => ({ ...prev, baseScore: Number(e.target.value) }))}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-black text-center text-slate-800"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">Tính chất</label>
            <select
              value={formData.suggestedNature}
              onChange={(e) => handleNatureChange(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
            >
              {Object.keys(WORK_NATURE_COEFS).map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">Hệ số K</label>
            <input
              type="number"
              step="0.1"
              value={formData.suggestedCoef}
              onChange={(e) => setFormData(prev => ({ ...prev, suggestedCoef: Number(e.target.value) }))}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-black text-center text-slate-800"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">Loại sản phẩm</label>
            <select
              value={formData.productType}
              onChange={(e) => setFormData(prev => ({ ...prev, productType: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
            >
              {DEFAULT_PRODUCT_TYPES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">Số lượng</label>
            <input
              type="number"
              min="1"
              value={formData.productQty}
              onChange={(e) => setFormData(prev => ({ ...prev, productQty: Number(e.target.value) }))}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-black text-center text-slate-800"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">Ưu tiên</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
            >
              <option value="Bình thường">Bình thường</option>
              <option value="Khẩn">🔥 Khẩn</option>
              <option value="Hỏa tốc">⚡ Hỏa tốc</option>
            </select>
          </div>
        </div>

        {/* Schedule & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3 space-y-1">
            <label className="text-xs font-bold text-slate-700">Ngày bắt đầu</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
            />
          </div>

          <div className="md:col-span-3 space-y-1">
            <label className="text-xs font-bold text-slate-700">Hạn chót hoàn thành <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={formData.deadline}
              onChange={(e) => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none"
              required
            />
          </div>

          <div className="md:col-span-6 space-y-1">
            <label className="text-xs font-bold text-slate-700">Yêu cầu sản phẩm đầu ra</label>
            <input
              type="text"
              value={formData.productRequired}
              onChange={(e) => setFormData(prev => ({ ...prev, productRequired: e.target.value }))}
              placeholder="VD: Báo cáo tổng hợp vốn ký duyệt..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700">Ý kiến chỉ đạo & Hướng dẫn của Lãnh đạo</label>
          <textarea
            rows={2}
            value={formData.leaderNote}
            onChange={(e) => setFormData(prev => ({ ...prev, leaderNote: e.target.value }))}
            placeholder="Nội dung chỉ đạo cụ thể gửi tới cán bộ nhận việc..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-[#1F4E78]"
          />
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={handleResetForm}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Làm lại
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer ${
              assignmentFlow === 'zalo'
                ? 'bg-gradient-to-r from-[#1F4E78] to-blue-600 hover:from-blue-900 hover:to-blue-700 text-white'
                : 'bg-[#1F4E78] hover:bg-[#153654] text-white'
            }`}
          >
            {assignmentFlow === 'zalo' ? <Zap className="w-4 h-4 text-amber-300 fill-amber-300" /> : <Send className="w-4 h-4" />}
            <span>
              {isSubmitting 
                ? 'Đang xử lý...' 
                : editingId 
                  ? 'Cập nhật giao việc' 
                  : assignmentFlow === 'zalo' 
                    ? `⚡ Giao việc & Tự động Zalo (${selectedReceivers.length} người)` 
                    : `Giao việc nội bộ (${selectedReceivers.length} người)`}
            </span>
          </button>
        </div>
      </form>

      {/* Assigned Tasks History Table */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>Danh sách nhiệm vụ đã giao</span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {filteredAssignments.length} việc
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Theo dõi trạng thái tiếp nhận và tiến độ hoàn thành</p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedFilterMonth}
              onChange={(e) => setSelectedFilterMonth(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
            >
              <option value="Tất cả">Tất cả tháng</option>
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>

            <select
              value={filterReceiverId}
              onChange={(e) => setFilterReceiverId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
            >
              <option value="all">Tất cả nhân sự</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Tìm mã, tên, nhân sự..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:bg-white w-48"
              />
            </div>
          </div>
        </div>

        {/* Table Render */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#1F4E78] text-white font-bold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3 text-center w-10">STT</th>
                <th className="py-3 px-3">Mã GV</th>
                <th className="py-3 px-3">Nhân sự nhận</th>
                <th className="py-3 px-3">Nhiệm vụ</th>
                <th className="py-3 px-3 text-center">Điểm / K</th>
                <th className="py-3 px-3 text-center">Hạn chót</th>
                <th className="py-3 px-3 text-center">Trạng thái</th>
                <th className="py-3 px-3 text-center w-36">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Không tìm thấy nhiệm vụ giao việc nào trong bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((a, idx) => (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{a.assignmentId}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{a.receiver?.name || '-'}</div>
                      <div className="text-[10px] text-slate-500">{a.receiver?.phone || 'Chưa có SĐT'}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-800">
                        {a.taskCode && <span className="text-[#1F4E78] mr-1">[{a.taskCode}]</span>}
                        {a.taskName}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-xs">{a.productRequired || a.taskGroup}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="font-bold text-slate-800">{a.baseScore}</span>
                      <span className="text-slate-400 text-[10px] ml-1">(K: {a.suggestedCoef})</span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                      {formatDate(a.deadline)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        a.receiveStatus?.includes('Đã nhận') ? 'bg-emerald-100 text-emerald-800' :
                        a.receiveStatus?.includes('Từ chối') ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {a.receiveStatus || 'Chờ nhận việc'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* 1-Click Zalo Button */}
                        <button
                          type="button"
                          onClick={() => handleInstantZalo(a)}
                          className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[11px] font-bold border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Bắn lại thông báo Zalo 1-Chạm tức thì"
                        >
                          <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span>Zalo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEdit(a)}
                          className="p-1 text-slate-500 hover:text-blue-600 rounded hover:bg-slate-100"
                          title="Sửa nhiệm vụ"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRevoke(a)}
                          className="p-1 text-slate-500 hover:text-rose-600 rounded hover:bg-rose-50"
                          title="Thu hồi việc"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Zalo Configuration & Template Editor */}
      {showZaloModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 space-y-5 animate-in fade-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  ⚡
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Cấu hình Tự động hóa Zalo & Mẫu tin nhắn</h3>
                  <p className="text-xs text-slate-500">Lãnh đạo chỉ khai báo SĐT và tên 1 lần duy nhất trên hệ thống</p>
                </div>
              </div>
              <button onClick={() => setShowZaloModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Method Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">Phương thức gửi thông báo Zalo:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { id: 'webhook', title: 'Webhook Tự động', desc: 'n8n / Make / Bot Webhook' },
                    { id: 'group_webhook', title: 'Nhóm Zalo', desc: 'Phát thông báo vào Group' },
                    { id: 'oa_zns', title: 'Zalo ZNS', desc: 'Official Account chính thức' },
                    { id: 'direct_app', title: 'Direct App 1-Chạm', desc: 'Mở ứng dụng Zalo tức thì' },
                  ].map(m => (
                    <div
                      key={m.id}
                      onClick={() => setZaloConfig(prev => ({ ...prev, method: m.id as any }))}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        zaloConfig.method === m.id 
                          ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-500' 
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-black text-slate-800">{m.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sender Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tên Lãnh đạo / Người giao</label>
                  <input
                    type="text"
                    value={zaloConfig.senderName || ''}
                    onChange={(e) => setZaloConfig(prev => ({ ...prev, senderName: e.target.value }))}
                    placeholder="VD: Trưởng phòng KHTC"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">SĐT Lãnh đạo (Để kết nối Zalo)</label>
                  <input
                    type="text"
                    value={zaloConfig.senderPhone || ''}
                    onChange={(e) => setZaloConfig(prev => ({ ...prev, senderPhone: e.target.value }))}
                    placeholder="VD: 0988888888"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Webhook Input if applicable */}
              {zaloConfig.method === 'webhook' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Webhook URL (Zalo Bot / n8n / Make / ChatWork)</label>
                  <input
                    type="url"
                    value={zaloConfig.webhookUrl || ''}
                    onChange={(e) => setZaloConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                    placeholder="https://webhook.your-domain.com/zalo"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
              )}

              {/* Template Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Trình soạn thảo Mẫu tin nhắn Zalo:</label>
                  <span className="text-[10px] text-slate-500">Nhấp vào nút để chèn biến tự động</span>
                </div>

                {/* Variable inserters */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    '{NGUOI_NHAN}', '{NGUOI_GIAO}', '{TEN_VIEC}', '{MA_VIEC}',
                    '{NHOM_VIEC}', '{DIEM_CHUAN}', '{HE_SO}', '{SAN_PHAM}',
                    '{HAN_CHOT}', '{Y_KIEN_CHI_DAO}', '{VAI_TRO}', '{LINK_APP}'
                  ].map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setZaloConfig(prev => ({
                        ...prev,
                        defaultTemplate: (prev.defaultTemplate || '') + ' ' + tag
                      }))}
                      className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[10px] font-mono font-bold border border-blue-200"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={6}
                  value={zaloConfig.defaultTemplate || ''}
                  onChange={(e) => setZaloConfig(prev => ({ ...prev, defaultTemplate: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono leading-relaxed outline-none focus:bg-white"
                />
              </div>

              {/* Test section */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="SĐT nhận thử nghiệm..."
                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold w-44"
                  />
                  <button
                    type="button"
                    onClick={handleTestZalo}
                    disabled={isTestingZalo}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>🧪 Gửi thử nghiệm</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowZaloModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSaveZaloConfig}
                disabled={isSavingZalo}
                className="px-5 py-2 bg-[#1F4E78] hover:bg-[#153654] text-white rounded-xl text-xs font-bold transition"
              >
                {isSavingZalo ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
