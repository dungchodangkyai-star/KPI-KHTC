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
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders, setActiveSessionToken, clearActiveLoggedInUser } from '../utils';

interface DbConfig {
  mode: 'local' | 'external' | 'neon' | 'postgres' | 'local-json';
  storageMode?: 'postgres' | 'local-json';
  provider?: 'neon' | 'postgres' | 'local-json';
  configured?: boolean;
  connectionString?: string;
  host?: string;
  maskedHost?: string;
  port?: number;
  database?: string;
  maskedDatabase?: string;
  user?: string;
  maskedUser?: string;
  password?: string;
  ssl?: boolean;
  lastTested?: string;
  status?: 'connected' | 'error' | 'untested' | 'unconfigured';
  message?: string;
}

interface DbStats {
  mode: 'local' | 'external' | 'neon' | 'postgres' | 'local-json';
  storageMode?: 'postgres' | 'local-json';
  provider?: 'neon' | 'postgres' | 'local-json';
  status: 'connected' | 'error' | 'untested' | 'unconfigured';
  connected?: boolean;
  worksCount: number;
  usersCount: number;
  latencyMs: number;
  lastSuccessfulCheck?: string;
  dbName?: string;
  maskedHost?: string;
  error?: string;
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
  // All backup/restore endpoints require a cryptographically verified ADMIN session.
  // Send both the signed Bearer token and the partitioned session cookie so AI Studio iframe preview works reliably.
  const fetchBackupAdmin = (input: any, init: any = {}) => fetch(input, {
    ...init,
    credentials: 'include',
    headers: { ...getAuthHeaders(), ...(init.headers || {}) }
  });

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

  const navigate = useNavigate();
  const previewAbortControllerRef = useRef<AbortController | null>(null);
  const previewRequestIdRef = useRef<number>(0);

  // Data Cleanup & Purge State
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [cleanupScope, setCleanupScope] = useState<'period' | 'factory_reset'>('period');
  const [cleanupTargetMonth, setCleanupTargetMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [availableCleanupMonths, setAvailableCleanupMonths] = useState<string[]>([]);
  const [cleanupPreviewLoading, setCleanupPreviewLoading] = useState(false);
  const [cleanupPreviewCounts, setCleanupPreviewCounts] = useState<{
    works: number;
    assignments: number;
    overtimes: number;
    kpiResults: number;
    notifications: number;
    logs: number;
  } | null>(null);
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [cleanupAdminPassword, setCleanupAdminPassword] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupErrorStatus, setCleanupErrorStatus] = useState<number | null>(null);
  const [cleanupAuditModalOpen, setCleanupAuditModalOpen] = useState(false);
  const [cleanupAuditReport, setCleanupAuditReport] = useState<any | null>(null);

  // Neon Billing Reminder State (25th to month-end)
  const [billingReminder, setBillingReminder] = useState<{
    isBillingPeriod: boolean;
    dayOfMonth: number;
    daysRemainingInMonth: number;
    currentPeriod: string;
    acknowledged: boolean;
    acknowledgedAt: string | null;
    acknowledgedBy: string | null;
    billingUrl: string;
  } | null>(null);
  const [ackingBilling, setAckingBilling] = useState(false);

  // Data Migration Tool State (JSON to Neon PostgreSQL)
  const [migrationDryRunData, setMigrationDryRunData] = useState<any | null>(null);
  const [preflightToken, setPreflightToken] = useState<string | null>(null);
  const [preflightExpiresAt, setPreflightExpiresAt] = useState<number | null>(null);
  const [tokenRemainingSec, setTokenRemainingSec] = useState<number>(0);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [dryRunModalOpen, setDryRunModalOpen] = useState(false);
  const [dryRunAdminPassword, setDryRunAdminPassword] = useState('');
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [targetAdminStatus, setTargetAdminStatus] = useState<any | null>(null);
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [migrationAdminPassword, setMigrationAdminPassword] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  // Copy state helpers
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [copiedCompose, setCopiedCompose] = useState(false);
  const [copiedPowerShell, setCopiedPowerShell] = useState(false);
  const [copiedGasScript, setCopiedGasScript] = useState(false);

