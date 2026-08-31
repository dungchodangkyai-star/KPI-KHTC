import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Save, 
  RotateCcw, 
  RefreshCw, 
  Award, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Info, 
  ShieldAlert, 
  Layers, 
  Calculator,
  ChevronRight,
  TrendingUp,
  FileCheck
} from 'lucide-react';
import { KpiConfig, KpiRankingTier, KpiCriterionA, KpiPenaltyRule } from '../types';
import { DEFAULT_KPI_CONFIG, calculateTotalKpi, evaluateKpiRank, normalizeNFC, safeFetchJson } from '../utils';

interface Props {
  onRecalculateSuccess?: () => void;
}

export default function KpiConfigSettings({ onRecalculateSuccess }: Props) {
  const [config, setConfig] = useState<KpiConfig>(DEFAULT_KPI_CONFIG as any);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [targetMonth, setTargetMonth] = useState('08-2026');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Simulation Sandbox State
  const [simA, setSimA] = useState(28);
  const [simB1, setSimB1] = useState(42);
  const [simB2, setSimB2] = useState(14);
  const [simC1, setSimC1] = useState(5);
  const [simC2, setSimC2] = useState(3);
  const [simD, setSimD] = useState(0);

  useEffect(() => {
    fetchKpiConfig();
  }, []);

  const fetchKpiConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/kpi/config');
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.data) {
        setConfig({
          ...DEFAULT_KPI_CONFIG,
          ...data.data,
          scoreAllocation: { ...DEFAULT_KPI_CONFIG.scoreAllocation, ...(data.data.scoreAllocation || {}) },
          formula: { ...DEFAULT_KPI_CONFIG.formula, ...(data.data.formula || {}) },
          naturePoints: { ...DEFAULT_KPI_CONFIG.naturePoints, ...(data.data.naturePoints || {}) },
          rankingTiers: data.data.rankingTiers?.length ? data.data.rankingTiers : DEFAULT_KPI_CONFIG.rankingTiers,
          criteriaA: data.data.criteriaA?.length ? data.data.criteriaA : DEFAULT_KPI_CONFIG.criteriaA,
          penaltyRules: data.data.penaltyRules?.length ? data.data.penaltyRules : DEFAULT_KPI_CONFIG.penaltyRules,
        } as any);
      }
    } catch (err) {
      console.error("Error loading KPI config:", err);
      setMessage({ type: 'error', text: 'Không thể tải cấu hình KPI từ máy chủ.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch('/api/kpi/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Đã lưu cấu hình phân bổ điểm và quy ước xếp loại KPI thành công!' });
        if (data.data) {
          setConfig(data.data);
        }
      } else {
        setMessage({ type: 'error', text: 'Lỗi: ' + (data.error || 'Không thể lưu cấu hình.') });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Đã xảy ra lỗi kết nối khi lưu cấu hình.' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (!confirm('Bạn có chắc chắn muốn khôi phục toàn bộ cấu hình KPI về mặc định tiêu chuẩn (A=30, B=60, C=10, D=10)?')) return;
    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch('/api/kpi/config/reset', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Đã khôi phục cấu hình KPI về mặc định tiêu chuẩn thành công!' });
        if (data.data) {
          setConfig(data.data);
        }
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Lỗi khi khôi phục mặc định.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculateAll = async () => {
    if (!confirm(`Áp dụng cấu hình hiện tại và tính toán lại kết quả KPI cho toàn thể nhân sự tháng ${targetMonth}?`)) return;
    try {
      setRecalculating(true);
      setMessage(null);
      
      // Auto-save current config first
      await safeFetchJson('/api/kpi/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data: any = await safeFetchJson('/api/kpi/recalculate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: targetMonth })
      });
      if (data.success) {
        setMessage({ type: 'success', text: data.message || `Đã tính lại KPI tháng ${targetMonth} thành công!` });
        if (onRecalculateSuccess) onRecalculateSuccess();
      } else {
        setMessage({ type: 'error', text: 'Lỗi: ' + (data.error || 'Tính toán lại thất bại.') });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Lỗi kết nối khi tính lại KPI.' });
    } finally {
      setRecalculating(false);
    }
  };

  // Helper updates
  const updateScoreAlloc = (field: string, val: number) => {
    setConfig(prev => ({
      ...prev,
      scoreAllocation: {
        ...prev.scoreAllocation,
        [field]: val
      }
    }));
  };

  const updateFormula = (field: string, val: any) => {
    setConfig(prev => ({
      ...prev,
      formula: {
        ...prev.formula,
        [field]: val
      }
    }));
  };

  const updateNaturePoint = (key: string, val: number) => {
    setConfig(prev => ({
      ...prev,
      naturePoints: {
        ...prev.naturePoints,
        [key]: val
      }
    }));
  };

  const handleCriterionAChange = (index: number, field: keyof KpiCriterionA, val: any) => {
    const updated = [...config.criteriaA];
    updated[index] = { ...updated[index], [field]: val };
    setConfig(prev => ({ ...prev, criteriaA: updated }));
  };

  const handleAddCriterionA = () => {
    const nextNum = config.criteriaA.length + 1;
    const newCrit: KpiCriterionA = {
      code: `A${nextNum}`,
      name: `Tiêu chí đánh giá mới ${nextNum}`,
      maxScore: 3,
      desc: 'Mô tả hướng dẫn chấm điểm tiêu chí mới'
    };
    setConfig(prev => ({ ...prev, criteriaA: [...prev.criteriaA, newCrit] }));
  };

  const handleDeleteCriterionA = (index: number) => {
    if (config.criteriaA.length <= 1) {
      alert('Phải giữ ít nhất 1 tiêu chí điểm A.');
      return;
    }
    const updated = config.criteriaA.filter((_, i) => i !== index);
    setConfig(prev => ({ ...prev, criteriaA: updated }));
  };

  const handleTierChange = (index: number, field: keyof KpiRankingTier, val: any) => {
    const updated = [...config.rankingTiers];
    updated[index] = { ...updated[index], [field]: val };
    setConfig(prev => ({ ...prev, rankingTiers: updated }));
  };

  const handleAddTier = () => {
    const newTier: KpiRankingTier = {
      id: `tier-${Date.now()}`,
      name: 'Mức xếp loại mới',
      minScore: 50,
      maxScore: 64.99,
      badgeColor: 'purple',
      description: 'Mô tả tiêu chuẩn xếp loại',
      order: config.rankingTiers.length + 1
    };
    setConfig(prev => ({ ...prev, rankingTiers: [...prev.rankingTiers, newTier] }));
  };

  const handleDeleteTier = (index: number) => {
    if (config.rankingTiers.length <= 1) {
      alert('Phải giữ ít nhất 1 mức xếp loại.');
      return;
    }
    const updated = config.rankingTiers.filter((_, i) => i !== index);
    setConfig(prev => ({ ...prev, rankingTiers: updated }));
  };

  const handleAddPenalty = () => {
    const newPen: KpiPenaltyRule = {
      group: 'Vi phạm quy định mới',
      defaultScore: 2,
      level: 'Trung bình',
      desc: 'Mô tả hành vi vi phạm và căn cứ trừ điểm'
    };
    setConfig(prev => ({ ...prev, penaltyRules: [...prev.penaltyRules, newPen] }));
  };

  const handlePenaltyChange = (index: number, field: keyof KpiPenaltyRule, val: any) => {
    const updated = [...config.penaltyRules];
    updated[index] = { ...updated[index], [field]: val };
    setConfig(prev => ({ ...prev, penaltyRules: updated }));
  };

  const handleDeletePenalty = (index: number) => {
    const updated = config.penaltyRules.filter((_, i) => i !== index);
    setConfig(prev => ({ ...prev, penaltyRules: updated }));
  };

  // Calculations for validation & UI
  const totalMaxA = config.scoreAllocation?.maxA || 30;
  const totalMaxB = config.scoreAllocation?.maxB || 60;
  const totalMaxC = config.scoreAllocation?.maxC || 10;
  const sumMaxABC = totalMaxA + totalMaxB + totalMaxC;

  const sumCriteriaAScore = config.criteriaA.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);
  const sumBSub = (Number(config.scoreAllocation?.maxB1) || 0) + (Number(config.scoreAllocation?.maxB2) || 0);
  const sumCSub = (Number(config.scoreAllocation?.maxC1) || 0) + (Number(config.scoreAllocation?.maxC2) || 0);

  // Simulation calculation
  const simTotalB = Math.min(totalMaxB, simB1 + simB2);
  const simTotalC = Math.min(totalMaxC, simC1 + simC2);
  const simTotalKpi = calculateTotalKpi(simA, simTotalB, simTotalC, simD, config.formula, config.scoreAllocation);
  const simRankEval = evaluateKpiRank(simTotalKpi, config.rankingTiers, { scoreA: simA, scoreB: simTotalB, scoreD: simD });

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-[#1F4E78]" />
        Đang tải cấu hình KPI...
      </div>
    );
  }

  return (
    <div id="kpi-config-settings-root" className="space-y-8">
      {/* Top Header Actions Bar */}
      <div className="bg-gradient-to-r from-[#1F4E78] to-[#143452] p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-xs font-bold uppercase tracking-wider">Hệ thống KPI</span>
            <span className="text-xs text-sky-200">Phiên bản quy chuẩn 2026</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black mt-1">Cấu hình phân bổ điểm & Quy ước xếp loại KPI</h2>
          <p className="text-sm text-sky-100/90 mt-1 max-w-2xl">
            Tùy biến linh hoạt thang điểm phân bổ A (Ý thức) / B (Khối lượng) / C (Tính chất) / D (Trừ lỗi), công thức tính và các tiêu chuẩn xếp loại cán bộ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            id="btn-reset-kpi-config"
            type="button"
            onClick={handleResetDefault}
            disabled={saving || recalculating}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-all border border-white/20 active:scale-95 disabled:opacity-50"
            title="Khôi phục thang điểm chuẩn A=30, B=60, C=10"
          >
            <RotateCcw className="w-4 h-4" />
            Khôi phục mặc định
          </button>
          
          <button
            id="btn-save-kpi-config"
            type="button"
            onClick={handleSaveConfig}
            disabled={saving || recalculating}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-900/30 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Lưu cấu hình KPI
          </button>
        </div>
      </div>

      {/* Status Message Notification */}
      {message && (
        <div 
          id="kpi-config-alert-msg"
          className={`p-4 rounded-xl text-sm font-semibold flex items-center justify-between shadow-sm animate-fadeIn ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1">Đóng</button>
        </div>
      )}

      {/* Recalculate Batch Actions Box */}
      <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5 shadow-sm">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">Áp dụng cấu hình và tính toán lại toàn bộ kết quả KPI</h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Sau khi điều chỉnh thang điểm hoặc công thức, bạn có thể chạy tái tính toán lại toàn bộ bảng xếp loại và điểm số cho tất cả chuyên viên trong tháng chỉ với 1 click.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end lg:self-center shrink-0">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-amber-300 shadow-sm">
              <span className="text-xs font-bold text-slate-500">Tháng:</span>
              <input 
                type="text" 
                value={targetMonth} 
                onChange={(e) => setTargetMonth(e.target.value)}
                placeholder="08-2026"
                className="w-24 text-sm font-black text-[#1F4E78] focus:outline-none"
              />
            </div>

            <button
              id="btn-recalculate-all-kpi"
              type="button"
              onClick={handleRecalculateAll}
              disabled={recalculating || saving}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1F4E78] hover:bg-[#153857] text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {recalculating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Áp dụng & Tính lại KPI tháng {targetMonth}
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Main Score Allocation & Formula */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col: Thang điểm phân bổ (Allocation) - 7 cols */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 text-[#1F4E78] rounded-lg">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">1. Phân bổ trần điểm thành phần (Max Scores)</h3>
                <p className="text-xs text-slate-500">Quy định điểm tối đa của 4 nhóm tiêu chuẩn đánh giá</p>
              </div>
            </div>

            <div className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 ${
              sumMaxABC === 100 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              <span>Tổng Max(A+B+C): {sumMaxABC}/100đ</span>
              {sumMaxABC === 100 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
            </div>
          </div>

          {/* Allocation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Box A */}
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-blue-800 uppercase">Điểm A (Ý thức)</span>
                  <span className="text-xs font-bold text-slate-400">Trần Max</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={config.scoreAllocation.maxA}
                    onChange={(e) => updateScoreAlloc('maxA', Number(e.target.value))}
                    className="w-16 text-2xl font-black text-blue-900 bg-white border border-blue-300 rounded-lg px-2 py-0.5 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="text-sm font-bold text-slate-500">điểm</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Kỷ luật làm việc, chấp hành phân công, trách nhiệm công vụ.</p>
              </div>
              <div className="mt-3 text-[11px] font-semibold text-slate-400">
                Tổng điểm các tiêu chí A: <b className={sumCriteriaAScore !== totalMaxA ? 'text-rose-600' : 'text-emerald-700'}>{sumCriteriaAScore}đ</b>
              </div>
            </div>

            {/* Box B */}
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-indigo-800 uppercase">Điểm B (Khối lượng)</span>
                  <span className="text-xs font-bold text-slate-400">Trần Max</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={config.scoreAllocation.maxB}
                    onChange={(e) => updateScoreAlloc('maxB', Number(e.target.value))}
                    className="w-16 text-2xl font-black text-indigo-900 bg-white border border-indigo-300 rounded-lg px-2 py-0.5 text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-sm font-bold text-slate-500">điểm</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Tiến độ, khối lượng công việc và tỷ trọng so với trung bình phòng.</p>
              </div>
              <div className="mt-3 text-[11px] font-semibold text-slate-400">
                B1 ({config.scoreAllocation.maxB1}đ) + B2 ({config.scoreAllocation.maxB2}đ) = <b className={sumBSub !== totalMaxB ? 'text-rose-600' : 'text-emerald-700'}>{sumBSub}đ</b>
              </div>
            </div>

            {/* Box C */}
            <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-teal-800 uppercase">Điểm C (Tính chất)</span>
                  <span className="text-xs font-bold text-slate-400">Trần Max</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={config.scoreAllocation.maxC}
                    onChange={(e) => updateScoreAlloc('maxC', Number(e.target.value))}
                    className="w-16 text-2xl font-black text-teal-900 bg-white border border-teal-300 rounded-lg px-2 py-0.5 text-center focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                  <span className="text-sm font-bold text-slate-500">điểm</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Tính chất phức tạp công việc & sáng kiến đóng góp chuyên môn.</p>
              </div>
              <div className="mt-3 text-[11px] font-semibold text-slate-400">
                C1 ({config.scoreAllocation.maxC1}đ) + C2 ({config.scoreAllocation.maxC2}đ) = <b className={sumCSub !== totalMaxC ? 'text-rose-600' : 'text-emerald-700'}>{sumCSub}đ</b>
              </div>
            </div>
          </div>

          {/* Sub-allocation B & C breakdown inputs */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">Phân rã chi tiết thành phần B1, B2 & C1, C2, D</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                <label className="font-bold text-slate-700 block mb-1">Max B1 (Điểm việc)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={config.scoreAllocation.maxB1}
                    onChange={(e) => updateScoreAlloc('maxB1', Number(e.target.value))}
                    className="w-full font-black text-slate-900 border rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-slate-400">đ</span>
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                <label className="font-bold text-slate-700 block mb-1">Max B2 (Tỷ trọng)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={config.scoreAllocation.maxB2}
                    onChange={(e) => updateScoreAlloc('maxB2', Number(e.target.value))}
                    className="w-full font-black text-slate-900 border rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-slate-400">đ</span>
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                <label className="font-bold text-slate-700 block mb-1">Max C1 (Độ khó việc)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={config.scoreAllocation.maxC1}
                    onChange={(e) => updateScoreAlloc('maxC1', Number(e.target.value))}
                    className="w-full font-black text-slate-900 border rounded px-2 py-1 focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-slate-400">đ</span>
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                <label className="font-bold text-slate-700 block mb-1">Max C2 (Sáng kiến)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={config.scoreAllocation.maxC2}
                    onChange={(e) => updateScoreAlloc('maxC2', Number(e.target.value))}
                    className="w-full font-black text-slate-900 border rounded px-2 py-1 focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-slate-400">đ</span>
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-rose-200 shadow-2xs col-span-2 md:col-span-1">
                <label className="font-bold text-rose-700 block mb-1">Trần trừ D (Vi phạm)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={config.scoreAllocation.maxD}
                    onChange={(e) => updateScoreAlloc('maxD', Number(e.target.value))}
                    className="w-full font-black text-rose-700 border border-rose-200 rounded px-2 py-1 focus:outline-none focus:border-rose-500"
                  />
                  <span className="text-slate-400">đ</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Công thức & Sandbox Preview - 5 cols */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="p-2 bg-purple-50 text-purple-700 rounded-lg">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">2. Công thức tính tổng điểm KPI</h3>
                <p className="text-xs text-slate-500">Thiết lập thuật toán tổng hợp điểm số</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="formulaType"
                    checked={config.formula.type === 'STANDARD'}
                    onChange={() => updateFormula('type', 'STANDARD')}
                    className="text-[#1F4E78] focus:ring-[#1F4E78]"
                  />
                  <span className="text-sm font-bold text-slate-700">Tiêu chuẩn: Tổng = A + B + C - D</span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="formulaType"
                    checked={config.formula.type === 'WEIGHTED'}
                    onChange={() => updateFormula('type', 'WEIGHTED')}
                    className="text-[#1F4E78] focus:ring-[#1F4E78]"
                  />
                  <span className="text-sm font-bold text-slate-700">Theo tỷ trọng %: (%A, %B, %C)</span>
                </label>
              </div>

              {config.formula.type === 'WEIGHTED' && (
                <div className="grid grid-cols-3 gap-2 bg-purple-50/50 p-3 rounded-xl border border-purple-100 text-xs">
                  <div>
                    <span className="font-bold text-slate-600">Trọng số A (%)</span>
                    <input
                      type="number"
                      value={config.formula.weightA || 30}
                      onChange={(e) => updateFormula('weightA', Number(e.target.value))}
                      className="w-full bg-white border border-purple-200 rounded px-2 py-1 font-bold text-purple-900 mt-1"
                    />
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Trọng số B (%)</span>
                    <input
                      type="number"
                      value={config.formula.weightB || 60}
                      onChange={(e) => updateFormula('weightB', Number(e.target.value))}
                      className="w-full bg-white border border-purple-200 rounded px-2 py-1 font-bold text-purple-900 mt-1"
                    />
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Trọng số C (%)</span>
                    <input
                      type="number"
                      value={config.formula.weightC || 10}
                      onChange={(e) => updateFormula('weightC', Number(e.target.value))}
                      className="w-full bg-white border border-purple-200 rounded px-2 py-1 font-bold text-purple-900 mt-1"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="text-xs">
                  <span className="font-bold text-slate-600 block mb-1">Cận dưới (Min Cap)</span>
                  <input
                    type="number"
                    value={config.formula.capMin ?? 0}
                    onChange={(e) => updateFormula('capMin', Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                  />
                </div>
                <div className="text-xs">
                  <span className="font-bold text-slate-600 block mb-1">Trần trên (Max Cap)</span>
                  <input
                    type="number"
                    value={config.formula.capMax ?? 100}
                    onChange={(e) => updateFormula('capMax', Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live Simulation Test Sandbox */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 text-white shadow-inner space-y-3 mt-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <span className="text-xs font-bold text-sky-400 uppercase flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Thử nghiệm giả lập điểm số
              </span>
              <span className="text-[11px] text-slate-400">Sandbox Preview</span>
            </div>

            <div className="grid grid-cols-6 gap-2 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Điểm A</span>
                <input 
                  type="number" 
                  value={simA} 
                  onChange={(e) => setSimA(Number(e.target.value))} 
                  className="w-full bg-slate-800 border border-slate-600 rounded text-center text-white py-0.5 text-xs font-bold" 
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">B1</span>
                <input 
                  type="number" 
                  value={simB1} 
                  onChange={(e) => setSimB1(Number(e.target.value))} 
                  className="w-full bg-slate-800 border border-slate-600 rounded text-center text-white py-0.5 text-xs font-bold" 
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">B2</span>
                <input 
                  type="number" 
                  value={simB2} 
                  onChange={(e) => setSimB2(Number(e.target.value))} 
                  className="w-full bg-slate-800 border border-slate-600 rounded text-center text-white py-0.5 text-xs font-bold" 
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">C1</span>
                <input 
                  type="number" 
                  value={simC1} 
                  onChange={(e) => setSimC1(Number(e.target.value))} 
                  className="w-full bg-slate-800 border border-slate-600 rounded text-center text-white py-0.5 text-xs font-bold" 
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">C2</span>
                <input 
                  type="number" 
                  value={simC2} 
                  onChange={(e) => setSimC2(Number(e.target.value))} 
                  className="w-full bg-slate-800 border border-slate-600 rounded text-center text-white py-0.5 text-xs font-bold" 
                />
              </div>
              <div>
                <span className="text-[10px] text-rose-400 block">Trừ D</span>
                <input 
                  type="number" 
                  value={simD} 
                  onChange={(e) => setSimD(Number(e.target.value))} 
                  className="w-full bg-slate-800 border border-rose-500/50 rounded text-center text-rose-300 py-0.5 text-xs font-bold" 
                />
              </div>
            </div>

            <div className="bg-white/10 rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-300 block">Kết quả tính toán:</span>
                <div className="text-2xl font-black text-amber-300">
                  {simTotalKpi} <span className="text-xs font-normal text-slate-300">/ 100đ</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-300 block">Xếp loại dự kiến:</span>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-black mt-0.5 ${
                  simRankEval.badgeColor === 'emerald' ? 'bg-emerald-500 text-white' :
                  simRankEval.badgeColor === 'blue' ? 'bg-blue-500 text-white' :
                  simRankEval.badgeColor === 'amber' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                }`}>
                  {simRankEval.rank}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Tiêu chuẩn xếp loại đánh giá (Ranking Tiers) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">3. Quy ước tiêu chuẩn xếp loại đánh giá</h3>
              <p className="text-xs text-slate-500">Định nghĩa các mức phân loại cán bộ (Xuất sắc, Tốt, Hoàn thành, Không hoàn thành) kèm khoảng điểm</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddTier}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Thêm mức xếp loại
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-2.5 px-3 w-12 text-center">Thứ tự</th>
                <th className="py-2.5 px-3 min-w-[200px]">Tên danh hiệu / Mức xếp loại</th>
                <th className="py-2.5 px-3 w-28 text-center">Điểm Min</th>
                <th className="py-2.5 px-3 w-28 text-center">Điểm Max</th>
                <th className="py-2.5 px-3 w-32 text-center">Màu huy hiệu</th>
                <th className="py-2.5 px-3 min-w-[220px]">Điều kiện bổ sung & Tiêu chuẩn</th>
                <th className="py-2.5 px-3 w-16 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {config.rankingTiers.map((tier, idx) => (
                <tr key={tier.id || idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-2.5 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                  
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      value={tier.name}
                      onChange={(e) => handleTierChange(idx, 'name', e.target.value)}
                      className="w-full font-bold text-slate-900 border border-slate-200 rounded px-2 py-1 focus:ring-1 focus:ring-[#1F4E78]"
                    />
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="number"
                      step="0.1"
                      value={tier.minScore}
                      onChange={(e) => handleTierChange(idx, 'minScore', Number(e.target.value))}
                      className="w-20 text-center font-bold border border-slate-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-[#1F4E78]"
                    />
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="number"
                      step="0.1"
                      value={tier.maxScore}
                      onChange={(e) => handleTierChange(idx, 'maxScore', Number(e.target.value))}
                      className="w-20 text-center font-bold border border-slate-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-[#1F4E78]"
                    />
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <select
                      value={tier.badgeColor || 'blue'}
                      onChange={(e) => handleTierChange(idx, 'badgeColor', e.target.value)}
                      className="text-xs font-bold border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none"
                    >
                      <option value="emerald">Xanh lá (Emerald)</option>
                      <option value="blue">Xanh dương (Blue)</option>
                      <option value="amber">Vàng cam (Amber)</option>
                      <option value="rose">Đỏ hồng (Rose)</option>
                      <option value="purple">Tím (Purple)</option>
                      <option value="slate">Xám (Slate)</option>
                    </select>
                  </td>

                  <td className="py-2.5 px-3">
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={tier.description || ''}
                        placeholder="Mô tả tiêu chuẩn..."
                        onChange={(e) => handleTierChange(idx, 'description', e.target.value)}
                        className="w-full text-slate-600 border border-slate-200 rounded px-2 py-1 text-xs"
                      />
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tier.requireNoPenalties || false}
                          onChange={(e) => handleTierChange(idx, 'requireNoPenalties', e.target.checked)}
                          className="rounded text-[#1F4E78]"
                        />
                        Không được có điểm phạt vi phạm (D = 0)
                      </label>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteTier(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                      title="Xóa mức xếp loại"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid: Criteria A details & Nature Points C1 & Penalty Rules D */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Danh mục tiêu chí A (A1..A7) - 6 cols */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg">
                <FileCheck className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black text-slate-800">4. Danh mục tiêu chí điểm A (Ý thức & Kỷ luật)</h3>
            </div>
            
            <button
              type="button"
              onClick={handleAddCriterionA}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm A
            </button>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {config.criteriaA.map((crit, idx) => (
              <div key={crit.code || idx} className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={crit.code}
                      onChange={(e) => handleCriterionAChange(idx, 'code', e.target.value)}
                      className="w-12 font-black text-blue-900 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center"
                    />
                    <input
                      type="text"
                      value={crit.name}
                      onChange={(e) => handleCriterionAChange(idx, 'name', e.target.value)}
                      className="flex-1 font-bold text-slate-800 bg-white border border-slate-200 rounded px-2 py-0.5"
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] text-slate-500">Max:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={crit.maxScore}
                      onChange={(e) => handleCriterionAChange(idx, 'maxScore', Number(e.target.value))}
                      className="w-12 font-black text-center text-blue-900 bg-white border border-slate-200 rounded px-1 py-0.5"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteCriterionA(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={crit.desc || crit.description || ''}
                  placeholder="Mô tả hướng dẫn chấm điểm..."
                  onChange={(e) => handleCriterionAChange(idx, 'desc', e.target.value)}
                  className="w-full text-[11px] text-slate-500 bg-white border border-slate-200 rounded px-2 py-0.5"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center text-xs font-bold pt-2 border-t border-slate-100 text-slate-600">
            <span>Tổng điểm các tiêu chí A:</span>
            <span className={sumCriteriaAScore !== totalMaxA ? 'text-rose-600 font-black' : 'text-emerald-700 font-black'}>
              {sumCriteriaAScore} / {totalMaxA}đ
            </span>
          </div>
        </div>

        {/* Right: Nature Points C1 & Penalty Rules D - 6 cols */}
        <div className="lg:col-span-6 space-y-6">
          {/* Nature Points C1 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <div className="p-1.5 bg-teal-50 text-teal-700 rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black text-slate-800">5. Điểm quy đổi tính chất công việc (C1)</h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {Object.entries(config.naturePoints).map(([natName, point]) => (
                <div key={natName} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{natName}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-teal-700 font-bold">+</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={point}
                      onChange={(e) => updateNaturePoint(natName, Number(e.target.value))}
                      className="w-12 text-center font-black bg-white border border-slate-300 rounded px-1 py-0.5 text-teal-900"
                    />
                    <span className="text-[10px] text-slate-400">đ</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Penalty Rules D */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-rose-50 text-rose-700 rounded-lg">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-800">6. Quy ước trừ điểm vi phạm (D)</h3>
              </div>

              <button
                type="button"
                onClick={handleAddPenalty}
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm lỗi
              </button>
            </div>

            <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1">
              {config.penaltyRules.map((pen, idx) => (
                <div key={idx} className="p-2 bg-rose-50/40 border border-rose-100 rounded-lg flex items-center justify-between gap-2 text-xs">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={pen.group}
                      onChange={(e) => handlePenaltyChange(idx, 'group', e.target.value)}
                      className="font-bold text-slate-800 bg-white border border-slate-200 rounded px-1.5 py-0.5 w-full mb-1"
                    />
                    <input
                      type="text"
                      value={pen.desc}
                      onChange={(e) => handlePenaltyChange(idx, 'desc', e.target.value)}
                      className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-0.5 w-full"
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-rose-600 font-bold">-</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={pen.defaultScore}
                      onChange={(e) => handlePenaltyChange(idx, 'defaultScore', Number(e.target.value))}
                      className="w-12 text-center font-black bg-white border border-rose-200 rounded px-1 py-0.5 text-rose-700"
                    />
                    <span className="text-[10px] text-slate-400">đ</span>
                    <button
                      type="button"
                      onClick={() => handleDeletePenalty(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
