import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, Users, Briefcase, Send, CheckCircle2, Clock, 
  AlertTriangle, XCircle, Download, RefreshCw, Filter, Layers, 
  Award, TrendingUp, Calendar, ChevronRight, FileSpreadsheet,
  Search, CheckSquare, Square, SlidersHorizontal, Package, FileText,
  Eye, ArrowUpDown, ChevronDown, ChevronUp, RotateCcw, X, Info
} from 'lucide-react';
import { 
  STANDARD_MONTHS, 
  DEFAULT_TASK_GROUPS, 
  formatDate, 
  formatMonth, 
  isSoftDeleted,
  getActiveLoggedInUser,
  formatScore,
  cleanPosition,
  normalizeNFC
} from '../utils';
import { Work, User, Assignment, Overtime, Category } from '../types';
import { useOrgConfig } from '../contexts/OrgContext';
import { exportFullStatsExcel } from '../utils/excelExportStats';

export default function Stats() {
  const { orgConfig } = useOrgConfig();
  const [works, setWorks] = useState<Work[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [overtimes, setOvertimes] = useState<Overtime[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Filter States
  // Multi-select months (Default: current active month '08-2026')
  const [selectedMonths, setSelectedMonths] = useState<string[]>(['08-2026']);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);

  // Filter by User: 'ALL' or specific userId string
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');

  // Filter by Task Group: 'ALL' or group name
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');

  // Filter by Task Category: 'ALL' or task name
  const [selectedTask, setSelectedTask] = useState<string>('ALL');

  // Filter by Product Type: 'ALL' or product type name
  const [selectedProductType, setSelectedProductType] = useState<string>('ALL');

  // Filter by Status: 'ALL' | 'Hoàn thành' | 'Đang xử lý' | 'Chậm' | 'Đã duyệt' | 'Chưa duyệt'
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Search Keyword
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Active Tab View: 'GROUP' | 'TASK' | 'PRODUCT_TYPE' | 'EMPLOYEE' | 'DETAIL'
  const [activeTab, setActiveTab] = useState<'GROUP' | 'TASK' | 'PRODUCT_TYPE' | 'EMPLOYEE' | 'DETAIL'>('GROUP');

  // Work Detail Modal
  const [viewingWork, setViewingWork] = useState<Work | null>(null);

  // Fetch all initial data
  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [resW, resU, resA, resO, resC] = await Promise.all([
        fetch('/api/works'),
        fetch('/api/users'),
        fetch('/api/assignments'),
        fetch('/api/overtimes'),
        fetch('/api/categories')
      ]);
      const [dW, dU, dA, dO, dC] = await Promise.all([
        resW.json(),
        resU.json(),
        resA.json(),
        resO.json(),
        resC.json()
      ]);
      if (dW.success) setWorks(dW.data || []);
      if (dU.success && dU.data?.length > 0) {
        setUsers(dU.data);
        setCurrentUser(getActiveLoggedInUser(dU.data));
      }
      if (dA.success) setAssignments(dA.data || []);
      if (dO.success) setOvertimes(dO.data || []);
      if (dC.success) setCategories(dC.data || []);
    } catch (e) {
      console.error("Stats fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Quick Month Presets
  const handleSelectAllMonths = () => {
    setSelectedMonths([...STANDARD_MONTHS]);
  };

  const handleClearMonths = () => {
    setSelectedMonths([]);
  };

  const handleSelectQuarter = (quarter: number) => {
    if (quarter === 1) setSelectedMonths(['01-2026', '02-2026', '03-2026']);
    else if (quarter === 2) setSelectedMonths(['04-2026', '05-2026', '06-2026']);
    else if (quarter === 3) setSelectedMonths(['07-2026', '08-2026', '09-2026']);
    else if (quarter === 4) setSelectedMonths(['10-2026', '11-2026', '12-2026']);
  };

  const handleSelectHalfYear = (half: number) => {
    if (half === 1) setSelectedMonths(['01-2026', '02-2026', '03-2026', '04-2026', '05-2026', '06-2026']);
    else setSelectedMonths(['07-2026', '08-2026', '09-2026', '10-2026', '11-2026', '12-2026']);
  };

  const toggleMonth = (m: string) => {
    setSelectedMonths(prev => 
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].sort()
    );
  };

  const handleResetFilters = () => {
    setSelectedMonths(['08-2026']);
    setSelectedUserId('ALL');
    setSelectedGroup('ALL');
    setSelectedTask('ALL');
    setSelectedProductType('ALL');
    setSelectedStatus('ALL');
    setSearchKeyword('');
  };

  // Distinct Filter Options derived from Database
  const availableGroups = useMemo(() => {
    const fromCat = categories.filter(c => c.type === 'TASK_GROUP').map(c => c.name);
    const fromWorks = works.map(w => w.taskGroup).filter(Boolean) as string[];
    const combined = Array.from(new Set([...DEFAULT_TASK_GROUPS, ...fromCat, ...fromWorks]));
    return combined.sort();
  }, [categories, works]);

  const availableTasks = useMemo(() => {
    const fromCat = categories.filter(c => c.type === 'TASK').map(c => c.name);
    const fromWorks = works.map(w => w.taskName).filter(Boolean) as string[];
    const combined = Array.from(new Set([...fromCat, ...fromWorks]));
    return combined.sort();
  }, [categories, works]);

  const availableProductTypes = useMemo(() => {
    const fromCat = categories.filter(c => c.type === 'PRODUCT_TYPE').map(c => c.name);
    const fromWorks = works.map(w => w.productType).filter(Boolean) as string[];
    const defaultProducts = ['Báo cáo', 'Tờ trình', 'Hồ sơ thanh toán', 'Hồ sơ quyết toán', 'Bảng tổng hợp', 'Biên bản', 'Văn bản', 'Kế hoạch', 'Hồ sơ'];
    const combined = Array.from(new Set([...defaultProducts, ...fromCat, ...fromWorks]));
    return combined.sort();
  }, [categories, works]);

  // Master Filtered Works
  const filteredWorks = useMemo(() => {
    return works.filter(w => {
      if (isSoftDeleted(w)) return false;

      // Filter by Month selection
      if (selectedMonths.length > 0) {
        const fMonth = formatMonth(w.month);
        if (!selectedMonths.includes(fMonth)) return false;
      }

      // Filter by User
      if (selectedUserId !== 'ALL' && String(w.userId) !== selectedUserId) {
        return false;
      }

      // Filter by Task Group
      if (selectedGroup !== 'ALL' && w.taskGroup !== selectedGroup) {
        return false;
      }

      // Filter by Task Category
      if (selectedTask !== 'ALL' && w.taskName !== selectedTask) {
        return false;
      }

      // Filter by Product Type
      if (selectedProductType !== 'ALL' && w.productType !== selectedProductType) {
        return false;
      }

      // Filter by Status / Approval
      if (selectedStatus === 'Hoàn thành' && w.status !== 'Hoàn thành') return false;
      if (selectedStatus === 'Đang xử lý' && w.status !== 'Đang xử lý') return false;
      if (selectedStatus === 'Chậm' && w.status !== 'Chậm') return false;
      if (selectedStatus === 'Đã duyệt' && w.leaderApproval !== 'Duyệt') return false;
      if (selectedStatus === 'Chưa duyệt' && w.leaderApproval === 'Duyệt') return false;

      // Filter by Keyword
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase();
        const haystack = `${w.workId || ''} ${w.taskCode || ''} ${w.taskName || ''} ${w.taskGroup || ''} ${w.detail || ''} ${w.project || ''} ${w.user?.name || ''} ${w.productType || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [works, selectedMonths, selectedUserId, selectedGroup, selectedTask, selectedProductType, selectedStatus, searchKeyword]);

  // Master Filtered Assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      if (selectedMonths.length > 0) {
        const fMonth = formatMonth(a.month);
        if (!selectedMonths.includes(fMonth)) return false;
      }
      if (selectedUserId !== 'ALL' && String(a.receiverId) !== selectedUserId) {
        return false;
      }
      if (selectedGroup !== 'ALL' && a.taskGroup !== selectedGroup) {
        return false;
      }
      if (selectedTask !== 'ALL' && a.taskName !== selectedTask) {
        return false;
      }
      return true;
    });
  }, [assignments, selectedMonths, selectedUserId, selectedGroup, selectedTask]);

  // Master Filtered Overtimes
  const filteredOvertimes = useMemo(() => {
    return overtimes.filter(o => {
      if (selectedMonths.length > 0) {
        const fMonth = formatMonth(o.month);
        if (!selectedMonths.includes(fMonth)) return false;
      }
      if (selectedUserId !== 'ALL' && String(o.userId) !== selectedUserId) {
        return false;
      }
      return true;
    });
  }, [overtimes, selectedMonths, selectedUserId]);

  // Executive Top Metrics
  const totalWorks = filteredWorks.length;
  const totalAssignedWorks = filteredWorks.filter(w => w.source === 'Giao việc' || w.sysNote?.includes('Giao bởi')).length;
  const totalSelfWorks = totalWorks - totalAssignedWorks;
  const totalCompleted = filteredWorks.filter(w => w.status === 'Hoàn thành').length;
  const totalInProgress = filteredWorks.filter(w => w.status === 'Đang xử lý').length;
  const totalDelayed = filteredWorks.filter(w => w.status === 'Chậm').length;
  const totalApproved = filteredWorks.filter(w => w.leaderApproval === 'Duyệt').length;
  const totalPendingApproval = filteredWorks.filter(w => w.leaderApproval !== 'Duyệt').length;
  const totalScoreB = filteredWorks.reduce((acc, cur) => acc + (parseFloat(cur.convertedScore || '0') || 0), 0);
  const totalProductQty = filteredWorks.reduce((acc, cur) => acc + (cur.productQty || 1), 0);

  const totalOtHours = filteredOvertimes
    .filter(o => o.approvalStatus === 'Đã duyệt')
    .reduce((acc, cur) => acc + (parseFloat(String(cur.approvedHours || cur.hours || '0')) || 0), 0);

  const completionRate = totalWorks > 0 ? Math.round((totalCompleted / totalWorks) * 100) : 0;
  const approvalRate = totalWorks > 0 ? Math.round((totalApproved / totalWorks) * 100) : 0;

  // 1. Group Statistics Calculation
  const groupStats = useMemo(() => {
    const map = new Map<string, any>();
    
    // Seed with all known groups
    availableGroups.forEach(g => {
      map.set(g, {
        group: g,
        count: 0,
        assignCount: 0,
        done: 0,
        approved: 0,
        delayed: 0,
        totalProductQty: 0,
        totalScore: 0,
        userIds: new Set<number>()
      });
    });

    filteredWorks.forEach(w => {
      const g = w.taskGroup || 'Khác';
      if (!map.has(g)) {
        map.set(g, {
          group: g,
          count: 0,
          assignCount: 0,
          done: 0,
          approved: 0,
          delayed: 0,
          totalProductQty: 0,
          totalScore: 0,
          userIds: new Set<number>()
        });
      }
      const item = map.get(g);
      item.count += 1;
      if (w.status === 'Hoàn thành') item.done += 1;
      if (w.status === 'Chậm') item.delayed += 1;
      if (w.leaderApproval === 'Duyệt') item.approved += 1;
      item.totalProductQty += (w.productQty || 1);
      item.totalScore += (parseFloat(w.convertedScore || '0') || 0);
      if (w.userId) item.userIds.add(w.userId);
    });

    filteredAssignments.forEach(a => {
      const g = a.taskGroup || 'Khác';
      if (map.has(g)) {
        map.get(g).assignCount += 1;
      }
    });

    return Array.from(map.values())
      .filter(item => item.count > 0 || item.assignCount > 0)
      .map(item => ({
        ...item,
        totalScore: Math.round(item.totalScore * 100) / 100,
        userCount: item.userIds.size,
        doneRate: item.count > 0 ? Math.round((item.done / item.count) * 100) : 0,
        approvedRate: item.count > 0 ? Math.round((item.approved / item.count) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [availableGroups, filteredWorks, filteredAssignments]);

  // 2. Task Category Statistics Calculation
  const taskStats = useMemo(() => {
    const map = new Map<string, any>();

    filteredWorks.forEach(w => {
      const key = `${w.taskName || 'Chưa đặt tên'}_${w.taskGroup || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          code: w.taskCode || '',
          name: w.taskName || 'Nhiệm vụ chưa phân loại',
          group: w.taskGroup || 'Khác',
          count: 0,
          done: 0,
          approved: 0,
          totalScore: 0,
          userIds: new Set<number>()
        });
      }
      const item = map.get(key);
      item.count += 1;
      if (w.status === 'Hoàn thành') item.done += 1;
      if (w.leaderApproval === 'Duyệt') item.approved += 1;
      item.totalScore += (parseFloat(w.convertedScore || '0') || 0);
      if (w.userId) item.userIds.add(w.userId);
    });

    return Array.from(map.values())
      .map(item => ({
        ...item,
        totalScore: Math.round(item.totalScore * 100) / 100,
        userCount: item.userIds.size,
        doneRate: item.count > 0 ? Math.round((item.done / item.count) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredWorks]);

  // 3. Product Type Statistics Calculation
  const productStats = useMemo(() => {
    const map = new Map<string, any>();

    filteredWorks.forEach(w => {
      const pType = w.productType || 'Sản phẩm khác';
      const unit = w.unit || 'Sản phẩm';
      if (!map.has(pType)) {
        map.set(pType, {
          productType: pType,
          unit: unit,
          totalQty: 0,
          workCount: 0,
          doneCount: 0,
          totalScore: 0
        });
      }
      const item = map.get(pType);
      item.totalQty += (w.productQty || 1);
      item.workCount += 1;
      if (w.status === 'Hoàn thành') item.doneCount += 1;
      item.totalScore += (parseFloat(w.convertedScore || '0') || 0);
    });

    return Array.from(map.values())
      .map(item => ({
        ...item,
        totalScore: Math.round(item.totalScore * 100) / 100,
        doneRate: item.workCount > 0 ? Math.round((item.doneCount / item.workCount) * 100) : 0
      }))
      .sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredWorks]);

  // 4. Employee Statistics Calculation
  const employeeStats = useMemo(() => {
    const targetUsers = selectedUserId === 'ALL' 
      ? users 
      : users.filter(u => String(u.id) === selectedUserId);

    return targetUsers.map(u => {
      const uWorks = filteredWorks.filter(w => w.userId === u.id);
      const uAssigns = filteredAssignments.filter(a => a.receiverId === u.id);
      const uOts = filteredOvertimes.filter(o => o.userId === u.id && o.approvalStatus === 'Đã duyệt');

      const count = uWorks.length;
      const assignedCount = uAssigns.length;
      const completedCount = uWorks.filter(w => w.status === 'Hoàn thành').length;
      const approvedCount = uWorks.filter(w => w.leaderApproval === 'Duyệt').length;
      const delayedCount = uWorks.filter(w => w.status === 'Chậm').length;
      const totalScore = uWorks.reduce((acc, cur) => acc + (parseFloat(cur.convertedScore || '0') || 0), 0);
      const otHours = uOts.reduce((acc, cur) => acc + (parseFloat(String(cur.approvedHours || cur.hours || '0')) || 0), 0);
      const productQty = uWorks.reduce((acc, cur) => acc + (cur.productQty || 1), 0);

      const rate = count > 0 ? Math.round((completedCount / count) * 100) : 0;

      return {
        user: u,
        totalCount: count,
        assignedCount,
        completedCount,
        approvedCount,
        delayedCount,
        productQty,
        totalScoreB: Math.round(totalScore * 100) / 100,
        totalOtHours: Math.round(otHours * 10) / 10,
        completionRate: rate
      };
    }).sort((a, b) => b.totalCount - a.totalCount);
  }, [users, selectedUserId, filteredWorks, filteredAssignments, filteredOvertimes]);

  // Handle Export Excel
  const handleExportFullExcel = async () => {
    try {
      setIsExporting(true);
      const activeUsers = selectedUserId === 'ALL' 
        ? users 
        : users.filter(u => String(u.id) === selectedUserId);

      await exportFullStatsExcel({
        orgConfig,
        selectedMonths,
        selectedUsers: activeUsers,
        groupStats,
        taskStats,
        productStats,
        employeeStats,
        filteredWorks,
        totalWorks,
        totalCompleted,
        totalApproved,
        totalScoreB,
        totalProductQty
      });
    } catch (err) {
      console.error("Export excel error:", err);
      alert("Không thể xuất file Excel: " + String(err));
    } finally {
      setIsExporting(false);
    }
  };

  // Human readable months string
  const monthsBadgeText = selectedMonths.length === 0
    ? 'Chưa chọn tháng nào'
    : selectedMonths.length === 1
      ? `Tháng ${selectedMonths[0]}`
      : selectedMonths.length >= 12
        ? 'Cả năm 2026 (12 tháng)'
        : `${selectedMonths.length} tháng (${selectedMonths.join(', ')})`;

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-[#1F4E78]/10 text-[#1F4E78] uppercase tracking-wider">
                Báo cáo & Thống kê điều hành
              </span>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                {orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính'}
              </span>
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                {monthsBadgeText}
              </span>
            </div>
            <h1 className="text-2xl font-black text-[#1F4E78] tracking-tight">
              Thống kê Báo cáo Công việc Toàn diện
            </h1>
            <p className="text-xs text-slate-600 max-w-4xl mt-1 leading-relaxed">
              Tổng hợp đa chiều theo Nhóm công việc, Danh mục nhiệm vụ, Loại sản phẩm đầu ra và Hiệu suất nhân sự nhằm phục vụ công tác quản trị, báo cáo định kỳ và giao ban lãnh đạo.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button 
              onClick={fetchAll} 
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              title="Làm mới dữ liệu từ máy chủ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>

            <button 
              onClick={handleExportFullExcel}
              disabled={isExporting || totalWorks === 0}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 rounded-xl shadow-sm transition-all transform active:scale-95 disabled:opacity-50"
            >
              <FileSpreadsheet className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
              <span>{isExporting ? 'Đang xuất Excel...' : 'Xuất Excel Báo cáo chuẩn'}</span>
            </button>
          </div>
        </div>

        {/* Multi-Dimensional Filter Bar */}
        <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          
          {/* 1. Multi-Month Selector with Dropdown */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1 flex items-center justify-between">
              <span>Thời gian (Tháng)</span>
              <span className="text-[#1F4E78] font-black">({selectedMonths.length})</span>
            </label>
            <button
              type="button"
              onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 flex items-center justify-between transition-colors text-left"
            >
              <span className="truncate">
                {selectedMonths.length === 0 ? 'Chọn tháng...' : selectedMonths.length === 1 ? `Tháng ${selectedMonths[0]}` : `${selectedMonths.length} tháng được chọn`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-1" />
            </button>

            {/* Month Dropdown Popover */}
            {isMonthDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-3 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-black text-[#1F4E78] uppercase">Chọn tháng thống kê</span>
                  <button 
                    onClick={() => setIsMonthDropdownOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
                  <button onClick={handleSelectAllMonths} className="p-1 bg-blue-50 hover:bg-blue-100 text-[#1F4E78] rounded-lg">Cả năm</button>
                  <button onClick={() => handleSelectHalfYear(1)} className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">6T Đầu</button>
                  <button onClick={() => handleSelectHalfYear(2)} className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">6T Cuối</button>
                  <button onClick={() => handleSelectQuarter(1)} className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg">Quý 1</button>
                  <button onClick={() => handleSelectQuarter(2)} className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg">Quý 2</button>
                  <button onClick={() => handleSelectQuarter(3)} className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg">Quý 3</button>
                  <button onClick={() => handleSelectQuarter(4)} className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg">Quý 4</button>
                  <button onClick={handleClearMonths} className="p-1 col-span-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg">Bỏ chọn hết</button>
                </div>

                {/* Months Grid Checkboxes */}
                <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pt-1">
                  {STANDARD_MONTHS.map(m => {
                    const isSelected = selectedMonths.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMonth(m)}
                        className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center justify-between ${
                          isSelected 
                            ? 'bg-[#1F4E78] text-white border-[#1F4E78] shadow-xs' 
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span>T{m.split('-')[0]}</span>
                        {isSelected ? <CheckSquare className="w-3 h-3 text-white" /> : <Square className="w-3 h-3 text-slate-300" />}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsMonthDropdownOpen(false)}
                    className="px-3 py-1 bg-[#1F4E78] text-white text-xs font-bold rounded-xl"
                  >
                    Xong ({selectedMonths.length} tháng)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Personnel Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Nhân sự thực hiện
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
            >
              <option value="ALL">Tất cả nhân sự ({users.length})</option>
              {users.map(u => (
                <option key={u.id} value={String(u.id)}>
                  {u.name} ({cleanPosition(u.position)})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Task Group Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Nhóm công việc
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
            >
              <option value="ALL">Tất cả nhóm việc ({availableGroups.length})</option>
              {availableGroups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* 4. Product Type Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Loại sản phẩm
            </label>
            <select
              value={selectedProductType}
              onChange={(e) => setSelectedProductType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
            >
              <option value="ALL">Tất cả loại sản phẩm</option>
              {availableProductTypes.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* 5. Status / Approval Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Tiến độ & Duyệt
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="Hoàn thành">Đã hoàn thành</option>
              <option value="Đang xử lý">Đang xử lý</option>
              <option value="Chậm">Chậm tiến độ</option>
              <option value="Đã duyệt">Lãnh đạo đã duyệt</option>
              <option value="Chưa duyệt">Chờ lãnh đạo duyệt</option>
            </select>
          </div>

          {/* 6. Keyword Search */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1 flex items-center justify-between">
              <span>Tìm kiếm</span>
              {(selectedUserId !== 'ALL' || selectedGroup !== 'ALL' || selectedProductType !== 'ALL' || selectedStatus !== 'ALL' || searchKeyword) && (
                <button 
                  onClick={handleResetFilters}
                  className="text-[10px] text-red-600 hover:underline flex items-center gap-0.5"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Đặt lại
                </button>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Mã, tên việc, dự án..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1F4E78]"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

        </div>
      </div>

      {/* Top 6 KPI & Operational Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        
        {/* Metric 1: Total Works */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng việc</span>
            <div className="p-2 bg-blue-50 text-[#1F4E78] rounded-xl">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-[#1F4E78] tracking-tight">{totalWorks}</span>
            <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
              {totalAssignedWorks} việc giao • {totalSelfWorks} tự lập
            </span>
          </div>
        </div>

        {/* Metric 2: Completed Works */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Đã hoàn thành</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-emerald-600 tracking-tight">{totalCompleted}</span>
            <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">
              Đạt {completionRate}% tổng khối lượng
            </span>
          </div>
        </div>

        {/* Metric 3: In Progress & Delayed */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Đang xử lý / Chậm</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-amber-600 tracking-tight">{totalInProgress}</span>
            <span className="text-[10px] text-red-600 font-bold block mt-0.5">
              {totalDelayed > 0 ? `⚠️ ${totalDelayed} việc chậm hạn` : 'Tiến độ đúng hạn'}
            </span>
          </div>
        </div>

        {/* Metric 4: Approved */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Đã phê duyệt</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-indigo-600 tracking-tight">{totalApproved}</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Tỷ lệ duyệt {approvalRate}%
            </span>
          </div>
        </div>

        {/* Metric 5: Converted Score B */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng điểm KPI B</span>
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-[#1F4E78] tracking-tight">
              {formatScore(totalScoreB)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              TB: {totalWorks > 0 ? formatScore(totalScoreB / totalWorks) : 0} đ/việc
            </span>
          </div>
        </div>

        {/* Metric 6: Products & Overtime */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sản phẩm / Giờ OT</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-purple-700 tracking-tight">{totalProductQty} SP</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              OT đã duyệt: <strong className="text-amber-700">{formatScore(totalOtHours)}h</strong>
            </span>
          </div>
        </div>

      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-2xl p-2 shadow-sm border border-slate-200 flex items-center gap-1.5 overflow-x-auto text-xs font-black">
        
        <button
          onClick={() => setActiveTab('GROUP')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'GROUP'
              ? 'bg-[#1F4E78] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Theo Nhóm công việc ({groupStats.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('TASK')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'TASK'
              ? 'bg-[#1F4E78] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Theo Danh mục nhiệm vụ ({taskStats.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('PRODUCT_TYPE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'PRODUCT_TYPE'
              ? 'bg-[#1F4E78] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Theo Loại sản phẩm đầu ra ({productStats.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('EMPLOYEE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'EMPLOYEE'
              ? 'bg-[#1F4E78] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Hiệu suất Nhân sự ({employeeStats.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('DETAIL')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'DETAIL'
              ? 'bg-[#1F4E78] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Sổ chi tiết công việc ({filteredWorks.length})</span>
        </button>

      </div>

      {/* TAB 1: GROUP STATISTICS */}
      {activeTab === 'GROUP' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wide flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
                Thống kê phân bổ khối lượng và hiệu suất theo Nhóm công việc
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tổng hợp số lượng đầu việc, sản phẩm, tỷ lệ hoàn thành và điểm quy đổi theo từng mảng nghiệp vụ chuyên môn.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-xs">
              {monthsBadgeText}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1F4E78] text-white font-bold text-center">
                  <th className="py-3 px-3 w-12">STT</th>
                  <th className="py-3 px-4 text-left">Nhóm công việc</th>
                  <th className="py-3 px-3">Tổng việc</th>
                  <th className="py-3 px-3">Việc giao</th>
                  <th className="py-3 px-3">Hoàn thành</th>
                  <th className="py-3 px-3">Đã duyệt</th>
                  <th className="py-3 px-3">Chậm hạn</th>
                  <th className="py-3 px-4 text-center">Tiến độ hoàn thành</th>
                  <th className="py-3 px-3">Sản lượng SP</th>
                  <th className="py-3 px-3 text-right">Tổng điểm KPI B</th>
                  <th className="py-3 px-3">Nhân sự</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {groupStats.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-slate-400">
                      Không tìm thấy công việc nào thỏa mãn bộ lọc đã chọn.
                    </td>
                  </tr>
                ) : (
                  groupStats.map((st, idx) => (
                    <tr key={st.group} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3.5 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {st.group}
                      </td>
                      <td className="py-3.5 px-3 text-center font-black text-slate-800 text-sm">{st.count}</td>
                      <td className="py-3.5 px-3 text-center">
                        {st.assignCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#1F4E78]">
                            {st.assignCount} việc
                          </span>
                        ) : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-emerald-600">{st.done}</td>
                      <td className="py-3.5 px-3 text-center font-bold text-indigo-600">{st.approved}</td>
                      <td className="py-3.5 px-3 text-center font-bold text-red-600">
                        {st.delayed > 0 ? `${st.delayed}` : '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-24 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${st.doneRate >= 80 ? 'bg-emerald-500' : st.doneRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                              style={{ width: `${st.doneRate}%` }}
                            />
                          </div>
                          <span className="font-bold text-[11px] w-8 text-right">{st.doneRate}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-purple-700">
                        {st.totalProductQty}
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-[#1F4E78] text-sm">
                        {formatScore(st.totalScore)}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-600">
                        {st.userCount} người
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {groupStats.length > 0 && (
                <tfoot>
                  <tr className="bg-emerald-50/80 font-black text-[#0f2440] border-t-2 border-slate-300">
                    <td className="py-3.5 px-3 text-center"></td>
                    <td className="py-3.5 px-4 uppercase text-center">TỔNG CỘNG TOÀN PHÒNG</td>
                    <td className="py-3.5 px-3 text-center text-sm">{totalWorks}</td>
                    <td className="py-3.5 px-3 text-center">{groupStats.reduce((a, b) => a + b.assignCount, 0)}</td>
                    <td className="py-3.5 px-3 text-center text-emerald-700">{totalCompleted}</td>
                    <td className="py-3.5 px-3 text-center text-indigo-700">{totalApproved}</td>
                    <td className="py-3.5 px-3 text-center text-red-700">{totalDelayed}</td>
                    <td className="py-3.5 px-4 text-center text-emerald-800">{completionRate}%</td>
                    <td className="py-3.5 px-3 text-center text-purple-800">{totalProductQty}</td>
                    <td className="py-3.5 px-3 text-right text-sm text-[#1F4E78]">{formatScore(totalScoreB)}</td>
                    <td className="py-3.5 px-3 text-center">{users.length} người</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: TASK CATEGORY STATISTICS */}
      {activeTab === 'TASK' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wide flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
                Thống kê chi tiết theo Danh mục Nhiệm vụ
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Theo dõi tần suất phát sinh, khối lượng hoàn thành và đóng góp điểm KPI của từng đầu mục nhiệm vụ.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-xs">
              {taskStats.length} nhiệm vụ phát sinh
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1F4E78] text-white font-bold text-center">
                  <th className="py-3 px-3 w-12">STT</th>
                  <th className="py-3 px-3 w-20">Mã NV</th>
                  <th className="py-3 px-4 text-left">Tên nhiệm vụ công việc</th>
                  <th className="py-3 px-3 text-left">Thuộc nhóm việc</th>
                  <th className="py-3 px-3">Số lần thực hiện</th>
                  <th className="py-3 px-3">Đã xong</th>
                  <th className="py-3 px-3">Đã duyệt</th>
                  <th className="py-3 px-3">Tỷ lệ xong</th>
                  <th className="py-3 px-3 text-right">Tổng điểm KPI B</th>
                  <th className="py-3 px-3">Số NS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {taskStats.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-400">
                      Không tìm thấy nhiệm vụ nào thỏa mãn bộ lọc đã chọn.
                    </td>
                  </tr>
                ) : (
                  taskStats.map((st, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3.5 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-3.5 px-3 text-center font-bold text-[#1F4E78]">
                        {st.code || '-'}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {st.name}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600 text-xs">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md font-semibold text-[11px]">
                          {st.group}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-black text-slate-800 text-sm">{st.count}</td>
                      <td className="py-3.5 px-3 text-center font-bold text-emerald-600">{st.done}</td>
                      <td className="py-3.5 px-3 text-center font-bold text-indigo-600">{st.approved}</td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-700">{st.doneRate}%</td>
                      <td className="py-3.5 px-3 text-right font-black text-[#1F4E78] text-sm">
                        {formatScore(st.totalScore)}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-600">
                        {st.userCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {taskStats.length > 0 && (
                <tfoot>
                  <tr className="bg-emerald-50/80 font-black text-[#0f2440] border-t-2 border-slate-300">
                    <td className="py-3.5 px-3 text-center"></td>
                    <td className="py-3.5 px-3 text-center"></td>
                    <td className="py-3.5 px-4 uppercase text-center">TỔNG CỘNG</td>
                    <td className="py-3.5 px-3"></td>
                    <td className="py-3.5 px-3 text-center text-sm">{totalWorks}</td>
                    <td className="py-3.5 px-3 text-center text-emerald-700">{totalCompleted}</td>
                    <td className="py-3.5 px-3 text-center text-indigo-700">{totalApproved}</td>
                    <td className="py-3.5 px-3 text-center text-emerald-800">{completionRate}%</td>
                    <td className="py-3.5 px-3 text-right text-sm text-[#1F4E78]">{formatScore(totalScoreB)}</td>
                    <td className="py-3.5 px-3 text-center">{users.length}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PRODUCT TYPES STATISTICS */}
      {activeTab === 'PRODUCT_TYPE' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wide flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
                Thống kê Sản phẩm đầu ra của Phòng
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Bảng tổng hợp các loại sản phẩm (Báo cáo, Tờ trình, Hồ sơ quyết toán, Bảng tổng hợp...) và sản lượng thực tế.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-xs">
              Tổng sản lượng: {totalProductQty} SP
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1F4E78] text-white font-bold text-center">
                  <th className="py-3 px-3 w-12">STT</th>
                  <th className="py-3 px-4 text-left">Loại sản phẩm đầu ra</th>
                  <th className="py-3 px-3">Đơn vị tính</th>
                  <th className="py-3 px-3">Tổng số lượng sản phẩm</th>
                  <th className="py-3 px-3">Số công việc tạo ra SP</th>
                  <th className="py-3 px-3">Đã hoàn thành</th>
                  <th className="py-3 px-3">Tỷ lệ xong</th>
                  <th className="py-3 px-3 text-right">Tổng điểm KPI B tương ứng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {productStats.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      Không tìm thấy sản phẩm nào trong giai đoạn đã lọc.
                    </td>
                  </tr>
                ) : (
                  productStats.map((st, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3.5 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">
                        {st.productType}
                      </td>
                      <td className="py-3.5 px-3 text-center font-semibold text-slate-600">
                        {st.unit || 'Sản phẩm'}
                      </td>
                      <td className="py-3.5 px-3 text-center font-black text-purple-700 text-sm">
                        {st.totalQty}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-800">
                        {st.workCount} việc
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-emerald-600">
                        {st.doneCount}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-700">
                        {st.doneRate}%
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-[#1F4E78] text-sm">
                        {formatScore(st.totalScore)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {productStats.length > 0 && (
                <tfoot>
                  <tr className="bg-emerald-50/80 font-black text-[#0f2440] border-t-2 border-slate-300">
                    <td className="py-3.5 px-3 text-center"></td>
                    <td className="py-3.5 px-4 uppercase text-center">TỔNG CỘNG SẢN LƯỢNG</td>
                    <td className="py-3.5 px-3 text-center">-</td>
                    <td className="py-3.5 px-3 text-center text-sm text-purple-800">{totalProductQty}</td>
                    <td className="py-3.5 px-3 text-center">{totalWorks} việc</td>
                    <td className="py-3.5 px-3 text-center text-emerald-700">{totalCompleted}</td>
                    <td className="py-3.5 px-3 text-center text-emerald-800">{completionRate}%</td>
                    <td className="py-3.5 px-3 text-right text-sm text-[#1F4E78]">{formatScore(totalScoreB)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: EMPLOYEE PERFORMANCE */}
      {activeTab === 'EMPLOYEE' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wide flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
                Thống kê Hiệu suất & Khối lượng từng Nhân sự
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Bảng theo dõi tổng việc thực hiện, việc được giao, tiến độ hoàn thành, điểm KPI B và số giờ làm thêm ngoài giờ.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-xs">
              {employeeStats.length} nhân sự
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1F4E78] text-white font-bold text-center">
                  <th className="py-3 px-3 w-12">STT</th>
                  <th className="py-3 px-4 text-left">Nhân sự</th>
                  <th className="py-3 px-3">Tổng việc</th>
                  <th className="py-3 px-3">Việc giao</th>
                  <th className="py-3 px-3">Hoàn thành</th>
                  <th className="py-3 px-3">Đã duyệt</th>
                  <th className="py-3 px-3">Chậm hạn</th>
                  <th className="py-3 px-4 text-center">Tỷ lệ xong</th>
                  <th className="py-3 px-3">Sản phẩm</th>
                  <th className="py-3 px-3 text-right">Điểm KPI B</th>
                  <th className="py-3 px-3">Giờ OT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {employeeStats.map((st, idx) => (
                  <tr key={st.user.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="py-3.5 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm">{st.user.name}</div>
                      <div className="text-[11px] text-slate-500">{cleanPosition(st.user.position)}</div>
                    </td>
                    <td className="py-3.5 px-3 text-center font-black text-slate-800 text-sm">{st.totalCount}</td>
                    <td className="py-3.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#1F4E78]">
                        {st.assignedCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center font-bold text-emerald-600">{st.completedCount}</td>
                    <td className="py-3.5 px-3 text-center font-bold text-indigo-600">{st.approvedCount}</td>
                    <td className="py-3.5 px-3 text-center font-bold text-red-600">
                      {st.delayedCount > 0 ? `${st.delayedCount}` : '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-20 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${st.completionRate >= 80 ? 'bg-emerald-500' : st.completionRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${st.completionRate}%` }}
                          />
                        </div>
                        <span className="font-bold text-[11px] w-8 text-right">{st.completionRate}%</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center font-bold text-purple-700">{st.productQty}</td>
                    <td className="py-3.5 px-3 text-right font-black text-[#1F4E78] text-sm">
                      {formatScore(st.totalScoreB)}
                    </td>
                    <td className="py-3.5 px-3 text-center font-bold text-amber-700">
                      {st.totalOtHours > 0 ? `${formatScore(st.totalOtHours)}h` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {employeeStats.length > 0 && (
                <tfoot>
                  <tr className="bg-emerald-50/80 font-black text-[#0f2440] border-t-2 border-slate-300">
                    <td className="py-3.5 px-3 text-center"></td>
                    <td className="py-3.5 px-4 uppercase text-center">TỔNG CỘNG</td>
                    <td className="py-3.5 px-3 text-center text-sm">{totalWorks}</td>
                    <td className="py-3.5 px-3 text-center">{employeeStats.reduce((a, b) => a + b.assignedCount, 0)}</td>
                    <td className="py-3.5 px-3 text-center text-emerald-700">{totalCompleted}</td>
                    <td className="py-3.5 px-3 text-center text-indigo-700">{totalApproved}</td>
                    <td className="py-3.5 px-3 text-center text-red-700">{totalDelayed}</td>
                    <td className="py-3.5 px-4 text-center text-emerald-800">{completionRate}%</td>
                    <td className="py-3.5 px-3 text-center text-purple-800">{totalProductQty}</td>
                    <td className="py-3.5 px-3 text-right text-sm text-[#1F4E78]">{formatScore(totalScoreB)}</td>
                    <td className="py-3.5 px-3 text-center text-amber-800">{formatScore(totalOtHours)}h</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: DETAILED WORK LEDGER */}
      {activeTab === 'DETAIL' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wide flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
                Sổ Chi tiết Toàn bộ Công việc trong giai đoạn lọc
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hiển thị chi tiết từng đầu việc, dự án, nội dung, sản phẩm đầu ra, tính chất và điểm số quy đổi.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-xs">
              Hiển thị: <strong>{filteredWorks.length}</strong> / {works.length} bản ghi
            </span>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 shadow-xs">
                <tr className="bg-[#1F4E78] text-white font-bold text-center">
                  <th className="py-3 px-2.5 w-10">STT</th>
                  <th className="py-3 px-2.5 w-20">Tháng</th>
                  <th className="py-3 px-3 text-left">Nhân sự</th>
                  <th className="py-3 px-3 text-left">Nhóm & Nhiệm vụ</th>
                  <th className="py-3 px-3 text-left">Dự án / Nội dung</th>
                  <th className="py-3 px-2.5">Sản phẩm</th>
                  <th className="py-3 px-2.5">Tính chất</th>
                  <th className="py-3 px-2.5 text-right">Điểm B</th>
                  <th className="py-3 px-2.5">Tiến độ</th>
                  <th className="py-3 px-2.5">Duyệt</th>
                  <th className="py-3 px-2.5">Hạn chót</th>
                  <th className="py-3 px-2.5 w-12 text-center">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredWorks.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-slate-400">
                      Không có công việc nào thỏa mãn tiêu chí tìm kiếm.
                    </td>
                  </tr>
                ) : (
                  filteredWorks.map((w, idx) => (
                    <tr key={w.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3 px-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-2.5 text-center font-bold text-slate-700">{formatMonth(w.month)}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{w.user?.name || '-'}</div>
                        <div className="text-[10px] text-slate-500">{cleanPosition(w.user?.position)}</div>
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        <span className="text-[10px] font-bold text-[#1F4E78] block">[{w.taskGroup || 'Khác'}]</span>
                        <span className="font-bold text-slate-800">{w.taskName}</span>
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        {w.project && <div className="text-[10px] font-bold text-indigo-700 truncate">{w.project}</div>}
                        <div className="text-slate-600 line-clamp-2 text-[11px]">{w.detail || '-'}</div>
                      </td>
                      <td className="py-3 px-2.5 text-center">
                        <span className="font-bold text-purple-700 block">{w.productQty || 1} {w.unit || ''}</span>
                        <span className="text-[10px] text-slate-500">{w.productType || '-'}</span>
                      </td>
                      <td className="py-3 px-2.5 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-700">
                          {w.approvedNature || w.proposedNature || 'Trung bình'}
                        </span>
                      </td>
                      <td className="py-3 px-2.5 text-right font-black text-[#1F4E78] text-sm">
                        {formatScore(w.convertedScore)}
                      </td>
                      <td className="py-3 px-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          w.status === 'Hoàn thành' ? 'bg-emerald-100 text-emerald-800' :
                          w.status === 'Chậm' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="py-3 px-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          w.leaderApproval === 'Duyệt' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {w.leaderApproval || 'Chưa duyệt'}
                        </span>
                      </td>
                      <td className="py-3 px-2.5 text-center text-slate-500 text-[11px]">
                        {formatDate(w.endDate)}
                      </td>
                      <td className="py-3 px-2.5 text-center">
                        <button
                          onClick={() => setViewingWork(w)}
                          className="p-1.5 text-[#1F4E78] hover:bg-blue-100 rounded-lg transition-colors"
                          title="Xem chi tiết phiếu công việc"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Work Detail Modal */}
      {viewingWork && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[10px] font-black text-[#1F4E78] uppercase tracking-wider block">
                  Chi tiết bản ghi công việc [{viewingWork.workId}]
                </span>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  {viewingWork.taskName}
                </h3>
              </div>
              <button 
                onClick={() => setViewingWork(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold block mb-1">Người thực hiện:</span>
                <span className="font-bold text-slate-800 text-sm">{viewingWork.user?.name || '-'}</span>
                <span className="text-slate-500 text-[11px] block">{cleanPosition(viewingWork.user?.position)}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold block mb-1">Thời gian thực hiện:</span>
                <span className="font-bold text-slate-800">Tháng {formatMonth(viewingWork.month)}</span>
                <span className="text-slate-500 text-[11px] block">{formatDate(viewingWork.startDate)} → {formatDate(viewingWork.endDate)}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold block mb-1">Nhóm công việc:</span>
                <span className="font-bold text-[#1F4E78]">{viewingWork.taskGroup || 'Khác'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold block mb-1">Sản phẩm đầu ra:</span>
                <span className="font-bold text-purple-700">{viewingWork.productQty || 1} {viewingWork.unit || 'SP'} ({viewingWork.productType || 'Khác'})</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-500 font-bold block mb-1">Tính chất & Điểm chuẩn:</span>
                <span className="font-bold text-slate-800">{viewingWork.approvedNature || viewingWork.proposedNature || 'Trung bình'} (Điểm chuẩn: {viewingWork.baseScore || '0'}đ)</span>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                <span className="text-[#1F4E78] font-bold block mb-1">Điểm KPI B quy đổi:</span>
                <span className="font-black text-[#1F4E78] text-lg">{formatScore(viewingWork.convertedScore)} đ</span>
              </div>
            </div>

            {viewingWork.project && (
              <div className="p-3 bg-indigo-50/50 rounded-xl text-xs">
                <span className="text-indigo-900 font-bold block mb-1">Dự án / Công trình liên quan:</span>
                <span className="text-slate-800 font-medium">{viewingWork.project}</span>
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
              <span className="text-slate-500 font-bold block">Nội dung chi tiết công việc:</span>
              <p className="text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                {viewingWork.detail || 'Không có ghi chú chi tiết.'}
              </p>
            </div>

            {viewingWork.evidence && (
              <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
                <span className="text-slate-500 font-bold block">Minh chứng sản phẩm / Đường dẫn file:</span>
                <p className="text-blue-700 underline break-all font-mono text-[11px]">
                  {viewingWork.evidence}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold">Lãnh đạo duyệt:</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                  viewingWork.leaderApproval === 'Duyệt' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                }`}>
                  {viewingWork.leaderApproval || 'Chưa duyệt'}
                </span>
              </div>

              <button
                onClick={() => setViewingWork(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
