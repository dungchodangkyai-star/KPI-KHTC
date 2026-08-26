import React, { useState, useEffect } from 'react';
import { 
  Clock, Calendar, Search, Filter, CheckCircle2, AlertCircle, RefreshCw, 
  Check, X, AlertTriangle, ExternalLink, User, CheckSquare, Square, 
  Edit3, Trash2, Download, FileText, Send, MessageSquare, ChevronDown, 
  Sparkles, Undo2, Ban
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { STANDARD_MONTHS, getActiveLoggedInUser, formatDate, formatMonth } from '../utils';

export default function OtApprove() {
  const [overtimes, setOvertimes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [selectedUserId, setSelectedUserId] = useState<string | number>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('Chờ duyệt');
  const [searchKeyword, setSearchKeyword] = useState('');

  // Row selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  // Custom approved hours map { [otId]: hours }
  const [approvedHoursMap, setApprovedHoursMap] = useState<Record<number, string>>({});

  // Bottom action bar
  const [approverNote, setApproverNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal inspection / edit
  const [inspectingOt, setInspectingOt] = useState<any | null>(null);

  const fetchOvertimesAndUsers = async () => {
    setIsLoading(true);
    try {
      const [resO, resU] = await Promise.all([
        fetch('/api/overtimes'),
        fetch('/api/users')
      ]);
      const [dO, dU] = await Promise.all([resO.json(), resU.json()]);
      
      if (dO.success) {
        setOvertimes(dO.data || []);
        // Initialize hours map
        const map: Record<number, string> = {};
        (dO.data || []).forEach((o: any) => {
          map[o.id] = String(o.approvedHours || o.totalRegHours || '0');
        });
        setApprovedHoursMap(map);
      }

      if (dU.success && dU.data?.length > 0) {
        setUsers(dU.data);
        const active = getActiveLoggedInUser(dU.data);
        setCurrentUser(active);
      }
    } catch (e) {
      console.error(e);
      setActionMessage({ type: 'error', text: 'Lỗi tải dữ liệu từ máy chủ' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOvertimesAndUsers();

    const handleUserChange = () => {
      if (users.length > 0) {
        const active = getActiveLoggedInUser(users);
        setCurrentUser(active);
      }
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, [users.length]);

  const formatOtHours = (hrs: number | string | null | undefined) => {
    if (hrs === null || hrs === undefined || hrs === '') return '0';
    const num = typeof hrs === 'string' ? parseFloat(hrs) : hrs;
    if (isNaN(num)) return '0';
    const rounded = Math.round(num * 10) / 10;
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  };

  const getInitials = (name?: string) => {
    if (!name) return 'NV';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Filtered overtimes
  const filteredOvertimes = overtimes.filter(o => {
    if (o.isDeleted) return false;
    if (selectedMonth !== 'Tất cả' && formatMonth(o.month) !== selectedMonth) return false;
    if (selectedUserId !== 'all' && String(o.userId) !== String(selectedUserId)) return false;
    
    if (selectedStatus !== 'all') {
      const st = (o.approvalStatus || 'Chờ duyệt').trim();
      if (selectedStatus === 'Chờ duyệt' && st !== 'Chờ duyệt') return false;
      if (selectedStatus === 'Đã duyệt' && st !== 'Đã duyệt') return false;
      if (selectedStatus === 'Yêu cầu bổ sung' && st !== 'Yêu cầu bổ sung') return false;
      if (selectedStatus === 'Không duyệt' && st !== 'Không duyệt') return false;
      if (selectedStatus === 'Cho phép sửa' && st !== 'Cho phép sửa') return false;
      if ((selectedStatus === 'Hủy đăng ký' || selectedStatus === 'Đã hủy') && st !== 'Đã hủy' && st !== 'Hủy đăng ký') return false;
    }

    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      const matchName = (o.user?.name || '').toLowerCase().includes(kw);
      const matchContent = (o.content || '').toLowerCase().includes(kw);
      const matchReason = (o.reason || '').toLowerCase().includes(kw);
      const matchProject = (o.project || '').toLowerCase().includes(kw);
      const matchResult = (o.actualResult || o.expectedResult || '').toLowerCase().includes(kw);
      if (!matchName && !matchContent && !matchReason && !matchProject && !matchResult) return false;
    }

    return true;
  });

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.length === filteredOvertimes.length && filteredOvertimes.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredOvertimes.map(o => o.id));
    }
  };

  const handleToggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleHourChange = (id: number, value: string) => {
    setApprovedHoursMap(prev => ({
      ...prev,
      [id]: value
    }));
  };

  // Perform Batch Action
  const handlePerformAction = async (actionType: 'approve' | 'supplement' | 'reject' | 'allow_edit' | 'cancel') => {
    if (selectedIds.length === 0) {
      alert("Vui lòng tích chọn ít nhất 1 dòng để thực hiện thao tác!");
      return;
    }

    const actionLabels: Record<string, string> = {
      approve: 'Phê duyệt',
      supplement: 'Yêu cầu bổ sung',
      reject: 'Không duyệt',
      allow_edit: 'Cho phép sửa',
      cancel: 'Hủy đăng ký'
    };

    const confirmText = `Bạn có chắc chắn muốn thực hiện "${actionLabels[actionType]}" cho ${selectedIds.length} dòng đã chọn?`;
    if (!window.confirm(confirmText)) return;

    setIsProcessing(true);
    setActionMessage(null);

    try {
      const res = await fetch('/api/overtimes/batch-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          action: actionType,
          approverNote: approverNote.trim(),
          approverId: currentUser?.id,
          hoursMap: approvedHoursMap
        })
      });

      const data = await res.json();
      if (data.success) {
        setActionMessage({
          type: 'success',
          text: `Đã thực hiện "${actionLabels[actionType]}" thành công cho ${data.count || selectedIds.length} phiếu làm thêm!`
        });
        setApproverNote('');
        setSelectedIds([]);
        // Re-fetch data
        await fetchOvertimesAndUsers();
      } else {
        setActionMessage({
          type: 'error',
          text: 'Lỗi: ' + (data.error || 'Không thể cập nhật')
        });
      }
    } catch (e) {
      console.error(e);
      setActionMessage({ type: 'error', text: 'Lỗi kết nối máy chủ' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Single Quick Action
  const handleQuickSingleAction = async (id: number, actionType: 'approve' | 'supplement' | 'reject' | 'allow_edit' | 'cancel', note?: string) => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/overtimes/batch-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [id],
          action: actionType,
          approverNote: note || approverNote.trim() || 'Xử lý trực tiếp',
          approverId: currentUser?.id,
          hoursMap: approvedHoursMap
        })
      });
      const data = await res.json();
      if (data.success) {
        await fetchOvertimesAndUsers();
        if (inspectingOt && inspectingOt.id === id) {
          setInspectingOt(null);
        }
      } else {
        alert("Lỗi: " + data.error);
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối máy chủ");
    } finally {
      setIsProcessing(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredOvertimes.length === 0) {
      alert("Không có dữ liệu để xuất");
      return;
    }

    const exportData = filteredOvertimes.map((o, idx) => ({
      "STT": idx + 1,
      "Tháng": o.month,
      "Ngày làm thêm": o.otDate ? new Date(o.otDate).toLocaleDateString('vi-VN') : '',
      "Nhân viên": o.user?.name || '',
      "Khung giờ": `${o.startTime || ''} - ${o.endTime || ''}`,
      "Giờ đăng ký": o.totalRegHours || '',
      "Giờ duyệt": approvedHoursMap[o.id] || o.approvedHours || o.totalRegHours || '',
      "Nội dung công việc": o.content || '',
      "Lý do làm thêm": o.reason || '',
      "Dự án": o.project || '',
      "Kết quả thực tế": o.actualResult || o.expectedResult || '',
      "Minh chứng": o.evidence || '',
      "Trạng thái": o.approvalStatus || 'Chờ duyệt',
      "Ý kiến phê duyệt": o.approverNote || '',
      "Người duyệt": o.approver?.name || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Duyet_Lam_Them");
    XLSX.writeFile(wb, `Danh_Sach_Duyet_Lam_Them_${selectedMonth}.xlsx`);
  };

  // Metrics for overview
  const monthOvertimes = overtimes.filter(o => !o.isDeleted && (selectedMonth === 'Tất cả' || formatMonth(o.month) === selectedMonth));
  const pendingCount = monthOvertimes.filter(o => !o.approvalStatus || o.approvalStatus === 'Chờ duyệt').length;
  const approvedCount = monthOvertimes.filter(o => o.approvalStatus === 'Đã duyệt').length;
  const supplementCount = monthOvertimes.filter(o => o.approvalStatus === 'Yêu cầu bổ sung').length;
  const rejectedCount = monthOvertimes.filter(o => o.approvalStatus === 'Không duyệt').length;
  const allowEditCount = monthOvertimes.filter(o => o.approvalStatus === 'Cho phép sửa').length;
  const cancelledCount = monthOvertimes.filter(o => o.approvalStatus === 'Đã hủy' || o.approvalStatus === 'Hủy đăng ký').length;
  
  const totalApprovedHours = monthOvertimes
    .filter(o => o.approvalStatus === 'Đã duyệt')
    .reduce((sum, o) => sum + (parseFloat(o.approvedHours || o.totalRegHours || '0') || 0), 0);

  return (
    <div className="max-w-[1500px] mx-auto pb-16 px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0f2440] tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            Duyệt làm thêm ngoài giờ
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Khu vực điều hành & phê duyệt: Xem xét đăng ký, điều chỉnh giờ duyệt, yêu cầu bổ sung minh chứng, cho phép sửa hoặc hủy đăng ký.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs shadow-xs transition-all"
            title="Xuất Excel danh sách lọc"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span>Xuất Excel</span>
          </button>
          
          <button
            onClick={fetchOvertimesAndUsers}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Tổng đăng ký</span>
          <div className="text-xl font-black text-slate-900 mt-1">{monthOvertimes.length} <span className="text-xs font-semibold text-slate-500">lượt</span></div>
        </div>

        <div className={`border p-3.5 rounded-2xl shadow-xs transition-all ${pendingCount > 0 ? 'bg-amber-50/80 border-amber-300' : 'bg-white border-slate-200'}`}>
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">Chờ phê duyệt</span>
          <div className="text-xl font-black text-amber-700 mt-1 flex items-center gap-1.5">
            {pendingCount}
            {pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Đã duyệt</span>
          <div className="text-xl font-black text-emerald-700 mt-1">
            {approvedCount} <span className="text-xs font-semibold text-slate-500">({formatOtHours(totalApprovedHours)}h)</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Cần bổ sung</span>
          <div className="text-xl font-black text-blue-700 mt-1">{supplementCount}</div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider block">Cho phép sửa</span>
          <div className="text-xl font-black text-sky-700 mt-1">{allowEditCount}</div>
        </div>

        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Từ chối / Hủy</span>
          <div className="text-xl font-black text-rose-700 mt-1">{rejectedCount + cancelledCount}</div>
        </div>
      </div>

      {/* Alert Messages */}
      {actionMessage && (
        <div className={`p-4 rounded-xl mb-6 flex items-center justify-between border ${
          actionMessage.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-red-50 border-red-300 text-red-900'
        }`}>
          <div className="flex items-center gap-2 text-sm font-bold">
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="p-1 hover:bg-black/5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Toolbar (Matching User Style & Requirements) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Month Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Tháng làm thêm</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none w-full cursor-pointer"
              >
                <option value="Tất cả">Tất cả các tháng</option>
                {STANDARD_MONTHS.map(m => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* User / Employee Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Nhân viên</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <User className="w-4 h-4 text-[#1F4E78] shrink-0" />
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none w-full cursor-pointer"
              >
                <option value="all">Tất cả nhân viên</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.position || 'Nhân sự'})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Trạng thái phê duyệt</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Filter className="w-4 h-4 text-slate-600 shrink-0" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none w-full cursor-pointer"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="Chờ duyệt">Chờ duyệt (Mới đăng ký)</option>
                <option value="Đã duyệt">Đã duyệt</option>
                <option value="Yêu cầu bổ sung">Yêu cầu bổ sung</option>
                <option value="Cho phép sửa">Cho phép sửa</option>
                <option value="Không duyệt">Không duyệt</option>
                <option value="Hủy đăng ký">Đã hủy / Hủy đăng ký</option>
              </select>
            </div>
          </div>

          {/* Search Keyword */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Tìm kiếm nội dung</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Nội dung, lý do, dự án..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="bg-transparent text-xs text-slate-800 outline-none w-full placeholder:text-slate-400 font-medium"
              />
              {searchKeyword && (
                <button onClick={() => setSearchKeyword('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Selected count feedback */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <span>Hiển thị: <strong className="text-slate-900">{filteredOvertimes.length}</strong> dòng</span>
            <span>Đã chọn: <strong className="text-[#1F4E78] font-black">{selectedIds.length}</strong> dòng</span>
          </div>

          {selectedIds.length > 0 && (
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-rose-600 font-bold hover:underline"
            >
              Bỏ chọn tất cả
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f3f4f6] border-b border-slate-300 text-slate-700 font-bold uppercase tracking-wider">
                <th className="py-3.5 px-3 text-center w-12">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-[#1F4E78]"
                    checked={filteredOvertimes.length > 0 && selectedIds.length === filteredOvertimes.length}
                    onChange={handleSelectAll}
                    title="Chọn tất cả"
                  />
                </th>
                <th className="py-3.5 px-3 text-center min-w-[90px]">Ngày</th>
                <th className="py-3.5 px-3 min-w-[160px]">Nhân viên</th>
                <th className="py-3.5 px-3 text-center min-w-[130px]">Giờ đăng ký</th>
                <th className="py-3.5 px-3 min-w-[340px]">Nội dung / Kết quả thực hiện</th>
                <th className="py-3.5 px-3 text-center min-w-[120px]">Trạng thái</th>
                <th className="py-3.5 px-3 text-center min-w-[110px]">Giờ duyệt</th>
                <th className="py-3.5 px-3 text-center min-w-[100px]">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
              {filteredOvertimes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Clock className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-sm text-slate-500">Không có bản ghi làm thêm nào thỏa mãn bộ lọc</p>
                    <p className="text-xs text-slate-400 mt-1">Thử thay đổi tháng hoặc trạng thái xem kết quả</p>
                  </td>
                </tr>
              ) : (
                filteredOvertimes.map((o) => {
                  const isSelected = selectedIds.includes(o.id);
                  const status = o.approvalStatus || 'Chờ duyệt';
                  const currentHourValue = approvedHoursMap[o.id] !== undefined ? approvedHoursMap[o.id] : (o.approvedHours || o.totalRegHours || '');

                  return (
                    <tr 
                      key={o.id} 
                      className={`transition-colors ${isSelected ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-amber-50/20'}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-[#1F4E78]"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(o.id)}
                        />
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-3 text-center font-bold text-slate-800 whitespace-nowrap">
                        {o.otDate ? new Date(o.otDate).toLocaleDateString('vi-VN') : '-'}
                      </td>

                      {/* Employee */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#17466e] to-[#2f75b5] text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-xs">
                            {getInitials(o.user?.name)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 leading-tight">{o.user?.name || 'Chưa rõ'}</div>
                            <div className="text-[11px] text-slate-500">{o.user?.position || o.user?.role || 'Nhân viên'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Registered Hours */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="font-mono font-semibold text-slate-700 text-xs">
                          {o.startTime || '17:00'} - {o.endTime || '20:30'}
                        </div>
                        <div className="text-amber-800 font-black text-xs mt-0.5">
                          {o.totalRegHours || '3.5'} giờ
                        </div>
                        {o.breakMinutes > 0 && (
                          <div className="text-[10px] text-slate-400">Nghỉ {o.breakMinutes}p</div>
                        )}
                      </td>

                      {/* Content / Result / Evidence */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1.5">
                          {/* Main registered content */}
                          <div className="font-bold text-slate-900 text-xs leading-snug">
                            {o.content || 'Không có nội dung'}
                          </div>

                          {/* Reason */}
                          {o.reason && (
                            <div className="text-[11px] text-slate-600">
                              <span className="font-bold text-slate-700">Lý do: </span>
                              <span>{o.reason}</span>
                            </div>
                          )}

                          {/* Project Tag */}
                          {o.project && (
                            <div className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold">
                              <span>Dự án: {o.project}</span>
                            </div>
                          )}

                          {/* Actual Result & Evidence */}
                          {(o.actualResult || o.expectedResult) && (
                            <div className="text-[11px] text-slate-800 bg-slate-50 p-1.5 rounded-lg border border-slate-200/80">
                              <span className="font-bold text-emerald-800">Kết quả: </span>
                              <span>{o.actualResult || o.expectedResult}</span>
                              {o.evidence && (
                                <a 
                                  href={o.evidence} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline ml-2"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Minh chứng</span>
                                </a>
                              )}
                            </div>
                          )}

                          {/* Previous Approver Note if any */}
                          {o.approverNote && (
                            <div className="text-[11px] text-amber-900 bg-amber-50/80 p-1.5 rounded-lg border border-amber-200">
                              <span className="font-bold">Ý kiến xử lý trước: </span>
                              <span>{o.approverNote}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-full font-bold text-[11px] border ${
                          status === 'Đã duyệt' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                          status === 'Yêu cầu bổ sung' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                          status === 'Không duyệt' ? 'bg-red-100 text-red-800 border-red-200' :
                          status === 'Cho phép sửa' ? 'bg-sky-100 text-sky-800 border-sky-200' :
                          status === 'Đã hủy' || status === 'Hủy đăng ký' ? 'bg-slate-200 text-slate-700 border-slate-300' :
                          'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                          {status}
                        </span>
                      </td>

                      {/* Approved Hours input field */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="24"
                            value={currentHourValue}
                            onChange={(e) => handleHourChange(o.id, e.target.value)}
                            className="w-16 p-1.5 text-center font-bold text-xs bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            title="Số giờ được lãnh đạo duyệt"
                          />
                          <span className="text-slate-500 font-bold text-xs">h</span>
                        </div>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setInspectingOt(o)}
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Xem chi tiết phiếu"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleQuickSingleAction(o.id, 'approve')}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Duyệt nhanh dòng này"
                          >
                            <Check className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleQuickSingleAction(o.id, 'reject')}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Từ chối nhanh"
                          >
                            <Ban className="w-4 h-4" />
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
      </div>

      {/* Processing & Actions Bar at Bottom (Strictly matching user specifications) */}
      <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-md">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#1F4E78]" />
          <span>Ý kiến xử lý & Thao tác phê duyệt</span>
          {selectedIds.length > 0 && (
            <span className="text-xs font-normal normal-case text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              Đang chọn {selectedIds.length} dòng
            </span>
          )}
        </h3>

        {/* Note textarea */}
        <div className="mb-4">
          <textarea
            rows={2}
            placeholder="Nhập ý kiến xử lý (Ví dụ: Đồng ý phê duyệt / Đề nghị bổ sung thêm tài liệu minh chứng / Hủy do trùng lịch công tác...)"
            value={approverNote}
            onChange={(e) => setApproverNote(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all placeholder:text-slate-400 font-medium"
          />

          {/* Quick Note Chips */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[11px] text-slate-500 font-medium">Mẫu nhanh:</span>
            {[
              'Đồng ý phê duyệt',
              'Đã kiểm tra kết quả & minh chứng đầy đủ',
              'Yêu cầu bổ sung link sản phẩm hoàn thành',
              'Không duyệt do vượt định mức đăng ký',
              'Cho phép sửa lại khung giờ và kết quả'
            ].map(txt => (
              <button
                key={txt}
                type="button"
                onClick={() => setApproverNote(txt)}
                className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors"
              >
                {txt}
              </button>
            ))}
          </div>
        </div>

        {/* Action Button Group matching layout and exact color codes */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {/* Duyệt dòng đã chọn (Green) */}
          <button
            type="button"
            disabled={isProcessing || selectedIds.length === 0}
            onClick={() => handlePerformAction('approve')}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Duyệt dòng đã chọn</span>
          </button>

          {/* Yêu cầu bổ sung (Slate / Light Blue) */}
          <button
            type="button"
            disabled={isProcessing || selectedIds.length === 0}
            onClick={() => handlePerformAction('supplement')}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 border border-slate-300 font-bold rounded-xl text-xs transition-all"
          >
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <span>Yêu cầu bổ sung</span>
          </button>

          {/* Không duyệt (Dark Red) */}
          <button
            type="button"
            disabled={isProcessing || selectedIds.length === 0}
            onClick={() => handlePerformAction('reject')}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#a61c1c] hover:bg-[#8f1818] disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs transition-all"
          >
            <Ban className="w-4 h-4" />
            <span>Không duyệt</span>
          </button>

          {/* Cho phép sửa (Light Blue) */}
          <button
            type="button"
            disabled={isProcessing || selectedIds.length === 0}
            onClick={() => handlePerformAction('allow_edit')}
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-100 hover:bg-sky-200 disabled:opacity-50 text-sky-900 border border-sky-300 font-bold rounded-xl text-xs transition-all"
          >
            <Edit3 className="w-4 h-4 text-sky-700" />
            <span>Cho phép sửa</span>
          </button>

          {/* Hủy đăng ký (Dark Red) */}
          <button
            type="button"
            disabled={isProcessing || selectedIds.length === 0}
            onClick={() => handlePerformAction('cancel')}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#a61c1c] hover:bg-[#8f1818] disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs transition-all"
          >
            <Trash2 className="w-4 h-4" />
            <span>Hủy đăng ký</span>
          </button>
        </div>
      </div>

      {/* Detail Inspection Modal */}
      {inspectingOt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <span>Chi tiết phiếu làm thêm ngoài giờ</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Mã phiếu: {inspectingOt.otId}</p>
              </div>
              <button
                onClick={() => setInspectingOt(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="font-bold text-slate-500 block mb-1">Nhân sự:</span>
                  <div className="font-bold text-slate-900 text-sm">{inspectingOt.user?.name}</div>
                  <div className="text-slate-500">{inspectingOt.user?.position || 'Nhân viên'}</div>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block mb-1">Thời gian:</span>
                  <div className="font-bold text-slate-900 text-sm">
                    {inspectingOt.otDate ? new Date(inspectingOt.otDate).toLocaleDateString('vi-VN') : ''}
                  </div>
                  <div className="text-amber-800 font-bold">
                    {inspectingOt.startTime} - {inspectingOt.endTime} ({inspectingOt.totalRegHours}h)
                  </div>
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-600 block mb-1">Nội dung công việc:</span>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium">
                  {inspectingOt.content}
                </div>
              </div>

              {inspectingOt.reason && (
                <div>
                  <span className="font-bold text-slate-600 block mb-1">Lý do làm thêm:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium">
                    {inspectingOt.reason}
                  </div>
                </div>
              )}

              <div>
                <span className="font-bold text-slate-600 block mb-1">Kết quả thực tế / Dự kiến:</span>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium">
                  {inspectingOt.actualResult || inspectingOt.expectedResult || 'Chưa báo cáo'}
                </div>
              </div>

              {inspectingOt.evidence && (
                <div>
                  <span className="font-bold text-slate-600 block mb-1">Link tài liệu / Minh chứng:</span>
                  <a
                    href={inspectingOt.evidence}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-blue-600 font-bold hover:underline p-2 bg-blue-50 border border-blue-200 rounded-xl break-all"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>{inspectingOt.evidence}</span>
                  </a>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInspectingOt(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSingleAction(inspectingOt.id, 'approve')}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl"
                >
                  Phê duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
