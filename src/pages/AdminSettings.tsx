import React, { useState, useEffect } from 'react';
import { Download, Upload, FileDown, FileUp, Settings, Plus, Edit2, Trash2, Check, X, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { WORK_NATURE_COEFS } from '../utils';

export default function AdminSettings() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'TASK_GROUP' | 'TASK' | 'PRODUCT_TYPE'>('TASK');
  
  const [isEditing, setIsEditing] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cat: any) => {
    setIsEditing(cat.id);
    setFormData({
      code: cat.code,
      name: cat.name,
      status: cat.status,
      order: cat.order,
      properties: cat.properties || {}
    });
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(categories.filter(c => c.type === activeTab).map(c => ({
      'Mã': c.code,
      'Tên': c.name,
      'Nhóm việc (Nếu là TASK)': c.properties?.taskGroup || '',
      'Điểm chuẩn (Nếu là TASK)': c.properties?.score || '',
      'Tính chất (Nếu là TASK)': c.properties?.nature || '',
      'Loại SP (Nếu là TASK)': c.properties?.productType || '',
      'Đơn vị (Nếu là SP)': c.properties?.unit || '',
      'Trạng thái': c.status,
      'Thứ tự': c.order
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_Muc");
    XLSX.writeFile(wb, `Danh_Muc_${activeTab}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const data = [{
      'Mã': 'VD-01',
      'Tên': 'Tên danh mục mẫu',
      'Nhóm việc (Nếu là TASK)': 'Kế hoạch vốn',
      'Điểm chuẩn (Nếu là TASK)': 10,
      'Tính chất (Nếu là TASK)': 'Trung bình',
      'Loại SP (Nếu là TASK)': 'Bảng tổng hợp',
      'Đơn vị (Nếu là SP)': 'Bảng',
      'Trạng thái': 'Đang dùng',
      'Thứ tự': 1
    }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mau_Danh_Muc");
    XLSX.writeFile(wb, `Mau_Danh_Muc_${activeTab}.xlsx`);
  };

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
        const data = XLSX.utils.sheet_to_json(ws);
        
        let successCount = 0;
        for (const row of data as any[]) {
          const payload = {
            code: row['Mã'] || `${activeTab}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: row['Tên'],
            type: activeTab,
            status: row['Trạng thái'] || 'Đang dùng',
            order: row['Thứ tự'] || 0,
            properties: {
              taskGroup: row['Nhóm việc (Nếu là TASK)'],
              score: row['Điểm chuẩn (Nếu là TASK)'],
              nature: row['Tính chất (Nếu là TASK)'],
              productType: row['Loại SP (Nếu là TASK)'],
              unit: row['Đơn vị (Nếu là SP)']
            }
          };
          if (!payload.name) continue;
          
          await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          successCount++;
        }
        alert(`Đã import thành công ${successCount} bản ghi.`);
        fetchCategories();
      } catch (err) {
        console.error(err);
        alert('Lỗi import file Excel.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // reset
  };

  const handleAddNew = () => {
    const newCat = {
      id: 'new',
      type: activeTab,
      code: '',
      name: '',
      status: 'Đang dùng',
      order: categories.filter(c => c.type === activeTab).length + 1,
      properties: {}
    };
    setIsEditing('new');
    setFormData(newCat);
  };

  const handleSave = async (id: number | string) => {
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
        fetchCategories();
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e) {
      console.error(e);
      alert('Đã xảy ra lỗi khi lưu.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa mục này?')) return;
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchCategories();
      }
    } catch (e) {
      console.error(e);
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
      if (data.success) fetchCategories();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredCategories = categories.filter(c => c.type === activeTab).sort((a, b) => {
    if (a.status === 'Chờ duyệt' && b.status !== 'Chờ duyệt') return -1;
    if (b.status === 'Chờ duyệt' && a.status !== 'Chờ duyệt') return 1;
    return a.order - b.order;
  });

  const taskGroups = categories.filter(c => c.type === 'TASK_GROUP');
  const productTypes = categories.filter(c => c.type === 'PRODUCT_TYPE');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-[#1F4E78] bg-opacity-10 rounded-xl">
          <Settings className="w-8 h-8 text-[#1F4E78]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Cài đặt danh mục</h1>
          <p className="text-sm text-slate-500">Quản lý các danh mục công việc, tính chất và sản phẩm.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          {[
            { id: 'TASK', label: 'Danh mục nhiệm vụ' },
            { id: 'TASK_GROUP', label: 'Nhóm công việc' },
            { id: 'PRODUCT_TYPE', label: 'Loại sản phẩm' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); setIsEditing(null); }}
              className={`px-6 py-4 text-sm font-bold transition-colors ${
                activeTab === tab.id 
                  ? 'border-b-2 border-[#1F4E78] text-[#1F4E78] bg-slate-50' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-800">
              {activeTab === 'TASK' ? 'Danh sách nhiệm vụ' : 
               activeTab === 'TASK_GROUP' ? 'Nhóm công việc' : 'Loại sản phẩm'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-bold text-sm border border-slate-200"
                title="Tải file mẫu"
              >
                <FileDown className="w-4 h-4" />
                <span className="hidden sm:inline">Tải mẫu</span>
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-bold text-sm border border-green-200"
                title="Xuất Excel"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Xuất Excel</span>
              </button>
              <label className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-bold text-sm border border-blue-200 cursor-pointer" title="Nhập từ Excel">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImport} />
              </label>
              <button
                onClick={handleAddNew}
                className="flex items-center gap-2 px-4 py-2 bg-[#1F4E78] text-white rounded-lg hover:bg-opacity-90 font-bold text-sm"
              >
                <Plus className="w-4 h-4" />
                Thêm mới
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="p-4">Mã</th>
                  <th className="p-4">Tên / Nội dung</th>
                  {activeTab === 'TASK' && (
                    <>
                      <th className="p-4">Nhóm việc</th>
                      <th className="p-4">Đc</th>
                      <th className="p-4">Tính chất</th>
                      <th className="p-4">Loại SP</th>
                    </>
                  )}
                  {activeTab === 'PRODUCT_TYPE' && <th className="p-4">Đơn vị tính</th>}
                  <th className="p-4 text-center">Trạng thái</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {isEditing === 'new' && (
                  <tr className="bg-yellow-50">
                    <td className="p-3">
                      <input type="text" className="w-full p-2 border rounded" placeholder="Mã..." value={formData.code || ''} onChange={e => setFormData({...formData, code: e.target.value})} />
                    </td>
                    <td className="p-3">
                      <input type="text" className="w-full p-2 border rounded" placeholder="Tên..." value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </td>
                    {activeTab === 'TASK' && (
                      <>
                        <td className="p-3">
                          <select className="w-full p-2 border rounded" value={formData.properties.taskGroup || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, taskGroup: e.target.value}})}>
                            <option value="">Chọn...</option>
                            {taskGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                          </select>
                        </td>
                        <td className="p-3">
                          <input type="number" className="w-16 p-2 border rounded" placeholder="Đc" value={formData.properties.score || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, score: Number(e.target.value)}})} />
                        </td>
                        <td className="p-3">
                          <select className="w-full p-2 border rounded" value={formData.properties.nature || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, nature: e.target.value}})}>
                            <option value="">Chọn...</option>
                            {Object.keys(WORK_NATURE_COEFS).map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </td>
                        <td className="p-3">
                          <select className="w-full p-2 border rounded" value={formData.properties.productType || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, productType: e.target.value}})}>
                            <option value="">Chọn...</option>
                            {productTypes.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                          </select>
                        </td>
                      </>
                    )}
                    {activeTab === 'PRODUCT_TYPE' && (
                      <td className="p-3">
                        <input type="text" className="w-full p-2 border rounded" placeholder="Đơn vị..." value={formData.properties.unit || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, unit: e.target.value}})} />
                      </td>
                    )}
                    <td className="p-3 text-center">
                      <select className="p-2 border rounded" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                        <option value="Đang dùng">Đang dùng</option>
                        <option value="Ngừng dùng">Ngừng dùng</option>
                        <option value="Chờ duyệt">Chờ duyệt</option>
                      </select>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSave('new')} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setIsEditing(null)} className="p-1.5 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"><X className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                )}
                {filteredCategories.map(cat => isEditing === cat.id ? (
                  <tr key={cat.id} className="bg-yellow-50">
                    <td className="p-3">
                      <input type="text" className="w-full p-2 border rounded" value={formData.code || ''} onChange={e => setFormData({...formData, code: e.target.value})} />
                    </td>
                    <td className="p-3">
                      <input type="text" className="w-full p-2 border rounded" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </td>
                    {activeTab === 'TASK' && (
                      <>
                        <td className="p-3">
                          <select className="w-full p-2 border rounded" value={formData.properties?.taskGroup || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, taskGroup: e.target.value}})}>
                            <option value="">Chọn...</option>
                            {taskGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                          </select>
                        </td>
                        <td className="p-3">
                          <input type="number" className="w-16 p-2 border rounded" value={formData.properties?.score || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, score: Number(e.target.value)}})} />
                        </td>
                        <td className="p-3">
                          <select className="w-full p-2 border rounded" value={formData.properties?.nature || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, nature: e.target.value}})}>
                            <option value="">Chọn...</option>
                            {Object.keys(WORK_NATURE_COEFS).map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </td>
                        <td className="p-3">
                          <select className="w-full p-2 border rounded" value={formData.properties?.productType || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, productType: e.target.value}})}>
                            <option value="">Chọn...</option>
                            {productTypes.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                          </select>
                        </td>
                      </>
                    )}
                    {activeTab === 'PRODUCT_TYPE' && (
                      <td className="p-3">
                        <input type="text" className="w-full p-2 border rounded" value={formData.properties?.unit || ''} onChange={e => setFormData({...formData, properties: {...formData.properties, unit: e.target.value}})} />
                      </td>
                    )}
                    <td className="p-3 text-center">
                      <select className="p-2 border rounded" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                        <option value="Đang dùng">Đang dùng</option>
                        <option value="Ngừng dùng">Ngừng dùng</option>
                        <option value="Chờ duyệt">Chờ duyệt</option>
                      </select>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSave(cat.id)} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setIsEditing(null)} className="p-1.5 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"><X className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={cat.id} className={`hover:bg-slate-50 transition-colors ${cat.status === 'Chờ duyệt' ? 'bg-orange-50' : ''}`}>
                    <td className="p-4 font-medium text-slate-900">{cat.code}</td>
                    <td className="p-4 font-bold text-slate-800">
                      {cat.name}
                      {cat.status === 'Chờ duyệt' && (
                        <div className="text-xs text-orange-600 font-normal mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Đề xuất mới
                        </div>
                      )}
                    </td>
                    {activeTab === 'TASK' && (
                      <>
                        <td className="p-4 text-slate-600">{cat.properties?.taskGroup}</td>
                        <td className="p-4 font-bold text-[#1F4E78]">{cat.properties?.score}</td>
                        <td className="p-4 text-slate-600">{cat.properties?.nature}</td>
                        <td className="p-4 text-slate-600">{cat.properties?.productType}</td>
                      </>
                    )}
                    {activeTab === 'PRODUCT_TYPE' && (
                      <td className="p-4 text-slate-600">{cat.properties?.unit}</td>
                    )}
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                        cat.status === 'Đang dùng' ? 'bg-green-100 text-green-700' :
                        cat.status === 'Chờ duyệt' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {cat.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        {cat.status === 'Chờ duyệt' && (
                          <button onClick={() => handleApprove(cat)} title="Phê duyệt" className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleEdit(cat)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(cat.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCategories.length === 0 && isEditing !== 'new' && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-500">
                      Chưa có dữ liệu danh mục.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
