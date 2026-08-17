import React, { useState, useEffect, useMemo } from 'react';
import { KPI_A_CRITERIA, STANDARD_MONTHS, getActiveLoggedInUser, safeFetchJson, formatScore, cleanPosition } from '../utils';
import { CheckCircle, AlertCircle, Save, Calendar, UserCheck, RefreshCw, Zap, RotateCcw, Plus, Minus, Info } from 'lucide-react';

export default function SelfScoreA() {
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [statusA, setStatusA] = useState('Chưa tự chấm');
  const [selfTotal, setSelfTotal] = useState<number | null>(null);
  const [approvedTotal, setApprovedTotal] = useState<number | null>(null);

  // Store raw string values for fluid editing without flicker
  const [scores, setScores] = useState<Record<string, string>>({
    A1: '',
    A2: '',
    A3: '',
    A4: '',
    A5: '',
    A6: '',
    A7: '',
  });
  const [note, setNote] = useState('');
  const [leaderNote, setLeaderNote] = useState('');

  // Initial load
  useEffect(() => {
    let isMounted = true;

    const initData = async () => {
      try {
        setLoading(true);
        const dU = await safeFetchJson<any[]>('/api/users', undefined, 2);
        if (!isMounted) return;

        if (dU.success && dU.data && dU.data.length > 0) {
          const validUsers = dU.data.filter(u => {
            const st = String(u.status || '').toLowerCase();
            return !st.includes('nghỉ') && !st.includes('khoá') && !st.includes('xóa');
          });
          setUsersList(validUsers);

          const activeUser = getActiveLoggedInUser(validUsers);
          setCurrentUser(activeUser);

          const targetUId = activeUser?.id || validUsers[0]?.id;
          setSelectedUserId(targetUId);

          if (targetUId) {
            await loadScoreDataForUser(selectedMonth, targetUId);
          }
        }
      } catch (err) {
        console.warn("Init error in SelfScoreA:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initData();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadScoreDataForUser = async (month: string, uId: number) => {
    try {
      setLoading(true);
      const d = await safeFetchJson<any>(`/api/kpi/detail?month=${month}&userId=${uId}`, undefined, 2);
      if (d.success && d.data) {
        const detailsA = d.data.detailsA;

        if (detailsA && (detailsA.selfTotal !== null && detailsA.selfTotal !== undefined)) {
          setStatusA(detailsA.statusA || 'Đã tự chấm');
          setSelfTotal(detailsA.selfTotal ?? null);
          setApprovedTotal(detailsA.approvedTotal ?? null);
          setNote(detailsA.noteA || '');
          setLeaderNote(detailsA.leaderNoteA || '');

          const sc: Record<string, string> = {
            A1: detailsA.scores?.A1?.self !== undefined && detailsA.scores?.A1?.self !== null ? String(detailsA.scores.A1.self) : '',
            A2: detailsA.scores?.A2?.self !== undefined && detailsA.scores?.A2?.self !== null ? String(detailsA.scores.A2.self) : '',
            A3: detailsA.scores?.A3?.self !== undefined && detailsA.scores?.A3?.self !== null ? String(detailsA.scores.A3.self) : '',
            A4: detailsA.scores?.A4?.self !== undefined && detailsA.scores?.A4?.self !== null ? String(detailsA.scores.A4.self) : '',
            A5: detailsA.scores?.A5?.self !== undefined && detailsA.scores?.A5?.self !== null ? String(detailsA.scores.A5.self) : '',
            A6: detailsA.scores?.A6?.self !== undefined && detailsA.scores?.A6?.self !== null ? String(detailsA.scores.A6.self) : '',
            A7: detailsA.scores?.A7?.self !== undefined && detailsA.scores?.A7?.self !== null ? String(detailsA.scores.A7.self) : '',
          };
          setScores(sc);
        } else {
          resetScores();
        }
      } else {
        resetScores();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const resetScores = () => {
    setStatusA('Chưa tự chấm');
    setSelfTotal(null);
    setApprovedTotal(null);
    setScores({ A1: '', A2: '', A3: '', A4: '', A5: '', A6: '', A7: '' });
    setNote('');
    setLeaderNote('');
  };

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    if (selectedUserId) {
      loadScoreDataForUser(newMonth, selectedUserId);
    }
  };

  const handleUserSelect = (uId: number) => {
    setSelectedUserId(uId);
    loadScoreDataForUser(selectedMonth, uId);
  };

  // Safe numeric parsing for calculations
  const parseNum = (valStr: string | undefined): number => {
    if (!valStr || valStr.trim() === '') return 0;
    const clean = String(valStr).replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  };

  // Text input handler: preserves typing and decimal point seamlessly
  const handleScoreChange = (code: string, maxScore: number, valStr: string) => {
    if (valStr === '') {
      setScores(prev => ({ ...prev, [code]: '' }));
      return;
    }

    // Keep only numbers, commas and dots
    let clean = valStr.replace(/[^0-9.,]/g, '');

    // Allow single decimal separator
    const firstSep = clean.search(/[.,]/);
    if (firstSep !== -1) {
      const before = clean.substring(0, firstSep);
      const sep = clean[firstSep];
      const after = clean.substring(firstSep + 1).replace(/[.,]/g, '');
      clean = before + sep + after;
    }

    // Check maximum boundary
    const parsed = parseNum(clean);
    if (parsed > maxScore) {
      setScores(prev => ({ ...prev, [code]: String(maxScore) }));
      return;
    }

    setScores(prev => ({ ...prev, [code]: clean }));
  };

  // Stepper increment / decrement
  const handleStepScore = (code: string, maxScore: number, delta: number) => {
    const currentVal = parseNum(scores[code]);
    let nextVal = Math.round((currentVal + delta) * 10) / 10;
    if (nextVal < 0) nextVal = 0;
    if (nextVal > maxScore) nextVal = maxScore;
    setScores(prev => ({ ...prev, [code]: String(nextVal) }));
  };

  // Set explicit preset score
  const handleSetPresetScore = (code: string, val: number) => {
    setScores(prev => ({ ...prev, [code]: String(val) }));
  };

  // Fill all 7 criteria to maximum (30/30)
  const handleQuickFillMaxAll = () => {
    const fullScores: Record<string, string> = {};
    KPI_A_CRITERIA.forEach(crit => {
      fullScores[crit.code] = String(crit.maxScore);
    });
    setScores(fullScores);
  };

  // Clear all
  const handleClearAll = () => {
    setScores({ A1: '', A2: '', A3: '', A4: '', A5: '', A6: '', A7: '' });
  };

  // Calculated total score
  const calculatedSelfTotal = useMemo(() => {
    return Object.values(scores).reduce<number>((sum, val) => {
      return sum + parseNum(String(val));
    }, 0);
  }, [scores]);

  const hasEnteredAny = Object.values(scores).some(v => v !== '');
  const selectedUserObj = usersList.find(u => u.id === selectedUserId) || currentUser;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserObj) {
      alert('Vui lòng chọn nhân sự cần tự chấm điểm.');
      return;
    }

    // Convert string scores to numbers for payload
    const numericScores: Record<string, number> = {};
    for (const crit of KPI_A_CRITERIA) {
      const valStr = scores[crit.code];
      if (valStr === '' || valStr === undefined) {
        alert(`Vui lòng nhập điểm cho tiêu chí ${crit.code} - ${crit.name}!`);
        return;
      }
      numericScores[crit.code] = parseNum(valStr);
    }

    try {
      setSaving(true);
      const res = await fetch('/api/kpi/self-score-a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          userId: selectedUserObj.id,
          userName: selectedUserObj.name,
          scores: numericScores,
          note,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedSuccess(true);
        setStatusA('Đã tự chấm');
        setSelfTotal(calculatedSelfTotal);
        setTimeout(() => setSavedSuccess(false), 4000);
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Không thể kết nối đến máy chủ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 font-sans">
      {/* Title */}
      <div className="bg-white border border-slate-300 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-[#1F4E78] text-xs font-black mb-2 border border-blue-200">
            <UserCheck className="w-3.5 h-3.5" />
            <span>ĐÁNH GIÁ NỘI QUY & KỶ LUẬT LAO ĐỘNG</span>
          </div>
          <h1 className="text-2xl md:text-[26px] font-black text-[#0f2440] tracking-tight">
            Tự chấm điểm A - Chấp hành nội quy, quy chế
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Cá nhân thực hiện tự chấm điểm cho 7 tiêu chí chuẩn (A1 - A7) với tổng điểm tối đa là 30 điểm
          </p>
        </div>

        {/* Quick Fill Actions */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={handleQuickFillMaxAll}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-sm cursor-pointer border border-emerald-700 active:scale-95"
            title="Tự động điền điểm tối đa cho toàn bộ 7 tiêu chí (30/30đ)"
          >
            <Zap className="w-3.5 h-3.5" />
            Tự chấm chuẩn (30/30đ)
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
            title="Xóa trắng các ô điểm để nhập lại"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Xóa làm lại
          </button>
        </div>
      </div>

      {/* Filter & Personnel Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Month Selector */}
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-xl text-[#1F4E78] border border-blue-200">
              <Calendar className="w-4 h-4" />
            </div>
            <label className="text-xs font-black uppercase text-slate-700">Tháng:</label>
            <select
              value={selectedMonth}
              onChange={e => handleMonthChange(e.target.value)}
              className="bg-slate-50 border-2 border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black text-[#1F4E78] focus:outline-none focus:border-[#1F4E78] shadow-2xs cursor-pointer"
            >
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>
          </div>

          {/* Personnel Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-black uppercase text-slate-700">Nhân sự:</label>
            <select
              value={selectedUserId || ''}
              onChange={e => handleUserSelect(Number(e.target.value))}
              className="bg-white border-2 border-[#1F4E78] rounded-xl px-3.5 py-1.5 text-xs font-black text-[#0f2440] focus:outline-none min-w-[240px] shadow-2xs cursor-pointer"
            >
              {usersList.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {cleanPosition(u.position)} {u.isLeaderOrAbove ? '(Lãnh đạo)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => selectedUserId && loadScoreDataForUser(selectedMonth, selectedUserId)}
            disabled={loading}
            className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-3.5 py-1.5 rounded-xl text-xs font-black transition shadow-2xs cursor-pointer flex items-center gap-1.5 border border-blue-900 disabled:opacity-50 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>

        {/* Live Score Summary Badge */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Tổng điểm tự chấm:</div>
            <div className="text-xl font-black text-[#1F4E78]">
              {formatScore(calculatedSelfTotal)} <span className="text-xs text-slate-400 font-bold">/ 30đ</span>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200"></div>
          <div className="text-right">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Trạng thái:</div>
            <span
              className={`inline-block text-xs font-black px-2.5 py-0.5 rounded-full border ${
                statusA === 'Đã duyệt'
                  ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                  : statusA === 'Đã tự chấm'
                  ? 'bg-blue-100 text-blue-950 border-blue-300'
                  : 'bg-amber-100 text-amber-950 border-amber-300'
              }`}
            >
              {statusA}
            </span>
          </div>
        </div>
      </div>

      {/* Info & Status Header */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[#1F4E78]" />
          <span className="text-slate-700">
            Đang chấm cho nhân sự: <strong className="text-[#0f2440] font-black text-sm">{selectedUserObj?.name}</strong> ({cleanPosition(selectedUserObj?.position)})
          </span>
        </div>
        <div className="text-slate-600 font-medium flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          <span>Bạn có thể nhập trực tiếp điểm vào ô số hoặc bấm các nút điểm nhanh bên dưới</span>
        </div>
      </div>

      {/* Alert Banner when not scored */}
      {statusA === 'Chưa tự chấm' && !hasEnteredAny && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-xs md:text-sm text-amber-950 shadow-2xs">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            Nhân sự này chưa thực hiện tự chấm điểm A cho tháng <strong>{selectedMonth}</strong>. Vui lòng nhập điểm các tiêu chí (hoặc bấm <strong>Tự chấm chuẩn 30/30đ</strong>) rồi bấm <strong>Lưu kết quả tự chấm A</strong>.
          </div>
        </div>
      )}

      {savedSuccess && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-start gap-3 text-xs md:text-sm text-emerald-950 shadow-2xs">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            Đã lưu kết quả tự chấm A thành công cho <strong>{selectedUserObj?.name}</strong> tháng {selectedMonth}. Điểm tự chấm:{' '}
            <strong>{formatScore(calculatedSelfTotal)} / 30 điểm</strong>.
          </div>
        </div>
      )}

      {leaderNote && (
        <div className="bg-blue-50 border border-blue-300 rounded-2xl p-4 text-xs md:text-sm text-blue-950">
          <strong>Ý kiến lãnh đạo phòng khi duyệt:</strong> {leaderNote}
        </div>
      )}

      {/* Scoring Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* 7 Criteria Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {KPI_A_CRITERIA.map(crit => {
            const rawVal = scores[crit.code] || '';
            const currentNum = parseNum(rawVal);
            const isFilled = rawVal.trim() !== '';

            // Generate preset options: max, max - 0.5, max - 1, etc.
            const presetOptions: number[] = [];
            for (let p = crit.maxScore; p >= 0; p -= 0.5) {
              if (presetOptions.length < 5 || p === 0) {
                presetOptions.push(Math.round(p * 10) / 10);
              }
            }
            // Unique presets sorted descending
            const uniquePresets = Array.from(new Set(presetOptions)).sort((a, b) => b - a);

            return (
              <div
                key={crit.code}
                className={`bg-white rounded-2xl border-2 p-5 shadow-sm flex flex-col justify-between transition-all ${
                  isFilled ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-black text-sm text-[#0f2440] leading-snug">
                      {crit.code} - {crit.name}
                    </h3>
                    <span className="text-[11px] font-black text-blue-900 bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 flex-shrink-0">
                      Tối đa {crit.maxScore}đ
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    {crit.desc}
                  </p>
                </div>

                {/* Score Input & Interactive Controls */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Điểm tự chấm:</span>
                    <button
                      type="button"
                      onClick={() => handleSetPresetScore(crit.code, crit.maxScore)}
                      className="text-[11px] font-black text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-md transition cursor-pointer active:scale-95"
                      title={`Đặt nhanh tối đa ${crit.maxScore} điểm`}
                    >
                      Tối đa ({crit.maxScore}đ)
                    </button>
                  </div>

                  {/* Main Stepper & Numeric Input */}
                  <div className="flex items-center gap-2">
                    {/* Decrement */}
                    <button
                      type="button"
                      onClick={() => handleStepScore(crit.code, crit.maxScore, -0.5)}
                      className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center font-black transition cursor-pointer active:scale-95 shadow-2xs"
                      title="Giảm 0.5 điểm"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    {/* Highly responsive editable text input */}
                    <div className="relative flex-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={rawVal}
                        onChange={e => handleScoreChange(crit.code, crit.maxScore, e.target.value)}
                        placeholder={`0 - ${crit.maxScore}`}
                        className="w-full px-3 py-2 bg-white border-2 border-slate-300 focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-200 rounded-xl text-lg font-black text-center text-[#0f2440] placeholder:text-slate-400 placeholder:font-normal outline-none transition shadow-2xs"
                      />
                    </div>

                    {/* Increment */}
                    <button
                      type="button"
                      onClick={() => handleStepScore(crit.code, crit.maxScore, 0.5)}
                      className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center font-black transition cursor-pointer active:scale-95 shadow-2xs"
                      title="Tăng 0.5 điểm"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick Preset Buttons Row */}
                  <div className="flex items-center flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 font-bold mr-1">Chọn nhanh:</span>
                    {uniquePresets.slice(0, 4).map(p => {
                      const isSelected = isFilled && currentNum === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleSetPresetScore(crit.code, p)}
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                            isSelected
                              ? 'bg-[#1F4E78] text-white border-blue-900 shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {p}đ
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notes & Summary Box */}
        <div className="bg-white rounded-2xl border border-slate-300 p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-black uppercase text-slate-700 mb-2">
              Ghi chú tự chấm / Giải trình của cá nhân (nếu có)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Nhập căn cứ, giải trình hoặc đề xuất liên quan đến điểm tự chấm..."
              className="w-full px-4 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:border-[#1F4E78] focus:ring-2 focus:ring-blue-200 outline-none transition shadow-2xs"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-200">
            <div className="flex items-center gap-4">
              <span className="text-sm font-black text-slate-700">Tổng điểm tự chấm:</span>
              <span className="text-2xl font-black text-[#1F4E78] bg-blue-100/70 border-2 border-blue-300 px-5 py-1.5 rounded-xl shadow-2xs">
                {formatScore(calculatedSelfTotal)} <span className="text-sm font-bold text-slate-600">/ 30 điểm</span>
              </span>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-8 py-3 rounded-xl text-sm font-black transition shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer border border-blue-900 active:scale-95"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu kết quả...' : 'Lưu kết quả tự chấm A'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
