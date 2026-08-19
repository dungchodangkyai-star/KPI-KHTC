import React, { useState, useEffect } from 'react';
import { 
  Database, Server, ShieldCheck, CheckCircle2, 
  AlertTriangle, RefreshCw, Zap, Save, HelpCircle, 
  Globe, HardDrive, Lock, Check, Terminal, ExternalLink,
  Archive, Clock, Calendar, Download, Trash2, RotateCcw,
  Cloud, CloudRain, CloudUpload, Radio, FileText, Settings,
  Play, Sparkles, CheckSquare, Layers, ShieldAlert, Cpu,
  Copy, Info, Code2, ChevronDown, ChevronUp, Send
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

interface BackupConfig {
  enabled: boolean;
  frequency: 'daily' | 'hourly' | 'weekly';
  dailyTime: string;
  maxCopies: number;
  offsite: {
    enabled: boolean;
    provider: 'webhook' | 'google_drive' | 'onedrive' | 'nas_api';
    destinationUrl: string;
    authHeaderName?: string;
    authHeaderValue?: string;
    sendAsMultipart?: boolean;
  };
  lastBackupAt?: string;
  lastBackupStatus?: 'success' | 'failed' | 'idle';
  lastBackupMessage?: string;
}

interface BackupItem {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  recordCounts: {
    users: number;
    works: number;
    assignments: number;
    overtimes: number;
    categories: number;
  };
  triggerType: 'auto_scheduled' | 'manual';
  offsiteSynced?: boolean;
  offsiteMessage?: string;
}

export default function AdminDatabase() {
  const { orgConfig } = useOrgConfig();
  const [activeTab, setActiveTab] = useState<'backup' | 'database'>('backup');

  // Database State
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

  // Backup State
  const [backupConfig, setBackupConfig] = useState<BackupConfig>({
    enabled: true,
    frequency: 'daily',
    dailyTime: '23:30',
    maxCopies: 30,
    offsite: {
      enabled: false,
      provider: 'google_drive',
      destinationUrl: '',
      authHeaderName: '',
      authHeaderValue: '',
      sendAsMultipart: false
    }
  });
  const [backupsList, setBackupsList] = useState<BackupItem[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [manualBackingUp, setManualBackingUp] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [showDriveGuide, setShowDriveGuide] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Notice State
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchConfig();
    fetchBackupData();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/database/config');
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json.success && json.data) {
          setConfig(json.data);
        }
      } catch (err) {
        console.error('Error parsing database config json:', err, text);
      }
    } catch (err) {
      console.error('Error fetching database config:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBackupData = async () => {
    setBackupLoading(true);
    try {
      const [resCfg, resList] = await Promise.all([
        fetch('/api/backups/config'),
        fetch('/api/backups/list')
      ]);
      const textCfg = await resCfg.text();
      const textList = await resList.text();
      
      try {
        const dataCfg = JSON.parse(textCfg);
        if (dataCfg.success && dataCfg.data) {
          setBackupConfig(dataCfg.data);
        }
      } catch (e) {
        console.error('Error parsing config json:', e, textCfg);
      }

      try {
        const dataList = JSON.parse(textList);
        if (dataList.success && Array.isArray(dataList.data)) {
          setBackupsList(dataList.data);
        }
      } catch (e) {
        console.error('Error parsing list json:', e, textList);
      }
    } catch (err) {
      console.error('Error fetching backup data:', err);
    } finally {
      setBackupLoading(false);
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

  const handleTestWebhook = async () => {
    if (!backupConfig.offsite?.destinationUrl) {
      alert('Vui lòng nhập Địa chỉ Webhook / URL Web App trước khi kiểm tra!');
      return;
    }
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch('/api/backups/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupConfig.offsite)
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { 
          success: false, 
          message: `Máy chủ trả về kết quả không phải JSON (có thể server vừa khởi động lại). Vui lòng bấm thử lại!` 
        };
      }
      setWebhookTestResult(json);
      if (json.success) {
        setNotice({ type: 'success', text: json.message || 'Kết nối Webhook Google Drive thành công!' });
      } else {
        setNotice({ type: 'error', text: json.message || 'Kết nối Webhook thất bại!' });
      }
    } catch (err: any) {
      setWebhookTestResult({ success: false, message: `Lỗi gọi API: ${err?.message || String(err)}` });
      setNotice({ type: 'error', text: `Lỗi: ${err?.message || String(err)}` });
    } finally {
      setTestingWebhook(false);
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
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { success: false, error: 'Lỗi phản hồi từ máy chủ' };
      }
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

  const handleSaveBackupConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/backups/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupConfig)
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { success: false, error: 'Lỗi phản hồi từ máy chủ' };
      }
      if (json.success) {
        setNotice({ type: 'success', text: 'ĐÃ LƯU THÀNH CÔNG: Lịch trình tự động sao lưu & Google Drive Webhook đã được kích hoạt!' });
        if (json.data) {
          setBackupConfig(json.data);
        }
        // Scroll smoothly to top to show notice clearly
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setNotice({ type: 'error', text: json.error || 'Lỗi khi lưu cấu hình sao lưu!' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi máy chủ: ${err?.message || String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  const handleManualBackup = async () => {
    setManualBackingUp(true);
    setNotice(null);
    try {
      const res = await fetch('/api/backups/run', { method: 'POST' });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { success: false, error: 'Lỗi phản hồi từ máy chủ' };
      }
      if (json.success) {
        setNotice({ type: 'success', text: 'Đã tạo bản sao lưu toàn diện hệ thống thành công!' });
        fetchBackupData();
      } else {
        setNotice({ type: 'error', text: json.error || 'Lỗi khi thực hiện sao lưu!' });
      }
    } catch (e: any) {
      setNotice({ type: 'error', text: `Lỗi kết nối: ${e?.message || String(e)}` });
    } finally {
      setManualBackingUp(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa bản sao lưu "${filename}"?`)) return;
    try {
      const res = await fetch(`/api/backups/${filename}`, { method: 'DELETE' });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { success: false, error: 'Lỗi phản hồi' };
      }
      if (json.success) {
        setNotice({ type: 'success', text: 'Đã xóa bản sao lưu thành công!' });
        fetchBackupData();
      } else {
        alert('Lỗi: ' + json.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + (e?.message || String(e)));
    }
  };

  const handlePruneBackups = async () => {
    if (!confirm(`Hệ thống sẽ tự động dọn dẹp các bản sao lưu cũ, chỉ giữ lại ${backupConfig.maxCopies || 30} bản gần nhất để tối ưu dung lượng bộ nhớ. Tiếp tục?`)) return;
    setPruning(true);
    try {
      const res = await fetch('/api/backups/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxCopies: backupConfig.maxCopies })
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { success: false, error: 'Lỗi phản hồi' };
      }
      if (json.success) {
        setNotice({ type: 'success', text: json.message });
        fetchBackupData();
      } else {
        alert('Lỗi: ' + json.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + (e?.message || String(e)));
    } finally {
      setPruning(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!confirm(`CẢNH BÁO QUAN TRỌNG: Bạn có chắc chắn muốn KHÔI PHỤC toàn bộ dữ liệu từ bản sao lưu "${filename}"?\n\nDữ liệu hiện tại sẽ được cập nhật/đồng bộ theo đúng trạng thái của thời điểm sao lưu này.`)) return;
    
    setRestoringId(filename);
    try {
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { success: false, error: 'Lỗi phản hồi' };
      }
      if (json.success) {
        alert(json.message || 'Khôi phục dữ liệu thành công!');
        setNotice({ type: 'success', text: json.message || 'Khôi phục dữ liệu thành công!' });
        window.location.reload();
      } else {
        alert('Lỗi khôi phục: ' + json.error);
      }
    } catch (e: any) {
      alert('Lỗi kết nối máy chủ: ' + (e?.message || String(e)));
    } finally {
      setRestoringId(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const GOOGLE_APPS_SCRIPT_TEMPLATE = `// 1. Mở https://script.google.com -> Tạo Dự án mới (New project)
// 2. Dán toàn bộ đoạn code này vào:

const FOLDER_ID = "1UjEDg9a49e4YQZ_vWXgYXoc56HfM85Rc"; // ID thư mục Drive của bạn

function doPost(e) {
  try {
    const rawData = e.postData.contents;
    const body = JSON.parse(rawData);
    const filename = body.filename || ("backup_" + new Date().getTime() + ".json");
    
    let fileContent = "";
    if (body.contentBase64) {
      const decoded = Utilities.base64Decode(body.contentBase64, Utilities.Charset.UTF_8);
      fileContent = Utilities.newBlob(decoded).getDataAsString();
    } else if (body.contentJson) {
      fileContent = JSON.stringify(body.contentJson, null, 2);
    } else {
      fileContent = rawData;
    }

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const file = folder.createFile(filename, fileContent, MimeType.PLAIN_TEXT);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Đã lưu bản sao lưu vào Google Drive thành công",
      fileId: file.getId(),
      fileName: file.getName()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 3. Bấm nút "Triển khai" (Deploy) > "Tùy chọn triển khai mới" (New deployment)
// 4. Loại: Ứng dụng web (Web app)
//    - Thực thi dưới dạng: Tôi (Me)
//    - Ai có quyền truy cập: Bất kỳ ai (Anyone)
// 5. Bấm "Triển khai" và Sao chép URL Web App (có đuôi /exec) dán vào ô "Địa chỉ Webhook / URL API lưu trữ" bên dưới.`;

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 font-sans">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#1F4E78] to-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-900/20 shrink-0">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Cơ sở Dữ liệu & Tự động Sao lưu Dự phòng</h1>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                An toàn tuyệt đối
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cơ chế tự động sao lưu định kỳ, tùy biến lịch trình, đẩy bản sao lưu lên Google Drive/OneDrive/NAS và chống mất dữ liệu đa tầng.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => { fetchConfig(); fetchBackupData(); }}
            disabled={loading || backupLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loading || backupLoading) ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Navigation Tab Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('backup')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'backup'
              ? 'bg-[#1F4E78] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Archive className="w-4 h-4" />
          Tự động Sao lưu & Khôi phục dữ liệu
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-black">
            {backupsList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('database')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'database'
              ? 'bg-[#1F4E78] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          Cấu hình Máy chủ CSDL (PostgreSQL / NAS)
        </button>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm font-semibold animate-in fade-in duration-200 shadow-sm ${
          notice.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-2 ring-emerald-400/20' 
            : 'bg-rose-50 text-rose-900 border-rose-300 ring-2 ring-rose-400/20'
        }`}>
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
          )}
          <div className="flex-1 font-bold">
            {notice.text}
          </div>
        </div>
      )}

      {/* TAB 1: AUTOMATED BACKUP & RESTORE */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Quick Action & Status Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Status Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái Tự động</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${backupConfig.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                </div>
                <h3 className="text-lg font-black text-slate-900 mt-2">
                  {backupConfig.enabled ? 'Đang chạy tự động' : 'Đã tạm dừng'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Lịch: <strong className="text-slate-800 font-semibold">{backupConfig.frequency === 'daily' ? `Hàng ngày lúc ${backupConfig.dailyTime}` : backupConfig.frequency === 'hourly' ? 'Mỗi 1 giờ' : 'Hàng tuần'}</strong>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Số bản lưu tối đa:</span>
                <strong className="text-blue-700">{backupConfig.maxCopies} bản</strong>
              </div>
            </div>

            {/* Last Backup Info */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lần sao lưu gần nhất</span>
                  <Clock className="w-4 h-4 text-slate-400" />
                </div>
                <h3 className="text-sm font-black text-slate-900 mt-2 truncate">
                  {backupConfig.lastBackupAt ? formatDate(backupConfig.lastBackupAt) : 'Chưa có bản sao lưu'}
                </h3>
                <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                  {backupConfig.lastBackupMessage || 'Hệ thống sẵn sàng.'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Tổng số bản lưu hiện có:</span>
                <strong className="text-slate-900 font-bold">{backupsList.length} bản</strong>
              </div>
            </div>

            {/* Instant Backup Button Card */}
            <div className="bg-gradient-to-br from-[#1F4E78] to-[#14324f] text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-blue-100">Sao lưu Tức thì</span>
                </div>
                <h4 className="text-base font-black text-white mt-2">Tạo điểm phục hồi ngay</h4>
                <p className="text-xs text-blue-100/80 mt-1">
                  Đóng gói toàn bộ Công việc, Nhân sự, Phân công và KPI thành 1 bản chụp an toàn.
                </p>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleManualBackup}
                  disabled={manualBackingUp}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-blue-50 text-[#1F4E78] font-black text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 fill-current ${manualBackingUp ? 'animate-spin' : ''}`} />
                  {manualBackingUp ? 'Đang sao lưu...' : 'Sao lưu ngay (1-Click)'}
                </button>
              </div>
            </div>
          </div>

          {/* Backup Schedule & Offsite Configuration Form */}
          <form onSubmit={handleSaveBackupConfig} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#1F4E78]" />
                  Cấu hình Lịch trình Tự động & Ngoại vi (Google Drive / OneDrive / NAS)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quản trị viên chủ động cài đặt lịch chạy tự động, cơ chế tự động xóa bản cũ và tích hợp đồng bộ đám mây.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePruneBackups}
                  disabled={pruning}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  {pruning ? 'Đang dọn dẹp...' : 'Dọn dẹp bản sao lưu cũ'}
                </button>
              </div>
            </div>

            {/* Schedule Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Enable Switch */}
              <div className="md:col-span-12 flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="space-y-0.5">
                  <label className="text-xs font-black text-slate-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    Kích hoạt Cơ chế Tự động Sao lưu theo Lịch trình
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Khi bật, hệ thống máy chủ sẽ tự động chụp ảnh dữ liệu độc lập theo đúng tần suất đã định mà không cần người dùng can thiệp.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={backupConfig.enabled}
                    onChange={(e) => setBackupConfig({ ...backupConfig, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1F4E78]"></div>
                </label>
              </div>

              {/* Frequency */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Tần suất sao lưu</label>
                <select
                  value={backupConfig.frequency}
                  onChange={(e: any) => setBackupConfig({ ...backupConfig, frequency: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E78]"
                >
                  <option value="daily">Hàng ngày (Khuyên dùng)</option>
                  <option value="hourly">Mỗi 1 giờ</option>
                  <option value="weekly">Hàng tuần (Chủ nhật)</option>
                </select>
              </div>

              {/* Daily Time */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Khung giờ chạy (HH:MM)</label>
                <input
                  type="time"
                  value={backupConfig.dailyTime || '23:30'}
                  onChange={(e) => setBackupConfig({ ...backupConfig, dailyTime: e.target.value })}
                  disabled={backupConfig.frequency !== 'daily'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E78] disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              {/* Max Copies (Pruning) */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Số lượng bản lưu giữ tối đa (Tự động xóa bản cũ)
                </label>
                <input
                  type="number"
                  min="3"
                  max="365"
                  value={backupConfig.maxCopies || 30}
                  onChange={(e) => setBackupConfig({ ...backupConfig, maxCopies: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E78]"
                />
                <p className="text-[10px] text-slate-500">
                  Khi vượt quá {backupConfig.maxCopies} bản, hệ thống sẽ tự động giải phóng bản cũ nhất để tiết kiệm dung lượng.
                </p>
              </div>

              {/* Offsite Cloud Sync Box */}
              <div className="md:col-span-12 p-5 rounded-2xl border border-blue-100 bg-blue-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CloudUpload className="w-5 h-5 text-[#1F4E78]" />
                    <div>
                      <h4 className="text-xs font-black text-slate-900">
                        Tự động đẩy file sao lưu lên Google Drive / OneDrive / NAS (Offsite Webhook & API)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Mỗi khi có bản sao lưu mới, hệ thống tự động đẩy file nén Base64 kèm metadata lên endpoint bạn chỉ định.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={backupConfig.offsite?.enabled}
                      onChange={(e) => setBackupConfig({
                        ...backupConfig,
                        offsite: { ...backupConfig.offsite, enabled: e.target.checked }
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1F4E78]"></div>
                  </label>
                </div>

                {backupConfig.offsite?.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-3 border-t border-blue-200/60 animate-in fade-in duration-200">
                    <div className="md:col-span-4 space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Dịch vụ lưu trữ ngoại vi</label>
                      <select
                        value={backupConfig.offsite.provider}
                        onChange={(e: any) => setBackupConfig({
                          ...backupConfig,
                          offsite: { ...backupConfig.offsite, provider: e.target.value }
                        })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="google_drive">Google Drive Webhook Script (Khuyên dùng)</option>
                        <option value="webhook">Custom Webhook (Make / Zapier / N8N)</option>
                        <option value="onedrive">Microsoft Power Automate (OneDrive)</option>
                        <option value="nas_api">Synology / QNAP NAS Storage API</option>
                      </select>
                    </div>

                    <div className="md:col-span-8 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700">
                          Địa chỉ Webhook / URL Web App nhận file (Destination URL)
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleTestWebhook}
                            disabled={testingWebhook || !backupConfig.offsite.destinationUrl}
                            className="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-[#1F4E78] text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Send className={`w-3 h-3 ${testingWebhook ? 'animate-spin' : ''}`} />
                            {testingWebhook ? 'Đang test...' : 'Bấm thử kết nối ngay'}
                          </button>

                          {backupConfig.offsite.provider === 'google_drive' && (
                            <button
                              type="button"
                              onClick={() => setShowDriveGuide(!showDriveGuide)}
                              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer underline"
                            >
                              <Info className="w-3.5 h-3.5" />
                              {showDriveGuide ? 'Ẩn hướng dẫn' : 'Xem mã Script'}
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="url"
                        value={backupConfig.offsite.destinationUrl || ''}
                        onChange={(e) => setBackupConfig({
                          ...backupConfig,
                          offsite: { ...backupConfig.offsite, destinationUrl: e.target.value }
                        })}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                        required={backupConfig.offsite.enabled}
                      />
                      <p className="text-[10px] text-slate-500">
                        * URL chuẩn Google Apps Script kết thúc bằng đuôi <strong className="font-mono text-blue-700">/exec</strong>.
                      </p>
                    </div>

                    {/* Webhook Test Feedback Banner */}
                    {webhookTestResult && (
                      <div className={`md:col-span-12 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
                        webhookTestResult.success 
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
                          : 'bg-rose-50 text-rose-900 border-rose-300'
                      }`}>
                        {webhookTestResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <strong className="block">{webhookTestResult.message}</strong>
                          {webhookTestResult.latencyMs && (
                            <span className="text-[11px] opacity-75">Tốc độ phản hồi từ máy chủ Google: {webhookTestResult.latencyMs} ms</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Google Apps Script Guide Drawer */}
                    {showDriveGuide && (
                      <div className="md:col-span-12 p-4 rounded-xl bg-slate-900 text-slate-200 border border-slate-700 space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-white font-bold text-xs">
                            <Code2 className="w-4 h-4 text-emerald-400" />
                            <span>Mã nguồn Google Apps Script nhận file tự động vào Thư mục Drive của bạn:</span>
                          </div>
                          <button
                            type="button"
                            onClick={copyScriptToClipboard}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedScript ? 'Đã sao chép code!' : 'Sao chép toàn bộ mã'}
                          </button>
                        </div>
                        <pre className="p-3 bg-slate-950 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 border border-slate-800">
                          {GOOGLE_APPS_SCRIPT_TEMPLATE}
                        </pre>
                        <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-slate-800">
                          <p><strong>Cách làm nhanh:</strong> 1. Truy cập <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-blue-400 underline">script.google.com</a> ➔ Tạo Dự án mới ➔ Dán mã trên vào.</p>
                          <p>2. Nhấn <strong>Triển khai (Deploy)</strong> ➔ <strong>Tùy chọn triển khai mới (New deployment)</strong> ➔ Chọn loại <strong>Ứng dụng web (Web app)</strong>.</p>
                          <p>3. Chọn <em>"Ai có quyền truy cập: Bất kỳ ai (Anyone)"</em> ➔ Sao chép URL kết thúc bằng <strong>/exec</strong> dán vào ô bên trên.</p>
                        </div>
                      </div>
                    )}

                    <div className="md:col-span-4 space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Tên Header xác thực (Tùy chọn - để trống nếu không dùng)
                      </label>
                      <input
                        type="text"
                        value={backupConfig.offsite.authHeaderName || ''}
                        onChange={(e) => setBackupConfig({
                          ...backupConfig,
                          offsite: { ...backupConfig.offsite, authHeaderName: e.target.value }
                        })}
                        placeholder="Để trống nếu là Google Drive Webhook"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                      />
                      <p className="text-[10px] text-slate-500">Chỉ dùng khi máy chủ NAS hoặc API riêng yêu cầu khóa bảo mật.</p>
                    </div>

                    <div className="md:col-span-8 space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Giá trị Token / API Key (Tùy chọn - để trống nếu không dùng)
                      </label>
                      <input
                        type="password"
                        value={backupConfig.offsite.authHeaderValue || ''}
                        onChange={(e) => setBackupConfig({
                          ...backupConfig,
                          offsite: { ...backupConfig.offsite, authHeaderValue: e.target.value }
                        })}
                        placeholder="Để trống nếu là Google Drive Webhook"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-800 bg-white"
                      />
                      <p className="text-[10px] text-slate-500">Đối với Google Drive Webhook Script, bạn để trống 2 ô này.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Save Config Button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-[#1F4E78] hover:bg-[#173a5a] text-white text-xs font-extrabold shadow-md shadow-blue-900/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Đang lưu cấu hình...' : 'Lưu Lịch trình & Cài đặt Sao lưu'}
              </button>
            </div>
          </form>

          {/* Backup History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Archive className="w-4 h-4 text-[#1F4E78]" />
                  Danh sách Các bản Sao lưu Hệ thống
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quản lý, tải về bản sao lưu độc lập hoặc khôi phục dữ liệu nhanh khi cần thiết.
                </p>
              </div>

              <span className="text-xs font-bold text-slate-500">
                {backupsList.length} bản ghi
              </span>
            </div>

            {backupsList.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-3">
                <Archive className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold">Chưa có bản sao lưu nào được tạo.</p>
                <button
                  onClick={handleManualBackup}
                  className="px-4 py-2 rounded-xl bg-[#1F4E78] text-white text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Tạo bản sao lưu đầu tiên
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">Thời điểm sao lưu</th>
                      <th className="p-3.5">Tên file</th>
                      <th className="p-3.5">Kiểu chạy</th>
                      <th className="p-3.5">Dữ liệu ghi nhận</th>
                      <th className="p-3.5">Dung lượng</th>
                      <th className="p-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {backupsList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-600">
                          {item.filename}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          {item.triggerType === 'auto_scheduled' ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#1F4E78] border border-blue-200 font-bold text-[10px] flex items-center gap-1 w-fit">
                              <Clock className="w-3 h-3" />
                              Tự động định kỳ
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px] flex items-center gap-1 w-fit">
                              <Sparkles className="w-3 h-3" />
                              Thủ công 1-Click
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-slate-600">
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="font-semibold text-slate-900">{item.recordCounts?.works || 0} việc</span>
                            <span>•</span>
                            <span>{item.recordCounts?.users || 0} cán bộ</span>
                            <span>•</span>
                            <span>{item.recordCounts?.assignments || 0} giao việc</span>
                          </div>
                        </td>
                        <td className="p-3.5 font-mono font-bold text-slate-600 whitespace-nowrap">
                          {formatBytes(item.sizeBytes)}
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={`/api/backups/download/${item.filename}`}
                              download
                              title="Tải về file sao lưu .json"
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1F4E78] transition font-bold text-[11px] inline-flex items-center gap-1"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Tải về
                            </a>

                            <button
                              type="button"
                              onClick={() => handleRestoreBackup(item.filename)}
                              disabled={restoringId === item.filename}
                              title="Khôi phục dữ liệu từ bản này"
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${restoringId === item.filename ? 'animate-spin' : ''}`} />
                              Khôi phục
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteBackup(item.filename)}
                              title="Xóa bản sao lưu này"
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DATABASE CONFIGURATION */}
      {activeTab === 'database' && (
        <div className="space-y-6">
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
                  <label className="text-xs font-bold text-slate-700">Mật khẩu (Password)</label>
                  <input
                    type="password"
                    value={config.password || ''}
                    onChange={e => setConfig({ ...config, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
                  />
                </div>

                <div className="md:col-span-12 flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="ssl_toggle"
                    checked={config.ssl || false}
                    onChange={e => setConfig({ ...config, ssl: e.target.checked })}
                    className="w-4 h-4 text-[#1F4E78] rounded border-slate-300 focus:ring-[#1F4E78]"
                  />
                  <label htmlFor="ssl_toggle" className="text-xs font-bold text-slate-700 select-none cursor-pointer">
                    Bật mã hóa SSL/TLS (Yêu cầu cho Neon, Supabase, AWS RDS, GCP Cloud SQL)
                  </label>
                </div>
              </div>

              {/* Test Result Feedback Box */}
              {testResult && (
                <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
                  testResult.success 
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
                    : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}>
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">{testResult.message}</p>
                    {testResult.latencyMs && (
                      <p className="text-[11px] opacity-80">Thời gian phản hồi máy chủ: {testResult.latencyMs} ms</p>
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
                <span>Luôn có thể vào mục <em>Tự động Sao lưu</em> để tải file snapshot .JSON hoặc khôi phục hệ thống tức thì.</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                <strong className="text-white block font-bold">3. Chuẩn hóa phân quyền</strong>
                <span>Tài khoản Quản trị viên (Admin) có toàn quyền cấu hình kết nối database này trên từng dự án phòng ban riêng biệt.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
