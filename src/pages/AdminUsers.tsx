import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, Check, X, Shield, Key, Download, Upload, FileDown, CheckSquare, Square, Smartphone, Phone } from 'lucide-react';
import * as XLSX from 'xlsx';
import { exportStyledExcel, downloadStyledTemplate } from '../excelUtils';
import { User as UserType } from '../types';
import { cleanPosition } from '../utils';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: any) => {
    setIsEditing(user.id);
    setFormData({
      uid: user.uid || '',
      email: user.email,
      phone: user.phone || '',
      zalo: user.zalo || '',
      name: user.name,
      role: user.role,
      status: user.status,
      permissions: user.permissions ? JSON.parse(user.permissions) : [],
      position: user.position || '',
      group: user.group || ''
    });
  };

  const handleAddNew = () => {
    setIsEditing('new');
    setFormData({
      email: '',
      phone: '',
      zalo: '',
      name: '',
      role: 'STAFF',
      status: 'Đang làm',
      permissions: [],
      position: '',
      group: ''
    });
  };

  const handleSave = async (id: number | string) => {
    try {
      const method = id === 'new' ? 'POST' : 'PUT';
      const url = id === 'new' ? '/api/users' : `/api/users/${id}`;
      
      const payload = {
        ...formData,
        permissions: JSON.stringify(formData.permissions)
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setIsEditing(null);
        fetchUsers();
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e) {
      console.error(e);
      alert('Đã xảy ra lỗi khi lưu.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tài khoản này? (Lưu ý: Dữ liệu liên quan có thể bị ảnh hưởng)')) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchUsers();
      else alert('Lỗi: ' + data.error);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetPassword = async (user: any) => {
    if (!confirm(`Đặt lại mật khẩu cho tài khoản "${user.name}" (${user.email}) về mặc định (123456@)?\nNgười dùng sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập kế tiếp.`)) return;
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Đã đặt lại mật khẩu cho ${user.name} về mặc định (123456@).`);
        fetchUsers();
      } else {
        alert('Lỗi đặt lại mật khẩu: ' + (data.message || data.error));
      }
    } catch (e) {
      console.error(e);
      alert('Lỗi kết nối khi đặt lại mật khẩu.');
    }
  };

  const EXPORT_COLUMNS = [
    { header: 'Họ và tên', key: 'Họ và tên', width: 25 },
    { header: 'Email', key: 'Email', width: 30 },
    { header: 'Điện thoại', key: 'Điện thoại', width: 15 },
    { header: 'Zalo', key: 'Zalo', width: 15 },
    { header: 'Chức vụ', key: 'Chức vụ', width: 20 },
    { header: 'Nhóm', key: 'Nhóm', width: 20 },
    { header: 'Vai trò', key: 'Vai trò', width: 15 },
    { header: 'Quyền hạn', key: 'Quyền hạn', width: 30 },
    { header: 'Trạng thái', key: 'Trạng thái', width: 15 }
  ];

  const handleExport = () => {
    const exportData = users.map(u => ({
      'Họ và tên': u.name,
      'Email': u.email,
      'Điện thoại': u.phone || '',
      'Zalo': u.zalo || '',
      'Chức vụ': u.position || '',
      'Nhóm': u.group || '',
      'Vai trò': u.role,
      'Quyền hạn': u.permissions || '[]',
      'Trạng thái': u.status
    }));
    exportStyledExcel(exportData, EXPORT_COLUMNS, 'Danh_Sach_Nhan_Su.xlsx', 'Nhan_Su');
  };

  const handleDownloadTemplate = () => {
    const templateData = [{
      'Họ và tên': 'Nguyễn Văn A',
      'Email': 'nva@example.com',
      'Điện thoại': '0901234567',
      'Zalo': '0901234567',
      'Chức vụ': 'Chuyên viên',
      'Nhóm': 'Tài chính',
      'Vai trò': 'STAFF',
      'Quyền hạn': '["view_department_works"]',
      'Trạng thái': 'Đang làm'
    }];
    downloadStyledTemplate(templateData, EXPORT_COLUMNS, 'Mau_Nhan_Su.xlsx', 'Mau_Nhan_Su');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        let successCount = 0;
        for (const row of data as any[]) {
          const payload = {
            name: row['Họ và tên'],
            email: row['Email'],
            phone: row['Điện thoại'] || '',
            zalo: row['Zalo'] || '',
            position: row['Chức vụ'] || '',
            group: row['Nhóm'] || '',
            role: row['Vai trò'] || 'STAFF',
            status: row['Trạng thái'] || 'Đang làm',
            permissions: row['Quyền hạn'] || '[]'
          };
          if (!payload.email || !payload.name) continue;
          
          await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          successCount++;
        }
        alert(`Đã import và cập nhật thành công ${successCount} nhân sự.`);
        fetchUsers();
      } catch (err) {
        console.error(err);
        alert('Lỗi import file Excel.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const togglePermission = (perm: string) => {
    setFormData((prev: any) => {
      const perms = prev.permissions || [];
      if (perm === 'full_access') {
        return { ...prev, permissions: perms.includes('full_access') ? [] : ['full_access'] };
      }
      if (perms.includes(perm)) {
        return { ...prev, permissions: perms.filter((p: string) => p !== perm && p !== 'full_access') };
      } else {
        return { ...prev, permissions: [...perms, perm].filter(p => p !== 'full_access') };
      }
    });
  };

  const PERMISSION_GROUPS = [
    {
      title: 'Điều hành công việc',
      items: [
        { id: 'view_department_works', label: 'Theo dõi công việc toàn phòng', desc: 'Xem toàn phòng, gửi nhắc việc và xử lý lỗi liên kết công việc.' },
        { id: 'manage_works', label: 'Giao, sửa và thu hồi việc', desc: 'Giao việc, điều chỉnh việc đã giao và thu hồi việc theo quy trình.' },
        { id: 'approve_works', label: 'Duyệt công việc', desc: 'Duyệt, không duyệt, yêu cầu bổ sung và duyệt theo danh sách.' }
      ]
    },
    {
      title: 'Đánh giá KPI',
      items: [
        { id: 'evaluate_kpi', label: 'Chấm và duyệt KPI A/C/D', desc: 'Chấm, điều chỉnh và duyệt điểm A, C, D của nhân viên.' },
        { id: 'calculate_kpi', label: 'Tính và làm mới kết quả KPI', desc: 'Tính KPI tháng, theo nhân viên, theo khoảng tháng và làm mới kết quả.' }
      ]
    },
    {
      title: 'Báo cáo',
      items: [
        { id: 'view_department_dashboard', label: 'Xem Dashboard phòng', desc: 'Xem tổng quan, tiến độ và kết quả KPI toàn phòng.' },
        { id: 'view_export_stats', label: 'Xem và xuất thống kê', desc: 'Xem thống kê điều hành và xuất số liệu ra sheet.' },
        { id: 'print_department_kpi', label: 'In báo cáo KPI phòng', desc: 'Tạo và in báo cáo KPI toàn phòng.' }
      ]
    },
    {
      title: 'Làm thêm',
      items: [
        { id: 'approve_ot', label: 'Duyệt làm thêm ngoài giờ', desc: 'Duyệt, yêu cầu bổ sung, hủy và xử lý đăng ký làm thêm.' },
        { id: 'view_department_ot', label: 'Xem tổng hợp làm thêm', desc: 'Xem và in bảng tổng hợp làm thêm của toàn phòng.' }
      ]
    },
    {
      title: 'Quản trị',
      items: [
        { id: 'monitor_sessions', label: 'Theo dõi người đang truy cập', desc: 'Xem các phiên đang hoạt động và lịch sử truy cập gần đây.' },
        { id: 'manage_users', label: 'Quản lý nhân sự và tài khoản', desc: 'Thêm, cập nhật, ngừng sử dụng nhân sự và đặt lại mật mã truy cập.' },
        { id: 'manage_categories', label: 'Quản lý toàn bộ danh mục', desc: 'Quản lý nhóm công việc, nhiệm vụ, sản phẩm, tiêu chí và các danh mục nền.' },
        { id: 'manage_data', label: 'Quản trị dữ liệu', desc: 'Kiểm tra nguồn, nhập dữ liệu, sao lưu, làm mới phạm vi và bảo trì dữ liệu.' },
        { id: 'manage_permissions', label: 'Phân quyền người dùng', desc: 'Cấp, thu hồi từng quyền hoặc toàn quyền cho người dùng khác.' }
      ]
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-[#1F4E78] bg-opacity-10 rounded-xl">
          <Users className="w-8 h-8 text-[#1F4E78]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Quản trị nhân sự</h1>
          <p className="text-sm text-slate-500">Quản lý tài khoản, phân quyền, và thông tin liên hệ.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <h2 className="text-lg font-bold text-slate-800">Danh sách tài khoản</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleDownloadTemplate} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-bold text-sm">
                <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Tải mẫu</span>
              </button>
              <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-bold text-sm">
                <Download className="w-4 h-4" /> <span className="hidden sm:inline">Xuất Excel</span>
              </button>
              <label className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-bold text-sm cursor-pointer">
                <Upload className="w-4 h-4" /> <span className="hidden sm:inline">Import</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImport} />
              </label>
              <button onClick={handleAddNew} className="flex items-center gap-2 px-4 py-2 bg-[#1F4E78] text-white rounded-lg hover:bg-opacity-90 font-bold text-sm">
                <Plus className="w-4 h-4" /> Thêm mới
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="p-4">Thông tin</th>
                  <th className="p-4">Chức vụ / Nhóm</th>
                  <th className="p-4">Vai trò / Phân quyền</th>
                  <th className="p-4 text-center">Trạng thái</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {isEditing && (
                  <tr className="bg-yellow-50/50">
                    <td colSpan={5} className="p-6">
                      <div className="bg-white p-6 rounded-xl border border-yellow-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                          <h3 className="font-bold text-lg text-slate-800">{isEditing === 'new' ? 'Thêm tài khoản mới' : 'Cập nhật tài khoản'}</h3>
                          <button onClick={() => setIsEditing(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                          <div className="space-y-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">Họ và tên *</label>
                              <input type="text" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 transition-colors" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">Email *</label>
                              <input type="email" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 transition-colors" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Điện thoại</label>
                                <input type="text" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 transition-colors" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Zalo</label>
                                <input type="text" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 transition-colors" value={formData.zalo || ''} onChange={e => setFormData({...formData, zalo: e.target.value})} />
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Chức vụ</label>
                                <input type="text" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 transition-colors" value={formData.position || ''} onChange={e => setFormData({...formData, position: e.target.value})} />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Nhóm</label>
                                <input type="text" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 transition-colors" value={formData.group || ''} onChange={e => setFormData({...formData, group: e.target.value})} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Vai trò hệ thống</label>
                                <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-blue-800" value={formData.role || 'STAFF'} onChange={e => setFormData({...formData, role: e.target.value})}>
                                  <option value="STAFF">Nhân viên (STAFF)</option>
                                  <option value="LEADER">Lãnh đạo (LEADER)</option>
                                  <option value="ADMIN">Quản trị viên (ADMIN)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Trạng thái</label>
                                <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                                  <option value="Đang làm">Đang làm</option>
                                  <option value="Đã nghỉ">Đã nghỉ</option>
                                  <option value="Đình chỉ">Đình chỉ</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Phân quyền chi tiết */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
                          <h4 className="font-bold text-lg text-slate-800 mb-2">Ủy quyền chức năng</h4>
                          <p className="text-sm text-slate-500 mb-6">Có thể chọn từng quyền hoặc chọn <strong>Toàn quyền trong Web App</strong>.</p>
                          
                          <label className="flex items-start gap-3 p-4 bg-white border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-50/50 transition-colors mb-6 shadow-sm">
                            <div className="mt-0.5">
                              {formData.permissions?.includes('full_access') ? 
                                <CheckSquare className="w-5 h-5 text-blue-600" /> : 
                                <Square className="w-5 h-5 text-slate-300" />}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800">Toàn quyền trong Web App</div>
                              <div className="text-sm text-slate-500">Tự động có tất cả quyền bên dưới, bao gồm quyền tiếp tục phân quyền cho người khác.</div>
                            </div>
                            <input type="checkbox" className="hidden" checked={formData.permissions?.includes('full_access')} onChange={() => togglePermission('full_access')} />
                          </label>

                          <div className={`space-y-6 ${formData.permissions?.includes('full_access') ? 'opacity-50 pointer-events-none' : ''}`}>
                            {PERMISSION_GROUPS.map((group, idx) => (
                              <div key={idx}>
                                <h5 className="font-bold text-slate-800 mb-3 text-sm">{group.title}</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {group.items.map(p => (
                                    <label key={p.id} className="flex items-start gap-3 cursor-pointer group">
                                      <div className="mt-0.5">
                                        {formData.permissions?.includes(p.id) ? 
                                          <CheckSquare className="w-5 h-5 text-blue-600" /> : 
                                          <Square className="w-5 h-5 text-slate-300 group-hover:border-blue-400" />}
                                      </div>
                                      <div>
                                        <div className="font-bold text-slate-700 text-sm group-hover:text-blue-700">{p.label}</div>
                                        <div className="text-xs text-slate-500">{p.desc}</div>
                                      </div>
                                      <input type="checkbox" className="hidden" checked={formData.permissions?.includes(p.id)} onChange={() => togglePermission(p.id)} />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                          <button onClick={() => setIsEditing(null)} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">
                            Hủy bỏ
                          </button>
                          <button onClick={() => handleSave(isEditing)} className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 shadow-sm">
                            <Check className="w-4 h-4" /> Lưu thông tin
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                
                {users.map((user: any) => {
                  const isMainAdmin = user.email?.toLowerCase() === 'khvanson@gmail.com';
                  return (
                    <tr key={user.id} className={`hover:bg-slate-50 transition-colors ${isEditing === user.id ? 'hidden' : ''}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{user.name}</span>
                          {isMainAdmin && (
                            <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded border border-purple-200">
                              Admin gốc
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mb-1">{user.email}</div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          {user.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {user.phone}</span>}
                          {user.zalo && <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" /> Zalo: {user.zalo}</span>}
                        </div>
                        {user.lastLoginAt && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            Đăng nhập gần nhất: {new Date(user.lastLoginAt).toLocaleString('vi-VN')}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-800">{cleanPosition(user.position)}</div>
                        <div className="text-xs text-slate-500">{user.group || '-'}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-blue-800 text-xs bg-blue-50 inline-block px-2 py-1 rounded mb-1">{user.role}</div>
                        {user.permissions && user.permissions !== '[]' && (
                          <div className="text-[11px] text-slate-500 max-w-[200px] truncate" title={user.permissions}>
                            {JSON.parse(user.permissions).includes('full_access') ? '⭐ Toàn quyền' : `+ ${JSON.parse(user.permissions).length} quyền`}
                          </div>
                        )}
                        <div className="mt-1">
                          {user.mustChangePassword ? (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Mật khẩu mặc định (123456@)
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              Đã đổi mật khẩu riêng
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                          user.status === 'Đang làm' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button 
                            onClick={() => handleResetPassword(user)} 
                            title="Đặt lại mật khẩu về 123456@" 
                            className="p-2 text-amber-700 hover:bg-amber-50 border border-amber-200 rounded-lg transition"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleEdit(user)} 
                            title="Sửa thông tin & Phân quyền" 
                            className="p-2 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!isMainAdmin && (
                            <button 
                              onClick={() => handleDelete(user.id)} 
                              title="Xóa tài khoản" 
                              className="p-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && !isEditing && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">Chưa có dữ liệu nhân sự.</td>
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
