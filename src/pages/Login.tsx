import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setActiveLoggedInUser, getActiveLoggedInUser, DEFAULT_INITIAL_PASSWORD, ADMIN_EMAIL } from '../utils';
import { Shield, Lock, User as UserIcon, KeyRound, AlertCircle, CheckCircle2, ArrowRight, Eye, EyeOff, Sparkles, Building2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('khvanson@gmail.com');
  const [password, setPassword] = useState(DEFAULT_INITIAL_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [allUsersList, setAllUsersList] = useState<any[]>([]);

  // First time password change modal state
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);

  useEffect(() => {
    // If already logged in and doesn't need password change, can redirect
    const currentUser = getActiveLoggedInUser();
    if (currentUser && !currentUser.mustChangePassword) {
      if (currentUser.role === 'ADMIN' || currentUser.email?.toLowerCase() === 'khvanson@gmail.com' || currentUser.role === 'LEADER') {
        navigate('/monitor');
      } else {
        navigate('/my-works');
      }
    }

    // Load users list for quick-select convenience
    fetch('/api/users')
      .then(res => res.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setAllUsersList(res.data);
        }
      })
      .catch(e => console.error("Error loading users for login:", e));
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginId.trim()) {
      setError('Vui lòng nhập Email hoặc Họ tên đăng nhập.');
      return;
    }
    if (!password.trim()) {
      setError('Vui lòng nhập mật mã truy cập.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginId.trim(),
          password: password.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.');
        setLoading(false);
        return;
      }

      // Check if user must change password
      if (data.mustChangePassword) {
        setPendingUser(data.user);
        setShowChangeModal(true);
        setLoading(false);
        return;
      }

      // Login success
      setActiveLoggedInUser(data.user);
      if (data.user.role === 'ADMIN' || data.user.email?.toLowerCase() === 'khvanson@gmail.com' || data.user.role === 'LEADER') {
        navigate('/monitor');
      } else {
        navigate('/my-works');
      }
    } catch (err) {
      console.error("Login request error:", err);
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  const handleForceChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError('');

    if (!newPassword.trim()) {
      setChangeError('Vui lòng nhập mật khẩu mới.');
      return;
    }
    if (newPassword.trim().length < 6) {
      setChangeError('Mật khẩu mới phải có tối thiểu 6 ký tự.');
      return;
    }
    if (newPassword.trim() === DEFAULT_INITIAL_PASSWORD) {
      setChangeError('Vui lòng chọn mật khẩu mới khác với mật khẩu mặc định (123456@).');
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setChangeError('Xác nhận mật khẩu không khớp. Vui lòng nhập lại.');
      return;
    }

    setChangeLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: pendingUser.id,
          oldPassword: password.trim(),
          newPassword: newPassword.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setChangeError(data.message || 'Đổi mật khẩu thất bại.');
        setChangeLoading(false);
        return;
      }

      // Updated user
      const updatedUser = { ...data.user, mustChangePassword: false };
      setActiveLoggedInUser(updatedUser);
      setShowChangeModal(false);

      if (updatedUser.role === 'ADMIN' || updatedUser.email?.toLowerCase() === 'khvanson@gmail.com' || updatedUser.role === 'LEADER') {
        navigate('/monitor');
      } else {
        navigate('/my-works');
      }
    } catch (err) {
      console.error("Change password error:", err);
      setChangeError('Lỗi kết nối khi đổi mật khẩu.');
    } finally {
      setChangeLoading(false);
    }
  };

  const selectQuickUser = (user: any) => {
    setLoginId(user.email || user.name);
    setPassword(DEFAULT_INITIAL_PASSWORD);
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header Banner */}
      <header className="bg-gradient-to-r from-[#173a5a] via-[#1F4E78] to-[#173a5a] text-white py-6 px-4 text-center shadow-lg border-b border-blue-900/40">
        <div className="max-w-5xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-800/60 border border-blue-400/30 text-xs font-semibold uppercase tracking-wider mb-2.5 text-blue-100">
            <Building2 className="w-3.5 h-3.5" />
            Ban QLDA đầu tư xây dựng công trình giao thông và nông nghiệp phát triển nông thôn tỉnh Đắk Lắk
          </div>
          <h1 className="text-2xl md:text-[30px] font-black uppercase tracking-tight mb-2 text-white drop-shadow-sm">
            HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI
          </h1>
          <div className="inline-block bg-blue-950/40 border border-blue-400/20 px-4 py-1 rounded-lg text-sm md:text-[15px] font-bold text-blue-200">
            Phòng Kế hoạch - Tài chính
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
          <div className="p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-slate-100 gap-4">
              <div>
                <div className="flex items-center gap-2.5 text-[#1F4E78] font-bold text-xs uppercase tracking-wider mb-1">
                  <Shield className="w-4 h-4 text-[#1F4E78]" />
                  Cổng xác thực an toàn
                </div>
                <h2 className="text-2xl md:text-[26px] font-black text-slate-900 tracking-tight">
                  Đăng nhập hệ thống KPI
                </h2>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-900">
                <span className="font-bold">Mật khẩu mặc định:</span> <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded font-bold text-amber-950">{DEFAULT_INITIAL_PASSWORD}</code>
                <div className="text-[11px] text-amber-700 mt-0.5">Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên</div>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-sm animate-in fade-in">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Đăng nhập không thành công</div>
                  <div className="text-rose-700">{error}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    Email hoặc họ tên nhân sự
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="VD: khvanson@gmail.com hoặc Khuất Văn Sơn"
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none transition-all font-medium"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Quản trị viên: <span className="font-semibold text-slate-600">{ADMIN_EMAIL}</span>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-slate-400" />
                    Mật mã truy cập
                  </label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none transition-all font-medium pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Ban đầu mặc định: <span className="font-mono text-slate-600">{DEFAULT_INITIAL_PASSWORD}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-2 bg-[#1F4E78] hover:bg-[#173a5a] text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md shadow-blue-900/10 hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Đăng nhập hệ thống</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Demo User Picker */}
            {allUsersList.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Chọn nhanh tài khoản thử nghiệm / chuyển vai trò:
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {allUsersList.map((u) => {
                    const isAdmin = u.role === 'ADMIN' || u.email?.toLowerCase() === 'khvanson@gmail.com';
                    const isLeader = u.role === 'LEADER';
                    const isSelected = loginId.toLowerCase() === u.email?.toLowerCase() || loginId === u.name;

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => selectQuickUser(u)}
                        className={`text-left p-2.5 rounded-xl border text-xs transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-300 text-blue-950 font-bold shadow-sm ring-1 ring-blue-300'
                            : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="truncate font-semibold">{u.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            isAdmin ? 'bg-purple-100 text-purple-800' :
                            isLeader ? 'bg-blue-100 text-blue-800' :
                            'bg-slate-200 text-slate-700'
                          }`}>
                            {isAdmin ? 'Admin' : isLeader ? 'Lãnh đạo' : 'Chuyên viên'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Support Info Box */}
            <div className="mt-6 bg-slate-50 border border-slate-200/70 rounded-xl p-4 text-xs text-slate-600">
              <p className="mb-1 text-slate-700">
                Nếu quên tên đăng nhập hoặc mật mã truy cập, vui lòng liên hệ Quản trị hệ thống để được hỗ trợ đặt lại.
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-800 font-medium">
                <span><strong>Quản trị hệ thống:</strong> Khuất Văn Sơn</span>
                <span><strong>ĐT:</strong> 0906234585</span>
                <span><strong>Email:</strong> khvanson@gmail.com</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mandatory First-Time Change Password Modal */}
      {showChangeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 md:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Yêu cầu đổi mật khẩu lần đầu</h3>
                <p className="text-xs text-slate-500">Tài khoản: <span className="font-bold text-slate-800">{pendingUser?.name}</span> ({pendingUser?.email})</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-5 text-xs text-blue-900 leading-relaxed">
              <p className="font-semibold mb-1">Quy định bảo mật hệ thống:</p>
              <p>Hệ thống bắt buộc bạn phải đổi mật khẩu mặc định (<code className="font-mono font-bold text-blue-950">123456@</code>) sang mật khẩu riêng để bảo vệ tài khoản và dữ liệu đánh giá KPI.</p>
            </div>

            {changeError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{changeError}</span>
              </div>
            )}

            <form onSubmit={handleForceChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu hiện tại</label>
                <input 
                  type="password" 
                  value={password}
                  disabled
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Xác nhận mật khẩu mới</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới..."
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowChangeModal(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Quay lại đăng nhập
                </button>
                <button
                  type="submit"
                  disabled={changeLoading}
                  className="inline-flex items-center gap-2 bg-[#1F4E78] hover:bg-[#173a5a] text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  {changeLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Lưu mật khẩu & Vào hệ thống</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-500 border-t border-slate-200/60 bg-white">
        © 2026 Hệ thống quản lý công việc và đánh giá KPI. Tác giả: Khuất Văn Sơn | ĐT: 0906234585 | Email: khvanson@gmail.com
      </footer>
    </div>
  );
}
