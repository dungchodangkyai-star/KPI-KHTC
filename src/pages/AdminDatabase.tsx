import React, { useState, useEffect } from 'react';
import { 
  Database, Server, ShieldCheck, CheckCircle2, 
  AlertTriangle, RefreshCw, Zap, Save, HelpCircle, 
  Globe, HardDrive, Lock, Check, Terminal, ExternalLink
} from 'lucide-react';
import { useOrgConfig } from '../contexts/OrgContext';

interface DbConfig {
  mode: 'local' | 'external';
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  lastTested?: string;
  status?: 'connected' | 'error' | 'untested';
}

export default function AdminDatabase() {
  const { orgConfig } = useOrgConfig();
  const [config, setConfig] = useState<DbConfig>({
    mode: 'local',
    host: '127.0.0.1',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: '',
    ssl: false,
    status: 'connected'
  });

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/database/config');
      const json = await res.json();
      if (json.success && json.data) {
        setConfig(json.data);
      }
    } catch (err) {
      console.error('Error fetching database config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setNotice(null);
    try {
      const res = await fetch('/api/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const json = await res.json();
      setTestResult(json);
      if (json.success) {
        setNotice({ type: 'success', text: json.message });
      } else {
        setNotice({ type: 'error', text: json.message || 'Kết nối thất bại!' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `Lỗi gọi API: ${err?.message || String(err)}` });
      setNotice({ type: 'error', text: `Lỗi: ${err?.message || String(err)}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/database/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const json = await res.json();
      if (json.success) {
        setNotice({ type: 'success', text: 'Đã lưu và kích hoạt cấu hình cơ sở dữ liệu thành công!' });
        if (json.data) {
          setConfig(json.data);
        }
      } else {
        setNotice({ type: 'error', text: json.error || 'Lỗi khi lưu cấu hình!' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi hệ thống: ${err?.message || String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 font-sans">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#1F4E78] to-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-900/20 shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Quản trị Cơ sở Dữ liệu & Lưu trữ</h1>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-[#1F4E78] border border-blue-200">
                Đa chế độ
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cấu hình chuyển đổi linh hoạt giữa Cơ sở dữ liệu Nội bộ (Mặc định) và Máy chủ PostgreSQL bên ngoài (NAS / VPS / Cloud).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={fetchConfig}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm font-semibold animate-in fade-in duration-200 ${
          notice.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
            : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Mode Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Local DB Mode */}
        <div 
          onClick={() => setConfig(prev => ({ ...prev, mode: 'local' }))}
          className={`p-6 rounded-2xl border-2 transition-all cursor-pointer relative ${
            config.mode === 'local'
              ? 'bg-gradient-to-b from-blue-50/70 to-white border-[#1F4E78] shadow-md ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          {config.mode === 'local' && (
            <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-[#1F4E78] text-white flex items-center justify-center shadow-xs">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#1F4E78] flex items-center justify-center font-bold">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Cơ sở dữ liệu Tự động (Mặc định)</h3>
              <p className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Khởi tạo ngay lập tức • Zero-Config
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Hệ thống tự động vận hành cơ sở dữ liệu đám mây độc lập gắn liền với ứng dụng của bạn. Không cần cài đặt máy chủ, độ trễ siêu thấp (&lt; 2ms), cực kỳ ổn định.
          </p>
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>Trạng thái: <strong className="text-emerald-600">Sẵn sàng 100%</strong></span>
            <span>Chế độ: <strong>Nội bộ dự án</strong></span>
          </div>
        </div>

        {/* External PostgreSQL Mode */}
        <div 
          onClick={() => setConfig(prev => ({ ...prev, mode: 'external' }))}
          className={`p-6 rounded-2xl border-2 transition-all cursor-pointer relative ${
            config.mode === 'external'
              ? 'bg-gradient-to-b from-blue-50/70 to-white border-[#1F4E78] shadow-md ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          {config.mode === 'external' && (
            <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-[#1F4E78] text-white flex items-center justify-center shadow-xs">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          )}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Máy chủ PostgreSQL bên ngoài</h3>
              <p className="text-[11px] font-semibold text-purple-600 flex items-center gap-1 mt-0.5">
                <Globe className="w-3 h-3" />
                NAS Synology • VPS Riêng • Supabase / Neon / RDS
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Kết nối tới máy chủ cơ sở dữ liệu đặt tại nội bộ mạng cơ quan (On-Premise NAS) hoặc Cloud Server riêng của đơn vị để đồng bộ dữ liệu tập trung.
          </p>
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>Tính năng: <strong className="text-purple-700">Tùy biến cấp cao</strong></span>
            <span>Giao thức: <strong>TCP/SSL Port 5432</strong></span>
          </div>
        </div>
      </div>

      {/* External DB Configuration Form */}
      {config.mode === 'external' && (
        <form onSubmit={handleSaveConfig} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900">Thông số kết nối PostgreSQL</h2>
              <p className="text-xs text-slate-500 mt-0.5">Điền thông tin máy chủ cơ sở dữ liệu PostgreSQL của bạn để kết nối.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 text-amber-600 ${testing ? 'animate-bounce' : ''}`} />
                {testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
              </button>
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-8 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Host / Địa chỉ IP Máy chủ (Host)</label>
              <input
                type="text"
                value={config.host || ''}
                onChange={e => setConfig({ ...config, host: e.target.value })}
                placeholder="vd: db.coquan.gov.vn hoặc 192.168.1.100"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
                required
              />
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Cổng kết nối (Port)</label>
              <input
                type="number"
                value={config.port || 5432}
                onChange={e => setConfig({ ...config, port: Number(e.target.value) })}
                placeholder="5432"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
                required
              />
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Tên Database (Database Name)</label>
              <input
                type="text"
                value={config.database || ''}
                onChange={e => setConfig({ ...config, database: e.target.value })}
                placeholder="vd: kpi_phong_khtc"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
                required
              />
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Tên tài khoản (User)</label>
              <input
                type="text"
                value={config.user || ''}
                onChange={e => setConfig({ ...config, user: e.target.value })}
                placeholder="postgres"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
                required
              />
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Mật mã (Password)</label>
              <input
                type="password"
                value={config.password || ''}
                onChange={e => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
              />
            </div>
          </div>

          {/* SSL Toggle */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-slate-600" />
              <div>
                <span className="text-xs font-bold text-slate-800">Mã hóa kết nối SSL / TLS</span>
                <p className="text-[11px] text-slate-500">Khuyến nghị bật khi kết nối tới Cloud (Supabase, Neon, AWS RDS, GCP Cloud SQL)</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!config.ssl}
                onChange={e => setConfig({ ...config, ssl: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1F4E78]"></div>
            </label>
          </div>

          {/* Test Connection Result Box */}
          {testResult && (
            <div className={`p-4 rounded-xl border text-xs font-semibold flex items-start gap-3 ${
              testResult.success ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}>
              <Terminal className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div>{testResult.message}</div>
                {testResult.latencyMs !== undefined && (
                  <div className="text-[11px] opacity-80">Thời gian phản hồi kết nối: {testResult.latencyMs} ms</div>
                )}
              </div>
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-[#1F4E78] hover:bg-[#173a5a] text-white text-xs font-extrabold shadow-md shadow-blue-900/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu...' : 'Lưu & Kích hoạt Kết nối'}
            </button>
          </div>
        </form>
      )}

      {/* Local Mode Save Actions */}
      {config.mode === 'local' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h4 className="text-sm font-black text-slate-900">Hệ thống đang hoạt động ở chế độ Nội bộ Tự động</h4>
              <p className="text-xs text-slate-500 mt-0.5">Dữ liệu được lưu trữ độc lập, sao lưu an toàn và có hiệu suất cao nhất.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#1F4E78] hover:bg-[#173a5a] text-white text-xs font-extrabold shadow-sm transition flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Đang lưu...' : 'Xác nhận Chế độ Nội bộ'}
          </button>
        </div>
      )}

      {/* Technical Documentation Summary Box */}
      <div className="bg-slate-900 text-slate-300 rounded-2xl p-6 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <HelpCircle className="w-4 h-4 text-blue-400" />
          <span>Cẩm nang Kỹ thuật & An toàn Dữ liệu (Handbook)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400 pt-2">
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
            <strong className="text-white block font-bold">1. Không mất dữ liệu</strong>
            <span>Việc đổi cấu hình DB chỉ chuyển hướng luồng đọc/ghi mà không bao giờ xóa bảng (No Drop Table) của cơ sở dữ liệu cũ.</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
            <strong className="text-white block font-bold">2. Sao lưu dự phòng</strong>
            <span>Luôn có thể vào mục <em>Cài đặt danh mục ➔ Nạp/Xuất dữ liệu</em> để tải file sao lưu .JSON về máy tính cá nhân.</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
            <strong className="text-white block font-bold">3. Chuẩn hóa phân quyền</strong>
            <span>Tài khoản Quản trị viên (Admin) có toàn quyền cấu hình kết nối database này trên từng dự án phòng ban riêng biệt.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
