import React, { useState, useEffect } from 'react';
import { 
  Download, Upload, FileDown, Settings, Plus, Edit2, Trash2, 
  Check, X, AlertCircle, Sliders, Building2, Search, Filter, 
  Layers, CheckCircle2, RefreshCw, FolderTree, Package, Sparkles,
  FileSpreadsheet, Database, Archive, RotateCcw, ShieldCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { WORK_NATURE_COEFS } from '../utils';
import { 
  exportStyledExcel, 
  exportMultiSheetExcel, 
  downloadStyledTemplate, 
  ExportColumn, 
  MultiSheetConfig 
} from '../excelUtils';
import KpiConfigSettings from '../components/KpiConfigSettings';
import OrgConfigSettings from '../components/OrgConfigSettings';

export default function AdminSettings() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ORG_CONFIG' | 'KPI_CONFIG' | 'TASK' | 'TASK_GROUP' | 'PRODUCT_TYPE'>('TASK');
  
  const [isEditing, setIsEditing] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState('ALL');
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Quick Category Backup / Restore state
  const [backingUpCat, setBackingUpCat] = useState(false);
  const [restoringCat, setRestoringCat] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const showNotice = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (e) {
      console.error('Error fetching categories:', e);
    } finally {
      setLoading(false);
    }
  };

  const taskGroups = categories.filter(c => c.type === 'TASK_GROUP');
  const productTypes = categories.filter(c => c.type === 'PRODUCT_TYPE');
  const tasks = categories.filter(c => c.type === 'TASK');

  const handleEdit = (cat: any) => {
    setIsEditing(cat.id);
    setFormData({
      code: cat.code,
      name: cat.name,
      status: cat.status || 'Đang dùng',
      order: cat.order || 0,
      properties: cat.properties || {}
    });
  };

  // --------------------------------------------------------------------------
  // JSON BACKUP & RESTORE FOR CATEGORIES
  // --------------------------------------------------------------------------
  const handleExportCategoryJson = () => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const dataToSave = {
        version: '2.0',
        type: 'CATEGORIES_BACKUP',
        exportedAt: new Date().toISOString(),
        counts: {
          tasks: tasks.length,
          taskGroups: taskGroups.length,
          productTypes: productTypes.length,
          total: categories.length
        },
        data: categories
      };

      const jsonStr = JSON.stringify(dataToSave, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Sao_Luu_Toan_Bo_Danh_Muc_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showNotice('success', `Đã xuất file JSON sao lưu độc lập chứa ${categories.length} bản ghi danh mục!`);
    } catch (e: any) {
      showNotice('error', `Lỗi xuất file sao lưu JSON: ${e?.message || String(e)}`);
    }
  };

  const handleImportCategoryJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Bạn có chắc chắn muốn nạp/khôi phục toàn bộ Danh mục từ file JSON này? Dữ liệu danh mục sẽ được cập nhật đồng bộ.')) {
      e.target.value = '';
      return;
    }

    setRestoringCat(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const listToImport = Array.isArray(parsed) ? parsed : (parsed.data && Array.isArray(parsed.data) ? parsed.data : null);

        if (!listToImport || listToImport.length === 0) {
          showNotice('error', 'File JSON không hợp lệ hoặc không có dữ liệu danh mục.');
          setRestoringCat(false);
          return;
        }

        let successCount = 0;
        for (const item of listToImport) {
          if (!item.name || !item.type) continue;
          try {
            await fetch('/api/categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: item.code || `CAT_${Date.now() % 100000}`,
                name: item.name,
                type: item.type,
                properties: item.properties || {},
                status: item.status || 'Đang dùng',
                order: item.order || 0
              })
            });
            successCount++;
          } catch (err) {
            console.error('Error inserting category item:', err);
          }
        }

        showNotice('success', `Đã khôi phục và đồng bộ thành công ${successCount} danh mục từ file JSON!`);
        fetchCategories();
      } catch (err: any) {
        showNotice('error', `Lỗi xử lý file JSON: ${err?.message || String(err)}`);
      } finally {
        setRestoringCat(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --------------------------------------------------------------------------
  // EXCEL EXPORT (SINGLE TAB & MASTER 3-IN-1)
  // --------------------------------------------------------------------------
  const handleExport = async () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    if (activeTab === 'TASK') {
      const cols: ExportColumn[] = [
        { header: 'STT', key: 'stt', width: 8, align: 'center' },
        { header: 'Mã chuẩn', key: 'code', width: 16, align: 'center' },
        { header: 'Tên nhiệm vụ / Công việc', key: 'name', width: 44, align: 'left' },
        { header: 'Nhóm công việc', key: 'taskGroup', width: 26, align: 'left' },
        { header: 'Điểm chuẩn (Đc)', key: 'score', width: 16, align: 'center', numFmt: '#,##0.0' },
        { header: 'Tính chất mặc định', key: 'nature', width: 18, align: 'center' },
        { header: 'Loại sản phẩm', key: 'productType', width: 22, align: 'left' },
        { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
        { header: 'Thứ tự', key: 'order', width: 10, align: 'center' },
        { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
      ];
      const data = tasks.map((c, idx) => ({
        stt: idx + 1,
        code: c.code || `NV${String(idx + 1).padStart(2, '0')}`,
        name: c.name,
        taskGroup: c.properties?.taskGroup || '',
        score: c.properties?.score ?? 10,
        nature: c.properties?.nature || 'Trung bình',
        productType: c.properties?.productType || 'Khác',
        unit: c.properties?.unit || 'Sản phẩm',
        order: c.order || idx + 1,
        status: c.status || 'Đang dùng',
      }));
      await exportStyledExcel(data, cols, `Danh_Muc_Nhiem_Vu_${dateStr}.xlsx`, 'DanhMuc_NhiemVu');
      showNotice('success', `Đã xuất ${tasks.length} nhiệm vụ sang file Excel chuẩn (#1F4E78).`);
    } else if (activeTab === 'TASK_GROUP') {
      const cols: ExportColumn[] = [
        { header: 'STT', key: 'stt', width: 8, align: 'center' },
        { header: 'Mã nhóm', key: 'code', width: 18, align: 'center' },
        { header: 'Tên nhóm công việc', key: 'name', width: 38, align: 'left' },
        { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
        { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
      ];
      const data = taskGroups.map((c, idx) => ({
        stt: idx + 1,
        code: c.code || `GRP_${idx + 1}`,
        name: c.name,
        order: c.order || idx + 1,
        status: c.status || 'Đang dùng',
      }));
      await exportStyledExcel(data, cols, `Danh_Muc_Nhom_Cong_Viec_${dateStr}.xlsx`, 'Nhom_Cong_Viec');
      showNotice('success', `Đã xuất ${taskGroups.length} nhóm việc sang file Excel chuẩn (#1F4E78).`);
    } else if (activeTab === 'PRODUCT_TYPE') {
      const cols: ExportColumn[] = [
        { header: 'STT', key: 'stt', width: 8, align: 'center' },
        { header: 'Mã loại SP', key: 'code', width: 18, align: 'center' },
        { header: 'Tên loại sản phẩm', key: 'name', width: 38, align: 'left' },
        { header: 'Đơn vị tính (ĐVT)', key: 'unit', width: 18, align: 'center' },
        { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
        { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
      ];
      const data = productTypes.map((c, idx) => ({
        stt: idx + 1,
        code: c.code || `PROD_${idx + 1}`,
        name: c.name,
        unit: c.properties?.unit || c.name,
        order: c.order || idx + 1,
        status: c.status || 'Đang dùng',
      }));
      await exportStyledExcel(data, cols, `Danh_Muc_Loai_San_Pham_${dateStr}.xlsx`, 'Loai_San_Pham');
      showNotice('success', `Đã xuất ${productTypes.length} loại sản phẩm sang file Excel chuẩn (#1F4E78).`);
    }
  };

  const handleExportAllMaster = async () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const sheets: MultiSheetConfig[] = [
      {
        sheetName: 'Danh_Muc_Nhiem_Vu',
        columns: [
          { header: 'STT', key: 'stt', width: 8, align: 'center' },
          { header: 'Mã chuẩn', key: 'code', width: 16, align: 'center' },
          { header: 'Tên nhiệm vụ / Công việc', key: 'name', width: 44, align: 'left' },
          { header: 'Nhóm công việc', key: 'taskGroup', width: 26, align: 'left' },
          { header: 'Điểm chuẩn (Đc)', key: 'score', width: 16, align: 'center', numFmt: '#,##0.0' },
          { header: 'Tính chất mặc định', key: 'nature', width: 18, align: 'center' },
          { header: 'Loại sản phẩm', key: 'productType', width: 22, align: 'left' },
          { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
          { header: 'Thứ tự', key: 'order', width: 10, align: 'center' },
          { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
        ],
        data: tasks.map((c, idx) => ({
          stt: idx + 1,
          code: c.code || `NV${String(idx + 1).padStart(2, '0')}`,
          name: c.name,
          taskGroup: c.properties?.taskGroup || '',
          score: c.properties?.score ?? 10,
          nature: c.properties?.nature || 'Trung bình',
          productType: c.properties?.productType || 'Khác',
          unit: c.properties?.unit || 'Sản phẩm',
          order: c.order || idx + 1,
          status: c.status || 'Đang dùng',
        }))
      },
      {
        sheetName: 'Nhom_Cong_Viec',
        columns: [
          { header: 'STT', key: 'stt', width: 8, align: 'center' },
          { header: 'Mã nhóm', key: 'code', width: 18, align: 'center' },
          { header: 'Tên nhóm công việc', key: 'name', width: 38, align: 'left' },
          { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
          { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
        ],
        data: taskGroups.map((c, idx) => ({
          stt: idx + 1,
          code: c.code || `GRP_${idx + 1}`,
          name: c.name,
          order: c.order || idx + 1,
          status: c.status || 'Đang dùng',
        }))
      },
      {
        sheetName: 'Loai_San_Pham',
        columns: [
          { header: 'STT', key: 'stt', width: 8, align: 'center' },
          { header: 'Mã loại SP', key: 'code', width: 18, align: 'center' },
          { header: 'Tên loại sản phẩm', key: 'name', width: 38, align: 'left' },
          { header: 'Đơn vị tính (ĐVT)', key: 'unit', width: 18, align: 'center' },
          { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
          { header: 'Trạng thái', key: 'status', width: 16, align: 'center' },
        ],
        data: productTypes.map((c, idx) => ({
          stt: idx + 1,
          code: c.code || `PROD_${idx + 1}`,
          name: c.name,
          unit: c.properties?.unit || c.name,
          order: c.order || idx + 1,
          status: c.status || 'Đang dùng',
        }))
      }
    ];

    await exportMultiSheetExcel(sheets, `Tong_Hop_Danh_Muc_He_Thong_3in1_${dateStr}.xlsx`);
    showNotice('success', 'Đã tải thành công tệp Excel tổng hợp 3-in-1 chứa đầy đủ Danh mục nhiệm vụ, Nhóm việc và Loại SP!');
  };

  // --------------------------------------------------------------------------
  // DOWNLOAD EXCEL TEMPLATES (SINGLE & MASTER 3-IN-1)
  // --------------------------------------------------------------------------
  const handleDownloadTemplate = async () => {
    if (activeTab === 'TASK') {
      const cols: ExportColumn[] = [
        { header: 'Mã chuẩn', key: 'code', width: 16, align: 'center' },
        { header: 'Tên nhiệm vụ / Công việc', key: 'name', width: 44, align: 'left' },
        { header: 'Nhóm công việc', key: 'taskGroup', width: 26, align: 'left' },
        { header: 'Điểm chuẩn (Đc)', key: 'score', width: 16, align: 'center', numFmt: '#,##0.0' },
        { header: 'Tính chất mặc định', key: 'nature', width: 18, align: 'center' },
        { header: 'Loại sản phẩm', key: 'productType', width: 22, align: 'left' },
        { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
        { header: 'Thứ tự', key: 'order', width: 10, align: 'center' },
      ];
      const sample = [
        { code: 'KH01', name: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn', taskGroup: 'Kế hoạch vốn', score: 10, nature: 'Trung bình', productType: 'Bảng tổng hợp', unit: 'Bảng', order: 1 },
        { code: 'B2.1', name: 'Kiểm tra, rà soát hồ sơ tạm ứng, thanh toán khối lượng hoàn thành', taskGroup: 'Thanh toán, giải ngân', score: 12, nature: 'Phức tạp', productType: 'Hồ sơ thanh toán', unit: 'Hồ sơ', order: 2 },
        { code: 'QT01', name: 'Lập hồ sơ quyết toán A-B', taskGroup: 'Quyết toán', score: 12, nature: 'Rất phức tạp', productType: 'Hồ sơ quyết toán', unit: 'Hồ sơ', order: 3 },
        { code: 'HD01', name: 'Điều chỉnh thông tin hợp đồng', taskGroup: 'Quản lý hợp đồng', score: 1, nature: 'Rất đơn giản', productType: 'PL hợp đồng', unit: 'Bộ', order: 4 },
      ];
      await downloadStyledTemplate(sample, cols, 'Mau_Chuan_Danh_Muc_Nhiem_Vu.xlsx', 'DanhMuc_NhiemVu');
    } else if (activeTab === 'TASK_GROUP') {
      const cols: ExportColumn[] = [
        { header: 'Mã nhóm', key: 'code', width: 18, align: 'center' },
        { header: 'Tên nhóm công việc', key: 'name', width: 38, align: 'left' },
        { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
        { header: 'Ghi chú mô tả', key: 'note', width: 35, align: 'left' },
      ];
      const sample = [
        { code: 'GRP_VON', name: 'Kế hoạch vốn', order: 1, note: 'Theo dõi, phân bổ kế hoạch vốn đầu tư công' },
        { code: 'GRP_THANHTOAN', name: 'Thanh toán, giải ngân', order: 2, note: 'Hồ sơ thanh toán, kiểm soát chi Kho bạc' },
        { code: 'GRP_QUYETTOAN', name: 'Quyết toán', order: 3, note: 'Quyết toán vốn đầu tư công dự án hoàn thành' },
        { code: 'GRP_QLHD', name: 'Quản lý hợp đồng', order: 4, note: 'Hợp đồng tư vấn, xây lắp, phụ lục hợp đồng' },
        { code: 'GRP_KETOAN', name: 'Kế toán nội bộ', order: 5, note: 'Chi tiêu nội bộ, tiền lương, công tác phí' },
        { code: 'GRP_THUQUY', name: 'Thủ quỹ', order: 6, note: 'Thu chi tiền mặt, quản lý quỹ cơ quan' },
      ];
      await downloadStyledTemplate(sample, cols, 'Mau_Chuan_Nhom_Cong_Viec.xlsx', 'Nhom_Cong_Viec');
    } else if (activeTab === 'PRODUCT_TYPE') {
      const cols: ExportColumn[] = [
        { header: 'Mã loại SP', key: 'code', width: 18, align: 'center' },
        { header: 'Tên loại sản phẩm', key: 'name', width: 38, align: 'left' },
        { header: 'Đơn vị tính (ĐVT)', key: 'unit', width: 18, align: 'center' },
        { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
      ];
      const sample = [
        { code: 'PROD_BAOCAO', name: 'Báo cáo', unit: 'Báo cáo', order: 1 },
        { code: 'PROD_VANBAN', name: 'Văn bản', unit: 'Văn bản', order: 2 },
        { code: 'PROD_TOTRINH', name: 'Tờ trình', unit: 'Tờ trình', order: 3 },
        { code: 'PROD_BANG', name: 'Bảng tổng hợp', unit: 'Bảng', order: 4 },
        { code: 'PROD_HSTT', name: 'Hồ sơ thanh toán', unit: 'Hồ sơ', order: 5 },
        { code: 'PROD_HSQT', name: 'Hồ sơ quyết toán', unit: 'Hồ sơ', order: 6 },
        { code: 'PROD_HSLCNT', name: 'Hồ sơ lựa chọn nhà thầu', unit: 'Hồ sơ', order: 7 },
        { code: 'PROD_HSGPMB', name: 'Hồ sơ đền bù/GPMB', unit: 'Hồ sơ', order: 8 },
        { code: 'PROD_BIENBAN', name: 'Biên bản', unit: 'Biên bản', order: 9 },
        { code: 'PROD_PLHD', name: 'PL hợp đồng', unit: 'Bộ', order: 10 },
      ];
      await downloadStyledTemplate(sample, cols, 'Mau_Chuan_Loai_San_Pham.xlsx', 'Loai_San_Pham');
    }
  };

  const handleDownloadMasterTemplate = async () => {
    const sheets: MultiSheetConfig[] = [
      {
        sheetName: 'Danh_Muc_Nhiem_Vu',
        columns: [
          { header: 'Mã chuẩn', key: 'code', width: 16, align: 'center' },
          { header: 'Tên nhiệm vụ / Công việc', key: 'name', width: 44, align: 'left' },
          { header: 'Nhóm công việc', key: 'taskGroup', width: 26, align: 'left' },
          { header: 'Điểm chuẩn (Đc)', key: 'score', width: 16, align: 'center', numFmt: '#,##0.0' },
          { header: 'Tính chất mặc định', key: 'nature', width: 18, align: 'center' },
          { header: 'Loại sản phẩm', key: 'productType', width: 22, align: 'left' },
          { header: 'Đơn vị tính', key: 'unit', width: 14, align: 'center' },
          { header: 'Thứ tự', key: 'order', width: 10, align: 'center' },
        ],
        data: [
          { code: 'KH01', name: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn', taskGroup: 'Kế hoạch vốn', score: 10, nature: 'Trung bình', productType: 'Bảng tổng hợp', unit: 'Bảng', order: 1 },
          { code: 'B2.1', name: 'Kiểm tra, rà soát hồ sơ tạm ứng, thanh toán khối lượng hoàn thành', taskGroup: 'Thanh toán, giải ngân', score: 12, nature: 'Phức tạp', productType: 'Hồ sơ thanh toán', unit: 'Hồ sơ', order: 2 },
          { code: 'QT01', name: 'Lập hồ sơ quyết toán A-B', taskGroup: 'Quyết toán', score: 12, nature: 'Rất phức tạp', productType: 'Hồ sơ quyết toán', unit: 'Hồ sơ', order: 3 },
          { code: 'HD01', name: 'Điều chỉnh thông tin hợp đồng', taskGroup: 'Quản lý hợp đồng', score: 1, nature: 'Rất đơn giản', productType: 'PL hợp đồng', unit: 'Bộ', order: 4 },
        ]
      },
      {
        sheetName: 'Nhom_Cong_Viec',
        columns: [
          { header: 'Mã nhóm', key: 'code', width: 18, align: 'center' },
          { header: 'Tên nhóm công việc', key: 'name', width: 38, align: 'left' },
          { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
          { header: 'Ghi chú', key: 'note', width: 30, align: 'left' },
        ],
        data: [
          { code: 'GRP_VON', name: 'Kế hoạch vốn', order: 1, note: 'Theo dõi, phân bổ kế hoạch vốn đầu tư công' },
          { code: 'GRP_THANHTOAN', name: 'Thanh toán, giải ngân', order: 2, note: 'Hồ sơ thanh toán, kiểm soát chi Kho bạc' },
          { code: 'GRP_QUYETTOAN', name: 'Quyết toán', order: 3, note: 'Quyết toán vốn đầu tư công dự án hoàn thành' },
          { code: 'GRP_QLHD', name: 'Quản lý hợp đồng', order: 4, note: 'Hợp đồng tư vấn, xây lắp, phụ lục hợp đồng' },
          { code: 'GRP_KETOAN', name: 'Kế toán nội bộ', order: 5, note: 'Chi tiêu nội bộ, tiền lương, công tác phí' },
          { code: 'GRP_THUQUY', name: 'Thủ quỹ', order: 6, note: 'Thu chi tiền mặt, quản lý quỹ cơ quan' },
        ]
      },
      {
        sheetName: 'Loai_San_Pham',
        columns: [
          { header: 'Mã loại SP', key: 'code', width: 18, align: 'center' },
          { header: 'Tên loại sản phẩm', key: 'name', width: 38, align: 'left' },
          { header: 'Đơn vị tính (ĐVT)', key: 'unit', width: 18, align: 'center' },
          { header: 'Thứ tự', key: 'order', width: 12, align: 'center' },
        ],
        data: [
          { code: 'PROD_BAOCAO', name: 'Báo cáo', unit: 'Báo cáo', order: 1 },
          { code: 'PROD_VANBAN', name: 'Văn bản', unit: 'Văn bản', order: 2 },
          { code: 'PROD_TOTRINH', name: 'Tờ trình', unit: 'Tờ trình', order: 3 },
          { code: 'PROD_BANG', name: 'Bảng tổng hợp', unit: 'Bảng', order: 4 },
          { code: 'PROD_HSTT', name: 'Hồ sơ thanh toán', unit: 'Hồ sơ', order: 5 },
          { code: 'PROD_HSQT', name: 'Hồ sơ quyết toán', unit: 'Hồ sơ', order: 6 },
          { code: 'PROD_HSLCNT', name: 'Hồ sơ lựa chọn nhà thầu', unit: 'Hồ sơ', order: 7 },
          { code: 'PROD_HSGPMB', name: 'Hồ sơ đền bù/GPMB', unit: 'Hồ sơ', order: 8 },
          { code: 'PROD_BIENBAN', name: 'Biên bản', unit: 'Biên bản', order: 9 },
          { code: 'PROD_PLHD', name: 'PL hợp đồng', unit: 'Bộ', order: 10 },
        ]
      }
    ];

    await exportMultiSheetExcel(sheets, 'Mau_Chuan_Tong_Hop_Danh_Muc_3in1.xlsx');
    showNotice('success', 'Đã tải thành công tệp Excel mẫu chuẩn tổng hợp 3-in-1!');
  };

  // --------------------------------------------------------------------------
  // EXCEL IMPORT ENGINE (SMART AUTO-DETECTION)
  // --------------------------------------------------------------------------
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        const getVal = (row: any, keys: string[]) => {
          for (const k of keys) {
            if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
              return row[k];
            }
          }
          return undefined;
        };

        let importedTasks = 0;
        let importedGroups = 0;
        let importedProducts = 0;
        let syncedGroups = new Set<string>();
        let syncedProducts = new Set<string>();

        // Process each sheet in workbook
        for (const sName of wb.SheetNames) {
          const ws = wb.Sheets[sName];
          const rows: any[] = XLSX.utils.sheet_to_json(ws);
          if (!rows || rows.length === 0) continue;

          const sClean = sName.toLowerCase().replace(/[\s\-_]/g, '');

          // Check if this sheet is TASK_GROUP
          const isGroupSheet = sClean.includes('nhomviec') || sClean.includes('taskgroup') || (rows[0] && getVal(rows[0], ['Tên nhóm công việc', 'Tên nhóm', 'GroupName']) !== undefined && getVal(rows[0], ['Điểm chuẩn', 'Điểm chuẩn (Nếu là TASK)', 'Score']) === undefined);

          // Check if this sheet is PRODUCT_TYPE
          const isProdSheet = sClean.includes('loaisanpham') || sClean.includes('producttype') || (rows[0] && (getVal(rows[0], ['Tên loại sản phẩm', 'Tên loại SP', 'ProductTypeName']) !== undefined || (getVal(rows[0], ['Đơn vị tính', 'ĐVT']) !== undefined && getVal(rows[0], ['Điểm chuẩn', 'Score']) === undefined)));

          // Check if this sheet is TASK
          const isTaskSheet = sClean.includes('danhmuc') || sClean.includes('nhiemvu') || sClean.includes('task') || rows.some(r => getVal(r, ['Nhóm việc (Nếu là TASK)', 'Nhóm việc', 'Điểm chuẩn (Nếu là TASK)', 'Điểm chuẩn', 'Tính chất']) !== undefined);

          if (isGroupSheet && !isTaskSheet) {
            // Import Task Groups
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const name = getVal(row, ['Tên nhóm công việc', 'Tên nhóm', 'Tên', 'GroupName', 'Name']);
              if (!name) continue;
              const code = getVal(row, ['Mã', 'Mã nhóm', 'GroupCode']) || `GRP_${Date.now()}_${i + 1}`;
              const status = getVal(row, ['Trạng thái', 'Status']) || 'Đang dùng';
              const order = Number(getVal(row, ['Thứ tự', 'Order', 'STT'])) || (i + 1);

              await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, name, type: 'TASK_GROUP', status, order })
              });
              importedGroups++;
            }
          } else if (isProdSheet && !isTaskSheet) {
            // Import Product Types
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const name = getVal(row, ['Tên loại sản phẩm', 'Tên loại SP', 'Tên', 'ProductTypeName', 'Name']);
              if (!name) continue;
              const code = getVal(row, ['Mã', 'Mã loại SP', 'Mã SP', 'ProductCode']) || `PROD_${Date.now()}_${i + 1}`;
              const unit = getVal(row, ['Đơn vị tính (ĐVT)', 'Đơn vị tính', 'Đơn vị', 'Unit']) || name;
              const status = getVal(row, ['Trạng thái', 'Status']) || 'Đang dùng';
              const order = Number(getVal(row, ['Thứ tự', 'Order', 'STT'])) || (i + 1);

              await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, name, type: 'PRODUCT_TYPE', status, order, properties: { unit } })
              });
              importedProducts++;
            }
          } else {
            // Default or Task Sheet: If activeTab is active or sheet contains tasks
            if (activeTab === 'TASK_GROUP' && wb.SheetNames.length === 1 && !isTaskSheet) {
              // Single sheet import while on Task Group tab
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const name = getVal(row, ['Tên nhóm công việc', 'Tên nhóm', 'Tên', 'GroupName', 'Name']);
                if (!name) continue;
                const code = getVal(row, ['Mã', 'Mã nhóm', 'GroupCode']) || `GRP_${Date.now()}_${i + 1}`;
                const status = getVal(row, ['Trạng thái', 'Status']) || 'Đang dùng';
                const order = Number(getVal(row, ['Thứ tự', 'Order', 'STT'])) || (i + 1);

                await fetch('/api/categories', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code, name, type: 'TASK_GROUP', status, order })
                });
                importedGroups++;
              }
            } else if (activeTab === 'PRODUCT_TYPE' && wb.SheetNames.length === 1 && !isTaskSheet) {
              // Single sheet import while on Product Type tab
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const name = getVal(row, ['Tên loại sản phẩm', 'Tên loại SP', 'Tên', 'ProductTypeName', 'Name']);
                if (!name) continue;
                const code = getVal(row, ['Mã', 'Mã loại SP', 'Mã SP', 'ProductCode']) || `PROD_${Date.now()}_${i + 1}`;
                const unit = getVal(row, ['Đơn vị tính (ĐVT)', 'Đơn vị tính', 'Đơn vị', 'Unit']) || name;
                const status = getVal(row, ['Trạng thái', 'Status']) || 'Đang dùng';
                const order = Number(getVal(row, ['Thứ tự', 'Order', 'STT'])) || (i + 1);

                await fetch('/api/categories', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code, name, type: 'PRODUCT_TYPE', status, order, properties: { unit } })
                });
                importedProducts++;
              }
            } else {
              // Task Items
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const name = getVal(row, ['Tên nhiệm vụ / Công việc', 'Tên nhiệm vụ', 'Tên công việc', 'Tên', 'TaskName', 'Name']);
                if (!name) continue;

                const code = getVal(row, ['Mã chuẩn', 'Mã', 'TaskCode', 'Code']) || `NV_${Date.now() % 100000}_${i + 1}`;
                const taskGroup = getVal(row, ['Nhóm công việc', 'Nhóm việc', 'Nhóm việc (Nếu là TASK)', 'TaskGroup']) || 'Kế hoạch vốn';
                const score = parseFloat(getVal(row, ['Điểm chuẩn (Đc)', 'Điểm chuẩn', 'Điểm chuẩn (Nếu là TASK)', 'Score']) || '10');
                const nature = getVal(row, ['Tính chất mặc định', 'Tính chất', 'Nature']) || 'Trung bình';
                const productType = getVal(row, ['Loại sản phẩm', 'Loại SP', 'ProductType']) || 'Báo cáo';
                const unit = getVal(row, ['Đơn vị tính', 'ĐVT', 'Unit']) || 'Sản phẩm';
                const order = Number(getVal(row, ['Thứ tự', 'Order', 'STT'])) || (i + 1);
                const status = getVal(row, ['Trạng thái', 'Status']) || 'Đang dùng';

                if (taskGroup) syncedGroups.add(taskGroup);
                if (productType) syncedProducts.add(productType);

                await fetch('/api/categories', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    code,
                    name,
                    type: 'TASK',
                    properties: {
                      taskGroup,
                      score: isNaN(score) ? 10 : score,
                      nature,
                      productType,
                      unit
                    },
                    status,
                    order
                  })
                });
                importedTasks++;
              }
            }
          }
        }

        // Auto-sync extracted Task Groups if any new
        for (const gName of Array.from(syncedGroups)) {
          const cleanGName = String(gName).trim();
          if (!cleanGName) continue;
          
          const existingGroup = taskGroups.find(g => g.name?.toLowerCase() === cleanGName.toLowerCase());
          if (!existingGroup) {
            const gCode = `GRP_${cleanGName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 15)}_${Date.now() % 10000}`;
            await fetch('/api/categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: gCode,
                name: cleanGName,
                type: 'TASK_GROUP',
                status: 'Đang dùng',
                order: taskGroups.length + 1
              })
            });
          }
        }

        // Auto-sync extracted Product Types if any new
        for (const pName of Array.from(syncedProducts)) {
          const cleanPName = String(pName).trim();
          if (!cleanPName) continue;

          const existingProd = productTypes.find(p => p.name?.toLowerCase() === cleanPName.toLowerCase());
          if (!existingProd) {
            const pCode = `PROD_${cleanPName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 15)}_${Date.now() % 10000}`;
            await fetch('/api/categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: pCode,
                name: cleanPName,
                type: 'PRODUCT_TYPE',
                status: 'Đang dùng',
                properties: { unit: cleanPName },
                order: productTypes.length + 1
              })
            });
          }
        }

        showNotice(
          'success', 
          `Đã import thành công: ${importedTasks} nhiệm vụ, ${importedGroups} nhóm việc, ${importedProducts} loại sản phẩm (và tự động liên kết dữ liệu)!`
        );

        fetchCategories();
      } catch (err) {
        console.error('Error importing Excel:', err);
        showNotice('error', 'Lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng file!');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleAddNew = () => {
    const currentList = categories.filter(c => c.type === activeTab);
    const newCat = {
      id: 'new',
      type: activeTab,
      code: activeTab === 'TASK' ? `TASK-${currentList.length + 1}` : activeTab === 'TASK_GROUP' ? `GRP-${currentList.length + 1}` : `PROD-${currentList.length + 1}`,
      name: '',
      status: 'Đang dùng',
      order: currentList.length + 1,
      properties: activeTab === 'TASK' ? {
        taskGroup: taskGroups[0]?.name || 'Kế hoạch vốn',
        score: 10,
        nature: 'Trung bình',
        productType: productTypes[0]?.name || 'Báo cáo',
        unit: 'Sản phẩm'
      } : activeTab === 'PRODUCT_TYPE' ? { unit: 'Sản phẩm' } : {}
    };
    setIsEditing('new');
    setFormData(newCat);
  };

  const handleSave = async (id: number | string) => {
    if (!formData.name?.trim()) {
      showNotice('error', 'Vui lòng nhập Tên danh mục!');
      return;
    }

    try {
      const method = id === 'new' ? 'POST' : 'PUT';
      const url = id === 'new' ? '/api/categories' : `/api/categories/${id}`;
      
      const payload = {
        ...formData,
        type: activeTab
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showNotice('success', id === 'new' ? 'Đã thêm mới danh mục thành công!' : 'Đã lưu thay đổi thành công!');
        setIsEditing(null);
        fetchCategories();
      } else {
        showNotice('error', data.error || 'Lỗi khi lưu dữ liệu');
      }
    } catch (e: any) {
      showNotice('error', `Lỗi kết nối: ${e?.message || String(e)}`);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa mục "${name}" không?`)) return;

    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showNotice('success', `Đã xóa thành công mục "${name}"!`);
        fetchCategories();
      } else {
        showNotice('error', data.error || 'Lỗi khi xóa');
      }
    } catch (e: any) {
      showNotice('error', `Lỗi kết nối: ${e?.message || String(e)}`);
    }
  };

  const handleApprove = async (cat: any) => {
    try {
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cat, status: 'Đang dùng' })
      });
      const data = await res.json();
      if (data.success) {
        showNotice('success', `Đã duyệt danh mục "${cat.name}"!`);
        fetchCategories();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered List
  const filteredCategories = categories.filter(c => {
    if (c.type !== activeTab) return false;
    if (activeTab === 'TASK' && filterGroup !== 'ALL') {
      if (c.properties?.taskGroup !== filterGroup) return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        c.code?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.properties?.taskGroup?.toLowerCase().includes(q) ||
        c.properties?.productType?.toLowerCase().includes(q)
      );
    }
    return true;
  }).sort((a, b) => {
    if (a.status === 'Chờ duyệt' && b.status !== 'Chờ duyệt') return -1;
    if (b.status === 'Chờ duyệt' && a.status !== 'Chờ duyệt') return 1;
    return (a.order || 0) - (b.order || 0);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#1F4E78] bg-opacity-10 rounded-2xl text-[#1F4E78]">
            <Settings className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Cài đặt danh mục hệ thống</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Quản lý chuẩn hóa danh mục nhiệm vụ, nhóm công việc, loại sản phẩm, sao lưu dự phòng JSON và xuất nhập Excel đa tầng.
            </p>
          </div>
        </div>

        {/* Quick summary badges & Quick Backup Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>{tasks.length} Nhiệm vụ</span>
          </span>
          <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <FolderTree className="w-3.5 h-3.5 text-emerald-600" />
            <span>{taskGroups.length} Nhóm việc</span>
          </span>
          <span className="px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-800 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-purple-600" />
            <span>{productTypes.length} Loại SP</span>
          </span>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-sm font-bold transition-all shadow-xs ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : notification.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-xs underline hover:opacity-80 cursor-pointer">
            Đóng
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/70">
          {[
            { id: 'ORG_CONFIG', label: 'Cơ quan & Phòng ban', icon: Building2 },
            { id: 'KPI_CONFIG', label: 'Cấu hình phân bổ điểm & Xếp loại KPI', icon: Sliders },
            { id: 'TASK', label: `Danh mục nhiệm vụ (${tasks.length})`, icon: Layers },
            { id: 'TASK_GROUP', label: `Nhóm công việc (${taskGroups.length})`, icon: FolderTree },
            { id: 'PRODUCT_TYPE', label: `Loại sản phẩm (${productTypes.length})`, icon: Package }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { 
                setActiveTab(tab.id as any); 
                setIsEditing(null); 
                setSearchTerm('');
              }}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-bold transition-all cursor-pointer ${
                activeTab === tab.id 
                  ? 'border-b-2 border-[#1F4E78] text-[#1F4E78] bg-white shadow-xs font-black' 
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
            >
              {tab.icon && <tab.icon className="w-4 h-4 text-[#1F4E78]" />}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'ORG_CONFIG' ? (
            <OrgConfigSettings />
          ) : activeTab === 'KPI_CONFIG' ? (
            <KpiConfigSettings onRecalculateSuccess={fetchCategories} />
          ) : (
            <>
              {/* Action Toolbar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <span>
                      {activeTab === 'TASK' ? 'Danh mục nhiệm vụ công việc' : 
                       activeTab === 'TASK_GROUP' ? 'Danh mục nhóm công việc' : 'Danh mục loại sản phẩm'}
                    </span>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {filteredCategories.length} mục
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeTab === 'TASK' && 'Nhiệm vụ chuẩn với Điểm chuẩn, Tính chất phức tạp và Loại sản phẩm tương ứng'}
                    {activeTab === 'TASK_GROUP' && 'Các nhóm công việc chuyên môn của Phòng Kế hoạch - Tài chính'}
                    {activeTab === 'PRODUCT_TYPE' && 'Các loại hình sản phẩm đầu ra gắn liền với công việc'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* JSON Backup & Restore for Categories */}
                  <div className="flex items-center gap-1.5 bg-amber-50/70 p-1 rounded-xl border border-amber-200">
                    <button
                      type="button"
                      onClick={handleExportCategoryJson}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-amber-900 rounded-lg hover:bg-amber-100 font-extrabold text-xs border border-amber-300 transition-colors shadow-2xs cursor-pointer"
                      title="Tải về file sao lưu .JSON riêng cho toàn bộ Danh mục hệ thống"
                    >
                      <Archive className="w-3.5 h-3.5 text-amber-700" />
                      <span>Sao lưu JSON</span>
                    </button>

                    <label 
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-extrabold text-xs cursor-pointer transition-colors shadow-2xs"
                      title="Khôi phục danh mục từ file sao lưu .JSON"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 text-white ${restoringCat ? 'animate-spin' : ''}`} />
                      <span>{restoringCat ? 'Đang nạp...' : 'Khôi phục JSON'}</span>
                      <input type="file" accept=".json" className="hidden" onChange={handleImportCategoryJson} />
                    </label>
                  </div>

                  {/* Single-Tab Actions */}
                  <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={handleDownloadTemplate}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 rounded-lg hover:bg-slate-100 font-bold text-xs border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                      title={`Tải file Excel mẫu chuẩn cho ${activeTab === 'TASK' ? 'Nhiệm vụ' : activeTab === 'TASK_GROUP' ? 'Nhóm việc' : 'Loại sản phẩm'}`}
                    >
                      <FileDown className="w-3.5 h-3.5 text-slate-600" />
                      <span>Mẫu riêng</span>
                    </button>

                    <button
                      onClick={handleExport}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 font-bold text-xs border border-emerald-200 transition-colors shadow-2xs cursor-pointer"
                      title={`Xuất dữ liệu thật ${activeTab === 'TASK' ? 'Nhiệm vụ' : activeTab === 'TASK_GROUP' ? 'Nhóm việc' : 'Loại sản phẩm'} (#1F4E78)`}
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Xuất riêng</span>
                    </button>
                  </div>

                  {/* Combo 3-in-1 Master Actions */}
                  <div className="flex items-center gap-1.5 bg-blue-50/60 p-1 rounded-xl border border-blue-200">
                    <button
                      onClick={handleDownloadMasterTemplate}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-blue-700 rounded-lg hover:bg-blue-50 font-bold text-xs border border-blue-200 transition-colors shadow-2xs cursor-pointer"
                      title="Tải bộ file mẫu chuẩn tổng hợp 3-in-1 (Nhiệm vụ, Nhóm việc, Loại SP)"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                      <span>Mẫu chung 3-in-1</span>
                    </button>

                    <button
                      onClick={handleExportAllMaster}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs transition-colors shadow-2xs cursor-pointer"
                      title="Xuất toàn bộ 3 danh mục vào 1 file Excel đa trang (#1F4E78)"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                      <span>Xuất chung 3-in-1</span>
                    </button>
                  </div>

                  {/* Import Excel */}
                  <label 
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 font-bold text-xs border border-indigo-200 cursor-pointer transition-colors shadow-2xs" 
                    title="Nạp dữ liệu từ file Excel (Tự động nhận diện file đơn hoặc file tổng hợp 3-in-1)"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Import Excel</span>
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImport} />
                  </label>

                  {/* Add New Item */}
                  <button
                    onClick={handleAddNew}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1F4E78] text-white rounded-xl hover:bg-[#153654] font-bold text-xs shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm mới</span>
                  </button>
                </div>
              </div>

              {/* Filters & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder={`Tìm kiếm ${activeTab === 'TASK' ? 'nhiệm vụ, mã, nhóm việc...' : 'tên hoặc mã...'}`}
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-[#1F4E78] w-64 text-slate-800"
                    />
                  </div>

                  {activeTab === 'TASK' && (
                    <div className="flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-slate-500" />
                      <select
                        value={filterGroup}
                        onChange={e => setFilterGroup(e.target.value)}
                        className="py-1.5 px-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:border-[#1F4E78]"
                      >
                        <option value="ALL">Tất cả nhóm việc ({tasks.length})</option>
                        {taskGroups.map(g => (
                          <option key={g.id} value={g.name}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="text-xs text-slate-500 font-semibold">
                  Hiển thị <strong className="text-slate-800">{filteredCategories.length}</strong> / {categories.filter(c => c.type === activeTab).length} bản ghi
                </div>
              </div>

              {/* Category Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-12 text-center">STT</th>
                      <th className="p-3 w-28">Mã</th>
                      <th className="p-3">Tên mục / Mô tả nhiệm vụ</th>
                      {activeTab === 'TASK' && (
                        <>
                          <th className="p-3 w-36">Nhóm công việc</th>
                          <th className="p-3 w-24 text-center">Điểm chuẩn</th>
                          <th className="p-3 w-28 text-center">Tính chất</th>
                          <th className="p-3 w-32">Loại sản phẩm</th>
                          <th className="p-3 w-24 text-center">ĐVT</th>
                        </>
                      )}
                      {activeTab === 'PRODUCT_TYPE' && (
                        <th className="p-3 w-32 text-center">Đơn vị tính mặc định</th>
                      )}
                      <th className="p-3 w-20 text-center">Thứ tự</th>
                      <th className="p-3 w-28 text-center">Trạng thái</th>
                      <th className="p-3 w-28 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {/* Inline Add New Row */}
                    {isEditing === 'new' && (
                      <tr className="bg-blue-50/70">
                        <td className="p-3 text-center font-bold text-blue-600">Mới</td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={formData.code || ''}
                            onChange={e => setFormData({ ...formData, code: e.target.value })}
                            placeholder="Mã..."
                            className="w-full px-2 py-1 bg-white border border-blue-300 rounded text-xs"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={formData.name || ''}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Tên danh mục..."
                            className="w-full px-2 py-1 bg-white border border-blue-300 rounded text-xs font-semibold"
                            autoFocus
                          />
                        </td>
                        {activeTab === 'TASK' && (
                          <>
                            <td className="p-3">
                              <select
                                value={formData.properties?.taskGroup || ''}
                                onChange={e => setFormData({
                                  ...formData,
                                  properties: { ...formData.properties, taskGroup: e.target.value }
                                })}
                                className="w-full px-2 py-1 bg-white border border-blue-300 rounded text-xs font-semibold"
                              >
                                {taskGroups.map(g => (
                                  <option key={g.id} value={g.name}>{g.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                step="0.5"
                                min="1"
                                max="100"
                                value={formData.properties?.score || 10}
                                onChange={e => setFormData({
                                  ...formData,
                                  properties: { ...formData.properties, score: parseFloat(e.target.value) || 0 }
                                })}
                                className="w-16 px-1 py-1 bg-white border border-blue-300 rounded text-xs text-center font-bold"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <select
                                value={formData.properties?.nature || 'Trung bình'}
                                onChange={e => setFormData({
                                  ...formData,
                                  properties: { ...formData.properties, nature: e.target.value }
                                })}
                                className="w-full px-1 py-1 bg-white border border-blue-300 rounded text-xs text-center"
                              >
                                {Object.keys(WORK_NATURE_COEFS).map(k => (
                                  <option key={k} value={k}>{k}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-3">
                              <select
                                value={formData.properties?.productType || ''}
                                onChange={e => setFormData({
                                  ...formData,
                                  properties: { ...formData.properties, productType: e.target.value }
                                })}
                                className="w-full px-2 py-1 bg-white border border-blue-300 rounded text-xs"
                              >
                                {productTypes.map(p => (
                                  <option key={p.id} value={p.name}>{p.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="text"
                                value={formData.properties?.unit || ''}
                                onChange={e => setFormData({
                                  ...formData,
                                  properties: { ...formData.properties, unit: e.target.value }
                                })}
                                className="w-full px-1 py-1 bg-white border border-blue-300 rounded text-xs text-center"
                              />
                            </td>
                          </>
                        )}
                        {activeTab === 'PRODUCT_TYPE' && (
                          <td className="p-3 text-center">
                            <input
                              type="text"
                              value={formData.properties?.unit || ''}
                              onChange={e => setFormData({
                                ...formData,
                                properties: { ...formData.properties, unit: e.target.value }
                              })}
                              className="w-full px-2 py-1 bg-white border border-blue-300 rounded text-xs text-center"
                            />
                          </td>
                        )}
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            value={formData.order || 0}
                            onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                            className="w-12 px-1 py-1 bg-white border border-blue-300 rounded text-xs text-center"
                          />
                        </td>
                        <td className="p-3 text-center">
                          <select
                            value={formData.status || 'Đang dùng'}
                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                            className="w-full px-1 py-1 bg-white border border-blue-300 rounded text-xs text-center"
                          >
                            <option value="Đang dùng">Đang dùng</option>
                            <option value="Tạm khóa">Tạm khóa</option>
                          </select>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleSave('new')}
                              className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition shadow-2xs"
                              title="Lưu mục mới"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setIsEditing(null)}
                              className="p-1.5 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
                              title="Hủy"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Category List Rows */}
                    {filteredCategories.length === 0 && isEditing !== 'new' ? (
                      <tr>
                        <td colSpan={activeTab === 'TASK' ? 10 : 6} className="p-8 text-center text-slate-400 font-semibold">
                          Không tìm thấy bản ghi danh mục nào phù hợp.
                        </td>
                      </tr>
                    ) : (
                      filteredCategories.map((c, idx) => {
                        const isThisRowEditing = isEditing === c.id;
                        return isThisRowEditing ? (
                          <tr key={c.id} className="bg-amber-50/70">
                            <td className="p-3 text-center font-bold text-amber-700">{idx + 1}</td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={formData.code || ''}
                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                                className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={formData.name || ''}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-semibold"
                              />
                            </td>
                            {activeTab === 'TASK' && (
                              <>
                                <td className="p-3">
                                  <select
                                    value={formData.properties?.taskGroup || ''}
                                    onChange={e => setFormData({
                                      ...formData,
                                      properties: { ...formData.properties, taskGroup: e.target.value }
                                    })}
                                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-semibold"
                                  >
                                    {taskGroups.map(g => (
                                      <option key={g.id} value={g.name}>{g.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="p-3 text-center">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="1"
                                    max="100"
                                    value={formData.properties?.score || 10}
                                    onChange={e => setFormData({
                                      ...formData,
                                      properties: { ...formData.properties, score: parseFloat(e.target.value) || 0 }
                                    })}
                                    className="w-16 px-1 py-1 bg-white border border-amber-300 rounded text-xs text-center font-bold"
                                  />
                                </td>
                                <td className="p-3 text-center">
                                  <select
                                    value={formData.properties?.nature || 'Trung bình'}
                                    onChange={e => setFormData({
                                      ...formData,
                                      properties: { ...formData.properties, nature: e.target.value }
                                    })}
                                    className="w-full px-1 py-1 bg-white border border-amber-300 rounded text-xs text-center"
                                  >
                                    {Object.keys(WORK_NATURE_COEFS).map(k => (
                                      <option key={k} value={k}>{k}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="p-3">
                                  <select
                                    value={formData.properties?.productType || ''}
                                    onChange={e => setFormData({
                                      ...formData,
                                      properties: { ...formData.properties, productType: e.target.value }
                                    })}
                                    className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs"
                                  >
                                    {productTypes.map(p => (
                                      <option key={p.id} value={p.name}>{p.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="p-3 text-center">
                                  <input
                                    type="text"
                                    value={formData.properties?.unit || ''}
                                    onChange={e => setFormData({
                                      ...formData,
                                      properties: { ...formData.properties, unit: e.target.value }
                                    })}
                                    className="w-full px-1 py-1 bg-white border border-amber-300 rounded text-xs text-center"
                                  />
                                </td>
                              </>
                            )}
                            {activeTab === 'PRODUCT_TYPE' && (
                              <td className="p-3 text-center">
                                <input
                                  type="text"
                                  value={formData.properties?.unit || ''}
                                  onChange={e => setFormData({
                                    ...formData,
                                    properties: { ...formData.properties, unit: e.target.value }
                                  })}
                                  className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs text-center"
                                />
                              </td>
                            )}
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                value={formData.order || 0}
                                onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                                className="w-12 px-1 py-1 bg-white border border-amber-300 rounded text-xs text-center"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <select
                                value={formData.status || 'Đang dùng'}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                                className="w-full px-1 py-1 bg-white border border-amber-300 rounded text-xs text-center"
                              >
                                <option value="Đang dùng">Đang dùng</option>
                                <option value="Tạm khóa">Tạm khóa</option>
                              </select>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleSave(c.id)}
                                  className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition shadow-2xs"
                                  title="Lưu"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setIsEditing(null)}
                                  className="p-1.5 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition"
                                  title="Hủy"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={c.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-slate-800 text-[11px]">{c.code || '-'}</td>
                            <td className="p-3 font-bold text-slate-900">{c.name}</td>
                            {activeTab === 'TASK' && (
                              <>
                                <td className="p-3 font-semibold text-slate-700">
                                  <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-[#1F4E78] font-bold text-[11px]">
                                    {c.properties?.taskGroup || '-'}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-black text-blue-700">
                                  {c.properties?.score ?? 10}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    c.properties?.nature === 'Rất phức tạp' ? 'bg-rose-100 text-rose-800' :
                                    c.properties?.nature === 'Phức tạp' ? 'bg-orange-100 text-orange-800' :
                                    c.properties?.nature === 'Trung bình' ? 'bg-blue-100 text-blue-800' :
                                    'bg-slate-100 text-slate-700'
                                  }`}>
                                    {c.properties?.nature || 'Trung bình'}
                                  </span>
                                </td>
                                <td className="p-3 font-medium text-slate-700">{c.properties?.productType || '-'}</td>
                                <td className="p-3 text-center font-semibold text-slate-600">{c.properties?.unit || '-'}</td>
                              </>
                            )}
                            {activeTab === 'PRODUCT_TYPE' && (
                              <td className="p-3 text-center font-semibold text-slate-700">
                                {c.properties?.unit || c.name}
                              </td>
                            )}
                            <td className="p-3 text-center font-mono text-slate-500">{c.order || 0}</td>
                            <td className="p-3 text-center">
                              {c.status === 'Chờ duyệt' ? (
                                <button
                                  onClick={() => handleApprove(c)}
                                  className="px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-800 font-extrabold text-[10px] cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Sparkles className="w-3 h-3 text-amber-600" />
                                  Duyệt ngay
                                </button>
                              ) : (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  c.status === 'Đang dùng' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {c.status || 'Đang dùng'}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleEdit(c)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                                  title="Chỉnh sửa"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(c.id, c.name)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                                  title="Xóa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
