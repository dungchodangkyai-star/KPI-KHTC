import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setActiveLoggedInUser, getActiveLoggedInUser, DEFAULT_INITIAL_PASSWORD, ADMIN_EMAIL } from '../utils';
import { 
  ShieldCheck, Lock, User as UserIcon, KeyRound, AlertCircle, 
  CheckCircle2, ArrowRight, Eye, EyeOff, Building2, 
  BarChart3, Clock, Layers, Award, FileSpreadsheet,
  Check, Phone, Mail, HelpCircle, Shield, ArrowUpRight,
  TrendingUp, Sparkles, CheckSquare, UserPlus, X, Send
} from 'lucide-react';
import { useOrgConfig } from '../contexts/OrgContext';

export default function Login() {
  const navigate = useNavigate();
  const { orgConfig } = useOrgConfig();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Registration Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    phone: '',
    zalo: '',
    position: 'Chuyên viên',
    group: 'Kế hoạch vốn',
    note: ''
  });

  // First time password change modal state
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changeError, setChangeError] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);

  useEffect(() => {
    // If already logged in and doesn't need password change, redirect to workspace
    const currentUser = getActiveLoggedInUser();
    if (currentUser && !currentUser.mustChangePassword) {
      if (currentUser.role === 'ADMIN' || currentUser.email?.toLowerCase() === 'khvanson@gmail.com' || currentUser.role === 'LEADER') {
        navigate('/monitor');
      } else {
        navigate('/my-works');
      }
    }

    // Load saved username if remember me was checked
    const savedUser = localStorage.getItem('saved_login_identifier');
    if (savedUser) {
      setLoginId(savedUser);
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginId.trim()) {
      setError('Vui lòng nhập Email hoặc Họ tên nhân sự đăng nhập.');
      return;
    }
    if (!password.trim()) {
      setError('Vui lòng nhập mật mã truy cập.');
      return;
    }

    if (rememberMe) {
      localStorage.setItem('saved_login_identifier', loginId.trim());
    } else {
      localStorage.removeItem('saved_login_identifier');
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

      // Check if user must change password (first time login with default password)
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

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (!registerForm.name.trim()) {
      setRegisterError('Vui lòng nhập họ và tên đầy đủ.');
      return;
    }
    if (!registerForm.email.trim()) {
      setRegisterError('Vui lòng nhập địa chỉ Email.');
      return;
    }
    if (!registerForm.phone.trim()) {
      setRegisterError('Vui lòng nhập số điện thoại liên hệ.');
      return;
    }

    setRegisterLoading(true);
    try {
      const res = await fetch('/api/auth/register-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setRegisterError(data.message || 'Gửi yêu cầu đăng ký không thành công.');
        setRegisterLoading(false);
        return;
      }

      setRegisterSuccess(true);
    } catch (err) {
      console.error("Registration request error:", err);
      setRegisterError('Không thể kết nối đến máy chủ. Vui lòng thử lại.');
    } finally {
      setRegisterLoading(false);
    }
  };

  const resetRegisterModal = () => {
    setShowRegisterModal(false);
    setRegisterSuccess(false);
    setRegisterError('');
    setRegisterForm({
      name: '',
      email: '',
      phone: '',
      zalo: '',
      position: 'Chuyên viên',
      group: 'Kế hoạch vốn',
      note: ''
    });
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
        headers: { 
          'Content-Type': 'application/json',
          ...(pendingUser?.id ? { 'x-user-id': String(pendingUser.id) } : {})
        },
        credentials: 'include',
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

      // Updated user with mustChangePassword = false
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-[#1F4E78] selection:text-white relative overflow-x-hidden">
      {/* Background Decorative Ambient Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none translate-y-1/3"></div>

      {/* Top Organization Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1F4E78] to-blue-500 border border-blue-400/30 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] sm:text-xs font-bold text-blue-300 uppercase tracking-wide line-clamp-1">
                {orgConfig.parentAgency || 'Ban QLDA đầu tư xây dựng công trình giao thông và nông nghiệp phát triển nông thôn tỉnh Đắk Lắk'}
              </div>
              <div className="text-sm sm:text-base font-black text-white tracking-tight flex items-center gap-2">
                <span>{orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính'}</span>
                <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="hidden sm:inline text-xs font-semibold text-emerald-400">Trực tuyến</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Cổng bảo mật SSL
            </span>
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="px-2.5 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-700/60 text-blue-200 transition-colors flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Trợ giúp</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace: Split 2-Column High-End Layout */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 w-full items-center">
          
          {/* Left Column: Brand & System Showcase */}
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
            
            {/* Title & Badge */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-xs font-bold text-blue-300 uppercase tracking-widest mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Phiên bản điều hành chính thức
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight uppercase leading-tight">
                {orgConfig.systemTitle || 'Hệ thống Quản lý Công việc & Đánh giá KPI'}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-slate-300 font-medium leading-relaxed">
                Nền tảng số hóa quản trị tiến độ nhiệm vụ, giám sát khối lượng, thẩm định giờ làm thêm và đánh giá hiệu suất (KPI) cá nhân minh bạch, chính xác.
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              
              {/* Feature 1 */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex items-start gap-3 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-tight">Giám sát tiến độ 24/7</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Theo dõi thời gian thực, tự động cảnh báo việc đến hạn, quá hạn và thiếu minh chứng.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex items-start gap-3 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-tight">Đánh giá KPI A/B/C/D</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Tự động tính điểm theo hệ số độ phức tạp, chất lượng và thời gian thực hiện chuẩn xác.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex items-start gap-3 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-tight">Quản lý làm thêm (OT)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Đăng ký trực tuyến, phê duyệt điện tử và tự động tổng hợp số giờ làm thêm thực tế.
                  </p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex items-start gap-3 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-tight">Báo cáo chuẩn hành chính</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Xuất biểu mẫu Excel, phiếu KPI cá nhân và báo cáo giao ban phòng đúng quy chuẩn văn bản.
                  </p>
                </div>
              </div>

            </div>

            {/* Live Security & Infrastructure Status Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-slate-950/80 border border-blue-900/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
                <div>
                  <span className="text-xs font-bold text-slate-200">Cơ sở dữ liệu đám mây an toàn</span>
                  <p className="text-[11px] text-slate-400">Tự động mã hóa mật mã chuẩn PBKDF2 & SHA-512</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-black text-blue-300">
                  {orgConfig.shortName ? `Phòng ${orgConfig.shortName}` : (orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính')}
                </span>
                <p className="text-[10px] text-slate-500">Năm điều hành 2026</p>
              </div>
            </div>

          </div>

          {/* Right Column: High-Contrast Official Login Form Card */}
          <div className="lg:col-span-5 w-full">
            <div className="bg-white rounded-3xl p-6 sm:p-8 md:p-9 shadow-2xl border border-slate-100 text-slate-900 relative">
              
              {/* Header inside Form Card */}
              <div className="flex items-start justify-between pb-5 mb-5 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-1.5 text-[#1F4E78] font-black text-xs uppercase tracking-wider mb-1">
                    <ShieldCheck className="w-4 h-4 text-[#1F4E78]" />
                    <span>Cổng đăng nhập hệ thống</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                    Xác thực truy cập
                  </h2>
                </div>

                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1F4E78] shadow-2xs">
                  <Lock className="w-5 h-5" />
                </div>
              </div>

              {/* Error Alert Box */}
              {error && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Đăng nhập không thành công</div>
                    <div className="text-rose-700 mt-0.5">{error}</div>
                  </div>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                
                {/* Email / Username Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                      Email hoặc họ tên nhân sự
                    </span>
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="VD: khvanson@gmail.com hoặc Khuất Văn Sơn"
                      required
                      className="w-full px-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:bg-white focus:border-[#1F4E78] focus:ring-3 focus:ring-blue-100 outline-none transition-all font-medium placeholder:text-slate-400"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Hỗ trợ đăng nhập bằng Email cá nhân hoặc Họ và tên tiếng Việt.
                  </p>
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      Mật mã truy cập
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowHelpModal(true)}
                      className="text-[11px] font-bold text-[#1F4E78] hover:underline"
                    >
                      Quên mật mã?
                    </button>
                  </div>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Nhập mật mã của bạn..."
                      required
                      className="w-full px-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:bg-white focus:border-[#1F4E78] focus:ring-3 focus:ring-blue-100 outline-none transition-all font-medium pr-10 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me Checkbox */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-[#1F4E78] focus:ring-[#1F4E78] border-slate-300 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-600">Ghi nhớ tên đăng nhập</span>
                  </label>
                </div>

                {/* Submit Button */}
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-[#1F4E78] hover:bg-[#163a5b] text-white py-3 px-6 rounded-xl text-sm font-extrabold transition-all shadow-md shadow-blue-900/15 hover:shadow-lg active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>ĐĂNG NHẬP HỆ THỐNG</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Register Account Action */}
              <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                <div className="text-xs text-slate-500 mb-2 font-medium">
                  Nhân sự mới chưa có tài khoản?
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRegisterSuccess(false);
                    setRegisterError('');
                    setShowRegisterModal(true);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black text-[#1F4E78] bg-blue-50/90 hover:bg-blue-100 border border-blue-200/90 transition-all shadow-2xs active:scale-[0.99]"
                >
                  <UserPlus className="w-4 h-4 text-[#1F4E78]" />
                  <span>ĐĂNG KÝ TÀI KHOẢN MỚI</span>
                </button>
              </div>

              {/* Technical Support Box */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-400" />
                  <span>Quản trị: <strong>Khuất Văn Sơn</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <Phone className="w-3.5 h-3.5 text-[#1F4E78]" />
                  <span>0906.234.585</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* REGISTRATION MODAL FOR NEW EMPLOYEES */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-7 animate-in zoom-in-95 duration-200 my-8">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#1F4E78] shadow-2xs shrink-0">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight leading-snug">
                    Đăng ký Tài khoản Nhân sự
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gửi thông tin để Quản trị viên (Khuất Văn Sơn) phê duyệt vào danh sách phòng.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={resetRegisterModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Registration Success View */}
            {registerSuccess ? (
              <div className="space-y-4 py-2 animate-in fade-in">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h4 className="text-base font-black text-emerald-950">
                    Gửi yêu cầu đăng ký thành công!
                  </h4>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    Thông tin tài khoản của bạn đã được chuyển đến tab <strong>Nhân sự & Tài khoản</strong> để Quản trị hệ thống phê duyệt.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2 leading-relaxed">
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Quy trình kích hoạt & Đăng nhập:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
                    <li>Sau khi được phê duyệt, tài khoản của bạn sẽ chính thức có mặt trong hệ thống.</li>
                    <li>Mật khẩu mặc định ban đầu được cấp là: <code className="font-mono bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-black">{DEFAULT_INITIAL_PASSWORD}</code></li>
                    <li>Ở lần đăng nhập đầu tiên, hệ thống sẽ tự động yêu cầu bạn <strong>đổi sang mật khẩu riêng</strong> để bắt đầu sử dụng.</li>
                  </ul>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={resetRegisterModal}
                    className="w-full py-3 bg-[#1F4E78] hover:bg-[#163a5b] text-white rounded-xl text-xs font-black transition shadow-md"
                  >
                    ĐÃ HIỂU & QUAY LẠI TRANG ĐĂNG NHẬP
                  </button>
                </div>
              </div>
            ) : (
              /* Registration Form */
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                {registerError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{registerError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Họ và tên đầy đủ <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={registerForm.name}
                      onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                      placeholder="VD: Nguyễn Văn An"
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email công vụ / cá nhân <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="email" 
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      placeholder="VD: nva@gmail.com"
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số điện thoại liên hệ <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="tel" 
                      value={registerForm.phone}
                      onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                      placeholder="VD: 0912.345.678"
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số Zalo (nếu có)
                    </label>
                    <input 
                      type="text" 
                      value={registerForm.zalo}
                      onChange={(e) => setRegisterForm({ ...registerForm, zalo: e.target.value })}
                      placeholder="VD: 0912.345.678"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Chức danh / Vị trí đề xuất
                    </label>
                    <select
                      value={registerForm.position}
                      onChange={(e) => setRegisterForm({ ...registerForm, position: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                    >
                      <option value="Chuyên viên">Chuyên viên</option>
                      <option value="Kế toán viên">Kế toán viên</option>
                      <option value="Kỹ sư">Kỹ sư</option>
                      <option value="Cán sự">Cán sự</option>
                      <option value="Phó Trưởng phòng">Phó Trưởng phòng</option>
                      <option value="Trưởng phòng">Trưởng phòng</option>
                      <option value="Khác">Vị trí khác</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tổ / Nhóm công tác đề xuất
                    </label>
                    <select
                      value={registerForm.group}
                      onChange={(e) => setRegisterForm({ ...registerForm, group: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                    >
                      <option value="Kế hoạch vốn">Nhóm Kế hoạch vốn</option>
                      <option value="Quyết toán">Nhóm Quyết toán</option>
                      <option value="Lựa chọn nhà thầu">Nhóm Lựa chọn nhà thầu</option>
                      <option value="Giám sát & Đánh giá ĐT">Nhóm Giám sát & Đánh giá ĐT</option>
                      <option value="Tài chính - Kế toán">Nhóm Tài chính - Kế toán</option>
                      <option value="Tổng hợp">Nhóm Tổng hợp</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ghi chú / Đề xuất thêm (tùy chọn)
                  </label>
                  <textarea 
                    rows={2}
                    value={registerForm.note}
                    onChange={(e) => setRegisterForm({ ...registerForm, note: e.target.value })}
                    placeholder="VD: Cán bộ mới tiếp nhận công tác tại phòng từ tháng 08/2026..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                  />
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-snug">
                  Sau khi bạn nhấn gửi, Quản trị viên phòng sẽ duyệt tài khoản và cấp mật khẩu mặc định (123456@) để bạn đăng nhập lần đầu.
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={resetRegisterModal}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={registerLoading}
                    className="inline-flex items-center gap-2 bg-[#1F4E78] hover:bg-[#173a5a] text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-md disabled:opacity-50"
                  >
                    {registerLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>GỬI YÊU CẦU ĐĂNG KÝ</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Mandatory First-Time Change Password Modal */}
      {showChangeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 mb-4 pb-3 border-b border-slate-100">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shadow-2xs">
                <KeyRound className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-snug">Thiết lập mật khẩu mới</h3>
                <p className="text-xs text-slate-500">Tài khoản: <span className="font-bold text-slate-800">{pendingUser?.name}</span></p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-4 text-xs text-blue-950 leading-relaxed">
              <p className="font-extrabold mb-0.5 text-blue-900 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                Bảo vệ tài khoản cá nhân:
              </p>
              <p>Để đảm bảo an toàn thông tin và tính bảo mật của dữ liệu đánh giá KPI, bạn cần đổi mật khẩu mặc định sang mật khẩu riêng (tối thiểu 6 ký tự).</p>
            </div>

            {changeError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{changeError}</span>
              </div>
            )}

            <form onSubmit={handleForceChangePassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                <div className="relative">
                  <input 
                    type={showNewPassword ? "text" : "password"} 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới..."
                    required
                    autoFocus
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Xác nhận lại mật khẩu mới</label>
                <input 
                  type={showNewPassword ? "text" : "password"} 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại chính xác mật khẩu mới..."
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowChangeModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Quay lại
                </button>
                <button
                  type="submit"
                  disabled={changeLoading}
                  className="inline-flex items-center gap-2 bg-[#1F4E78] hover:bg-[#173a5a] text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-md disabled:opacity-50"
                >
                  {changeLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Xác nhận & Vào làm việc</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Help & Technical Support Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-7 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-[#1F4E78]">
                <HelpCircle className="w-5 h-5" />
                <h3 className="text-base font-black uppercase tracking-tight">Hỗ trợ kỹ thuật & Quên mật khẩu</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowHelpModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200">
                <p className="font-bold text-[#1F4E78] mb-1">Quy định cấp lại mật khẩu:</p>
                <p>Nếu bạn quên mật khẩu truy cập hoặc chưa được cấp tài khoản, vui lòng liên hệ Quản trị viên hệ thống của phòng để được hỗ trợ reset về mật khẩu mặc định (<code>123456@</code>).</p>
              </div>

              <div className="space-y-2 pt-1 font-medium">
                <div className="flex items-center gap-2 text-slate-800">
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  <span><strong>Quản trị viên:</strong> Khuất Văn Sơn (Phó Trưởng phòng)</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span><strong>Điện thoại / Zalo:</strong> 0906.234.585</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800">
                  <Mail className="w-4 h-4 text-blue-600" />
                  <span><strong>Email tiếp nhận:</strong> khvanson@gmail.com</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-5 py-2.5 rounded-xl bg-[#1F4E78] text-white text-xs font-black hover:bg-[#163a5b] transition-colors"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-slate-500 border-t border-slate-800/60 bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© 2026 Hệ thống Quản lý công việc và Đánh giá KPI. Tác giả: <strong>Khuất Văn Sơn</strong></span>
          <span className="text-[11px] text-slate-400">Đơn vị: {orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính'}</span>
        </div>
      </footer>
    </div>
  );
}

