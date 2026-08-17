import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { KPI_A_CRITERIA, STANDARD_MONTHS, safeFetchJson, formatScore, cleanPosition } from '../utils';
import { 
  Award, Save, RefreshCw, CheckCircle, AlertTriangle, User, Calendar, 
  FileText, ShieldCheck, CheckSquare, Info, Plus, Trash2, ArrowRight, 
  ArrowLeft, ExternalLink, ThumbsUp, Zap, HelpCircle, AlertCircle
} from 'lucide-react';

const QUICK_PENALTY_EXEMPTION_REASONS = [
  'Chờ phản hồi/dữ liệu từ đơn vị phối hợp',
  'Sự cố kỹ thuật/hạ tầng ngoài tầm kiểm soát',
  'Đã chủ động khắc phục kịp thời, không ảnh hưởng chất lượng chung',
  'Nhiệm vụ phát sinh đột xuất khối lượng lớn, ưu tiên việc cấp bách',
  'Được lãnh đạo cho phép gia hạn thực tế',
  'Lý do cá nhân đột xuất chính đáng (ốm đau, việc gia đình)'
];

const QUICK_C2_REASONS = [
  'Hoàn thành xuất sắc nhiệm vụ đột xuất do Lãnh đạo giao',
  'Chủ động xử lý sự cố ngoài giờ làm việc',
  'Có sáng kiến cải tiến nâng cao chất lượng quy trình',
  'Khối lượng công việc phát sinh tăng cao và hoàn thành trước hạn'
];

