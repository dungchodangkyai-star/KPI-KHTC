import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Plus, Edit2, Trash2, Check, X, Shield, Key, Download, Upload, 
  FileDown, CheckSquare, Square, Smartphone, Phone, Send, Clock, Award, 
  Activity, LayoutDashboard, BarChart3, Printer, Database, Radio, Settings, 
  Info, Search, Sparkles, UserCheck, ShieldCheck, UserPlus, UserX, CheckCircle2, 
  XCircle, AlertTriangle, Bell, ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { exportStyledExcel, downloadStyledTemplate } from '../excelUtils';
import { cleanPosition } from '../utils';

interface PermissionItem {
  id: string;
  label: string;
  desc: string;
  icon: any;
  aliases?: string[];
}

interface PermissionGroup {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  badgeColor: string;
  items: PermissionItem[];
}

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  const [isEditing, setIsEditing] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

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

  const handleApproveUser = async (user: any) => {
    if (!confirm(`Xác nhận PHÊ DUYỆT tài khoản cho nhân sự "${user.name}" (${user.email})?\n\n- Trạng thái sẽ chuyển thành: "Đang làm"\n- Mật khẩu mặc định kích hoạt ban đầu: 123456@\n- Nhân sự sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.`)) return;
    
    setActionLoadingId(user.id);
    try {
      const res = await fetch('/api/auth/approve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          role: user.role || 'STAFF',
          position: user.position || 'Chuyên viên',
          group: user.group || 'Kế hoạch - Tài chính'
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Đã phê duyệt tài khoản cho ${user.name} thành công!`);
        fetchUsers();
      } else {
        alert('Lỗi phê duyệt: ' + (data.message || data.error));
      }
    } catch (e) {
      console.error(e);
      alert('Lỗi kết nối máy chủ khi phê duyệt.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectUser = async (user: any) => {
    if (!confirm(`Bạn có chắc chắn muốn TỪ CHỐI yêu cầu đăng ký của "${user.name}" (${user.email})?\nTài khoản sẽ chuyển sang trạng thái "Từ chối" và không thể đăng nhập.`)) return;
    
    setActionLoadingId(user.id);
    try {
      const res = await fetch('/api/auth/reject-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Đã từ chối yêu cầu đăng ký của ${user.name}.`);
        fetchUsers();
      } else {
        alert('Lỗi: ' + (data.message || data.error));
      }
    } catch (e) {
      console.error(e);
      alert('Lỗi kết nối khi từ chối.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEdit = (user: any) => {
    setIsEditing(user.id);
    let parsedPerms: string[] = [];
    if (user.permissions) {
      try {
        parsedPerms = JSON.parse(user.permissions);
      } catch {
        parsedPerms = [user.permissions];
      }
    }
    setFormData({
      uid: user.uid || '',
      email: user.email,
      phone: user.phone || '',
      zalo: user.zalo || '',
      name: user.name,
      role: user.role,
      status: user.status || 'Đang làm',
      permissions: parsedPerms,
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
        permissions: JSON.stringify(formData.permissions || [])
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setIsEditing(null);
        // If current logged-in user was modified, sync localStorage
        try {
          const storedUserStr = localStorage.getItem('kpi_logged_in_user');
          if (storedUserStr && data.data) {
            const stored = JSON.parse(storedUserStr);
            if (stored.id === data.data.id || stored.email?.toLowerCase() === data.data.email?.toLowerCase()) {
              localStorage.setItem('kpi_logged_in_user', JSON.stringify({
                ...stored,
                ...data.data
              }));
              window.dispatchEvent(new Event('kpi_user_changed'));
            }
          }
        } catch (err) {
          console.error("Sync current user error:", err);
        }
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
      'Quyền hạn': '["assign_task", "approve_works"]',
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

  // Permission definitions corresponding 100% with the web application tabs & structure
  const PERMISSION_GROUPS: PermissionGroup[] = [
    {
      id: 'group_dispatch',
      title: 'ĐIỀU HÀNH & PHÊ DUYỆT',
      subtitle: 'Phân công nhiệm vụ, phê duyệt tiến độ, làm thêm và KPI toàn phòng',
      icon: Send,
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      items: [
        { 
          id: 'assign_task', 
          aliases: ['manage_works'],
          label: 'Giao việc', 
          desc: 'Phân công nhiệm vụ cho nhân sự, điều chỉnh tiến độ và thu hồi công việc đã giao.',
          icon: Send
        },
        { 
          id: 'approve_works', 
          label: 'Duyệt việc', 
          desc: 'Phê duyệt tiến độ, xác nhận kết quả, duyệt hoặc từ chối hồ sơ công việc.',
          icon: CheckSquare
        },
        { 
          id: 'approve_ot', 
          label: 'Duyệt làm thêm', 
          desc: 'Phê duyệt phiếu đăng ký làm thêm ngoài giờ, yêu cầu bổ sung hoặc xử lý làm thêm.',
          icon: Clock
        },
        { 
          id: 'evaluate_kpi', 
          aliases: ['calculate_kpi'],
          label: 'Chấm/duyệt KPI A/C/D', 
          desc: 'Chấm điểm, điều chỉnh và duyệt kết quả KPI các tiêu chí A, C, D của toàn phòng.',
          icon: Award
        },
        { 
          id: 'monitor_works', 
          aliases: ['view_department_works'],
          label: 'Theo dõi & Giám sát', 
          desc: 'Giám sát tiến độ toàn phòng, phát hiện công việc trễ hạn và cảnh báo điều hành.',
          icon: Activity
        }
      ]
    },
    {
      id: 'group_reports',
      title: 'BÁO CÁO & TỔNG HỢP',
      subtitle: 'Tra cứu tổng hợp KPI, xem Dashboard, thống kê số liệu và in ấn',
      icon: BarChart3,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      items: [
        { 
          id: 'view_department_kpi', 
          label: 'Tổng hợp KPI', 
          desc: 'Bảng tổng hợp & tra cứu kết quả KPI toàn phòng, tính toán và làm mới kết quả.',
          icon: Award
        },
        { 
          id: 'view_department_dashboard', 
          label: 'Dashboard tổng quan', 
          desc: 'Xem Dashboard tổng quan tiến độ, tỷ lệ hoàn thành và bảng xếp hạng KPI toàn phòng.',
          icon: LayoutDashboard
        },
        { 
          id: 'view_export_stats', 
          label: 'Thống kê - Báo cáo', 
          desc: 'Báo cáo số liệu điều hành, phân tích biểu đồ và xuất dữ liệu ra Excel.',
          icon: BarChart3
        },
        { 
          id: 'print_department_kpi', 
          label: 'In báo cáo phòng', 
          desc: 'Tạo, xem trước và in bảng tổng hợp đánh giá kết quả KPI toàn phòng.',
          icon: Printer
        },
        { 
          id: 'view_department_ot', 
          label: 'Tổng hợp làm thêm', 
          desc: 'Xem bảng tổng hợp số giờ làm thêm và in bảng làm thêm toàn phòng.',
          icon: Database
        }
      ]
    },
    {
      id: 'group_admin',
      title: 'QUẢN TRỊ HỆ THỐNG',
      subtitle: 'Theo dõi phiên, quản trị người dùng, đồng bộ dữ liệu và cấu hình danh mục',
      icon: Settings,
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
      items: [
        { 
          id: 'monitor_sessions', 
          label: 'Đang online', 
          desc: 'Theo dõi các phiên đang truy cập thời gian thực và lịch sử hoạt động.',
          icon: Radio
        },
        { 
          id: 'manage_users', 
          label: 'Nhân sự/Tài khoản', 
          desc: 'Quản lý thông tin nhân sự, tạo tài khoản và đặt lại mật mã truy cập.',
          icon: Users
        },
        { 
          id: 'manage_data', 
          label: 'Đồng bộ dữ liệu', 
          desc: 'Import từ Excel / Google App Script, xuất dữ liệu và sao lưu cơ sở dữ liệu.',
          icon: Database
        },
        { 
          id: 'manage_categories', 
          label: 'Cài đặt danh mục', 
          desc: 'Cấu hình nhóm nhiệm vụ, danh mục sản phẩm, thang điểm và tham số hệ thống.',
          icon: Settings
        },
        { 
          id: 'manage_permissions', 
          label: 'Phân quyền người dùng', 
          desc: 'Cấp, thu hồi từng quyền hạn hoặc phân quyền cho người dùng khác.',
          icon: Shield
        }
      ]
    }
  ];

  const allPermissionIds = useMemo(() => {
    const ids: string[] = [];
    PERMISSION_GROUPS.forEach(g => {
      g.items.forEach(item => ids.push(item.id));
    });
    return ids;
  }, []);

  const isPermActive = (permId: string, aliases: string[] = []) => {
    const perms = formData.permissions || [];
    if (perms.includes('full_access')) return true;
    if (perms.includes(permId)) return true;
    if (aliases && aliases.some(a => perms.includes(a))) return true;
    return false;
  };

  const togglePermission = (permId: string, aliases: string[] = []) => {
    setFormData((prev: any) => {
      const perms = prev.permissions || [];
      if (permId === 'full_access') {
        return { ...prev, permissions: perms.includes('full_access') ? [] : ['full_access'] };
      }
      
      const toRemove = [permId, ...(aliases || [])];
      const hasIt = isPermActive(permId, aliases);

      if (hasIt) {
        return { 
          ...prev, 
          permissions: perms.filter((p: string) => !toRemove.includes(p) && p !== 'full_access') 
        };
      } else {
        return { 
          ...prev, 
          permissions: [...perms.filter((p: string) => p !== 'full_access'), permId] 
        };
      }
    });
  };

  const toggleGroupAll = (group: PermissionGroup) => {
    const groupItemIds = group.items.map(i => i.id);
    const perms = formData.permissions || [];
    
    // Check if all items in this group are already selected
    const allSelected = group.items.every(i => isPermActive(i.id, i.aliases));
    
    if (allSelected) {
      // Unselect all items in this group
      const allToRemove = group.items.flatMap(i => [i.id, ...(i.aliases || [])]);
      setFormData({
        ...formData,
        permissions: perms.filter((p: string) => !allToRemove.includes(p) && p !== 'full_access')
      });
    } else {
      // Select all items in this group
      const newPerms = new Set(perms.filter((p: string) => p !== 'full_access'));
      groupItemIds.forEach(id => newPerms.add(id));
      setFormData({
        ...formData,
        permissions: Array.from(newPerms)
      });
    }
  };

  const handleSelectLeadershipPreset = () => {
    // Quick preset for Leaders/Managers: all permissions in Điều hành & Báo cáo
    const leadershipPerms = [
      'assign_task', 'approve_works', 'approve_ot', 'evaluate_kpi', 'monitor_works',
      'view_department_kpi', 'view_department_dashboard', 'view_export_stats', 'print_department_kpi', 'view_department_ot'
    ];
    setFormData({
      ...formData,
      permissions: leadershipPerms
    });
  };

  const pendingUsers = useMemo(() => {
    return users.filter(u => u.status === 'Chờ duyệt');
  }, [users]);

  const activeUsersCount = useMemo(() => {
    return users.filter(u => u.status === 'Đang làm').length;
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = !searchQuery.trim() || 
        u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.position?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.group?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;

      let matchStatus = true;
      if (statusFilter === 'Đang làm') {
        matchStatus = u.status === 'Đang làm';
      } else if (statusFilter === 'Chờ duyệt') {
        matchStatus = u.status === 'Chờ duyệt';
      } else if (statusFilter === 'OTHER') {
        matchStatus = u.status !== 'Đang làm' && u.status !== 'Chờ duyệt';
      }

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const selectedCount = useMemo(() => {
    const perms = formData.permissions || [];
    if (perms.includes('full_access')) return allPermissionIds.length;
    return allPermissionIds.filter(id => isPermActive(id)).length;
  }, [formData.permissions, allPermissionIds]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#1F4E78] text-white rounded-2xl shadow-sm">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-800">Quản trị Nhân sự & Tài khoản</h1>
              <span className="text-xs font-extrabold bg-blue-100 text-[#1F4E78] px-2.5 py-0.5 rounded-full border border-blue-200">
                {users.length} nhân sự
              </span>
              {pendingUsers.length > 0 && (
                <span className="text-xs font-black bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300 animate-pulse flex items-center gap-1">
                  <Bell className="w-3 h-3 text-amber-600" />
                  {pendingUsers.length} chờ duyệt
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Quản lý danh sách nhân sự, phê duyệt đăng ký mới, phân quyền tác vụ theo đúng phạm vi điều hành, báo cáo và hệ thống.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={handleDownloadTemplate} 
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-bold text-sm border border-slate-200 transition"
          >
            <FileDown className="w-4 h-4 text-slate-500" /> <span className="hidden sm:inline">Tải mẫu</span>
          </button>
          <button 
            onClick={handleExport} 
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-800 rounded-xl hover:bg-emerald-100 font-bold text-sm border border-emerald-200 transition"
          >
            <Download className="w-4 h-4 text-emerald-600" /> <span className="hidden sm:inline">Xuất Excel</span>
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-800 rounded-xl hover:bg-blue-100 font-bold text-sm border border-blue-200 cursor-pointer transition">
            <Upload className="w-4 h-4 text-blue-600" /> <span className="hidden sm:inline">Import Excel</span>
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImport} />
          </label>
          <button 
            onClick={handleAddNew} 
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1F4E78] text-white rounded-xl hover:bg-[#173a5a] font-bold text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Thêm mới tài khoản
          </button>
        </div>
      </div>

      {/* PENDING APPROVAL ALERT BANNER (Shows when there are users waiting for approval) */}
      {pendingUsers.length > 0 && (
        <div className="bg-linear-to-r from-amber-500/10 via-amber-400/5 to-transparent border-2 border-amber-300 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-amber-200/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-amber-950 flex items-center gap-2">
                  Yêu cầu đăng ký tài khoản mới ({pendingUsers.length})
                  <span className="text-[11px] font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full uppercase">
                    Cần phê duyệt
                  </span>
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Nhân sự đăng ký tài khoản từ trang đăng nhập. Sau khi Quản trị viên duyệt, tài khoản sẽ được kích hoạt với mật khẩu mặc định <code className="bg-white/80 px-1 py-0.2 rounded font-mono font-bold text-amber-900">123456@</code>.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {pendingUsers.map(user => (
              <div key={user.id} className="bg-white border border-amber-200 rounded-xl p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">{user.name}</h4>
                      <p className="text-xs text-slate-500 font-mono">{user.email}</p>
                    </div>
                    <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300 whitespace-nowrap">
                      Chờ duyệt
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Điện thoại:</span>
                      <span className="font-semibold text-slate-800">{user.phone || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Chức vụ đề xuất:</span>
                      <span className="font-semibold text-slate-800">{cleanPosition(user.position) || 'Chuyên viên'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Nhóm đề xuất:</span>
                      <span className="font-semibold text-slate-800">{user.group || 'Kế hoạch - Tài chính'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleRejectUser(user)}
                    disabled={actionLoadingId === user.id}
                    className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 border border-rose-200 disabled:opacity-50"
                  >
                    <UserX className="w-3.5 h-3.5 text-rose-600" />
                    <span>Từ chối</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproveUser(user)}
                    disabled={actionLoadingId === user.id}
                    className="flex-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black transition flex items-center justify-center gap-1 shadow-xs disabled:opacity-50"
                  >
                    {actionLoadingId === user.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Phê duyệt & Kích hoạt</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Tìm theo tên, email, chức vụ, nhóm..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Buttons */}
            <div className="flex items-center bg-slate-200/70 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  statusFilter === 'ALL' ? 'bg-white text-[#1F4E78] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Đang làm')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  statusFilter === 'Đang làm' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đang làm ({activeUsersCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Chờ duyệt')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                  statusFilter === 'Chờ duyệt' ? 'bg-white text-amber-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Chờ duyệt</span>
                {pendingUsers.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                    {pendingUsers.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Vai trò:</span>
              <select 
                value={roleFilter} 
                onChange={e => setRoleFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-[#1F4E78]"
              >
                <option value="ALL">Tất cả vai trò</option>
                <option value="ADMIN">Quản trị viên (ADMIN)</option>
                <option value="LEADER">Lãnh đạo (LEADER)</option>
                <option value="STAFF">Nhân viên (STAFF)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wider">
                <th className="p-4">Thông tin nhân sự</th>
                <th className="p-4">Chức vụ / Nhóm</th>
                <th className="p-4">Vai trò / Phân quyền</th>
                <th className="p-4 text-center">Trạng thái</th>
                <th className="p-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {/* EDIT / CREATE MODAL FORM */}
              {isEditing && (
                <tr className="bg-blue-50/40">
                  <td colSpan={5} className="p-4 sm:p-6">
                    <div className="bg-white p-6 sm:p-7 rounded-2xl border-2 border-blue-300 shadow-md">
                      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-[#1F4E78] font-bold">
                            <Shield className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-black text-xl text-slate-900">
                              {isEditing === 'new' ? 'Thêm mới tài khoản nhân sự' : `Cập nhật thông tin & Phân quyền: ${formData.name || ''}`}
                            </h3>
                            <p className="text-xs text-slate-500">
                              Thiết lập thông tin cá nhân và tích chọn phân quyền tác vụ chi tiết theo từng phạm vi.
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setIsEditing(null)} 
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      
                      {/* Personal & Account Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-slate-50/70 p-5 rounded-2xl border border-slate-200">
                        <div className="space-y-4">
                          <h4 className="text-xs font-black text-[#1F4E78] uppercase tracking-wider flex items-center gap-1.5">
                            <Users className="w-4 h-4" /> 1. Thông tin cơ bản
                          </h4>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên <span className="text-rose-500">*</span></label>
                            <input 
                              type="text" 
                              placeholder="Ví dụ: Nguyễn Văn A"
                              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition-colors font-medium text-slate-800" 
                              value={formData.name || ''} 
                              onChange={e => setFormData({...formData, name: e.target.value})} 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Email tài khoản <span className="text-rose-500">*</span></label>
                            <input 
                              type="email" 
                              placeholder="tennhanvien@daklak.gov.vn"
                              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition-colors font-medium text-slate-800" 
                              value={formData.email || ''} 
                              onChange={e => setFormData({...formData, email: e.target.value})} 
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Điện thoại</label>
                              <input 
                                type="text" 
                                placeholder="0905..."
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition-colors text-slate-800" 
                                value={formData.phone || ''} 
                                onChange={e => setFormData({...formData, phone: e.target.value})} 
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Zalo</label>
                              <input 
                                type="text" 
                                placeholder="0905..."
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition-colors text-slate-800" 
                                value={formData.zalo || ''} 
                                onChange={e => setFormData({...formData, zalo: e.target.value})} 
                              />
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-4">
                          <h4 className="text-xs font-black text-[#1F4E78] uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4" /> 2. Chức danh & Vai trò
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Chức vụ</label>
                              <input 
                                type="text" 
                                placeholder="Chuyên viên, Phó phòng..."
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition-colors text-slate-800" 
                                value={formData.position || ''} 
                                onChange={e => setFormData({...formData, position: e.target.value})} 
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Nhóm / Tổ công tác</label>
                              <input 
                                type="text" 
                                placeholder="Kế hoạch, Tài chính..."
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] transition-colors text-slate-800" 
                                value={formData.group || ''} 
                                onChange={e => setFormData({...formData, group: e.target.value})} 
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Vai trò hệ thống</label>
                              <select 
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-[#1F4E78] focus:border-[#1F4E78]" 
                                value={formData.role || 'STAFF'} 
                                onChange={e => setFormData({...formData, role: e.target.value})}
                              >
                                <option value="STAFF">Nhân viên (STAFF)</option>
                                <option value="LEADER">Lãnh đạo (LEADER)</option>
                                <option value="ADMIN">Quản trị viên (ADMIN)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Trạng thái tài khoản</label>
                              <select 
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 focus:border-[#1F4E78]" 
                                value={formData.status || 'Đang làm'} 
                                onChange={e => setFormData({...formData, status: e.target.value})}
                              >
                                <option value="Đang làm">Đang làm việc (Kích hoạt)</option>
                                <option value="Chờ duyệt">Chờ duyệt (Chưa kích hoạt)</option>
                                <option value="Từ chối">Từ chối đăng ký</option>
                                <option value="Đã nghỉ">Đã nghỉ việc</option>
                                <option value="Đình chỉ">Đình chỉ / Khóa</option>
                              </select>
                            </div>
                          </div>
                          
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                            <div>
                              <strong>Mật khẩu ban đầu:</strong> Mọi tài khoản mới hoặc khi được phê duyệt/đặt lại mật khẩu đều có mật khẩu mặc định là <code className="bg-white px-1.5 py-0.5 rounded border border-blue-300 font-mono font-bold text-rose-600">123456@</code>. Người dùng bắt buộc phải đổi mật khẩu riêng ở lần đăng nhập đầu tiên.
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Phân quyền chi tiết - THIẾT KẾ ĐÚNG CÁC PHẠM VI TÁC VỤ WEB APP */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-lg text-slate-900">3. Phân quyền tác vụ chức năng</h4>
                              <span className="text-xs font-bold px-2 py-0.5 bg-blue-100 text-[#1F4E78] rounded-md border border-blue-200">
                                {formData.permissions?.includes('full_access') ? 'Toàn quyền (15/15)' : `Đã chọn: ${selectedCount}/${allPermissionIds.length} quyền`}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Tích chọn phân quyền chi tiết theo từng vùng phạm vi hoặc cấp Toàn quyền trong Web App.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSelectLeadershipPreset}
                              className="px-3 py-1.5 bg-white border border-blue-300 text-[#1F4E78] hover:bg-blue-50 text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                              Mẫu quyền Lãnh đạo / Phó phòng
                            </button>
                          </div>
                        </div>
                        
                        {/* Option 1: Toàn quyền */}
                        <label className={`flex items-start gap-3.5 p-4 rounded-2xl cursor-pointer transition-all mb-6 border shadow-2xs ${
                          formData.permissions?.includes('full_access')
                            ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-200'
                            : 'bg-white border-slate-300 hover:border-blue-300 hover:bg-blue-50/30'
                        }`}>
                          <div className="mt-0.5">
                            {formData.permissions?.includes('full_access') ? (
                              <CheckSquare className="w-5 h-5 text-blue-700" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 text-sm">Toàn quyền trong Web App (Full Access)</span>
                              <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded border border-purple-300">
                                Tối cao
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Tự động sở hữu toàn bộ tất cả quyền điều hành, phê duyệt, báo cáo và quản trị hệ thống bên dưới.
                            </div>
                          </div>
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            checked={formData.permissions?.includes('full_access')} 
                            onChange={() => togglePermission('full_access')} 
                          />
                        </label>

                        {/* Option 2: Phân quyền theo từng Vùng / Phạm vi */}
                        <div className={`space-y-6 ${formData.permissions?.includes('full_access') ? 'opacity-40 pointer-events-none' : ''}`}>
                          {PERMISSION_GROUPS.map((group) => {
                            const allInGroupSelected = group.items.every(i => isPermActive(i.id, i.aliases));
                            const GroupIcon = group.icon;

                            return (
                              <div key={group.id} className="bg-white rounded-2xl border border-slate-300 p-4 sm:p-5 shadow-2xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-200">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[#1F4E78]">
                                      <GroupIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h5 className="font-black text-slate-900 text-sm">{group.title}</h5>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${group.badgeColor}`}>
                                          {group.items.filter(i => isPermActive(i.id, i.aliases)).length}/{group.items.length} tác vụ
                                        </span>
                                      </div>
                                      <div className="text-xs text-slate-500">{group.subtitle}</div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => toggleGroupAll(group)}
                                    className="self-start sm:self-auto text-xs font-bold text-[#1F4E78] hover:text-blue-800 bg-slate-100 hover:bg-blue-50 px-3 py-1 rounded-lg border border-slate-200 transition"
                                  >
                                    {allInGroupSelected ? 'Bỏ chọn nhóm này' : 'Chọn tất cả nhóm'}
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                  {group.items.map(item => {
                                    const active = isPermActive(item.id, item.aliases);
                                    const ItemIcon = item.icon;
                                    return (
                                      <label 
                                        key={item.id} 
                                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                          active 
                                            ? 'bg-blue-50/70 border-blue-300 text-slate-900 shadow-2xs' 
                                            : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/70 hover:border-slate-300 text-slate-700'
                                        }`}
                                      >
                                        <div className="mt-0.5 shrink-0">
                                          {active ? (
                                            <CheckSquare className="w-4.5 h-4.5 text-blue-700" />
                                          ) : (
                                            <Square className="w-4.5 h-4.5 text-slate-400" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <ItemIcon className={`w-3.5 h-3.5 ${active ? 'text-[#1F4E78]' : 'text-slate-500'}`} />
                                            <span className={`text-xs font-black truncate ${active ? 'text-[#1F4E78]' : 'text-slate-800'}`}>
                                              {item.label}
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                                            {item.desc}
                                          </div>
                                        </div>
                                        <input 
                                          type="checkbox" 
                                          className="hidden" 
                                          checked={active} 
                                          onChange={() => togglePermission(item.id, item.aliases)} 
                                        />
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Personal features notice */}
                          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-start gap-3">
                            <UserCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-black text-xs text-emerald-900 uppercase tracking-wider">
                                Tác vụ cá nhân (Mặc định cho mọi tài khoản)
                              </div>
                              <div className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                                Tất cả nhân sự đăng nhập vào hệ thống đều được cấp sẵn quyền sử dụng các tác vụ cá nhân: <strong>Nhập công việc</strong>, <strong>Công việc của tôi</strong>, <strong>Đăng ký làm thêm</strong>, <strong>Làm thêm của tôi</strong>, <strong>In làm thêm</strong>, <strong>Tự chấm A</strong>, <strong>KPI cá nhân</strong>, <strong>In phiếu KPI</strong>.
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Modal Action Buttons */}
                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                        <button 
                          type="button"
                          onClick={() => setIsEditing(null)} 
                          className="px-5 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 border border-slate-200 transition"
                        >
                          Hủy bỏ
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleSave(isEditing)} 
                          className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-sm transition"
                        >
                          <Check className="w-4 h-4" /> Lưu thông tin
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              
              {/* USERS LIST ROWS */}
              {filteredUsers.map((user: any) => {
                const isMainAdmin = user.email?.toLowerCase() === 'khvanson@gmail.com';
                let parsedUserPerms: string[] = [];
                if (user.permissions) {
                  try {
                    parsedUserPerms = JSON.parse(user.permissions);
                  } catch {
                    parsedUserPerms = [user.permissions];
                  }
                }
                const hasFull = parsedUserPerms.includes('full_access') || user.role === 'ADMIN' || isMainAdmin;

                return (
                  <tr key={user.id} className={`hover:bg-slate-50 transition-colors ${isEditing === user.id ? 'hidden' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900">{user.name}</span>
                        {isMainAdmin && (
                          <span className="text-[10px] font-black bg-purple-100 text-purple-900 px-2 py-0.5 rounded-md border border-purple-300">
                            Admin gốc
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-slate-500 mb-1">{user.email}</div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {user.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> {user.phone}</span>}
                        {user.zalo && <span className="flex items-center gap-1"><Smartphone className="w-3 h-3 text-slate-400" /> Zalo: {user.zalo}</span>}
                      </div>
                      {user.lastLoginAt && (
                        <div className="text-[10px] text-slate-400 mt-1">
                          Đăng nhập gần nhất: {new Date(user.lastLoginAt).toLocaleString('vi-VN')}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-bold text-slate-800">{cleanPosition(user.position)}</div>
                      <div className="text-xs text-slate-500 font-medium">{user.group || '-'}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`font-black text-xs px-2 py-0.5 rounded-md border ${
                          user.role === 'ADMIN' ? 'bg-purple-100 text-purple-900 border-purple-300' :
                          user.role === 'LEADER' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                          'bg-slate-100 text-slate-800 border-slate-300'
                        }`}>
                          {user.role}
                        </span>
                        {hasFull ? (
                          <span className="text-[11px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-500" /> Toàn quyền
                          </span>
                        ) : parsedUserPerms.length > 0 ? (
                          <span className="text-[11px] font-bold text-[#1F4E78] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            + {parsedUserPerms.length} quyền tác vụ
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                            Quyền cá nhân
                          </span>
                        )}
                      </div>

                      <div>
                        {user.mustChangePassword ? (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Mật khẩu mặc định (123456@)
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Đã đổi mật khẩu riêng
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {user.status === 'Đang làm' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Đang làm
                        </span>
                      )}
                      {user.status === 'Chờ duyệt' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-black rounded-full bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Chờ duyệt
                        </span>
                      )}
                      {user.status === 'Từ chối' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          Từ chối
                        </span>
                      )}
                      {user.status === 'Đã nghỉ' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-300">
                          Đã nghỉ
                        </span>
                      )}
                      {user.status === 'Đình chỉ' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800 border border-red-300">
                          <AlertTriangle className="w-3 h-3 text-red-600" />
                          Đình chỉ
                        </span>
                      )}
                      {!['Đang làm', 'Chờ duyệt', 'Từ chối', 'Đã nghỉ', 'Đình chỉ'].includes(user.status) && (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                          {user.status || 'Chưa xác định'}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end items-center gap-1.5">
                        {user.status === 'Chờ duyệt' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveUser(user)}
                              disabled={actionLoadingId === user.id}
                              title="Phê duyệt kích hoạt tài khoản"
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition flex items-center gap-1 shadow-2xs disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Duyệt</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectUser(user)}
                              disabled={actionLoadingId === user.id}
                              title="Từ chối yêu cầu đăng ký"
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
                            >
                              <UserX className="w-3.5 h-3.5 text-rose-600" />
                              <span className="hidden sm:inline">Từ chối</span>
                            </button>
                          </>
                        )}

                        <button 
                          onClick={() => handleResetPassword(user)} 
                          title="Đặt lại mật khẩu về 123456@" 
                          className="p-2 text-amber-700 hover:bg-amber-100/70 border border-amber-200 rounded-xl transition shadow-2xs"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEdit(user)} 
                          title="Sửa thông tin & Phân quyền" 
                          className="p-2 text-blue-700 hover:bg-blue-100/70 border border-blue-200 rounded-xl transition shadow-2xs"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!isMainAdmin && (
                          <button 
                            onClick={() => handleDelete(user.id)} 
                            title="Xóa tài khoản" 
                            className="p-2 text-rose-600 hover:bg-rose-100/70 border border-rose-200 rounded-xl transition shadow-2xs"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && !isEditing && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">
                    Không tìm thấy nhân sự phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
