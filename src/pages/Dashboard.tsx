import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, TrendingUp, Users, CheckCircle2, AlertCircle, 
  Clock, Calendar, Award, ArrowUpRight, ArrowRight, Briefcase, FileText,
  AlertTriangle, ShieldCheck, Check, RefreshCw, Star
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { STANDARD_MONTHS, MONTH_GROUPS, getCurrentMonth, formatScore, cleanPosition, safeFetchJson, isSoftDeleted } from '../utils';
import { useOrgConfig } from '../contexts/OrgContext';

export default function Dashboard() {
  const { orgConfig } = useOrgConfig();
  const [works, setWorks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [overtimes, setOvertimes] = useState<any[]>([]);
  const [deptKpiUsers, setDeptKpiUsers] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [kpiRankMode, setKpiRankMode] = useState<'APPROVED' | 'SELF'>('APPROVED');
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async (targetMonth = selectedMonth) => {
    setIsLoading(true);
    try {
      const monthForKpi = targetMonth === 'Tất cả' ? getCurrentMonth() : targetMonth;
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
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#F2F6FA] p-5 sm:p-6 rounded-xl border border-[#B8C7D6] shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/70 text-[#163A5F] text-xs font-black mb-2 border border-blue-200">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>HỆ THỐNG ĐIỀU HÀNH NỘI BỘ</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#163A5F] tracking-tight">
            Bảng điều khiển tổng hợp
          </h1>
          <p className="text-sm font-medium text-[#475569] mt-1 max-w-3xl leading-relaxed">
            Tổng quan hiệu suất công việc, đánh giá KPI và điều hành làm thêm ngoài giờ {orgConfig.departmentName || 'Phòng Kế hoạch - Tài chính'}.
          </p>
        </div>

        <div className="flex items-center gap-2.5 bg-[#EDF3F8] px-3.5 py-2 rounded-xl border border-[#B8C7D6] shadow-2xs self-start sm:self-auto h-11 shrink-0">
          <Calendar className="w-4 h-4 text-[#163A5F]" />
          <label htmlFor="dash-select-month" className="text-xs font-black text-[#102A43] uppercase tracking-wide">Tháng theo dõi:</label>
          <select 
            id="dash-select-month"
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-[#F7FAFC] border border-[#AFC0D0] rounded-lg px-2.5 py-1 text-xs font-black text-[#163A5F] outline-none cursor-pointer shadow-2xs transition focus:border-[#0F8B8D]"
          >
            <option value="Tất cả">Tất cả các tháng</option>
            {MONTH_GROUPS.map(group => (
              <optgroup key={group.year} label={`── Năm ${group.year} ──`}>
                {group.months.map(m => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* KPI & Work Summary Grid - Equal height and aligned */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng công việc */}
        <div className="bg-[#F2F6FA] border-t-4 border-t-[#163A5F] border-x border-b border-[#B8C7D6] p-5 rounded-xl shadow-xs flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm min-h-[160px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[#475569] uppercase tracking-wider">Tổng công việc</span>
            <div className="p-2.5 bg-blue-100 text-[#163A5F] rounded-xl border border-blue-200">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-[#102A43]">{totalWorks}</div>
            <div className="text-xs font-bold text-[#102A43] mt-2 flex items-center gap-1.5 bg-[#EDF3F8] p-2 rounded-lg border border-[#CBD5E1]">
              <span className="text-emerald-700 font-extrabold">{approvedWorks} đã duyệt</span> • 
              <span className="text-amber-700 font-extrabold">{pendingWorks} chờ duyệt</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tỷ lệ hoàn thành */}
        <div className="bg-[#F2F6FA] border-t-4 border-t-[#15803D] border-x border-b border-[#B8C7D6] p-5 rounded-xl shadow-xs flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm min-h-[160px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[#475569] uppercase tracking-wider">Tỷ lệ hoàn thành</span>
            <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-200">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-emerald-800">{completionRate}%</div>
            <div className="w-full bg-[#E2ECF6] h-2.5 rounded-full mt-2 overflow-hidden border border-[#CBD5E1]">
              <div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: `${completionRate}%` }}></div>
            </div>
          </div>
        </div>

        {/* Card 3: Làm thêm ngoài giờ */}
        <div className="bg-[#F2F6FA] border-t-4 border-t-[#D97706] border-x border-b border-[#B8C7D6] p-5 rounded-xl shadow-xs flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm min-h-[160px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[#475569] uppercase tracking-wider">Làm thêm ngoài giờ</span>
            <div className="p-2.5 bg-amber-100 text-amber-900 rounded-xl border border-amber-300">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-amber-900">{totalOtHours} <span className="text-base font-extrabold text-[#475569]">giờ</span></div>
            <div className="text-xs font-bold text-[#102A43] mt-2 flex items-center gap-1.5 bg-[#EDF3F8] p-2 rounded-lg border border-[#CBD5E1]">
              <span className="font-black text-[#102A43]">{scopedOvertimes.length} lượt</span> • 
              <span className="text-amber-700 font-extrabold">{pendingOt} chờ duyệt</span>
            </div>
          </div>
        </div>

        {/* Card 4: Nhân sự tham gia */}
        <div className="bg-[#F2F6FA] border-t-4 border-t-[#0F8B8D] border-x border-b border-[#B8C7D6] p-5 rounded-xl shadow-xs flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm min-h-[160px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[#475569] uppercase tracking-wider">Nhân sự tham gia</span>
            <div className="p-2.5 bg-teal-100 text-[#0F8B8D] rounded-xl border border-teal-200">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-[#0F8B8D]">{users.length} <span className="text-base font-extrabold text-[#475569]">người</span></div>
            <div className="text-xs font-bold text-[#102A43] mt-2 bg-[#EDF3F8] p-2 rounded-lg border border-[#CBD5E1]">100% chuyên viên phòng dự án</div>
          </div>
        </div>
      </div>

      {/* Main Content: 2 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Quick Navigation & Urgent Actions */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Quick Access Tiles */}
          <div className="bg-[#F2F6FA] border border-[#B8C7D6] rounded-xl p-5 shadow-xs">
            <h2 className="text-xs font-black text-[#102A43] mb-4 uppercase tracking-wider flex items-center justify-between">
              <span>Chức năng thao tác nhanh</span>
              <Link to="/monitor" className="text-xs text-[#0F8B8D] font-black hover:underline flex items-center gap-1">
                <span>Xem theo dõi chi tiết</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Link to="/input" className="p-3.5 bg-[#EDF3F8] hover:bg-[#E2ECF6] border border-[#CBD5E1] hover:border-[#163A5F] rounded-xl transition-all duration-150 hover:-translate-y-0.5 flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-blue-100 text-[#163A5F] w-fit">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-black text-[#102A43] text-sm group-hover:text-[#163A5F]">Nhập công việc</div>
                  <div className="text-xs font-medium text-[#475569]">Đăng ký nhiệm vụ tháng</div>
                </div>
              </Link>

              <Link to="/my-works" className="p-3.5 bg-[#EDF3F8] hover:bg-[#E2ECF6] border border-[#CBD5E1] hover:border-[#163A5F] rounded-xl transition-all duration-150 hover:-translate-y-0.5 flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-blue-100 text-[#163A5F] w-fit">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-black text-[#102A43] text-sm group-hover:text-[#163A5F]">Công việc của tôi</div>
                  <div className="text-xs font-medium text-[#475569]">Báo cáo & nộp minh chứng</div>
                </div>
              </Link>

              <Link to="/ot-register" className="p-3.5 bg-[#EDF3F8] hover:bg-[#E2ECF6] border border-[#CBD5E1] hover:border-amber-600 rounded-xl transition-all duration-150 hover:-translate-y-0.5 flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-900 w-fit">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-black text-[#102A43] text-sm group-hover:text-amber-800">Đăng ký làm thêm</div>
                  <div className="text-xs font-medium text-[#475569]">Ngoài giờ & ngày nghỉ</div>
                </div>
              </Link>

              <Link to="/approve" className="p-3.5 bg-[#EDF3F8] hover:bg-[#E2ECF6] border border-[#CBD5E1] hover:border-emerald-600 rounded-xl transition-all duration-150 hover:-translate-y-0.5 flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 w-fit">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-black text-[#102A43] text-sm group-hover:text-emerald-800">Phê duyệt việc</div>
                  <div className="text-xs font-medium text-[#475569]">Dành cho Lãnh đạo</div>
                </div>
              </Link>

              <Link to="/kpi" className="p-3.5 bg-[#EDF3F8] hover:bg-[#E2ECF6] border border-[#CBD5E1] hover:border-indigo-600 rounded-xl transition-all duration-150 hover:-translate-y-0.5 flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-800 w-fit">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-black text-[#102A43] text-sm group-hover:text-indigo-800">Đánh giá KPI</div>
                  <div className="text-xs font-medium text-[#475569]">Bảng tính A + B + C - D</div>
                </div>
              </Link>

              <Link to="/stats" className="p-3.5 bg-[#EDF3F8] hover:bg-[#E2ECF6] border border-[#CBD5E1] hover:border-teal-600 rounded-xl transition-all duration-150 hover:-translate-y-0.5 flex flex-col gap-2 group shadow-2xs">
                <div className="p-2 rounded-lg bg-teal-100 text-[#0F8B8D] w-fit">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-black text-[#102A43] text-sm group-hover:text-[#0F8B8D]">Thống kê - Báo cáo</div>
                  <div className="text-xs font-medium text-[#475569]">Biểu đồ & xuất dữ liệu</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Urgent Works Table Preview */}
          <div className="bg-[#F2F6FA] border border-[#B8C7D6] rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 bg-[#E3ECF4] border-b border-[#B8C7D6] flex items-center justify-between">
              <h2 className="text-xs font-black text-[#102A43] uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Việc cần xử lý gấp trong tháng {selectedMonth}</span>
              </h2>
              <Link to="/monitor" className="text-xs text-[#163A5F] font-bold hover:underline bg-[#EDF3F8] px-2.5 py-1 rounded-lg border border-[#B8C7D6] shadow-2xs">
                Xem tất cả ({pendingWorks + needSupplementWorks})
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-[#163A5F] text-white text-xs font-black uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Nhân sự</th>
                    <th className="px-4 py-3">Nhiệm vụ</th>
                    <th className="px-4 py-3">Hạn</th>
                    <th className="px-4 py-3 text-center">Trạng thái duyệt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBD5E1] bg-[#F5F8FB]">
                  {scopedWorks.filter(w => w.leaderApproval !== 'Duyệt').slice(0, 5).map(w => (
                    <tr key={w.id} className="even:bg-[#EDF3F8] hover:bg-[#E1EEF4] transition-colors">
                      <td className="px-4 py-3 font-extrabold text-[#102A43]">{w.user?.name}</td>
                      <td className="px-4 py-3 max-w-[260px] truncate text-[#102A43] font-medium">{w.taskName}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#475569]">
                        {w.endDate ? new Date(w.endDate).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black border shadow-2xs ${
                          w.leaderApproval === 'Cần bổ sung' 
                            ? 'bg-amber-100 text-amber-900 border-amber-300' 
                            : 'bg-slate-200 text-[#102A43] border-[#B8C7D6]'
                        }`}>
                          {w.leaderApproval || 'Chưa duyệt'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {scopedWorks.filter(w => w.leaderApproval !== 'Duyệt').length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[#475569] font-bold text-sm">
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
          <div className="bg-[#F2F6FA] border border-[#B8C7D6] rounded-xl shadow-xs overflow-hidden flex flex-col justify-between">
            <div>
              <div className="p-4 bg-[#E3ECF4] border-b border-[#B8C7D6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-600 shrink-0" />
                  <h2 className="text-xs font-black text-[#102A43] uppercase tracking-wider">
                    Xếp hạng KPI ({selectedMonth})
                  </h2>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2">
                  {/* Selector: Lãnh đạo duyệt / Tự chấm */}
                  <div className="inline-flex p-0.5 bg-[#CBD5E1] rounded-lg border border-[#B8C7D6] shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setKpiRankMode('APPROVED')}
                      className={`px-2.5 py-1 text-xs font-black rounded-md transition-all cursor-pointer ${
                        kpiRankMode === 'APPROVED'
                          ? 'bg-[#163A5F] text-white shadow-2xs'
                          : 'text-[#102A43] hover:text-[#163A5F]'
                      }`}
                    >
                      Lãnh đạo duyệt
                    </button>
                    <button
                      type="button"
                      onClick={() => setKpiRankMode('SELF')}
                      className={`px-2.5 py-1 text-xs font-black rounded-md transition-all cursor-pointer ${
                        kpiRankMode === 'SELF'
                          ? 'bg-[#163A5F] text-white shadow-2xs'
                          : 'text-[#102A43] hover:text-[#163A5F]'
                      }`}
                    >
                      Tự chấm
                    </button>
                  </div>
                  <Link to="/kpi" className="text-xs text-[#163A5F] font-bold hover:underline bg-[#EDF3F8] px-2 py-1 rounded-lg border border-[#B8C7D6] shadow-2xs whitespace-nowrap">
                    Chi tiết
                  </Link>
                </div>
              </div>

              <div className="p-4 space-y-2.5">
                {scopedKpis.slice(0, 8).map((k, idx) => (
                  <div key={k.id || idx} className="flex items-center justify-between p-3 bg-[#EDF3F8] hover:bg-[#E1EEF4] rounded-xl border border-[#CBD5E1] transition-all duration-150 hover:-translate-y-0.5 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black border shadow-2xs ${
                        idx === 0 ? 'bg-amber-400 text-amber-950 border-amber-500 ring-2 ring-amber-200' : 
                        idx === 1 ? 'bg-slate-300 text-slate-900 border-slate-400' : 
                        idx === 2 ? 'bg-amber-100 text-amber-800 border-amber-300' : 
                        'bg-[#DCE5EE] text-[#102A43] border-[#CBD5E1]'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[#102A43] text-sm">{k.name}</span>
                          {k.scoreSource === 'Đã duyệt' ? (
                            <span className="text-[9.5px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300">
                              Đã duyệt
                            </span>
                          ) : k.scoreSource === 'Tạm tính' ? (
                            <span className="text-[9.5px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                              Tạm tính
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200">
                              Tự chấm
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-medium text-[#475569]">{cleanPosition(k.position)}</span>
                          <span className="text-[#CBD5E1]">•</span>
                          <span className={`text-xs font-bold ${
                            k.rank.includes('xuất sắc') ? 'text-emerald-700' :
                            k.rank.includes('tốt') ? 'text-blue-700' :
                            k.rank === 'Chưa tự chấm A' || k.rank === 'Tạm tính' ? 'text-amber-700' :
                            k.rank.includes('Không hoàn thành') || k.rank.includes('Không HT') ? 'text-rose-700' :
                            'text-[#475569]'
                          }`}>
                            {k.rank}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right bg-[#F7FAFC] px-3 py-1.5 rounded-xl border border-[#B8C7D6] shadow-2xs">
                      <div className="font-black text-[#163A5F] text-base">{formatScore(k.score)}</div>
                      <div className="text-[9.5px] font-black text-[#0F8B8D] uppercase">điểm KPI</div>
                    </div>
                  </div>
                ))}

                {scopedKpis.length === 0 && (
                  <div className="py-8 px-4 text-center bg-[#EDF3F8]/80 rounded-xl border border-dashed border-[#B8C7D6]">
                    <Award className="w-8 h-8 text-[#475569] mx-auto mb-2" />
                    <div className="font-black text-[#102A43] text-xs">
                      {kpiRankMode === 'APPROVED' 
                        ? `Chưa có nhân sự được duyệt KPI trong tháng ${selectedMonth}` 
                        : `Chưa có dữ liệu tự chấm KPI trong tháng ${selectedMonth}`}
                    </div>
                    <p className="text-[11px] font-medium text-[#475569] mt-1 max-w-[240px] mx-auto">
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
                className="w-full btn-3d-primary py-2.5 px-4 text-center text-xs font-black rounded-xl flex items-center justify-center gap-2 group"
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
