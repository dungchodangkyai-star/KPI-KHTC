import React, { useState, useEffect } from 'react';
import { 
  Clock, Calendar, User, FileText, Check, RefreshCw, 
  ArrowLeft, CheckCircle2, AlertCircle, Upload, FileDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { STANDARD_MONTHS, getActiveLoggedInUser } from '../utils';

export default function OtRegister() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const [formData, setFormData] = useState({
    month: '08-2026',
    userId: 0,
    regDate: new Date().toISOString().split('T')[0],
    otDate: new Date().toISOString().split('T')[0],
    startTime: '17:00',
    endTime: '20:30',
    breakMinutes: 0,
    totalRegHours: '3.5',
    content: '',
    reason: '',
    project: '',
    expectedResult: '',
    employeeNote: '',
    approvalStatus: 'Chờ duyệt'
  });

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        if (data.success && data.data?.length > 0) {
          setUsers(data.data);
          const active = getActiveLoggedInUser(data.data);
          setCurrentUser(active);
          if (active) {
            setFormData(prev => ({ ...prev, userId: active.id }));
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchUsers();

    const handleUserChange = () => {
      if (users.length > 0) {
        const active = getActiveLoggedInUser(users);
        setCurrentUser(active);
        if (active) {
          setFormData(prev => ({ ...prev, userId: active.id }));
        }
      }
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, [users.length]);

  // Calculate hours automatically
  const calculateHours = (start: string, end: string, breakMins: number) => {
    try {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      let diffMinutes = (eh * 60 + em) - (sh * 60 + sm) - breakMins;
      if (diffMinutes < 0) diffMinutes = 0;
      const hours = Math.round((diffMinutes / 60) * 10) / 10;
      return String(hours);
    } catch {
      return "0";
    }
  };

  const handleTimeChange = (start: string, end: string, breakM: number) => {
    const h = calculateHours(start, end, breakM);
    setFormData(prev => ({
      ...prev,
      startTime: start,
      endTime: end,
      breakMinutes: breakM,
      totalRegHours: h
    }));
  };

  const handleDownloadTemplate = () => {
    const data = [{
      'Tháng': '08-2026',
      'Người thực hiện (ID)': 1,
      'Ngày làm thêm': '2026-08-15',
      'Giờ BĐ': '18:00',
      'Giờ HT': '21:00',
      'Nội dung công việc': 'Hoàn thiện báo cáo',
      'Trạng thái': 'Chờ duyệt'
    }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mau_OT");
    XLSX.writeFile(wb, "Mau_Nhap_OT.xlsx");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        let successCount = 0;
        for (const row of data as any[]) {
          const userQuery = row['Người thực hiện (ID)'] || row['Họ và tên'] || row['Nhân viên'] || row['Email'];
          let matchedUserId = currentUser?.id || 1;
          if (userQuery) {
            const found = users.find(u => 
              String(u.id) === String(userQuery) || 
              u.name?.toLowerCase().includes(String(userQuery).toLowerCase()) ||
              u.email?.toLowerCase() === String(userQuery).toLowerCase()
            );
            if (found) matchedUserId = found.id;
          }
          const matchedUser = users.find(u => u.id === matchedUserId) || currentUser;

          const payload = {
            month: row['Tháng'] || '08-2026',
            userId: matchedUserId,
            userName: matchedUser?.name,
            userEmail: matchedUser?.email,
            otDate: row['Ngày làm thêm'] || row['Ngày'],
            startTime: row['Giờ BĐ'] || row['Giờ bắt đầu'] || '17:00',
            endTime: row['Giờ HT'] || row['Giờ kết thúc'] || '20:30',
            content: row['Nội dung công việc'] || row['Nội dung'],
            reason: row['Lý do'] || 'Xử lý công việc cấp bách',
            approvalStatus: row['Trạng thái'] || 'Chờ duyệt'
          };
          if (!payload.content || !payload.otDate) continue;
          
          await fetch('/api/overtimes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          successCount++;
        }
        alert(`Đã import thành công ${successCount} phiếu OT.`);
      } catch (err) {
        console.error(err);
        alert('Lỗi import file Excel.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.content.trim()) {
      alert("Vui lòng nhập nội dung công việc làm thêm!");
      return;
    }
    if (!formData.reason.trim()) {
      alert("Vui lòng nhập lý do làm thêm ngoài giờ!");
      return;
    }

    setIsSubmitting(true);
    try {
      const targetUser = users.find(u => u.id === formData.userId) || currentUser;
      const otId = `OT-${formData.month}-${Date.now().toString().slice(-4)}`;
      const payload = {
        ...formData,
        userId: targetUser ? targetUser.id : (currentUser?.id || formData.userId),
        userName: targetUser ? targetUser.name : currentUser?.name,
        userEmail: targetUser ? targetUser.email : currentUser?.email,
        otId,
        regDate: new Date(formData.regDate),
        otDate: new Date(formData.otDate)
      };
      const res = await fetch('/api/overtimes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Đã gửi phiếu đăng ký làm thêm ngoài giờ thành công!");
        setTimeout(() => {
          navigate('/ot-my');
        }, 1200);
      } else {
        alert("Lỗi khi lưu: " + (data.error || "Không xác định"));
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối máy chủ");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[900px] mx-auto pb-12 px-2 sm:px-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-[#0f2440] tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-amber-600" />
            Đăng ký làm thêm ngoài giờ
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Lập phiếu đề xuất làm thêm giờ / ngày nghỉ trình Lãnh đạo phê duyệt theo quy định.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
            title="Tải file mẫu"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tải mẫu</span>
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer transition-colors" title="Nhập từ Excel">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImport} />
          </label>
          <button 
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-3 py-1.5 rounded-xl shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 font-bold text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage} Đang chuyển hướng...</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        {/* Row 1: General */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Tháng đề xuất <span className="text-red-500">*</span></label>
            <select 
              value={formData.month}
              onChange={(e) => setFormData({ ...formData, month: e.target.value })}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-[#1F4E78] outline-none focus:ring-2 focus:ring-[#1F4E78]"
            >
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Người làm thêm <span className="text-red-500">*</span></label>
            {currentUser?.role === 'ADMIN' || currentUser?.role === 'LEADER' ? (
              <select
                value={formData.userId || currentUser?.id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, userId: Number(e.target.value) }))}
                className="w-full p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl text-sm font-bold text-[#1F4E78] outline-none focus:ring-2 focus:ring-[#1F4E78]"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.position || 'Chuyên viên'} - {u.group || 'Phòng'})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2.5 p-2 bg-blue-50/80 border border-blue-200 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#17466e] to-[#2f75b5] text-white flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
                  {getInitials(currentUser?.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-[#1F4E78] truncate">{currentUser?.name || 'Đang tải...'}</div>
                  <div className="text-[10px] text-slate-500 font-medium">{currentUser?.position || 'Chuyên viên'}</div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Ngày làm thêm <span className="text-red-500">*</span></label>
            <input 
              type="date"
              required
              value={formData.otDate}
              onChange={(e) => setFormData({ ...formData, otDate: e.target.value })}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
            />
          </div>
        </div>

        {/* Row 2: Time Calculation */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 sm:p-5">
          <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-700" />
            <span>Khung giờ thực hiện & Tổng thời gian</span>
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Giờ bắt đầu</label>
              <input 
                type="time"
                value={formData.startTime}
                onChange={(e) => handleTimeChange(e.target.value, formData.endTime, formData.breakMinutes)}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Giờ kết thúc</label>
              <input 
                type="time"
                value={formData.endTime}
                onChange={(e) => handleTimeChange(formData.startTime, e.target.value, formData.breakMinutes)}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nghỉ giữa giờ (phút)</label>
              <input 
                type="number"
                min="0"
                step="15"
                value={formData.breakMinutes}
                onChange={(e) => handleTimeChange(formData.startTime, formData.endTime, parseInt(e.target.value || '0'))}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-sm text-center outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1">Tổng giờ đăng ký</label>
              <input 
                type="text"
                readOnly
                value={`${formData.totalRegHours} giờ`}
                className="w-full p-2 bg-amber-100 border border-amber-300 rounded-xl text-sm font-black text-amber-900 text-center cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Row 3: Content & Reason */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Nội dung công việc làm thêm <span className="text-red-500">*</span></label>
            <textarea 
              rows={3}
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="VD: Tổng hợp số liệu quyết toán, hoàn thiện hồ sơ gửi Kho bạc..."
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Lý do cần làm thêm ngoài giờ <span className="text-red-500">*</span></label>
              <textarea 
                rows={2}
                required
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="VD: Hồ sơ gấp phục vụ thanh tra / chỉ đạo hỏa tốc của UBND tỉnh..."
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Kết quả dự kiến đạt được</label>
              <textarea 
                rows={2}
                value={formData.expectedResult}
                onChange={(e) => setFormData({ ...formData, expectedResult: e.target.value })}
                placeholder="VD: Hoàn thành bản dự thảo báo cáo hoặc hoàn tất chứng từ giải ngân..."
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Dự án liên quan</label>
            <input 
              type="text"
              value={formData.project}
              onChange={(e) => setFormData({ ...formData, project: e.target.value })}
              placeholder="VD: Dự án Đường vành đai phía Tây TP. Buôn Ma Thuột..."
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#1F4E78]"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button 
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-sm transition-colors"
          >
            Hủy bỏ
          </button>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>Gửi phiếu đăng ký</span>
          </button>
        </div>
      </form>
    </div>
  );
}
