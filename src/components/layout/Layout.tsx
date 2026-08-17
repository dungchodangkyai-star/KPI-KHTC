import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Activity, PlusCircle, List, 
  Clock, CheckCircle2, Printer, 
  Edit, Award, FileText, 
  Send, CheckSquare, Settings, 
  Database, Users, LayoutDashboard, BarChart3, Radio, ChevronDown, UserCheck,
  Bell, AlertCircle, KeyRound, LogOut, ShieldCheck, Lock
} from 'lucide-react';
import { 
  cn, 
  getActiveLoggedInUser, 
  setActiveLoggedInUser, 
  clearActiveLoggedInUser, 
  canAccessRoute, 
  formatDate,
  DEFAULT_INITIAL_PASSWORD,
  ADMIN_EMAIL
} from '../../utils';

const allNavGroups = [
  {
    title: 'CÔNG VIỆC HẰNG NGÀY',
    isPersonal: true,
    items: [
      { name: 'Nhập công việc', href: '/input', icon: PlusCircle, desc: 'Ghi nhận công việc cá nhân' },
      { name: 'Công việc của tôi', href: '/my-works', icon: List, desc: 'Tra cứu & cập nhật việc cá nhân', hasBadge: true },
    ]
  },
  {
    title: 'LÀM THÊM NGOÀI GIỜ',
    isPersonal: true,
    items: [
      { name: 'Đăng ký làm thêm', href: '/ot-register', icon: Clock, desc: 'Tạo phiếu đăng ký làm thêm cá nhân' },
      { name: 'Làm thêm của tôi', href: '/ot-my', icon: CheckCircle2, desc: 'Theo dõi kết quả duyệt OT cá nhân' },
      { name: 'In làm thêm', href: '/ot-print', icon: Printer, desc: 'In bảng tổng hợp OT cá nhân' },
    ]
  },
  {
    title: 'KPI CÁ NHÂN',
    isPersonal: true,
    items: [
      { name: 'Tự chấm A', href: '/self-score-a', icon: Edit, desc: 'Tự chấm điểm A của chính mình' },
      { name: 'KPI cá nhân', href: '/kpi', icon: Award, desc: 'Bảng điểm & kết quả KPI tháng' },
      { name: 'In phiếu KPI', href: '/print-personal', icon: FileText, desc: 'Tải & in phiếu đánh giá cá nhân' },
    ]
  },
  {
    title: 'ĐIỀU HÀNH & PHÊ DUYỆT',
    isPersonal: false,
    items: [
      { name: 'Giao việc', href: '/assign', icon: Send, desc: 'Phân công nhiệm vụ cho nhân sự' },
      { name: 'Duyệt việc', href: '/approve', icon: CheckSquare, desc: 'Phê duyệt tiến độ & hồ sơ công việc', badgeKey: 'works' },
      { name: 'Duyệt làm thêm', href: '/approve-ot', icon: Clock, desc: 'Phê duyệt đăng ký làm thêm ngoài giờ', badgeKey: 'overtimes' },
      { name: 'Chấm/duyệt KPI A/C/D', href: '/score-acd', icon: Award, desc: 'Duyệt điểm A, C, D cho toàn phòng' },
      { name: 'Theo dõi & Giám sát', href: '/monitor', icon: Activity, desc: 'Giám sát tiến độ toàn phòng & cảnh báo' },
    ]
  },
  {
    title: 'BÁO CÁO & TỔNG HỢP',
    isPersonal: false,
    items: [
      { name: 'Tổng hợp KPI', href: '/department-kpi', icon: Award, desc: 'Bảng tổng hợp & tra cứu KPI phòng' },
      { name: 'Dashboard tổng quan', href: '/', icon: LayoutDashboard, desc: 'Tổng quan tiến độ & KPI toàn phòng' },
      { name: 'Thống kê - Báo cáo', href: '/stats', icon: BarChart3, desc: 'Báo cáo số liệu điều hành' },
      { name: 'In báo cáo phòng', href: '/print-department', icon: Printer, desc: 'Báo cáo tổng hợp KPI phòng' },
      { name: 'Tổng hợp làm thêm', href: '/ot-summary', icon: Database, desc: 'Bảng làm thêm toàn phòng' },
    ]
  },
  {
    title: 'QUẢN TRỊ HỆ THỐNG',
    isPersonal: false,
    items: [
      { name: 'Đang online', href: '/admin/online', icon: Radio, desc: 'Theo dõi phiên truy cập' },
      { name: 'Nhân sự/Tài khoản', href: '/admin/users', icon: Users, desc: 'Quản lý tài khoản và phân quyền' },
      { name: 'Đồng bộ dữ liệu', href: '/admin/sync', icon: Database, desc: 'Import từ Excel / App Script' },
      { name: 'Cài đặt danh mục', href: '/admin/settings', icon: Settings, desc: 'Cấu hình danh mục & tham số' },
    ]
  }
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userList, setUserList] = useState<any[]>([]);
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);
  const [pendingAssignmentsCount, setPendingAssignmentsCount] = useState(0);
  const [pendingOvertimesCount, setPendingOvertimesCount] = useState(0);
  const [pendingWorksCount, setPendingWorksCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Change password modal states
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  const fetchLayoutData = async (user?: any) => {
    try {
      const [resUsers, resAssign, resNotif, resOvertimes, resWorks] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/assignments'),
        fetch('/api/notifications'),
        fetch('/api/overtimes'),
        fetch('/api/works')
      ]);
      const [dUsers, dAssign, dNotif, dOt, dWorks] = await Promise.all([
        resUsers.json(),
        resAssign.json(),
        resNotif.json(),
        resOvertimes.json(),
        resWorks.json()
      ]);

      let activeU = user || currentUser;

      if (dUsers.success && dUsers.data?.length > 0) {
        setUserList(dUsers.data);
        if (!activeU) {
          activeU = getActiveLoggedInUser(dUsers.data);
          if (activeU) {
            setCurrentUser(activeU);
          } else {
            // Not logged in -> redirect to login
            navigate('/login');
            return;
          }
        } else {
          // Sync active user with latest data from DB (permissions, role, mustChangePassword)
          const updatedFromDb = dUsers.data.find((u: any) => u.id === activeU.id);
          if (updatedFromDb) {
            const merged = { ...updatedFromDb, mustChangePassword: updatedFromDb.mustChangePassword ?? activeU.mustChangePassword };
            setCurrentUser(merged);
            setActiveLoggedInUser(merged);
            activeU = merged;
          }
        }
      }

      setIsLoaded(true);

      const uid = activeU?.id;
      if (dAssign.success && uid) {
        const pending = (dAssign.data || []).filter((a: any) => 
          a.receiverId === uid && (!a.receiveStatus || a.receiveStatus.includes('Chưa') || a.receiveStatus.includes('Chờ'))
        );
        setPendingAssignmentsCount(pending.length);
      }

      if (dOt.success) {
        const pendingOt = (dOt.data || []).filter((o: any) => !o.isDeleted && (!o.approvalStatus || o.approvalStatus === 'Chờ duyệt'));
        setPendingOvertimesCount(pendingOt.length);
      }

      if (dWorks.success) {
        const pendingW = (dWorks.data || []).filter((w: any) => !w.isDeleted && (!w.leaderApproval || w.leaderApproval === 'Chưa duyệt'));
        setPendingWorksCount(pendingW.length);
      }

      if (dNotif.success && uid) {
        const myNotifs = (dNotif.data || []).filter((n: any) => n.userId === uid || !n.userId);
        setNotifications(myNotifs);
      }
    } catch (err) {
      console.error(err);
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    const initialUser = getActiveLoggedInUser();
    if (!initialUser) {
      navigate('/login');
      return;
    }
    setCurrentUser(initialUser);
    fetchLayoutData(initialUser);

    const handleUserChange = () => {
      const active = getActiveLoggedInUser();
      if (!active) {
        navigate('/login');
        return;
      }
      setCurrentUser(active);
      fetchLayoutData(active);
    };

    window.addEventListener('kpi_user_changed', handleUserChange);
    const interval = setInterval(() => fetchLayoutData(), 30000);
    return () => {
      window.removeEventListener('kpi_user_changed', handleUserChange);
      clearInterval(interval);
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      if (currentUser?.id) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id })
        });
      }
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      clearActiveLoggedInUser();
      navigate('/login');
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (!newPasswordInput.trim() || newPasswordInput.trim().length < 6) {
      setPwdError('Mật khẩu mới phải có tối thiểu 6 ký tự.');
      return;
    }

    if (currentUser?.mustChangePassword && newPasswordInput.trim() === DEFAULT_INITIAL_PASSWORD) {
      setPwdError('Vui lòng chọn mật khẩu mới khác với mật khẩu mặc định (123456@).');
      return;
    }

    if (newPasswordInput.trim() !== confirmPasswordInput.trim()) {
      setPwdError('Xác nhận mật khẩu không trùng khớp.');
      return;
    }

    setPwdLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser?.id,
          oldPassword: oldPasswordInput.trim() || (currentUser?.mustChangePassword ? DEFAULT_INITIAL_PASSWORD : ''),
          newPassword: newPasswordInput.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setPwdError(data.message || 'Đổi mật khẩu không thành công.');
        setPwdLoading(false);
        return;
      }

      const updated = { ...data.user, mustChangePassword: false };
      setCurrentUser(updated);
      setActiveLoggedInUser(updated);
      setPwdSuccess('Đổi mật khẩu thành công!');
      setTimeout(() => {
        setShowChangeModal(false);
        setOldPasswordInput('');
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        setPwdSuccess('');
        setPwdError('');
      }, 1200);
    } catch (err) {
      setPwdError('Lỗi kết nối khi đổi mật khẩu.');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleSelectUser = (u: any) => {
    setActiveLoggedInUser(u);
    setCurrentUser(u);
    setShowSwitchMenu(false);
    fetchLayoutData(u);
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Filter navigation groups and items based on real permissions
  const authorizedNavGroups = allNavGroups.map(group => {
    if (group.isPersonal) {
      return group;
    }
    const filteredItems = group.items.filter(item => canAccessRoute(currentUser, item.href));
    return {
      ...group,
      items: filteredItems
    };
  }).filter(group => group.items.length > 0);

  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  return (
    <div className="flex h-screen w-full bg-[#f3f7fb] font-sans text-slate-800 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[280px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full shadow-[2px_0_8px_-4px_rgba(0,0,0,0.1)] z-20">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4 pt-6">
            <div className="flex items-center justify-between px-2 mb-4">
              <h2 className="text-[#1F4E78] font-black text-sm uppercase tracking-wide">CHỨC NĂNG HỆ THỐNG</h2>
              {isAdmin && (
                <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded border border-purple-200">
                  Toàn quyền
                </span>
              )}
            </div>

            <div className="space-y-6">
              {authorizedNavGroups.map((group, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between px-2 mb-2 cursor-pointer group">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-[#1F4E78] uppercase tracking-wider">{group.title}</h3>
                      {group.isPersonal ? (
                        <span className="text-[9px] font-black bg-blue-100/80 text-[#1F4E78] px-1.5 py-0.5 rounded-md border border-blue-200">
                          Cá nhân
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md border border-amber-200">
                          Uỷ quyền
                        </span>
                      )}
                    </div>
                    <span className="text-blue-400 group-hover:text-blue-600 transition-colors text-xs">⌃</span>
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item: any) => {
                      const isActive = location.pathname === item.href;
                      let badgeCount = 0;
                      let badgeText = '';
                      if (item.hasBadge && pendingAssignmentsCount > 0) {
                        badgeCount = pendingAssignmentsCount;
                        badgeText = `${badgeCount} việc mới`;
                      } else if (item.badgeKey === 'overtimes' && pendingOvertimesCount > 0) {
                        badgeCount = pendingOvertimesCount;
                        badgeText = `${badgeCount} chờ duyệt`;
                      } else if (item.badgeKey === 'works' && pendingWorksCount > 0) {
                        badgeCount = pendingWorksCount;
                        badgeText = `${badgeCount} chờ duyệt`;
                      }
                      const hasAlert = badgeCount > 0;
                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          className={cn(
                            "flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 border relative",
                            isActive 
                              ? "bg-gradient-to-r from-[#1F4E78] to-[#2F75B5] text-white border-transparent shadow-md shadow-blue-900/20" 
                              : "bg-transparent text-slate-700 border-transparent hover:bg-slate-50 hover:border-slate-200"
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 p-1 rounded-md flex items-center justify-center shrink-0 transition-colors relative",
                            isActive ? "bg-white/20 text-white" : "bg-blue-50 text-[#1F4E78]"
                          )}>
                            <item.icon className="w-4 h-4" />
                            {hasAlert && (
                              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
                            )}
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[13px] font-bold leading-tight truncate">{item.name}</span>
                              {hasAlert && (
                                <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-xs animate-pulse shrink-0">
                                  {badgeText}
                                </span>
                              )}
                            </div>
                            <span className={cn(
                              "text-[10px] leading-tight mt-0.5 truncate",
                              isActive ? "text-blue-100" : "text-slate-500"
                            )}>
                              {item.desc}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400">© 2026 Hệ thống quản lý KPI.</p>
          <p className="text-[10px] text-slate-400">Tác giả: Khuất Văn Sơn ({ADMIN_EMAIL})</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 tracking-wide uppercase">Ban Quản lý dự án đầu tư xây dựng công trình giao thông và nông nghiệp phát triển nông thôn tỉnh Đắk Lắk</span>
            <span className="text-xl font-black text-[#0f2440] tracking-tight mt-0.5">HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI</span>
            <span className="text-[13px] font-bold text-slate-500 mt-0.5">Phòng Kế hoạch - Tài chính</span>
          </div>
          
          <div className="relative flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotificationMenu(!showNotificationMenu)}
                className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl relative text-slate-600 hover:text-[#1F4E78] transition"
                title="Thông báo & Nhắc việc"
              >
                <Bell className="w-4 h-4" />
                {pendingAssignmentsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                    {pendingAssignmentsCount}
                  </span>
                )}
              </button>

              {/* Notification Menu Dropdown */}
              {showNotificationMenu && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-50 animate-fadeIn text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="font-bold text-[#1F4E78] uppercase">Thông báo & Nhắc việc</span>
                    <span className="text-[10px] text-slate-400">{notifications.length} tin</span>
                  </div>

                  {pendingAssignmentsCount > 0 && (
                    <div className="mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-black text-[11px]">Bạn có {pendingAssignmentsCount} nhiệm vụ mới!</div>
                        <div className="text-[10px] text-amber-700 mt-0.5">Lãnh đạo vừa giao nhiệm vụ mới. Vui lòng vào tab "Công việc của tôi" để tiếp nhận.</div>
                        <Link
                          to="/my-works"
                          onClick={() => setShowNotificationMenu(false)}
                          className="inline-block mt-1.5 text-[10px] font-bold text-amber-800 underline hover:text-amber-950"
                        >
                          Xem và nhận việc ngay →
                        </Link>
                      </div>
                    </div>
                  )}

                  <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar">
                    {notifications.length === 0 ? (
                      <div className="text-center py-4 text-slate-400">Không có thông báo nào</div>
                    ) : (
                      notifications.slice(0, 10).map((n: any, idx: number) => (
                        <div key={idx} className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition border border-slate-100">
                          <div className="font-bold text-slate-800 text-[11px]">{n.title || n.action}</div>
                          <div className="text-[10px] text-slate-600 mt-0.5 leading-snug">{n.message || n.detail}</div>
                          <div className="text-[9px] text-slate-400 mt-1">{formatDate(n.createdAt)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div 
              onClick={() => setShowSwitchMenu(!showSwitchMenu)}
              className="flex items-center gap-3 pl-2 cursor-pointer group hover:bg-slate-100/60 p-1 rounded-xl transition"
              title="Nhấn để xem / chuyển tài khoản"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#17466e] to-[#2f75b5] shadow-sm flex items-center justify-center text-white font-black text-sm">
                {getInitials(currentUser?.name)}
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#0f2440] text-[15px] leading-none group-hover:text-[#1F4E78] transition-colors">
                    {currentUser?.name || 'Đang tải...'}
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                    isAdmin ? 'bg-purple-100 text-purple-800 border-purple-200' :
                    currentUser?.role === 'LEADER' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                    'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {isAdmin ? 'Quản trị' : currentUser?.role === 'LEADER' ? 'Lãnh đạo' : 'Chuyên viên'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
                </div>
                <span className="text-xs text-slate-500 mt-1 leading-none">
                  {currentUser?.email || 'Chưa đăng nhập'}
                </span>
              </div>
            </div>

            {/* Switch User Dropdown */}
            {showSwitchMenu && userList.length > 0 && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in zoom-in-95">
                <div className="text-xs font-bold text-slate-400 px-3 py-1.5 uppercase">Chuyển đổi tài khoản</div>
                <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                  {userList.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm font-medium transition",
                        currentUser?.id === u.id 
                          ? "bg-blue-50 text-[#1F4E78] font-bold" 
                          : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <div>
                        <div className="font-bold text-[13px]">{u.name}</div>
                        <div className="text-[11px] text-slate-400">{u.position || u.role} ({u.email})</div>
                      </div>
                      {currentUser?.id === u.id && (
                        <UserCheck className="w-4 h-4 text-[#1F4E78]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="h-8 w-px bg-slate-200 mx-1"></div>
            <div className="flex items-center gap-2 pr-1">
              <button 
                onClick={() => {
                  setPwdError('');
                  setPwdSuccess('');
                  setOldPasswordInput('');
                  setNewPasswordInput('');
                  setConfirmPasswordInput('');
                  setShowChangeModal(true);
                }}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                title="Đổi mật mã truy cập"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                <span>Đổi mã</span>
              </button>
              <button 
                onClick={handleLogout}
                className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg text-xs font-bold shadow-sm transition-colors inline-flex items-center gap-1.5"
                title="Đăng xuất khỏi hệ thống"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6 custom-scrollbar">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* Mandatory Password Change Barrier or On-Demand Change Password Dialog */}
      {(currentUser?.mustChangePassword || showChangeModal) && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 md:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-[#1F4E78] mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                <Lock className="w-5 h-5 text-[#1F4E78]" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {currentUser?.mustChangePassword ? 'Yêu cầu đổi mật khẩu lần đầu' : 'Đổi mật mã truy cập'}
                </h3>
                <p className="text-xs text-slate-500">Tài khoản: <strong className="text-slate-800">{currentUser?.name}</strong> ({currentUser?.email})</p>
              </div>
            </div>

            {currentUser?.mustChangePassword ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-5 text-xs text-amber-900 leading-relaxed">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Bắt buộc đổi mật khẩu mặc định:
                </p>
                <p>Mật khẩu của bạn hiện đang là <code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded text-amber-950">{DEFAULT_INITIAL_PASSWORD}</code>. Vui lòng đặt mật khẩu mới để tiếp tục truy cập các phân hệ công việc.</p>
              </div>
            ) : (
              <p className="text-xs text-slate-600 mb-4">
                Nhập mật khẩu hiện tại và mật khẩu mới để cập nhật thông tin bảo mật.
              </p>
            )}

            {pwdError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{pwdError}</span>
              </div>
            )}

            {pwdSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{pwdSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu hiện tại</label>
                <input 
                  type="password" 
                  value={oldPasswordInput}
                  onChange={(e) => setOldPasswordInput(e.target.value)}
                  placeholder={currentUser?.mustChangePassword ? DEFAULT_INITIAL_PASSWORD : "Nhập mật khẩu cũ..."}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                <input 
                  type="password" 
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
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
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới..."
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-100 outline-none font-medium"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                {!currentUser?.mustChangePassword && (
                  <button
                    type="button"
                    onClick={() => setShowChangeModal(false)}
                    className="px-4 py-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Đóng
                  </button>
                )}
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="inline-flex items-center gap-2 bg-[#1F4E78] hover:bg-[#173a5a] text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  {pwdLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{currentUser?.mustChangePassword ? 'Lưu & Bắt đầu làm việc' : 'Cập nhật mật khẩu'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
