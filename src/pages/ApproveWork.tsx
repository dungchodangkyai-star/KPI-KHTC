import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, Filter, Search, CheckCircle2, AlertCircle, RefreshCw, 
  Eye, FileText, Download, Check, X, Clock, AlertTriangle, ExternalLink,
  Award, Layers, User, ChevronDown, Sparkles, MessageSquare, Send
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  STANDARD_MONTHS, 
  DEFAULT_TASK_GROUPS, 
  WORK_NATURE_COEFS,
  formatDate, 
  formatDateInput, 
  formatMonth,
  isSoftDeleted,
  getActiveLoggedInUser,
  formatScore,
  cleanPosition
} from '../utils';
import { Work, User as UserType, Assignment } from '../types';

export default function ApproveWork() {
  const [works, setWorks] = useState<Work[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [selectedUserId, setSelectedUserId] = useState<number | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedApproval, setSelectedApproval] = useState<string>('Chưa duyệt');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState("");

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBatchApproving, setIsBatchApproving] = useState(false);

  // Modal State for Reviewing & Scoring single item
  const [reviewingWork, setReviewingWork] = useState<Work | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'Duyệt' | 'Cần bổ sung' | 'Không duyệt'>('Duyệt');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewScore, setReviewScore] = useState<number | ''>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [resW, resU, resA] = await Promise.all([
        fetch('/api/works'),
        fetch('/api/users'),
        fetch('/api/assignments')
      ]);
      const [dW, dU, dA] = await Promise.all([resW.json(), resU.json(), resA.json()]);

      if (dW.success) setWorks(dW.data || []);
      if (dU.success && dU.data?.length > 0) {
        setUsers(dU.data);
        const active = getActiveLoggedInUser(dU.data);
        setCurrentUser(active);
      }
      if (dA.success) setAssignments(dA.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();

    const handleUserChange = () => {
      if (users.length > 0) {
        const active = getActiveLoggedInUser(users);
        setCurrentUser(active);
      }
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, [users.length]);

  // Filtered Works List
  const filteredWorks = works.filter(w => {
    if (isSoftDeleted(w)) return false;
    if (selectedMonth !== 'Tất cả' && formatMonth(w.month) !== selectedMonth) return false;
    if (selectedUserId !== 'all' && w.userId !== selectedUserId) return false;
    if (selectedGroup !== 'all' && w.taskGroup !== selectedGroup) return false;

    // Source filter
    if (selectedSource === 'assigned' && w.source !== 'Giao việc' && !w.sysNote?.includes('Giao bởi')) return false;
    if (selectedSource === 'self' && (w.source === 'Giao việc' || w.sysNote?.includes('Giao bởi'))) return false;

    // Approval status filter
    if (selectedApproval !== 'all') {
      const appr = String(w.leaderApproval || 'Chưa duyệt').trim();
      if (selectedApproval === 'Chưa duyệt' && (appr === 'Duyệt' || appr === 'Cần bổ sung' || appr === 'Không duyệt')) return false;
      if (selectedApproval === 'Duyệt' && appr !== 'Duyệt') return false;
      if (selectedApproval === 'Cần bổ sung' && appr !== 'Cần bổ sung') return false;
      if (selectedApproval === 'Không duyệt' && appr !== 'Không duyệt') return false;
    }

    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      const matchName = (w.taskName || '').toLowerCase().includes(kw);
      const matchCode = (w.taskCode || '').toLowerCase().includes(kw);
      const matchUser = (w.user?.name || '').toLowerCase().includes(kw);
      const matchDetail = (w.detail || '').toLowerCase().includes(kw);
      if (!matchName && !matchCode && !matchUser && !matchDetail) return false;
    }
    return true;
  });

  // Calculate metrics for current month
  const monthWorks = works.filter(w => !isSoftDeleted(w) && (selectedMonth === 'Tất cả' || formatMonth(w.month) === selectedMonth));
  const totalCount = monthWorks.length;
  const pendingCount = monthWorks.filter(w => !w.leaderApproval || w.leaderApproval === 'Chưa duyệt').length;
  const approvedCount = monthWorks.filter(w => w.leaderApproval === 'Duyệt').length;
  const supplementCount = monthWorks.filter(w => w.leaderApproval === 'Cần bổ sung').length;
  const rejectedCount = monthWorks.filter(w => w.leaderApproval === 'Không duyệt').length;

  // Open review modal
  const handleOpenReview = (w: Work) => {
    setReviewingWork(w);
    setReviewDecision(w.leaderApproval === 'Cần bổ sung' || w.leaderApproval === 'Không duyệt' ? w.leaderApproval : 'Duyệt');
    setReviewNote(w.leaderNote || '');
    setReviewScore(w.convertedScore ? Number(w.convertedScore) : '');
  };

  // Submit single review
  const handleSubmitReview = async () => {
    if (!reviewingWork) return;
    setIsSubmittingReview(true);
    setErrorMsg('');
    try {
      const payload: any = {
        leaderApproval: reviewDecision,
        leaderNote: reviewNote
      };
      if (reviewScore !== '' && !isNaN(Number(reviewScore))) {
        payload.convertedScore = String(reviewScore);
      }

      const res = await fetch(`/api/works/${reviewingWork.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await res.json();
      if (d.success) {
        setSuccessMsg(`Đã phê duyệt công việc của ${reviewingWork.user?.name || 'nhân viên'} thành công!`);
        setReviewingWork(null);
        fetchAll();
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setErrorMsg(d.error || 'Có lỗi khi lưu kết quả phê duyệt');
      }
    } catch (e: any) {
      setErrorMsg(String(e));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Batch Approve All Selected
  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn duyệt nhanh ${selectedIds.length} công việc đã chọn?`)) return;

    setIsBatchApproving(true);
    try {
      const promises = selectedIds.map(id => 
        fetch(`/api/works/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leaderApproval: 'Duyệt',
            leaderNote: 'Lãnh đạo phòng đã phê duyệt đạt yêu cầu.'
          })
        })
      );
      await Promise.all(promises);
      setSuccessMsg(`Đã phê duyệt thành công ${selectedIds.length} công việc!`);
      setSelectedIds([]);
      fetchAll();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      alert("Lỗi khi duyệt hàng loạt: " + String(e));
    } finally {
      setIsBatchApproving(false);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const dataToExport = filteredWorks.map((w, idx) => ({
      "STT": idx + 1,
      "Tháng": w.month,
      "Nhân viên": w.user?.name || '-',
      "Chức danh": cleanPosition(w.user?.position),
      "Nguồn việc": w.source === 'Giao việc' ? 'Được giao việc' : 'Tự đăng ký',
      "Mã việc": w.taskCode || '-',
      "Tên công việc": w.taskName || '-',
      "Nhóm": w.taskGroup || '-',
      "Tính chất": w.proposedNature || '-',
      "Hệ số": w.coef || '-',
      "Tiến độ": w.status || 'Đang xử lý',
      "Điểm QĐ": w.convertedScore || '0',
      "Minh chứng/Link": w.evidence || '-',
      "Trạng thái duyệt": w.leaderApproval || 'Chưa duyệt',
      "Ý kiến chỉ đạo của Lãnh đạo": w.leaderNote || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_sach_duyet_viec");
    XLSX.writeFile(wb, `Danh_sach_duyet_viec_${selectedMonth}.xlsx`);
  };

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

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100/80 text-[#1F4E78] uppercase tracking-wider border border-blue-200">
                Điều hành & Phê duyệt
              </span>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">Quy trình: DV-09</span>
            </div>
            <h1 className="text-2xl font-black text-[#0f2440] tracking-tight">Phê duyệt hồ sơ & Tiến độ công việc</h1>
            <p className="text-sm font-medium text-slate-600 max-w-4xl mt-1 leading-relaxed">
              Lãnh đạo phòng xem xét kết quả thực hiện, thẩm định minh chứng sản phẩm, phê duyệt và chấm điểm KPI trực tiếp cho toàn bộ nhân sự trong phòng.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={fetchAll} 
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Đồng bộ</span>
            </button>
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-xl transition-colors shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {successMsg && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mt-4 p-3.5 bg-red-50 border border-red-300 rounded-xl text-red-950 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-[#1F4E78] border-x border-b border-slate-300">
          <div className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Tổng công việc</div>
          <div className="text-2xl font-black text-[#1F4E78] mt-1">{totalCount}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Tháng {selectedMonth}</div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-amber-600 border-x border-b border-slate-300 bg-gradient-to-br from-white to-amber-50/50">
          <div className="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Đang chờ duyệt</span>
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1">{pendingCount}</div>
          <div className="text-[11px] text-amber-800 mt-0.5 font-bold">Cần thẩm định</div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-emerald-600 border-x border-b border-slate-300 bg-gradient-to-br from-white to-emerald-50/50">
          <div className="text-[11px] font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Đã phê duyệt</span>
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-1">{approvedCount}</div>
          <div className="text-[11px] text-emerald-800 mt-0.5 font-bold">Đạt chuẩn KPI</div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-orange-600 border-x border-b border-slate-300 bg-gradient-to-br from-white to-orange-50/50">
          <div className="text-[11px] font-black text-orange-950 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Cần bổ sung</span>
          </div>
          <div className="text-2xl font-black text-orange-950 mt-1">{supplementCount}</div>
          <div className="text-[11px] text-orange-800 mt-0.5 font-bold">Yêu cầu hoàn thiện</div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-red-600 border-x border-b border-slate-300 bg-gradient-to-br from-white to-red-50/50">
          <div className="text-[11px] font-black text-red-950 uppercase tracking-wider flex items-center gap-1">
            <X className="w-3.5 h-3.5" />
            <span>Không duyệt</span>
          </div>
          <div className="text-2xl font-black text-red-950 mt-1">{rejectedCount}</div>
          <div className="text-[11px] text-red-800 mt-0.5 font-bold">Không tính điểm</div>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
        {/* Filters and Batch Actions */}
        <div className="p-4 border-b border-slate-300 bg-slate-50/90 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#1F4E78]" />
            <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wide">
              Danh sách công việc cần xem xét duyệt ({filteredWorks.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Batch Approve Button */}
            {selectedIds.length > 0 && (
              <button
                onClick={handleBatchApprove}
                disabled={isBatchApproving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all border border-emerald-700"
              >
                <Check className="w-4 h-4" />
                <span>{isBatchApproving ? 'Đang duyệt...' : `Duyệt nhanh (${selectedIds.length})`}</span>
              </button>
            )}

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none shadow-2xs"
            >
              <option value="Tất cả">Tất cả tháng</option>
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>

            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="bg-white border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none max-w-[170px] shadow-2xs"
            >
              <option value="all">Tất cả nhân viên</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <select
              value={selectedApproval}
              onChange={(e) => setSelectedApproval(e.target.value)}
              className="bg-white border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none shadow-2xs"
            >
              <option value="all">Tất cả trạng thái duyệt</option>
              <option value="Chưa duyệt">Chưa duyệt</option>
              <option value="Duyệt">Đã duyệt</option>
              <option value="Cần bổ sung">Cần bổ sung</option>
              <option value="Không duyệt">Không duyệt</option>
            </select>

            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-white border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none shadow-2xs"
            >
              <option value="all">Tất cả nguồn việc</option>
              <option value="assigned">Được Lãnh đạo giao</option>
              <option value="self">Nhân viên tự đăng ký</option>
            </select>

            <div className="relative">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Tìm mã, tên việc..."
                className="w-40 bg-white border border-slate-300 text-xs font-bold text-slate-800 rounded-xl pl-8 pr-3 py-2 outline-none shadow-2xs"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#1F4E78] text-white font-black text-xs uppercase tracking-wider border-b border-blue-950">
                <th className="py-3 px-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filteredWorks.length && filteredWorks.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded text-[#1F4E78] focus:ring-0"
                  />
                </th>
                <th className="py-3 px-3">Nhân sự</th>
                <th className="py-3 px-3">Nguồn & Mã</th>
                <th className="py-3 px-3">Tên nhiệm vụ / Hồ sơ</th>
                <th className="py-3 px-3 text-center">Tiến độ</th>
                <th className="py-3 px-3 text-center">Điểm QĐ</th>
                <th className="py-3 px-3">Minh chứng</th>
                <th className="py-3 px-3">Kết quả duyệt</th>
                <th className="py-3 px-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-medium text-slate-700 bg-white">
              {filteredWorks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-400">
                    Không có công việc nào phù hợp với điều kiện lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredWorks.map((w) => {
                  const isAssigned = w.source === 'Giao việc' || w.sysNote?.includes('Giao bởi');
                  const isApproved = w.leaderApproval === 'Duyệt';
                  const isSupplement = w.leaderApproval === 'Cần bổ sung';
                  const isRejected = w.leaderApproval === 'Không duyệt';
                  const isPending = !isApproved && !isSupplement && !isRejected;

                  return (
                    <tr key={w.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(w.id)}
                          onChange={() => toggleSelectOne(w.id)}
                          className="rounded text-[#1F4E78] focus:ring-0"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800">{w.user?.name || '-'}</div>
                        <div className="text-[10px] text-slate-500">{w.user?.position || 'Chuyên viên'}</div>
                      </td>
                      <td className="py-3 px-3">
                        {isAssigned ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-[#1F4E78] border border-blue-200 mb-0.5">
                            Lãnh đạo giao
                          </span>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 mb-0.5">
                            Tự đăng ký
                          </span>
                        )}
                        <span className="font-bold text-[#1F4E78] block">{w.taskCode || `CV-${w.id}`}</span>
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        <div className="font-bold text-slate-800 line-clamp-2">{w.taskName}</div>
                        {w.detail && (
                          <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{w.detail}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {w.status === 'Hoàn thành' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Hoàn thành
                          </span>
                        ) : w.status === 'Chậm' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                            Chậm tiến độ
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            {w.status || 'Đang xử lý'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-black text-[#1F4E78]">
                        {formatScore(w.convertedScore)}
                      </td>
                      <td className="py-3 px-3">
                        {w.evidence ? (
                          <a
                            href={w.evidence.startsWith('http') ? w.evidence : `https://${w.evidence}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline max-w-[130px] truncate"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{w.evidence}</span>
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Chưa có link</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3" /> Chưa duyệt
                          </span>
                        )}
                        {isApproved && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <Check className="w-3 h-3" /> Đã duyệt
                            </span>
                            {w.leaderNote && (
                              <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5 italic">"{w.leaderNote}"</div>
                            )}
                          </div>
                        )}
                        {isSupplement && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-100 text-orange-800 border border-orange-200">
                              <AlertTriangle className="w-3 h-3" /> Cần bổ sung
                            </span>
                            {w.leaderNote && (
                              <div className="text-[10px] text-orange-600 line-clamp-1 mt-0.5 italic">"{w.leaderNote}"</div>
                            )}
                          </div>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-red-100 text-red-800 border border-red-200">
                            <X className="w-3 h-3" /> Không duyệt
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleOpenReview(w)}
                          className="px-3 py-1.5 bg-[#1F4E78] hover:bg-[#15385b] text-white text-xs font-bold rounded-xl transition-all shadow-xs"
                        >
                          Thẩm định / Chấm điểm
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {reviewingWork && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-[#1F4E78] font-black text-base">
                <CheckSquare className="w-5 h-5" />
                <span>Thẩm định & Phê duyệt kết quả công việc</span>
              </div>
              <button onClick={() => setReviewingWork(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Work info card */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#1F4E78] text-sm">[{reviewingWork.taskCode}] {reviewingWork.taskName}</span>
                {reviewingWork.source === 'Giao việc' ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-[#1F4E78]">
                    Việc Lãnh đạo giao
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                    Việc tự đăng ký
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <div><span className="font-bold">Nhân viên:</span> {reviewingWork.user?.name}</div>
                <div><span className="font-bold">Tháng:</span> {reviewingWork.month}</div>
                <div><span className="font-bold">Tiến độ nộp:</span> {reviewingWork.status}</div>
                <div><span className="font-bold">Tính chất:</span> {reviewingWork.proposedNature} (Hệ số {formatScore(reviewingWork.coef)})</div>
              </div>

              {reviewingWork.detail && (
                <div className="pt-1">
                  <span className="font-bold text-slate-700 block">Nội dung báo cáo chi tiết:</span>
                  <p className="text-slate-600 mt-0.5 bg-white p-2.5 rounded-lg border border-slate-200">{reviewingWork.detail}</p>
                </div>
              )}

              {reviewingWork.evidence && (
                <div className="pt-1">
                  <span className="font-bold text-slate-700 block">Minh chứng sản phẩm:</span>
                  <a 
                    href={reviewingWork.evidence.startsWith('http') ? reviewingWork.evidence : `https://${reviewingWork.evidence}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1 mt-0.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{reviewingWork.evidence}</span>
                  </a>
                </div>
              )}
            </div>

            {/* Approval Decision Controls */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Quyết định phê duyệt</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewDecision('Duyệt')}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                      reviewDecision === 'Duyệt'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>Duyệt đạt</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewDecision('Cần bổ sung')}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                      reviewDecision === 'Cần bổ sung'
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Cần bổ sung</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewDecision('Không duyệt')}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                      reviewDecision === 'Không duyệt'
                        ? 'bg-red-600 text-white border-red-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <X className="w-4 h-4" />
                    <span>Không duyệt</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Điểm quy đổi KPI chính thức
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={reviewScore}
                  onChange={(e) => setReviewScore(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Nhập điểm chính thức"
                  className="w-full text-xs font-bold text-[#1F4E78] p-3 border border-slate-300 rounded-xl outline-none focus:border-[#1F4E78]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Ý kiến chỉ đạo / Nhận xét của Lãnh đạo phòng
                </label>
                <textarea
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Ghi rõ ý kiến chỉ đạo, lý do cần bổ sung hoặc đánh giá chất lượng hồ sơ..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl outline-none focus:border-[#1F4E78]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReviewingWork(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={isSubmittingReview}
                className="px-6 py-2.5 text-xs font-black text-white bg-[#1F4E78] hover:bg-[#15385b] rounded-xl shadow-md disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmittingReview ? 'Đang lưu...' : 'Lưu kết quả phê duyệt'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
