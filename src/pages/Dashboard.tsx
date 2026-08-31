import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, TrendingUp, Users, CheckCircle2, AlertCircle, 
  Clock, Calendar, Award, ArrowUpRight, ArrowRight, Briefcase, FileText,
  AlertTriangle, ShieldCheck, Check, RefreshCw, Star
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { STANDARD_MONTHS, formatScore, cleanPosition, safeFetchJson, isSoftDeleted } from '../utils';
import { useOrgConfig } from '../contexts/OrgContext';

export default function Dashboard() {
  const { orgConfig } = useOrgConfig();
  const [works, setWorks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [overtimes, setOvertimes] = useState<any[]>([]);
  const [deptKpiUsers, setDeptKpiUsers] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [kpiRankMode, setKpiRankMode] = useState<'APPROVED' | 'SELF'>('APPROVED');
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async (targetMonth = selectedMonth) => {
    setIsLoading(true);
    try {
      const monthForKpi = targetMonth === 'Tất cả' ? '08-2026' : targetMonth;
      const [dW, dU, dO, dK] = await Promise.all([
        safeFetchJson<any[]>('/api/works'),
        safeFetchJson<any[]>('/api/users'),
        safeFetchJson<any[]>('/api/overtimes'),
        safeFetchJson<any>(`/api/kpi/department-summary?month=${monthForKpi}`)
      ]);
      if (dW.success && dW.data) setWorks(dW.data);
      if (dU.success && dU.data) setUsers(dU.data);
      if (dO.success && dO.data) setOvertimes(dO.data);
      if (dK.success && dK.data?.users) {
        setDeptKpiUsers(dK.data.users);
      } else {
        setDeptKpiUsers([]);
      }
    } catch (e) {
      console.error("Error fetching dashboard data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedMonth);
  }, [selectedMonth]);

  const formatMonth = (m: string) => {
    if (!m) return "";
    const match = m.match(/(0[1-9]|1[0-2])-(20\d{2})/);
    return match ? match[0] : m;
  };

  const scopedWorks = works.filter(w => !isSoftDeleted(w) && (selectedMonth === 'Tất cả' || formatMonth(w.month) === selectedMonth));
  const scopedOvertimes = overtimes.filter(o => selectedMonth === 'Tất cả' || formatMonth(o.month) === selectedMonth);

  // Compute live KPI leaderboard from department summary
  const scopedKpis = useMemo(() => {
    if (kpiRankMode === 'SELF') {
      // 1. TỰ CHẤM:
      // - Chỉ xếp theo selfKpiTotal và hiển thị selfRank
      // - Chưa tự chấm A ghi 'Tạm tính'
      return deptKpiUsers
        .map(u => {
          const selfScore = u.scores?.selfKpiTotal !== null && u.scores?.selfKpiTotal !== undefined 
            ? Number(u.scores.selfKpiTotal) 
            : 0;
          const hasSelfA = u.scores?.selfA !== null && u.scores?.selfA !== undefined;
          
          let rank = 'Chưa xếp loại';
          let scoreSource = 'Tự chấm';

          if (!hasSelfA) {
            rank = 'Chưa tự chấm A';
            scoreSource = 'Tạm tính';
          } else {
            rank = u.selfRank || 'Chưa xếp loại';
            scoreSource = 'Tự chấm';
          }

          return {
            id: u.id,
            name: u.name,
            position: u.position,
            score: selfScore,
            rank,
            scoreSource,
            isApproved: false,
            taskCount: u.taskCounts?.total || 0,
            isLeaderOrAbove: u.isLeaderOrAbove
          };
        })
        .filter(u => u.score > 0 || u.taskCount > 0)
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return b.taskCount - a.taskCount;
        });
    } else {
      // 2. LÃNH ĐẠO DUYỆT:
      // - Chỉ xếp theo approvedKpiTotal và approvedRank
      // - Loại Phó phòng trở lên
      // - Chỉ lấy nhân sự có scores.approvedKpiTotal khác null/undefined (đã hoàn tất duyệt A/C/D)
      // - Không đưa hồ sơ đang "Chờ duyệt" vào bảng xếp hạng
      return deptKpiUsers
        .filter(u => {
          if (u.isLeaderOrAbove) return false;
          if (u.scores?.approvedKpiTotal === null || u.scores?.approvedKpiTotal === undefined) return false;
          if (u.approvedRank === 'Chờ duyệt') return false;
          return true;
        })
        .map(u => {
          const approvedScore = Number(u.scores.approvedKpiTotal);
          const approvedRank = u.approvedRank || 'Chưa xếp loại';

          return {
            id: u.id,
            name: u.name,
            position: u.position,
            score: approvedScore,
            rank: approvedRank,
            scoreSource: 'Đã duyệt',
            isApproved: true,
            taskCount: u.taskCounts?.approved || u.taskCounts?.total || 0,
            isLeaderOrAbove: false
          };
        })
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return b.taskCount - a.taskCount;
        });
    }
  }, [deptKpiUsers, kpiRankMode]);

  const totalWorks = scopedWorks.length;
  const approvedWorks = scopedWorks.filter(w => w.leaderApproval === 'Duyệt' || w.leaderApproval === 'Đã duyệt').length;
  const pendingWorks = scopedWorks.filter(w => w.leaderApproval === 'Chưa duyệt' || w.leaderApproval === 'Chờ duyệt').length;
  const needSupplementWorks = scopedWorks.filter(w => w.leaderApproval === 'Cần bổ sung').length;
  const completionRate = totalWorks > 0 ? Math.round((approvedWorks / totalWorks) * 100) : 0;

  const totalOtHours = scopedOvertimes.reduce((sum, o) => sum + (parseFloat(o.approvedHours || o.totalRegHours || '0') || 0), 0);
  const pendingOt = scopedOvertimes.filter(o => o.approvalStatus === 'Chờ duyệt').length;

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-6 pb-12 px-2 sm:px-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-300 pb-4 bg-[#67a2cf] p-5 rounded-2xl border shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/70 text-[#1F4E78] text-xs font-black mb-2 border border-blue-200">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>HỆ THỐNG ĐIỀU HÀNH NỘI BỘ</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0f2440] tracking-tight">
            Bảng điều khiển tổng hợp
          </h2>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Tổng quan hiệu suất công việc, đánh giá KPI và điều hành làm thêm ngoài giờ {orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính'}.
          </p>
        </div>

        <div className="flex items-center gap-2.5 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-300 shadow-2xs self-start sm:self-auto">
          <Calendar className="w-4 h-4 text-[#1F4E78]" />
          <label className="text-xs font-black text-slate-700 uppercase tracking-wide">Tháng theo dõi:</label>
          <select 
            id="dash-select-month"
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-[#d9a1a1] border border-slate-300 rounded-lg px-2.5 py-1 text-sm font-black text-[#1f5278] outline-none cursor-pointer shadow-2xs"
          >
            <option value="Tất cả">Tất cả các tháng</option>
            {STANDARD_MONTHS.map(m => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI & Work Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border-t-4 border-t-[#1F4E78] border-x border-b border-slate-300 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Tổng công việc</span>
            <div className="p-2.5 bg-blue-100 text-[#1F4E78] rounded-xl border border-blue-200">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900">{totalWorks}</div>
            <div className="text-xs font-bold text-slate-700 mt-2 flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200">
              <span className="text-emerald-800 font-extrabold">{approvedWorks} đã duyệt</span> • 
              <span className="text-amber-800 font-extrabold">{pendingWorks} chờ duyệt</span>
            </div>
          </div>
        </div>

        <div className="bg-white border-t-4 border-t-emerald-600 border-x border-b border-slate-300 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Tỷ lệ hoàn thành</span>
            <div className="p-2.5 bg-emerald-100 text-emerald-900 rounded-xl border border-emerald-200">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-emerald-900">{completionRate}%</div>
            <div className="w-full bg-slate-200 h-2.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: `${completionRate}%` }}></div>
            </div>
          </div>
        </div>

        <div className="bg-white border-t-4 border-t-amber-600 border-x border-b border-slate-300 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Làm thêm ngoài giờ</span>
            <div className="p-2.5 bg-amber-100 text-amber-900 rounded-xl border border-amber-200">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-amber-900">{totalOtHours} <span className="text-base font-extrabold text-slate-600">giờ</span></div>
            <div className="text-xs font-bold text-slate-700 mt-2 flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200">
              <span className="font-black text-slate-900">{scopedOvertimes.length} lượt</span> • 
              <span className="text-amber-800 font-extrabold">{pendingOt} lượt chờ duyệt</span>
            </div>
          </div>
        </div>

        <div className="bg-white border-t-4 border-t-purple-600 border-x border-b border-slate-300 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Nhân sự tham gia</span>
            <div className="p-2.5 bg-purple-100 text-purple-950 rounded-xl border border-purple-200">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-purple-950">{users.length} <span className="text-base font-extrabold text-slate-600">người</span></div>
            <div className="text-xs font-bold text-slate-700 mt-2 bg-purple-50 p-2 rounded-xl border border-purple-200">100% chuyên viên phòng dự án</div>
          </div>
        </div>
      </div>

      {/* Main Content: 2 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Quick Navigation & Urgent Actions */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Quick Access Tiles */}
          <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 mb-4 uppercase tracking-wider flex items-center justify-between">
              <span>Chức năng thao tác nhanh</span>
              <Link to="/monitor" className="text-xs text-[#1F4E78] font-black hover:underline flex items-center gap-1">
                <span>Xem theo dõi chi tiết</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Link to="/input" className="p-4 bg-slate-50 hover:bg-blue-50/80 border border-slate-300 hover:border-[#1F4E78] rounded-xl transition-all flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-blue-100 text-[#1F4E78] w-fit">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-black text-slate-900 text-sm group-hover:text-[#1F4E78]">Nhập công việc</div>
                  <div className="text-xs font-medium text-slate-600">Đăng ký nhiệm vụ tháng</div>
                </div>
              </Link>

              <Link to="/my-works" className="p-4 bg-slate-50 hover:bg-blue-50/80 border border-slate-300 hover:border-[#1F4E78] rounded-xl transition-all flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-blue-100 text-[#1F4E78] w-fit">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-black text-slate-900 text-sm group-hover:text-[#1F4E78]">Công việc của tôi</div>
                  <div className="text-xs font-medium text-slate-600">Báo cáo & nộp minh chứng</div>
                </div>
              </Link>

              <Link to="/ot-register" className="p-4 bg-slate-50 hover:bg-amber-50/80 border border-slate-300 hover:border-amber-600 rounded-xl transition-all flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-900 w-fit">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-black text-slate-900 text-sm group-hover:text-amber-800">Đăng ký làm thêm</div>
                  <div className="text-xs font-medium text-slate-600">Ngoài giờ & ngày nghỉ</div>
                </div>
              </Link>

              <Link to="/approve" className="p-4 bg-slate-50 hover:bg-emerald-50/80 border border-slate-300 hover:border-emerald-600 rounded-xl transition-all flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-900 w-fit">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-black text-slate-900 text-sm group-hover:text-emerald-800">Phê duyệt việc</div>
                  <div className="text-xs font-medium text-slate-600">Dành cho Lãnh đạo</div>
                </div>
              </Link>

              <Link to="/kpi" className="p-4 bg-slate-50 hover:bg-purple-50/80 border border-slate-300 hover:border-purple-600 rounded-xl transition-all flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-950 w-fit">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-black text-slate-900 text-sm group-hover:text-purple-900">Đánh giá KPI</div>
                  <div className="text-xs font-medium text-slate-600">Bảng tính A + B + C - D</div>
                </div>
              </Link>

              <Link to="/stats" className="p-4 bg-slate-50 hover:bg-blue-50/80 border border-slate-300 hover:border-[#1F4E78] rounded-xl transition-all flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-blue-100 text-[#1F4E78] w-fit">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-black text-slate-900 text-sm group-hover:text-[#1F4E78]">Thống kê - Báo cáo</div>
                  <div className="text-xs font-medium text-slate-600">Biểu đồ & xuất dữ liệu</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Urgent Works Table Preview */}
          <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-slate-100 to-amber-50/50 border-b border-slate-300 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>Việc cần xử lý gấp trong tháng {selectedMonth}</span>
              </h3>
              <Link to="/monitor" className="text-xs text-[#1F4E78] font-black hover:underline bg-white px-3 py-1 rounded-lg border border-slate-300 shadow-2xs">
                Xem tất cả ({pendingWorks + needSupplementWorks})
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-[#1F4E78] text-white text-xs font-black uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Nhân sự</th>
                    <th className="px-4 py-3">Nhiệm vụ</th>
                    <th className="px-4 py-3">Hạn</th>
                    <th className="px-4 py-3 text-center">Trạng thái duyệt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 bg-white">
                  {scopedWorks.filter(w => w.leaderApproval !== 'Duyệt').slice(0, 5).map(w => (
                    <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-extrabold text-slate-900">{w.user?.name}</td>
                      <td className="px-4 py-3 max-w-[260px] truncate text-slate-800 font-medium">{w.taskName}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        {w.endDate ? new Date(w.endDate).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black border shadow-2xs ${
                          w.leaderApproval === 'Cần bổ sung' 
                            ? 'bg-amber-100 text-amber-950 border-amber-300' 
                            : 'bg-slate-100 text-slate-800 border-slate-300'
                        }`}>
                          {w.leaderApproval || 'Chưa duyệt'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {scopedWorks.filter(w => w.leaderApproval !== 'Duyệt').length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 font-bold text-sm">
                        Không có công việc nào tồn đọng trong tháng {selectedMonth}!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: KPI Top Performers & Overtime Summary */}
        <div className="flex flex-col gap-6">
          {/* KPI Ranking */}
          <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
            <div>
              <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-100 to-blue-50/40 border-b border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-600 shrink-0" />
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Xếp hạng KPI ({selectedMonth})
                  </h3>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2">
                  {/* Selector: Lãnh đạo duyệt / Tự chấm */}
                  <div className="inline-flex p-1 bg-slate-200/90 rounded-xl border border-slate-300 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setKpiRankMode('APPROVED')}
                      className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                        kpiRankMode === 'APPROVED'
                          ? 'bg-[#1F4E78] text-white shadow-xs'
                          : 'text-slate-700 hover:text-[#1F4E78]'
                      }`}
                    >
                      Lãnh đạo duyệt
                    </button>
                    <button
                      type="button"
                      onClick={() => setKpiRankMode('SELF')}
                      className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                        kpiRankMode === 'SELF'
                          ? 'bg-[#1F4E78] text-white shadow-xs'
                          : 'text-slate-700 hover:text-[#1F4E78]'
                      }`}
                    >
                      Tự chấm
                    </button>
                  </div>
                  <Link to="/kpi" className="text-xs text-[#1F4E78] font-black hover:underline bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs whitespace-nowrap">
                    Chi tiết
                  </Link>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {scopedKpis.slice(0, 8).map((k, idx) => (
                  <div key={k.id || idx} className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-blue-50/40 rounded-xl border border-slate-300 shadow-2xs transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black border shadow-2xs ${
                        idx === 0 ? 'bg-amber-400 text-amber-950 border-amber-500 ring-2 ring-amber-200' : 
                        idx === 1 ? 'bg-slate-300 text-slate-900 border-slate-400' : 
                        idx === 2 ? 'bg-amber-100 text-amber-800 border-amber-300' : 
                        'bg-slate-200 text-slate-700 border-slate-300'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm">{k.name}</span>
                          {k.scoreSource === 'Đã duyệt' ? (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300">
                              Đã duyệt
                            </span>
                          ) : k.scoreSource === 'Tạm tính' ? (
                            <span className="text-[10px] font-bold text-amber-900 bg-amber-100/90 px-1.5 py-0.2 rounded border border-amber-300">
                              Tạm tính
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.2 rounded border border-blue-300">
                              Tự chấm
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-medium text-slate-500">{cleanPosition(k.position)}</span>
                          <span className="text-slate-300">•</span>
                          <span className={`text-xs font-bold ${
                            k.rank.includes('xuất sắc') ? 'text-emerald-700' :
                            k.rank.includes('tốt') ? 'text-blue-700' :
                            k.rank === 'Chưa tự chấm A' || k.rank === 'Tạm tính' ? 'text-amber-700' :
                            k.rank.includes('Không hoàn thành') || k.rank.includes('Không HT') ? 'text-rose-700' :
                            'text-slate-700'
                          }`}>
                            {k.rank}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right bg-white px-3 py-1.5 rounded-xl border border-blue-200 shadow-2xs">
                      <div className="font-black text-[#1F4E78] text-base">{formatScore(k.score)}</div>
                      <div className="text-[10px] font-black text-blue-700 uppercase">điểm KPI</div>
                    </div>
                  </div>
                ))}

                {scopedKpis.length === 0 && (
                  <div className="py-8 px-4 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-300">
                    <Award className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <div className="font-black text-slate-800 text-xs">
                      {kpiRankMode === 'APPROVED' 
                        ? `Chưa có nhân sự được duyệt KPI trong tháng ${selectedMonth}` 
                        : `Chưa có dữ liệu tự chấm KPI trong tháng ${selectedMonth}`}
                    </div>
                    <p className="text-[11px] font-medium text-slate-600 mt-1 max-w-[240px] mx-auto">
                      {kpiRankMode === 'APPROVED' 
                        ? 'Bảng xếp hạng lãnh đạo chỉ hiển thị các nhân sự (không gồm Phó phòng trở lên) đã hoàn tất duyệt A/C/D.' 
                        : 'Bảng xếp hạng tự chấm hiển thị theo điểm số tự chấm của nhân sự.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 pt-0">
              <Link 
                to="/kpi" 
                className="w-full py-3 px-4 bg-[#1F4E78] hover:bg-[#173a5a] text-white text-center text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 group shadow-sm border border-blue-900"
              >
                <span>Xem chi tiết bảng tính KPI toàn phòng</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
