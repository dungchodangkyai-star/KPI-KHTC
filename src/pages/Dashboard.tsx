import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, TrendingUp, Users, CheckCircle2, AlertCircle, 
  Clock, Calendar, Award, ArrowUpRight, ArrowRight, Briefcase, FileText,
  AlertTriangle, ShieldCheck, Check
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { STANDARD_MONTHS } from '../utils';

export default function Dashboard() {
  const [works, setWorks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [overtimes, setOvertimes] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [resW, resU, resO, resK] = await Promise.all([
          fetch('/api/works'),
          fetch('/api/users'),
          fetch('/api/overtimes'),
          fetch('/api/kpi')
        ]);
        const [dW, dU, dO, dK] = await Promise.all([
          resW.json(),
          resU.json(),
          resO.json(),
          resK.json()
        ]);
        if (dW.success) setWorks(dW.data || []);
        if (dU.success) setUsers(dU.data || []);
        if (dO.success) setOvertimes(dO.data || []);
        if (dK.success) setKpis(dK.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatMonth = (m: string) => {
    if (!m) return "";
    const match = m.match(/(0[1-9]|1[0-2])-(20\d{2})/);
    return match ? match[0] : m;
  };

  const scopedWorks = works.filter(w => selectedMonth === 'Tất cả' || formatMonth(w.month) === selectedMonth);
  const scopedOvertimes = overtimes.filter(o => selectedMonth === 'Tất cả' || formatMonth(o.month) === selectedMonth);
  const scopedKpis = kpis
    .filter(k => (parseFloat(k.totalKpi) || 0) > 0)
    .filter(k => selectedMonth === 'Tất cả' || formatMonth(k.month) === selectedMonth)
    .sort((a, b) => (parseFloat(b.totalKpi) || 0) - (parseFloat(a.totalKpi) || 0));

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0f2440] tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-7 h-7 text-[#1F4E78]" />
            Bảng điều khiển tổng hợp
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Tổng quan hiệu suất công việc, đánh giá KPI và điều hành làm thêm ngoài giờ toàn phòng.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-300 shadow-sm self-start sm:self-auto">
          <Calendar className="w-4 h-4 text-[#1F4E78]" />
          <label className="text-xs font-bold text-slate-600 uppercase">Tháng theo dõi:</label>
          <select 
            id="dash-select-month"
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-sm font-bold text-[#1F4E78] outline-none cursor-pointer pr-1"
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
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng công việc</span>
            <div className="p-2 bg-blue-50 text-[#1F4E78] rounded-xl">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900">{totalWorks}</div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span className="text-emerald-600 font-bold">{approvedWorks} đã duyệt</span> • 
              <span className="text-amber-600 font-bold">{pendingWorks} chờ duyệt</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tỷ lệ hoàn thành</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-emerald-700">{completionRate}%</div>
            <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
              <div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: `${completionRate}%` }}></div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Làm thêm ngoài giờ</span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-amber-700">{totalOtHours} <span className="text-lg font-bold text-slate-500">giờ</span></div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span className="font-bold text-slate-800">{scopedOvertimes.length} lượt</span> • 
              <span className="text-amber-600 font-bold">{pendingOt} lượt chờ duyệt</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nhân sự tham gia</span>
            <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900">{users.length} <span className="text-lg font-bold text-slate-500">người</span></div>
            <div className="text-xs text-slate-500 mt-1">100% chuyên viên phòng dự án</div>
          </div>
        </div>
      </div>

      {/* Main Content: 2 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Quick Navigation & Urgent Actions */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Quick Access Tiles */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-base font-black text-slate-900 mb-4 uppercase tracking-tight flex items-center justify-between">
              <span>Chức năng thao tác nhanh</span>
              <Link to="/monitor" className="text-xs text-[#1F4E78] font-bold hover:underline flex items-center gap-1">
                <span>Xem theo dõi chi tiết</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Link to="/input" className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-[#1F4E78]/40 rounded-xl transition-all flex flex-col gap-2 group">
                <FileText className="w-5 h-5 text-[#1F4E78]" />
                <div>
                  <div className="font-bold text-slate-800 text-sm group-hover:text-[#1F4E78]">Nhập công việc</div>
                  <div className="text-xs text-slate-500">Đăng ký nhiệm vụ tháng</div>
                </div>
              </Link>

              <Link to="/my-works" className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-[#1F4E78]/40 rounded-xl transition-all flex flex-col gap-2 group">
                <Briefcase className="w-5 h-5 text-[#1F4E78]" />
                <div>
                  <div className="font-bold text-slate-800 text-sm group-hover:text-[#1F4E78]">Công việc của tôi</div>
                  <div className="text-xs text-slate-500">Báo cáo & nộp minh chứng</div>
                </div>
              </Link>

              <Link to="/ot-register" className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-[#1F4E78]/40 rounded-xl transition-all flex flex-col gap-2 group">
                <Clock className="w-5 h-5 text-amber-600" />
                <div>
                  <div className="font-bold text-slate-800 text-sm group-hover:text-amber-700">Đăng ký làm thêm</div>
                  <div className="text-xs text-slate-500">Ngoài giờ & ngày nghỉ</div>
                </div>
              </Link>

              <Link to="/approve" className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-[#1F4E78]/40 rounded-xl transition-all flex flex-col gap-2 group">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
                <div>
                  <div className="font-bold text-slate-800 text-sm group-hover:text-emerald-800">Phê duyệt việc</div>
                  <div className="text-xs text-slate-500">Dành cho Lãnh đạo</div>
                </div>
              </Link>

              <Link to="/kpi" className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-[#1F4E78]/40 rounded-xl transition-all flex flex-col gap-2 group">
                <Award className="w-5 h-5 text-purple-700" />
                <div>
                  <div className="font-bold text-slate-800 text-sm group-hover:text-purple-800">Đánh giá KPI</div>
                  <div className="text-xs text-slate-500">Bảng tính A + B + C - D</div>
                </div>
              </Link>

              <Link to="/stats" className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-[#1F4E78]/40 rounded-xl transition-all flex flex-col gap-2 group">
                <TrendingUp className="w-5 h-5 text-blue-700" />
                <div>
                  <div className="font-bold text-slate-800 text-sm group-hover:text-blue-800">Thống kê - Báo cáo</div>
                  <div className="text-xs text-slate-500">Biểu đồ & xuất dữ liệu</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Urgent Works Table Preview */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>Việc cần xử lý gấp trong tháng {selectedMonth}</span>
              </h3>
              <Link to="/monitor" className="text-xs text-[#1F4E78] font-bold hover:underline">
                Xem tất cả ({pendingWorks + needSupplementWorks})
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs font-bold uppercase">
                    <th className="pb-2">Nhân sự</th>
                    <th className="pb-2">Nhiệm vụ</th>
                    <th className="pb-2">Hạn</th>
                    <th className="pb-2">Trạng thái duyệt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scopedWorks.filter(w => w.leaderApproval !== 'Duyệt').slice(0, 5).map(w => (
                    <tr key={w.id} className="hover:bg-slate-50">
                      <td className="py-2.5 font-bold text-slate-900">{w.user?.name}</td>
                      <td className="py-2.5 max-w-[260px] truncate text-slate-700">{w.taskName}</td>
                      <td className="py-2.5 text-xs text-slate-500">
                        {w.endDate ? new Date(w.endDate).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          w.leaderApproval === 'Cần bổ sung' 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {w.leaderApproval || 'Chưa duyệt'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {scopedWorks.filter(w => w.leaderApproval !== 'Duyệt').length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400 text-sm">
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  <span>Xếp hạng KPI tháng {selectedMonth}</span>
                </h3>
                <Link to="/kpi" className="text-xs text-[#1F4E78] font-bold hover:underline">
                  Xem chi tiết
                </Link>
              </div>

              <div className="space-y-3">
                {scopedKpis.slice(0, 5).map((k, idx) => (
                  <div key={k.id || idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                        idx === 0 ? 'bg-amber-400 text-slate-900' : idx === 1 ? 'bg-slate-300 text-slate-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{k.user?.name || k.kpiId?.split('♦')[1]}</div>
                        <div className="text-xs text-slate-500">{k.rank || 'Hoàn thành tốt'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-[#1F4E78] text-base">{k.totalKpi}</div>
                      <div className="text-[11px] text-slate-500">điểm</div>
                    </div>
                  </div>
                ))}

                {scopedKpis.length === 0 && (
                  <div className="py-8 px-4 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                    <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <div className="font-bold text-slate-700 text-xs">Chưa có xếp hạng KPI tháng {selectedMonth}</div>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[220px] mx-auto">
                      Dữ liệu sẽ tự động xuất hiện khi Lãnh đạo duyệt việc và tổng hợp điểm KPI.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Link 
              to="/kpi" 
              className="mt-4 w-full py-2.5 px-3 bg-slate-100 hover:bg-[#1F4E78] text-slate-700 hover:text-white text-center text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 group"
            >
              <span>Xem chi tiết bảng tính KPI toàn phòng</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
