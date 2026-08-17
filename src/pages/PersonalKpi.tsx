import React, { useState, useEffect } from 'react';
import { STANDARD_MONTHS, KPI_A_CRITERIA, getActiveLoggedInUser, normalizeNFC, safeFetchJson } from '../utils';
import {
  Award,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  FileText,
  Layers,
  Calendar,
  Sparkles,
  Zap,
  Star,
  RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PersonalKpi() {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [kpiData, setKpiData] = useState<any>(null);

  // Toggle details view
  const [showDetailB, setShowDetailB] = useState(false);
  const [showDetailC, setShowDetailC] = useState(true);
  const [showDetailD, setShowDetailD] = useState(false);

  const fetchUserAndData = async (targetMonth = selectedMonth) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const dU = await safeFetchJson<any[]>('/api/users', undefined, 3);
      if (dU.success && dU.data && dU.data.length > 0) {
        const activeUser = getActiveLoggedInUser(dU.data);
        setCurrentUser(activeUser);
        if (activeUser) {
          await loadKpiDetail(targetMonth, activeUser.id);
        }
      } else if (dU.error) {
        setErrorMsg(dU.error);
      }
    } catch (err: any) {
      console.warn("Fetch user warning:", err);
      setErrorMsg("Không thể kết nối đến máy chủ. Đang thử lại...");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserAndData(selectedMonth);

    const handleUserChange = () => {
      fetchUserAndData(selectedMonth);
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, []);

  const loadKpiDetail = async (month: string, uId: number) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const d = await safeFetchJson(`/api/kpi/detail?month=${month}&userId=${uId}`, undefined, 3);
      if (d.success && d.data) {
        setKpiData(d.data);
      } else if (d.error) {
        console.warn("Load KPI detail notice:", d.error);
      }
    } catch (e: any) {
      console.warn("Load KPI detail warning:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    if (currentUser) {
      loadKpiDetail(m, currentUser.id);
    }
  };


  const u = kpiData?.user || currentUser;
  const sum = kpiData?.summary;
  const detA = kpiData?.detailsA;
  const detC = kpiData?.detailsC;
  const detD = kpiData?.detailsD;
  const approvedTasks = kpiData?.approvedTasks || [];

  // Scores
  const scoreA = parseFloat(detA?.approvedTotal ?? (detA?.selfTotal || '0')) || 0;
  const scoreASelf = detA?.selfTotal !== null && detA?.selfTotal !== undefined ? detA.selfTotal : null;
  const scoreAApproved = detA?.approvedTotal !== null && detA?.approvedTotal !== undefined ? detA.approvedTotal : null;

  const scoreB1 = sum?.b1 ?? 0;
  const scoreB2 = sum?.b2 ?? 0;
  const scoreB = sum?.bTotal ?? 0;

  const scoreC1 = detC?.c1 ?? detC?.autoC1 ?? 0;
  const scoreC2 = detC?.c2 ?? 0;
  const scoreC = Math.min(10, scoreC1 + scoreC2);

  const scoreD = (detD?.items || []).reduce(
    (s: number, it: any) => s + (parseFloat(it.officialD ?? (it.autoD || '0')) || 0),
    0
  );
  const totalKpi = Math.min(100, Math.max(0, scoreA + scoreB + scoreC - scoreD));

  let rankText = 'Hoàn thành tốt';
  let rankBg = 'bg-blue-50 text-blue-800 border-blue-200';
  if (totalKpi >= 95) {
    rankText = 'Hoàn thành xuất sắc';
    rankBg = 'bg-emerald-50 text-emerald-800 border-emerald-300';
  } else if (totalKpi >= 80) {
    rankText = 'Hoàn thành tốt';
    rankBg = 'bg-blue-50 text-blue-800 border-blue-200';
  } else if (totalKpi >= 65) {
    rankText = 'Hoàn thành';
    rankBg = 'bg-amber-50 text-amber-800 border-amber-200';
  } else {
    rankText = 'Không hoàn thành';
    rankBg = 'bg-rose-50 text-rose-800 border-rose-200';
  }

  // Breakdown data for C1 and C2
  const natureDist = detC?.distribution || {};
  const complexTasks = detC?.complexTasks || approvedTasks.filter((t: any) => {
    const nat = t.approvedNature || t.proposedNature || t.nature;
    return nat === 'Đặc biệt phức tạp' || nat === 'Rất phức tạp' || nat === 'Phức tạp';
  });

  const natureRows = [
    { key: 'Đặc biệt phức tạp', label: 'Đặc biệt phức tạp', pointEach: 3, badgeBg: 'bg-purple-100 text-purple-800 border-purple-200' },
    { key: 'Rất phức tạp', label: 'Rất phức tạp', pointEach: 2, badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    { key: 'Phức tạp', label: 'Phức tạp', pointEach: 1, badgeBg: 'bg-blue-100 text-blue-800 border-blue-200' },
    { key: 'Trung bình', label: 'Trung bình', pointEach: 0, badgeBg: 'bg-slate-100 text-slate-700 border-slate-200' },
    { key: 'Đơn giản', label: 'Đơn giản', pointEach: 0, badgeBg: 'bg-slate-100 text-slate-700 border-slate-200' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 font-sans">
      {/* Title & Actions */}
      <div className="bg-white border border-slate-300 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/80 text-[#1F4E78] text-xs font-black mb-2 border border-blue-200">
            <Award className="w-3.5 h-3.5" />
            <span>KẾT QUẢ ĐÁNH GIÁ HIỆU QUẢ CÔNG VIỆC</span>
          </div>
          <h1 className="text-2xl md:text-[26px] font-black text-[#0f2440] tracking-tight">
            Báo cáo KPI cá nhân {selectedMonth}
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Bảng theo dõi và chi tiết căn cứ tính điểm hiệu quả công việc của cá nhân theo tháng
          </p>
        </div>

        <button
          onClick={() => navigate('/print-personal')}
          className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-5 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 shadow-sm transition cursor-pointer border border-blue-900"
        >
          <FileText className="w-4 h-4" />
          In phiếu KPI cá nhân
        </button>
      </div>

      {/* Filter Bar (Only Month Filter) & User Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 rounded-xl text-[#1F4E78] border border-blue-200 shadow-2xs">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-black uppercase text-slate-700">Tháng đánh giá:</label>
            <select
              value={selectedMonth}
              onChange={e => handleMonthChange(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black text-[#1F4E78] focus:outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
            >
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => currentUser && loadKpiDetail(selectedMonth, currentUser.id)}
            className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-4 py-1.5 rounded-xl text-xs font-black transition shadow-2xs cursor-pointer border border-blue-900"
          >
            Xem
          </button>
        </div>

        {/* User Identity Display */}
        <div className="flex items-center gap-3 bg-blue-50/80 px-4 py-2 rounded-xl border border-blue-300 shadow-2xs">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#17466e] to-[#2f75b5] text-white font-black text-sm flex items-center justify-center shadow-2xs">
            {u?.name ? u.name.split(' ').slice(-1)[0][0] : 'U'}
          </div>
          <div>
            <div className="text-sm font-black text-[#0f2440]">
              {u?.name || 'Đang tải...'}
            </div>
            <div className="text-xs font-bold text-slate-600">
              {u?.position || 'Chuyên viên'} • Phòng Kế hoạch - Tài chính
            </div>
          </div>
        </div>
      </div>

      {/* 4 TOP SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng KPI */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Tổng KPI ({selectedMonth})
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#0f2440]">{totalKpi}</span>
            <span className="text-sm font-bold text-slate-400">/ 100</span>
          </div>
          <div>
            <span
              className={`inline-block text-xs font-black px-2.5 py-1 rounded-full border ${rankBg}`}
            >
              {rankText}
            </span>
          </div>
        </div>

        {/* Card 2: Điểm A */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Điểm A - Nội quy & Kỷ luật
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-blue-900">
              {scoreAApproved !== null ? scoreAApproved : (scoreASelf !== null ? scoreASelf : 0)}
            </span>
            <span className="text-sm font-bold text-slate-400">/ 30</span>
          </div>
          <div className="text-xs font-semibold text-slate-600">
            Tự chấm: <strong className="text-blue-800">{scoreASelf !== null ? `${scoreASelf}đ` : 'Chưa chấm'}</strong> | Duyệt:{' '}
            <strong className="text-emerald-700">{scoreAApproved !== null ? `${scoreAApproved}đ` : 'Chờ duyệt'}</strong>
          </div>
        </div>

        {/* Card 3: Điểm B */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Điểm B - Nhiệm vụ thường xuyên
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-indigo-900">{scoreB}</span>
            <span className="text-sm font-bold text-slate-400">/ 60</span>
          </div>
          <div className="text-xs font-semibold text-slate-600">
            B1 (Tiến độ): <strong>{scoreB1}đ</strong> | B2 (Khối lượng): <strong>{scoreB2}đ</strong>
          </div>
        </div>

        {/* Card 4: Điểm C & D */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Thưởng (C) / Phạt (D)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-800">+{scoreC}</span>
            <span className="text-2xl font-black text-rose-700 ml-2">-{scoreD}</span>
          </div>
          <div className="text-xs font-semibold text-slate-600">
            C1 (Tự động): <strong>+{scoreC1}đ</strong> | C2 (Lãnh đạo): <strong>+{scoreC2}đ</strong>
          </div>
        </div>
      </div>

      {/* OVERALL KPI FORMULA / BREAKDOWN TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#1F4E78]" />
            <h2 className="text-base font-bold text-[#0f2440]">
              Bảng cơ cấu điểm KPI cá nhân tháng {selectedMonth}
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-500">Công thức: Total = A + B + C - D</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100/75 text-xs uppercase font-bold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5 w-16 text-center">Mục</th>
                <th className="px-6 py-3.5">Hạng mục đánh giá</th>
                <th className="px-6 py-3.5 text-center w-28">Điểm tối đa</th>
                <th className="px-6 py-3.5 text-center w-36">Tự chấm / Đề xuất</th>
                <th className="px-6 py-3.5 text-center w-36">Lãnh đạo duyệt</th>
                <th className="px-6 py-3.5">Ghi chú / Căn cứ tính</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {/* Row A */}
              <tr className="hover:bg-slate-50/50 transition">
                <td className="px-6 py-4 font-bold text-center text-[#1F4E78]">A</td>
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900">Chấp hành nội quy, quy chế</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Đánh giá theo 7 tiêu chí chuẩn (A1 - A7)
                  </div>
                </td>
                <td className="px-6 py-4 text-center font-bold text-slate-700">30</td>
                <td className="px-6 py-4 text-center font-bold text-blue-800">
                  {scoreASelf !== null ? `${scoreASelf}đ` : 'Chưa tự chấm'}
                </td>
                <td className="px-6 py-4 text-center font-bold text-emerald-700">
                  {scoreAApproved !== null ? `${scoreAApproved}đ` : 'Chờ duyệt'}
                </td>
                <td className="px-6 py-4 text-xs text-slate-600">
                  {detA?.statusA === 'Đã duyệt'
                    ? 'Lãnh đạo phòng đã phê duyệt'
                    : detA?.statusA === 'Đã tự chấm'
                    ? 'Đã tự chấm, đang chờ lãnh đạo duyệt'
                    : 'Cá nhân chưa thực hiện tự chấm'}
                </td>
              </tr>

              {/* Row B */}
              <tr className="hover:bg-slate-50/50 transition">
                <td className="px-6 py-4 font-bold text-center text-[#1F4E78]">B</td>
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900">
                    Thực hiện nhiệm vụ thường xuyên (B1 + B2)
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    B1 (Tiến độ, sản phẩm): {scoreB1}đ + B2 (Khối lượng quy đổi): {scoreB2}đ
                  </div>
                </td>
                <td className="px-6 py-4 text-center font-bold text-slate-700">60</td>
                <td className="px-6 py-4 text-center font-bold text-slate-800">{scoreB}đ</td>
                <td className="px-6 py-4 text-center font-bold text-indigo-900">{scoreB}đ</td>
                <td className="px-6 py-4 text-xs text-slate-600">
                  Tỷ trọng công việc cá nhân: <strong>{sum?.personalShare || 0}%</strong> (Bình quân phòng:{' '}
                  {sum?.avgShare || 0}%)
                </td>
              </tr>

              {/* Row C */}
              <tr className="hover:bg-slate-50/50 transition">
                <td className="px-6 py-4 font-bold text-center text-[#1F4E78]">C</td>
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900">Điểm thưởng / Việc khó / Đột xuất (C1 + C2)</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    C1 (Tự động từ tính chất việc): {scoreC1}đ | C2 (Lãnh đạo chấm việc khó/đột xuất): {scoreC2}đ
                  </div>
                </td>
                <td className="px-6 py-4 text-center font-bold text-slate-700">10</td>
                <td className="px-6 py-4 text-center font-bold text-emerald-700">+{scoreC}đ</td>
                <td className="px-6 py-4 text-center font-bold text-emerald-800">+{scoreC}đ</td>
                <td className="px-6 py-4 text-xs text-slate-600">
                  C1: {detC?.personalNatureTotal ?? 0}đ tính chất (BQ phòng: {detC?.avgDeptNature ?? 0}đ) • C2:{' '}
                  {scoreC2 > 0 ? `Lãnh đạo thưởng +${scoreC2}đ` : '0đ'}
                </td>
              </tr>

              {/* Row D */}
              <tr className="hover:bg-slate-50/50 transition">
                <td className="px-6 py-4 font-bold text-center text-rose-600">D</td>
                <td className="px-6 py-4">
                  <div className="font-bold text-rose-900">Điểm phạt vi phạm</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Trừ điểm do chậm tiến độ, chất lượng không đạt hoặc vi phạm quy trình
                  </div>
                </td>
                <td className="px-6 py-4 text-center font-bold text-slate-500">Trừ</td>
                <td className="px-6 py-4 text-center font-bold text-rose-700">
                  {scoreD > 0 ? `-${scoreD}đ` : '0đ'}
                </td>
                <td className="px-6 py-4 text-center font-bold text-rose-700">
                  {scoreD > 0 ? `-${scoreD}đ` : '0đ'}
                </td>
                <td className="px-6 py-4 text-xs text-slate-600">
                  {detD?.items?.length > 0
                    ? `${detD.items.length} nhiệm vụ có ghi nhận vi phạm trừ điểm`
                    : 'Không có vi phạm trừ điểm trong tháng'}
                </td>
              </tr>

              {/* Total Summary Row */}
              <tr className="bg-[#f0f6ff] font-bold text-slate-900">
                <td className="px-6 py-4 text-center text-[#1F4E78] font-black">∑</td>
                <td className="px-6 py-4">
                  <div className="text-base font-black text-[#0f2440]">
                    TỔNG ĐIỂM KPI THÁNG {selectedMonth}
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    Xếp loại: <span className="text-[#1F4E78] font-black uppercase">{rankText}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center text-base font-black text-slate-800">100</td>
                <td className="px-6 py-4 text-center text-base font-black text-blue-900">
                  {scoreASelf !== null ? `${Math.min(100, Math.max(0, scoreASelf + scoreB + scoreC - scoreD))}đ` : '-'}
                </td>
                <td className="px-6 py-4 text-center text-xl font-black text-[#1F4E78]">
                  {totalKpi}đ
                </td>
                <td className="px-6 py-4 text-sm font-bold text-[#1F4E78]">
                  {rankText} ({totalKpi}/100)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL ACCORDIONS */}
      <div className="space-y-4">
        {/* Detail A: 7 Tiêu chí chấp hành nội quy */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-700" />
              <h3 className="font-bold text-slate-900">
                Chi tiết điểm A - Chấp hành nội quy, quy chế ({scoreAApproved !== null ? scoreAApproved : (scoreASelf || 0)}/30 điểm)
              </h3>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Trạng thái: <strong>{detA?.statusA || 'Chưa tự chấm'}</strong>
            </span>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {KPI_A_CRITERIA.map(crit => {
                const sItem = detA?.scores?.[crit.code];
                const sSelf = sItem?.self ?? '-';
                const sApp = sItem?.approved ?? sSelf;
                return (
                  <div
                    key={crit.code}
                    className="p-4 rounded-xl border border-slate-200 bg-[#f8fafc] flex flex-col justify-between"
                  >
                    <div>
                      <div className="font-bold text-sm text-[#0f2440] mb-1">
                        {crit.code} - {crit.name}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{crit.desc}</p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        Tối đa: <strong>{crit.maxScore}đ</strong>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-blue-800">Tự chấm: <strong>{sSelf}đ</strong></span>
                        <span className="text-emerald-700 font-bold">Duyệt: <strong>{sApp}đ</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Detail B: Danh sách công việc được duyệt trong tháng */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowDetailB(!showDetailB)}
            className="w-full px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100/80 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-700" />
              <h3 className="font-bold text-slate-900">
                Chi tiết điểm B - Danh sách công việc đã thực hiện ({approvedTasks.length} việc đã duyệt - {scoreB}/60 điểm)
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#1F4E78]">
              <span>{showDetailB ? 'Thu gọn' : 'Xem chi tiết'}</span>
              {showDetailB ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showDetailB && (
            <div className="p-4 overflow-x-auto">
              {approvedTasks.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Chưa có công việc nào được duyệt trong tháng {selectedMonth}.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="p-3 text-center">STT</th>
                      <th className="p-3">Mã & Nhóm việc</th>
                      <th className="p-3">Tên nhiệm vụ / Chi tiết</th>
                      <th className="p-3 text-center">Tính chất</th>
                      <th className="p-3 text-center">Hệ số</th>
                      <th className="p-3 text-center">Điểm gốc</th>
                      <th className="p-3 text-center">Điểm Q.Đổi</th>
                      <th className="p-3 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {approvedTasks.map((t: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="p-3">
                          <span className="font-mono font-bold text-[#1F4E78]">{t.taskCode || t.workId}</span>
                          <div className="text-slate-500">{t.taskGroup}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{t.taskName}</div>
                          <div className="text-slate-500 line-clamp-1">{t.detail}</div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                            {t.nature || t.approvedNature || t.proposedNature || 'Trung bình'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold">{t.coef}</td>
                        <td className="p-3 text-center font-bold text-slate-700">{t.baseScore}</td>
                        <td className="p-3 text-center font-bold text-[#1F4E78]">{t.convertedScore}</td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                            Đã duyệt
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Detail C: Thống kê Điểm thưởng & Tính chất công việc (C1, C2) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowDetailC(!showDetailC)}
            className="w-full px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100/80 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-700" />
              <h3 className="font-bold text-slate-900">
                Chi tiết điểm C - Thống kê Điểm thưởng / Tính chất công việc / Việc khó (+{scoreC}/10 điểm)
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-xs">
                <span className="bg-blue-50 text-blue-800 px-2.5 py-0.5 rounded-full border border-blue-200 font-bold">
                  C1 (Tự động): +{scoreC1}đ
                </span>
                <span className="bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200 font-bold">
                  C2 (Lãnh đạo): +{scoreC2}đ
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-[#1F4E78]">
                <span>{showDetailC ? 'Thu gọn' : 'Xem chi tiết'}</span>
                {showDetailC ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>
          </button>

          {showDetailC && (
            <div className="p-6 space-y-6">
              {/* TOP 2 SUB-CARDS: C1 & C2 OVERVIEW */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* SUB-CARD C1: TÍNH CHẤT CÔNG VIỆC TỰ ĐỘNG */}
                <div className="bg-[#f8fafc] p-5 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-700" />
                      <span className="font-black text-sm text-[#0f2440]">
                        Điểm C1 - Thưởng tính chất công việc (Tự động)
                      </span>
                    </div>
                    <span className="font-black text-base text-blue-800 bg-white px-3 py-1 rounded-lg border border-blue-200 shadow-xs">
                      +{scoreC1} / 6.0 điểm
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
                    <div className="font-bold text-slate-700">Công thức xác định C1 tự động:</div>
                    <div className="font-mono text-blue-900 bg-blue-50/70 p-2 rounded-lg border border-blue-100 font-bold">
                      C1 = Min( 6, Round( (Điểm tính chất cá nhân × 6) / Điểm tính chất BQ phòng ) )
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-slate-600">
                      <div>
                        • Điểm tính chất cá nhân: <strong className="text-blue-900">{detC?.personalNatureTotal ?? 0}đ</strong>
                      </div>
                      <div>
                        • BQ phòng: <strong className="text-slate-800">{detC?.avgDeptNature ?? 0}đ</strong> ({detC?.deptNatureTotal ?? 0}đ / {detC?.activeEmployeeCount ?? 0} người)
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 italic">
                    Hệ số quy đổi tính chất nhiệm vụ: Đặc biệt phức tạp (+3đ), Rất phức tạp (+2đ), Phức tạp (+1đ), Trung bình & Đơn giản (0đ).
                  </p>
                </div>

                {/* SUB-CARD C2: LÃNH ĐẠO CHẤM VIỆC KHÓ / ĐỘT XUẤT */}
                <div className="bg-[#f8fafc] p-5 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-emerald-700" />
                      <span className="font-black text-sm text-[#0f2440]">
                        Điểm C2 - Thưởng việc khó / đột xuất / xuất sắc
                      </span>
                    </div>
                    <span className="font-black text-base text-emerald-800 bg-white px-3 py-1 rounded-lg border border-emerald-200 shadow-xs">
                      +{scoreC2} / 4.0 điểm
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">Trạng thái phê duyệt C2:</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold ${
                          scoreC2 > 0
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {scoreC2 > 0 ? `Được thưởng +${scoreC2} điểm` : 'Không có điểm thưởng C2'}
                      </span>
                    </div>

                    <div>
                      <div className="font-bold text-slate-700 mb-1">Căn cứ / Lý do lãnh đạo ghi nhận:</div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-700 italic">
                        {detC?.noteC2 || detC?.noteC || 'Lãnh đạo phòng đánh giá dựa trên mức độ tham gia xử lý các nhiệm vụ khó khăn, đột xuất ngoài kế hoạch thường xuyên hoặc có giải pháp sáng tạo mang lại hiệu quả cao trong tháng.'}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 italic">
                    Điểm C2 do Lãnh đạo phòng trực tiếp xem xét và phê duyệt theo quy chế thi đua nội bộ (Tối đa 4.0 điểm).
                  </p>
                </div>
              </div>

              {/* TABLE 1: THỐNG KÊ PHÂN BỐ TÍNH CHẤT CÔNG VIỆC CÁ NHÂN & TOÀN PHÒNG */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Bảng thống kê phân bố tính chất công việc (Cá nhân vs Toàn phòng)
                  </h4>
                  <span className="text-xs font-semibold text-slate-500">
                    Căn cứ tính điểm C1 tự động
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase border-b border-slate-200">
                      <tr>
                        <th className="p-3 text-center w-12">STT</th>
                        <th className="p-3">Mức độ tính chất</th>
                        <th className="p-3 text-center w-36">Điểm tính chất / việc</th>
                        <th className="p-3 text-center w-28">Số lượng (Cá nhân)</th>
                        <th className="p-3 text-center w-28">Điểm (Cá nhân)</th>
                        <th className="p-3 text-center w-28">Số lượng (Toàn phòng)</th>
                        <th className="p-3 text-center w-28">Điểm (Toàn phòng)</th>
                        <th className="p-3 text-center w-28">Tỷ trọng cá nhân</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {natureRows.map((row, idx) => {
                        const dist = natureDist[row.key] || { personalCount: 0, deptCount: 0, personalPoint: 0, deptPoint: 0 };
                        const share = dist.deptPoint > 0 ? Math.round((dist.personalPoint / dist.deptPoint) * 100) : (dist.personalCount > 0 ? 100 : 0);
                        return (
                          <tr key={row.key} className="hover:bg-slate-50">
                            <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-3">
                              <span className={`inline-block px-2.5 py-1 rounded-md font-bold text-xs border ${row.badgeBg}`}>
                                {row.label}
                              </span>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-700">+{row.pointEach}đ / việc</td>
                            <td className="p-3 text-center font-bold text-blue-900">{dist.personalCount || 0} việc</td>
                            <td className="p-3 text-center font-bold text-blue-800">+{dist.personalPoint || 0}đ</td>
                            <td className="p-3 text-center text-slate-700">{dist.deptCount || 0} việc</td>
                            <td className="p-3 text-center text-slate-700">+{dist.deptPoint || 0}đ</td>
                            <td className="p-3 text-center font-bold text-[#1F4E78]">{share}%</td>
                          </tr>
                        );
                      })}
                      {/* Total Nature Row */}
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-200 text-slate-900">
                        <td className="p-3 text-center text-[#1F4E78] font-black">∑</td>
                        <td className="p-3 font-black text-slate-900" colSpan={2}>
                          TỔNG CỘNG ĐIỂM TÍNH CHẤT CÔNG VIỆC
                        </td>
                        <td className="p-3 text-center font-black text-blue-900">
                          {Object.values(natureDist).reduce((s: number, it: any) => s + (it.personalCount || 0), 0)} việc
                        </td>
                        <td className="p-3 text-center font-black text-blue-900 text-sm">
                          {detC?.personalNatureTotal ?? 0}đ
                        </td>
                        <td className="p-3 text-center text-slate-800 font-bold">
                          {Object.values(natureDist).reduce((s: number, it: any) => s + (it.deptCount || 0), 0)} việc
                        </td>
                        <td className="p-3 text-center text-slate-800 font-bold text-sm">
                          {detC?.deptNatureTotal ?? 0}đ
                        </td>
                        <td className="p-3 text-center font-black text-[#1F4E78] text-sm">
                          {detC?.deptNatureTotal > 0 ? Math.round(((detC?.personalNatureTotal ?? 0) / detC.deptNatureTotal) * 100) : 0}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABLE 2: DANH SÁCH CÁC CÔNG VIỆC PHỨC TẠP CỦA CÁ NHÂN */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Danh sách các nhiệm vụ phức tạp đóng góp điểm thưởng C1 ({complexTasks.length} nhiệm vụ)
                  </h4>
                  <span className="text-xs font-semibold text-slate-500">
                    Chỉ tính các nhiệm vụ đã được Lãnh đạo phê duyệt
                  </span>
                </div>

                {complexTasks.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-slate-200">
                    Trong tháng {selectedMonth}, bạn chưa có nhiệm vụ nào được phân loại tính chất Phức tạp, Rất phức tạp hoặc Đặc biệt phức tạp.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase border-b border-slate-200">
                        <tr>
                          <th className="p-3 text-center w-12">STT</th>
                          <th className="p-3">Mã việc</th>
                          <th className="p-3">Tên nhiệm vụ / Nội dung</th>
                          <th className="p-3 text-center">Tính chất duyệt</th>
                          <th className="p-3 text-center">Điểm cộng C1</th>
                          <th className="p-3 text-center">Hệ số K</th>
                          <th className="p-3 text-center">Điểm Q.Đổi</th>
                          <th className="p-3 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {complexTasks.map((t: any, idx: number) => {
                          const nat = t.nature || t.approvedNature || t.proposedNature;
                          let natBg = 'bg-blue-100 text-blue-800 border-blue-200';
                          let natPts = '+1đ';
                          if (nat === 'Đặc biệt phức tạp') {
                            natBg = 'bg-purple-100 text-purple-800 border-purple-200';
                            natPts = '+3đ';
                          } else if (nat === 'Rất phức tạp') {
                            natBg = 'bg-indigo-100 text-indigo-800 border-indigo-200';
                            natPts = '+2đ';
                          }
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                              <td className="p-3 font-mono font-bold text-[#1F4E78]">{t.taskCode || t.workId}</td>
                              <td className="p-3">
                                <div className="font-bold text-slate-800">{t.taskName}</div>
                                <div className="text-slate-500 line-clamp-1">{t.detail}</div>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${natBg}`}>
                                  {nat}
                                </span>
                              </td>
                              <td className="p-3 text-center font-black text-blue-800">{natPts}</td>
                              <td className="p-3 text-center font-bold text-slate-700">{t.coef}</td>
                              <td className="p-3 text-center font-bold text-[#1F4E78]">{t.convertedScore}</td>
                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                                  Đã duyệt
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Detail D: Các khoản phạt vi phạm */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowDetailD(!showDetailD)}
            className="w-full px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100/80 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              <h3 className="font-bold text-slate-900">
                Chi tiết điểm D - Thống kê các lỗi vi phạm / trừ điểm ({detD?.items?.length || 0} vi phạm ghi nhận - Trừ chính thức: {scoreD} điểm)
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#1F4E78]">
              <span>{showDetailD ? 'Thu gọn' : 'Xem chi tiết'}</span>
              {showDetailD ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showDetailD && (
            <div className="p-4 overflow-x-auto space-y-4">
              {!detD?.items || detD.items.length === 0 ? (
                <div className="text-center py-8 text-emerald-700 font-bold text-sm bg-emerald-50/50 rounded-xl">
                  Tuyệt vời! Bạn không có lỗi vi phạm hoặc bị trừ điểm trong tháng này.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-rose-50/80 text-rose-900 font-bold uppercase border-b border-rose-200">
                    <tr>
                      <th className="p-3 text-center w-12">STT</th>
                      <th className="p-3">Mã việc / Nhóm</th>
                      <th className="p-3">Tên nhiệm vụ / Nội dung vi phạm</th>
                      <th className="p-3 text-center">Tự động tính</th>
                      <th className="p-3 text-center">Quyết định Lãnh đạo</th>
                      <th className="p-3 text-center">Trừ chính thức</th>
                      <th className="p-3">Căn cứ / Lý do miễn giảm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {detD.items.map((it: any, idx: number) => {
                      const isExempted = it.decision === 'Miễn phạt' || it.officialD === 0;
                      const isReduced = it.decision === 'Giảm phạt' || (it.officialD > 0 && it.officialD < it.autoD);

                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="p-3">
                            <span className="font-mono font-bold text-[#1F4E78]">{it.workId || 'Kỷ luật'}</span>
                            <div className="text-[11px] text-slate-500">{it.group || 'Vi phạm tiến độ'}</div>
                          </td>
                          <td className="p-3 font-bold text-slate-800">{it.taskName || it.reason}</td>
                          <td className="p-3 text-center text-slate-600 font-bold">-{it.autoD || 0}đ</td>
                          <td className="p-3 text-center">
                            {isExempted ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                🟢 Miễn phạt (0đ)
                              </span>
                            ) : isReduced ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                🟡 Giảm trừ
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                🔘 Giữ nguyên
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-black text-rose-700 text-sm">
                            -{it.officialD !== undefined ? it.officialD : it.autoD}đ
                          </td>
                          <td className="p-3 text-slate-600 text-xs italic">
                            {it.reason || (isExempted ? 'Được lãnh đạo xét miễn do lý do chính đáng' : 'Trừ điểm theo quy định')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
