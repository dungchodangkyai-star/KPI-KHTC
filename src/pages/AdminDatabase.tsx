import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, Server, ShieldCheck, CheckCircle2, 
  AlertTriangle, RefreshCw, Zap, Save, HelpCircle, 
  Globe, HardDrive, Lock, Check, Terminal, ExternalLink,
  Archive, Clock, Calendar, Download, Trash2, RotateCcw,
  Cloud, CloudRain, CloudUpload, Radio, FileText, Settings,
  Play, Sparkles, CheckSquare, Layers, ShieldAlert, Cpu,
  Copy, Info, Code2, ChevronDown, ChevronUp, Send, CheckCheck,
  Upload, X, ArrowRight, Shield, FolderSync, Activity, AlertCircle
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

interface BackupMetadata {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  recordCounts: {
    users?: number;
    works?: number;
    assignments?: number;
    overtimes?: number;
    categories?: number;
    kpiResults?: number;
    notifications?: number;
    logs?: number;
  };
  triggerType: 'manual' | 'auto_scheduled';
}

interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'hourly' | 'weekly';
  dailyTime: string;
  weeklyDay?: number;
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

  // Backup State
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [backupConfig, setBackupConfig] = useState<BackupScheduleConfig>({
    enabled: true,
    frequency: 'daily',
    dailyTime: '23:30',
    weeklyDay: 0,
    maxCopies: 30,
    offsite: {
      enabled: false,
      provider: 'google_drive',
      destinationUrl: '',
      authHeaderName: '',
      authHeaderValue: '',
      sendAsMultipart: false
    },
    lastBackupAt: '',
    lastBackupStatus: 'idle',
    lastBackupMessage: ''
  });

  const [loading, setLoading] = useState(true);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [syncingOffsiteFile, setSyncingOffsiteFile] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingBackupConfig, setSavingBackupConfig] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedBackupToRestore, setSelectedBackupToRestore] = useState<BackupMetadata | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Upload JSON Restore State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadedJsonPayload, setUploadedJsonPayload] = useState<any | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Copy state helpers
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [copiedCompose, setCopiedCompose] = useState(false);
  const [copiedPowerShell, setCopiedPowerShell] = useState(false);
  const [copiedGasScript, setCopiedGasScript] = useState(false);

  useEffect(() => {
    fetchConfigAndStats();
    fetchBackupData();
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

  const fetchBackupData = async () => {
    setLoadingBackups(true);
    try {
      const [resList, resConfig] = await Promise.all([
        fetch('/api/backups/list'),
        fetch('/api/backups/config')
      ]);

      const jsonList = await resList.json().catch(() => ({}));
      if (jsonList.success && Array.isArray(jsonList.data)) {
        setBackups(jsonList.data);
      }

      const jsonConfig = await resConfig.json().catch(() => ({}));
      if (jsonConfig.success && jsonConfig.data) {
        setBackupConfig(prev => ({ ...prev, ...jsonConfig.data }));
      }
    } catch (err) {
      console.error('Error fetching backup data:', err);
    } finally {
      setLoadingBackups(false);
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

  // 1-Click Backup Trigger
  const handleRunBackup = async () => {
    setRunningBackup(true);
    setNotice(null);
    try {
      const res = await fetch('/api/backups/run', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setNotice({ 
          type: 'success', 
          text: `Đã tạo điểm sao lưu tức thì thành công! Tổng cộng: ${json.data?.recordCounts?.works || 0} công việc, ${json.data?.recordCounts?.users || 0} nhân sự.` 
        });
        await fetchBackupData();
      } else {
        setNotice({ type: 'error', text: json.error || 'Lỗi khi tạo bản sao lưu!' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi: ${err?.message || String(err)}` });
    } finally {
      setRunningBackup(false);
    }
  };

  // Prune Backups
  const handlePruneBackups = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn dọn dẹp và chỉ giữ lại tối đa ${backupConfig.maxCopies || 30} bản sao lưu mới nhất không?`)) {
      return;
    }
    setPruning(true);
    setNotice(null);
    try {
      const res = await fetch('/api/backups/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxCopies: backupConfig.maxCopies || 30 })
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setNotice({ type: 'success', text: json.message || 'Đã dọn dẹp bộ nhớ thành công!' });
        await fetchBackupData();
      } else {
        setNotice({ type: 'error', text: json.error || 'Lỗi dọn dẹp!' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi: ${err?.message || String(err)}` });
    } finally {
      setPruning(false);
    }
  };

  // Delete single backup
  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bản sao lưu "${filename}" không?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setNotice({ type: 'success', text: 'Đã xóa bản sao lưu thành công!' });
        await fetchBackupData();
      } else {
        setNotice({ type: 'error', text: json.error || 'Không thể xóa file.' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi: ${err?.message || String(err)}` });
    }
  };

  // Push existing backup to offsite
  const handleSyncToOffsite = async (filename: string) => {
    setSyncingOffsiteFile(filename);
    setNotice(null);
    try {
      const res = await fetch(`/api/backups/sync-offsite/${encodeURIComponent(filename)}`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setNotice({ type: 'success', text: json.message || 'Đã đồng bộ lên đám mây ngoại vi thành công!' });
      } else {
        setNotice({ type: 'error', text: json.error || 'Đồng bộ ngoại vi thất bại. Kiểm tra lại cấu hình Webhook!' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi: ${err?.message || String(err)}` });
    } finally {
      setSyncingOffsiteFile(null);
    }
  };

  // Test Offsite Webhook
  const handleTestWebhook = async () => {
    if (!backupConfig.offsite?.destinationUrl) {
      alert('Vui lòng nhập Địa chỉ Webhook / URL Endpoint trước khi kiểm tra.');
      return;
    }
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch('/api/backups/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationUrl: backupConfig.offsite.destinationUrl,
          provider: backupConfig.offsite.provider,
          authHeaderName: backupConfig.offsite.authHeaderName,
          authHeaderValue: backupConfig.offsite.authHeaderValue
        })
      });
      const json = await res.json().catch(() => ({}));
      setWebhookTestResult(json);
      if (json.success) {
        setNotice({ type: 'success', text: json.message });
      } else {
        setNotice({ type: 'error', text: json.message || 'Kết nối Webhook thất bại!' });
      }
    } catch (err: any) {
      setWebhookTestResult({ success: false, message: `Lỗi kết nối: ${err?.message || String(err)}` });
      setNotice({ type: 'error', text: `Lỗi kết nối Webhook: ${err?.message || String(err)}` });
    } finally {
      setTestingWebhook(false);
    }
  };

  // Save Backup Schedule & Offsite Config
  const handleSaveBackupConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingBackupConfig(true);
    setNotice(null);
    try {
      const res = await fetch('/api/backups/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupConfig)
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setNotice({ type: 'success', text: 'Đã lưu cài đặt Lịch trình sao lưu & Đám mây Ngoại vi thành công!' });
        if (json.data) {
          setBackupConfig(prev => ({ ...prev, ...json.data }));
        }
        await fetchBackupData();
      } else {
        setNotice({ type: 'error', text: json.error || 'Lỗi khi lưu cấu hình sao lưu!' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi: ${err?.message || String(err)}` });
    } finally {
      setSavingBackupConfig(false);
    }
  };

  // Execute 1-Click Restore
  const handleConfirmRestore = async () => {
    if (!selectedBackupToRestore && !uploadedJsonPayload) return;
    setRestoring(true);
    setNotice(null);
    try {
      const bodyPayload = selectedBackupToRestore 
        ? { filename: selectedBackupToRestore.filename } 
        : { backupPayload: uploadedJsonPayload };

      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setNotice({ type: 'success', text: json.message || 'Khôi phục toàn bộ hệ thống thành công!' });
        setRestoreModalOpen(false);
        setUploadModalOpen(false);
        setSelectedBackupToRestore(null);
        setUploadedJsonPayload(null);
        await Promise.all([fetchConfigAndStats(), fetchBackupData()]);
      } else {
        setNotice({ type: 'error', text: json.error || 'Khôi phục thất bại!' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi khi khôi phục: ${err?.message || String(err)}` });
    } finally {
      setRestoring(false);
    }
  };

  // Handle File Input selection for manual restore
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.version || !parsed.data) {
          throw new Error('File JSON không đúng cấu trúc sao lưu của hệ thống PMO1 (thiếu version hoặc data).');
        }
        setUploadedJsonPayload(parsed);
      } catch (err: any) {
        setUploadError(err.message || 'File JSON không hợp lệ.');
        setUploadedJsonPayload(null);
      }
    };
    reader.onerror = () => {
      setUploadError('Không thể đọc file từ thiết bị.');
      setUploadedJsonPayload(null);
    };
    reader.readAsText(file);
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

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const GAS_WEBAPP_SAMPLE = `// GOOGLE APPS SCRIPT: Tự động nhận file Backup từ hệ thống PMO1 và lưu vào Google Drive
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var filename = data.filename || ("backup_" + new Date().getTime() + ".json");
    var base64Content = data.contentBase64;
    
    // Tạo file trong thư mục Google Drive của bạn
    var folderName = "PMO1_KPI_Backups";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    var decodedBlob = Utilities.newBlob(Utilities.base64Decode(base64Content), "application/json", filename);
    var createdFile = folder.createFile(decodedBlob);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: createdFile.getId(),
      fileUrl: createdFile.getUrl(),
      message: "Đã lưu thành công vào thư mục " + folderName + " trên Google Drive!"
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

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
    { id: 1, title: '1. Sao lưu & Khôi phục Thảm họa (1-Click)', icon: RotateCcw, highlight: true },
    { id: 2, title: '2. Cấu hình Lịch trình & Đám mây Ngoại vi', icon: CloudUpload },
    { id: 3, title: '3. Cấu hình Kết nối CSDL Khách hàng', icon: Settings },
    { id: 4, title: '4. Hướng dẫn Supabase (Miễn phí 2 phút)', icon: Cloud },
    { id: 5, title: '5. Hướng dẫn Neon.tech (1 phút)', icon: Zap },
    { id: 6, title: '6. Máy chủ NAS XPEnology (Private Cloud)', icon: HardDrive },
    { id: 7, title: '7. Máy tính Windows Phòng ban', icon: Cpu },
    { id: 8, title: '8. Mã SQL Khởi tạo bảng (DDL)', icon: Code2 },
  ];

  const totalBackupSize = backups.reduce((acc, b) => acc + (b.sizeBytes || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 font-sans text-slate-800">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1F4E78] text-white flex items-center justify-center shadow-md shadow-blue-900/20 shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Cơ sở Dữ liệu & Sao lưu Thảm họa (Disaster Recovery)</h1>
              <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-[#1F4E78] border border-blue-200">
                An toàn Dữ liệu Tuyệt đối
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Hệ thống tự động sao lưu nền 23:30, đồng bộ đám mây ngoại vi (Google Drive / OneDrive / NAS) và khôi phục 1-Click.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => {
              fetchConfigAndStats();
              fetchBackupData();
            }}
            disabled={loading || loadingBackups}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loading || loadingBackups) ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* 4 Status Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: CSDL Mode */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Trạng thái CSDL</span>
            <span className="text-sm font-black text-slate-900 flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {config.mode === 'local' ? 'PGlite Cục bộ (Sẵn sàng)' : 'PostgreSQL Khách hàng'}
            </span>
          </div>
        </div>

        {/* Metric 2: Lịch sao lưu tự động */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Tự động Sao lưu Nền</span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block">
              {backupConfig.enabled ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {backupConfig.frequency === 'daily' ? `Hàng ngày (${backupConfig.dailyTime || '23:30'})` : backupConfig.frequency === 'hourly' ? 'Mỗi giờ' : 'Hàng tuần'}
                </span>
              ) : (
                <span className="text-slate-400 font-semibold">Đang tạm tắt</span>
              )}
            </span>
          </div>
        </div>

        {/* Metric 3: Tổng bản chụp Snapshot */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Kho Bản sao lưu</span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block">
              {backups.length} bản snapshot ({formatFileSize(totalBackupSize)})
            </span>
          </div>
        </div>

        {/* Metric 4: Đám mây Ngoại vi */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <CloudUpload className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Đồng bộ Ngoại vi</span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block">
              {backupConfig.offsite?.enabled ? (
                <span className="text-purple-700 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {backupConfig.offsite.provider === 'google_drive' ? 'Google Drive' : backupConfig.offsite.provider === 'onedrive' ? 'OneDrive' : backupConfig.offsite.provider === 'nas_api' ? 'NAS Storage' : 'Webhook Ngoại vi'}
                </span>
              ) : (
                <span className="text-slate-400 font-normal">Chưa bật Offsite</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* 8 Sub-Tab Navigation Bar */}
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
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                isActive
                  ? 'bg-white text-[#1F4E78] shadow-sm border border-slate-200/80 ring-2 ring-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#1F4E78]' : tab.highlight ? 'text-blue-600' : 'text-slate-400'}`} />
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
      {/* TAB 1: TRUNG TÂM SAO LƯU & KHÔI PHỤC THẢM HỌA (1-CLICK RESTORE) */}
      {/* ========================================================================= */}
      {activeSubTab === 1 && (
        <div className="space-y-6">
          {/* Quick Action Control Bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-[#1F4E78]" />
                Trung tâm Quản lý & Khôi phục Dữ liệu 1-Click
              </h2>
              <p className="text-xs text-slate-500">
                Toàn bộ dữ liệu (8 bảng cơ sở) được chụp snapshot độc lập với giao dịch an toàn (REPEATABLE READ).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* 1-Click Backup Now */}
              <button
                type="button"
                onClick={handleRunBackup}
                disabled={runningBackup}
                className="px-4 py-2.5 rounded-xl bg-[#1F4E78] hover:bg-[#163a5c] text-white text-xs font-black shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 fill-current ${runningBackup ? 'animate-spin' : ''}`} />
                {runningBackup ? 'Đang chụp Snapshot...' : 'Sao lưu ngay (1-Click)'}
              </button>

              {/* Upload JSON to Restore */}
              <button
                type="button"
                onClick={() => {
                  setUploadModalOpen(true);
                  setUploadedJsonPayload(null);
                  setUploadFileName('');
                  setUploadError(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-black transition flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Khôi phục từ File .JSON
              </button>

              {/* Prune Backups */}
              <button
                type="button"
                onClick={handlePruneBackups}
                disabled={pruning}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Dọn dẹp bản sao lưu cũ để giải phóng dung lượng đĩa"
              >
                <Trash2 className={`w-3.5 h-3.5 ${pruning ? 'animate-spin' : ''}`} />
                {pruning ? 'Đang dọn...' : 'Dọn dẹp bộ nhớ'}
              </button>

              {/* Settings Shortcut */}
              <button
                type="button"
                onClick={() => setActiveSubTab(2)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="Cấu hình lịch tự động và Google Drive"
              >
                <Settings className="w-3.5 h-3.5" />
                Cấu hình Lịch trình
              </button>
            </div>
          </div>

          {/* Backup Snapshots Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Danh sách Các Bản Chụp Snapshot ({backups.length} bản)
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Tự động giữ tối đa <strong>{backupConfig.maxCopies || 30}</strong> bản lưu gần nhất
              </span>
            </div>

            {loadingBackups ? (
              <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#1F4E78]" />
                <span>Đang tải danh sách bản sao lưu...</span>
              </div>
            ) : backups.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-3">
                <Archive className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
                <p className="text-sm font-bold text-slate-700">Chưa có bản chụp snapshot nào trong hệ thống.</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Hãy bấm nút <strong className="text-[#1F4E78]">"Sao lưu ngay (1-Click)"</strong> ở trên để tạo điểm phục hồi an toàn đầu tiên cho phòng ban.
                </p>
                <button
                  type="button"
                  onClick={handleRunBackup}
                  disabled={runningBackup}
                  className="px-4 py-2 rounded-xl bg-[#1F4E78] text-white text-xs font-black shadow-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Tạo Bản Sao Lưu Đầu Tiên
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Thời gian & Tên Bản chụp</th>
                      <th className="py-3 px-3">Loại kích hoạt</th>
                      <th className="py-3 px-3">Chi tiết 8 Bảng Dữ liệu</th>
                      <th className="py-3 px-3">Dung lượng</th>
                      <th className="py-3 px-3">Đám mây Ngoại vi</th>
                      <th className="py-3 px-4 text-right">Thao tác Quản trị</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {backups.map((item, index) => {
                      const counts = item.recordCounts || {};
                      const isLatest = index === 0;

                      return (
                        <tr key={item.id || item.filename} className="hover:bg-blue-50/30 transition-colors">
                          {/* File & Time */}
                          <td className="py-3 px-4">
                            <div className="flex items-start gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1F4E78] flex items-center justify-center shrink-0 border border-blue-100 font-mono text-[10px] font-black mt-0.5">
                                #{backups.length - index}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-slate-900">
                                    {formatDateDisplay(item.createdAt)}
                                  </span>
                                  {isLatest && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">
                                      Mới nhất
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                                  {item.filename}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Trigger Type */}
                          <td className="py-3 px-3">
                            {item.triggerType === 'auto_scheduled' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                                <Clock className="w-3 h-3" />
                                Tự động ({backupConfig.dailyTime || '23:30'})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                                <Play className="w-2.5 h-2.5 fill-current" />
                                Thủ công 1-Click
                              </span>
                            )}
                          </td>

                          {/* Counts */}
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-bold" title="Công việc">
                                📋 {counts.works ?? 0} việc
                              </span>
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-bold" title="Nhân sự">
                                👥 {counts.users ?? 0} người
                              </span>
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-bold" title="Phân công">
                                🎯 {counts.assignments ?? 0} giao
                              </span>
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-bold" title="Làm thêm giờ">
                                ⏰ {counts.overtimes ?? 0} OT
                              </span>
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-bold" title="Kết quả KPI">
                                🏆 {counts.kpiResults ?? 0} KPI
                              </span>
                            </div>
                          </td>

                          {/* Size */}
                          <td className="py-3 px-3 font-mono text-slate-600 font-bold">
                            {formatFileSize(item.sizeBytes)}
                          </td>

                          {/* Offsite Status */}
                          <td className="py-3 px-3">
                            {backupConfig.offsite?.enabled ? (
                              <button
                                type="button"
                                onClick={() => handleSyncToOffsite(item.filename)}
                                disabled={syncingOffsiteFile === item.filename}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 transition cursor-pointer disabled:opacity-50"
                                title="Bấm để đẩy lại file này lên Đám mây Ngoại vi"
                              >
                                <CloudUpload className={`w-3 h-3 ${syncingOffsiteFile === item.filename ? 'animate-bounce' : ''}`} />
                                {syncingOffsiteFile === item.filename ? 'Đang đẩy...' : 'Đẩy lên Mây'}
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Chưa bật Offsite</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 1-Click Restore */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBackupToRestore(item);
                                  setRestoreModalOpen(true);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs transition flex items-center gap-1 border border-rose-200 cursor-pointer shadow-2xs"
                                title="Phục hồi toàn bộ CSDL về bản snapshot này"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Khôi phục
                              </button>

                              {/* Download .json */}
                              <a
                                href={`/api/backups/download/${encodeURIComponent(item.filename)}`}
                                download={item.filename}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                title="Tải file .json về máy tính"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => handleDeleteBackup(item.filename)}
                                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                title="Xóa bản sao lưu này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CẤU HÌNH LỊCH TRÌNH & ĐÁM MÂY NGOẠI VI (GOOGLE DRIVE / ONEDRIVE / NAS) */}
      {/* ========================================================================= */}
      {activeSubTab === 2 && (
        <form onSubmit={handleSaveBackupConfig} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Schedule & Retention */}
            <div className="lg:col-span-6 space-y-6">
              {/* Box 1: Scheduled Backup */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1F4E78] flex items-center justify-center">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Lịch trình Tự động Sao lưu Định kỳ</h3>
                      <p className="text-[11px] text-slate-500">Service ngầm tự kích hoạt đúng giờ không cần mở trình duyệt</p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={backupConfig.enabled}
                      onChange={(e) => setBackupConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1F4E78]"></div>
                  </label>
                </div>

                {backupConfig.enabled && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    {/* Frequency selector */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Tần suất sao lưu:</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'daily', label: 'Hàng ngày (Daily)' },
                          { id: 'hourly', label: 'Mỗi giờ (Hourly)' },
                          { id: 'weekly', label: 'Hàng tuần (Weekly)' }
                        ].map(freq => (
                          <button
                            key={freq.id}
                            type="button"
                            onClick={() => setBackupConfig(prev => ({ ...prev, frequency: freq.id as any }))}
                            className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                              backupConfig.frequency === freq.id
                                ? 'bg-[#1F4E78] text-white border-[#1F4E78] shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {freq.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Time of Day */}
                    {(backupConfig.frequency === 'daily' || backupConfig.frequency === 'weekly') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                            <span>Khung giờ chạy tự động:</span>
                            <span className="text-[10px] text-emerald-700 font-semibold">Khuyên dùng 23:30</span>
                          </label>
                          <input
                            type="time"
                            value={backupConfig.dailyTime || '23:30'}
                            onChange={(e) => setBackupConfig(prev => ({ ...prev, dailyTime: e.target.value }))}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:border-[#1F4E78]"
                          />
                        </div>

                        {backupConfig.frequency === 'weekly' && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">Thứ trong tuần:</label>
                            <select
                              value={backupConfig.weeklyDay ?? 0}
                              onChange={(e) => setBackupConfig(prev => ({ ...prev, weeklyDay: parseInt(e.target.value) }))}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:border-[#1F4E78]"
                            >
                              <option value={0}>Chủ nhật</option>
                              <option value={1}>Thứ hai</option>
                              <option value={2}>Thứ ba</option>
                              <option value={3}>Thứ tư</option>
                              <option value={4}>Thứ năm</option>
                              <option value={5}>Thứ sáu</option>
                              <option value={6}>Thứ bảy</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Auto Pruning / Retention Limit */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Số lượng bản lưu tối đa (Auto Pruning Retention):</span>
                        <span className="font-mono text-purple-700 font-bold">{backupConfig.maxCopies || 30} bản</span>
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        step="5"
                        value={backupConfig.maxCopies || 30}
                        onChange={(e) => setBackupConfig(prev => ({ ...prev, maxCopies: parseInt(e.target.value) }))}
                        className="w-full accent-[#1F4E78] cursor-pointer"
                      />
                      <p className="text-[11px] text-slate-500">
                        Khi vượt quá {backupConfig.maxCopies || 30} bản, hệ thống sẽ tự động dọn dẹp các bản cũ nhất để tiết kiệm bộ nhớ máy chủ.
                      </p>
                    </div>

                    {/* Anti-disturbance Guarantee */}
                    <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-[11px] text-emerald-900 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Bảo đảm Yên tĩnh:</strong> Hệ thống sao lưu chạy hoàn toàn âm thầm, tuyệt đối <strong>KHÔNG gửi tin nhắn Zalo</strong> làm phiền cán bộ & quản trị viên.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Offsite Cloud Sync (Google Drive / OneDrive / NAS) */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                      <CloudUpload className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Đồng bộ Đám mây Ngoại vi (Offsite Cloud)</h3>
                      <p className="text-[11px] text-slate-500">Tự động đẩy file Base64 lên Google Drive / OneDrive / NAS</p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={backupConfig.offsite?.enabled}
                      onChange={(e) => setBackupConfig(prev => ({ 
                        ...prev, 
                        offsite: { ...prev.offsite, enabled: e.target.checked } 
                      }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {backupConfig.offsite?.enabled && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    {/* Provider Select */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Dịch vụ Lưu trữ Đám mây:</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'google_drive', label: 'Google Drive Webhook', icon: Cloud },
                          { id: 'onedrive', label: 'Microsoft OneDrive', icon: FolderSync },
                          { id: 'nas_api', label: 'Synology / QNAP NAS', icon: HardDrive },
                          { id: 'webhook', label: 'Custom Webhook (Make/N8N)', icon: Radio }
                        ].map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setBackupConfig(prev => ({
                              ...prev,
                              offsite: { ...prev.offsite, provider: p.id as any }
                            }))}
                            className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                              backupConfig.offsite.provider === p.id
                                ? 'bg-purple-50 text-purple-900 border-purple-400 font-black shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 text-xs font-medium'
                            }`}
                          >
                            <p.icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-[11px] truncate">{p.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Destination Webhook URL */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Địa chỉ Webhook / URL Web App:</span>
                        <span className="text-[10px] text-slate-400 font-normal">Hỗ trợ Google Script exec URL</span>
                      </label>
                      <input
                        type="url"
                        value={backupConfig.offsite.destinationUrl || ''}
                        onChange={(e) => setBackupConfig(prev => ({
                          ...prev,
                          offsite: { ...prev.offsite, destinationUrl: e.target.value }
                        }))}
                        placeholder="https://script.google.com/macros/s/AKfycby.../exec"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs text-slate-900 bg-white focus:outline-none focus:border-purple-600"
                      />
                    </div>

                    {/* Optional Auth Header */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">Header Xác thực (Tùy chọn):</label>
                        <input
                          type="text"
                          value={backupConfig.offsite.authHeaderName || ''}
                          onChange={(e) => setBackupConfig(prev => ({
                            ...prev,
                            offsite: { ...prev.offsite, authHeaderName: e.target.value }
                          }))}
                          placeholder="Authorization hoặc x-api-key"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">Mã Token / Secret Key:</label>
                        <input
                          type="password"
                          value={backupConfig.offsite.authHeaderValue || ''}
                          onChange={(e) => setBackupConfig(prev => ({
                            ...prev,
                            offsite: { ...prev.offsite, authHeaderValue: e.target.value }
                          }))}
                          placeholder="Bearer token_xyz..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Test Webhook Button */}
                    <div className="pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleTestWebhook}
                        disabled={testingWebhook}
                        className="px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Zap className={`w-3.5 h-3.5 text-purple-600 ${testingWebhook ? 'animate-bounce' : ''}`} />
                        {testingWebhook ? 'Đang kiểm tra kết nối...' : 'Kiểm tra kết nối Webhook'}
                      </button>
                    </div>

                    {/* Webhook Test Result */}
                    {webhookTestResult && (
                      <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                        webhookTestResult.success 
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
                          : 'bg-rose-50 text-rose-900 border-rose-200'
                      }`}>
                        {webhookTestResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <strong className="block">{webhookTestResult.message}</strong>
                          {webhookTestResult.latencyMs && (
                            <span className="text-[11px] opacity-80">Thời gian phản hồi: {webhookTestResult.latencyMs} ms</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Google Apps Script Code Template Drawer */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#1F4E78]" />
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Mã Nguồn Google Apps Script Mẫu (Triển khai Google Drive trong 1 phút)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(GAS_WEBAPP_SAMPLE, setCopiedGasScript)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center gap-1 cursor-pointer"
              >
                {copiedGasScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedGasScript ? 'Đã sao chép!' : 'Sao chép Script'}
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Mở <strong>script.google.com</strong> -&gt; Tạo Dự án mới -&gt; Dán đoạn mã dưới đây -&gt; Bấm <strong>Deploy (Triển khai)</strong> -&gt; <strong>Web app</strong> (Truy cập: <em>Anyone</em>) -&gt; Copy URL dán vào ô Webhook ở trên.
            </p>

            <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-48 border border-slate-800">
              {GAS_WEBAPP_SAMPLE}
            </pre>
          </div>

          {/* Save Settings Button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={savingBackupConfig}
              className="px-6 py-3 rounded-xl bg-[#1F4E78] hover:bg-[#163a5c] text-white text-xs font-black shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {savingBackupConfig ? 'Đang lưu cài đặt...' : 'Lưu Cài đặt Lịch trình & Đám mây'}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CẤU HÌNH KẾT NỐI CSDL KHÁCH HÀNG (POSTGRESQL) */}
      {/* ========================================================================= */}
      {activeSubTab === 3 && (
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
                    onClick={() => setActiveSubTab(4)}
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
      {/* TAB 4: HƯỚNG DẪN SUPABASE (MIỄN PHÍ 2 PHÚT) */}
      {/* ========================================================================= */}
      {activeSubTab === 4 && (
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
                Quay lại <strong>tab 3. Cấu hình Kết nối CSDL Khách hàng</strong>:
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
                <p>Bấm vào tab <strong>SQL Editor</strong> trên Supabase -&gt; Bấm <strong>New Query</strong> -&gt; Dán toàn bộ mã DDL từ tab <strong>8. Mã SQL Khởi tạo bảng</strong> và bấm <strong>RUN</strong>.</p>
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
      {/* TAB 5: HƯỚNG DẪN NEON.TECH (1 PHÚT) */}
      {/* ========================================================================= */}
      {activeSubTab === 5 && (
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
                Dán vào mục <strong>Cấu hình Kết nối CSDL</strong> và bấm Lưu. Dữ liệu sẽ đồng bộ tức thì.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: MÁY CHỦ NAS XPENOLOGY (PRIVATE CLOUD) */}
      {/* ========================================================================= */}
      {activeSubTab === 6 && (
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
                Lấy địa chỉ IP mạng LAN (hoặc tên miền từ xa) của NAS dán vào tab <strong>3. Cấu hình Kết nối CSDL</strong>:
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
      {/* TAB 7: MÁY TÍNH WINDOWS PHÒNG BAN */}
      {/* ========================================================================= */}
      {activeSubTab === 7 && (
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
                <span className="text-[11px] font-bold text-slate-700 block">Chuỗi kết nối dán vào tab 3:</span>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-300 font-mono text-[11px] text-slate-800 break-all">
                  postgresql://postgres:matkhau_kpi_2026@192.168.1.50:5432/postgres
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: MÃ SQL KHỞI TẠO BẢNG (DDL) */}
      {/* ========================================================================= */}
      {activeSubTab === 8 && (
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

      {/* ========================================================================= */}
      {/* MODAL 1: XÁC NHẬN KHÔI PHỤC 1-CLICK (RESTORE CONFIRMATION) */}
      {/* ========================================================================= */}
      {restoreModalOpen && selectedBackupToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-0">
            {/* Header */}
            <div className="p-6 bg-rose-50/80 border-b border-rose-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/30 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Xác nhận Khôi phục Dữ liệu 1-Click</h3>
                  <p className="text-xs text-rose-700 font-semibold mt-0.5">Khôi phục toàn bộ hệ thống về thời điểm đã chọn</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRestoreModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                  <span>Thời điểm sao lưu:</span>
                  <strong className="text-slate-900 font-bold font-mono">
                    {formatDateDisplay(selectedBackupToRestore.createdAt)}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                  <span>File sao lưu:</span>
                  <span className="text-slate-700 font-mono">{selectedBackupToRestore.filename}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                  <span>Dung lượng:</span>
                  <span className="font-bold text-[#1F4E78]">{formatFileSize(selectedBackupToRestore.sizeBytes)}</span>
                </div>
              </div>

              {/* Data Summary */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-700 block">Dữ liệu sẽ được ghi đè & phục hồi:</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100 font-bold text-blue-900 flex justify-between">
                    <span>📋 Công việc:</span>
                    <span>{selectedBackupToRestore.recordCounts?.works || 0}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-100 font-bold text-purple-900 flex justify-between">
                    <span>👥 Nhân sự:</span>
                    <span>{selectedBackupToRestore.recordCounts?.users || 0}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100 font-bold text-amber-900 flex justify-between">
                    <span>🎯 Phân công:</span>
                    <span>{selectedBackupToRestore.recordCounts?.assignments || 0}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 font-bold text-emerald-900 flex justify-between">
                    <span>🏆 Kết quả KPI:</span>
                    <span>{selectedBackupToRestore.recordCounts?.kpiResults || 0}</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1 leading-relaxed">
                <strong className="block font-bold">Lưu ý an toàn:</strong>
                <p>
                  Toàn bộ 8 bảng cơ sở dữ liệu sẽ được khôi phục trong <strong>1 giao dịch (Transaction)</strong> duy nhất. Nếu xảy ra bất kỳ lỗi nào, hệ thống sẽ tự động <strong>Rollback</strong> để bảo đảm không bị mất dữ liệu.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRestoreModalOpen(false)}
                disabled={restoring}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={restoring}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${restoring ? 'animate-spin' : ''}`} />
                {restoring ? 'Đang khôi phục...' : 'Xác nhận Khôi phục Ngay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: TẢI FILE .JSON TỪ MÁY ĐỂ KHÔI PHỤC (UPLOAD & RESTORE) */}
      {/* ========================================================================= */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-0">
            {/* Header */}
            <div className="p-6 bg-purple-50/80 border-b border-purple-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-700 text-white flex items-center justify-center shadow-md shadow-purple-700/30 shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Khôi phục từ File .JSON Offline</h3>
                  <p className="text-xs text-purple-800 font-semibold mt-0.5">Chọn file sao lưu đã tải về trước đó trên máy tính của bạn</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs">
              {/* Dropzone / File Picker */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 rounded-2xl border-2 border-dashed border-purple-300 hover:border-purple-500 bg-purple-50/40 hover:bg-purple-50/70 transition cursor-pointer text-center space-y-2"
              >
                <Upload className="w-8 h-8 mx-auto text-purple-600" />
                <p className="font-bold text-slate-900">
                  {uploadFileName ? uploadFileName : 'Bấm vào đây để chọn file .json từ máy tính'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Hỗ trợ các file sao lưu định dạng <code className="font-mono text-purple-700">backup_*.json</code>
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".json,application/json"
                  className="hidden"
                />
              </div>

              {/* Error display */}
              {uploadError && (
                <div className="p-3 bg-rose-50 text-rose-900 border border-rose-200 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Payload Preview */}
              {uploadedJsonPayload && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>Phiên bản file:</span>
                    <strong className="font-mono text-slate-900">v{uploadedJsonPayload.version || '2.0'}</strong>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>Thời gian tạo:</span>
                    <strong className="font-mono text-slate-900">{formatDateDisplay(uploadedJsonPayload.createdAt)}</strong>
                  </div>

                  <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between font-bold">
                      <span>📋 Công việc:</span>
                      <span>{uploadedJsonPayload.data?.works?.length || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between font-bold">
                      <span>👥 Nhân sự:</span>
                      <span>{uploadedJsonPayload.data?.users?.length || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between font-bold">
                      <span>🎯 Phân công:</span>
                      <span>{uploadedJsonPayload.data?.assignments?.length || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between font-bold">
                      <span>⏰ Làm thêm:</span>
                      <span>{uploadedJsonPayload.data?.overtimes?.length || 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                disabled={restoring}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={restoring || !uploadedJsonPayload}
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${restoring ? 'animate-spin' : ''}`} />
                {restoring ? 'Đang khôi phục...' : 'Tiến hành Khôi phục'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
