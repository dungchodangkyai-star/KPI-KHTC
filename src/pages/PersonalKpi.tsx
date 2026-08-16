import React, { useState, useEffect } from 'react';
import { 
  Award, Calendar, RefreshCw, Calculator, Printer, CheckCircle2, 
  AlertTriangle, Users, ArrowRight, ShieldCheck, ChevronRight, FileSpreadsheet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { STANDARD_MONTHS } from '../utils';

export default function PersonalKpi() {
  const [kpis, setKpis] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [isCalculating, setIsCalculating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchKpiData = async () => {
    setIsLoading(true);
    try {
      const [resK, resU] = await Promise.all([
        fetch('/api/kpi'),
        fetch('/api/users')
      ]);
      const [dK, dU] = await Promise.all([resK.json(), resU.json()]);
      if (dK.success) setKpis(dK.data || []);
      if (dU.success) setUsers(dU.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKpiData();
  }, []);

  const formatMonth = (m: string) => {
    if (!m) return "";
    const match = m.match(/(0[1-9]|1[0-2])-(20\d{2})/);
    return match ? match[0] : m;
  };

  const scopedKpis = kpis.filter(k => selectedMonth === 'Tất cả' || formatMonth(k.month) === selectedMonth);

  const handleCalculateKpi = async () => {
    if (selectedMonth === 'Tất cả') {
      alert("Vui lòng chọn 1 tháng cụ thể để tính toán KPI!");
      return;
    }
    setIsCalculating(true);
    try {
      const res = await fetch('/api/kpi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Đã tính toán xong KPI tháng ${selectedMonth} cho toàn bộ nhân sự!`);
        fetchKpiData();
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        alert("Lỗi khi tính toán: " + (data.error || ''));
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi kết nối máy chủ");
    } finally {
      setIsCalculating(false);
    }
  };

  const getRankBadge = (rank: string) => {
    switch (rank) {
      case 'Hoàn thành xuất sắc':
        return <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg text-xs">Xuất sắc</span>;
      case 'Hoàn thành tốt':
        return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold rounded-lg text-xs">Tốt</span>;
      case 'Hoàn thành':
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-900 border border-blue-300 font-bold rounded-lg text-xs">Hoàn thành</span>;
      default:
        return <span className="px-2.5 py-1 bg-red-100 text-red-900 border border-red-300 font-bold rounded-lg text-xs">{rank || 'Chưa xếp loại'}</span>;
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto pb-12 px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0f2440] tracking-tight flex items-center gap-2">
            <Award className="w-7 h-7 text-purple-700" />
            Đánh giá & Xếp loại KPI cá nhân
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Tổng hợp kết quả KPI theo công thức chuẩn: <strong className="text-slate-800">Tổng KPI = A (30đ) + B (60đ) + C (10đ) - D</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/print-personal"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs shadow-xs"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>In phiếu cá nhân</span>
          </Link>
          <Link
            to="/print-dept"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            <span>In bảng tổng hợp phòng</span>
          </Link>
          <button
            onClick={handleCalculateKpi}
            disabled={isCalculating}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <Calculator className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
            <span>Tính toán KPI tháng</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 font-bold text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Formula Explanation Card */}
      <div className="bg-gradient-to-r from-slate-900 to-[#1F4E78] text-white p-5 rounded-2xl shadow-sm mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-black text-base flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <span>Cơ cấu tính điểm KPI theo Quy chế</span>
          </h3>
          <p className="text-xs text-slate-200">
            • <strong>A (30đ)</strong>: Ý thức kỷ luật, chấp hành nội quy • 
            • <strong>B (60đ)</strong>: Khối lượng & Tiến độ thực hiện nhiệm vụ (B1 chuẩn hóa + B2 đóng góp) • 
            • <strong>C (10đ)</strong>: Điểm thưởng & Sáng kiến • 
            • <strong>D</strong>: Điểm trừ vi phạm / Quá hạn
          </p>
        </div>

        <Link 
          to="/score-acd"
          className="px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold whitespace-nowrap transition-colors"
        >
          Chấm điểm A, C, D →
        </Link>
      </div>

      {/* Month Filter */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-purple-700" />
          <label className="text-xs font-bold text-slate-700">Chọn tháng đánh giá:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs font-bold text-purple-800 rounded-xl px-3 py-1.5 outline-none cursor-pointer"
          >
            <option value="Tất cả">Tất cả tháng</option>
            {STANDARD_MONTHS.map(m => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={fetchKpiData}
          className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl"
          title="Làm mới"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main KPI Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <th className="py-3 px-3 text-center w-10">STT</th>
                <th className="py-3 px-3">Nhân sự</th>
                <th className="py-3 px-3 text-center">Tháng</th>
                <th className="py-3 px-3 text-center">Việc đăng ký</th>
                <th className="py-3 px-3 text-center">Việc đã duyệt</th>
                <th className="py-3 px-3 text-center">Điểm Đc/QĐ</th>
                <th className="py-3 px-3 text-center bg-blue-50/50">Điểm A (30)</th>
                <th className="py-3 px-3 text-center bg-emerald-50/50">Điểm B (60)</th>
                <th className="py-3 px-3 text-center bg-purple-50/50">Điểm C (10)</th>
                <th className="py-3 px-3 text-center bg-red-50/50">Điểm D (-)</th>
                <th className="py-3 px-3 text-center bg-purple-100 font-black text-purple-900">Tổng KPI</th>
                <th className="py-3 px-3 text-center">Xếp loại</th>
                <th className="py-3 px-3 text-center">In phiếu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {scopedKpis.map((k, idx) => (
                <tr key={k.id || idx} className="hover:bg-purple-50/20 transition-colors">
                  <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-3 px-3 font-bold text-slate-900">{k.user?.name || k.kpiId?.split('♦')[1]}</td>
                  <td className="py-3 px-3 text-center font-semibold text-purple-800">{k.month}</td>
                  <td className="py-3 px-3 text-center font-bold text-slate-800">{k.registeredWorks || 0}</td>
                  <td className="py-3 px-3 text-center font-bold text-emerald-700">{k.approvedWorks || 0}</td>
                  <td className="py-3 px-3 text-center font-semibold text-slate-800">{k.convertedScore || 0}</td>
                  <td className="py-3 px-3 text-center bg-blue-50/30 font-bold text-blue-900">{k.aScore || 30}</td>
                  <td className="py-3 px-3 text-center bg-emerald-50/30 font-bold text-emerald-900">{k.bScore || 0}</td>
                  <td className="py-3 px-3 text-center bg-purple-50/30 font-bold text-purple-900">{k.cScore || 0}</td>
                  <td className="py-3 px-3 text-center bg-red-50/30 font-bold text-red-700">{k.dScore || 0}</td>
                  <td className="py-3 px-3 text-center bg-purple-100/60 font-black text-purple-900 text-sm">
                    {k.totalKpi || 0}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {getRankBadge(k.rank)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <Link
                      to={`/print-personal?userId=${k.userId}&month=${k.month}`}
                      className="p-1.5 text-purple-700 hover:bg-purple-100 rounded-lg inline-flex"
                      title="In phiếu cá nhân"
                    >
                      <Printer className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}

              {scopedKpis.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Award className="w-8 h-8 text-slate-300" />
                      <p className="text-sm">Chưa có bảng KPI tháng {selectedMonth}. Hãy bấm "Tính toán KPI tháng" để chạy tự động!</p>
                    </div>
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