  // Countdown timer for preflight token (auto-clears on expiration)
  useEffect(() => {
    if (!preflightExpiresAt || !preflightToken) {
      setTokenRemainingSec(0);
      return;
    }

    const checkExpiration = () => {
      const remaining = Math.max(0, Math.floor((preflightExpiresAt - Date.now()) / 1000));
      setTokenRemainingSec(remaining);
      if (remaining <= 0) {
        setPreflightToken(null);
        setPreflightExpiresAt(null);
        setNotice({
          type: 'error',
          text: 'Mã xác thực Dry Run (Preflight Token) đã hết hạn (tối đa 10 phút). Vui lòng chạy lại bước 1. Đối soát dữ liệu (Dry Run).'
        });
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 1000);
    return () => clearInterval(interval);
  }, [preflightExpiresAt, preflightToken]);

  useEffect(() => {
    fetchConfigAndStats();
    fetchBackupData();
  }, []);

  const fetchConfigAndStats = async () => {
    setLoading(true);
    try {
      const [resCfg, resStats, resBilling, resTarget] = await Promise.all([
        fetch('/api/database/config'),
        fetch('/api/database/stats'),
        fetch('/api/database/neon-billing-reminder').catch(() => null),
        fetch('/api/database/target-admin-status').catch(() => null)
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
        if (jsonStats.data) {
          setStats(jsonStats.data);
        } else if (!jsonStats.success) {
          setStats(prev => ({
            ...prev,
            status: 'error',
            connected: false,
            error: jsonStats.error || 'Mất kết nối CSDL'
          }));
        }
      } catch (err) {
        console.error('Error parsing database stats:', err);
      }

      if (resBilling && resBilling.ok) {
        try {
          const jsonBilling = await resBilling.json();
          if (jsonBilling.success && jsonBilling.data) {
            setBillingReminder(jsonBilling.data);
          }
        } catch {}
      }

      if (resTarget && resTarget.ok) {
        try {
          const jsonTarget = await resTarget.json();
          if (jsonTarget.success && jsonTarget.data) {
            setTargetAdminStatus(jsonTarget.data);
          }
        } catch {}
      }
    } catch (err) {
      console.error('Error fetching database data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeBilling = async () => {
    if (!billingReminder) return;
    setAckingBilling(true);
    try {
      const res = await fetch('/api/database/neon-billing-reminder/ack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ period: billingReminder.currentPeriod })
      });
      const json = await res.json().catch(() => ({}));
      if (json.success && json.data) {
        setBillingReminder(json.data);
        setNotice({ type: 'success', text: json.message || 'Đã xác nhận kiểm tra hóa đơn Neon tháng này.' });
      } else {
        setNotice({ type: 'error', text: json.error || 'Không thể xác nhận kiểm tra hóa đơn.' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || String(err) });
    } finally {
      setAckingBilling(false);
    }
  };

  const handleOpenDryRunModal = () => {
    setDryRunError(null);
    setDryRunAdminPassword('');
    setDryRunModalOpen(true);
  };

  const handleConfirmDryRun = async () => {
    const pwd = dryRunAdminPassword.trim();
    if (!pwd) {
      setDryRunError('Vui lòng nhập mật khẩu Quản trị viên (ADMIN) để xác thực đối soát.');
      return;
    }
    setMigrationLoading(true);
    setDryRunError(null);
    setMigrationError(null);
    try {
      const res = await fetch('/api/database/migrate-from-json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          dryRun: true,
          adminPassword: pwd
        })
      });
      const json = await res.json().catch(() => ({}));
      // Wipe password from memory immediately
      setDryRunAdminPassword('');
      if (json.success) {
        setMigrationDryRunData(json);
        setPreflightToken(json.preflightToken || null);
        setPreflightExpiresAt(json.preflightExpiresAt || null);
        if (json.targetState) {
          setTargetAdminStatus(json.targetState);
        }
        setDryRunModalOpen(false);
        setNotice({ type: 'success', text: json.message || 'Đối soát dữ liệu hoàn tất thành công!' });
      } else {
        setDryRunError(json.error || json.message || 'Đối soát dữ liệu thất bại.');
        setNotice({ type: 'error', text: json.error || json.message || 'Đối soát dữ liệu thất bại.' });
      }
    } catch (err: any) {
      setDryRunAdminPassword('');
      setDryRunError(err?.message || String(err));
      setNotice({ type: 'error', text: err?.message || String(err) });
    } finally {
      setMigrationLoading(false);
    }
  };

  const handleExecuteMigration = async () => {
    const pwd = migrationAdminPassword.trim();
    if (!pwd) {
      setMigrationError('Vui lòng nhập mật khẩu Quản trị viên để xác thực.');
      return;
    }
    if (!preflightToken || tokenRemainingSec <= 0) {
      setMigrationError('Mã xác thực Dry Run (preflightToken) không tồn tại hoặc đã hết hạn (tối đa 10 phút). Vui lòng chạy lại bước 1. Đối soát dữ liệu (Dry Run) trước.');
      return;
    }
    if (targetAdminStatus?.state === 'RECOVERY_REQUIRED' || targetAdminStatus?.recoveryRequired) {
      setMigrationError('Cơ sở dữ liệu đích đang ở trạng thái RECOVERY_REQUIRED. Thao tác thực thi bị khóa an toàn theo nguyên tắc Fail-Closed.');
      return;
    }
    if (!migrationDryRunData?.readyToMigrate) {
      setMigrationError('Dữ liệu chưa đủ điều kiện di chuyển an toàn (CSDL đích chưa sẵn sàng, hoặc tồn tại xung đột/trùng lặp).');
      return;
    }

    setMigrating(true);
    setMigrationError(null);
    try {
      const res = await fetch('/api/database/migrate-from-json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          dryRun: false,
          adminPassword: pwd,
          preflightToken
        })
      });
      const json = await res.json().catch(() => ({}));
      // Wipe password from memory immediately
      setMigrationAdminPassword('');
      if (json.success) {
        setMigrationResult(json);
        setMigrationModalOpen(false);
        setPreflightToken(null);
        setPreflightExpiresAt(null);
        setTokenRemainingSec(0);
        setNotice({ type: 'success', text: json.message });
        await fetchConfigAndStats();
      } else {
        setMigrationError(json.error || 'Di chuyển dữ liệu vào Neon thất bại.');
      }
    } catch (err: any) {
      setMigrationAdminPassword('');
      setMigrationError(err?.message || String(err));
    } finally {
      setMigrating(false);
    }
  };

  const fetchBackupData = async () => {
    setLoadingBackups(true);
    try {
      const [resList, resConfig] = await Promise.all([
        fetchBackupAdmin('/api/backups/list'),
        fetchBackupAdmin('/api/backups/config')
      ]);

      const jsonList = await resList.json().catch(() => ({}));
      if (jsonList.success && Array.isArray(jsonList.data)) {
        setBackups(jsonList.data);
      }

      const jsonConfig = await resConfig.json().catch(() => ({}));
      if (jsonConfig.success && jsonConfig.data) {
        setBackupConfig(prev => ({
          ...prev,
          ...jsonConfig.data,
          offsite: {
            ...prev.offsite,
            ...(jsonConfig.data.offsite || {})
          }
        }));
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
      const res = await fetchBackupAdmin('/api/backups/run', { method: 'POST' });
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
      const res = await fetchBackupAdmin('/api/backups/prune', {
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
      const res = await fetchBackupAdmin(`/api/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
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
      const res = await fetchBackupAdmin(`/api/backups/sync-offsite/${encodeURIComponent(filename)}`, { method: 'POST' });
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
      const resrest = await fetchBackupAdmin('/api/backups/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationUrl: backupConfig.offsite.destinationUrl,
          provider: backupConfig.offsite.provider,
          authHeaderName: backupConfig.offsite.authHeaderName,
          authHeaderValue: backupConfig.offsite.authHeaderValue
        })
      });
      const json = await resrest.json().catch(() => ({}));
      setWebhookTestResult(json);
      if (json.success) {
        setNotice({ type: 'success', text: `${json.message} - Đang tự động lưu cấu hình...` });
        // Auto-save the config if connection is verified!
        try {
          const saveRes = await fetchBackupAdmin('/api/backups/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backupConfig)
          });
          const saveJson不易 = await saveRes.json().catch(() => ({}));
          if (saveJson不易.success) {
            setNotice({ type: 'success', text: `Kết nối thành công và đã tự động lưu cấu hình Webhook vào hệ thống!` });
            if (saveJson不易.data) {
              setBackupConfig(prev => ({
                ...prev,
                ...saveJson不易.data,
                offsite: {
                  ...prev.offsite,
                  ...(saveJson不易.data.offsite || {})
                }
              }));
            }
          }
        } catch {}
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
      const res = await fetchBackupAdmin('/api/backups/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupConfig)
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        setNotice({ type: 'success', text: 'Đã lưu cài đặt Lịch trình sao lưu & Đám mây Ngoại vi thành công!' });
        if (json.data) {
          setBackupConfig(prev => ({
            ...prev,
            ...json.data,
            offsite: {
              ...prev.offsite,
              ...(json.data.offsite || {})
            }
          }));
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
        ? { filename: selectedBackupToRestore.filename, mode: 'apply' } 
        : { backupPayload: uploadedJsonPayload, mode: 'apply' };

      const res = await fetchBackupAdmin('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const json = await res.json().catch(() => ({}));
      if (json.success && json.details?.applied === true && json.details?.restoredCounts) {
        setNotice({ type: 'success', text: json.message || 'Khôi phục toàn bộ hệ thống thành công!' });
        setRestoreModalOpen(false);
        setUploadModalOpen(false);
        setSelectedBackupToRestore(null);
        setUploadedJsonPayload(null);
        await Promise.all([fetchConfigAndStats(), fetchBackupData()]);
      } else if (json.success) {
        setNotice({ type: 'error', text: 'Máy chủ chỉ chạy kiểm tra thử (DRY-RUN), chưa ghi dữ liệu. Hộp thoại được giữ nguyên để tránh báo khôi phục thành công giả.' });
      } else {
        const stagePrefix = json.errorStage ? `[Giai đoạn: ${json.errorStage}${json.table ? ` - Bảng: ${json.table}` : ''}] ` : '';
        setNotice({ type: 'error', text: `${stagePrefix}${json.error || 'Khôi phục thất bại!'}` });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: `Lỗi kết nối khi khôi phục: ${err?.message || String(err)}` });
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

  // Fetch Cleanup Preview counts using unified backend filter with auth headers & race protection
  const fetchCleanupPreview = async (scope: 'period' | 'factory_reset', targetMonth?: string) => {
    if (scope === 'factory_reset') {
      setCleanupPreviewCounts(null);
      setCleanupPreviewLoading(false);
      setCleanupError(null);
      setCleanupErrorStatus(null);
      return;
    }

    // Cancel any previous in-flight preview request
    if (previewAbortControllerRef.current) {
      previewAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    previewAbortControllerRef.current = abortController;

    const currentReqId = ++previewRequestIdRef.current;
    const monthToFetch = (targetMonth || cleanupTargetMonth).trim();

    setCleanupPreviewLoading(true);
    setCleanupError(null);
    setCleanupErrorStatus(null);

    try {
      let authHeaders = getAuthHeaders();
      if (!authHeaders['Authorization']) {
        try {
          const sRes = await fetch('/api/auth/session', { credentials: 'include' });
          const sJson = await sRes.json().catch(() => ({}));
          const t = sJson?.token || sJson?.sessionToken;
          if (sRes.ok && sJson?.success && t) {
            setActiveSessionToken(t);
            authHeaders = getAuthHeaders();
          }
        } catch {}
      }

      const qScope = encodeURIComponent(scope);
      const qMonth = encodeURIComponent(monthToFetch);

      const res = await fetch(`/api/database/cleanup-preview?scope=${qScope}&targetMonth=${qMonth}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...authHeaders
        },
        signal: abortController.signal
      });

      // Ignore if user changed month or closed modal in the meantime
      if (currentReqId !== previewRequestIdRef.current) return;

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setCleanupErrorStatus(res.status);
        setCleanupError(json.error || json.message || `Lỗi máy chủ (${res.status})`);
        setCleanupPreviewCounts(null);
        return;
      }

      if (json.data && json.data.counts) {
        setCleanupPreviewCounts(json.data.counts);
        setCleanupError(null);
        setCleanupErrorStatus(null);
        if (json.data.availableMonths && Array.isArray(json.data.availableMonths)) {
          setAvailableCleanupMonths(json.data.availableMonths);
          if (!targetMonth && json.data.availableMonths.length > 0 && !json.data.availableMonths.includes(monthToFetch)) {
            setCleanupTargetMonth(json.data.availableMonths[0]);
          }
        }
      } else {
        setCleanupError(json.error || 'Dữ liệu xem trước không hợp lệ');
        setCleanupPreviewCounts(null);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      if (currentReqId === previewRequestIdRef.current) {
        setCleanupError(`Lỗi kết nối máy chủ: ${err?.message || String(err)}`);
        setCleanupPreviewCounts(null);
      }
    } finally {
      if (currentReqId === previewRequestIdRef.current) {
        setCleanupPreviewLoading(false);
      }
    }
  };

  const handleOpenCleanupModal = (scope: 'period' | 'factory_reset' = 'period') => {
    if (previewAbortControllerRef.current) {
      previewAbortControllerRef.current.abort();
    }
    setCleanupScope(scope);
    setCleanupConfirmText('');
    setCleanupAdminPassword('');
    setCleanupError(null);
    setCleanupErrorStatus(null);
    setCleanupPreviewCounts(null);
    setCleanupModalOpen(true);

    if (scope === 'period') {
      fetchCleanupPreview('period', cleanupTargetMonth);
    } else {
      setCleanupPreviewLoading(false);
    }
  };

  const handleCloseCleanupModal = () => {
    if (cleaning) return;
    if (previewAbortControllerRef.current) {
      previewAbortControllerRef.current.abort();
    }
    setCleanupModalOpen(false);
    setCleanupConfirmText('');
    setCleanupAdminPassword('');
    setCleanupError(null);
    setCleanupErrorStatus(null);
    setCleanupPreviewCounts(null);
    setCleanupPreviewLoading(false);
  };

  const handleExecuteCleanup = async () => {
    if (cleanupConfirmText !== 'XOA DU LIEU') {
      setCleanupError('Vui lòng nhập chính xác cụm từ: XOA DU LIEU');
      return;
    }
    if (!cleanupAdminPassword.trim()) {
      setCleanupError('Vui lòng nhập mật khẩu tài khoản Quản trị viên để xác thực.');
      return;
    }
    if (cleanupScope === 'period' && !cleanupPreviewCounts) {
      setCleanupError('Thiếu dữ liệu đối soát số lượng bản ghi. Vui lòng tải lại số liệu xem trước.');
      return;
    }

    setCleaning(true);
    setCleanupError(null);
    setCleanupErrorStatus(null);

    try {
      const payload: any = {
        scope: cleanupScope,
        adminPassword: cleanupAdminPassword.trim(),
        confirmText: cleanupConfirmText.trim()
      };
      if (cleanupScope === 'period') {
        payload.targetMonth = cleanupTargetMonth;
        payload.expectedCounts = cleanupPreviewCounts;
      }

      let authHeaders = getAuthHeaders();
      if (!authHeaders['Authorization']) {
        try {
          const sRes = await fetch('/api/auth/session', { credentials: 'include' });
          const sJson = await sRes.json().catch(() => ({}));
          const t = sJson?.token || sJson?.sessionToken;
          if (sRes.ok && sJson?.success && t) {
            setActiveSessionToken(t);
            authHeaders = getAuthHeaders();
          }
        } catch {}
      }

      const res = await fetch('/api/database/clean', {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.auditReport) {
        handleCloseCleanupModal();
        setCleanupAuditReport(json.auditReport);
        setCleanupAuditModalOpen(true);
        setNotice({ type: 'success', text: json.message || 'Dọn dẹp dữ liệu thành công!' });
        await Promise.all([fetchConfigAndStats(), fetchBackupData()]);
      } else {
        setCleanupErrorStatus(res.status);
        setCleanupError(json.error || json.message || 'Dọn dẹp thất bại.');
        // If data changed during wait, refresh preview automatically (period mode only)
        if (json.error && json.error.includes('thay đổi trong khi chờ') && cleanupScope === 'period') {
          await fetchCleanupPreview('period', cleanupTargetMonth);
        }
      }
    } catch (err: any) {
      setCleanupError(`Lỗi kết nối khi dọn dẹp: ${err?.message || String(err)}`);
    } finally {
      setCleaning(false);
    }
  };

  const downloadAuditReportJson = (report: any) => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bien_ban_kiem_toan_don_dep_${report.auditId || Date.now()}.json`;
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
// LƯU Ý QUAN TRỌNG: Hãy XÓA TOÀN BỘ code có sẵn (kể cả function myFunction() {...}) trước khi dán đoạn code này!

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "Google Apps Script Webhook PMO1 Backup đang hoạt động sẵn sàng!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Không nhận được nội dung postData từ yêu cầu."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var filename = data.filename || ("backup_" + new Date().getTime() + ".json");
    var base64Content = data.contentBase64;

    if (!base64Content) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Thiếu dữ liệu contentBase64."
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Tìm hoặc tạo thư mục trên Google Drive của bạn
    var folderName = "PMO1_KPI_Backups";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    // Giải mã Base64 và tạo file JSON
    var decodedBlob = Utilities.newBlob(Utilities.base64Decode(base64Content), "application/json", filename);
    var createdFile = folder.createFile(decodedBlob);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: createdFile.getId(),
      fileUrl: createdFile.getUrl(),
      fileName: createdFile.getName(),
      fileSize: createdFile.getSize(),
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
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
            stats.status === 'connected' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
          }`}>
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Trạng thái CSDL</span>
            <span className="text-sm font-black text-slate-900 flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${stats.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-ping'}`}></span>
              {stats.storageMode === 'postgres' 
                ? (stats.status === 'connected' ? 'Neon PostgreSQL (Bền vững)' : 'Neon PostgreSQL (Lỗi kết nối)')
                : 'Local JSON (Chỉ phát triển)'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
              {stats.status === 'connected' ? `Độ trễ: ${stats.latencyMs}ms` : (stats.error ? 'Lỗi kết nối CSDL' : 'Cần cấu hình DATABASE_URL')}
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

      {/* DISCONNECTION ALERT BANNER (FAIL-CLOSED IN POSTGRES MODE) */}
      {stats.storageMode === 'postgres' && stats.status !== 'connected' && (
        <div className="p-5 rounded-2xl bg-rose-50 border-2 border-rose-300 ring-4 ring-rose-500/10 shadow-sm space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-rose-950 uppercase tracking-tight flex items-center gap-2">
                  <span>Cơ sở Dữ liệu Neon PostgreSQL chưa kết nối - Chế độ Fail-Closed kích hoạt</span>
                  <span className="px-2 py-0.5 rounded-md bg-rose-200 text-rose-900 text-[10px] font-extrabold normal-case">
                    Khóa ghi bảo vệ dữ liệu
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={fetchConfigAndStats}
                  disabled={loading}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Kiểm tra lại kết nối ngay
                </button>
              </div>
              <p className="text-xs text-rose-900 leading-relaxed">
                Ứng dụng đang cấu hình chế độ bền vững <strong>PostgreSQL Production (Fail-Closed)</strong>. Do biến môi trường <code>DATABASE_URL</code> chưa được thiết lập trong Secrets hoặc kết nối Neon gián đoạn, mọi thao tác ghi dữ liệu tạm thời bị khóa nhằm ngăn chặn tình trạng phân mảnh và sai lệch giữa hai nguồn dữ liệu (tuyệt đối không tự động fallback sang JSON cục bộ).
              </p>
              <div className="pt-2 text-xs text-rose-950/90 font-medium bg-rose-100/60 p-3 rounded-xl border border-rose-200 space-y-1">
                <span className="font-bold text-rose-950 block">Các bước xử lý nhanh cho Quản trị viên:</span>
                <ol className="list-decimal pl-5 space-y-0.5 text-[11px]">
                  <li>Truy cập <a href="https://console.neon.tech" target="_blank" rel="noreferrer" className="underline font-bold text-rose-950">console.neon.tech</a> &gt; Mở Project &gt; Sao chép <strong>Connection string</strong> (chế độ Pooled hoặc Direct).</li>
                  <li>Mở bảng điều khiển <strong>Secrets / Biến môi trường</strong> của AI Studio &gt; Thêm biến có tên <code>DATABASE_URL</code> với giá trị là chuỗi kết nối vừa sao chép.</li>
                  <li>Bấm nút <strong>Kiểm tra lại kết nối ngay</strong> ở trên để hệ thống tự động nhận diện và mở khóa toàn bộ thao tác.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEON BILLING REMINDER BANNER (25th to Month-End) */}
      {billingReminder?.isBillingPeriod && (
        <div className={`p-4 rounded-2xl border transition-all ${
          billingReminder.acknowledged 
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' 
            : 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20 text-amber-950 shadow-xs'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                billingReminder.acknowledged ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {billingReminder.acknowledged ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-black uppercase tracking-tight flex items-center gap-2">
                  <span>Nhắc nhở Kỳ thanh toán Neon.tech (Ngày 25 đến cuối tháng)</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    billingReminder.acknowledged ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                  }`}>
                    Tháng {billingReminder.currentPeriod} - Còn {billingReminder.daysRemainingInMonth} ngày
                  </span>
                </h4>
                <p className="text-xs leading-relaxed opacity-90">
                  {billingReminder.acknowledged 
                    ? `Đã xác nhận kiểm tra hóa đơn Neon tháng ${billingReminder.currentPeriod} (${billingReminder.acknowledgedBy}). CSDL hoạt động ổn định.`
                    : 'Vui lòng kiểm tra trạng thái thẻ thanh toán và số dư tài khoản Neon.tech để tránh tình trạng CSDL bị tạm dừng hoặc gián đoạn dịch vụ cuối tháng.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <a
                href={billingReminder.billingUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
              >
                <span>Mở Neon Billing</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>

              {!billingReminder.acknowledged && (
                <button
                  type="button"
                  onClick={handleAcknowledgeBilling}
                  disabled={ackingBilling}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {ackingBilling ? 'Đang lưu...' : 'Đã kiểm tra tháng này'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

              {/* Data Cleanup Trigger */}
              <button
                type="button"
                onClick={() => handleOpenCleanupModal('period')}
                className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black transition flex items-center gap-2 cursor-pointer shadow-2xs"
                title="Dọn dẹp & Làm sạch Dữ liệu (Kỳ KPI hoặc Toàn bộ nghiệp vụ)"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                Dọn dẹp & Làm sạch Dữ liệu
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

          {/* ========================================================================= */}
          {/* SECTION: TRUNG TÂM DỌN DẸP & LÀM SẠCH DỮ LIỆU (DATA CLEANUP & PURGE) */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-2xl border border-rose-200/90 shadow-xs overflow-hidden">
            {/* Header banner */}
            <div className="p-5 bg-gradient-to-r from-rose-50/80 via-white to-amber-50/50 border-b border-rose-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/20 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900 tracking-tight">
                      Trung tâm Dọn dẹp & Làm sạch Dữ liệu Nghiệp vụ
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-black uppercase">
                      Bảo đảm 100% An toàn
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hỗ trợ 2 chế độ an toàn: Dọn dẹp theo một kỳ KPI xác định hoặc Làm sạch toàn bộ dữ liệu nghiệp vụ tích lũy.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-600 font-bold bg-white/80 px-3 py-1.5 rounded-xl border border-rose-200 self-start sm:self-auto">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Bảo tồn 100% Nhân sự & Danh mục</span>
              </div>
            </div>

            {/* 2 Safety Mode Cards */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/40">
              {/* Card 1: Xóa theo Kỳ KPI được chọn */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-blue-300 transition space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                      <Calendar className="w-3.5 h-3.5" />
                      Chế độ 1: Theo Kỳ KPI
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">Độc lập kỳ đánh giá</span>
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-slate-900">Xóa dữ liệu nghiệp vụ của một Kỳ KPI</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Làm sạch các bản ghi công việc, phân công liên quan, phiếu làm thêm giờ và kết quả KPI của một tháng chỉ định. Kỳ này sẽ quay về trạng thái <strong>"Chưa có kết quả đánh giá"</strong>. Các kỳ khác giữ nguyên 100%.
                    </p>
                  </div>

                  <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-xs space-y-2">
                    <label className="text-[11px] font-black text-slate-700 block uppercase tracking-wider">
                      Chọn Kỳ KPI cần làm sạch:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="month"
                        value={cleanupTargetMonth}
                        onChange={(e) => setCleanupTargetMonth(e.target.value)}
                        className="px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 w-full"
                      />
                    </div>
                    {availableCleanupMonths.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <span className="text-[10px] text-slate-400">Gợi ý các kỳ có dữ liệu:</span>
                        {availableCleanupMonths.slice(0, 4).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setCleanupTargetMonth(m)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                              cleanupTargetMonth === m 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-slate-200/70 hover:bg-slate-300 text-slate-700'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenCleanupModal('period')}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  Xem trước & Xác nhận Dọn dẹp Kỳ {cleanupTargetMonth}
                </button>
              </div>

              {/* Card 2: Làm sạch toàn bộ dữ liệu nghiệp vụ (Factory Clean) */}
              <div className="bg-white p-5 rounded-2xl border border-rose-200/80 shadow-2xs hover:border-rose-300 transition space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
                      <Sparkles className="w-3.5 h-3.5" />
                      Chế độ 2: Làm sạch Toàn diện
                    </span>
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Safe Mode
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-slate-900">Làm sạch Toàn bộ Dữ liệu Nghiệp vụ</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Xóa trắng toàn bộ dữ liệu vận hành tích lũy: công việc, phân công, làm thêm giờ, kết quả KPI, thông báo và nhật ký cũ để bắt đầu kỳ vận hành mới sạch sẽ.
                    </p>
                  </div>

                  <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs space-y-1.5 text-emerald-950">
                    <strong className="block font-bold flex items-center gap-1 text-[11px] text-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Cam kết bảo toàn nguyên vẹn 100%:
                    </strong>
                    <ul className="text-[11px] text-slate-600 space-y-1 pl-4 list-disc">
                      <li>Toàn bộ danh sách <strong>Tài khoản Nhân sự & Quản trị viên</strong> (Users).</li>
                      <li>Toàn bộ <strong>Danh mục nghiệp vụ & Cấu hình tổ chức</strong> (Categories, Cấu hình cơ quan, Phân bổ điểm KPI, Cấu hình sao lưu).</li>
                    </ul>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenCleanupModal('factory_reset')}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Xác nhận Làm sạch Toàn bộ (Factory Clean)
                </button>
              </div>
            </div>

            {/* Safety Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200/80 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Tự động Snapshot có mã băm SHA-256
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Lock className="w-4 h-4 text-amber-600" />
                  Khóa ghi độc quyền (Persistent Lock)
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <RefreshCw className="w-4 h-4 text-emerald-600" />
                  Đổi tên file nguyên tử (Atomic Inode Replace)
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Chuẩn an toàn dữ liệu PMO1
              </span>
            </div>
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
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(backupConfig.offsite?.enabled)}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setBackupConfig(prev => ({ 
                          ...prev, 
                          offsite: { 
                            ...(prev.offsite || {}), 
                            enabled: isChecked 
                          } 
                        }));
                      }}
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
                        <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded-md">Hỗ trợ Google Apps Script /exec URL</span>
                      </label>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="url"
                          value={backupConfig.offsite.destinationUrl || ''}
                          onChange={(e) => setBackupConfig(prev => ({
                            ...prev,
                            offsite: { ...prev.offsite, destinationUrl: e.target.value }
                          }))}
                          placeholder="https://script.google.com/macros/s/AKfycby.../exec"
                          className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs text-slate-900 bg-white focus:outline-none focus:border-purple-600 shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveBackupConfig()}
                          disabled={savingBackupConfig}
                          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingBackupConfig ? 'Đang lưu...' : 'Lưu Link này'}
                        </button>
                      </div>
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
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleTestWebhook}
                        disabled={testingWebhook}
                        className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Zap className={`w-3.5 h-3.5 text-yellow-300 ${testingWebhook ? 'animate-bounce' : ''}`} />
                        {testingWebhook ? 'Đang gửi test & kiểm tra phản hồi...' : 'Kiểm tra Kết nối & Tự động lưu Webhook'}
                      </button>
                    </div>

                    {/* Webhook Test Result */}
                    {webhookTestResult && (
                      <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 shadow-2xs ${
                        webhookTestResult.success 
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
                          : 'bg-rose-50 text-rose-900 border-rose-300'
                      }`}>
                        {webhookTestResult.success ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1.5 flex-1">
                          <strong className="block text-sm">{webhookTestResult.message}</strong>
                          {webhookTestResult.latencyMs && (
                            <div className="text-[11px] text-slate-600">Thời gian phản hồi Google: <strong>{webhookTestResult.latencyMs} ms</strong></div>
                          )}
                          {!webhookTestResult.success && (
                            <div className="mt-2 p-2.5 bg-white/80 rounded-lg border border-rose-200 text-rose-800 text-[11px] space-y-1">
                              <p className="font-bold">👉 Hướng dẫn khắc phục nhanh:</p>
                              <p>1. Mở <strong>script.google.com</strong>, kiểm tra xem bạn có để code bên trong <code>function myFunction() &#123;...&#125;</code> không. Nếu có, hãy <strong>xóa toàn bộ</strong> và dán lại mã mẫu bên dưới.</p>
                              <p>2. Chọn <strong>Triển khai (Deploy)</strong> &gt; <strong>Triển khai mới (New deployment)</strong> &gt; Loại: <strong>Ứng dụng web (Web app)</strong>.</p>
                              <p>3. Mục <strong>Ai có quyền truy cập (Who has access)</strong>: Bắt buộc chọn <strong>Bất kỳ ai (Anyone)</strong>.</p>
                            </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-[#1F4E78]" />
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Mã Nguồn Google Apps Script Mẫu (Tự động lưu Google Drive)
                  </h4>
                  <span className="text-[11px] text-slate-500">Dán vào script.google.com để tự động tạo thư mục PMO1_KPI_Backups trên Drive của bạn</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(GAS_WEBAPP_SAMPLE, setCopiedGasScript)}
                className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                {copiedGasScript ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copiedGasScript ? 'Đã sao chép vào bộ nhớ tạm!' : 'Sao chép toàn bộ Mã Script'}
              </button>
            </div>

            {/* 3 Step Quick Guide Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                <span className="font-bold text-amber-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">1</span>
                  Xóa sạch mã cũ
                </span>
                <p className="text-amber-800 text-[11px]">
                  Tại trang <code>script.google.com</code>, <strong>xóa sạch 100%</strong> code mặc định (kể cả <code>myFunction</code>), sau đó dán đoạn mã bên dưới.
                </p>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
                  Quyền truy cập "Anyone"
                </span>
                <p className="text-blue-800 text-[11px]">
                  Bấm <strong>Triển khai (Deploy)</strong> &gt; <strong>Triển khai mới (New deployment)</strong> &gt; Ai có quyền truy cập: Chọn <strong>Bất kỳ ai (Anyone)</strong>.
                </p>
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">3</span>
                  Copy URL /exec dán vào ô
                </span>
                <p className="text-emerald-800 text-[11px]">
                  Copy địa chỉ URL có đuôi <code>.../exec</code> dán vào ô Webhook ở trên rồi bấm <strong>Kiểm tra &amp; Lưu</strong>.
                </p>
              </div>
            </div>

            <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-56 border border-slate-800 shadow-inner select-all">
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
      {/* TAB 3: CẤU HÌNH KẾT NỐI CSDL & CHUYỂN ĐỔI DỮ LIỆU SANG NEON POSTGRESQL */}
      {/* ========================================================================= */}
      {activeSubTab === 3 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Live Status & Secrets Guide & Migration Tool */}
            <div className="lg:col-span-8 space-y-6">
              {/* Card 1: Live Status */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <Database className="w-4 h-4 text-[#1F4E78]" />
                      Trạng thái Lưu trữ CSDL Hệ thống
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Giám sát kết nối bền vững và cơ chế bảo vệ toàn vẹn dữ liệu Fail-Closed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchConfigAndStats}
                    disabled={loading}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Kiểm tra lại kết nối
                  </button>
                </div>

                {/* Status Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Chế độ Lưu trữ (Storage Mode)</span>
                    <span className="text-xs font-black text-slate-900 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stats.storageMode === 'postgres' ? 'bg-blue-600' : 'bg-amber-500'}`}></span>
                      {stats.storageMode === 'postgres' ? 'Neon PostgreSQL (Production Bền vững)' : 'Local JSON (Chỉ phát triển)'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Trạng thái Kết nối Thực tế</span>
                    <span className="text-xs font-black flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stats.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-ping'}`}></span>
                      {stats.status === 'connected' ? (
                        <span className="text-emerald-700">Đã kết nối thành công ({stats.latencyMs} ms)</span>
                      ) : (
                        <span className="text-rose-700">Mất kết nối hoặc thiếu cấu hình</span>
                      )}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Máy chủ CSDL (Host đã che kín)</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {stats.maskedHost || config.maskedHost || (stats.storageMode === 'postgres' ? 'Chưa cấu hình DATABASE_URL' : 'localhost (json)')}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Kiểm tra Thành công Gần nhất</span>
                    <span className="text-xs font-bold text-slate-800">
                      {stats.lastSuccessfulCheck ? formatDateDisplay(stats.lastSuccessfulCheck) : 'Chưa có thông tin'}
                    </span>
                  </div>
                </div>

                {/* Fail-Closed Notice */}
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 space-y-1">
                  <div className="font-black flex items-center gap-1.5 text-blue-950">
                    <ShieldCheck className="w-4 h-4 text-blue-700" />
                    Cơ chế Fail-Closed: Bảo đảm dữ liệu không bị thất lạc
                  </div>
                  <p className="text-[11px] text-blue-900/90 leading-relaxed">
                    Ở chế độ Production, hệ thống sử dụng Neon PostgreSQL làm nguồn lưu trữ duy nhất. Nếu kết nối CSDL gián đoạn, thao tác ghi sẽ được khóa bảo vệ an toàn thay vì tự ý ghi vào file JSON tạm, đảm bảo không xảy ra hiện tượng phân mảnh hay mất dữ liệu khi container khởi động lại.
                  </p>
                </div>
              </div>

              {/* Card 2: Data Migration Tool (Requirement 5) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <FolderSync className="w-4 h-4 text-purple-600" />
                        Công cụ Di chuyển Dữ liệu từ Local JSON sang Neon PostgreSQL
                      </h3>
                      {/* 3 Explicit Status Badges */}
                      {targetAdminStatus?.state === 'READY_WITH_ADMIN' && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider border border-emerald-200">
                          READY_WITH_ADMIN
                        </span>
                      )}
                      {targetAdminStatus?.state === 'EMPTY_BOOTSTRAP' && (
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider border border-blue-200">
                          EMPTY_BOOTSTRAP
                        </span>
                      )}
                      {(targetAdminStatus?.state === 'RECOVERY_REQUIRED' || targetAdminStatus?.recoveryRequired) && (
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-wider border border-rose-200 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          RECOVERY_REQUIRED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Chuyển dữ liệu nghiệp vụ từ file JSON sang Neon trong một Transaction an toàn tuyệt đối, có đối soát trước khi ghi.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black uppercase self-start sm:self-auto">
                    An toàn • Có sao lưu tự động
                  </span>
                </div>

                {/* State Explanatory Banner */}
                {targetAdminStatus?.state === 'READY_WITH_ADMIN' && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Cơ sở dữ liệu Neon đã có Quản trị viên (ADMIN) hợp lệ:</strong>
                      <span className="text-[11px] text-emerald-900/90 leading-relaxed">
                        Chế độ bootstrap đã tự động khóa vĩnh viễn theo nguyên tắc dữ liệu thực. Mọi thao tác quản trị cơ sở dữ liệu hiện yêu cầu phiên đăng nhập Quản trị viên trực tiếp từ Neon.
                      </span>
                    </div>
                  </div>
                )}

                {targetAdminStatus?.state === 'EMPTY_BOOTSTRAP' && (
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Cơ sở dữ liệu Neon hoàn toàn trống (Sẵn sàng Bootstrap):</strong>
                      <span className="text-[11px] text-blue-900/90 leading-relaxed">
                        CSDL Neon chưa có bản ghi nào (0 records). Bạn có thể chạy "1. Đối soát dữ liệu (Dry Run)" bằng mật khẩu Quản trị viên JSON để chuẩn bị nạp dữ liệu lần đầu.
                      </span>
                    </div>
                  </div>
                )}

                {/* RECOVERY_REQUIRED RED WARNING ALERT */}
                {(targetAdminStatus?.state === 'RECOVERY_REQUIRED' || targetAdminStatus?.recoveryRequired) && (
                  <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 ring-2 ring-rose-400/20 text-xs text-rose-950 space-y-2">
                    <div className="flex items-center gap-2 text-rose-900 font-black uppercase tracking-tight">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span>Cảnh báo: Phát hiện Dữ liệu Đích Chưa có Admin (RECOVERY_REQUIRED) - Khóa Ghi Fail-Closed</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-rose-900">
                      Cơ sở dữ liệu Neon hiện tại đã chứa <strong>{targetAdminStatus?.totalRecordsAcrossTables || 1153} bản ghi</strong> (gồm {targetAdminStatus?.totalUsers || 19} người dùng, {targetAdminStatus?.targetTableCounts?.['works'] || 1125} công việc cũ) nhưng không có tài khoản Quản trị viên (ADMIN) hợp lệ hoặc cấu trúc bảng không đồng nhất.
                    </p>
                    <p className="text-[11px] leading-relaxed text-rose-900 font-semibold">
                      Theo nguyên tắc Fail-Closed an toàn, thao tác <strong>Thực thi Di chuyển đã bị khóa</strong> để ngăn chặn nguy cơ ghi đè hoặc nhân đôi công việc cũ. Bạn chỉ có thể chạy <strong>"1. Đối soát dữ liệu (Dry Run)"</strong> ở chế độ chỉ đọc để chẩn đoán.
                    </p>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
                  <span className="font-bold text-slate-900 block">Quy trình Bảo vệ 5 Lớp khi Di chuyển:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-2 text-slate-600">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>1. Đối soát thử nghiệm (Dry-Run) sinh Preflight Token dùng 1 lần (10 phút)</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>2. Tự động sao lưu Snapshot file JSON trước khi ghi</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>3. Chạy trong 1 Transaction có hậu kiểm nội dung (Rollback nếu sai 1 điểm KPI)</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>4. Bảo toàn giá trị 0 hợp lệ (0 != null) cho toàn bộ điểm KPI và giờ OT</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600 col-span-1 sm:col-span-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>5. Tuyệt đối giữ nguyên file JSON nguồn, không tự động xóa bất kỳ dữ liệu nào</span>
                    </div>
                  </div>
                </div>

                {/* Dry Run Table Comparison */}
                {migrationDryRunData && (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                        <span>Kết quả Đối soát Dữ liệu (Dry Run)</span>
                        {migrationDryRunData.summary?.conflictsDetected > 0 || migrationDryRunData.summary?.targetOnlyRecords > 0 || targetAdminStatus?.state === 'RECOVERY_REQUIRED' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                            Phát hiện khác biệt đích ({migrationDryRunData.summary?.conflictsDetected || 0} xung đột, {migrationDryRunData.summary?.targetOnlyRecords || 0} chỉ có ở Neon)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                            Khớp cấu trúc & Sẵn sàng
                          </span>
                        )}
                      </h4>
                      <span className="text-[11px] text-slate-500 font-bold">
                        Tổng nguồn: {migrationDryRunData.summary?.totalSourceRecords} bản ghi | Hiện có Neon: {migrationDryRunData.summary?.totalTargetBefore} bản ghi
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="p-2.5">Phân hệ Dữ liệu</th>
                            <th className="p-2.5">Bảng CSDL</th>
                            <th className="p-2.5 text-right">Nguồn JSON</th>
                            <th className="p-2.5 text-right">Hiện có Neon</th>
                            <th className="p-2.5 text-right">Sẽ Thêm mới</th>
                            <th className="p-2.5 text-right">Sẽ Cập nhật</th>
                            <th className="p-2.5 text-right">Xung đột logic</th>
                            <th className="p-2.5 text-right">Chỉ có ở Đích</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {migrationDryRunData.tables?.map((tbl: any) => (
                            <tr key={tbl.tableName} className="hover:bg-slate-50/80">
                              <td className="p-2.5 font-bold text-slate-800">{tbl.label}</td>
                              <td className="p-2.5 font-mono text-slate-500">{tbl.tableName}</td>
                              <td className="p-2.5 text-right font-bold text-blue-700">{tbl.sourceCount}</td>
                              <td className="p-2.5 text-right font-semibold text-slate-700">{tbl.targetCountBefore}</td>
                              <td className="p-2.5 text-right font-bold text-emerald-700">+{tbl.toInsertCount}</td>
                              <td className="p-2.5 text-right font-bold text-amber-700">{tbl.toUpdateCount}</td>
                              <td className={`p-2.5 text-right font-bold ${tbl.conflictCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                {tbl.conflictCount > 0 ? `! ${tbl.conflictCount}` : '0'}
                              </td>
                              <td className={`p-2.5 text-right font-bold ${tbl.targetOnlyCount > 0 ? 'text-purple-700' : 'text-slate-400'}`}>
                                {tbl.targetOnlyCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Migration Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleOpenDryRunModal}
                    disabled={migrationLoading}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Activity className={`w-3.5 h-3.5 text-blue-600 ${migrationLoading ? 'animate-spin' : ''}`} />
                    {migrationLoading ? 'Đang đối soát...' : '1. Đối soát dữ liệu (Dry Run)'}
                  </button>

                  <div className="flex flex-col items-end gap-1">
                    {(() => {
                      const hasConflicts = (migrationDryRunData?.summary?.conflictsDetected ?? 0) > 0;
                      const hasLogicalDups = (migrationDryRunData?.summary?.logicalDuplicates ?? 0) > 0;
                      const hasSourceTechDups = (migrationDryRunData?.summary?.sourceTechDuplicates ?? 0) > 0;
                      const hasValidationErrors = (migrationDryRunData?.validationErrors?.length ?? 0) > 0;
                      const isTargetRecovery = targetAdminStatus?.state === 'RECOVERY_REQUIRED' || Boolean(targetAdminStatus?.recoveryRequired);
                      const isTokenActive = Boolean(preflightToken) && tokenRemainingSec > 0;
                      const isReady = Boolean(migrationDryRunData?.readyToMigrate) && !hasConflicts && !hasLogicalDups && !hasSourceTechDups && !hasValidationErrors;
                      const canExecute = !migrationLoading && stats.status === 'connected' && isTokenActive && !isTargetRecovery && isReady;

                      const formatTimer = (sec: number) => {
                        const m = Math.floor(sec / 60);
                        const s = sec % 60;
                        return `${m}:${s < 10 ? '0' : ''}${s}`;
                      };

                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setMigrationError(null);
                              setMigrationAdminPassword('');
                              setMigrationModalOpen(true);
                            }}
                            disabled={!canExecute}
                            className={`px-5 py-2.5 rounded-xl text-xs font-black shadow-sm transition flex items-center justify-center gap-2 ${
                              !canExecute
                                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                : 'bg-purple-700 hover:bg-purple-800 text-white cursor-pointer'
                            }`}
                            title={
                              isTargetRecovery
                                ? 'Nút bị khóa: CSDL Neon đang ở trạng thái RECOVERY_REQUIRED. Không được ghi đè lên dữ liệu cũ.'
                                : !isTokenActive
                                ? 'Yêu cầu chạy 1. Đối soát dữ liệu (Dry Run) để nhận token trước'
                                : !isReady
                                ? 'Dữ liệu chưa đủ điều kiện di chuyển (còn xung đột, trùng lặp hoặc thiếu trường bắt buộc)'
                                : 'Bấm để mở hộp thoại xác nhận di chuyển'
                            }
                          >
                            <FolderSync className="w-4 h-4" />
                            <span>2. Thực thi Di chuyển sang Neon</span>
                          </button>

                          {isTargetRecovery && (
                            <span className="text-[10px] text-rose-700 font-bold flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Đã khóa an toàn: CSDL đích đang có dữ liệu cũ cần phục hồi
                            </span>
                          )}
                          {!isTargetRecovery && !preflightToken && (
                            <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Cần chạy Dry Run để nhận mã Preflight Token trước
                            </span>
                          )}
                          {!isTargetRecovery && preflightToken && tokenRemainingSec <= 0 && (
                            <span className="text-[10px] text-rose-700 font-bold flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Mã Preflight Token đã hết hạn. Vui lòng chạy lại Dry Run.
                            </span>
                          )}
                          {!isTargetRecovery && isTokenActive && hasConflicts && (
                            <span className="text-[10px] text-rose-700 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Đã khóa: Phát hiện {migrationDryRunData.summary.conflictsDetected} xung đột logic dữ liệu đích
                            </span>
                          )}
                          {!isTargetRecovery && isTokenActive && !hasConflicts && hasLogicalDups && (
                            <span className="text-[10px] text-rose-700 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Đã khóa: Phát hiện {migrationDryRunData.summary.logicalDuplicates} bản ghi trùng lặp logic nguồn
                            </span>
                          )}
                          {!isTargetRecovery && isTokenActive && !hasConflicts && !hasLogicalDups && hasSourceTechDups && (
                            <span className="text-[10px] text-rose-700 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Đã khóa: Phát hiện {migrationDryRunData.summary.sourceTechDuplicates} bản ghi trùng khóa kỹ thuật nguồn
                            </span>
                          )}
                          {!isTargetRecovery && isTokenActive && !hasConflicts && !hasLogicalDups && !hasSourceTechDups && hasValidationErrors && (
                            <span className="text-[10px] text-rose-700 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Đã khóa: Dữ liệu nguồn thiếu trường bắt buộc ({migrationDryRunData.validationErrors.length} lỗi)
                            </span>
                          )}
                          {!isTargetRecovery && isTokenActive && isReady && (
                            <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Preflight Token hợp lệ (còn {formatTimer(tokenRemainingSec)})
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {stats.status !== 'connected' && (
                  <p className="text-[11px] text-rose-700 font-semibold text-right">
                    * Yêu cầu kết nối Neon PostgreSQL thành công trước khi thực thi di chuyển dữ liệu.
                  </p>
                )}
              </div>

              {/* Card 3: Live Connection Tester */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600" />
                    Kiểm tra Thử nghiệm Kết nối (Live Connection Tester)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Thử kết nối tới chuỗi URI của Neon trước khi lưu vào Secrets. Mật khẩu không bao giờ được ghi ra file cục bộ.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-800">
                    Chuỗi kết nối PostgreSQL (Connection URI):
                  </label>
                  <input
                    type="text"
                    value={config.connectionString || ''}
                    onChange={(e) => setConfig({ ...config, connectionString: e.target.value })}
                    placeholder="postgresql://neondb_owner:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1F4E78]"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Zap className={`w-3.5 h-3.5 text-amber-600 ${testing ? 'animate-bounce' : ''}`} />
                    {testing ? 'Đang kiểm tra...' : 'Thử kết nối'}
                  </button>
                </div>

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
            </div>

            {/* Right Column: Instructions on Secrets Setup */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-900 font-black text-xs pb-3 border-b border-slate-100">
                  <Lock className="w-4 h-4 text-[#1F4E78]" />
                  <div>
                    <h4 className="text-xs font-black">Thiết lập Bí mật (Secrets)</h4>
                    <p className="text-[10px] text-slate-500 font-normal">Chuẩn bảo mật Production không lưu mật khẩu</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs text-slate-600">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1F4E78] font-bold text-[11px] flex items-center justify-center shrink-0">1</span>
                    <div>
                      <strong className="text-slate-900 block font-bold">Lấy chuỗi kết nối từ Neon:</strong>
                      <span className="text-[11px] text-slate-500">
                        Đăng nhập console.neon.tech &gt; Chọn Project &gt; Dashboard &gt; Sao chép Connection string (Pooled).
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1F4E78] font-bold text-[11px] flex items-center justify-center shrink-0">2</span>
                    <div>
                      <strong className="text-slate-900 block font-bold">Đặt biến trong AI Studio Secrets:</strong>
                      <span className="text-[11px] text-slate-500">
                        Vào phần cấu hình Secrets/Environment &gt; Thêm biến có tên: <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-700 font-bold">DATABASE_URL</code> và dán chuỗi kết nối.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1F4E78] font-bold text-[11px] flex items-center justify-center shrink-0">3</span>
                    <div>
                      <strong className="text-slate-900 block font-bold">Tự động kết nối bền vững:</strong>
                      <span className="text-[11px] text-slate-500">
                        Máy chủ sẽ tự động nạp biến môi trường và chạy Drizzle ORM trực tiếp trên Neon mà không lưu mật khẩu ở mã nguồn.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab(5)}
                    className="w-full py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Xem Hướng dẫn Neon.tech (1 phút)
                  </button>

                  <button
                    type="button"
                    onClick={downloadDdlFile}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải File DDL Tạo Bảng (.sql)
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

      {/* ========================================================================= */}
      {/* MODAL 3: XÁC NHẬN DỌN DẸP DỮ LIỆU (CLEANUP CONFIRMATION) */}
      {/* ========================================================================= */}
      {cleanupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-0">
            {/* Header */}
            <div className="p-6 bg-rose-50/80 border-b border-rose-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/30 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Xác nhận Dọn dẹp & Làm sạch Dữ liệu</h3>
                  <p className="text-xs text-rose-700 font-semibold mt-0.5">
                    {cleanupScope === 'period' 
                      ? `Chế độ: Dọn dẹp Kỳ KPI ${cleanupTargetMonth}` 
                      : 'Chế độ: Làm sạch toàn bộ dữ liệu nghiệp vụ (Factory Clean)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseCleanupModal}
                disabled={cleaning}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* Scope & Mode explanation */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                  <span>Phạm vi dọn dẹp:</span>
                  <strong className="text-slate-900 font-bold">
                    {cleanupScope === 'period' ? `Kỳ KPI: ${cleanupTargetMonth}` : 'Toàn bộ dữ liệu nghiệp vụ'}
                  </strong>
                </div>
                {cleanupScope === 'period' && (
                  <div className="flex justify-between items-center text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                    <span className="font-medium">Đổi kỳ xem xét:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="month"
                        value={cleanupTargetMonth}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCleanupTargetMonth(val);
                          fetchCleanupPreview('period', val);
                        }}
                        disabled={cleaning}
                        className="px-2 py-1 bg-white rounded-lg border border-slate-300 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                  <span>Cơ chế bảo vệ:</span>
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Tự động tạo Snapshot + Checksum SHA-256
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                  <span>Cán bộ & Cấu hình:</span>
                  <span className="text-blue-700 font-bold">Bảo tồn 100% (Không đụng chạm)</span>
                </div>
              </div>

              {/* Prominent Error Notice with Direct Action Buttons */}
              {cleanupError && (
                <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl text-xs space-y-2.5 animate-in fade-in">
                  <div className="flex items-start gap-2.5 text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <p className="font-black text-rose-800">
                        {cleanupErrorStatus === 401 || cleanupErrorStatus === 403 || cleanupError.includes('phiên') || cleanupError.includes('Quản trị viên')
                          ? 'Yêu cầu phiên đăng nhập Quản trị viên (ADMIN)'
                          : 'Thông báo lỗi từ hệ thống'}
                      </p>
                      <p className="text-[11px] leading-relaxed text-rose-700">
                        {cleanupError}
                      </p>
                    </div>
                  </div>

                  {/* Actions inside error banner */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rose-200/80">
                    {cleanupScope === 'period' && (
                      <button
                        type="button"
                        onClick={() => fetchCleanupPreview('period', cleanupTargetMonth)}
                        disabled={cleanupPreviewLoading || cleaning}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        <RefreshCw className={`w-3 h-3 ${cleanupPreviewLoading ? 'animate-spin' : ''}`} />
                        Tải lại số liệu
                      </button>
                    )}

                    {(cleanupErrorStatus === 401 || cleanupErrorStatus === 403 || cleanupError.includes('phiên') || cleanupError.includes('Quản trị viên')) && (
                      <button
                        type="button"
                        onClick={() => {
                          clearActiveLoggedInUser();
                          handleCloseCleanupModal();
                          navigate('/login?redirect=/database');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Lock className="w-3 h-3 text-rose-600" />
                        Đăng nhập lại Quản trị viên
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Data Preview / Static Groups Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                    {cleanupScope === 'period' 
                      ? `Số lượng bản ghi sẽ được làm sạch (Kỳ ${cleanupTargetMonth}):` 
                      : 'Các nhóm dữ liệu nghiệp vụ sẽ được làm sạch:'}
                  </span>
                  {cleanupScope === 'period' && cleanupPreviewLoading && (
                    <span className="text-[10px] text-blue-600 flex items-center gap-1 font-bold">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Đang đối soát dữ liệu...
                    </span>
                  )}
                </div>

                {cleanupScope === 'period' ? (
                  cleanupPreviewCounts ? (
                    <div className="space-y-2">
                      {cleanupPreviewCounts.works === 0 && 
                       cleanupPreviewCounts.assignments === 0 && 
                       cleanupPreviewCounts.overtimes === 0 && 
                       cleanupPreviewCounts.kpiResults === 0 && (
                        <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-[11px] font-semibold flex items-center justify-between">
                          <span>Kỳ KPI {cleanupTargetMonth} hiện không có bản ghi nào để xóa (tất cả phân hệ đều bằng 0).</span>
                          <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-700 uppercase font-black">Trống</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100 font-bold text-blue-900 flex justify-between">
                          <span>📋 Công việc:</span>
                          <span>{cleanupPreviewCounts.works} việc</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100 font-bold text-amber-900 flex justify-between">
                          <span>🎯 Phân công liên quan:</span>
                          <span>{cleanupPreviewCounts.assignments} phiếu</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-100 font-bold text-purple-900 flex justify-between">
                          <span>⏰ Làm thêm giờ (OT):</span>
                          <span>{cleanupPreviewCounts.overtimes} phiếu</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100 font-bold text-emerald-900 flex justify-between">
                          <span>🏆 Kết quả KPI:</span>
                          <span>{cleanupPreviewCounts.kpiResults} bản ghi</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 bg-slate-100/80 rounded-xl text-center space-y-2 border border-slate-200">
                      {cleanupPreviewLoading ? (
                        <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                          <span className="text-xs font-bold text-slate-700">Đang đối soát & nạp số lượng bản ghi Kỳ {cleanupTargetMonth}...</span>
                        </div>
                      ) : cleanupError ? (
                        <div className="space-y-2 py-1">
                          <p className="text-xs font-bold text-rose-700">Không thể tải số liệu xem trước</p>
                          <p className="text-[11px] text-slate-500">Vui lòng xem thông báo lỗi phía trên và thử lại.</p>
                          <button
                            type="button"
                            onClick={() => fetchCleanupPreview('period', cleanupTargetMonth)}
                            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Thử tải lại
                          </button>
                        </div>
                      ) : (
                        <div className="text-slate-500 text-xs py-1">
                          Chưa có dữ liệu xem trước
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-100 font-bold text-rose-900 flex justify-between items-center">
                        <span>📋 Công việc (Works):</span>
                        <span className="text-[10px] uppercase font-black text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded">Toàn bộ</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100 font-bold text-amber-900 flex justify-between items-center">
                        <span>🎯 Phân công (Assignments):</span>
                        <span className="text-[10px] uppercase font-black text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded">Toàn bộ</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-100 font-bold text-purple-900 flex justify-between items-center">
                        <span>⏰ Làm thêm giờ (Overtimes):</span>
                        <span className="text-[10px] uppercase font-black text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded">Toàn bộ</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 font-bold text-emerald-900 flex justify-between items-center">
                        <span>🏆 Kết quả KPI (kpiResults):</span>
                        <span className="text-[10px] uppercase font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">Toàn bộ</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                        <span>🔔 Thông báo cũ (Notifications):</span>
                        <span className="text-[10px] uppercase font-black text-slate-600 bg-slate-200 px-2 py-0.5 rounded">Toàn bộ</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                        <span>📜 Nhật ký cũ (System Logs):</span>
                        <span className="text-[10px] uppercase font-black text-slate-600 bg-slate-200 px-2 py-0.5 rounded">Toàn bộ</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 italic">
                      * Hệ thống sẽ tự động tổng hợp số lượng bản ghi chính xác ngay khi thực hiện dưới khóa ghi và lập Biên bản kiểm toán chi tiết.
                    </p>
                  </div>
                )}
              </div>

              {/* Security info box */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <strong className="block font-bold">Quy trình nguyên tử an toàn tuyệt đối:</strong>
                <p className="leading-relaxed">
                  Hệ thống khóa ghi độc quyền, tạo bản sao lưu kiểm chứng SHA-256, thao tác trên bản sao tạm (Shadow Store) cùng thư mục và hoán đổi nguyên tử (Atomic Inode Rename). Không bao giờ có tình trạng dữ liệu bị mất một phần.
                </p>
              </div>

              {/* Password & Confirm inputs */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 text-[11px] block">
                    1. Mật khẩu tài khoản Quản trị viên (bắt buộc):
                  </label>
                  <input
                    type="password"
                    value={cleanupAdminPassword}
                    onChange={(e) => setCleanupAdminPassword(e.target.value)}
                    placeholder="Nhập mật khẩu tài khoản của bạn để xác thực"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                    disabled={cleaning}
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-800 text-[11px] block">
                    2. Nhập chính xác cụm từ <code className="text-rose-600 bg-rose-50 px-1 py-0.5 rounded font-mono font-bold">XOA DU LIEU</code> để mở khóa:
                  </label>
                  <input
                    type="text"
                    value={cleanupConfirmText}
                    onChange={(e) => setCleanupConfirmText(e.target.value)}
                    placeholder="Gõ XOA DU LIEU vào đây"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 uppercase"
                    disabled={cleaning}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseCleanupModal}
                disabled={cleaning}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExecuteCleanup}
                disabled={
                  cleaning ||
                  cleanupConfirmText !== 'XOA DU LIEU' ||
                  !cleanupAdminPassword.trim() ||
                  Boolean(cleanupError) ||
                  (cleanupScope === 'period' && (cleanupPreviewLoading || !cleanupPreviewCounts))
                }
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <Trash2 className={`w-3.5 h-3.5 ${cleaning ? 'animate-spin' : ''}`} />
                {cleaning ? 'Đang thực hiện dọn dẹp nguyên tử...' : 'Xác nhận & Bắt đầu Dọn dẹp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: BIÊN BẢN KIỂM TOÁN DỌN DẸP DỮ LIỆU (AUDIT REPORT CARD) */}
      {/* ========================================================================= */}
      {cleanupAuditModalOpen && cleanupAuditReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-0">
            {/* Header */}
            <div className="p-6 bg-emerald-50/80 border-b border-emerald-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Biên bản Kiểm toán Dọn dẹp Dữ liệu</h3>
                  <p className="text-xs text-emerald-800 font-semibold mt-0.5">
                    Hệ thống đã hoàn tất và xác minh tính toàn vẹn (Verified Integrity)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCleanupAuditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* Audit Meta Grid */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Mã phiên kiểm toán:</span>
                  <span className="font-mono font-bold text-slate-900">{cleanupAuditReport.auditId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Thời gian thực thi:</span>
                  <span className="font-bold text-slate-900">{formatDateDisplay(cleanupAuditReport.executedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Người thực thi:</span>
                  <span className="font-bold text-slate-900">
                    {cleanupAuditReport.operator.name} ({cleanupAuditReport.operator.email})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phạm vi thực hiện:</span>
                  <span className="font-bold text-[#1F4E78]">
                    {cleanupAuditReport.scope === 'period' ? `Kỳ KPI: ${cleanupAuditReport.targetMonth}` : 'Toàn bộ dữ liệu nghiệp vụ'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">File Snapshot cứu hộ:</span>
                  <span className="font-mono text-purple-700 font-bold">{cleanupAuditReport.backup.filename}</span>
                </div>
                <div className="pt-1.5 border-t border-slate-200 flex flex-col gap-0.5">
                  <span className="text-slate-500 text-[10px]">Mã băm SHA-256 Checksum:</span>
                  <code className="text-[10px] font-mono text-slate-700 bg-white p-1 rounded border border-slate-200 break-all select-all">
                    {cleanupAuditReport.backup.sha256}
                  </code>
                </div>
              </div>

              {/* Verification Table */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-800 text-[11px] block uppercase tracking-wider">
                  Bảng đối soát số lượng bản ghi (Trước / Đã xóa / Sau):
                </span>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2">Phân hệ dữ liệu</th>
                        <th className="p-2 text-center">Trước</th>
                        <th className="p-2 text-center text-rose-600">Đã xóa</th>
                        <th className="p-2 text-center text-emerald-700">Còn lại</th>
                        <th className="p-2 text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      <tr>
                        <td className="p-2 font-sans font-bold text-slate-800">📋 Công việc (Works)</td>
                        <td className="p-2 text-center">{cleanupAuditReport.beforeCounts.works}</td>
                        <td className="p-2 text-center text-rose-600 font-bold">-{cleanupAuditReport.deletedCounts.works}</td>
                        <td className="p-2 text-center text-emerald-700">{cleanupAuditReport.afterCounts.works}</td>
                        <td className="p-2 text-right text-emerald-600 font-bold font-sans">Đã làm sạch</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-sans font-bold text-slate-800">🎯 Phân công (Assignments)</td>
                        <td className="p-2 text-center">{cleanupAuditReport.beforeCounts.assignments}</td>
                        <td className="p-2 text-center text-rose-600 font-bold">-{cleanupAuditReport.deletedCounts.assignments}</td>
                        <td className="p-2 text-center text-emerald-700">{cleanupAuditReport.afterCounts.assignments}</td>
                        <td className="p-2 text-right text-emerald-600 font-bold font-sans">Đã làm sạch</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-sans font-bold text-slate-800">⏰ Làm thêm giờ (Overtimes)</td>
                        <td className="p-2 text-center">{cleanupAuditReport.beforeCounts.overtimes}</td>
                        <td className="p-2 text-center text-rose-600 font-bold">-{cleanupAuditReport.deletedCounts.overtimes}</td>
                        <td className="p-2 text-center text-emerald-700">{cleanupAuditReport.afterCounts.overtimes}</td>
                        <td className="p-2 text-right text-emerald-600 font-bold font-sans">Đã làm sạch</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-sans font-bold text-slate-800">🏆 Kết quả KPI (kpiResults)</td>
                        <td className="p-2 text-center">{cleanupAuditReport.beforeCounts.kpiResults}</td>
                        <td className="p-2 text-center text-rose-600 font-bold">-{cleanupAuditReport.deletedCounts.kpiResults}</td>
                        <td className="p-2 text-center text-emerald-700">{cleanupAuditReport.afterCounts.kpiResults}</td>
                        <td className="p-2 text-right text-emerald-600 font-bold font-sans">Đã làm sạch</td>
                      </tr>
                      <tr className="bg-emerald-50/50">
                        <td className="p-2 font-sans font-bold text-emerald-950">👥 Nhân sự (Users)</td>
                        <td className="p-2 text-center">{cleanupAuditReport.beforeCounts.users}</td>
                        <td className="p-2 text-center font-bold text-slate-400">0</td>
                        <td className="p-2 text-center text-emerald-700 font-bold">{cleanupAuditReport.afterCounts.users}</td>
                        <td className="p-2 text-right text-emerald-700 font-bold font-sans">Bảo toàn 100%</td>
                      </tr>
                      <tr className="bg-emerald-50/50">
                        <td className="p-2 font-sans font-bold text-emerald-950">⚙️ Danh mục & Cấu hình</td>
                        <td className="p-2 text-center">{cleanupAuditReport.beforeCounts.categories}</td>
                        <td className="p-2 text-center font-bold text-slate-400">0</td>
                        <td className="p-2 text-center text-emerald-700 font-bold">{cleanupAuditReport.afterCounts.categories}</td>
                        <td className="p-2 text-right text-emerald-700 font-bold font-sans">Bảo toàn 100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3 bg-blue-50 text-blue-900 rounded-xl border border-blue-200 text-[11px] leading-relaxed">
                Biên bản này đã được hệ thống ký kiểm toán điện tử. Bạn có thể tải file biên bản về máy tính để lưu trữ theo dõi quản trị.
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => downloadAuditReportJson(cleanupAuditReport)}
                className="px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1F4E78] border border-blue-200 text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                Tải Biên bản Kiểm toán (.JSON)
              </button>

              <button
                type="button"
                onClick={() => setCleanupAuditModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-black shadow-md transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRY RUN AUTHENTICATION MODAL */}
      {dryRunModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-0">
            {/* Header */}
            <div className="p-6 bg-blue-50/80 border-b border-blue-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30 shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Xác thực Đối soát Dữ liệu (Dry Run)</h3>
                  <p className="text-xs text-blue-900 font-semibold mt-0.5">
                    Thao tác 100% Chỉ đọc (Read-only) • Không ghi, không xóa dữ liệu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDryRunModalOpen(false);
                  setDryRunAdminPassword('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 space-y-1.5 text-[11px]">
                <span className="font-black flex items-center gap-1.5 text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  Cơ chế Xác thực An toàn Bootstrap / Quản trị viên:
                </span>
                <ul className="list-disc pl-4 space-y-1 text-slate-600 leading-relaxed">
                  <li>Xác thực trực tiếp với tài khoản Quản trị viên (ADMIN) hiện có trong dữ liệu nguồn.</li>
                  <li>Dry Run hoàn toàn <strong>Chỉ đọc (Read-only)</strong>, đối soát số lượng từng bảng mà không thay đổi bất kỳ bản ghi nào.</li>
                  <li>Có cơ chế bảo vệ chống vét cạn (Rate limiting tối đa 5 lần thử trong 15 phút).</li>
                </ul>
              </div>

              {dryRunError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{dryRunError}</span>
                </div>
              )}

              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-900 flex items-center justify-between">
                  <span>Nhập Mật khẩu Quản trị viên (ADMIN):</span>
                  <span className="text-rose-600 font-bold">* Bắt buộc</span>
                </label>
                <input
                  type="password"
                  value={dryRunAdminPassword}
                  onChange={(e) => setDryRunAdminPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmDryRun();
                    }
                  }}
                  autoFocus
                  placeholder="Nhập mật khẩu tài khoản Admin hiện có..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDryRunModalOpen(false);
                  setDryRunAdminPassword('');
                }}
                disabled={migrationLoading}
                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDryRun}
                disabled={migrationLoading || !dryRunAdminPassword.trim()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {migrationLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                {migrationLoading ? 'Đang đối soát...' : 'Bắt đầu Đối soát (Dry Run)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MIGRATION CONFIRMATION & EXECUTION MODAL */}
      {migrationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-0">
            {/* Header */}
            <div className="p-6 bg-purple-50/80 border-b border-purple-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-700 text-white flex items-center justify-center shadow-md shadow-purple-700/30 shrink-0">
                  <FolderSync className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Di chuyển Dữ liệu sang Neon PostgreSQL</h3>
                  <p className="text-xs text-purple-900 font-semibold mt-0.5">
                    Thực thi toàn bộ trong 1 Transaction an toàn • Tự động sao lưu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMigrationModalOpen(false);
                  setMigrationAdminPassword('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1.5 text-[11px]">
                <span className="font-black flex items-center gap-1.5 text-amber-900">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                  Cam kết Bảo vệ An toàn Dữ liệu:
                </span>
                <ul className="list-disc pl-4 space-y-0.5 text-amber-900/90 leading-relaxed">
                  <li>Tự động tạo bản sao lưu an toàn <code>pre-neon-migration-[time].json</code> trước khi ghi.</li>
                  <li>Mọi thao tác ghi chạy trong một Transaction duy nhất (sẽ <strong>ROLLBACK 100%</strong> nếu có bất kỳ lỗi nào).</li>
                  <li>Dữ liệu nguồn trong file JSON được bảo toàn nguyên vẹn, hệ thống <strong>không xóa bất kỳ bản ghi nào</strong>.</li>
                </ul>
              </div>

              {migrationError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{migrationError}</span>
                </div>
              )}

              {(!preflightToken || tokenRemainingSec <= 0) && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 font-bold text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Mã Preflight Token đã hết hạn. Vui lòng đóng hộp thoại và chạy lại bước 1. Đối soát dữ liệu (Dry Run).</span>
                </div>
              )}

              {migrationDryRunData && !migrationDryRunData.readyToMigrate && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Dữ liệu chưa đủ điều kiện di chuyển an toàn (tồn tại xung đột, trùng lặp hoặc CSDL đích không ở trạng thái EMPTY_BOOTSTRAP).</span>
                </div>
              )}

              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-900 flex items-center justify-between">
                  <span>Xác thực Mật khẩu Quản trị viên (ADMIN):</span>
                  <span className="text-rose-600 font-bold">* Bắt buộc</span>
                </label>
                <input
                  type="password"
                  value={migrationAdminPassword}
                  onChange={(e) => setMigrationAdminPassword(e.target.value)}
                  placeholder="Nhập mật khẩu tài khoản Admin của bạn..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setMigrationModalOpen(false);
                  setMigrationAdminPassword('');
                }}
                disabled={migrating}
                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExecuteMigration}
                disabled={
                  migrating || 
                  !migrationAdminPassword || 
                  !preflightToken || 
                  tokenRemainingSec <= 0 || 
                  !migrationDryRunData?.readyToMigrate ||
                  targetAdminStatus?.state === 'RECOVERY_REQUIRED' ||
                  Boolean(targetAdminStatus?.recoveryRequired)
                }
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {migrating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderSync className="w-3.5 h-3.5" />}
                {migrating ? 'Đang thực thi di chuyển...' : 'Xác nhận Chuyển sang Neon'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MIGRATION RESULT MODAL */}
      {migrationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-0">
            {/* Header */}
            <div className="p-6 bg-emerald-50/80 border-b border-emerald-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Di chuyển Dữ liệu Thành công!</h3>
                  <p className="text-xs text-emerald-800 font-semibold mt-0.5">
                    Hệ thống đã nạp dữ liệu vào Neon PostgreSQL và hoàn tất hậu kiểm đĩa
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMigrationResult(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs max-h-[70vh] overflow-y-auto">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">File Snapshot bảo vệ:</span>
                  <span className="font-mono font-bold text-purple-700">{migrationResult.backupFile}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tổng bản ghi đã xử lý:</span>
                  <span className="font-bold text-slate-900">{migrationResult.totalMigrated} bản ghi</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Thời gian thực thi:</span>
                  <span className="font-bold text-slate-900">{migrationResult.durationMs} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trạng thái đối chiếu hậu kiểm:</span>
                  <span className="font-bold text-emerald-700">✓ 100% Khớp với nguồn</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Bảng</th>
                      <th className="p-2.5 text-right">Nguồn</th>
                      <th className="p-2.5 text-right">Thêm mới</th>
                      <th className="p-2.5 text-right">Cập nhật</th>
                      <th className="p-2.5 text-right">Sau ghi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(migrationResult.tables || {}).map(([tbl, stats]: any) => (
                      <tr key={tbl}>
                        <td className="p-2.5 font-bold text-slate-800">{tbl}</td>
                        <td className="p-2.5 text-right text-slate-600">{stats.source}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">+{stats.inserted}</td>
                        <td className="p-2.5 text-right font-bold text-amber-700">{stats.updated}</td>
                        <td className="p-2.5 text-right font-bold text-blue-700">{stats.targetAfter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setMigrationResult(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-black shadow-md transition cursor-pointer"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
