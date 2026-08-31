import React, { useState, useEffect } from 'react';
import { 
  Clock, Calendar, Search, Plus, Edit3, Printer, ExternalLink, 
  Trash2, RefreshCw, CheckCircle2, AlertCircle, Check, X, FileText, User
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { STANDARD_MONTHS, getActiveLoggedInUser, safeFetch, safeParseResponse } from '../utils';

export default function OtMy() {
  const [overtimes, setOvertimes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  // Edit / Report result modal
  const [editingOt, setEditingOt] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const fetchOvertimes = async () => {
    setIsLoading(true);
    try {
      const [resO, resU] = await Promise.all([
        safeFetch('/api/overtimes'),
        safeFetch('/api/users')
      ]);
      const [dO, dU] = await Promise.all([
        safeParseResponse(resO),
        safeParseResponse(resU)
      ]);
      if (dO.success) setOvertimes(dO.data || []);
      if (dU.success && dU.data?.length > 0) {
        setUsers(dU.data);
        const active = getActiveLoggedInUser(dU.data);
        setCurrentUser(active);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOvertimes();

    const handleUserChange = () => {
      if (users.length > 0) {
        const active = getActiveLoggedInUser(users);
        setCurrentUser(active);
      }
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, [users.length]);

  const formatMonth = (m: string) => {
    if (!m) return "";
    const match = m.match(/(0[1-9]|1[0-2])-(20\d{2})/);
    return match ? match[0] : m;
  };

  const filteredOvertimes = overtimes.filter(o => {
    if (o.isDeleted) return false;
    // Strictly filter by currently logged in user
    if (currentUser && o.userId !== currentUser.id) return false;
    if (selectedMonth !== 'Tất cả' && formatMonth(o.month) !== selectedMonth) return false;
    if (filterStatus !== 'all' && o.approvalStatus !== filterStatus) return false;
    return true;
  });

  const formatOtHours = (hrs: number | string | null | undefined) => {
    if (hrs === null || hrs === undefined || hrs === '') return '0';
    const num = typeof hrs === 'string' ? parseFloat(hrs) : hrs;
    if (isNaN(num)) return '0';
    const rounded = Math.round(num * 10) / 10;
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  };

  const totalHours = filteredOvertimes.reduce((sum, o) => sum + (parseFloat(o.approvedHours || o.totalRegHours || '0') || 0), 0);
  const approvedCount = filteredOvertimes.filter(o => o.approvalStatus === 'Đã duyệt').length;
  const pendingCount = filteredOvertimes.filter(o => o.approvalStatus === 'Chờ duyệt').length;

  const handleSaveResult = async () => {
    if (!editingOt) return;
    setIsUpdating(true);
    try {
      const payload: any = {
        actualResult: editingOt.actualResult || '',
        evidence: editingOt.evidence || '',
        employeeNote: editingOt.employeeNote || '',
        content: editingOt.content || '',
        reason: editingOt.reason || '',
        project: editingOt.project || '',
      };

      if (editingOt.allowEdit || editingOt.approvalStatus === 'Cho phép sửa' || editingOt.approvalStatus === 'Yêu cầu bổ sung') {
        payload.approvalStatus = 'Chờ duyệt';
        payload.allowEdit = false;
      }

      const res = await fetch(`/api/overtimes/${editingOt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setOvertimes(overtimes.map(o => o.id === editingOt.id ? { ...o, ...payload, ...(data.data || {}) } : o));
        setEditingOt(null);
      } else {
        alert("Lỗi khi lưu: " + (data.error || "Không xác định"));
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối máy chủ");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa phiếu làm thêm này?")) return;
    try {
      const res = await fetch(`/api/overtimes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setOvertimes(overtimes.filter(o => o.id !== id));
      } else {
        alert("Lỗi: " + data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto pb-12 px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0f2440] tracking-tight flex items-center gap-2">
            <Clock className="w-7 h-7 text-amber-600" />
            Làm thêm ngoài giờ của tôi
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Báo cáo kết quả công việc thực tế, nộp minh chứng và theo dõi duyệt giờ làm thêm ngoài giờ.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/ot-print"
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-sm shadow-xs transition-all"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>In bảng tổng hợp làm thêm</span>
          </Link>
          <Link
            to="/ot-register"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Đăng ký làm thêm</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase">Tổng số lượt làm thêm</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{filteredOvertimes.length} lượt</div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase">Tổng thời gian (giờ)</span>
          <div className="text-2xl font-black text-amber-600 mt-1">{formatOtHours(totalHours)} giờ</div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase">Trạng thái duyệt</span>
          <div className="text-sm font-bold text-slate-700 mt-2 flex items-center gap-2">
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">{approvedCount} đã duyệt</span>
            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">{pendingCount} chờ duyệt</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-amber-600" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="Tất cả">Tất cả tháng</option>
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>

          {/* Personal Identity Badge */}
          <div className="flex items-center gap-2 bg-blue-50/90 border border-blue-200/90 px-3 py-1.5 rounded-xl">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#17466e] to-[#2f75b5] text-white flex items-center justify-center text-[10px] font-black shrink-0">
              {getInitials(currentUser?.name)}
            </div>
            <div className="text-xs font-black text-[#1F4E78] truncate max-w-[150px]">
              {currentUser?.name || 'Đang tải...'}
            </div>
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3 py-2 outline-none"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="Chờ duyệt">Chờ duyệt</option>
            <option value="Đã duyệt">Đã duyệt</option>
            <option value="Yêu cầu bổ sung">Yêu cầu bổ sung</option>
            <option value="Cho phép sửa">Cho phép sửa</option>
            <option value="Không duyệt">Không duyệt</option>
            <option value="Đã hủy">Đã hủy</option>
          </select>
        </div>

        <button 
          onClick={fetchOvertimes}
          className="p-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100"
          title="Làm mới"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <th className="py-3 px-3 text-center w-10">STT</th>
                <th className="py-3 px-3 text-center">Ngày làm thêm</th>
                <th className="py-3 px-3 text-center">Khung giờ</th>
                <th className="py-3 px-3 text-center">Số giờ</th>
                <th className="py-3 px-3 min-w-[220px]">Nội dung & Lý do</th>
                <th className="py-3 px-3 min-w-[180px]">Kết quả thực tế / Minh chứng</th>
                <th className="py-3 px-3 text-center">Trạng thái</th>
                <th className="py-3 px-3 text-center min-w-[80px]">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredOvertimes.map((o, idx) => (
                <tr key={o.id} className="hover:bg-amber-50/20 transition-colors">
                  <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-3 px-3 text-center font-semibold text-slate-800">
                    {o.otDate ? new Date(o.otDate).toLocaleDateString('vi-VN') : '-'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-slate-600">
                    {o.startTime} - {o.endTime}
                  </td>
                  <td className="py-3 px-3 text-center font-black text-amber-800">
                    {formatOtHours(o.approvedHours || o.totalRegHours)} h
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900">{o.content}</div>
                    {o.reason && <div className="text-[11px] text-slate-500 mt-0.5 italic">Lý do: {o.reason}</div>}
                    {o.approverNote && (
                      <div className="mt-1.5 p-1.5 bg-amber-50 rounded border border-amber-200 text-[11px] text-amber-900">
                        <strong>Ý kiến lãnh đạo:</strong> {o.approverNote}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {o.actualResult ? (
                      <div className="text-slate-800 font-medium">{o.actualResult}</div>
                    ) : (
                      <span className="text-amber-600 italic text-[11px]">Chưa báo cáo kết quả</span>
                    )}
                    {o.evidence && (
                      <a 
                        href={o.evidence} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-semibold hover:underline mt-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Minh chứng</span>
                      </a>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full font-bold text-[11px] border ${
                      o.approvalStatus === 'Đã duyệt' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                      o.approvalStatus === 'Yêu cầu bổ sung' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                      o.approvalStatus === 'Cho phép sửa' ? 'bg-sky-100 text-sky-800 border-sky-200' :
                      o.approvalStatus === 'Không duyệt' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                      o.approvalStatus === 'Đã hủy' || o.approvalStatus === 'Hủy đăng ký' ? 'bg-slate-200 text-slate-700 border-slate-300' :
                      'bg-amber-100 text-amber-800 border-amber-200'
                    }`}>
                      {o.approvalStatus || 'Chờ duyệt'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setEditingOt({ ...o })}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg"
                        title={o.allowEdit || o.approvalStatus === 'Cho phép sửa' || o.approvalStatus === 'Yêu cầu bổ sung' ? "Chỉnh sửa đăng ký & Báo cáo kết quả" : "Báo cáo kết quả thực tế & Minh chứng"}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {(!o.approvalStatus || o.approvalStatus === 'Chờ duyệt' || o.allowEdit || o.approvalStatus === 'Cho phép sửa') && (
                        <button
                          onClick={() => handleDelete(o.id)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg"
                          title="Xóa phiếu"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredOvertimes.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Clock className="w-8 h-8 text-slate-300" />
                      <p className="text-sm">Không có dữ liệu làm thêm ngoài giờ cho điều kiện lọc!</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingOt && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <span>Báo cáo kết quả & Minh chứng làm thêm</span>
              </h3>
              <button 
                onClick={() => setEditingOt(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {editingOt.approverNote && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                  <div className="font-bold mb-0.5 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Ý kiến phản hồi từ lãnh đạo:</span>
                  </div>
                  <div className="text-xs">{editingOt.approverNote}</div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nội dung công việc <span className="text-red-500">*</span></label>
                {editingOt.allowEdit || editingOt.approvalStatus === 'Cho phép sửa' || editingOt.approvalStatus === 'Yêu cầu bổ sung' || !editingOt.approvalStatus || editingOt.approvalStatus === 'Chờ duyệt' ? (
                  <textarea
                    rows={2}
                    value={editingOt.content || ''}
                    onChange={(e) => setEditingOt({ ...editingOt, content: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                ) : (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800">
                    {editingOt.content}
                  </div>
                )}
              </div>

              {(editingOt.allowEdit || editingOt.approvalStatus === 'Cho phép sửa' || editingOt.approvalStatus === 'Yêu cầu bổ sung') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Lý do làm thêm</label>
                    <input
                      type="text"
                      value={editingOt.reason || ''}
                      onChange={(e) => setEditingOt({ ...editingOt, reason: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Dự án</label>
                    <input
                      type="text"
                      value={editingOt.project || ''}
                      onChange={(e) => setEditingOt({ ...editingOt, project: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Kết quả thực hiện thực tế sau ca làm thêm <span className="text-red-500">*</span></label>
                <textarea 
                  rows={3}
                  value={editingOt.actualResult || ''}
                  onChange={(e) => setEditingOt({ ...editingOt, actualResult: e.target.value })}
                  placeholder="Mô tả cụ thể đã hoàn thành hồ sơ gì, khối lượng đạt được..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Đường dẫn minh chứng đính kèm (URL Drive / Báo cáo hoàn thành)</label>
                <input 
                  type="text"
                  value={editingOt.evidence || ''}
                  onChange={(e) => setEditingOt({ ...editingOt, evidence: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs text-blue-600 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú giải trình thêm (nếu có)</label>
                <textarea 
                  rows={2}
                  value={editingOt.employeeNote || ''}
                  onChange={(e) => setEditingOt({ ...editingOt, employeeNote: e.target.value })}
                  placeholder="Ghi chú thêm..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setEditingOt(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Hủy
              </button>
              <button 
                type="button" 
                disabled={isUpdating}
                onClick={handleSaveResult}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
              >
                {isUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Lưu báo cáo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
