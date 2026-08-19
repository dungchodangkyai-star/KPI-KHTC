import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Database,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileDown,
  FileSpreadsheet,
  Trash2,
  ShieldAlert,
  Server,
  Layers,
  Users,
  Briefcase,
  Clock,
  Award,
  Check,
  X,
  FileText,
  HelpCircle,
  ArrowRight,
  HardDrive,
  Calendar,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
  Sliders
} from 'lucide-react';
import { formatMonth, STANDARD_MONTHS } from '../utils';
import { exportMultiSheetExcel, exportStyledExcel, downloadStyledTemplate, MultiSheetConfig, ExportColumn } from '../excelUtils';

interface SheetData {
  name: string;
  detectedType: 'works' | 'users' | 'categories' | 'task_groups' | 'product_types' | 'assignments' | 'overtimes' | 'unknown';
  rows: any[];
  headers: string[];
}

export default function AdminSync() {
  const [activeTab, setActiveTab] = useState<'import' | 'backup' | 'template' | 'reset'>('import');
  const [dbOverview, setDbOverview] = useState<any>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Import State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [workbookSheets, setWorkbookSheets] = useState<SheetData[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  
  // Multi-Month Synchronization Controls
  const [monthSyncMode, setMonthSyncMode] = useState<'ALL' | 'SELECTED' | 'OVERRIDE'>('ALL');
  const [selectedMonthsList, setSelectedMonthsList] = useState<string[]>([]);
  const [overrideMonth, setOverrideMonth] = useState('08-2026');
  const [detectedMonthsMap, setDetectedMonthsMap] = useState<{ [month: string]: number }>({});
  const [customAddMonth, setCustomAddMonth] = useState('');

  const [importStatus, setImportStatus] = useState<'idle' | 'reading' | 'ready' | 'syncing' | 'success' | 'error'>('idle');
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncSummary, setSyncSummary] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backup & Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Reset State
  const [resetAction, setResetAction] = useState<'reset_month' | 'reset_all_works' | 'reseed_official'>('reset_month');
  const [resetMonth, setResetMonth] = useState('08-2026');
  const [confirmCode, setConfirmCode] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch('/api/sync/overview');
      const data = await res.json();
      if (data.success) {
        setDbOverview(data);
      }
    } catch (e) {
      console.error('Error fetching db overview:', e);
    } finally {
      setLoadingOverview(false);
    }
  };

  const addLog = (msg: string) => {
    setSyncLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // --------------------------------------------------------------------------
  // 1. EXCEL IMPORT LOGIC
  // --------------------------------------------------------------------------
  const detectSheetType = (sheetName: string, headers: string[]): 'works' | 'users' | 'categories' | 'task_groups' | 'product_types' | 'assignments' | 'overtimes' | 'unknown' => {
    const sName = sheetName.toLowerCase().replace(/[\s\-_]/g, '');
    const hStr = headers.map(h => String(h).toLowerCase()).join(' ');

    // 1. Explicit skip list for summary, warning, evaluation, and dashboard sheets
    if (
      sName.includes('canhbao') || sName.includes('tonghop') || sName.includes('danhgia') ||
      sName.includes('tucham') || sName.includes('baocao') || sName.includes('xeploai') ||
      sName.includes('dashboard') || sName.includes('thongke') || sName.includes('kqthang') ||
      sName.includes('bangke') || sName.includes('huongdan') || sName.includes('kiemtra') ||
      sName.includes('loiphat') || sName.includes('config') || sName.includes('log') ||
      sName.includes('phatsinh') || sName.includes('import') || sName.includes('export')
    ) {
      return 'unknown';
    }

    if (sName.includes('nhomviec') || sName.includes('taskgroup') || (hStr.includes('mã nhóm') && hStr.includes('tên nhóm'))) {
      return 'task_groups';
    }
    if (sName.includes('loaisanpham') || sName.includes('producttype') || (hStr.includes('loại sản phẩm') && (hStr.includes('đơn vị tính') || hStr.includes('dvt')))) {
      return 'product_types';
    }
    if (sName.includes('nhansu') || sName.includes('users') || sName.includes('nhân sự') || (hStr.includes('email') && (hStr.includes('chức vụ') || hStr.includes('họ tên') || hStr.includes('họ và tên')))) {
      return 'users';
    }
    if (sName.includes('danhmuc') || sName.includes('categories') || (hStr.includes('mã danh mục') && hStr.includes('tên danh mục')) || (hStr.includes('mã chuẩn') && hStr.includes('điểm chuẩn'))) {
      return 'categories';
    }
    if (sName.includes('giaoviec') || sName.includes('assignments') || sName.includes('nhiệm vụ') || (hStr.includes('người giao') && (hStr.includes('người nhận') || hStr.includes('nội dung yêu cầu')))) {
      return 'assignments';
    }
    if (sName.includes('lamthem') || sName.includes('overtime') || sName === 'ot' || sName.startsWith('ot') || hStr.includes('giờ làm thêm') || hStr.includes('số giờ đăng ký') || hStr.includes('lý do làm thêm')) {
      return 'overtimes';
    }
    if (
      sName.includes('congviec') || sName.includes('works') || sName.includes('khcv') || sName.includes('khcongviec') || sName.includes('kehoach') ||
      ((hStr.includes('tên việc') || hStr.includes('tên công việc')) && (hStr.includes('điểm chuẩn') || hStr.includes('hệ số') || hStr.includes('minh chứng')))
    ) {
      return 'works';
    }
    return 'unknown';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImportStatus('reading');
    setSyncLogs([]);
    setSyncSummary(null);
    addLog(`Đang phân tích tệp Excel: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)...`);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });

        const parsedSheets: SheetData[] = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          // Try standard read
          let rawData: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

          // If headers might be on row 2 or 3 (common in KPI V8 templates), check first 3 rows
          if (rawData.length > 0) {
            const firstRowKeys = Object.keys(rawData[0]);
            // If keys are empty or generic like "__EMPTY", try range: 1 or range: 2
            if (firstRowKeys.some(k => k.startsWith('__EMPTY'))) {
              const tryData2 = XLSX.utils.sheet_to_json(ws, { range: 1, defval: '' });
              if (tryData2.length > 0 && !Object.keys(tryData2[0]).some(k => k.startsWith('__EMPTY'))) {
                rawData = tryData2;
              } else {
                const tryData3 = XLSX.utils.sheet_to_json(ws, { range: 2, defval: '' });
                if (tryData3.length > 0) rawData = tryData3;
              }
            }
          }

          // Filter out completely empty rows (rows where all values are empty strings or null)
          rawData = rawData.filter(row => {
            if (!row || typeof row !== 'object') return false;
            return Object.values(row).some(val => val !== undefined && val !== null && String(val).trim() !== '');
          });

          if (rawData.length > 0) {
            const headers = Object.keys(rawData[0]);
            const type = detectSheetType(sheetName, headers);
            parsedSheets.push({
              name: sheetName,
              detectedType: type,
              rows: rawData,
              headers: headers,
            });
            addLog(`✓ Đã nhận diện Sheet "${sheetName}": ${rawData.length} dòng -> Phân loại: ${getTypeLabel(type)}`);
          }
        }

        if (parsedSheets.length === 0) {
          throw new Error('Không tìm thấy dữ liệu hợp lệ trong các trang tính của file Excel!');
        }

        // Scan detected months across all data rows
        const monthCounts: { [m: string]: number } = {};
        for (const sheet of parsedSheets) {
          if (['works', 'assignments', 'overtimes'].includes(sheet.detectedType)) {
            for (const r of sheet.rows) {
              let rawM;
              if (sheet.detectedType === 'overtimes') {
                 // For OT, Date dictates the month first
                 rawM = r['Ngày làm thêm'] || r['Ngày OT'] || r['Ngày'] || r['Tháng làm thêm'] || r['Tháng'] || r['Kỳ'];
              } else {
                 rawM = r['Tháng'] || r['tháng'] || r['month'] || r['Month'] || r['Kỳ'] || r['kỳ'] ||
                  r['Ngày bắt đầu'] || r['Ngày làm'] || r['Ngày'] || r['startDate'] || r['Ngày giao'];
              }
              const fm = formatMonth(rawM);
              if (fm) {
                monthCounts[fm] = (monthCounts[fm] || 0) + 1;
              }
            }
          }
        }

        setDetectedMonthsMap(monthCounts);
        const detectedKeys = Object.keys(monthCounts).sort();
        if (detectedKeys.length > 0) {
          setSelectedMonthsList(detectedKeys);
          addLog(`🔍 Phát hiện ${detectedKeys.length} kỳ tháng trong file: ${detectedKeys.map(k => `${k} (${monthCounts[k]} dòng)`).join(', ')}`);
        } else {
          setSelectedMonthsList(['08-2026']);
        }

        setWorkbookSheets(parsedSheets);
        setActiveSheetIndex(0);
        setImportStatus('ready');
        addLog(`Sẵn sàng đồng bộ! Tổng cộng ${parsedSheets.length} sheet chứa dữ liệu đã được trích xuất.`);
      } catch (err) {
        setImportStatus('error');
        addLog(`Lỗi xử lý file Excel: ${String(err)}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'users': return '👤 Danh sách Nhân sự';
      case 'categories': return '📁 Danh mục Công việc chuẩn';
      case 'task_groups': return '🗂️ Nhóm công việc';
      case 'product_types': return '📦 Loại sản phẩm & ĐVT';
      case 'works': return '📝 Khai báo Công việc';
      case 'assignments': return '🎯 Phân công Giao việc';
      case 'overtimes': return '⏰ Làm thêm ngoài giờ (OT)';
      default: return '📄 Bảng dữ liệu chung';
    }
  };

  const handleToggleMonth = (m: string) => {
    setSelectedMonthsList(prev =>
      prev.includes(m) ? prev.filter(item => item !== m) : [...prev, m]
    );
  };

  const handleSelectAllMonths = () => {
    const keys = Object.keys(detectedMonthsMap);
    if (keys.length > 0) {
      setSelectedMonthsList(keys);
    } else {
      setSelectedMonthsList(STANDARD_MONTHS);
    }
  };

  const handleDeselectAllMonths = () => {
    setSelectedMonthsList([]);
  };

  const handleAddCustomMonth = () => {
    const fm = formatMonth(customAddMonth);
    if (fm && !selectedMonthsList.includes(fm)) {
      setSelectedMonthsList(prev => [...prev, fm]);
      setCustomAddMonth('');
    }
  };

  const handleExecuteImport = async () => {
    if (workbookSheets.length === 0) return;

    if (monthSyncMode === 'SELECTED' && selectedMonthsList.length === 0) {
      alert('Vui lòng chọn ít nhất 1 kỳ tháng để đồng bộ hoặc chuyển sang chế độ "Đồng bộ TẤT CẢ".');
      return;
    }

    setImportStatus('syncing');
    addLog('Bắt đầu đồng bộ vào cơ sở dữ liệu Cloud SQL PostgreSQL...');
    if (monthSyncMode === 'ALL') {
      addLog('🌐 Chế độ: ĐỒNG BỘ TẤT CẢ CÁC THÁNG (Tự động nhận diện kỳ từng dòng dữ liệu)');
    } else if (monthSyncMode === 'SELECTED') {
      addLog(`🎯 Chế độ: CHỈ ĐỒNG BỘ CÁC THÁNG ĐƯỢC CHỌN (${selectedMonthsList.join(', ')})`);
    } else {
      addLog(`⚡ Chế độ: GHI ĐÈ TẤT CẢ SANG THÁNG "${overrideMonth}"`);
    }

    try {
      // Build structured payload by organizing sheets
      const payloadSheets: any = {
        users: [],
        categories: [],
        works: [],
        assignments: [],
        overtimes: [],
      };

      for (const sheet of workbookSheets) {
        if (sheet.detectedType === 'users') {
          payloadSheets.users.push(...sheet.rows);
        } else if (sheet.detectedType === 'categories') {
          payloadSheets.categories.push(...sheet.rows);
        } else if (sheet.detectedType === 'task_groups') {
          // Normalize task_groups into categories format with type 'TASK_GROUP'
          const formatted = sheet.rows.map((r: any) => ({
            ...r,
            'Loại danh mục': 'TASK_GROUP',
            'type': 'TASK_GROUP'
          }));
          payloadSheets.categories.push(...formatted);
        } else if (sheet.detectedType === 'product_types') {
          // Normalize product_types into categories format with type 'PRODUCT_TYPE'
          const formatted = sheet.rows.map((r: any) => ({
            ...r,
            'Loại danh mục': 'PRODUCT_TYPE',
            'type': 'PRODUCT_TYPE'
          }));
          payloadSheets.categories.push(...formatted);
        } else if (sheet.detectedType === 'assignments') {
          payloadSheets.assignments.push(...sheet.rows);
        } else if (sheet.detectedType === 'overtimes') {
          payloadSheets.overtimes.push(...sheet.rows);
        } else if (sheet.detectedType === 'works') {
          payloadSheets.works.push(...sheet.rows);
        } else {
          addLog(`ℹ️ Bỏ qua Sheet "${sheet.name}" (loại: ${getTypeLabel(sheet.detectedType)})`);
        }
      }

      addLog(`Gửi dữ liệu qua API Batch Sync: ${payloadSheets.users.length} nhân sự, ${payloadSheets.categories.length} danh mục, ${payloadSheets.works.length} công việc, ${payloadSheets.assignments.length} giao việc, ${payloadSheets.overtimes.length} làm thêm...`);

      const res = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'all',
          sheets: payloadSheets,
          monthSyncMode: monthSyncMode,
          selectedMonths: monthSyncMode === 'SELECTED' ? selectedMonthsList : undefined,
          defaultMonth: monthSyncMode === 'OVERRIDE' ? overrideMonth : '08-2026',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Đồng bộ thất bại');
      }

      setSyncSummary(data.results);
      setImportStatus('success');
      addLog(`✅ THÀNH CÔNG: ${data.message}`);
      if (data.results) {
        addLog(`• Nhân sự: ${data.results.users.success} thành công, ${data.results.users.skipped} bỏ qua`);
        addLog(`• Danh mục: ${data.results.categories.success} thành công`);
        addLog(`• Công việc: ${data.results.works.success} thành công, ${data.results.works.skipped || 0} bỏ qua`);
        addLog(`• Giao việc: ${data.results.assignments.success} thành công, ${data.results.assignments.skipped || 0} bỏ qua`);
        addLog(`• Làm thêm giờ: ${data.results.overtimes.success} thành công, ${data.results.overtimes.skipped || 0} bỏ qua`);
      }

      // Refresh overview
      fetchOverview();
    } catch (err) {
      setImportStatus('error');
      addLog(`❌ Lỗi đồng bộ: ${String(err)}`);
    }
  };

  // --------------------------------------------------------------------------
  // 2. BACKUP & EXPORT REAL DATA (MULTI-SHEET & SINGLE-SHEET)
  // --------------------------------------------------------------------------
  const handleExportSingleRealData = async (targetType: 'users' | 'categories' | 'task_groups' | 'product_types' | 'works' | 'assignments' | 'overtimes') => {
    setIsExporting(true);
    setExportMessage(`Đang trích xuất và định dạng bảng dữ liệu thật [${targetType}] từ Cloud SQL...`);
    try {
      const res = await fetch('/api/sync/backup-data');
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Không thể lấy dữ liệu');
      const { data } = result;

      const dateStr = new Date().toISOString().slice(0, 10);

      if (targetType === 'users') {
        const cols: ExportColumn[] = [
          { header: 'STT', key: 'stt', width: 8, align: 'center' },
          { header: 'Mã ID', key: 'id', width: 10, align: 'center' },
          { header: 'Họ và tên', key: 'name', width: 26, align: 'left' },
          { header: 'Email', key: 'email', width: 32, align: 'left' },
          { header: 'Số điện thoại', key: 'phone', width: 16, align: 'center' },
          { header: 'Zalo', key: 'zalo', width: 16, align: 'center' },
          { header: 'Chức vụ', key: 'position', width: 22, align: 'left' },
          { header: 'Nhóm / Phòng ban', key: 'group', width: 24, align: 'left' },
          { header: 'Vai trò', key: 'role', width: 14, align: 'center' },
          { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
          { header: 'Lần đăng nhập cuối', key: 'lastLogin', width: 22, align: 'center' },
        ];
        const formatted = (data.users || []).map((u: any, idx: number) => ({
          stt: idx + 1,
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          zalo: u.zalo || '',
          position: u.position || '',
          group: u.group || '',
          role: u.role,
          status: u.status,
          lastLogin: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('vi-VN') : 'Chưa đăng nhập',
        }));
        await exportStyledExcel(formatted, cols, `DS_Nhan_Su_CloudSQL_${dateStr}.xlsx`, 'DS_Nhan_Su');
        setExportMessage(`✅ Đã tải file Excel Nhân sự thật: DS_Nhan_Su_CloudSQL_${dateStr}.xlsx`);
      } else if (targetType === 'task_groups') {
        const cols: ExportColumn[] = [
          { header: 'STT', key: 'stt', width: 8, align: 'center' },
          { header: 'Mã nhóm việc', key: 'code', width: 20, align: 'center' },
          { header: 'Tên nhóm công việc', key: 'name', width: 40, align: 'left' },
          { header: 'Loại danh mục', key: 'type', width: 18, align: 'center' },
          { header: 'Thứ tự hiển thị', key: 'order', width: 14, align: 'center' },
          { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
        ];
        const filtered = (data.categories || [])
          .filter((c: any) => c.type === 'TASK_GROUP' || !c.type || c.type === 'GROUP')
          .map((c: any, idx: number) => ({
            stt: idx + 1,
            code: c.code,
            name: c.name,
            type: 'TASK_GROUP',
            order: c.order || idx + 1,
            status: c.status || 'Đang dùng',
          }));
        await exportStyledExcel(filtered, cols, `DM_Nhom_Cong_Viec_${dateStr}.xlsx`, 'Nhom_Cong_Viec');
        setExportMessage(`✅ Đã tải file Excel Nhóm công việc: DM_Nhom_Cong_Viec_${dateStr}.xlsx`);
      } else if (targetType === 'product_types') {
        const cols: ExportColumn[] = [
          { header: 'STT', key: 'stt', width: 8, align: 'center' },
          { header: 'Mã loại sản phẩm', key: 'code', width: 20, align: 'center' },
          { header: 'Tên loại sản phẩm', key: 'name', width: 38, align: 'left' },
          { header: 'Đơn vị tính (ĐVT)', key: 'unit', width: 18, align: 'center' },
          { header: 'Loại danh mục', key: 'type', width: 18, align: 'center' },
          { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
          { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
        ];
        const filtered = (data.categories || [])
          .filter((c: any) => c.type === 'PRODUCT_TYPE')
          .map((c: any, idx: number) => ({
            stt: idx + 1,
            code: c.code,
            name: c.name,
            unit: c.properties?.unit || '',
            type: 'PRODUCT_TYPE',
            order: c.order || idx + 1,
            status: c.status || 'Đang dùng',
          }));
        await exportStyledExcel(filtered, cols, `DM_Loai_San_Pham_${dateStr}.xlsx`, 'Loai_San_Pham');
        setExportMessage(`✅ Đã tải file Excel Loại sản phẩm & ĐVT: DM_Loai_San_Pham_${dateStr}.xlsx`);
      } else if (targetType === 'categories') {
        const cols: ExportColumn[] = [
          { header: 'STT', key: 'stt', width: 8, align: 'center' },
          { header: 'Mã chuẩn', key: 'code', width: 18, align: 'center' },
          { header: 'Tên danh mục công việc', key: 'name', width: 42, align: 'left' },
          { header: 'Nhóm công việc', key: 'taskGroup', width: 26, align: 'left' },
          { header: 'Điểm chuẩn (Đc)', key: 'score', width: 16, align: 'center', numFmt: '#,##0.0' },
          { header: 'Tính chất mặc định', key: 'nature', width: 20, align: 'center' },
          { header: 'Loại sản phẩm', key: 'productType', width: 20, align: 'left' },
          { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
          { header: 'Thứ tự', key: 'order', width: 10, align: 'center' },
          { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
        ];
        const filtered = (data.categories || [])
          .filter((c: any) => c.type === 'TASK' || (!c.type && c.properties?.score))
          .map((c: any, idx: number) => ({
            stt: idx + 1,
            code: c.code,
            name: c.name,
            taskGroup: c.properties?.taskGroup || '',
            score: c.properties?.score ?? 10,
            nature: c.properties?.nature || 'Trung bình',
            productType: c.properties?.productType || '',
            unit: c.properties?.unit || '',
            order: c.order || idx + 1,
            status: c.status || 'Đang dùng',
          }));
        await exportStyledExcel(filtered, cols, `DM_Cong_Viec_Chuan_${dateStr}.xlsx`, 'DM_Cong_Viec');
        setExportMessage(`✅ Đã tải file Excel Danh mục công việc chuẩn: DM_Cong_Viec_Chuan_${dateStr}.xlsx`);
      } else if (targetType === 'works') {
        const cols: ExportColumn[] = [
          { header: 'STT', key: 'stt', width: 8, align: 'center' },
          { header: 'Mã việc', key: 'workId', width: 24, align: 'center' },
          { header: 'Tháng', key: 'month', width: 12, align: 'center' },
          { header: 'Nhân viên', key: 'userName', width: 26, align: 'left' },
          { header: 'Email', key: 'userEmail', width: 30, align: 'left' },
          { header: 'Nhóm việc', key: 'taskGroup', width: 24, align: 'left' },
          { header: 'Tên công việc', key: 'taskName', width: 40, align: 'left' },
          { header: 'Mã chuẩn', key: 'taskCode', width: 14, align: 'center' },
          { header: 'Nội dung chi tiết', key: 'detail', width: 45, align: 'left' },
          { header: 'Ngày bắt đầu', key: 'startDate', width: 14, align: 'center' },
          { header: 'Hạn chót', key: 'endDate', width: 14, align: 'center' },
          { header: 'Số giờ', key: 'hours', width: 12, align: 'center', numFmt: '#,##0.0' },
          { header: 'Tính chất đề xuất', key: 'proposedNature', width: 18, align: 'center' },
          { header: 'Tính chất duyệt', key: 'approvedNature', width: 18, align: 'center' },
          { header: 'Hệ số K', key: 'coef', width: 12, align: 'center', numFmt: '0.00' },
          { header: 'Điểm chuẩn (Đc)', key: 'baseScore', width: 16, align: 'center', numFmt: '#,##0.0' },
          { header: 'Điểm quy đổi (Đqđ)', key: 'convertedScore', width: 18, align: 'center', numFmt: '#,##0.00' },
          { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
          { header: 'Loại sản phẩm', key: 'productType', width: 20, align: 'left' },
          { header: 'Số lượng SP', key: 'productQty', width: 14, align: 'center', numFmt: '#,##0' },
          { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
          { header: 'Dự án', key: 'project', width: 26, align: 'left' },
          { header: 'Minh chứng', key: 'evidence', width: 35, align: 'left' },
          { header: 'Lãnh đạo duyệt', key: 'leaderApproval', width: 16, align: 'center' },
          { header: 'Ghi chú Lãnh đạo', key: 'leaderNote', width: 30, align: 'left' },
        ];
        const formatted = (data.works || []).map((w: any, idx: number) => ({
          stt: idx + 1,
          workId: w.workId,
          month: w.month,
          userName: w.user?.name || w.userId,
          userEmail: w.user?.email || '',
          taskGroup: w.taskGroup || '',
          taskName: w.taskName || '',
          taskCode: w.taskCode || '',
          detail: w.detail || '',
          startDate: w.startDate ? new Date(w.startDate).toLocaleDateString('vi-VN') : '',
          endDate: w.endDate ? new Date(w.endDate).toLocaleDateString('vi-VN') : '',
          hours: Number(w.hours) || 8,
          proposedNature: w.proposedNature || '',
          approvedNature: w.approvedNature || '',
          coef: Number(w.coef) || 0.8,
          baseScore: Number(w.baseScore) || 10,
          convertedScore: Number(w.convertedScore) || 8,
          status: w.status,
          productType: w.productType || '',
          productQty: Number(w.productQty) || 1,
          unit: w.unit || '',
          project: w.project || '',
          evidence: w.evidence || '',
          leaderApproval: w.leaderApproval || 'Chưa duyệt',
          leaderNote: w.leaderNote || '',
        }));
        await exportStyledExcel(formatted, cols, `Khai_Bao_Cong_Viec_CloudSQL_${dateStr}.xlsx`, 'Khai_Bao_Cong_Viec');
        setExportMessage(`✅ Đã tải file Excel Khai báo công việc: Khai_Bao_Cong_Viec_CloudSQL_${dateStr}.xlsx`);
      }
    } catch (e) {
      setExportMessage(`❌ Lỗi xuất dữ liệu: ${String(e)}`);
    } finally {
      setIsExporting(false);
    }
  };

  // --------------------------------------------------------------------------
  // 2. BACKUP & EXPORT REAL DATA
  // --------------------------------------------------------------------------
  const handleExportFullExcel = async () => {
    setIsExporting(true);
    setExportMessage('Đang lấy và định dạng dữ liệu thực tế từ Cloud SQL...');
    try {
      const res = await fetch('/api/sync/backup-data');
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Không thể lấy dữ liệu');

      const { data, timestamp } = result;

      const sheets: MultiSheetConfig[] = [
        // Sheet 1: Nhân sự
        {
          sheetName: '1_DM_Nhan_Su',
          columns: [
            { header: 'STT', key: 'stt', width: 8, align: 'center' },
            { header: 'Mã ID', key: 'id', width: 10, align: 'center' },
            { header: 'Họ và tên', key: 'name', width: 26, align: 'left' },
            { header: 'Email', key: 'email', width: 32, align: 'left' },
            { header: 'Số điện thoại', key: 'phone', width: 16, align: 'center' },
            { header: 'Zalo', key: 'zalo', width: 16, align: 'center' },
            { header: 'Chức vụ', key: 'position', width: 22, align: 'left' },
            { header: 'Nhóm / Phòng ban', key: 'group', width: 24, align: 'left' },
            { header: 'Vai trò', key: 'role', width: 14, align: 'center' },
            { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
            { header: 'Quyền hạn', key: 'permissions', width: 30, align: 'left' },
            { header: 'Lần đăng nhập cuối', key: 'lastLogin', width: 22, align: 'center' },
          ],
          data: (data.users || []).map((u: any, idx: number) => ({
            stt: idx + 1,
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone || '',
            zalo: u.zalo || '',
            position: u.position || '',
            group: u.group || '',
            role: u.role,
            status: u.status,
            permissions: u.permissions || '',
            lastLogin: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('vi-VN') : 'Chưa đăng nhập',
          }))
        },

        // Sheet 2: Danh mục
        {
          sheetName: '2_DM_DanhMuc',
          columns: [
            { header: 'STT', key: 'stt', width: 8, align: 'center' },
            { header: 'Mã danh mục', key: 'code', width: 18, align: 'center' },
            { header: 'Tên danh mục', key: 'name', width: 38, align: 'left' },
            { header: 'Loại danh mục', key: 'type', width: 18, align: 'center' },
            { header: 'Nhóm việc', key: 'taskGroup', width: 24, align: 'left' },
            { header: 'Điểm chuẩn (Đc)', key: 'score', width: 16, align: 'center', numFmt: '#,##0.0' },
            { header: 'Tính chất', key: 'nature', width: 18, align: 'center' },
            { header: 'Loại sản phẩm', key: 'productType', width: 20, align: 'left' },
            { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
            { header: 'Thứ tự', key: 'order', width: 10, align: 'center' },
            { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
          ],
          data: (data.categories || []).map((c: any, idx: number) => ({
            stt: idx + 1,
            code: c.code,
            name: c.name,
            type: c.type,
            taskGroup: c.properties?.taskGroup || '',
            score: c.properties?.score ?? '',
            nature: c.properties?.nature || '',
            productType: c.properties?.productType || '',
            unit: c.properties?.unit || '',
            order: c.order || idx + 1,
            status: c.status,
          }))
        },

        // Sheet 3: Công việc thực hiện
        {
          sheetName: '3_Cong_Viec_Thuc_Hien',
          columns: [
            { header: 'STT', key: 'stt', width: 8, align: 'center' },
            { header: 'Mã việc', key: 'workId', width: 24, align: 'center' },
            { header: 'Tháng', key: 'month', width: 12, align: 'center' },
            { header: 'Nhân viên', key: 'userName', width: 26, align: 'left' },
            { header: 'Email', key: 'userEmail', width: 30, align: 'left' },
            { header: 'Nhóm việc', key: 'taskGroup', width: 24, align: 'left' },
            { header: 'Tên công việc', key: 'taskName', width: 40, align: 'left' },
            { header: 'Mã chuẩn', key: 'taskCode', width: 14, align: 'center' },
            { header: 'Nội dung chi tiết', key: 'detail', width: 45, align: 'left' },
            { header: 'Ngày bắt đầu', key: 'startDate', width: 14, align: 'center' },
            { header: 'Hạn chót', key: 'endDate', width: 14, align: 'center' },
            { header: 'Số giờ', key: 'hours', width: 12, align: 'center', numFmt: '#,##0.0' },
            { header: 'Tính chất đề xuất', key: 'proposedNature', width: 18, align: 'center' },
            { header: 'Tính chất duyệt', key: 'approvedNature', width: 18, align: 'center' },
            { header: 'Hệ số K', key: 'coef', width: 12, align: 'center', numFmt: '0.00' },
            { header: 'Điểm chuẩn (Đc)', key: 'baseScore', width: 16, align: 'center', numFmt: '#,##0.0' },
            { header: 'Điểm quy đổi (Đqđ)', key: 'convertedScore', width: 18, align: 'center', numFmt: '#,##0.00' },
            { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
            { header: 'Loại sản phẩm', key: 'productType', width: 20, align: 'left' },
            { header: 'Số lượng SP', key: 'productQty', width: 14, align: 'center', numFmt: '#,##0' },
            { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
            { header: 'Dự án', key: 'project', width: 26, align: 'left' },
            { header: 'Minh chứng', key: 'evidence', width: 35, align: 'left' },
            { header: 'Lãnh đạo duyệt', key: 'leaderApproval', width: 16, align: 'center' },
            { header: 'Ghi chú Lãnh đạo', key: 'leaderNote', width: 30, align: 'left' },
            { header: 'Nguồn tạo', key: 'source', width: 14, align: 'center' },
          ],
          data: (data.works || []).map((w: any, idx: number) => ({
            stt: idx + 1,
            workId: w.workId,
            month: w.month,
            userName: w.user?.name || w.userId,
            userEmail: w.user?.email || '',
            taskGroup: w.taskGroup || '',
            taskName: w.taskName || '',
            taskCode: w.taskCode || '',
            detail: w.detail || '',
            startDate: w.startDate ? new Date(w.startDate).toLocaleDateString('vi-VN') : '',
            endDate: w.endDate ? new Date(w.endDate).toLocaleDateString('vi-VN') : '',
            hours: Number(w.hours) || 8,
            proposedNature: w.proposedNature || '',
            approvedNature: w.approvedNature || '',
            coef: Number(w.coef) || 0.8,
            baseScore: Number(w.baseScore) || 10,
            convertedScore: Number(w.convertedScore) || 8,
            status: w.status,
            productType: w.productType || '',
            productQty: Number(w.productQty) || 1,
            unit: w.unit || '',
            project: w.project || '',
            evidence: w.evidence || '',
            leaderApproval: w.leaderApproval || 'Chưa duyệt',
            leaderNote: w.leaderNote || '',
            source: w.source || 'WEBAPP',
          }))
        },

        // Sheet 4: Giao việc
        {
          sheetName: '4_Nhiem_Vu_Giao_Viec',
          columns: [
            { header: 'STT', key: 'stt', width: 8, align: 'center' },
            { header: 'Mã giao việc', key: 'assignmentId', width: 22, align: 'center' },
            { header: 'Tháng', key: 'month', width: 12, align: 'center' },
            { header: 'Người giao', key: 'assigner', width: 24, align: 'left' },
            { header: 'Người nhận', key: 'receiver', width: 24, align: 'left' },
            { header: 'Email người nhận', key: 'receiverEmail', width: 30, align: 'left' },
            { header: 'Nhóm việc', key: 'taskGroup', width: 24, align: 'left' },
            { header: 'Tên nhiệm vụ', key: 'taskName', width: 40, align: 'left' },
            { header: 'Mã việc', key: 'taskCode', width: 14, align: 'center' },
            { header: 'Điểm chuẩn', key: 'baseScore', width: 14, align: 'center', numFmt: '#,##0.0' },
            { header: 'Tính chất', key: 'suggestedNature', width: 18, align: 'center' },
            { header: 'Nội dung yêu cầu', key: 'detail', width: 45, align: 'left' },
            { header: 'Ngày giao', key: 'assignDate', width: 14, align: 'center' },
            { header: 'Hạn chót', key: 'deadline', width: 14, align: 'center' },
            { header: 'Sản phẩm yêu cầu', key: 'productRequired', width: 26, align: 'left' },
            { header: 'Mức độ ưu tiên', key: 'priority', width: 16, align: 'center' },
            { header: 'Trạng thái tiếp nhận', key: 'receiveStatus', width: 20, align: 'center' },
            { header: 'Ngày nhận việc', key: 'receiveDate', width: 14, align: 'center' },
          ],
          data: (data.assignments || []).map((a: any, idx: number) => ({
            stt: idx + 1,
            assignmentId: a.assignmentId,
            month: a.month,
            assigner: a.assigner?.name || a.assignerId,
            receiver: a.receiver?.name || a.receiverId,
            receiverEmail: a.receiver?.email || '',
            taskGroup: a.taskGroup || '',
            taskName: a.taskName || '',
            taskCode: a.taskCode || '',
            baseScore: a.baseScore ? Number(a.baseScore) : '',
            suggestedNature: a.suggestedNature || '',
            detail: a.detail || '',
            assignDate: a.assignDate ? new Date(a.assignDate).toLocaleDateString('vi-VN') : '',
            deadline: a.deadline ? new Date(a.deadline).toLocaleDateString('vi-VN') : '',
            productRequired: a.productRequired || '',
            priority: a.priority || 'Bình thường',
            receiveStatus: a.receiveStatus || '',
            receiveDate: a.receiveDate ? new Date(a.receiveDate).toLocaleDateString('vi-VN') : '',
          }))
        },

        // Sheet 5: Làm thêm giờ
        {
          sheetName: '5_Dang_Ky_Lam_Them_Gio',
          columns: [
            { header: 'STT', key: 'stt', width: 8, align: 'center' },
            { header: 'Mã OT', key: 'otId', width: 22, align: 'center' },
            { header: 'Tháng', key: 'month', width: 12, align: 'center' },
            { header: 'Nhân sự', key: 'userName', width: 24, align: 'left' },
            { header: 'Email', key: 'userEmail', width: 30, align: 'left' },
            { header: 'Ngày làm thêm', key: 'otDate', width: 14, align: 'center' },
            { header: 'Giờ bắt đầu', key: 'startTime', width: 14, align: 'center' },
            { header: 'Giờ kết thúc', key: 'endTime', width: 14, align: 'center' },
            { header: 'Số giờ đăng ký', key: 'totalRegHours', width: 16, align: 'center', numFmt: '#,##0.0' },
            { header: 'Nội dung công việc', key: 'content', width: 40, align: 'left' },
            { header: 'Lý do làm thêm', key: 'reason', width: 35, align: 'left' },
            { header: 'Dự án', key: 'project', width: 25, align: 'left' },
            { header: 'Kết quả dự kiến', key: 'expectedResult', width: 30, align: 'left' },
            { header: 'Kết quả thực tế', key: 'actualResult', width: 30, align: 'left' },
            { header: 'Trạng thái duyệt', key: 'approvalStatus', width: 16, align: 'center' },
            { header: 'Số giờ được duyệt', key: 'approvedHours', width: 18, align: 'center', numFmt: '#,##0.0' },
            { header: 'Người duyệt', key: 'approverName', width: 24, align: 'left' },
            { header: 'Ý kiến người duyệt', key: 'approverNote', width: 30, align: 'left' },
          ],
          data: (data.overtimes || []).map((o: any, idx: number) => ({
            stt: idx + 1,
            otId: o.otId,
            month: o.month,
            userName: o.user?.name || o.userId,
            userEmail: o.user?.email || '',
            otDate: o.otDate ? new Date(o.otDate).toLocaleDateString('vi-VN') : '',
            startTime: o.startTime || '',
            endTime: o.endTime || '',
            totalRegHours: Number(o.totalRegHours) || 0,
            content: o.content || '',
            reason: o.reason || '',
            project: o.project || '',
            expectedResult: o.expectedResult || '',
            actualResult: o.actualResult || '',
            approvalStatus: o.approvalStatus || '',
            approvedHours: Number(o.approvedHours) || 0,
            approverName: o.approver?.name || '',
            approverNote: o.approverNote || '',
          }))
        },

        // Sheet 6: Kết quả KPI
        {
          sheetName: '6_Ket_Qua_KPI',
          columns: [
            { header: 'STT', key: 'stt', width: 8, align: 'center' },
            { header: 'Mã KPI', key: 'kpiId', width: 20, align: 'center' },
            { header: 'Tháng', key: 'month', width: 12, align: 'center' },
            { header: 'Nhân sự', key: 'userName', width: 24, align: 'left' },
            { header: 'Email', key: 'userEmail', width: 30, align: 'left' },
            { header: 'Số việc đăng ký', key: 'regWorks', width: 16, align: 'center', numFmt: '#,##0' },
            { header: 'Số việc duyệt', key: 'appWorks', width: 16, align: 'center', numFmt: '#,##0' },
            { header: 'Giờ làm việc', key: 'appHours', width: 16, align: 'center', numFmt: '#,##0.0' },
            { header: 'Điểm quy đổi', key: 'convertedScore', width: 16, align: 'center', numFmt: '#,##0.00' },
            { header: 'Điểm A (Chuyên môn)', key: 'aScore', width: 20, align: 'center', numFmt: '#,##0.00' },
            { header: 'Điểm B1 (Thời gian)', key: 'b1Score', width: 20, align: 'center', numFmt: '#,##0.00' },
            { header: 'Điểm B2 (Làm thêm)', key: 'b2Score', width: 20, align: 'center', numFmt: '#,##0.00' },
            { header: 'Điểm B (Hiệu suất)', key: 'bScore', width: 20, align: 'center', numFmt: '#,##0.00' },
            { header: 'Điểm C (Chấp hành)', key: 'cScore', width: 20, align: 'center', numFmt: '#,##0.00' },
            { header: 'Điểm D (Lãnh đạo)', key: 'dScore', width: 20, align: 'center', numFmt: '#,##0.00' },
            { header: 'TỔNG ĐIỂM KPI', key: 'totalKpi', width: 18, align: 'center', numFmt: '#,##0.00' },
            { header: 'XẾP LOẠI', key: 'rank', width: 14, align: 'center' },
            { header: 'Trạng thái chốt', key: 'lockedStatus', width: 16, align: 'center' },
          ],
          data: (data.kpiResults || []).map((k: any, idx: number) => ({
            stt: idx + 1,
            kpiId: k.kpiId,
            month: k.month,
            userName: k.user?.name || k.userId,
            userEmail: k.user?.email || '',
            regWorks: Number(k.registeredWorks) || 0,
            appWorks: Number(k.approvedWorks) || 0,
            appHours: Number(k.approvedHours) || 0,
            convertedScore: Number(k.convertedScore) || 0,
            aScore: Number(k.aScore) || 0,
            b1Score: Number(k.b1Score) || 0,
            b2Score: Number(k.b2Score) || 0,
            bScore: Number(k.bScore) || 0,
            cScore: Number(k.cScore) || 0,
            dScore: Number(k.dScore) || 0,
            totalKpi: Number(k.totalKpi) || 0,
            rank: k.rank || 'B',
            lockedStatus: k.lockedStatus || 'Chưa chốt',
          }))
        }
      ];

      const fileName = `Backup_He_Thong_KPI_That_${new Date().toISOString().slice(0, 10)}.xlsx`;
      await exportMultiSheetExcel(sheets, fileName);
      setExportMessage(`✅ Đã tải về file sao lưu Excel chuẩn thương hiệu (#1F4E78): ${fileName}`);
    } catch (e) {
      setExportMessage(`❌ Lỗi xuất dữ liệu: ${String(e)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJsonDump = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/sync/backup-data');
      const result = await res.json();
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Snapshot_CloudSQL_KPI_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMessage('✅ Đã tải về bản snapshot dữ liệu JSON hoàn chỉnh.');
    } catch (e) {
      setExportMessage(`❌ Lỗi tải JSON: ${String(e)}`);
    } finally {
      setIsExporting(false);
    }
  };

  // --------------------------------------------------------------------------
  // 3. STANDARD TEMPLATES
  // --------------------------------------------------------------------------
  const handleDownloadFullTemplate = async () => {
    const sheets: MultiSheetConfig[] = [
      // Sheet 1: Mẫu Khai báo công việc
      {
        sheetName: 'KH_Cong_Viec_Ngay',
        isTemplate: true,
        protectHeader: true,
        columns: [
          { header: 'Mã việc', key: 'workId', width: 20, align: 'center' },
          { header: 'Tháng', key: 'month', width: 14, align: 'center' },
          { header: 'Nhân viên', key: 'name', width: 24, align: 'left' },
          { header: 'Email', key: 'email', width: 30, align: 'left' },
          { header: 'Nhóm việc', key: 'group', width: 24, align: 'left' },
          { header: 'Tên công việc', key: 'task', width: 40, align: 'left' },
          { header: 'Mã danh mục', key: 'code', width: 16, align: 'center' },
          { header: 'Chi tiết', key: 'detail', width: 45, align: 'left' },
          { header: 'Ngày bắt đầu', key: 'start', width: 14, align: 'center' },
          { header: 'Hạn chót', key: 'end', width: 14, align: 'center' },
          { header: 'Số giờ', key: 'hours', width: 12, align: 'center', numFmt: '#,##0.0' },
          { header: 'Tính chất', key: 'nature', width: 16, align: 'center' },
          { header: 'Hệ số K', key: 'coef', width: 12, align: 'center', numFmt: '0.00' },
          { header: 'Điểm chuẩn (Đc)', key: 'base', width: 16, align: 'center', numFmt: '#,##0.0' },
          { header: 'Điểm quy đổi (Đqđ)', key: 'score', width: 18, align: 'center', numFmt: '#,##0.00' },
          { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
          { header: 'Loại sản phẩm', key: 'product', width: 20, align: 'left' },
          { header: 'Số lượng SP', key: 'qty', width: 14, align: 'center', numFmt: '#,##0' },
          { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
          { header: 'Dự án', key: 'project', width: 25, align: 'left' },
          { header: 'Minh chứng', key: 'evidence', width: 35, align: 'left' },
          { header: 'Lãnh đạo duyệt', key: 'approval', width: 16, align: 'center' },
          { header: 'Ý kiến lãnh đạo', key: 'note', width: 30, align: 'left' },
        ],
        data: [
          {
            workId: 'W8-2026-001',
            month: '08-2026',
            name: 'Huỳnh Trọng Hiếu',
            email: 'huynhtronghieu260495@gmail.com',
            group: 'Kế hoạch vốn',
            task: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn',
            code: 'KH01',
            detail: 'Rà soát bảng tổng hợp phân bổ kế hoạch vốn đầu tư công năm 2026 cho 5 dự án giao thông trọng điểm.',
            start: '01/08/2026',
            end: '15/08/2026',
            hours: 8,
            nature: 'Trung bình',
            coef: 0.8,
            base: 10,
            score: 8,
            status: 'Hoàn thành',
            product: 'Bảng tổng hợp',
            qty: 1,
            unit: 'Bảng',
            project: 'Kế hoạch vốn 2026',
            evidence: 'https://drive.google.com/sample_doc_1',
            approval: 'Đã duyệt',
            note: 'Đạt yêu cầu',
          },
          {
            workId: 'W8-2026-002',
            month: '08-2026',
            name: 'Đường Thị Ngọc Hà',
            email: 'duongngocha200990@gmail.com',
            group: 'Thanh toán, giải ngân',
            task: 'Lập hồ sơ thanh toán, giải ngân gửi Kho bạc',
            code: 'B2.2',
            detail: 'Hoàn thiện hồ sơ thanh toán khối lượng xây lắp đợt 3 tuyến đường tránh Đông Buôn Ma Thuột.',
            start: '05/08/2026',
            end: '15/08/2026',
            hours: 12,
            nature: 'Phức tạp',
            coef: 1.0,
            base: 12,
            score: 12,
            status: 'Hoàn thành',
            product: 'Hồ sơ thanh toán',
            qty: 2,
            unit: 'Hồ sơ',
            project: 'Đường tránh Đông BMT',
            evidence: 'https://drive.google.com/sample_doc_2',
            approval: 'Đã duyệt',
            note: 'Đã kiểm tra khớp số liệu KBNN',
          }
        ]
      },

      // Sheet 2: Mẫu Danh mục Nhân sự
      {
        sheetName: 'DM_Nhan_Su',
        isTemplate: true,
        protectHeader: true,
        columns: [
          { header: 'Họ và tên', key: 'name', width: 26, align: 'left' },
          { header: 'Email', key: 'email', width: 32, align: 'left' },
          { header: 'Số điện thoại', key: 'phone', width: 16, align: 'center' },
          { header: 'Chức vụ', key: 'position', width: 22, align: 'left' },
          { header: 'Nhóm / Phòng ban', key: 'group', width: 24, align: 'left' },
          { header: 'Vai trò', key: 'role', width: 14, align: 'center' },
        ],
        data: [
          { name: 'Khuất Văn Sơn', email: 'khvanson@gmail.com', phone: '0906234585', position: 'Phó Trưởng phòng', group: 'Ban Lãnh đạo', role: 'ADMIN' },
          { name: 'Nguyễn Thị Hải Hà', email: 'nguyenhaiha.bmt@gmail.com', phone: '0913456789', position: 'Phó phòng', group: 'Ban Lãnh đạo', role: 'LEADER' },
          { name: 'Trần Anh Tuấn', email: 'tuandabmt@gmail.com', phone: '0912345601', position: 'Kế toán trưởng', group: 'Tài chính - Kế toán', role: 'STAFF' },
          { name: 'Huỳnh Trọng Hiếu', email: 'huynhtronghieu260495@gmail.com', phone: '0912345602', position: 'Chuyên viên', group: 'Kế hoạch vốn', role: 'STAFF' },
          { name: 'Đường Thị Ngọc Hà', email: 'duongngocha200990@gmail.com', phone: '0912345603', position: 'Chuyên viên', group: 'Thanh toán, giải ngân', role: 'STAFF' },
        ]
      },

      // Sheet 3: Mẫu Danh mục Chuẩn
      {
        sheetName: 'DM_DanhMuc',
        isTemplate: true,
        protectHeader: true,
        columns: [
          { header: 'Mã', key: 'code', width: 18, align: 'center' },
          { header: 'Tên danh mục', key: 'name', width: 38, align: 'left' },
          { header: 'Loại danh mục', key: 'type', width: 18, align: 'center' },
          { header: 'Nhóm việc', key: 'group', width: 24, align: 'left' },
          { header: 'Điểm chuẩn', key: 'score', width: 14, align: 'center', numFmt: '#,##0.0' },
          { header: 'Tính chất', key: 'nature', width: 16, align: 'center' },
          { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
          { header: 'Thứ tự', key: 'order', width: 10, align: 'center' },
        ],
        data: [
          { code: 'GRP_VON', name: 'Kế hoạch vốn', type: 'TASK_GROUP', group: '', score: '', nature: '', unit: '', order: 1 },
          { code: 'GRP_THANHTOAN', name: 'Thanh toán, giải ngân', type: 'TASK_GROUP', group: '', score: '', nature: '', unit: '', order: 2 },
          { code: 'KH01', name: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn', type: 'TASK', group: 'Kế hoạch vốn', score: 10, nature: 'Trung bình', unit: 'Bảng', order: 3 },
          { code: 'B2.2', name: 'Lập hồ sơ thanh toán, giải ngân gửi Kho bạc', type: 'TASK', group: 'Thanh toán, giải ngân', score: 12, nature: 'Phức tạp', unit: 'Hồ sơ', order: 4 },
          { code: 'PROD_BAOCAO', name: 'Báo cáo', type: 'PRODUCT_TYPE', group: '', score: '', nature: '', unit: 'Báo cáo', order: 5 },
        ]
      },

      // Sheet 4: Mẫu Giao việc
      {
        sheetName: 'Nhiem_Vu_Giao_Viec',
        isTemplate: true,
        protectHeader: true,
        columns: [
          { header: 'Mã giao việc', key: 'code', width: 22, align: 'center' },
          { header: 'Tháng', key: 'month', width: 12, align: 'center' },
          { header: 'Người giao', key: 'assigner', width: 24, align: 'left' },
          { header: 'Người nhận', key: 'receiver', width: 24, align: 'left' },
          { header: 'Nhóm việc', key: 'group', width: 24, align: 'left' },
          { header: 'Tên nhiệm vụ', key: 'task', width: 40, align: 'left' },
          { header: 'Mã chuẩn', key: 'taskCode', width: 14, align: 'center' },
          { header: 'Điểm chuẩn', key: 'score', width: 14, align: 'center', numFmt: '#,##0.0' },
          { header: 'Tính chất', key: 'nature', width: 16, align: 'center' },
          { header: 'Nội dung yêu cầu', key: 'detail', width: 45, align: 'left' },
          { header: 'Hạn chót', key: 'deadline', width: 14, align: 'center' },
          { header: 'Sản phẩm yêu cầu', key: 'product', width: 26, align: 'left' },
          { header: 'Loại sản phẩm', key: 'productType', width: 20, align: 'left' },
          { header: 'Mức độ ưu tiên', key: 'priority', width: 16, align: 'center' },
        ],
        data: [
          {
            code: 'A8-GV-2026-001',
            month: '08-2026',
            assigner: 'Khuất Văn Sơn',
            receiver: 'Huỳnh Trọng Hiếu',
            group: 'Kế hoạch vốn',
            task: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn',
            taskCode: 'KH01',
            score: 10,
            nature: 'Trung bình',
            detail: 'Rà soát bảng tổng hợp phân bổ kế hoạch vốn đầu tư công năm 2026 cho 5 dự án giao thông trọng điểm.',
            deadline: '15/08/2026',
            product: 'Bảng tổng hợp kế hoạch vốn dự án',
            productType: 'Bảng tổng hợp',
            priority: 'Cao',
          }
        ]
      },

      // Sheet 5: Mẫu Làm thêm giờ
      {
        sheetName: 'Dang_Ky_Lam_Them',
        isTemplate: true,
        protectHeader: true,
        columns: [
          { header: 'Mã OT', key: 'code', width: 22, align: 'center' },
          { header: 'Tháng', key: 'month', width: 12, align: 'center' },
          { header: 'Nhân sự', key: 'name', width: 24, align: 'left' },
          { header: 'Ngày làm thêm', key: 'date', width: 14, align: 'center' },
          { header: 'Giờ bắt đầu', key: 'startTime', width: 14, align: 'center' },
          { header: 'Giờ kết thúc', key: 'endTime', width: 14, align: 'center' },
          { header: 'Số giờ đăng ký', key: 'hours', width: 16, align: 'center', numFmt: '#,##0.0' },
          { header: 'Nội dung công việc', key: 'content', width: 40, align: 'left' },
          { header: 'Lý do làm thêm', key: 'reason', width: 35, align: 'left' },
          { header: 'Dự án', key: 'project', width: 25, align: 'left' },
          { header: 'Kết quả dự kiến', key: 'expected', width: 30, align: 'left' },
          { header: 'Trạng thái duyệt', key: 'status', width: 16, align: 'center' },
          { header: 'Số giờ được duyệt', key: 'approvedHours', width: 18, align: 'center', numFmt: '#,##0.0' },
        ],
        data: [
          {
            code: 'OT-2026-08-001',
            month: '08-2026',
            name: 'Huỳnh Trọng Hiếu',
            date: '11/08/2026',
            startTime: '17:00',
            endTime: '20:30',
            hours: 3.5,
            content: 'Tổng hợp số liệu điều chỉnh kế hoạch vốn đợt 3 trình UBND tỉnh',
            reason: 'Hồ sơ gấp theo chỉ đạo hỏa tốc của UBND tỉnh phục vụ phiên họp thường kỳ',
            project: 'Kế hoạch vốn đầu tư công năm 2026',
            expected: 'Dự thảo Tờ trình và Bảng tổng hợp chi tiết',
            status: 'Đã duyệt',
            approvedHours: 3.5,
          }
        ]
      }
    ];

    await exportMultiSheetExcel(sheets, 'Mau_Chuan_Dong_Bo_Du_Lieu_KPI_V8.xlsx');
  };

  const handleDownloadSingleTemplate = async (templateKey: 'task_groups' | 'product_types' | 'categories' | 'users' | 'works' | 'assignments' | 'overtimes') => {
    if (templateKey === 'task_groups') {
      const cols: ExportColumn[] = [
        { header: 'Mã nhóm', key: 'code', width: 18, align: 'center' },
        { header: 'Tên nhóm công việc', key: 'name', width: 38, align: 'left' },
        { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
        { header: 'Ghi chú mô tả', key: 'note', width: 35, align: 'left' },
      ];
      const sample = [
        { code: 'GRP_VON', name: 'Kế hoạch vốn', order: 1, note: 'Theo dõi, phân bổ kế hoạch vốn đầu tư công' },
        { code: 'GRP_THANHTOAN', name: 'Thanh toán, giải ngân', order: 2, note: 'Hồ sơ thanh toán, kiểm soát chi Kho bạc' },
        { code: 'GRP_DUDAN', name: 'Quyết toán dự án', order: 3, note: 'Quyết toán vốn đầu tư công dự án hoàn thành' },
      ];
      await downloadStyledTemplate(sample, cols, 'Mau_Chuan_Nhom_Cong_Viec.xlsx', 'Nhom_Cong_Viec');
    } else if (templateKey === 'product_types') {
      const cols: ExportColumn[] = [
        { header: 'Mã loại SP', key: 'code', width: 18, align: 'center' },
        { header: 'Tên loại sản phẩm', key: 'name', width: 38, align: 'left' },
        { header: 'Đơn vị tính (ĐVT)', key: 'unit', width: 18, align: 'center' },
        { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
      ];
      const sample = [
        { code: 'PROD_BAOCAO', name: 'Báo cáo', unit: 'Báo cáo', order: 1 },
        { code: 'PROD_TOTRINH', name: 'Tờ trình', unit: 'Tờ trình', order: 2 },
        { code: 'PROD_HOSO', name: 'Hồ sơ thanh toán', unit: 'Bộ hồ sơ', order: 3 },
        { code: 'PROD_VANBAN', name: 'Văn bản hướng dẫn / công văn', unit: 'Văn bản', order: 4 },
        { code: 'PROD_BANGTONGHOP', name: 'Bảng tổng hợp', unit: 'Bảng', order: 5 },
      ];
      await downloadStyledTemplate(sample, cols, 'Mau_Chuan_Loai_San_Pham_DVT.xlsx', 'Loai_San_Pham');
    } else if (templateKey === 'categories') {
      const cols: ExportColumn[] = [
        { header: 'Mã chuẩn', key: 'code', width: 16, align: 'center' },
        { header: 'Tên danh mục công việc', key: 'name', width: 42, align: 'left' },
        { header: 'Nhóm công việc', key: 'taskGroup', width: 26, align: 'left' },
        { header: 'Điểm chuẩn (Đc)', key: 'score', width: 16, align: 'center', numFmt: '#,##0.0' },
        { header: 'Tính chất mặc định', key: 'nature', width: 18, align: 'center' },
        { header: 'Loại sản phẩm', key: 'productType', width: 22, align: 'left' },
        { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
        { header: 'Thứ tự', key: 'order', width: 10, align: 'center' },
      ];
      const sample = [
        { code: 'KH01', name: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn', taskGroup: 'Kế hoạch vốn', score: 10, nature: 'Trung bình', productType: 'Bảng tổng hợp', unit: 'Bảng', order: 1 },
        { code: 'B2.2', name: 'Lập hồ sơ thanh toán, giải ngân gửi Kho bạc', taskGroup: 'Thanh toán, giải ngân', score: 12, nature: 'Phức tạp', productType: 'Hồ sơ thanh toán', unit: 'Hồ sơ', order: 2 },
        { code: 'QT01', name: 'Thẩm tra quyết toán dự án hoàn thành', taskGroup: 'Quyết toán dự án', score: 15, nature: 'Rất phức tạp', productType: 'Báo cáo kết quả thẩm tra', unit: 'Báo cáo', order: 3 },
      ];
      await downloadStyledTemplate(sample, cols, 'Mau_Chuan_Danh_Muc_Cong_Viec.xlsx', 'DanhMuc_CongViec');
    } else if (templateKey === 'users') {
      const cols: ExportColumn[] = [
        { header: 'Họ và tên', key: 'name', width: 24, align: 'left' },
        { header: 'Email Google', key: 'email', width: 30, align: 'left' },
        { header: 'Số điện thoại', key: 'phone', width: 16, align: 'center' },
        { header: 'Zalo', key: 'zalo', width: 16, align: 'center' },
        { header: 'Chức vụ', key: 'position', width: 20, align: 'left' },
        { header: 'Nhóm / Phòng ban', key: 'group', width: 24, align: 'left' },
        { header: 'Vai trò (STAFF/LEADER/ADMIN)', key: 'role', width: 22, align: 'center' },
      ];
      const sample = [
        { name: 'Khuất Văn Sơn', email: 'khvanson@gmail.com', phone: '0906234585', zalo: '0906234585', position: 'Phó Trưởng phòng', group: 'Ban Lãnh đạo', role: 'ADMIN' },
        { name: 'Huỳnh Trọng Hiếu', email: 'huynhtronghieu260495@gmail.com', phone: '0912345602', zalo: '0912345602', position: 'Chuyên viên', group: 'Kế hoạch vốn', role: 'STAFF' },
      ];
      await downloadStyledTemplate(sample, cols, 'Mau_Chuan_Danh_Sach_Nhan_Su.xlsx', 'Nhan_Su');
    } else if (templateKey === 'works') {
      const cols: ExportColumn[] = [
        { header: 'Mã việc', key: 'code', width: 20, align: 'center' },
        { header: 'Tháng', key: 'month', width: 12, align: 'center' },
        { header: 'Nhân viên', key: 'name', width: 24, align: 'left' },
        { header: 'Nhóm việc', key: 'group', width: 24, align: 'left' },
        { header: 'Tên công việc', key: 'task', width: 40, align: 'left' },
        { header: 'Mã chuẩn', key: 'taskCode', width: 14, align: 'center' },
        { header: 'Nội dung chi tiết', key: 'detail', width: 45, align: 'left' },
        { header: 'Ngày bắt đầu', key: 'startDate', width: 14, align: 'center' },
        { header: 'Hạn chót', key: 'endDate', width: 14, align: 'center' },
        { header: 'Số giờ', key: 'hours', width: 12, align: 'center', numFmt: '#,##0.0' },
        { header: 'Tính chất đề xuất', key: 'nature', width: 18, align: 'center' },
        { header: 'Hệ số K', key: 'coef', width: 12, align: 'center', numFmt: '0.00' },
        { header: 'Điểm chuẩn', key: 'baseScore', width: 14, align: 'center', numFmt: '#,##0.0' },
        { header: 'Điểm quy đổi', key: 'convertedScore', width: 16, align: 'center', numFmt: '#,##0.00' },
        { header: 'Loại sản phẩm', key: 'productType', width: 20, align: 'left' },
        { header: 'Số lượng SP', key: 'productQty', width: 14, align: 'center', numFmt: '#,##0' },
        { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
        { header: 'Dự án', key: 'project', width: 26, align: 'left' },
        { header: 'Minh chứng', key: 'evidence', width: 35, align: 'left' },
      ];
      const sample = [
        {
          code: 'CV-2026-08-001',
          month: '08-2026',
          name: 'Huỳnh Trọng Hiếu',
          group: 'Kế hoạch vốn',
          task: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn',
          taskCode: 'KH01',
          detail: 'Rà soát kế hoạch vốn 5 dự án giao thông trọng điểm',
          startDate: '01/08/2026',
          endDate: '15/08/2026',
          hours: 8,
          nature: 'Trung bình',
          coef: 0.8,
          baseScore: 10,
          convertedScore: 8,
          productType: 'Bảng tổng hợp',
          productQty: 1,
          unit: 'Bảng',
          project: 'Đường vành đai phía Tây',
          evidence: 'Link Drive / Báo cáo nội bộ',
        }
      ];
      await downloadStyledTemplate(sample, cols, 'Mau_Chuan_Khai_Bao_Cong_Viec.xlsx', 'KH_CongViec');
    }
  };

  const isConfirmed = confirmCode.trim().toUpperCase() === 'XACNHAN' || confirmCode.trim().toUpperCase() === 'CONFIRM';

  // --------------------------------------------------------------------------
  // 4. RESET & INITIALIZATION LOGIC
  // --------------------------------------------------------------------------
  const handleExecuteReset = async () => {
    const cleanCode = confirmCode.trim().toUpperCase();
    if (cleanCode !== 'XACNHAN' && cleanCode !== 'CONFIRM') {
      setResetResult({ 
        success: false, 
        message: 'Vui lòng nhập chính xác mã xác nhận "XACNHAN" vào ô bên dưới để thực hiện thao tác này.' 
      });
      return;
    }

    setIsResetting(true);
    setResetResult(null);

    try {
      const res = await fetch('/api/sync/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: resetAction,
          confirmation: 'XACNHAN',
          month: resetMonth,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi xử lý làm mới dữ liệu');
      }

      setResetResult({ success: true, message: data.message });
      setConfirmCode('');
      fetchOverview();
    } catch (err) {
      setResetResult({ success: false, message: String(err) });
    } finally {
      setIsResetting(false);
    }
  };

  const activeSheet = workbookSheets[activeSheetIndex];

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Quản trị & Đồng bộ Dữ liệu Thực tế</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Chuẩn hóa, nhập tệp Excel, sao lưu toàn bộ và quản trị vòng đời cơ sở dữ liệu Cloud SQL
              </p>
            </div>
          </div>
        </div>

        {/* Database Status Pill */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <div className="text-xs">
            <div className="font-bold text-emerald-900">Cơ sở dữ liệu: PostgreSQL Thật 100%</div>
            <div className="text-emerald-700">
              {dbOverview ? `${dbOverview.stats.users} Nhân sự | ${dbOverview.stats.works} Công việc | ${dbOverview.stats.categories} Danh mục` : 'Đang kết nối...'}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100/80 p-1.5 rounded-xl">
        <button
          onClick={() => setActiveTab('import')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'import'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Upload className="w-4 h-4" />
          Nhập dữ liệu từ Excel (.xlsx)
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'backup'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Download className="w-4 h-4" />
          Sao lưu & Tải dữ liệu thật
        </button>

        <button
          onClick={() => setActiveTab('template')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'template'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Tải file mẫu chuẩn hóa
        </button>

        <button
          onClick={() => setActiveTab('reset')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'reset'
              ? 'bg-white text-rose-700 shadow-sm'
              : 'text-slate-600 hover:text-rose-600 hover:bg-white/50'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          Xóa làm mới & Chuẩn hóa
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: IMPORT FROM EXCEL */}
      {/* ========================================================================= */}
      {activeTab === 'import' && (
        <div className="flex flex-col gap-6">
          {/* Database Month Distribution Bar if exists */}
          {dbOverview?.monthsDistribution && Object.keys(dbOverview.monthsDistribution).length > 0 && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Database className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Dữ liệu thực tế đang lưu trong Cloud SQL theo kỳ:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(dbOverview.monthsDistribution).map(([m, stats]: [string, any]) => (
                  <span key={m} className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-800">
                    <strong className="text-blue-700">{m}</strong>: {stats.works} việc, {stats.assignments} GV, {stats.overtimes} OT
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top Config Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Upload & Month Settings Box */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-5">
              <div>
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-600" />
                  1. Chọn file Excel cần đồng bộ
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Hệ thống tự động nhận diện và bóc tách nhiều sheet (Nhân sự, Công việc, Danh mục, Giao việc, Làm thêm)
                </p>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50 rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-2 shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div className="font-bold text-slate-800 text-sm">
                  {selectedFile ? selectedFile.name : 'Bấm vào đây để tải file lên'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : 'Hỗ trợ định dạng .xlsx, .xls, .csv'}
                </div>
              </div>

              {/* Multi-Month Sync Mode Controls */}
              <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    Chế độ đồng bộ kỳ/tháng:
                  </label>
                  <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {monthSyncMode === 'ALL' ? 'Tất cả các tháng' : monthSyncMode === 'SELECTED' ? `${selectedMonthsList.length} tháng được chọn` : 'Ghi đè 1 tháng'}
                  </span>
                </div>

                {/* 3 Mode Radio Buttons */}
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setMonthSyncMode('ALL')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                      monthSyncMode === 'ALL'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center ${monthSyncMode === 'ALL' ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'}`}>
                      {monthSyncMode === 'ALL' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs">🌐 Đồng bộ TẤT CẢ các tháng (Khuyên dùng)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Tự động nhận diện kỳ tháng từng dòng trong file Excel (theo cột Tháng hoặc Ngày bắt đầu).
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMonthSyncMode('SELECTED')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                      monthSyncMode === 'SELECTED'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center ${monthSyncMode === 'SELECTED' ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'}`}>
                      {monthSyncMode === 'SELECTED' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs">🎯 Chọn các tháng cụ thể để đồng bộ</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Chỉ nạp các bản ghi thuộc các tháng được tích chọn bên dưới, bỏ qua các tháng khác.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMonthSyncMode('OVERRIDE')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                      monthSyncMode === 'OVERRIDE'
                        ? 'border-amber-600 bg-amber-50/70 text-amber-950 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center ${monthSyncMode === 'OVERRIDE' ? 'border-amber-600 bg-amber-600' : 'border-slate-300 bg-white'}`}>
                      {monthSyncMode === 'OVERRIDE' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs">⚡ Ghi đè toàn bộ sang 1 tháng chỉ định</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Ép tất cả công việc/giao việc/làm thêm trong file về cùng 1 kỳ tháng duy nhất.
                      </div>
                    </div>
                  </button>
                </div>

                {/* Sub-panel for SELECTED mode */}
                {monthSyncMode === 'SELECTED' && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Danh sách kỳ tháng lựa chọn:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllMonths}
                          className="text-[11px] text-blue-600 font-bold hover:underline"
                        >
                          Chọn tất cả
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={handleDeselectAllMonths}
                          className="text-[11px] text-rose-600 font-bold hover:underline"
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    </div>

                    {/* Checkboxes list */}
                    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                      {Array.from(new Set([...Object.keys(detectedMonthsMap), ...STANDARD_MONTHS])).map((m) => {
                        const isChecked = selectedMonthsList.includes(m);
                        const rowCount = detectedMonthsMap[m];
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handleToggleMonth(m)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                              isChecked
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {isChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 opacity-40" />}
                            <span>{m}</span>
                            {rowCount !== undefined && (
                              <span className={`px-1.5 py-0.2 rounded text-[10px] ${isChecked ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>
                                {rowCount} dòng
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Add Custom Month */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                      <input
                        type="text"
                        value={customAddMonth}
                        onChange={(e) => setCustomAddMonth(e.target.value)}
                        placeholder="Thêm kỳ khác (vd: 09-2026)"
                        className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg flex-1 outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomMonth}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold"
                      >
                        + Thêm
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-panel for OVERRIDE mode */}
                {monthSyncMode === 'OVERRIDE' && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-amber-900">Kỳ tháng muốn ghi đè:</label>
                    <input
                      type="text"
                      value={overrideMonth}
                      onChange={(e) => setOverrideMonth(e.target.value)}
                      placeholder="08-2026"
                      className="px-3 py-1.5 text-xs font-bold bg-white border border-amber-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                onClick={handleExecuteImport}
                disabled={workbookSheets.length === 0 || importStatus === 'syncing'}
                className={`w-full py-3.5 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                  workbookSheets.length > 0 && importStatus !== 'syncing'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                {importStatus === 'syncing' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Đang đồng bộ vào Database...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    {monthSyncMode === 'ALL'
                      ? 'Đồng bộ TẤT CẢ các tháng vào Database'
                      : monthSyncMode === 'SELECTED'
                      ? `Đồng bộ ${selectedMonthsList.length} tháng được chọn`
                      : `Ghi đè toàn bộ sang tháng ${overrideMonth}`}
                  </>
                )}
              </button>
            </div>

            {/* Sync Progress & Logs */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                    <Server className="w-5 h-5 text-slate-700" />
                    2. Tiến trình xử lý & Nhật ký hệ thống
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Tự động chuẩn hóa, ghi vào Cloud SQL PostgreSQL và tự động tính lại KPI các tháng bị ảnh hưởng</p>
                </div>
                {importStatus === 'success' && (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Hoàn tất thành công
                  </span>
                )}
              </div>

              {/* Console log box */}
              <div className="h-[280px] bg-slate-950 text-emerald-400 font-mono text-xs p-4 rounded-xl overflow-y-auto custom-scrollbar flex flex-col gap-1 border border-slate-800">
                {syncLogs.length === 0 ? (
                  <div className="text-slate-500 italic">Chưa có tiến trình nào. Vui lòng chọn file Excel để bắt đầu...</div>
                ) : (
                  syncLogs.map((log, idx) => <div key={idx}>{log}</div>)
                )}
              </div>

              {/* Result Summary Pills */}
              {syncSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
                    <div className="text-xs text-blue-700 font-bold">Nhân sự</div>
                    <div className="text-lg font-black text-blue-900 mt-0.5">{syncSummary.users.success}</div>
                    {syncSummary.users.skipped > 0 && <div className="text-[10px] text-slate-500">Bỏ qua: {syncSummary.users.skipped}</div>}
                  </div>
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
                    <div className="text-xs text-indigo-700 font-bold">Danh mục</div>
                    <div className="text-lg font-black text-indigo-900 mt-0.5">{syncSummary.categories.success}</div>
                  </div>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                    <div className="text-xs text-emerald-700 font-bold">Công việc</div>
                    <div className="text-lg font-black text-emerald-900 mt-0.5">{syncSummary.works.success}</div>
                    {syncSummary.works.skipped > 0 && <div className="text-[10px] text-slate-500">Bỏ qua: {syncSummary.works.skipped}</div>}
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                    <div className="text-xs text-amber-700 font-bold">Giao việc</div>
                    <div className="text-lg font-black text-amber-900 mt-0.5">{syncSummary.assignments.success}</div>
                    {syncSummary.assignments.skipped > 0 && <div className="text-[10px] text-slate-500">Bỏ qua: {syncSummary.assignments.skipped}</div>}
                  </div>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-center">
                    <div className="text-xs text-purple-700 font-bold">Làm thêm (OT)</div>
                    <div className="text-lg font-black text-purple-900 mt-0.5">{syncSummary.overtimes.success}</div>
                    {syncSummary.overtimes.skipped > 0 && <div className="text-[10px] text-slate-500">Bỏ qua: {syncSummary.overtimes.skipped}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sheet Preview Tabs & Table */}
          {workbookSheets.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Các sheet phát hiện:</span>
                  {workbookSheets.map((s, idx) => {
                    const isWorks = s.detectedType === 'works';
                    const isUnknown = s.detectedType === 'unknown';
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveSheetIndex(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                          activeSheetIndex === idx
                            ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                            : isUnknown
                            ? 'bg-slate-100 text-slate-500 border border-dashed border-slate-300 hover:bg-slate-200'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span>{s.name}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                          activeSheetIndex === idx 
                            ? 'bg-white/20 text-white' 
                            : isUnknown 
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {getTypeLabel(s.detectedType)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activeSheet && (
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                    <span>Loại sheet:</span>
                    <select
                      value={activeSheet.detectedType}
                      onChange={(e) => {
                        const newType = e.target.value as any;
                        setWorkbookSheets(prev => prev.map((s, i) => i === activeSheetIndex ? { ...s, detectedType: newType } : s));
                        addLog(`Đã đổi phân loại sheet "${activeSheet.name}" thành: ${getTypeLabel(newType)}`);
                      }}
                      className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="works">Kế hoạch công việc (KH_CV)</option>
                      <option value="overtimes">Làm thêm ngoài giờ (OT)</option>
                      <option value="assignments">Giao việc lãnh đạo</option>
                      <option value="users">Danh sách nhân sự</option>
                      <option value="categories">Danh mục công việc chuẩn</option>
                      <option value="task_groups">Nhóm công việc</option>
                      <option value="product_types">Loại sản phẩm & ĐVT</option>
                      <option value="unknown">Bỏ qua (Trang tổng hợp / Cảnh báo / Khác)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Table Preview */}
              {activeSheet && (
                <div className="overflow-x-auto max-h-[420px] custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs min-w-max">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                      <tr className="border-b border-slate-200 text-slate-700 font-bold">
                        <th className="p-3 border-r border-slate-200 w-12 text-center">STT</th>
                        {activeSheet.headers.map((h, i) => (
                          <th key={i} className="p-3 border-r border-slate-200 last:border-0 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSheet.rows.slice(0, 50).map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50/80">
                          <td className="p-2.5 border-r border-slate-100 text-center font-mono text-slate-400">
                            {rIdx + 1}
                          </td>
                          {activeSheet.headers.map((h, cIdx) => {
                            const val = row[h];
                            return (
                              <td key={cIdx} className="p-2.5 border-r border-slate-100 last:border-0 text-slate-800 max-w-[320px] truncate">
                                {val instanceof Date ? val.toLocaleDateString('vi-VN') : String(val ?? '')}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeSheet && activeSheet.rows.length > 50 && (
                <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500 font-medium">
                  Đang hiển thị 50 dòng đầu tiên trên tổng số {activeSheet.rows.length} dòng dữ liệu của trang tính này.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BACKUP & EXPORT REAL DATA */}
      {/* ========================================================================= */}
      {activeTab === 'backup' && (
        <div className="flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-600" />
                Sao lưu & Tải dữ liệu thật từ Cơ sở dữ liệu Cloud SQL
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Xuất toàn bộ hoặc tải riêng từng bảng dữ liệu thực tế thành tệp Excel định dạng chuẩn thương hiệu (#1F4E78, khóa tiêu đề, co giãn cột tự động).
              </p>
            </div>

            {exportMessage && (
              <div className="p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-sm font-medium">
                {exportMessage}
              </div>
            )}

            {/* Master Downloads */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Multi-sheet Excel Backup */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white flex flex-col justify-between gap-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">Bản sao lưu Excel Toàn diện 6-in-1 (.xlsx)</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Bao gồm đầy đủ 6 Sheet: Nhân sự, Danh mục, Khai báo công việc, Giao việc, Làm thêm giờ và Kết quả đánh giá KPI.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleExportFullExcel}
                  disabled={isExporting}
                  className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Tải về Toàn bộ Dữ liệu (1 File Tổng hợp)
                </button>
              </div>

              {/* Card 2: JSON Snapshot Dump */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white flex flex-col justify-between gap-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/20">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">Bản Snapshot Hệ thống JSON (.json)</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Tệp dữ liệu gốc dạng JSON cấu trúc cao cấp dành cho phục hồi thảm họa, chuyển giao hoặc lưu trữ kỹ thuật.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleExportJsonDump}
                  disabled={isExporting}
                  className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20 transition-all"
                >
                  <FileDown className="w-4 h-4" />
                  Tải về Snapshot JSON
                </button>
              </div>
            </div>

            {/* Granular Individual Real Data Exports */}
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  Tải về file Excel riêng từng bảng dữ liệu thực tế:
                </h3>
                <span className="text-xs text-slate-500 font-medium">Định dạng Navy #1F4E78 chuẩn hóa</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Export 1: Nhom cong viec */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-400 flex flex-col justify-between gap-3 shadow-xs">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                      <Layers className="w-4 h-4 text-blue-600" />
                      Nhóm công việc
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Bảng phân loại nhóm công việc phòng ban (Kế hoạch vốn, Giải ngân, Quyết toán...)
                    </p>
                  </div>
                  <button
                    onClick={() => handleExportSingleRealData('task_groups')}
                    disabled={isExporting}
                    className="py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải riêng Nhóm việc (.xlsx)
                  </button>
                </div>

                {/* Export 2: Loai san pham */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-400 flex flex-col justify-between gap-3 shadow-xs">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                      <Briefcase className="w-4 h-4 text-indigo-600" />
                      Loại sản phẩm & ĐVT
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Danh mục loại sản phẩm giao nộp (Báo cáo, Tờ trình, Hồ sơ...) kèm Đơn vị tính
                    </p>
                  </div>
                  <button
                    onClick={() => handleExportSingleRealData('product_types')}
                    disabled={isExporting}
                    className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải riêng Loại SP (.xlsx)
                  </button>
                </div>

                {/* Export 3: Danh muc chuan */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 flex flex-col justify-between gap-3 shadow-xs">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                      <Award className="w-4 h-4 text-emerald-600" />
                      Danh mục chuẩn & Điểm
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Danh mục công việc chuẩn ban hành kèm điểm chuẩn (Đc), tính chất, ĐVT
                    </p>
                  </div>
                  <button
                    onClick={() => handleExportSingleRealData('categories')}
                    disabled={isExporting}
                    className="py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải riêng Danh mục (.xlsx)
                  </button>
                </div>

                {/* Export 4: Nhan su */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-amber-400 flex flex-col justify-between gap-3 shadow-xs">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                      <Users className="w-4 h-4 text-amber-600" />
                      Danh sách Nhân sự
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Toàn bộ tài khoản nhân sự, chức vụ, email Google, số Zalo, nhóm công tác
                    </p>
                  </div>
                  <button
                    onClick={() => handleExportSingleRealData('users')}
                    disabled={isExporting}
                    className="py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải riêng Nhân sự (.xlsx)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: STANDARD TEMPLATES */}
      {/* ========================================================================= */}
      {activeTab === 'template' && (
        <div className="flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  Tải File Mẫu Chuẩn hóa Dữ liệu Hệ thống
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Được thiết kế chuyên nghiệp chuẩn thương hiệu (#1F4E78, khóa tiêu đề, co giãn cột tự động). Bạn có thể tải gói 5-in-1 hoặc tải riêng từng bảng để nạp độc lập.
                </p>
              </div>

              <button
                onClick={handleDownloadFullTemplate}
                className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all self-start md:self-auto"
              >
                <Download className="w-4 h-4" />
                Tải Bộ File Mẫu Toàn Diện (Gói 5-in-1)
              </button>
            </div>

            {/* Individual Standard Templates */}
            <div className="flex flex-col gap-3 pt-2">
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Tải file mẫu riêng từng phân hệ danh mục & dữ liệu:
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {/* 1. Nhom cong viec */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50/40 hover:border-blue-300 transition-all flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                      <Layers className="w-4 h-4 text-blue-600" />
                      1. Mẫu Nhóm công việc
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Mã nhóm, Tên nhóm công việc, Thứ tự hiển thị, Ghi chú mô tả.
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadSingleTemplate('task_groups')}
                    className="py-2 px-3 bg-white hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải mẫu Nhóm việc
                  </button>
                </div>

                {/* 2. Loai san pham */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50/40 hover:border-indigo-300 transition-all flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                      <Briefcase className="w-4 h-4 text-indigo-600" />
                      2. Mẫu Loại SP & ĐVT
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Mã loại sản phẩm, Tên loại sản phẩm, Đơn vị tính (ĐVT), Thứ tự.
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadSingleTemplate('product_types')}
                    className="py-2 px-3 bg-white hover:bg-indigo-600 hover:text-white text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải mẫu Loại SP
                  </button>
                </div>

                {/* 3. Danh muc cong viec */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50/40 hover:border-emerald-300 transition-all flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                      <Award className="w-4 h-4 text-emerald-600" />
                      3. Mẫu Danh mục chuẩn
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Mã chuẩn, Tên việc chuẩn, Nhóm việc, Điểm chuẩn (Đc), Tính chất, Loại SP.
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadSingleTemplate('categories')}
                    className="py-2 px-3 bg-white hover:bg-emerald-600 hover:text-white text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải mẫu Danh mục
                  </button>
                </div>

                {/* 4. Nhan su */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50/40 hover:border-amber-300 transition-all flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                      <Users className="w-4 h-4 text-amber-600" />
                      4. Mẫu Danh sách Nhân sự
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Họ tên, Email Google, Điện thoại, Zalo, Chức vụ, Nhóm, Vai trò.
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadSingleTemplate('users')}
                    className="py-2 px-3 bg-white hover:bg-amber-600 hover:text-white text-amber-700 border border-amber-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải mẫu Nhân sự
                  </button>
                </div>

                {/* 5. Khai bao cong viec */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-purple-50/40 hover:border-purple-300 transition-all flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                      <Briefcase className="w-4 h-4 text-purple-600" />
                      5. Mẫu Kế hoạch việc
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Mã việc, Tháng, Nhân viên, Nhóm, Tên việc, Điểm chuẩn, Hệ số K...
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadSingleTemplate('works')}
                    className="py-2 px-3 bg-white hover:bg-purple-600 hover:text-white text-purple-700 border border-purple-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải mẫu Công việc
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: RESET & INITIALIZATION */}
      {/* ========================================================================= */}
      {activeTab === 'reset' && (
        <div className="flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-sm flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-rose-950">Vùng Quản trị Nâng cao: Xóa làm mới & Chuẩn hóa dữ liệu</h2>
                <p className="text-sm text-rose-700/80 mt-1">
                  Chức năng này cho phép Quản trị viên xóa làm mới dữ liệu phát sinh trước khi phát hành chính thức hoặc chuẩn hóa lại danh sách 19 nhân sự và danh mục gốc.
                </p>
              </div>
            </div>

            {resetResult && (
              <div className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
                resetResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-rose-50 border border-rose-200 text-rose-900'
              }`}>
                {resetResult.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
                {resetResult.message}
              </div>
            )}

            {/* Reset options */}
            <div className="flex flex-col gap-4">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Chọn hành động làm mới:</label>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  onClick={() => setResetAction('reset_month')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    resetAction === 'reset_month'
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="font-bold text-sm text-slate-800">1. Xóa dữ liệu phát sinh theo Tháng</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Xóa sạch công việc, giao việc, làm thêm và KPI của kỳ tháng được chọn. Giữ nguyên Nhân sự và Danh mục.
                  </div>
                  {resetAction === 'reset_month' && (
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <label className="text-[11px] font-bold text-blue-900">Nhập tháng cần xóa:</label>
                      <input
                        type="text"
                        value={resetMonth}
                        onChange={(e) => setResetMonth(e.target.value)}
                        placeholder="08-2026"
                        className="mt-1 w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold"
                      />
                    </div>
                  )}
                </div>

                <div
                  onClick={() => setResetAction('reset_all_works')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    resetAction === 'reset_all_works'
                      ? 'border-rose-600 bg-rose-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="font-bold text-sm text-slate-800">2. Làm mới toàn bộ dữ liệu phát sinh</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Xóa tất cả bản ghi công việc, giao việc, làm thêm qua các tháng để bắt đầu chạy thực tế từ đầu (Clean Slate).
                  </div>
                </div>

                <div
                  onClick={() => setResetAction('reseed_official')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    resetAction === 'reseed_official'
                      ? 'border-emerald-600 bg-emerald-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="font-bold text-sm text-slate-800">3. Khôi phục Chuẩn 19 Nhân sự & Danh mục</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Chuẩn hóa lại 19 tài khoản chính thức, quyền Admin Khuất Văn Sơn và bộ danh mục gốc ban hành.
                  </div>
                </div>
              </div>
            </div>

            {/* Confirmation Box */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5 w-full md:w-auto">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs font-bold text-slate-700">
                    Mã xác nhận bảo vệ:
                  </label>
                  <button
                    type="button"
                    onClick={() => setConfirmCode('XACNHAN')}
                    className="text-[11px] px-2 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-700 font-mono font-black rounded border border-rose-300 transition-colors flex items-center gap-1"
                    title="Bấm vào đây để điền nhanh mã xác nhận"
                  >
                    <span>XACNHAN</span>
                    <span className="text-[10px] font-sans font-normal opacity-80">(Bấm để điền)</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    placeholder="Nhập hoặc bấm XACNHAN"
                    className={`px-3 py-2 border rounded-xl text-sm font-mono uppercase focus:ring-2 outline-none w-full md:w-64 transition-all ${
                      isConfirmed
                        ? 'border-emerald-500 bg-emerald-50/40 text-emerald-900 ring-2 ring-emerald-200'
                        : 'border-slate-300 bg-white text-slate-900 focus:ring-rose-500'
                    }`}
                  />
                  {isConfirmed ? (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-4 h-4" /> Đã mở khóa
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 shrink-0">
                      (Chưa mở khóa)
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={handleExecuteReset}
                disabled={!isConfirmed || isResetting}
                className={`py-3.5 px-6 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all w-full md:w-auto shrink-0 ${
                  isConfirmed && !isResetting
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/30 active:scale-95 cursor-pointer ring-2 ring-rose-400'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Đang xử lý...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> Thực hiện Làm mới & Chuẩn hóa
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
