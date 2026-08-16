import React, { useState, useEffect } from 'react';
import { KPI_A_CRITERIA, STANDARD_MONTHS, getActiveLoggedInUser, normalizeNFC, safeFetchJson } from '../utils';
import { CheckCircle, AlertCircle, Save, Calendar, UserCheck, HelpCircle } from 'lucide-react';

export default function SelfScoreA() {
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [statusA, setStatusA] = useState('Chưa tự chấm');
  const [selfTotal, setSelfTotal] = useState<number | null>(null);
  const [approvedTotal, setApprovedTotal] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, number | ''>>({
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

  const fetchUserAndData = async (targetMonth = selectedMonth) => {
    try {
      setLoading(true);
      const dU = await safeFetchJson<any[]>('/api/users', undefined, 3);
      if (dU.success && dU.data && dU.data.length > 0) {
        const activeUser = getActiveLoggedInUser(dU.data);
        setCurrentUser(activeUser);
        if (activeUser) {
          await loadScoreData(targetMonth, activeUser.id);
        }
      }
    } catch (err) {
      console.warn("Notice in SelfScoreA:", err);
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

  const loadScoreData = async (month: string, uId: number) => {
    try {
      setLoading(true);
      const d = await safeFetchJson(`/api/kpi/detail?month=${month}&userId=${uId}`, undefined, 3);
      if (d.success && d.data) {
        const detailsA = d.data.detailsA;

        if (detailsA) {
          setStatusA(detailsA.statusA || 'Chưa tự chấm');
          setSelfTotal(detailsA.selfTotal ?? null);
          setApprovedTotal(detailsA.approvedTotal ?? null);
          setNote(detailsA.noteA || '');
          setLeaderNote(detailsA.leaderNoteA || '');

          const sc: Record<string, number | ''> = {
            A1: detailsA.scores?.A1?.self ?? '',
            A2: detailsA.scores?.A2?.self ?? '',
            A3: detailsA.scores?.A3?.self ?? '',
            A4: detailsA.scores?.A4?.self ?? '',
            A5: detailsA.scores?.A5?.self ?? '',
            A6: detailsA.scores?.A6?.self ?? '',
            A7: detailsA.scores?.A7?.self ?? '',
          };
          setScores(sc);
        } else {
          resetScores();
        }
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
    if (currentUser) {
      loadScoreData(newMonth, currentUser.id);
    }
  };

  const handleScoreChange = (code: string, maxScore: number, valStr: string) => {
    if (valStr === '') {
      setScores(prev => ({ ...prev, [code]: '' }));
      return;
    }
    let val = parseFloat(valStr);
    if (isNaN(val)) return;
    if (val < 0) val = 0;
    if (val > maxScore) val = maxScore;
    setScores(prev => ({ ...prev, [code]: val }));
  };

  const calculatedSelfTotal = Object.values(scores).reduce<number>((sum, val) => {
    const num = typeof val === 'number' ? val : 0;
    return sum + num;
  }, 0);

  const hasEnteredAny = Object.values(scores).some(v => v !== '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    // Validate completeness
    for (const crit of KPI_A_CRITERIA) {
      if (scores[crit.code] === '' || scores[crit.code] === undefined) {
        alert(`Vui lòng nhập điểm cho tiêu chí ${crit.code} - ${crit.name}!`);
        return;
      }
    }

    try {
      setSaving(true);
      const res = await fetch('/api/kpi/self-score-a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          userId: currentUser.id,
          userName: currentUser.name,
          scores,
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
      <div>
        <h1 className="text-2xl md:text-[26px] font-black text-[#0f2440] tracking-tight">
          Tự chấm điểm A - Chấp hành nội quy, quy chế
        </h1>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <label className="text-[14px] font-bold text-slate-700">Tháng:</label>
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={e => handleMonthChange(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-[14px] font-semibold text-slate-800 focus:outline-none focus:border-[#1F4E78] pr-8"
            >
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => currentUser && loadScoreData(selectedMonth, currentUser.id)}
            className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-4 py-1.5 rounded-lg text-[14px] font-bold transition shadow-sm"
          >
            Xem
          </button>
        </div>
      </div>

      {/* Info & Status Header */}
      <div className="space-y-2">
        <div className="text-[15px] text-slate-700">
          Người tự chấm:{' '}
          <strong className="text-[#0f2440] font-bold">
            {currentUser?.name || 'Đang tải...'}
          </strong>
          . Điểm chính thức chỉ hình thành sau khi lãnh đạo duyệt.
        </div>

        <div className="text-[15px] text-slate-700">
          <span className="font-bold text-slate-900">Trạng thái A:</span>{' '}
          <span
            className={`font-semibold ${
              statusA === 'Đã duyệt' || statusA === 'Đã được lãnh đạo duyệt'
                ? 'text-emerald-700'
                : statusA === 'Đã tự chấm'
                ? 'text-blue-700'
                : 'text-amber-700'
            }`}
          >
            {statusA}
          </span>
          ; <span className="font-bold text-slate-900 ml-1">Tổng tự chấm:</span>{' '}
          <span className="font-semibold text-[#1F4E78]">
            {selfTotal !== null ? `${selfTotal} / 30` : 'Chưa có / 30'}
          </span>
          {approvedTotal !== null && (
            <span className="ml-2">
              ; <span className="font-bold text-slate-900">Lãnh đạo duyệt:</span>{' '}
              <span className="font-bold text-emerald-700">{approvedTotal} / 30</span>
            </span>
          )}
        </div>
      </div>

      {/* Alert Banner matching screenshot */}
      {statusA === 'Chưa tự chấm' && !hasEnteredAny && (
        <div className="bg-[#fff9e6] border border-[#ffe58f] rounded-xl p-4 flex items-start gap-3 text-[14px] text-[#ad6800]">
          <AlertCircle className="w-5 h-5 text-[#d48806] flex-shrink-0 mt-0.5" />
          <div>
            Tháng này chưa có dữ liệu tự chấm A. Vui lòng nhập đầy đủ điểm A1-A7 rồi bấm{' '}
            <strong className="text-[#873800]">Lưu tự chấm A</strong>.
          </div>
        </div>
      )}

      {savedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 text-[14px] text-emerald-800">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            Đã lưu kết quả tự chấm A thành công cho tháng {selectedMonth}. Điểm tự chấm:{' '}
            <strong>{calculatedSelfTotal}/30 điểm</strong>.
          </div>
        </div>
      )}

      {leaderNote && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-[14px] text-blue-900">
          <strong>Ý kiến lãnh đạo phòng khi duyệt:</strong> {leaderNote}
        </div>
      )}

      {/* Scoring Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* 7 Criteria Grid - Layout 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {KPI_A_CRITERIA.map(crit => (
            <div
              key={crit.code}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between hover:border-slate-300 transition"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-[15px] text-[#0f2440] leading-snug">
                    {crit.code} - {crit.name} ({crit.maxScore} điểm)
                  </h3>
                </div>
                <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
                  {crit.desc}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-slate-500">Điểm tự chấm:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={crit.maxScore}
                    value={scores[crit.code]}
                    onChange={e =>
                      handleScoreChange(crit.code, crit.maxScore, e.target.value)
                    }
                    placeholder={`0 - ${crit.maxScore}`}
                    className="w-24 px-3 py-1.5 bg-[#f8fafc] border border-slate-300 rounded-lg text-[14px] font-bold text-center text-[#1F4E78] focus:bg-white focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] outline-none"
                  />
                  <span className="text-[13px] font-bold text-slate-400">/{crit.maxScore}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Notes & Summary Box */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-[14px] font-bold text-slate-800 mb-2">
              Ghi chú tự chấm (nếu có)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Nhập căn cứ, giải trình hoặc đề xuất liên quan đến điểm tự chấm..."
              className="w-full px-4 py-2.5 bg-[#f8fafc] border border-slate-300 rounded-lg text-[14px] text-slate-800 focus:bg-white focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78] outline-none transition"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-4">
              <span className="text-[15px] font-bold text-slate-700">Tổng điểm tự chấm:</span>
              <span className="text-xl font-black text-[#1F4E78] bg-blue-50 border border-blue-200 px-4 py-1 rounded-lg">
                {calculatedSelfTotal} / 30 điểm
              </span>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-[#1F4E78] hover:bg-[#173a5a] text-white px-6 py-2.5 rounded-lg text-[15px] font-bold transition shadow flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu...' : 'Lưu tự chấm A'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
