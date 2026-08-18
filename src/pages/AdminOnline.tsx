import React, { useState, useEffect } from 'react';
import { 
  Radio, Users, Clock, Shield, Monitor, Smartphone, 
  Laptop, RefreshCw, Trash2, CheckCircle2, AlertCircle, 
  Search, ShieldAlert, Activity, Globe, Compass, Filter,
  PowerOff, Zap, Database
} from 'lucide-react';
import { formatDate, getActiveLoggedInUser } from '../utils';

interface ActiveSession {
  sessionId: string;
  userId: number;
  userName: string;
  userEmail: string;
  role: string;
  position: string;
  group: string;
  ip: string;
  device: string;
  browser: string;
  currentPath: string;
  loginAt: string;
  lastActiveAt: string;
  lastActiveTimestamp: number;
  status: 'Online' | 'Idle';
  statusLabel: string;
  lastActiveText: string;
}

interface AuditLog {
  id: number;
  logId: string;
  createdAt: string;
  userId?: number;
  action: string;
  target?: string;
  result?: string;
  note?: string;
  user?: {
    name: string;
    email: string;
    position?: string;
  };
}

export default function AdminOnline() {
  const currentUser = getActiveLoggedInUser();
  const [activeTab, setActiveTab] = useState<'sessions' | 'logs'>('sessions');
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [summary, setSummary] = useState({
    onlineCount: 0,
    idleCount: 0,
    totalActive: 0,
    totalUsers: 0,
  });
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [logFilterAction, setLogFilterAction] = useState('ALL');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [terminatingUserId, setTerminatingUserId] = useState<number | null>(null);
  const [purgingLogs, setPurgingLogs] = useState(false);

  // Fetch online sessions
  const fetchSessions = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      const res = await fetch('/api/online/sessions');
      const json = await res.json();
      if (json.success && json.data) {
        setSessions(json.data.sessions || []);
        setSummary({
          onlineCount: json.data.onlineCount || 0,
          idleCount: json.data.idleCount || 0,
          totalActive: json.data.totalActive || 0,
          totalUsers: json.data.totalUsers || 0,
        });
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch system audit logs
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/online/logs?limit=100');
      const json = await res.json();
      if (json.success && json.data) {
        setLogs(json.data);
      }
    } catch (err) {
      console.error('Error loading logs:', err);
    }
  };

  useEffect(() => {
    fetchSessions(true);
    fetchLogs();
  }, []);

  // Polling interval (every 10s if autoRefresh is true)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchSessions(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Handle Terminate Session
  const handleDisconnect = async (userId: number, userName: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn ngắt phiên làm việc của nhân sự "${userName}"?`)) {
      return;
    }
    setTerminatingUserId(userId);
    try {
      const res = await fetch('/api/online/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adminName: currentUser?.name || 'Admin' }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: json.message || 'Đã ngắt phiên thành công!' });
        fetchSessions(false);
        fetchLogs();
      } else {
        setActionMessage({ type: 'error', text: json.message || 'Lỗi khi ngắt phiên' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Lỗi mạng khi ngắt phiên' });
    } finally {
      setTerminatingUserId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  // Handle Purge Old Logs
  const handlePurgeLogs = async () => {
    if (!window.confirm('Hệ thống sẽ dọn dẹp các bản ghi nhật ký hoạt động cũ hơn 30 ngày để tối ưu dung lượng và tốc độ đường truyền. Bạn có muốn tiếp tục?')) {
      return;
    }
    setPurgingLogs(true);
    try {
      const res = await fetch('/api/online/purge-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 30 }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: json.message });
        fetchLogs();
      } else {
        setActionMessage({ type: 'error', text: json.message || 'Lỗi khi dọn dẹp nhật ký' });
      }
    } catch (e) {
      setActionMessage({ type: 'error', text: 'Lỗi mạng khi dọn dẹp nhật ký' });
    } finally {
      setPurgingLogs(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  // Filtered Sessions
  const filteredSessions = sessions.filter((s) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.userName?.toLowerCase().includes(q) ||
      s.userEmail?.toLowerCase().includes(q) ||
      s.position?.toLowerCase().includes(q) ||
      s.ip?.toLowerCase().includes(q) ||
      s.currentPath?.toLowerCase().includes(q)
    );
  });

  // Filtered Logs
  const filteredLogs = logs.filter((log) => {
    if (logFilterAction !== 'ALL' && log.action !== logFilterAction) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      log.user?.name?.toLowerCase().includes(q) ||
      log.action?.toLowerCase().includes(q) ||
      log.note?.toLowerCase().includes(q) ||
      log.target?.toLowerCase().includes(q)
    );
  });

  // Path Friendly Names
  const getPathLabel = (path: string) => {
    if (!path || path === '/') return 'Dashboard tổng quan';
    if (path === '/input') return 'Nhập công việc';
    if (path === '/my-works') return 'Công việc của tôi';
    if (path === '/ot-register') return 'Đăng ký làm thêm';
    if (path === '/ot-my') return 'Làm thêm của tôi';
    if (path === '/self-score-a') return 'Tự chấm điểm A';
    if (path === '/kpi') return 'KPI cá nhân';
    if (path === '/assign') return 'Giao việc';
    if (path === '/approve') return 'Duyệt công việc';
    if (path === '/approve-ot') return 'Duyệt làm thêm';
    if (path === '/score-acd') return 'Chấm/duyệt KPI A/C/D';
    if (path === '/monitor') return 'Theo dõi & Giám sát';
    if (path === '/department-kpi') return 'Tổng hợp KPI phòng';
    if (path === '/admin/users') return 'Quản lý nhân sự';
    if (path === '/admin/online') return 'Đang online';
    if (path === '/admin/settings') return 'Cài đặt danh mục';
    if (path === '/admin/sync') return 'Đồng bộ dữ liệu';
    return path;
  };

  const getDeviceIcon = (deviceStr: string) => {
    if (deviceStr.includes('Mobile') || deviceStr.includes('iOS') || deviceStr.includes('Android')) {
      return <Smartphone className="w-4 h-4 text-purple-600" />;
    }
    if (deviceStr.includes('Mac') || deviceStr.includes('PC') || deviceStr.includes('Windows') || deviceStr.includes('Linux')) {
      return <Laptop className="w-4 h-4 text-blue-600" />;
    }
    return <Monitor className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <Radio className="w-8 h-8 text-emerald-600 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Theo dõi Hoạt động & Đang Online</h1>
              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                Thời gian thực
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Giám sát phiên truy cập tức thời, thiết bị, địa chỉ IP và lịch sử thao tác hệ thống
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
            />
            <span>Tự động làm mới (10s)</span>
          </label>

          <button
            onClick={() => {
              fetchSessions(true);
              fetchLogs();
            }}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm font-medium transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs underline hover:opacity-80"
          >
            Đóng
          </button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Online */}
        <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-5 flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Đang Online</div>
            <div className="text-3xl font-black text-slate-800 mt-0.5">{summary.onlineCount}</div>
            <div className="text-[11px] text-slate-400">Thao tác trong 2 phút qua</div>
          </div>
          <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500"></div>
        </div>

        {/* Card 2: Idle */}
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-5 flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-600">Tạm nghỉ (Idle)</div>
            <div className="text-3xl font-black text-slate-800 mt-0.5">{summary.idleCount}</div>
            <div className="text-[11px] text-slate-400">Không thao tác 2 - 10 phút</div>
          </div>
          <div className="absolute top-0 right-0 w-2 h-full bg-amber-500"></div>
        </div>

        {/* Card 3: Total Accounts */}
        <div className="bg-white rounded-2xl shadow-sm border border-blue-200 p-5 flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Tổng nhân sự</div>
            <div className="text-3xl font-black text-slate-800 mt-0.5">{summary.totalUsers || 19}</div>
            <div className="text-[11px] text-slate-400">Đã kích hoạt trong phòng</div>
          </div>
          <div className="absolute top-0 right-0 w-2 h-full bg-blue-500"></div>
        </div>

        {/* Card 4: RAM Storage Optimization */}
        <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 p-5 flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">Tối ưu lưu trữ</div>
            <div className="text-lg font-black text-slate-800 mt-0.5">Bộ nhớ RAM</div>
            <div className="text-[11px] text-emerald-600 font-semibold">0% tải ổ đĩa • Tự dọn &gt;30 ngày</div>
          </div>
          <div className="absolute top-0 right-0 w-2 h-full bg-indigo-500"></div>
        </div>
      </div>

      {/* Architecture Notice Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-500 bg-opacity-20 rounded-xl mt-0.5">
            <Database className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-emerald-300">Cơ chế Theo dõi Không Gây Phình Cơ Sở Dữ Liệu</h3>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed max-w-3xl">
              Hệ thống sử dụng bộ nhớ đệm RAM siêu nhẹ cho nhịp thở (heartbeat) để theo dõi thời gian thực mà <strong>không ghi file rác vào ổ đĩa</strong>. 
              Các nhật ký bảo mật quan trọng (Đăng nhập, duyệt KPI, đổi mật khẩu) được tự động dọn dẹp sau 30 ngày định kỳ mỗi 24 giờ.
            </p>
          </div>
        </div>

        <button
          onClick={handlePurgeLogs}
          disabled={purgingLogs}
          className="whitespace-nowrap px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow transition-colors disabled:opacity-50"
        >
          <Trash2 className={`w-3.5 h-3.5 ${purgingLogs ? 'animate-spin' : ''}`} />
          <span>Dọn dẹp nhật ký &gt;30 ngày</span>
        </button>
      </div>

      {/* Tab Switcher & Search Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'sessions'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Phiên Đang Hoạt Động ({summary.totalActive})</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('logs');
                fetchLogs();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'logs'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Nhật ký Thao tác & Bảo mật ({logs.length})</span>
            </button>
          </div>

          {/* Search & Log Filter */}
          <div className="flex flex-wrap items-center gap-3">
            {activeTab === 'logs' && (
              <select
                value={logFilterAction}
                onChange={(e) => setLogFilterAction(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="ALL">Tất cả hành động</option>
                <option value="ĐĂNG_NHẬP">Đăng nhập</option>
                <option value="ĐĂNG_XUẤT">Đăng xuất</option>
                <option value="ĐỔI_MẬT_KHẨU">Đổi mật khẩu</option>
                <option value="DUYỆT_TÀI_KHOẢN">Duyệt tài khoản</option>
                <option value="NGẮT_PHIÊN">Ngắt phiên</option>
              </select>
            )}

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={activeTab === 'sessions' ? 'Tìm theo tên, email, IP, trang...' : 'Tìm kiếm nhật ký...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none w-64"
              />
            </div>
          </div>
        </div>

        {/* Content Tab 1: Active Sessions Table */}
        {activeTab === 'sessions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="p-4">Nhân sự</th>
                  <th className="p-4">Thiết bị & Trình duyệt</th>
                  <th className="p-4">Địa chỉ IP</th>
                  <th className="p-4">Trang đang xem</th>
                  <th className="p-4">Thời gian đăng nhập</th>
                  <th className="p-4">Hoạt động cuối</th>
                  <th className="p-4 text-center">Trạng thái</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                        <span>Đang tải thông tin phiên hoạt động...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500">
                      <div className="max-w-md mx-auto space-y-2">
                        <Radio className="w-10 h-10 text-slate-300 mx-auto" />
                        <p className="font-bold text-slate-700">Chưa ghi nhận phiên làm việc nào khác</p>
                        <p className="text-xs text-slate-400">
                          {searchTerm ? 'Không tìm thấy kết quả phù hợp với từ khóa.' : 'Khi các cán bộ trong phòng đăng nhập và mở ứng dụng, hệ thống sẽ tự động cập nhật ngay tại đây.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((session) => (
                    <tr key={session.userId} className="hover:bg-slate-50/80 transition-colors">
                      {/* User Info */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white ${
                            session.role === 'ADMIN' ? 'bg-indigo-600' : session.role === 'LEADER' ? 'bg-amber-600' : 'bg-slate-700'
                          }`}>
                            {session.userName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{session.userName}</span>
                              {session.role === 'ADMIN' && (
                                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded">Admin</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">{session.userEmail}</div>
                            <div className="text-[11px] text-slate-500">{session.position} • {session.group}</div>
                          </div>
                        </div>
                      </td>

                      {/* Device & Browser */}
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-slate-700 font-medium text-xs">
                          {getDeviceIcon(session.device)}
                          <span>{session.device}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Globe className="w-3 h-3 text-slate-400" />
                          <span>{session.browser}</span>
                        </div>
                      </td>

                      {/* IP Address */}
                      <td className="p-4">
                        <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                          {session.ip}
                        </span>
                      </td>

                      {/* Current Path */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-semibold">
                          <Compass className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{getPathLabel(session.currentPath)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{session.currentPath}</div>
                      </td>

                      {/* Login Time */}
                      <td className="p-4 text-xs text-slate-600">
                        {session.loginAt ? new Date(session.loginAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Vừa xong'}
                      </td>

                      {/* Last Active */}
                      <td className="p-4 text-xs text-slate-700 font-medium">
                        {session.lastActiveText}
                      </td>

                      {/* Status */}
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${
                            session.status === 'Online'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              session.status === 'Online' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                            }`}
                          ></span>
                          {session.statusLabel}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDisconnect(session.userId, session.userName)}
                          disabled={terminatingUserId === session.userId || session.userId === currentUser?.id}
                          title={session.userId === currentUser?.id ? 'Không thể ngắt phiên của chính bạn' : 'Buộc ngắt phiên'}
                          className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <PowerOff className="w-3.5 h-3.5" />
                          <span>{terminatingUserId === session.userId ? 'Đang ngắt...' : 'Ngắt phiên'}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Content Tab 2: System Audit Logs */}
        {activeTab === 'logs' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="p-4">Thời gian</th>
                  <th className="p-4">Người thực hiện</th>
                  <th className="p-4">Hành động</th>
                  <th className="p-4">Đối tượng</th>
                  <th className="p-4">Ghi chú chi tiết</th>
                  <th className="p-4 text-center">Kết quả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500">
                      <Activity className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="font-bold text-slate-700">Chưa có nhật ký ghi nhận</p>
                      <p className="text-xs text-slate-400">Các hoạt động đăng nhập, đổi mật khẩu, phê duyệt sẽ được lưu trữ tại đây.</p>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{log.user?.name || `User #${log.userId || 'Khách'}`}</div>
                        {log.user?.email && <div className="text-xs text-slate-400">{log.user.email}</div>}
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${
                          log.action.includes('ĐĂNG_NHẬP') ? 'bg-blue-100 text-blue-800' :
                          log.action.includes('ĐỔI_MẬT_KHẨU') ? 'bg-purple-100 text-purple-800' :
                          log.action.includes('DUYỆT') ? 'bg-emerald-100 text-emerald-800' :
                          log.action.includes('NGẮT') ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-4 text-xs font-medium text-slate-700">
                        {log.target || '—'}
                      </td>
                      <td className="p-4 text-xs text-slate-600">
                        {log.note || '—'}
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-md border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          {log.result || 'Thành công'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Summary */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Đang hiển thị {activeTab === 'sessions' ? filteredSessions.length : filteredLogs.length} bản ghi
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Hệ thống giám sát vận hành tối ưu • Cập nhật tự động</span>
          </div>
        </div>
      </div>
    </div>
  );
}
