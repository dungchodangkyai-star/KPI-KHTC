import React, { useState, useEffect } from 'react';
import { 
  Database, Server, ShieldCheck, CheckCircle2, 
  AlertTriangle, RefreshCw, Zap, Save, HelpCircle, 
  Globe, HardDrive, Lock, Check, Terminal, ExternalLink,
  Archive, Clock, Calendar, Download, Trash2, RotateCcw,
  Cloud, CloudRain, CloudUpload, Radio, FileText, Settings,
  Play, Sparkles, CheckSquare, Layers, ShieldAlert, Cpu,
  Copy, Info, Code2, ChevronDown, ChevronUp, Send, CheckCheck
} from 'lucide-react';
import { useOrgConfig } from '../contexts/OrgContext';
import { DDL_SCRIPT } from '../data/ddlScript';

interface DbConfig {
  mode: 'local' | 'external';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  lastTested?: string;
  status?: 'connected' | 'error' | 'untested';
}

interface DbStats {
  mode: 'local' | 'external';
  status: 'connected' | 'error' | 'untested';
  worksCount: number;
  usersCount: number;
  latencyMs: number;
}

export default function AdminDatabase() {
  const { orgConfig } = useOrgConfig();
  const [activeSubTab, setActiveSubTab] = useState<number>(1);

  // Database State
  const [config, setConfig] = useState<DbConfig>({
    mode: 'local',
    connectionString: '',
    host: '127.0.0.1',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: '',
    ssl: true,
    status: 'connected'
  });
  const [stats, setStats] = useState<DbStats>({
    mode: 'local',
    status: 'connected',
    worksCount: 0,
    usersCount: 0,
    latencyMs: 24
  });

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Copy state helpers
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [copiedCompose, setCopiedCompose] = useState(false);
  const [copiedPowerShell, setCopiedPowerShell] = useState(false);
  const [copiedLanUri, setCopiedLanUri] = useState(false);
  const [copiedWanUri, setCopiedWanUri] = useState(false);

  useEffect(() => {
    fetchConfigAndStats();
  }, []);

  const fetchConfigAndStats = async () => {
    setLoading(true);
    try {
      const [resCfg, resStats] = await Promise.all([
        fetch('/api/database/config'),
        fetch('/api/database/stats')
      ]);
      const textCfg = await resCfg.text();
      const textStats = await resStats.text();
      
      try {
        const jsonCfg = JSON.parse(textCfg);
        if (jsonCfg.success && jsonCfg.data) {
          setConfig(prev => ({ ...prev, ...jsonCfg.data }));
        }
      } catch (err) {
        console.error('Error parsing database config:', err);
      }

      try {
        const jsonStats = JSON.parse(textStats);
        if (jsonStats.success && jsonStats.data) {
          setStats(jsonStats.data);
        }
      } catch (err) {
        console.error('Error parsing database stats:', err);
      }
    } catch (err) {
      console.error('Error fetching database data:', err);
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
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { success: false, message: `Máy chủ phản hồi HTML không hợp lệ: ${text.slice(0, 100)}` };
      }
      setTestResult(json);
      if (json.success) {
        setNotice({ type: 'success', text: json.message });
      } else {
        setNotice({ type: 'error', text: json.message || 'Kết nối thất bại!' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `Lỗi kết nối: ${err?.message || String(err)}` });
      setNotice({ type: 'error', text: `Lỗi: ${err?.message || String(err)}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/database/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { success: false, error: 'Lỗi phản hồi từ máy chủ' };
      }
      if (json.success) {
        setNotice({ type: 'success', text: 'Đã lưu & áp dụng cấu hình Cơ sở Dữ liệu thành công!' });
        if (json.data) {
          setConfig(prev => ({ ...prev, ...json.data }));
        }
        fetchConfigAndStats();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setNotice({ type: 'error', text: json.error || 'Lỗi khi lưu cấu hình!' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi hệ thống: ${err?.message || String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  const downloadDdlFile = () => {
    const blob = new Blob([DDL_SCRIPT], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'khoi_tao_csdl_kpi_postgres.sql';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string, setCopiedFn: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopiedFn(true);
    setTimeout(() => setCopiedFn(false), 2500);
  };

  const NAS_DOCKER_COMPOSE = `version: '3.8'
services:
  kpi-postgres:
    image: postgres:16-alpine
    container_name: kpi_db
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: matkhau_kpi_2026
      POSTGRES_DB: postgres
    ports:
      - "5432:5432"
    volumes:
      - /volume1/docker/kpi-postgres:/var/lib/postgresql/data`;

  const WINDOWS_POWERSHELL_CMD = `New-NetFirewallRule -DisplayName "PostgreSQL Port 5432" -Direction Inbound -LocalPort 5432 -Protocol TCP -Action Allow`;

  const subTabs = [
    { id: 1, title: '1. Cấu hình Kết nối CSDL Khách hàng', icon: Settings },
    { id: 2, title: '2. Hướng dẫn Supabase (Miễn phí 2 phút)', icon: Cloud },
    { id: 3, title: '3. Hướng dẫn Neon.tech (1 phút)', icon: Zap },
    { id: 4, title: '4. Máy chủ NAS XPEnology (Private Cloud)', icon: HardDrive },
    { id: 5, title: '5. Máy tính Windows Phòng ban', icon: Cpu },
    { id: 6, title: '6. Mã SQL Khởi tạo bảng (DDL)', icon: Code2 },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 font-sans text-slate-800">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1F4E78] text-white flex items-center justify-center shadow-md shadow-blue-900/20 shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Cấu hình Lưu trữ & Cơ sở Dữ liệu Đám mây</h1>
              <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-[#1F4E78] border border-blue-200">
                Chuyển giao & Quản trị
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cấu hình tài khoản Database của khách hàng, chuyển giao dữ liệu độc lập và hướng dẫn tạo CSDL miễn phí.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchConfigAndStats}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Làm mới trạng thái
        </button>
      </div>

      {/* 4 Status Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Trạng thái CSDL</span>
            <span className="text-sm font-black text-slate-900 flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {config.mode === 'local' ? 'PGlite Cục bộ (Miễn phí)' : 'PostgreSQL Khách hàng'}
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Độ trễ phản hồi (PING)</span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block">
              {stats.latencyMs} ms
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Tổng số bản ghi</span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block">
              {stats.worksCount} công việc | {stats.usersCount || 20} nhân sự
            </span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Tính độc lập dữ liệu</span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block">
              {config.mode === 'local' ? 'Cục bộ Applet' : 'Tài khoản Riêng'}
            </span>
          </div>
        </div>
      </div>

      {/* 6 Sub-Tab Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-1.5 flex flex-wrap gap-1">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSubTab(tab.id);
                setNotice(null);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                isActive
                  ? 'bg-white text-[#1F4E78] shadow-sm border border-slate-200/80 ring-2 ring-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#1F4E78]' : 'text-slate-400'}`} />
              <span>{tab.title}</span>
            </button>
          );
        })}
      </div>

      {/* Notice Alert Banner */}
      {notice && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs font-bold animate-in fade-in duration-200 shadow-xs ${
          notice.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-2 ring-emerald-400/20' 
            : 'bg-rose-50 text-rose-900 border-rose-300 ring-2 ring-rose-400/20'
        }`}>
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <div className="flex-1 font-bold">
            {notice.text}
          </div>
          <button onClick={() => setNotice(null)} className="underline text-[11px] opacity-80 cursor-pointer">
            Đóng
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: CẤU HÌNH KẾT NỐI CSDL KHÁCH HÀNG */}
      {/* ========================================================================= */}
      {activeSubTab === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Mode Selection & Inputs */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#1F4E78]" />
                    Lựa chọn Chế độ Lưu trữ CSDL
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chọn phương thức lưu trữ để ứng dụng ghi nhận dữ liệu độc lập trên tài khoản của khách hàng.
                  </p>
                </div>

                {/* 2 Mode Toggle Boxes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Mode 1: Local */}
                  <div
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'local' }))}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer relative ${
                      config.mode === 'local'
                        ? 'border-[#1F4E78] bg-blue-50/40 shadow-xs ring-1 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-blue-600" />
                        <h4 className="text-xs font-black text-slate-900">Chế độ 1: Cục bộ Applet (Miễn phí)</h4>
                      </div>
                      <input
                        type="radio"
                        checked={config.mode === 'local'}
                        onChange={() => setConfig(prev => ({ ...prev, mode: 'local' }))}
                        className="text-[#1F4E78] focus:ring-[#1F4E78]"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                      Dữ liệu lưu trực tiếp trong container của applet bằng công nghệ PostgreSQL nhúng (PGlite). Không cần tài khoản ngoài.
                    </p>
                    <div className="mt-3 text-[10px] font-extrabold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      0 VNĐ - Tự động sẵn sàng
                    </div>
                  </div>

                  {/* Mode 2: External */}
                  <div
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'external' }))}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer relative ${
                      config.mode === 'external'
                        ? 'border-[#1F4E78] bg-blue-50/40 shadow-xs ring-1 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-purple-600" />
                        <h4 className="text-xs font-black text-slate-900">Chế độ 2: CSDL Đám mây của Khách hàng</h4>
                      </div>
                      <input
                        type="radio"
                        checked={config.mode === 'external'}
                        onChange={() => setConfig(prev => ({ ...prev, mode: 'external' }))}
                        className="text-[#1F4E78] focus:ring-[#1F4E78]"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                      Kết nối tới tài khoản CSDL riêng của khách hàng (Supabase / Neon / Cloud SQL / NAS). Dữ liệu 100% thuộc sở hữu của họ.
                    </p>
                    <div className="mt-3 text-[10px] font-extrabold text-purple-700 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Khuyên dùng khi bàn giao chính thức
                    </div>
                  </div>
                </div>

                {/* External Connection String Form */}
                {config.mode === 'external' && (
                  <div className="space-y-4 pt-4 border-t border-slate-100 animate-in fade-in duration-200">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                        <span>Chuỗi kết nối PostgreSQL (Connection String / URI):</span>
                        <span className="text-[10px] font-normal text-slate-500">Hỗ trợ Supabase, Neon, NAS XPEnology, Windows PG</span>
                      </label>
                      <input
                        type="text"
                        value={config.connectionString || ''}
                        onChange={(e) => setConfig({ ...config, connectionString: e.target.value })}
                        placeholder="postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1F4E78]"
                      />
                      <p className="text-[11px] text-slate-500">
                        * Mẹo: Sao chép chuỗi kết nối từ Supabase/Neon và thay <strong className="text-slate-800">[YOUR-PASSWORD]</strong> bằng mật khẩu CSDL bạn đã tạo.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
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

                    {/* Test result feedback */}
                    {testResult && (
                      <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                        testResult.success 
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
                          : 'bg-rose-50 text-rose-900 border-rose-200'
                      }`}>
                        {testResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <strong className="block">{testResult.message}</strong>
                          {testResult.latencyMs && (
                            <span className="text-[11px] opacity-80">Thời gian phản hồi máy chủ: {testResult.latencyMs} ms</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Save Button */}
                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveConfig()}
                    disabled={saving}
                    className="px-6 py-2.5 rounded-xl bg-[#1F4E78] hover:bg-[#163a5c] text-white text-xs font-extrabold shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Đang lưu...' : 'Lưu & Áp dụng Cấu hình CSDL'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Handover & Independence Benefits Box */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-900 font-black text-xs pb-3 border-b border-slate-100">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <div>
                    <h4 className="text-xs font-black">Bàn giao & Độc lập Tài khoản</h4>
                    <p className="text-[10px] text-slate-500 font-normal">Quyền sở hữu và thanh toán thuộc về khách hàng</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs text-slate-600">
                  <div className="flex items-start gap-2.5">
                    <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block font-bold">Không tốn phí tài khoản của bạn:</strong>
                      <span className="text-[11px] text-slate-500">
                        Khi khách hàng tạo tài khoản Supabase / Neon riêng, dung lượng và request sẽ trừ vào hạn mức của họ.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block font-bold">Dung lượng miễn phí thoải mái:</strong>
                      <span className="text-[11px] text-slate-500">
                        500MB của Supabase đủ dùng cho 30 nhân sự ghi nhận KPI trong hơn 5 năm.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <button
                    type="button"
                    onClick={downloadDdlFile}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải File SQL Khởi tạo bảng (.sql)
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSubTab(2)}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Xem Hướng dẫn tạo Supabase (2 phút)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: HƯỚNG DẪN SUPABASE (MIỄN PHÍ 2 PHÚT) */}
      {/* ========================================================================= */}
      {activeSubTab === 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                Hướng dẫn Miễn phí 100% (Khuyên dùng nhất)
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-2">
                Cách tạo Cơ sở Dữ liệu PostgreSQL trên Supabase (Mất 2 phút)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Supabase cung cấp 500MB lưu trữ và 50.000 người dùng miễn phí vĩnh viễn, đủ vận hành phòng ban 5-10 năm.
              </p>
            </div>

            <a
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 self-start sm:self-auto shadow-xs"
            >
              <span>Mở trang Supabase.com</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Step 1 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                  1
                </span>
                <h3 className="text-sm font-black text-slate-900">Đăng ký & Tạo Project</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Vào <strong>supabase.com</strong>, bấm <strong>Start your project</strong> và đăng nhập bằng tài khoản Gmail của khách hàng.
              </p>
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                <p className="font-bold text-slate-900">Bấm New project:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600">
                  <li><strong>Name:</strong> Đặt tên (VD: <span className="font-mono text-[#1F4E78]">kpi-khtc</span>)</li>
                  <li><strong>Database Password:</strong> Nhập mật khẩu CSDL (Hãy ghi nhớ mật khẩu này!)</li>
                  <li><strong>Region:</strong> Chọn <span className="font-bold text-emerald-700">Singapore (ap-southeast-1)</span> để tốc độ nhanh nhất tại Việt Nam.</li>
                </ul>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                  2
                </span>
                <h3 className="text-sm font-black text-slate-900">Lấy chuỗi kết nối (URI)</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sau khi tạo xong project, ở thanh menu bên trái Supabase:
              </p>
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                  <li>Bấm vào biểu tượng <strong>Project Settings</strong> (bánh răng ở góc dưới bên trái).</li>
                  <li>Chọn mục <strong>Database</strong>.</li>
                  <li>Kéo xuống phần <strong>Connection string</strong> -&gt; Chọn tab <strong>URI</strong>.</li>
                  <li>Bấm nút <strong>Copy</strong> chuỗi kết nối.</li>
                </ul>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                  3
                </span>
                <h3 className="text-sm font-black text-slate-900">Dán vào Tab Cấu hình của App này</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Quay lại <strong>tab 1. Cấu hình Kết nối CSDL Khách hàng</strong>:
              </p>
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-700 space-y-1">
                <p>1. Dán chuỗi kết nối vừa copy vào ô nhập liệu.</p>
                <p>2. Thay thế <strong className="font-mono text-rose-600">[YOUR-PASSWORD]</strong> bằng mật khẩu CSDL đã đặt ở Bước 1.</p>
                <p>3. Bấm nút <strong>Kiểm tra kết nối</strong> -&gt; Bấm <strong>Lưu & Áp dụng</strong>.</p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                  4
                </span>
                <h3 className="text-sm font-black text-slate-900">(Tùy chọn) Chạy SQL Editor trên Supabase</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Nếu muốn tự tay khởi tạo toàn bộ bảng trước trên giao diện Supabase:
              </p>
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-700 space-y-2">
                <p>Bấm vào tab <strong>SQL Editor</strong> trên Supabase -&gt; Bấm <strong>New Query</strong> -&gt; Dán toàn bộ mã DDL từ tab <strong>6. Mã SQL Khởi tạo bảng</strong> và bấm <strong>RUN</strong>.</p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(DDL_SCRIPT, setCopiedDdl)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedDdl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedDdl ? 'Đã sao chép mã SQL!' : 'Sao chép mã SQL DDL ngay'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: HƯỚNG DẪN NEON.TECH (1 PHÚT) */}
      {/* ========================================================================= */}
      {activeSubTab === 3 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider">
                Serverless PostgreSQL cực nhanh (1 phút)
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-2">
                Cách tạo CSDL PostgreSQL trên Neon.tech
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Neon tự động co giãn, tạo database trong 10 giây và có sẵn chuỗi kết nối đầy đủ mật khẩu.
              </p>
            </div>

            <a
              href="https://neon.tech"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 self-start sm:self-auto shadow-xs"
            >
              <span>Mở trang Neon.tech</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Step 1 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  1
                </span>
                <h3 className="text-sm font-black text-slate-900">Đăng ký tài khoản Neon</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Truy cập <strong>neon.tech</strong> và đăng nhập bằng tài khoản Google.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  2
                </span>
                <h3 className="text-sm font-black text-slate-900">Tạo Project & Copy URL</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Đặt tên project, chọn Region <strong>Singapore</strong>. Trên Dashboard, bấm nút <strong>Copy</strong> chuỗi Connection string.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  3
                </span>
                <h3 className="text-sm font-black text-slate-900">Dán & Hoàn tất</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dán vào mục <strong>Cấu hình Kết nối CSDL</strong> bên trên và bấm Lưu. Dữ liệu sẽ đồng bộ tức thì.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: MÁY CHỦ NAS XPENOLOGY (PRIVATE CLOUD) */}
      {/* ========================================================================= */}
      {activeSubTab === 4 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black uppercase tracking-wider">
                Đám mây riêng biệt (Private Cloud Tối ưu nhất)
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-2">
                Biến Máy NAS XPEnology (Synology) thành Máy Chủ CSDL Online 24/7
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Giải pháp hoàn hảo: Vừa làm chủ 100% phần cứng trong phòng, vừa giải quyết triệt để vấn đề nhân viên truy cập từ xa ngoài mạng cơ quan.
              </p>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 text-xs font-bold self-start sm:self-auto">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>Chống hỏng ổ đĩa RAID + Hoạt động 24/7</span>
            </div>
          </div>

          {/* 3 Advantage Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-1.5">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
                <Zap className="w-4 h-4" />
                <span>1. Chạy cực nhẹ qua Docker</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Synology DSM có sẵn <strong>Container Manager / Docker</strong>, chỉ cần kéo image <code className="font-mono text-[#1F4E78]">postgres:16</code> là chạy ngay, tốn chưa tới 150MB RAM.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                <Globe className="w-4 h-4" />
                <span>2. Ra ngoài mạng không cần IP tĩnh</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Dùng <strong>Cloudflare Tunnel (Miễn phí)</strong> hoặc <strong>Tailscale / DDNS</strong>: Nhân viên ở nhà, đi công tác kết nối an toàn mà không cần mở port modem.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200/80 space-y-1.5">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-xs">
                <Archive className="w-4 h-4" />
                <span>3. Dữ liệu an toàn tuyệt đối</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Thư mục dữ liệu mount vào Volume RAID của NAS. Cho dù có cập nhật hay khởi động lại Docker, dữ liệu vẫn nguyên vẹn 100%.
              </p>
            </div>
          </div>

          {/* Detailed Setup Flow Header */}
          <div className="pt-2">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1F4E78]" />
              Quy trình cài đặt trên giao diện Synology DSM (Mất khoảng 10 phút)
            </h3>
          </div>

          {/* Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Step 1: Docker Compose */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  1
                </span>
                <h4 className="text-xs font-black text-slate-900">Cài đặt PostgreSQL qua Container Manager</h4>
              </div>
              <p className="text-xs text-slate-600">
                Vào <strong>Container Manager</strong> trên DSM -&gt; Chọn mục <strong>Project</strong> -&gt; Bấm <strong>Create</strong>:
              </p>
              <div className="relative">
                <pre className="p-3.5 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto border border-slate-800">
                  {NAS_DOCKER_COMPOSE}
                </pre>
                <button
                  type="button"
                  onClick={() => copyToClipboard(NAS_DOCKER_COMPOSE, setCopiedCompose)}
                  className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] transition flex items-center gap-1 cursor-pointer"
                >
                  {copiedCompose ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedCompose ? 'Đã chép!' : 'Copy Compose YAML'}
                </button>
              </div>
            </div>

            {/* Step 2: Open Connection */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  2
                </span>
                <h4 className="text-xs font-black text-slate-900">Mở kết nối ra ngoài Internet</h4>
              </div>
              <p className="text-xs text-slate-600">
                Để nhân viên ở nhà hoặc đi công tác kết nối được, bạn chọn 1 trong 2 cách cực kỳ đơn giản:
              </p>
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                  <strong className="text-slate-900 block font-bold">Cách A (Khuyên dùng - Cloudflare Tunnel):</strong>
                  <p className="text-[11px] text-slate-600">
                    Chạy container <code className="font-mono text-purple-700">cloudflared</code> trên NAS. Không cần mở cổng modem, không cần IP tĩnh, tự động có SSL HTTPS bảo mật tuyệt đối.
                  </p>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                  <strong className="text-slate-900 block font-bold">Cách B (DDNS + Port Forwarding):</strong>
                  <p className="text-[11px] text-slate-600">
                    Dùng tên miền DDNS miễn phí (như DuckDNS/No-IP) và mở port 5432 trên Modem trỏ vào IP nội bộ của máy NAS.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3: Paste URI */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  3
                </span>
                <h4 className="text-xs font-black text-slate-900">Dán chuỗi kết nối vào Phần mềm</h4>
              </div>
              <p className="text-xs text-slate-600">
                Lấy địa chỉ IP mạng LAN (hoặc tên miền từ xa) của NAS dán vào tab <strong>1. Cấu hình Kết nối CSDL</strong>:
              </p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Khi dùng nội bộ trong cơ quan:</span>
                  <div className="p-2 bg-white rounded-lg border border-slate-300 font-mono text-[11px] text-slate-800 break-all">
                    postgresql://postgres:matkhau_kpi_2026@192.168.1.150:5432/postgres
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">Khi dùng qua tên miền ra ngoài mạng:</span>
                  <div className="p-2 bg-white rounded-lg border border-slate-300 font-mono text-[11px] text-slate-800 break-all">
                    postgresql://postgres:matkhau_kpi_2026@nas.tenphongban.com:5432/postgres
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4: Auto Backup */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  4
                </span>
                <h4 className="text-xs font-black text-slate-900">Tự động sao lưu & Bền bỉ</h4>
              </div>
              <p className="text-xs text-slate-600">
                NAS XPEnology hỗ trợ các tính năng bảo vệ cao cấp nhất:
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-600">
                <li><strong>Hyper Backup:</strong> Tự động sao lưu toàn bộ dữ liệu KPI mỗi đêm lên Google Drive hoặc USB.</li>
                <li><strong>Snapshot Replication:</strong> Chống Ransomware (virus mã hóa tống tiền), khôi phục dữ liệu tức thì.</li>
                <li><strong>Tiết kiệm điện:</strong> Công suất tiêu thụ chỉ 15–25W, chạy êm ái năm này qua năm khác.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: MÁY TÍNH WINDOWS PHÒNG BAN */}
      {/* ========================================================================= */}
      {activeSubTab === 5 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider">
                Tận dụng máy tính phòng làm máy chủ (On-Premise)
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-2">
                Cách Biến Máy tính Windows 24/24 thành Máy chủ CSDL Nội bộ
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chủ động 100% phần cứng, dung lượng ổ cứng không giới hạn, tốc độ phản hồi cực nhanh trong mạng LAN cơ quan.
              </p>
            </div>

            <a
              href="https://www.postgresql.org/download/windows/"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-1.5 self-start sm:self-auto shadow-xs"
            >
              <span>Trang tải PostgreSQL Windows</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Benefits */}
            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Ưu điểm khi dùng máy Windows nội bộ</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                <li><strong>Tốc độ cực nhanh:</strong> Ping mạng LAN dưới 1–5ms, phản hồi tức thì.</li>
                <li><strong>Dung lượng không giới hạn:</strong> Thoải mái lưu hàng triệu bản ghi theo dung lượng ổ cứng máy tính (500GB – 2TB).</li>
                <li><strong>Hoàn toàn làm chủ:</strong> Dữ liệu nằm trong phòng, không phụ thuộc internet quốc tế.</li>
              </ul>
            </div>

            {/* Cautions */}
            <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Lưu ý quan trọng cần duy trì</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                <li><strong>Nguồn điện & Mạng:</strong> Máy cần bật liên tục và cắm dây mạng LAN cố định. Nên có bộ lưu điện UPS.</li>
                <li><strong>Sao lưu định kỳ:</strong> Cài đặt lịch sao lưu file sao lưu ra ổ đĩa di động hoặc Google Drive phòng rủi ro hỏng ổ cứng máy tính.</li>
              </ul>
            </div>
          </div>

          {/* Steps */}
          <div className="pt-2">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#1F4E78]" />
              Các bước cài đặt & cấu hình (Mất khoảng 10–15 phút, làm 1 lần duy nhất)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Step 1 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  1
                </span>
                <h4 className="text-xs font-black text-slate-900">Cài đặt PostgreSQL for Windows</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tải bộ cài đặt <strong>PostgreSQL Installer</strong> (khuyên dùng bản 15 hoặc 16 x86-64) từ trang chủ:
              </p>
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <p>• Chạy file cài đặt, chọn đặt mật khẩu cho tài khoản <strong className="font-mono">postgres</strong> (ví dụ: <span className="font-mono text-[#1F4E78]">matkhau_kpi_2026</span>).</p>
                <p>• Giữ nguyên cổng mặc định là <strong>5432</strong> và hoàn tất cài đặt.</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  2
                </span>
                <h4 className="text-xs font-black text-slate-900">Mở Port 5432 trên Windows Firewall</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Mở <strong>PowerShell</strong> (với quyền <em>Run as Administrator</em>) trên máy tính đó và chạy 1 dòng lệnh sau để mở cổng mạng LAN:
              </p>
              <div className="relative">
                <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto border border-slate-800">
                  {WINDOWS_POWERSHELL_CMD}
                </pre>
                <button
                  type="button"
                  onClick={() => copyToClipboard(WINDOWS_POWERSHELL_CMD, setCopiedPowerShell)}
                  className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] transition flex items-center gap-1 cursor-pointer"
                >
                  {copiedPowerShell ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedPowerShell ? 'Đã chép!' : 'Copy lệnh'}
                </button>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  3
                </span>
                <h4 className="text-xs font-black text-slate-900">Cho phép các máy khác kết nối (pg_hba.conf)</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Mở file <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-300">C:\Program Files\PostgreSQL\16\data\pg_hba.conf</code> và thêm dòng này vào cuối file:
              </p>
              <pre className="p-2.5 bg-slate-900 text-amber-300 font-mono text-[11px] rounded-xl border border-slate-800">
                host    all             all             0.0.0.0/0               md5
              </pre>
              <p className="text-[11px] text-slate-500">
                Sau đó mở ứng dụng <strong>Services</strong> trên Windows và bấm <strong>Restart</strong> dịch vụ <em>postgresql-x64-16</em>.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#1F4E78] text-white font-black text-xs flex items-center justify-center shrink-0">
                  4
                </span>
                <h4 className="text-xs font-black text-slate-900">Lấy địa chỉ IP và Kết nối</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Mở Command Prompt gõ lệnh <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-300">ipconfig</code> để xem IP (ví dụ: <span className="font-mono text-[#1F4E78]">192.168.1.50</span>).
              </p>
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                <span className="text-[11px] font-bold text-slate-700 block">Chuỗi kết nối dán vào tab 1:</span>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-300 font-mono text-[11px] text-slate-800 break-all">
                  postgresql://postgres:matkhau_kpi_2026@192.168.1.50:5432/postgres
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: MÃ SQL KHỞI TẠO BẢNG (DDL) */}
      {/* ========================================================================= */}
      {activeSubTab === 6 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-[#1F4E78]" />
                <h2 className="text-xl font-black text-slate-900">
                  Mã Lệnh SQL Khởi tạo Cơ sở Dữ liệu Chuẩn (DDL Script)
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Chứa toàn bộ cấu trúc 8 bảng chuẩn hóa, khóa ngoại, chỉ mục index tương thích 100% với PostgreSQL.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => copyToClipboard(DDL_SCRIPT, setCopiedDdl)}
                className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-purple-200"
              >
                {copiedDdl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedDdl ? 'Đã sao chép!' : 'Sao chép toàn bộ SQL'}
              </button>

              <button
                type="button"
                onClick={downloadDdlFile}
                className="px-3.5 py-2 rounded-xl bg-[#1F4E78] hover:bg-[#163a5c] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Tải file .sql
              </button>
            </div>
          </div>

          <div className="relative">
            <pre className="p-5 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl overflow-x-auto max-h-[600px] border border-slate-800 leading-relaxed">
              {DDL_SCRIPT}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
