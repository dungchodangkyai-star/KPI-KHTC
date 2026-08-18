import React, { useState, useEffect } from 'react';
import { 
  Download, Upload, FileDown, Settings, Plus, Edit2, Trash2, 
  Check, X, AlertCircle, Sliders, Building2, Search, Filter, 
  Layers, CheckCircle2, RefreshCw, FolderTree, Package, Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { WORK_NATURE_COEFS } from '../utils';
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

  // EXPORT EXCEL
  const handleExport = () => {
    let filename = `Danh_Muc_${activeTab}.xlsx`;
    let wsData: any[] = [];

    if (activeTab === 'TASK') {
      filename = `Danh_Muc_Nhiem_Vu.xlsx`;
      wsData = tasks.map((c, idx) => ({
        'Mã': c.code || `NV${String(idx + 1).padStart(2, '0')}`,
        'Tên nhiệm vụ / Công việc': c.name,
        'Nhóm việc (Nếu là TASK)': c.properties?.taskGroup || '',
        'Điểm chuẩn (Nếu là TASK)': c.properties?.score ?? 10,
        'Tính chất (Nếu là TASK)': c.properties?.nature || 'Trung bình',
        'Loại SP (Nếu là TASK)': c.properties?.productType || 'Khác',
        'Đơn vị (Nếu là SP)': c.properties?.unit || 'Sản phẩm',
        'Trạng thái': c.status || 'Đang dùng',
        'Thứ tự': c.order || idx + 1
      }));
    } else if (activeTab === 'TASK_GROUP') {
      filename = `Danh_Sach_Nhom_Cong_Viec.xlsx`;
      wsData = taskGroups.map((c, idx) => ({
        'Mã': c.code || `GRP_${idx + 1}`,
        'Tên nhóm công việc': c.name,
        'Thứ tự': c.order || idx + 1,
        'Trạng thái': c.status || 'Đang dùng'
      }));
    } else if (activeTab === 'PRODUCT_TYPE') {
      filename = `Danh_Sach_Loai_San_Pham.xlsx`;
      wsData = productTypes.map((c, idx) => ({
        'Mã': c.code || `PROD_${idx + 1}`,
        'Tên loại sản phẩm': c.name,
        'Đơn vị tính': c.properties?.unit || c.name,
        'Thứ tự': c.order || idx + 1,
        'Trạng thái': c.status || 'Đang dùng'
      }));
    }

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_Muc");
    XLSX.writeFile(wb, filename);
    showNotice('success', `Đã xuất thành công file ${filename}`);
  };

  // DOWNLOAD EXCEL TEMPLATE
  const handleDownloadTemplate = () => {
    let filename = `Mau_Danh_Muc_${activeTab}.xlsx`;
    let sampleData: any[] = [];

    if (activeTab === 'TASK') {
      filename = `Mau_Danh_Muc_Nhiem_Vu.xlsx`;
      sampleData = [
        {
          'Mã': 'KH01',
          'Tên nhiệm vụ / Công việc': 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn',
          'Nhóm việc (Nếu là TASK)': 'Kế hoạch vốn',
          'Điểm chuẩn (Nếu là TASK)': 10,
          'Tính chất (Nếu là TASK)': 'Trung bình',
          'Loại SP (Nếu là TASK)': 'Bảng tổng hợp',
          'Đơn vị (Nếu là SP)': 'Bảng',
          'Trạng thái': 'Đang dùng',
          'Thứ tự': 1
        },
        {
          'Mã': 'B2.1',
          'Tên nhiệm vụ / Công việc': 'Kiểm tra, rà soát hồ sơ tạm ứng, thanh toán khối lượng hoàn thành',
          'Nhóm việc (Nếu là TASK)': 'Thanh toán, giải ngân',
          'Điểm chuẩn (Nếu là TASK)': 12,
          'Tính chất (Nếu là TASK)': 'Phức tạp',
          'Loại SP (Nếu là TASK)': 'Hồ sơ thanh toán',
          'Đơn vị (Nếu là SP)': 'Hồ sơ',
          'Trạng thái': 'Đang dùng',
          'Thứ tự': 2
        },
        {
          'Mã': 'QT01',
          'Tên nhiệm vụ / Công việc': 'Lập hồ sơ quyết toán A-B',
          'Nhóm việc (Nếu là TASK)': 'Quyết toán',
          'Điểm chuẩn (Nếu là TASK)': 12,
          'Tính chất (Nếu là TASK)': 'Rất phức tạp',
          'Loại SP (Nếu là TASK)': 'Hồ sơ quyết toán',
          'Đơn vị (Nếu là SP)': 'Hồ sơ',
          'Trạng thái': 'Đang dùng',
          'Thứ tự': 3
        },
        {
          'Mã': 'HD01',
          'Tên nhiệm vụ / Công việc': 'Điều chỉnh thông tin hợp đồng',
          'Nhóm việc (Nếu là TASK)': 'Quản lý hợp đồng',
          'Điểm chuẩn (Nếu là TASK)': 1,
          'Tính chất (Nếu là TASK)': 'Rất đơn giản',
          'Loại SP (Nếu là TASK)': 'PL hợp đồng',
          'Đơn vị (Nếu là SP)': 'Bộ',
          'Trạng thái': 'Đang dùng',
          'Thứ tự': 4
        }
      ];
    } else if (activeTab === 'TASK_GROUP') {
      filename = `Mau_Nhom_Cong_Viec.xlsx`;
      sampleData = [
        { 'Mã': 'GRP_VON', 'Tên nhóm công việc': 'Kế hoạch vốn', 'Thứ tự': 1, 'Trạng thái': 'Đang dùng' },
        { 'Mã': 'GRP_THANHTOAN', 'Tên nhóm công việc': 'Thanh toán, giải ngân', 'Thứ tự': 2, 'Trạng thái': 'Đang dùng' },
        { 'Mã': 'GRP_QUYETTOAN', 'Tên nhóm công việc': 'Quyết toán', 'Thứ tự': 3, 'Trạng thái': 'Đang dùng' },
        { 'Mã': 'GRP_QLHD', 'Tên nhóm công việc': 'Quản lý hợp đồng', 'Thứ tự': 4, 'Trạng thái': 'Đang dùng' },
        { 'Mã': 'GRP_KETOAN', 'Tên nhóm công việc': 'Kế toán nội bộ', 'Thứ tự': 5, 'Trạng thái': 'Đang dùng' },
        { 'Mã': 'GRP_THUQUY', 'Tên nhóm công việc': 'Thủ quỹ', 'Thứ tự': 6, 'Trạng thái': 'Đang dùng' }
      ];
    } else if (activeTab === 'PRODUCT_TYPE') {
      filename = `Mau_Loai_San_Pham.xlsx`;
      sampleData = [
        { 'Mã': 'PROD_BAOCAO', 'Tên loại sản phẩm': 'Báo cáo', 'Đơn vị tính': 'Báo cáo', 'Thứ tự': 1, 'Trạng thái': 'Đang dùng' },
        { 'Mã': 'PROD_TOTRINH', 'Tên loại sản phẩm': 'Tờ trình', 'Đơn vị tính': 'Tờ trình', 'Thứ tự': 2, 'Trạng thái': 'Đang dùng' },
        { 'Mã': 'PROD_BANG', 'Tên loại sản phẩm': 'Bảng tổng hợp', 'Đơn vị tính': 'Bảng', 'Thứ tự': 3, 'Trạng thái': 'Đang dùng' },
        { 'Mã': 'PROD_HSTT', 'Tên loại sản phẩm': 'Hồ sơ thanh toán', 'Đơn vị tính': 'Hồ sơ', 'Thứ tự': 4, 'Trạng thái': 'Đang dùng' }
      ];
    }

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mau_Danh_Muc");
    XLSX.writeFile(wb, filename);
  };

  // SMART IMPORT EXCEL
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);
        
        if (!rows || rows.length === 0) {
          showNotice('error', 'File Excel không có dữ liệu!');
          return;
        }

        // Helper to get row value by multiple possible header keys
        const getVal = (row: any, keys: string[]) => {
          for (const k of keys) {
            if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
              return row[k];
            }
          }
          return undefined;
        };

        // Determine if file contains TASK items (has score, nature, or task group)
        const isTaskFile = rows.some(r => 
          getVal(r, ['Nhóm việc (Nếu là TASK)', 'Nhóm việc', 'Nhóm công việc', 'Nhóm', 'Điểm chuẩn (Nếu là TASK)', 'Điểm chuẩn', 'Tính chất (Nếu là TASK)', 'Tính chất']) !== undefined
        );

        let successTasks = 0;
        let syncedGroups = new Set<string>();
        let syncedProducts = new Set<string>();

        // 1. IF IMPORTING TASKS (or file contains Task items)
        if (activeTab === 'TASK' || isTaskFile) {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const name = getVal(row, ['Tên nhiệm vụ / Công việc', 'Tên', 'Tên nhiệm vụ', 'Nội dung', 'TaskName']);
            if (!name) continue;

            const code = getVal(row, ['Mã', 'Mã nhiệm vụ', 'TaskCode', 'Mã số']) || `TASK-${Date.now()}-${i + 1}`;
            const groupName = getVal(row, ['Nhóm việc (Nếu là TASK)', 'Nhóm việc', 'Nhóm công việc', 'Nhóm', 'TaskGroup']) || 'Hành chính - tổng hợp';
            const score = Number(getVal(row, ['Điểm chuẩn (Nếu là TASK)', 'Điểm chuẩn', 'Điểm', 'Đc', 'Score'])) || 10;
            const nature = getVal(row, ['Tính chất (Nếu là TASK)', 'Tính chất', 'Nature']) || 'Trung bình';
            const productType = getVal(row, ['Loại SP (Nếu là TASK)', 'Loại SP', 'Loại sản phẩm', 'ProductType']) || 'Báo cáo';
            const unit = getVal(row, ['Đơn vị (Nếu là SP)', 'Đơn vị', 'Đơn vị tính', 'Unit']) || 'Sản phẩm';
            const status = getVal(row, ['Trạng thái', 'Status']) || 'Đang dùng';
            const order = Number(getVal(row, ['Thứ tự', 'Order', 'STT'])) || (i + 1);

            // Save Task
            const payload = {
              code,
              name,
              type: 'TASK',
              status,
              order,
              properties: {
                taskGroup: groupName,
                score,
                nature,
                productType,
                unit
              }
            };

            await fetch('/api/categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            successTasks++;
            if (groupName) syncedGroups.add(groupName);
            if (productType) syncedProducts.add(productType);
          }

          // Auto-sync Task Groups into TASK_GROUP
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

          // Auto-sync Product Types
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
            `Đã import thành công ${successTasks} nhiệm vụ và tự động đồng bộ ${syncedGroups.size} nhóm công việc liên quan!`
          );
        } else if (activeTab === 'TASK_GROUP') {
          // 2. IMPORT TASK GROUPS
          let groupCount = 0;
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
              body: JSON.stringify({
                code,
                name,
                type: 'TASK_GROUP',
                status,
                order
              })
            });
            groupCount++;
          }
          showNotice('success', `Đã import thành công ${groupCount} nhóm công việc.`);
        } else if (activeTab === 'PRODUCT_TYPE') {
          // 3. IMPORT PRODUCT TYPES
          let prodCount = 0;
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const name = getVal(row, ['Tên loại sản phẩm', 'Tên loại SP', 'Tên', 'ProductTypeName', 'Name']);
            if (!name) continue;

            const code = getVal(row, ['Mã', 'Mã loại SP', 'Mã SP', 'ProductCode']) || `PROD_${Date.now()}_${i + 1}`;
            const unit = getVal(row, ['Đơn vị tính', 'Đơn vị', 'Unit']) || name;
            const status = getVal(row, ['Trạng thái', 'Status']) || 'Đang dùng';
            const order = Number(getVal(row, ['Thứ tự', 'Order', 'STT'])) || (i + 1);

            await fetch('/api/categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code,
                name,
                type: 'PRODUCT_TYPE',
                status,
                order,
                properties: { unit }
              })
            });
            prodCount++;
          }
          showNotice('success', `Đã import thành công ${prodCount} loại sản phẩm.`);
        }

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
        setIsEditing(null);
        showNotice('success', 'Đã lưu danh mục thành công!');
        fetchCategories();
      } else {
        showNotice('error', 'Lỗi: ' + (data.error || 'Không thể lưu'));
      }
    } catch (e) {
      console.error(e);
      showNotice('error', 'Đã xảy ra lỗi khi lưu.');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa mục "${name}"?`)) return;
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showNotice('success', `Đã xóa "${name}" thành công!`);
        fetchCategories();
      } else {
        showNotice('error', 'Lỗi khi xóa: ' + (data.error || ''));
      }
    } catch (e) {
      console.error(e);
      showNotice('error', 'Lỗi mạng khi xóa.');
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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#1F4E78] bg-opacity-10 rounded-2xl">
            <Settings className="w-8 h-8 text-[#1F4E78]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Cài đặt danh mục hệ thống</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Quản lý chuẩn hóa danh mục nhiệm vụ, nhóm công việc, loại sản phẩm và cấu hình KPI
            </p>
          </div>
        </div>

        {/* Quick summary badges */}
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
        <div className={`p-4 rounded-xl border flex items-center justify-between text-sm font-medium transition-all ${
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
          <button onClick={() => setNotification(null)} className="text-xs underline hover:opacity-80">
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
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-bold transition-all ${
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
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
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
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-bold text-xs border border-slate-200 transition-colors"
                    title="Tải file Excel mẫu chuẩn"
                  >
                    <FileDown className="w-4 h-4 text-slate-600" />
                    <span>Tải mẫu</span>
                  </button>

                  <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 font-bold text-xs border border-emerald-200 transition-colors"
                    title="Xuất danh mục ra Excel"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>Xuất Excel</span>
                  </button>

                  <label 
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 font-bold text-xs border border-blue-200 cursor-pointer transition-colors" 
                    title="Import dữ liệu từ file Excel"
                  >
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>Import Excel</span>
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImport} />
                  </label>

                  <button
                    onClick={handleAddNew}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1F4E78] text-white rounded-xl hover:bg-opacity-90 font-bold text-xs shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm mới</span>
                  </button>
                </div>
              </div>

              {/* Filters & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === 'TASK' && (
                    <div className="flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-bold text-slate-600">Lọc nhóm việc:</span>
                      <select
                        value={filterGroup}
                        onChange={(e) => setFilterGroup(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="ALL">Tất cả nhóm việc ({tasks.length})</option>
                        {taskGroups.map(g => (
                          <option key={g.id} value={g.name}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Tìm theo mã, tên, nhóm..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#1F4E78] focus:outline-none w-56"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wider">
                      <th className="p-3.5 w-24">Mã</th>
                      <th className="p-3.5">Tên / Nội dung</th>
                      {activeTab === 'TASK' && (
                        <>
                          <th className="p-3.5">Nhóm công việc</th>
                          <th className="p-3.5 text-center w-20">Điểm chuẩn</th>
                          <th className="p-3.5">Tính chất</th>
                          <th className="p-3.5">Loại sản phẩm</th>
                        </>
                      )}
                      {activeTab === 'PRODUCT_TYPE' && <th className="p-3.5">Đơn vị tính</th>}
                      <th className="p-3.5 text-center w-28">Trạng thái</th>
                      <th className="p-3.5 text-right w-24">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {/* Add New Row Inline Form */}
                    {isEditing === 'new' && (
                      <tr className="bg-amber-50/70 border-b-2 border-amber-300">
                        <td className="p-3">
                          <input 
                            type="text" 
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold" 
                            placeholder="Mã..." 
                            value={formData.code || ''} 
                            onChange={e => setFormData({...formData, code: e.target.value})} 
                          />
                        </td>
                        <td className="p-3">
                          <input 
                            type="text" 
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold" 
                            placeholder="Nhập tên..." 
                            value={formData.name || ''} 
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                          />
                        </td>
                        {activeTab === 'TASK' && (
                          <>
                            <td className="p-3">
                              <select 
                                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-medium" 
                                value={formData.properties?.taskGroup || ''} 
                                onChange={e => setFormData({...formData, properties: {...formData.properties, taskGroup: e.target.value}})}
                              >
                                {taskGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                              </select>
                            </td>
                            <td className="p-3 text-center">
                              <input 
                                type="number" 
                                className="w-16 p-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-center text-[#1F4E78]" 
                                placeholder="Đc" 
                                value={formData.properties?.score ?? 10} 
                                onChange={e => setFormData({...formData, properties: {...formData.properties, score: Number(e.target.value)}})} 
                              />
                            </td>
                            <td className="p-3">
                              <select 
                                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-medium" 
                                value={formData.properties?.nature || 'Trung bình'} 
                                onChange={e => setFormData({...formData, properties: {...formData.properties, nature: e.target.value}})}
                              >
                                {Object.keys(WORK_NATURE_COEFS).map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </td>
                            <td className="p-3">
                              <select 
                                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-medium" 
                                value={formData.properties?.productType || ''} 
                                onChange={e => setFormData({...formData, properties: {...formData.properties, productType: e.target.value}})}
                              >
                                {productTypes.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                              </select>
                            </td>
                          </>
                        )}
                        {activeTab === 'PRODUCT_TYPE' && (
                          <td className="p-3">
                            <input 
                              type="text" 
                              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs" 
                              placeholder="Đơn vị tính..." 
                              value={formData.properties?.unit || ''} 
                              onChange={e => setFormData({...formData, properties: {...formData.properties, unit: e.target.value}})} 
                            />
                          </td>
                        )}
                        <td className="p-3 text-center">
                          <select 
                            className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold" 
                            value={formData.status} 
                            onChange={e => setFormData({...formData, status: e.target.value})}
                          >
                            <option value="Đang dùng">Đang dùng</option>
                            <option value="Ngừng dùng">Ngừng dùng</option>
                          </select>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button 
                              onClick={() => handleSave('new')} 
                              className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-xs" 
                              title="Lưu"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setIsEditing(null)} 
                              className="p-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300" 
                              title="Hủy"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Category List */}
                    {filteredCategories.map(cat => isEditing === cat.id ? (
                      <tr key={cat.id} className="bg-amber-50/70">
                        <td className="p-3">
                          <input 
                            type="text" 
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold" 
                            value={formData.code || ''} 
                            onChange={e => setFormData({...formData, code: e.target.value})} 
                          />
                        </td>
                        <td className="p-3">
                          <input 
                            type="text" 
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold" 
                            value={formData.name || ''} 
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                          />
                        </td>
                        {activeTab === 'TASK' && (
                          <>
                            <td className="p-3">
                              <select 
                                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-medium" 
                                value={formData.properties?.taskGroup || ''} 
                                onChange={e => setFormData({...formData, properties: {...formData.properties, taskGroup: e.target.value}})}
                              >
                                {taskGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                              </select>
                            </td>
                            <td className="p-3 text-center">
                              <input 
                                type="number" 
                                className="w-16 p-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-center text-[#1F4E78]" 
                                value={formData.properties?.score ?? 10} 
                                onChange={e => setFormData({...formData, properties: {...formData.properties, score: Number(e.target.value)}})} 
                              />
                            </td>
                            <td className="p-3">
                              <select 
                                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-medium" 
                                value={formData.properties?.nature || 'Trung bình'} 
                                onChange={e => setFormData({...formData, properties: {...formData.properties, nature: e.target.value}})}
                              >
                                {Object.keys(WORK_NATURE_COEFS).map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </td>
                            <td className="p-3">
                              <select 
                                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-medium" 
                                value={formData.properties?.productType || ''} 
                                onChange={e => setFormData({...formData, properties: {...formData.properties, productType: e.target.value}})}
                              >
                                {productTypes.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                              </select>
                            </td>
                          </>
                        )}
                        {activeTab === 'PRODUCT_TYPE' && (
                          <td className="p-3">
                            <input 
                              type="text" 
                              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs" 
                              value={formData.properties?.unit || ''} 
                              onChange={e => setFormData({...formData, properties: {...formData.properties, unit: e.target.value}})} 
                            />
                          </td>
                        )}
                        <td className="p-3 text-center">
                          <select 
                            className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold" 
                            value={formData.status} 
                            onChange={e => setFormData({...formData, status: e.target.value})}
                          >
                            <option value="Đang dùng">Đang dùng</option>
                            <option value="Ngừng dùng">Ngừng dùng</option>
                            <option value="Chờ duyệt">Chờ duyệt</option>
                          </select>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button 
                              onClick={() => handleSave(cat.id)} 
                              className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-xs" 
                              title="Lưu"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setIsEditing(null)} 
                              className="p-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300" 
                              title="Hủy"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={cat.id} className={`hover:bg-slate-50/80 transition-colors ${cat.status === 'Chờ duyệt' ? 'bg-amber-50/40' : ''}`}>
                        <td className="p-3.5 font-mono text-xs font-bold text-slate-700">{cat.code}</td>
                        <td className="p-3.5 font-bold text-slate-900">
                          {cat.name}
                          {cat.status === 'Chờ duyệt' && (
                            <div className="text-[11px] text-amber-600 font-bold mt-0.5 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Đề xuất từ cán bộ
                            </div>
                          )}
                        </td>
                        {activeTab === 'TASK' && (
                          <>
                            <td className="p-3.5 text-slate-700 text-xs font-semibold">
                              <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                                {cat.properties?.taskGroup || '—'}
                              </span>
                            </td>
                            <td className="p-3.5 text-center font-black text-sm text-[#1F4E78]">
                              {cat.properties?.score ?? 10}
                            </td>
                            <td className="p-3.5 text-xs text-slate-700">
                              <span className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                                cat.properties?.nature === 'Rất phức tạp' ? 'bg-rose-100 text-rose-800' :
                                cat.properties?.nature === 'Phức tạp' ? 'bg-amber-100 text-amber-800' :
                                cat.properties?.nature === 'Đơn giản' || cat.properties?.nature === 'Rất đơn giản' ? 'bg-emerald-100 text-emerald-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {cat.properties?.nature || 'Trung bình'}
                              </span>
                            </td>
                            <td className="p-3.5 text-xs text-slate-600 font-medium">
                              {cat.properties?.productType || '—'}
                            </td>
                          </>
                        )}
                        {activeTab === 'PRODUCT_TYPE' && (
                          <td className="p-3.5 text-xs text-slate-700 font-medium">{cat.properties?.unit || cat.name}</td>
                        )}
                        <td className="p-3.5 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-bold rounded-full ${
                            cat.status === 'Đang dùng' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            cat.status === 'Chờ duyệt' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {cat.status || 'Đang dùng'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex justify-end gap-1">
                            {cat.status === 'Chờ duyệt' && (
                              <button 
                                onClick={() => handleApprove(cat)} 
                                title="Phê duyệt đưa vào danh mục" 
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => handleEdit(cat)} 
                              title="Chỉnh sửa"
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDelete(cat.id, cat.name)} 
                              title="Xóa"
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredCategories.length === 0 && isEditing !== 'new' && (
                      <tr>
                        <td colSpan={10} className="p-12 text-center text-slate-400">
                          <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          <p className="font-bold text-slate-600 text-sm">Chưa có danh mục phù hợp</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {searchTerm ? 'Không tìm thấy kết quả theo từ khóa.' : 'Bấm "+ Thêm mới" hoặc "Import Excel" để nạp dữ liệu.'}
                          </p>
                        </td>
                      </tr>
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