export default function ScoreAcd() {
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Detail Data from server
  const [kpiData, setKpiData] = useState<any>(null);

  // Form State - A
  const [statusA, setStatusA] = useState('Đã duyệt');
  const [scoresA, setScoresA] = useState<Record<string, { approved: number | ''; reason: string }>>({
    A1: { approved: 5, reason: '' },
    A2: { approved: 5, reason: '' },
    A3: { approved: 5, reason: '' },
    A4: { approved: 4, reason: '' },
    A5: { approved: 4, reason: '' },
    A6: { approved: 4, reason: '' },
    A7: { approved: 3, reason: '' },
  });
  const [leaderNoteA, setLeaderNoteA] = useState('');

  // Form State - C2
  const [scoreC2, setScoreC2] = useState<number | ''>(0);
  const [noteC2, setNoteC2] = useState('');

  // Form State - D
  const [penaltyItems, setPenaltyItems] = useState<any[]>([]);
  const [noteD, setNoteD] = useState('');

  // UI state for adding manual penalty
  const [showAddManualD, setShowAddManualD] = useState(false);
  const [newManualD, setNewManualD] = useState({
    group: 'Vi phạm quy định hội họp & giờ giấc',
    taskName: 'Vi phạm kỷ luật nội bộ / chậm báo cáo',
    autoD: 2,
    officialD: 2,
    decision: 'Giữ nguyên',
    reason: ''
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const d = await safeFetchJson<any[]>('/api/users', undefined, 3);
      if (d.success && d.data && d.data.length > 0) {
        setUsers(d.data);
        if (!selectedUserId) {
          setSelectedUserId(d.data[0].id);
          loadUserKpi(selectedMonth, d.data[0].id);
        }
      }
    } catch (err) {
      console.warn("Notice in ScoreAcd fetchUsers:", err);
    }
  };

  const loadUserKpi = async (month: string, uId: number) => {
    try {
      setLoading(true);
      setMessage(null);
      const d = await safeFetchJson(`/api/kpi/detail?month=${month}&userId=${uId}`, undefined, 3);
      if (d.success && d.data) {
        setKpiData(d.data);

        // Populate A
        const detA = d.data.detailsA;
        if (detA) {
          setStatusA(detA.statusA === 'Chưa tự chấm' ? 'Chưa duyệt' : (detA.statusA || 'Đã duyệt'));
          setLeaderNoteA(detA.leaderNoteA || '');
          const newScA: Record<string, { approved: number | ''; reason: string }> = {};
          KPI_A_CRITERIA.forEach(crit => {
            const sc = detA.scores?.[crit.code];
            newScA[crit.code] = {
              approved: sc?.approved !== null && sc?.approved !== undefined ? sc.approved : (sc?.self ?? crit.maxScore),
              reason: sc?.reason || '',
            };
          });
          setScoresA(newScA);
        }

        // Populate C
        const detC = d.data.detailsC;
        if (detC) {
          setScoreC2(detC.c2 ?? 0);
          setNoteC2(detC.noteC2 || '');
        }

        // Populate D
        const detD = d.data.detailsD;
        if (detD && Array.isArray(detD.items)) {
          setPenaltyItems(detD.items);
          setNoteD(detD.noteD || '');
        } else {
          setPenaltyItems([]);
          setNoteD('');
        }
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Lỗi tải dữ liệu KPI nhân sự.' });
    } finally {
      setLoading(false);
    }
  };

  const handleUserChange = (uId: number) => {
    setSelectedUserId(uId);
    loadUserKpi(selectedMonth, uId);
  };

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    if (selectedUserId) {
      loadUserKpi(m, Number(selectedUserId));
    }
  };

  const handleNextUser = () => {
    if (!selectedUserId || users.length === 0) return;
    const currentIndex = users.findIndex(u => u.id === Number(selectedUserId));
    if (currentIndex < users.length - 1) {
      const nextUser = users[currentIndex + 1];
      setSelectedUserId(nextUser.id);
      loadUserKpi(selectedMonth, nextUser.id);
    }
  };

  const handlePrevUser = () => {
    if (!selectedUserId || users.length === 0) return;
    const currentIndex = users.findIndex(u => u.id === Number(selectedUserId));
    if (currentIndex > 0) {
      const prevUser = users[currentIndex - 1];
      setSelectedUserId(prevUser.id);
      loadUserKpi(selectedMonth, prevUser.id);
    }
  };

  // Quick actions for A
  const handleApproveAllSelfA = () => {
    const newScA: Record<string, { approved: number | ''; reason: string }> = {};
    KPI_A_CRITERIA.forEach(crit => {
      const selfVal = kpiData?.detailsA?.scores?.[crit.code]?.self;
      newScA[crit.code] = {
        approved: selfVal !== null && selfVal !== undefined ? selfVal : crit.maxScore,
        reason: scoresA[crit.code]?.reason || ''
      };
    });
    setScoresA(newScA);
  };

  const handleApproveAllMaxA = () => {
    const newScA: Record<string, { approved: number | ''; reason: string }> = {};
    KPI_A_CRITERIA.forEach(crit => {
      newScA[crit.code] = {
        approved: crit.maxScore,
        reason: scoresA[crit.code]?.reason || ''
      };
    });
    setScoresA(newScA);
  };

  const handleScoreAChange = (code: string, maxScore: number, valStr: string) => {
    if (valStr === '') {
      setScoresA(prev => ({ ...prev, [code]: { ...prev[code], approved: '' } }));
      return;
    }
    const normalized = valStr.replace(',', '.');
    let val = parseFloat(normalized);
    if (isNaN(val)) return;
    if (val < 0) val = 0;
    if (val > maxScore) val = maxScore;
    setScoresA(prev => ({ ...prev, [code]: { ...prev[code], approved: val } }));
  };

  const handleReasonAChange = (code: string, reason: string) => {
    setScoresA(prev => ({ ...prev, [code]: { ...prev[code], reason } }));
  };

  // Penalty D manipulation
  const handlePenaltyDecisionChange = (index: number, decision: string) => {
    setPenaltyItems(prev => {
      const updated = [...prev];
      const it = { ...updated[index] };
      it.decision = decision;
      const baseAutoD = parseFloat(it.autoD) || 2;
      
      if (decision === 'Miễn phạt') {
        it.officialD = 0;
        if (!it.reason) it.reason = 'Lãnh đạo phê duyệt miễn trừ do có lý do chính đáng';
      } else if (decision === 'Giảm phạt') {
        it.officialD = Math.max(0.5, Math.round((baseAutoD / 2) * 10) / 10);
        if (!it.reason) it.reason = 'Lãnh đạo duyệt giảm trừ do chủ động khắc phục kịp thời';
      } else if (decision === 'Tăng phạt') {
        it.officialD = baseAutoD + 1;
        if (!it.reason) it.reason = 'Tăng mức trừ do vi phạm nhiều lần / không có giải trình';
      } else {
        it.officialD = baseAutoD;
      }
      updated[index] = it;
      return updated;
    });
  };

  const handlePenaltyScoreChange = (index: number, valStr: string) => {
    setPenaltyItems(prev => {
      const updated = [...prev];
      const val = parseFloat(valStr);
      updated[index] = { 
        ...updated[index], 
        officialD: isNaN(val) ? 0 : Math.max(0, val),
        decision: isNaN(val) || val === 0 ? 'Miễn phạt' : (val < updated[index].autoD ? 'Giảm phạt' : (val > updated[index].autoD ? 'Tăng phạt' : 'Giữ nguyên'))
      };
      return updated;
    });
  };

  const handlePenaltyReasonChange = (index: number, reason: string) => {
    setPenaltyItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], reason };
      return updated;
    });
  };

  const handleApplyQuickPenaltyReason = (index: number, reason: string) => {
    setPenaltyItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], reason };
      return updated;
    });
  };

  const handleRemovePenaltyItem = (index: number) => {
    setPenaltyItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddManualPenalty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newManualD.taskName.trim()) return;

    const item = {
      id: `D-MANUAL-${Date.now()}`,
      isManual: true,
      group: newManualD.group,
      level: 'Trung bình',
      taskName: newManualD.taskName,
      autoD: newManualD.autoD,
      officialD: newManualD.officialD,
      decision: newManualD.decision,
      reason: newManualD.reason || 'Khoản trừ kỷ luật do lãnh đạo trực tiếp ghi nhận',
      date: new Date().toISOString()
    };

    setPenaltyItems(prev => [...prev, item]);
    setShowAddManualD(false);
    setNewManualD({
      group: 'Vi phạm quy định hội họp & giờ giấc',
      taskName: '',
      autoD: 2,
      officialD: 2,
      decision: 'Giữ nguyên',
      reason: ''
    });
  };

  // Calculations for current form
  const calculatedApprovedA = Object.keys(scoresA).reduce<number>((sum, k) => {
    const val = scoresA[k]?.approved;
    return sum + (typeof val === 'number' ? val : 0);
  }, 0);

  const autoC1 = kpiData?.detailsC?.autoC1 || 0;
  const numC2 = typeof scoreC2 === 'number' ? scoreC2 : 0;
  const totalC = Math.min(10, autoC1 + numC2);

  const totalAutoD = penaltyItems.reduce<number>((sum, item) => sum + (parseFloat(item.autoD) || 0), 0);
  const totalOfficialD = penaltyItems.reduce<number>((sum, item) => {
    const val = item.officialD !== undefined ? parseFloat(item.officialD) : parseFloat(item.autoD || '0');
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  const totalExemptedD = Math.max(0, totalAutoD - totalOfficialD);

  const bTotal = kpiData?.summary?.bTotal || 0;
  const calculatedTotalKpi = Math.min(100, Math.max(0, Math.round((calculatedApprovedA + bTotal + totalC - totalOfficialD) * 100) / 100));

  let calculatedRank = 'Hoàn thành tốt';
  if (calculatedTotalKpi >= 95) calculatedRank = 'Hoàn thành xuất sắc';
  else if (calculatedTotalKpi >= 80) calculatedRank = 'Hoàn thành tốt';
  else if (calculatedTotalKpi >= 65) calculatedRank = 'Hoàn thành';
  else calculatedRank = 'Không hoàn thành';

  const handleSaveApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    try {
      setSaving(true);
      setMessage(null);

      const targetUser = users.find(u => u.id === Number(selectedUserId));

      const payloadDetailsA = {
        statusA: 'Đã duyệt',
        selfTotal: kpiData?.detailsA?.selfTotal ?? null,
        approvedTotal: calculatedApprovedA,
        noteA: kpiData?.detailsA?.noteA || '',
        leaderNoteA,
        scores: {
          A1: { max: 5, self: kpiData?.detailsA?.scores?.A1?.self ?? null, approved: scoresA.A1.approved, reason: scoresA.A1.reason },
          A2: { max: 5, self: kpiData?.detailsA?.scores?.A2?.self ?? null, approved: scoresA.A2.approved, reason: scoresA.A2.reason },
          A3: { max: 5, self: kpiData?.detailsA?.scores?.A3?.self ?? null, approved: scoresA.A3.approved, reason: scoresA.A3.reason },
          A4: { max: 4, self: kpiData?.detailsA?.scores?.A4?.self ?? null, approved: scoresA.A4.approved, reason: scoresA.A4.reason },
          A5: { max: 4, self: kpiData?.detailsA?.scores?.A5?.self ?? null, approved: scoresA.A5.approved, reason: scoresA.A5.reason },
          A6: { max: 4, self: kpiData?.detailsA?.scores?.A6?.self ?? null, approved: scoresA.A6.approved, reason: scoresA.A6.reason },
          A7: { max: 3, self: kpiData?.detailsA?.scores?.A7?.self ?? null, approved: scoresA.A7.approved, reason: scoresA.A7.reason },
        }
      };

      const payloadDetailsC = {
        c1: autoC1,
        c2: numC2,
        totalC,
        noteC2,
        noteC: 'C1 tự động theo điểm tính chất bình quân phòng; C2 do lãnh đạo đánh giá khen thưởng',
        personalNatureTotal: kpiData?.detailsC?.personalNatureTotal || 0,
        deptNatureTotal: kpiData?.detailsC?.deptNatureTotal || 0,
        avgDeptNature: kpiData?.detailsC?.avgDeptNature || 0,
        activeEmployeeCount: kpiData?.detailsC?.activeEmployeeCount || 0
      };

      const payloadDetailsD = {
        items: penaltyItems,
        totalAutoD,
        totalOfficialD,
        totalExemptedD,
        noteD,
        exemptedCount: penaltyItems.filter(it => it.decision === 'Miễn phạt' || it.officialD === 0).length,
        reducedCount: penaltyItems.filter(it => it.decision === 'Giảm phạt' || (it.officialD > 0 && it.officialD < it.autoD)).length,
        keptCount: penaltyItems.filter(it => it.decision === 'Giữ nguyên' || it.officialD === it.autoD).length
      };

      const res = await fetch('/api/kpi/approve-acd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          userId: Number(selectedUserId),
          userName: targetUser?.name,
          detailsA: payloadDetailsA,
          detailsC: payloadDetailsC,
          detailsD: payloadDetailsD,
          approverName: 'Lãnh đạo phòng'
        })
      });

      const d = await res.json();
      if (d.success) {
        setMessage({ 
          type: 'success', 
          text: `Đã lưu phê duyệt KPI thành công cho ${targetUser?.name}: A (${calculatedApprovedA}đ) + B (${bTotal}đ) + C (${totalC}đ) - D (-${totalOfficialD}đ) = Tổng ${calculatedTotalKpi}đ (${calculatedRank})!` 
        });
        await loadUserKpi(selectedMonth, Number(selectedUserId));
      } else {
        setMessage({ type: 'error', text: d.error || 'Có lỗi xảy ra khi lưu phê duyệt' });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Không thể kết nối đến máy chủ.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculateAll = async () => {
    try {
      setRecalculating(true);
      const res = await fetch('/api/kpi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth })
      });
      const d = await res.json();
      if (d.success) {
        setMessage({ type: 'success', text: d.message || 'Đã tính lại KPI toàn bộ nhân sự thành công!' });
        if (selectedUserId) {
          await loadUserKpi(selectedMonth, Number(selectedUserId));
        }
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Lỗi khi tính lại KPI toàn phòng.' });
    } finally {
      setRecalculating(false);
    }
  };

  const targetUserObj = users.find(u => u.id === Number(selectedUserId));
  const currentUserIndex = users.findIndex(u => u.id === Number(selectedUserId));

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 font-sans text-slate-800">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-[#1F4E78]" />
            <h1 className="text-2xl md:text-[26px] font-black text-[#0f2440] tracking-tight">
              Điều hành & Phê duyệt KPI (A / C / D)
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Dành cho Lãnh đạo phòng: Duyệt điểm A (Quy chế), C2 (Thưởng xuất sắc) và Xét Miễn/Giảm điểm D (Vi phạm).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRecalculateAll}
            disabled={recalculating}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
            title="Tính lại KPI toàn bộ nhân sự theo công thức chuẩn hóa mới nhất"
          >
            <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Đang tính toán...' : 'Tính lại toàn phòng'}
          </button>

          {selectedUserId && (
            <Link
              to="/kpi"
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              <ExternalLink className="w-4 h-4 text-[#1F4E78]" />
              <span>Xem KPI cá nhân</span>
            </Link>
          )}
        </div>
      </div>

      {/* Filter & Personnel Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#1F4E78]" />
              <label className="text-xs font-bold text-slate-600 uppercase">Tháng:</label>
              <select
                value={selectedMonth}
                onChange={e => handleMonthChange(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-[#1F4E78]"
              >
                {STANDARD_MONTHS.map(m => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#1F4E78]" />
              <label className="text-xs font-bold text-slate-600 uppercase">Nhân sự:</label>
              <select
                value={selectedUserId}
                onChange={e => handleUserChange(Number(e.target.value))}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-[#0f2440] focus:outline-none focus:border-[#1F4E78] min-w-[200px]"
              >
                {users.map((u, idx) => (
                  <option key={u.id} value={u.id}>
                    {idx + 1}. {u.name} ({cleanPosition(u.position)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Navigation Prev / Next User */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevUser}
              disabled={currentUserIndex <= 0}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 disabled:opacity-40 flex items-center gap-1 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Trước</span>
            </button>
            <span className="text-xs font-bold text-slate-500">
              {currentUserIndex + 1} / {users.length}
            </span>
            <button
              onClick={handleNextUser}
              disabled={currentUserIndex >= users.length - 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 disabled:opacity-40 flex items-center gap-1 transition"
            >
              <span>Sau</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Selected User Overview Pill */}
        {targetUserObj && (
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1F4E78] text-white flex items-center justify-center font-black text-xs">
                {targetUserObj.name.split(' ').pop()?.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">
                  {targetUserObj.name}{' '}
                  <span className="font-normal text-slate-500 text-xs">
                    ({cleanPosition(targetUserObj.position)})
                  </span>
                </div>
                <div className="text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>Việc được duyệt: <strong className="text-emerald-700">{kpiData?.summary?.approvedWorks || 0}</strong></span>
                  <span>•</span>
                  <span>Điểm quy đổi (B): <strong className="text-blue-700">{formatScore(kpiData?.summary?.bTotal)}đ</strong></span>
                  <span>•</span>
                  <span>Trạng thái A: <strong className={kpiData?.detailsA?.statusA === 'Đã tự chấm' ? 'text-emerald-700' : 'text-amber-700'}>{kpiData?.detailsA?.statusA || 'Chưa tự chấm'}</strong></span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg font-bold bg-blue-50 text-blue-800 border border-blue-200">
                A (Duyệt): {formatScore(calculatedApprovedA)}/30đ
              </span>
              <span className="px-2.5 py-1 rounded-lg font-bold bg-purple-50 text-purple-800 border border-purple-200">
                C (C1+C2): +{formatScore(totalC)}/10đ
              </span>
              <span className={`px-2.5 py-1 rounded-lg font-bold border ${totalOfficialD > 0 ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                D (Phạt): -{formatScore(totalOfficialD)}đ
              </span>
              <span className="px-3 py-1 rounded-lg font-black bg-[#1F4E78] text-white">
                Tổng KPI: {formatScore(calculatedTotalKpi)}đ ({calculatedRank})
              </span>
            </div>
          </div>
        )}
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm flex items-start gap-2 shadow-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-500 border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-[#1F4E78] animate-spin" />
          <p className="text-sm font-medium">Đang tải và đồng bộ dữ liệu KPI của nhân sự...</p>
        </div>
      ) : (
        <form onSubmit={handleSaveApproval} className="space-y-6">
          {/* SECTION 1: DUYỆT ĐIỂM A */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-blue-50/40 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#1F4E78] text-white text-xs font-black flex items-center justify-center">1</span>
                  <h2 className="text-[16px] font-black text-[#0f2440]">
                    Duyệt điểm A - Chấp hành nội quy, quy chế (Tối đa 30 điểm)
                  </h2>
                </div>
                <div className="text-xs text-slate-500 mt-1 pl-8">
                  Nhân viên tự chấm:{' '}
                  <strong className="text-slate-800">
                    {kpiData?.detailsA?.selfTotal !== null && kpiData?.detailsA?.selfTotal !== undefined 
                      ? `${formatScore(kpiData.detailsA.selfTotal)} / 30 điểm` 
                      : 'Chưa tự chấm'}
                  </strong>
                  {kpiData?.detailsA?.noteA && (
                    <span className="ml-2 italic text-slate-600">
                      (Ý kiến NV: "{kpiData.detailsA.noteA}")
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApproveAllSelfA}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition shadow-xs"
                >
                  Duyệt bằng tự chấm
                </button>
                <button
                  type="button"
                  onClick={handleApproveAllMaxA}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition shadow-xs"
                >
                  Duyệt tối đa (30đ)
                </button>
                <div className="h-6 w-px bg-slate-300"></div>
                <span className="text-sm font-black text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                  Tổng duyệt A: {formatScore(calculatedApprovedA)} / 30đ
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100/75 border-b border-slate-200 text-xs font-bold text-slate-700">
                  <tr>
                    <th className="p-3 w-12 text-center">Mã</th>
                    <th className="p-3">Nội dung tiêu chí đánh giá</th>
                    <th className="p-3 w-20 text-center">Tối đa</th>
                    <th className="p-3 w-24 text-center">Tự chấm</th>
                    <th className="p-3 w-32 text-center">Lãnh đạo duyệt</th>
                    <th className="p-3">Lý do điều chỉnh (nếu có)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {KPI_A_CRITERIA.map(crit => {
                    const selfVal = kpiData?.detailsA?.scores?.[crit.code]?.self;
                    return (
                      <tr key={crit.code} className="hover:bg-slate-50/70 transition">
                        <td className="p-3 text-center font-bold text-slate-800">{crit.code}</td>
                        <td className="p-3">
                          <div className="font-bold text-[#0f2440] text-sm">{crit.name}</div>
                          <div className="text-xs text-slate-500 leading-snug mt-0.5">{crit.desc}</div>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-600">{crit.maxScore}</td>
                        <td className="p-3 text-center">
                          {selfVal !== null && selfVal !== undefined ? (
                            <span className="font-bold text-[#1F4E78] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {formatScore(selfVal)}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 italic">Chưa chấm</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max={crit.maxScore}
                            value={scoresA[crit.code]?.approved ?? ''}
                            onChange={e =>
                              handleScoreAChange(crit.code, crit.maxScore, e.target.value)
                            }
                            className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-bold text-emerald-700 focus:border-emerald-600 outline-none text-sm shadow-inner"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={scoresA[crit.code]?.reason ?? ''}
                            onChange={e => handleReasonAChange(crit.code, e.target.value)}
                            placeholder="Nhập lý do tăng/giảm điểm tiêu chí này..."
                            className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs focus:border-[#1F4E78] outline-none"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50/80 border-t border-slate-200">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nhận xét chung của Lãnh đạo về chấp hành nội quy (A):
              </label>
              <input
                type="text"
                value={leaderNoteA}
                onChange={e => setLeaderNoteA(e.target.value)}
                placeholder="Nhập đánh giá chung về tinh thần trách nhiệm, kỷ luật giờ giấc, tác phong công tác..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:border-[#1F4E78] outline-none"
              />
            </div>
          </div>

          {/* SECTION 2: DUYỆT ĐIỂM C (C1 TỰ ĐỘNG + C2 KHEN THƯỞNG) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#1F4E78] text-white text-xs font-black flex items-center justify-center">2</span>
                  <h2 className="text-[16px] font-black text-[#0f2440]">
                    Điểm C - Điểm thưởng / Tính chất công việc (Tối đa 10.0 điểm)
                  </h2>
                </div>
                <div className="text-xs text-slate-500 pl-8 mt-0.5">
                  C1: Tính toán tự động theo độ phức tạp công việc được duyệt | C2: Lãnh đạo chấm việc khó, đột xuất, xuất sắc
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Tổng điểm thưởng C:</span>
                <span className="text-base font-black text-[#1F4E78] bg-blue-50 px-3 py-1 rounded-xl border border-blue-200">
                  +{formatScore(totalC)} / 10.0 điểm
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* C1 Breakdown Card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-blue-700" />
                      <span className="font-bold text-sm text-slate-800">Điểm C1 (Tự động từ tính chất):</span>
                    </div>
                    <span className="font-black text-blue-700 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-sm">
                      {formatScore(autoC1)} / 6.0 điểm
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Công thức: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-blue-800 font-bold">C1 = Min(6, Round((Điểm TC cá nhân × 6) / Điểm TC BQ phòng))</code>
                  </p>

                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                    <div>
                      Điểm tính chất cá nhân:{' '}
                      <strong className="text-[#1F4E78]">
                        {formatScore(kpiData?.detailsC?.personalNatureTotal)}đ
                      </strong>
                    </div>
                    <div>
                      Điểm tính chất BQ phòng:{' '}
                      <strong className="text-slate-800">
                        {formatScore(kpiData?.detailsC?.avgDeptNature)}đ
                      </strong>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">Đặc biệt (+3đ)</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">Rất phức tạp (+2đ)</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">Phức tạp (+1đ)</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">Trung bình & Đơn giản (0đ)</span>
                  </div>
                </div>

                {kpiData?.detailsC?.complexTasks?.length > 0 && (
                  <div className="text-[11px] text-slate-500 border-t border-slate-200 pt-2">
                    Có <strong>{kpiData.detailsC.complexTasks.length} nhiệm vụ phức tạp</strong> đóng góp vào điểm C1 tháng này.
                  </div>
                )}
              </div>

              {/* C2 Input Card */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ThumbsUp className="w-4 h-4 text-emerald-700" />
                    <span className="font-bold text-sm text-slate-800">Điểm C2 (Lãnh đạo khen thưởng):</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="4"
                      value={scoreC2}
                      onChange={e => setScoreC2(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-bold text-[#1F4E78] focus:border-[#1F4E78] outline-none text-sm shadow-inner"
                    />
                    <span className="text-xs font-bold text-slate-500">/ 4.0 điểm</span>
                  </div>
                </div>

                {/* Quick C2 presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-500">Chọn nhanh:</span>
                  {[
                    { label: '0đ (Không)', val: 0 },
                    { label: '+1.0đ (Khá)', val: 1 },
                    { label: '+2.0đ (Tốt)', val: 2 },
                    { label: '+3.0đ (Rất tốt)', val: 3 },
                    { label: '+4.0đ (Xuất sắc)', val: 4 },
                  ].map(p => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setScoreC2(p.val)}
                      className={`px-2 py-0.5 text-xs font-bold rounded-lg border transition ${
                        scoreC2 === p.val 
                          ? 'bg-[#1F4E78] text-white border-[#1F4E78]' 
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Lý do / Căn cứ khen thưởng C2:
                  </label>
                  <input
                    type="text"
                    value={noteC2}
                    onChange={e => setNoteC2(e.target.value)}
                    placeholder="Ví dụ: Hoàn thành xuất sắc nhiệm vụ đột xuất hỗ trợ Ban Giám đốc..."
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:border-[#1F4E78] outline-none"
                  />
                </div>

                {/* Quick C2 Reason pills */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Gợi ý lý do C2:</span>
                  <div className="flex flex-wrap gap-1">
                    {QUICK_C2_REASONS.map((r, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setNoteC2(r)}
                        className="text-[11px] bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 px-2 py-0.5 rounded text-left transition"
                      >
                        + {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: DUYỆT ĐIỂM D - TỰ ĐỘNG VÀ XÉT MIỄN / GIẢM PHẠT */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-rose-700 text-white text-xs font-black flex items-center justify-center">3</span>
                  <h2 className="text-[16px] font-black text-[#0f2440]">
                    Điểm D - Điểm phạt vi phạm & Phê duyệt Miễn / Giảm phạt
                  </h2>
                </div>
                <div className="text-xs text-slate-500 pl-8 mt-0.5">
                  Thống kê tự động từ thực tế công việc (Chậm tiến độ -2đ, Không hoàn thành -3đ, Không đạt chất lượng -3đ, Bổ sung nhiều lần -1đ).
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddManualD(!showAddManualD)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm khoản phạt kỷ luật</span>
                </button>

                <div className="flex items-center gap-2 bg-rose-50 px-3 py-1 rounded-xl border border-rose-200">
                  <span className="text-xs font-bold text-rose-800">Trừ chính thức:</span>
                  <span className="text-base font-black text-rose-700">
                    - {formatScore(totalOfficialD)} điểm
                  </span>
                </div>
              </div>
            </div>

            {/* D Summary Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-xs text-slate-500">Hệ thống tự động ghi nhận:</div>
                <div className="text-lg font-black text-slate-800">
                  - {formatScore(totalAutoD)} điểm <span className="text-xs font-normal text-slate-500">({penaltyItems.length} vi phạm)</span>
                </div>
              </div>

              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                <div className="text-xs text-emerald-800 font-semibold">Lãnh đạo đã duyệt miễn/giảm:</div>
                <div className="text-lg font-black text-emerald-700">
                  + {formatScore(totalExemptedD)} điểm <span className="text-xs font-normal text-emerald-600">({penaltyItems.filter(it => it.decision === 'Miễn phạt').length} việc miễn, {penaltyItems.filter(it => it.decision === 'Giảm phạt').length} việc giảm)</span>
                </div>
              </div>

              <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200">
                <div className="text-xs text-rose-800 font-semibold">Điểm phạt thực tế trừ vào KPI:</div>
                <div className="text-lg font-black text-rose-700">
                  - {formatScore(totalOfficialD)} điểm
                </div>
              </div>
            </div>

            {/* Add manual penalty popup form */}
            {showAddManualD && (
              <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-[#1F4E78] tracking-wider">
                    Thêm khoản trừ kỷ luật ngoài công việc
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddManualD(false)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Đóng
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Loại vi phạm:</label>
                    <select
                      value={newManualD.group}
                      onChange={e => setNewManualD({ ...newManualD, group: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="Vi phạm quy định hội họp & giờ giấc">Vi phạm hội họp / giờ giấc</option>
                      <option value="Chậm nộp báo cáo định kỳ">Chậm nộp báo cáo định kỳ</option>
                      <option value="Vi phạm văn hóa công sở / quy tắc">Vi phạm văn hóa công sở</option>
                      <option value="Không chấp hành phân công đột xuất">Không chấp hành phân công</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Nội dung vi phạm:</label>
                    <input
                      type="text"
                      value={newManualD.taskName}
                      onChange={e => setNewManualD({ ...newManualD, taskName: e.target.value })}
                      placeholder="Mô tả lỗi vi phạm phát sinh..."
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Điểm trừ phạt:</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={newManualD.officialD}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 1;
                        setNewManualD({ ...newManualD, autoD: val, officialD: val });
                      }}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-center font-bold text-rose-700"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddManualPenalty}
                      className="w-full bg-[#1F4E78] text-white py-1.5 rounded text-xs font-bold hover:bg-[#153a5c] transition"
                    >
                      Thêm vào danh sách D
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Penalty Items List */}
            {penaltyItems.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm bg-slate-50 rounded-xl border border-slate-200">
                <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                Không có lỗi vi phạm hoặc chậm tiến độ nào trong tháng này. Điểm phạt D = 0 điểm.
              </div>
            ) : (
              <div className="space-y-3">
                {penaltyItems.map((item, idx) => {
                  const isExempted = item.decision === 'Miễn phạt' || item.officialD === 0;
                  const isReduced = item.decision === 'Giảm phạt' || (item.officialD > 0 && item.officialD < item.autoD);
                  
                  return (
                    <div
                      key={item.id || idx}
                      className={`p-4 rounded-xl border transition space-y-3 ${
                        isExempted 
                          ? 'bg-emerald-50/40 border-emerald-200' 
                          : isReduced 
                          ? 'bg-amber-50/40 border-amber-200' 
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 max-w-xl">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-bold text-xs px-2 py-0.5 rounded ${
                              item.group?.includes('Chậm') 
                                ? 'bg-amber-100 text-amber-800' 
                                : item.group?.includes('Không hoàn thành') || item.group?.includes('Không đạt') 
                                ? 'bg-rose-100 text-rose-800' 
                                : 'bg-slate-200 text-slate-800'
                            }`}>
                              {item.group || 'Vi phạm'}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">
                              {item.taskName || item.reason}
                            </span>
                            {item.workId && (
                              <span className="text-[11px] font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                {item.workId}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-600 flex items-center gap-2">
                            <span>Hệ thống tự ghi nhận: trừ <strong className="text-rose-700">{formatScore(item.autoD)} điểm</strong></span>
                            {item.date && <span>• Thời điểm: {new Date(item.date).toLocaleDateString('vi-VN')}</span>}
                          </div>
                        </div>

                        {/* Decision & Score Control */}
                        <div className="flex flex-wrap items-center gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              Quyết định của Lãnh đạo:
                            </label>
                            <select
                              value={item.decision || 'Giữ nguyên'}
                              onChange={e => handlePenaltyDecisionChange(idx, e.target.value)}
                              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:border-[#1F4E78] outline-none shadow-xs"
                            >
                              <option value="Giữ nguyên">🔘 Giữ nguyên mức phạt</option>
                              <option value="Miễn phạt">🟢 Miễn phạt 100% (0đ)</option>
                              <option value="Giảm phạt">🟡 Giảm 50% mức phạt</option>
                              <option value="Tăng phạt">🔴 Tăng mức phạt</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              Điểm trừ:
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={item.officialD !== undefined ? item.officialD : item.autoD}
                                onChange={e => handlePenaltyScoreChange(idx, e.target.value)}
                                className={`w-16 px-2 py-1 bg-white border rounded-lg text-center text-xs font-black outline-none shadow-inner ${
                                  isExempted 
                                    ? 'text-emerald-700 border-emerald-300' 
                                    : 'text-rose-700 border-slate-300 focus:border-rose-600'
                                }`}
                              />
                              <span className="text-xs font-bold text-slate-500">đ</span>
                            </div>
                          </div>

                          {item.isManual && (
                            <button
                              type="button"
                              onClick={() => handleRemovePenaltyItem(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 mt-4 transition"
                              title="Xóa khoản phạt thủ công này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Reason & justification for exemption / reduction */}
                      <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-700">
                            Căn cứ / Lý do Lãnh đạo xét miễn, giảm hoặc giữ nguyên:
                          </label>
                          {isExempted && (
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Đã miễn trừ 100%
                            </span>
                          )}
                          {isReduced && (
                            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              Đã giảm trừ một phần
                            </span>
                          )}
                        </div>

                        <input
                          type="text"
                          value={item.reason || ''}
                          onChange={e => handlePenaltyReasonChange(idx, e.target.value)}
                          placeholder="Ghi rõ lý do chính đáng để miễn/giảm (ví dụ: Chờ dữ liệu đối tác, sự cố kỹ thuật, đã khắc phục kịp thời...)"
                          className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs focus:border-[#1F4E78] outline-none"
                        />

                        {/* Quick Reason Chips */}
                        <div className="flex flex-wrap gap-1 pt-1">
                          {QUICK_PENALTY_EXEMPTION_REASONS.map((qr, qIdx) => (
                            <button
                              key={qIdx}
                              type="button"
                              onClick={() => handleApplyQuickPenaltyReason(idx, qr)}
                              className="text-[10px] bg-slate-100 hover:bg-blue-50 hover:text-[#1F4E78] hover:border-blue-200 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded transition"
                            >
                              + {qr}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Ghi chú chung của Lãnh đạo về điểm D (Vi phạm & Miễn giảm):
              </label>
              <input
                type="text"
                value={noteD}
                onChange={e => setNoteD(e.target.value)}
                placeholder="Nhập nhận xét tổng hợp về các trường hợp vi phạm hoặc căn cứ miễn giảm chung..."
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:border-[#1F4E78] outline-none"
              />
            </div>
          </div>

          {/* SECTION 4: TỔNG HỢP & SUBMIT BAR (STICKY BOTTOM) */}
          <div className="bg-white rounded-2xl border-2 border-[#1F4E78] shadow-lg p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Kết quả KPI tháng {selectedMonth} của {targetUserObj?.name}:
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm text-slate-700 font-bold">
                  A ({formatScore(calculatedApprovedA)}đ) + B ({formatScore(bTotal)}đ) + C ({formatScore(totalC)}đ) - D ({formatScore(totalOfficialD)}đ) =
                </span>
                <span className="text-2xl sm:text-3xl font-black text-[#1F4E78]">
                  {formatScore(calculatedTotalKpi)} / 100 điểm
                </span>
                <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase ${
                  calculatedTotalKpi >= 95 
                    ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                    : calculatedTotalKpi >= 80 
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' 
                    : calculatedTotalKpi >= 65 
                    ? 'bg-blue-100 text-blue-900 border border-blue-300' 
                    : 'bg-rose-100 text-rose-900 border border-rose-300'
                }`}>
                  {calculatedRank}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#1F4E78] hover:bg-[#153a5c] text-white px-7 py-3 rounded-xl text-sm font-bold transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                {saving ? 'Đang lưu phê duyệt...' : 'Lưu kết quả duyệt A / C / D'}
              </button>

              {currentUserIndex < users.length - 1 && (
                <button
                  type="button"
                  onClick={async (e) => {
                    await handleSaveApproval(e);
                    handleNextUser();
                  }}
                  disabled={saving}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-3 rounded-xl text-sm font-bold transition shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Lưu nhân sự hiện tại và chuyển sang duyệt nhân sự kế tiếp"
                >
                  <span>Lưu & Chuyển tiếp</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
