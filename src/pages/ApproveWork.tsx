import React, { useState, useEffect, useMemo, memo } from 'react';
import { 
  CheckSquare, Filter, Search, CheckCircle2, AlertCircle, RefreshCw, 
  Eye, FileText, Download, Check, X, Clock, AlertTriangle, ExternalLink,
  Award, Layers, User, ChevronDown, Sparkles, MessageSquare, Send,
  Calendar, Timer, ArrowRight, CornerDownRight, CheckCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  STANDARD_MONTHS, 
  DEFAULT_TASK_GROUPS, 
  WORK_NATURE_COEFS,
  formatDate, 
  formatDateInput, 
  formatMonth,
  isSoftDeleted,
  getActiveLoggedInUser,
  formatScore,
  cleanPosition,
  getWorkNatureList,
  setGlobalWorkNatures,
  getNatureCoefObj,
  getNatureCoef,
  WorkNatureItem,
  safeFetch,
  safeParseResponse
} from '../utils';
import { Work, User as UserType, Assignment } from '../types';

export interface WorkScheduleInfo {
  startDateStr: string;
  endDateStr: string;
  daysCount: number;
  scheduleStatus: 'early' | 'on_time' | 'late' | 'in_progress' | 'overdue';
  scheduleText: string;
  diffDays: number;
}

export function calculateWorkSchedule(w: Work): WorkScheduleInfo {
  const start = w.startDate ? new Date(w.startDate) : (w.createdAt ? new Date(w.createdAt) : null);
  const end = w.actualEndDate ? new Date(w.actualEndDate) : (w.endDate ? new Date(w.endDate) : null);
  const deadline = w.endDate ? new Date(w.endDate) : null;
  const now = new Date();

  // Format strings
  const startDateStr = formatDate(start);
  const endDateStr = formatDate(end || deadline);

  // Calculate days worked based on actual date range if available
  let daysCount = 0;
  if (start && (w.actualEndDate || w.endDate)) {
    const targetEnd = w.actualEndDate ? new Date(w.actualEndDate) : new Date(w.endDate!);
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    const e = new Date(targetEnd);
    e.setHours(0, 0, 0, 0);
    const diffMs = e.getTime() - s.getTime();
    daysCount = Math.max(1, Math.round(diffMs / 86400000) + 1);
  } else if (w.days && Number(w.days) > 0) {
    daysCount = Number(w.days);
  } else {
    daysCount = 1;
  }

  // Calculate schedule comparison
  let scheduleStatus: 'early' | 'on_time' | 'late' | 'in_progress' | 'overdue' = 'in_progress';
  let scheduleText = 'Đang thực hiện';
  let diffDays = 0;

  const isCompleted = w.status === 'Hoàn thành';
  const isLate = w.status === 'Chậm';

  if (isCompleted && w.actualEndDate && deadline) {
    const actualTime = new Date(w.actualEndDate).setHours(0, 0, 0, 0);
    const deadlineTime = new Date(deadline).setHours(0, 0, 0, 0);
    const diff = Math.round((actualTime - deadlineTime) / 86400000);
    diffDays = Math.abs(diff);

    if (diff < 0) {
      scheduleStatus = 'early';
      scheduleText = `Sớm ${diffDays} ngày`;
    } else if (diff === 0) {
      scheduleStatus = 'on_time';
      scheduleText = 'Đúng hạn';
    } else {
      scheduleStatus = 'late';
      scheduleText = `Chậm ${diffDays} ngày`;
    }
  } else if (isCompleted) {
    scheduleStatus = 'on_time';
    scheduleText = 'Đúng hạn';
  } else if (isLate) {
    if (deadline) {
      const deadlineTime = new Date(deadline).setHours(0, 0, 0, 0);
      const nowTime = now.setHours(0, 0, 0, 0);
      const diff = Math.max(1, Math.round((nowTime - deadlineTime) / 86400000));
      diffDays = diff;
      scheduleStatus = 'late';
      scheduleText = `Chậm ${diffDays} ngày`;
    } else {
      scheduleStatus = 'late';
      scheduleText = 'Chậm tiến độ';
    }
  } else if (deadline) {
    const deadlineTime = new Date(deadline).setHours(0, 0, 0, 0);
    const nowTime = new Date().setHours(0, 0, 0, 0);
    const diff = Math.round((nowTime - deadlineTime) / 86400000);
    
    if (diff > 0) {
      scheduleStatus = 'overdue';
      diffDays = diff;
      scheduleText = `Quá hạn ${diff} ngày`;
    } else if (diff === 0) {
      scheduleStatus = 'in_progress';
      scheduleText = 'Đến hạn hôm nay';
    } else {
      scheduleStatus = 'in_progress';
      diffDays = Math.abs(diff);
      scheduleText = `Còn ${diffDays} ngày`;
    }
  }

  return {
    startDateStr,
    endDateStr,
    daysCount,
    scheduleStatus,
    scheduleText,
    diffDays
  };
}

const QUICK_LEADER_SUGGESTIONS = [
  'Hồ sơ đạt yêu cầu, số liệu đầy đủ và chính xác.',
  'Hoàn thành đúng tiến độ, chất lượng sản phẩm tốt.',
  'Cần bổ sung biên bản đối chiếu số liệu và nộp lại trước ngày 25.',
  'Yêu cầu hoàn thiện lại thể thức văn bản theo quy định.',
  'Số liệu chưa khớp với báo cáo nguồn vốn, cần kiểm tra lại.'
];

const LeaderNoteSection = memo(({ 
  initialValue, 
  onChange 
}: { 
  initialValue: string; 
  onChange: (val: string) => void;
}) => {
  const [localNote, setLocalNote] = useState(initialValue);

  useEffect(() => {
    setLocalNote(initialValue);
  }, [initialValue]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalNote(val);
    onChange(val);
  };

  const handleSuggestionClick = (sug: string) => {
    setLocalNote(sug);
    onChange(sug);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-bold text-slate-800">
          Ý kiến chỉ đạo / Nhận xét của Lãnh đạo phòng
        </label>
        <span className="text-[10px] text-slate-400">Tùy chọn</span>
      </div>
      <textarea
        rows={3}
        value={localNote}
        onChange={handleChange}
        placeholder="Ghi rõ ý kiến chỉ đạo, lý do cần bổ sung hoặc đánh giá chất lượng hồ sơ..."
        className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
      />

      {/* Quick suggestions chips */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="text-[10px] font-bold text-slate-400 self-center">Gợi ý nhanh:</span>
        {QUICK_LEADER_SUGGESTIONS.map((sug, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSuggestionClick(sug)}
            className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md transition cursor-pointer border border-slate-200 text-left"
          >
            {sug}
          </button>
        ))}
      </div>
    </div>
  );
});

interface WorkReviewModalProps {
  work: Work;
  currentUser: any;
  workNatures?: WorkNatureItem[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  refreshAll: () => Promise<void>;
}

const WorkReviewModal = memo(({ work, currentUser, workNatures, onClose, onSuccess, refreshAll }: WorkReviewModalProps) => {
  const natureList = workNatures && workNatures.length > 0 ? workNatures : getWorkNatureList();
  const initialNature = work.approvedNature || work.proposedNature || (natureList[0]?.name || 'Trung bình');
  const initialCoefObj = getNatureCoefObj(initialNature);

  const [reviewDecision, setReviewDecision] = useState<'Duyệt' | 'Cần bổ sung' | 'Không duyệt'>(
    work.leaderApproval === 'Cần bổ sung' || work.leaderApproval === 'Không duyệt' ? work.leaderApproval : 'Duyệt'
  );
  const [reviewApprovedNature, setReviewApprovedNature] = useState<string>(initialNature);
  const [reviewApprovedCoef, setReviewApprovedCoef] = useState<number>(initialCoefObj.coef);
  const [reviewNote, setReviewNote] = useState<string>(work.leaderNote || '');
  const [reviewScore, setReviewScore] = useState<number | ''>(() => {
    if (work.approvedConvertedScore && !isNaN(Number(work.approvedConvertedScore))) {
      return Number(work.approvedConvertedScore);
    } else if (work.convertedScore && !isNaN(Number(work.convertedScore))) {
      return Number(work.convertedScore);
    } else if (work.selfConvertedScore && !isNaN(Number(work.selfConvertedScore))) {
      return Number(work.selfConvertedScore);
    } else {
      const baseSc = Number(work.baseScore) || 10;
      return Math.round(baseSc * initialCoefObj.coef * 10) / 10;
    }
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const sched = useMemo(() => calculateWorkSchedule(work), [work]);

  const handleNatureChange = (newNature: string) => {
    const natureCoefObj = getNatureCoefObj(newNature);
    setReviewApprovedNature(newNature);
    setReviewApprovedCoef(natureCoefObj.coef);

    // Recalculate score automatically
    const baseSc = Number(work.baseScore) || 10;
    const calculated = Math.round(baseSc * natureCoefObj.coef * 10) / 10;
    setReviewScore(calculated);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const payload: any = {
        leaderApproval: reviewDecision,
        approvedNature: reviewApprovedNature,
        coef: String(reviewApprovedCoef),
        leaderNote: reviewNote,
        approverId: currentUser?.id || null,
        approvalDate: new Date()
      };

      if (reviewScore !== '' && !isNaN(Number(reviewScore))) {
        payload.approvedConvertedScore = String(reviewScore);
        payload.convertedScore = String(reviewScore);
      }

      const res = await safeFetch(`/api/works/${work.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await safeParseResponse(res);
      if (d.success) {
        onSuccess(`Đã phê duyệt công việc của ${work.user?.name || 'nhân viên'} thành công!`);
        onClose();
        refreshAll();
      } else {
        setErrorMsg(d.error || 'Có lỗi khi lưu kết quả phê duyệt');
      }
    } catch (e: any) {
      setErrorMsg(String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2 text-[#1F4E78] font-black text-base">
            <CheckSquare className="w-5 h-5" />
            <span>Thẩm định & Phê duyệt kết quả công việc</span>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-950 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Comprehensive Task Details Card */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-300 text-xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-200">
            <div className="font-black text-[#1F4E78] text-sm flex items-center gap-1.5">
              <span className="bg-blue-100 text-[#1F4E78] px-2 py-0.5 rounded text-xs font-bold border border-blue-200">
                {work.taskCode || 'CV'}
              </span>
              <span>{work.taskName}</span>
            </div>
            {work.source === 'Giao việc' ? (
              <span className="px-2.5 py-0.5 rounded text-[11px] font-black bg-blue-100 text-[#1F4E78] border border-blue-300">
                Việc Lãnh đạo giao
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800 border border-slate-300">
                Việc tự đăng ký
              </span>
            )}
          </div>

          {/* 4-column inspection grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-700">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Nhân viên</span>
              <span className="font-bold text-slate-900 text-xs">{work.user?.name}</span>
              <div className="text-[10px] text-slate-500">{cleanPosition(work.user?.position)}</div>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Tháng & Nhóm</span>
              <span className="font-bold text-slate-900 text-xs">Tháng {work.month}</span>
              <div className="text-[10px] text-slate-500 truncate" title={work.taskGroup || ''}>
                {work.taskGroup || 'Khác'}
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Thời gian thực hiện</span>
              <div className="font-bold text-slate-800 text-[11px]">{sched.startDateStr} → {sched.endDateStr}</div>
              <div className="text-[10px] text-blue-700 font-semibold">{sched.daysCount} ngày làm</div>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Đánh giá tiến độ</span>
              <span className="font-bold text-slate-900 text-xs block">{work.status || 'Đang xử lý'}</span>
              <span className={`inline-block text-[10px] font-black px-1.5 py-0.2 rounded mt-0.5 ${
                sched.scheduleStatus === 'early' || sched.scheduleStatus === 'on_time'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {sched.scheduleText}
              </span>
            </div>
          </div>

          {/* Product Info Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Sản phẩm đầu ra</span>
              <span className="font-bold text-slate-800">{work.productType || 'Báo cáo'}</span> ({work.productQty || 1} {work.unit || 'Sản phẩm'})
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Điểm chuẩn quy định</span>
              <span className="font-black text-[#1F4E78] text-xs">{formatScore(work.baseScore || 10)} điểm</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Tính chất đã đăng ký</span>
              <span className="font-bold text-slate-800">{work.proposedNature || 'Trung bình'}</span> (Hệ số {formatScore(work.coef || 0.8)})
            </div>
          </div>

          {/* Detail content */}
          {work.detail && (
            <div>
              <span className="font-bold text-slate-700 block mb-1">Nội dung báo cáo chi tiết:</span>
              <p className="text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 whitespace-pre-line leading-relaxed">
                {work.detail}
              </p>
            </div>
          )}

          {/* Evidence */}
          {work.evidence && (
            <div>
              <span className="font-bold text-slate-700 block mb-1">Minh chứng sản phẩm:</span>
              <a 
                href={work.evidence.startsWith('http') ? work.evidence : `https://${work.evidence}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1.5 bg-blue-50/80 px-3 py-1.5 rounded-lg border border-blue-200"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                <span className="break-all">{work.evidence}</span>
              </a>
            </div>
          )}
        </div>

        {/* Approval Decision Controls */}
        <div className="space-y-4 pt-1">
          {/* Nature of Work Approval Control */}
          <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-[#1F4E78] uppercase tracking-wide flex items-center gap-1.5">
                <Award className="w-4 h-4 text-[#1F4E78]" />
                <span>Tính chất nhiệm vụ duyệt (Lãnh đạo thẩm định)</span>
              </label>
              <span className="text-[10px] text-slate-500 font-semibold">Mặc định theo người dùng đã đăng ký</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <select
                  value={reviewApprovedNature}
                  onChange={(e) => handleNatureChange(e.target.value)}
                  className="w-full text-xs font-bold text-slate-800 p-2.5 bg-white border border-slate-300 rounded-xl outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
                >
                  {natureList.map(nat => (
                    <option key={nat.code || nat.name} value={nat.name}>
                      {nat.name} (Hệ số {formatScore(nat.coef)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs">
                <span className="text-slate-500 font-medium">Hệ số duyệt:</span>
                <span className="font-black text-[#1F4E78] text-sm">{formatScore(reviewApprovedCoef)}</span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500 font-medium">Điểm chuẩn:</span>
                <span className="font-bold text-slate-800">{formatScore(work.baseScore || 10)}</span>
              </div>
            </div>

            {/* Score formula explanation */}
            <div className="text-[11px] text-[#1F4E78] font-medium bg-blue-100/60 p-2 rounded-lg flex items-center justify-between">
              <span>Công thức tự tính: <strong>{formatScore(work.baseScore || 10)} (Điểm chuẩn)</strong> x <strong>{formatScore(reviewApprovedCoef)} (Hệ số)</strong></span>
              <span className="font-black text-xs text-[#1F4E78]">= {formatScore(reviewScore)} đ</span>
            </div>
          </div>

          {/* 3 Decision Buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">Quyết định phê duyệt</label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setReviewDecision('Duyệt')}
                className={`py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  reviewDecision === 'Duyệt'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-300'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>Duyệt đạt</span>
              </button>

              <button
                type="button"
                onClick={() => setReviewDecision('Cần bổ sung')}
                className={`py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  reviewDecision === 'Cần bổ sung'
                    ? 'bg-orange-600 text-white border-orange-600 shadow-md ring-2 ring-orange-300'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Cần bổ sung</span>
              </button>

              <button
                type="button"
                onClick={() => setReviewDecision('Không duyệt')}
                className={`py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  reviewDecision === 'Không duyệt'
                    ? 'bg-red-600 text-white border-red-600 shadow-md ring-2 ring-red-300'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <X className="w-4 h-4" />
                <span>Không duyệt</span>
              </button>
            </div>
          </div>

          {/* Official Converted Score Input */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
              <span>Điểm quy đổi KPI chính thức</span>
              <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Tự động cập nhật theo Tính chất duyệt
              </span>
            </label>
            <input
              type="number"
              step="0.1"
              value={reviewScore}
              onChange={(e) => setReviewScore(e.target.value === '' ? '' : parseFloat(e.target.value))}
              placeholder="Nhập điểm quy đổi chính thức"
              className="w-full text-sm font-black text-[#1F4E78] p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-[#1F4E78] focus:ring-1 focus:ring-[#1F4E78]"
            />
          </div>

          {/* Leader Note & Quick Suggestions (Isolated for ultra-fast typing) */}
          <LeaderNoteSection 
            initialValue={reviewNote} 
            onChange={(val) => setReviewNote(val)} 
          />
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2.5 text-xs font-black text-white bg-[#1F4E78] hover:bg-[#15385b] rounded-xl shadow-md disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Đang lưu...' : 'Lưu kết quả phê duyệt'}</span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default function ApproveWork() {
  const [works, setWorks] = useState<Work[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('08-2026');
  const [selectedUserId, setSelectedUserId] = useState<number | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedApproval, setSelectedApproval] = useState<string>('Chưa duyệt');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState("");

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBatchApproving, setIsBatchApproving] = useState(false);

  // Modal State for Reviewing & Scoring single item
  const [workNatures, setWorkNatures] = useState<WorkNatureItem[]>(getWorkNatureList());
  const [reviewingWork, setReviewingWork] = useState<Work | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [resW, resU, resA, resC] = await Promise.all([
        safeFetch('/api/works'),
        safeFetch('/api/users'),
        safeFetch('/api/assignments'),
        safeFetch('/api/categories')
      ]);
      const [dW, dU, dA, dC] = await Promise.all([
        safeParseResponse(resW),
        safeParseResponse(resU),
        safeParseResponse(resA),
        safeParseResponse(resC)
      ]);

      if (dW.success) setWorks(dW.data || []);
      if (dU.success && dU.data?.length > 0) {
        setUsers(dU.data);
        const active = getActiveLoggedInUser(dU.data);
        setCurrentUser(active);
      }
      if (dA.success) setAssignments(dA.data || []);
      if (dC.success && Array.isArray(dC.data)) {
        setGlobalWorkNatures(dC.data);
        const dynNatures = getWorkNatureList(dC.data);
        setWorkNatures(dynNatures);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();

    const handleUserChange = () => {
      if (users.length > 0) {
        const active = getActiveLoggedInUser(users);
        setCurrentUser(active);
      }
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, [users.length]);

  // Filtered Works List - memoized to prevent re-filtering on unrelated updates
  const filteredWorks = useMemo(() => {
    return works.filter(w => {
      if (isSoftDeleted(w)) return false;
      if (selectedMonth !== 'Tất cả' && formatMonth(w.month) !== selectedMonth) return false;
      if (selectedUserId !== 'all' && w.userId !== selectedUserId) return false;
      if (selectedGroup !== 'all' && w.taskGroup !== selectedGroup) return false;

      // Source filter
      if (selectedSource === 'assigned' && w.source !== 'Giao việc' && !w.sysNote?.includes('Giao bởi')) return false;
      if (selectedSource === 'self' && (w.source === 'Giao việc' || w.sysNote?.includes('Giao bởi'))) return false;

      // Approval status filter
      if (selectedApproval !== 'all') {
        const appr = String(w.leaderApproval || 'Chưa duyệt').trim();
        if (selectedApproval === 'Chưa duyệt' && (appr === 'Duyệt' || appr === 'Cần bổ sung' || appr === 'Không duyệt')) return false;
        if (selectedApproval === 'Duyệt' && appr !== 'Duyệt') return false;
        if (selectedApproval === 'Cần bổ sung' && appr !== 'Cần bổ sung') return false;
        if (selectedApproval === 'Không duyệt' && appr !== 'Không duyệt') return false;
      }

      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const matchName = (w.taskName || '').toLowerCase().includes(kw);
        const matchCode = (w.taskCode || '').toLowerCase().includes(kw);
        const matchUser = (w.user?.name || '').toLowerCase().includes(kw);
        const matchDetail = (w.detail || '').toLowerCase().includes(kw);
        if (!matchName && !matchCode && !matchUser && !matchDetail) return false;
      }
      return true;
    });
  }, [works, selectedMonth, selectedUserId, selectedGroup, selectedSource, selectedApproval, searchKeyword]);

  // Calculate metrics for current month - memoized
  const { totalCount, pendingCount, approvedCount, supplementCount, rejectedCount } = useMemo(() => {
    const monthWorks = works.filter(w => !isSoftDeleted(w) && (selectedMonth === 'Tất cả' || formatMonth(w.month) === selectedMonth));
    return {
      totalCount: monthWorks.length,
      pendingCount: monthWorks.filter(w => !w.leaderApproval || w.leaderApproval === 'Chưa duyệt').length,
      approvedCount: monthWorks.filter(w => w.leaderApproval === 'Duyệt').length,
      supplementCount: monthWorks.filter(w => w.leaderApproval === 'Cần bổ sung').length,
      rejectedCount: monthWorks.filter(w => w.leaderApproval === 'Không duyệt').length
    };
  }, [works, selectedMonth]);

  // Open review modal
  const handleOpenReview = (w: Work) => {
    setReviewingWork(w);
  };

  // Batch Approve All Selected
  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn duyệt nhanh ${selectedIds.length} công việc đã chọn?`)) return;

    setIsBatchApproving(true);
    try {
      const promises = selectedIds.map(id => {
        const foundWork = works.find(w => w.id === id);
        const initialApprovedScore = String(foundWork?.selfConvertedScore || foundWork?.convertedScore || '0');
        return fetch(`/api/works/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leaderApproval: 'Duyệt',
            approvedNature: foundWork?.approvedNature || foundWork?.proposedNature || 'Trung bình',
            approvedConvertedScore: initialApprovedScore,
            convertedScore: initialApprovedScore,
            leaderNote: 'Lãnh đạo phòng đã phê duyệt đạt yêu cầu.'
          })
        });
      });
      await Promise.all(promises);
      setSuccessMsg(`Đã phê duyệt thành công ${selectedIds.length} công việc!`);
      setSelectedIds([]);
      fetchAll();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      alert("Lỗi khi duyệt hàng loạt: " + String(e));
    } finally {
      setIsBatchApproving(false);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const dataToExport = filteredWorks.map((w, idx) => {
      const sched = calculateWorkSchedule(w);
      return {
        "STT": idx + 1,
        "Tháng": w.month,
        "Nhân viên": w.user?.name || '-',
        "Chức danh": cleanPosition(w.user?.position),
        "Nguồn việc": w.source === 'Giao việc' ? 'Được giao việc' : 'Tự đăng ký',
        "Mã việc": w.taskCode || '-',
        "Tên công việc": w.taskName || '-',
        "Nhóm": w.taskGroup || '-',
        "Ngày bắt đầu / đăng ký": sched.startDateStr,
        "Ngày kết thúc / hạn": sched.endDateStr,
        "Số ngày làm": sched.daysCount,
        "Đánh giá tiến độ": sched.scheduleText,
        "Tính chất đã chọn": w.proposedNature || '-',
        "Hệ số đăng ký": w.coef || '-',
        "Tính chất duyệt": w.approvedNature || w.proposedNature || '-',
        "Điểm chuẩn": w.baseScore || '10',
        "Số lượng SP": w.productQty || 1,
        "Điểm QĐ": w.convertedScore || '0',
        "Minh chứng/Link": w.evidence || '-',
        "Trạng thái duyệt": w.leaderApproval || 'Chưa duyệt',
        "Ý kiến chỉ đạo của Lãnh đạo": w.leaderNote || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_sach_duyet_viec");
    XLSX.writeFile(wb, `Danh_sach_duyet_viec_${selectedMonth}.xlsx`);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredWorks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredWorks.map(w => w.id));
    }
  };

  const toggleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100/80 text-[#1F4E78] uppercase tracking-wider border border-blue-200">
                Điều hành & Phê duyệt
              </span>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">Quy trình: DV-09</span>
            </div>
            <h1 className="text-2xl font-black text-[#0f2440] tracking-tight">Phê duyệt hồ sơ & Tiến độ công việc</h1>
            <p className="text-sm font-medium text-slate-600 max-w-4xl mt-1 leading-relaxed">
              Lãnh đạo phòng xem xét kết quả thực hiện, thẩm định minh chứng sản phẩm, phê duyệt và chấm điểm KPI trực tiếp cho toàn bộ nhân sự trong phòng.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={fetchAll} 
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Đồng bộ</span>
            </button>
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-xl transition-colors shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {successMsg && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mt-4 p-3.5 bg-red-50 border border-red-300 rounded-xl text-red-950 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-[#1F4E78] border-x border-b border-slate-300">
          <div className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Tổng công việc</div>
          <div className="text-2xl font-black text-[#1F4E78] mt-1">{totalCount}</div>
          <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Tháng {selectedMonth}</div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-amber-600 border-x border-b border-slate-300 bg-gradient-to-br from-white to-amber-50/50">
          <div className="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Đang chờ duyệt</span>
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1">{pendingCount}</div>
          <div className="text-[11px] text-amber-800 mt-0.5 font-bold">Cần thẩm định</div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-emerald-600 border-x border-b border-slate-300 bg-gradient-to-br from-white to-emerald-50/50">
          <div className="text-[11px] font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Đã phê duyệt</span>
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-1">{approvedCount}</div>
          <div className="text-[11px] text-emerald-800 mt-0.5 font-bold">Đạt chuẩn KPI</div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-orange-600 border-x border-b border-slate-300 bg-gradient-to-br from-white to-orange-50/50">
          <div className="text-[11px] font-black text-orange-950 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Cần bổ sung</span>
          </div>
          <div className="text-2xl font-black text-orange-950 mt-1">{supplementCount}</div>
          <div className="text-[11px] text-orange-800 mt-0.5 font-bold">Yêu cầu hoàn thiện</div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border-t-4 border-t-red-600 border-x border-b border-slate-300 bg-gradient-to-br from-white to-red-50/50">
          <div className="text-[11px] font-black text-red-950 uppercase tracking-wider flex items-center gap-1">
            <X className="w-3.5 h-3.5" />
            <span>Không duyệt</span>
          </div>
          <div className="text-2xl font-black text-red-950 mt-1">{rejectedCount}</div>
          <div className="text-[11px] text-red-800 mt-0.5 font-bold">Không tính điểm</div>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
        {/* Filters and Batch Actions */}
        <div className="p-4 border-b border-slate-300 bg-slate-50/90 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#1F4E78]" />
            <h3 className="text-sm font-black text-[#1F4E78] uppercase tracking-wide">
              Danh sách công việc cần xem xét duyệt ({filteredWorks.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Batch Approve Button */}
            {selectedIds.length > 0 && (
              <button
                onClick={handleBatchApprove}
                disabled={isBatchApproving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all border border-emerald-700 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isBatchApproving ? 'Đang duyệt...' : `Duyệt nhanh (${selectedIds.length})`}</span>
              </button>
            )}

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none shadow-2xs"
            >
              <option value="Tất cả">Tất cả tháng</option>
              {STANDARD_MONTHS.map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>

            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="bg-white border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none max-w-[170px] shadow-2xs"
            >
              <option value="all">Tất cả nhân viên</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <select
              value={selectedApproval}
              onChange={(e) => setSelectedApproval(e.target.value)}
              className="bg-white border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none shadow-2xs"
            >
              <option value="all">Tất cả trạng thái duyệt</option>
              <option value="Chưa duyệt">Chưa duyệt</option>
              <option value="Duyệt">Đã duyệt</option>
              <option value="Cần bổ sung">Cần bổ sung</option>
              <option value="Không duyệt">Không duyệt</option>
            </select>

            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-white border border-slate-300 text-xs font-black text-slate-800 rounded-xl px-3 py-2 outline-none shadow-2xs"
            >
              <option value="all">Tất cả nguồn việc</option>
              <option value="assigned">Được Lãnh đạo giao</option>
              <option value="self">Nhân viên tự đăng ký</option>
            </select>

            <div className="relative">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Tìm mã, tên việc..."
                className="w-40 bg-white border border-slate-300 text-xs font-bold text-slate-800 rounded-xl pl-8 pr-3 py-2 outline-none shadow-2xs"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* Enhanced Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#1F4E78] text-white font-black text-xs uppercase tracking-wider border-b border-blue-950">
                <th className="py-3 px-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filteredWorks.length && filteredWorks.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded text-[#1F4E78] focus:ring-0"
                  />
                </th>
                <th className="py-3 px-3 min-w-[150px]">Nhân sự & Nguồn</th>
                <th className="py-3 px-3 min-w-[200px]">Tên nhiệm vụ & Nhóm</th>
                <th className="py-3 px-3 min-w-[140px]">Thời gian & Ngày làm</th>
                <th className="py-3 px-3 min-w-[130px] text-center">Tiến độ & Kế hoạch</th>
                <th className="py-3 px-3 min-w-[130px] text-center">Tính chất & Điểm QĐ</th>
                <th className="py-3 px-3 min-w-[110px]">Minh chứng</th>
                <th className="py-3 px-3 min-w-[120px]">Kết quả duyệt</th>
                <th className="py-3 px-3 text-center min-w-[120px]">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-medium text-slate-700 bg-white">
              {filteredWorks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-400">
                    Không có công việc nào phù hợp với điều kiện lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredWorks.map((w) => {
                  const isAssigned = w.source === 'Giao việc' || w.sysNote?.includes('Giao bởi');
                  const isApproved = w.leaderApproval === 'Duyệt';
                  const isSupplement = w.leaderApproval === 'Cần bổ sung';
                  const isRejected = w.leaderApproval === 'Không duyệt';
                  const isPending = !isApproved && !isSupplement && !isRejected;

                  // Schedule info
                  const sched = calculateWorkSchedule(w);

                  // Nature and coef
                  const proposedNat = w.proposedNature || 'Trung bình';
                  const approvedNat = w.approvedNature;
                  const isNatureModified = approvedNat && approvedNat !== proposedNat;

                  return (
                    <tr key={w.id} className="hover:bg-blue-50/40 transition-colors">
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(w.id)}
                          onChange={() => toggleSelectOne(w.id)}
                          className="rounded text-[#1F4E78] focus:ring-0"
                        />
                      </td>

                      {/* Nhân sự & Nguồn */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{w.user?.name || '-'}</div>
                        <div className="text-[11px] text-slate-500 font-medium">{cleanPosition(w.user?.position)}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {isAssigned ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-[#1F4E78] border border-blue-200">
                              Lãnh đạo giao
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              Tự đăng ký
                            </span>
                          )}
                          <span className="font-bold text-[#1F4E78] text-[10px]">{w.taskCode || `CV-${w.id}`}</span>
                        </div>
                      </td>

                      {/* Tên nhiệm vụ / Hồ sơ & Nhóm */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800 line-clamp-2 leading-snug">{w.taskName}</div>
                        {w.taskGroup && (
                          <div className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-600 mt-1">
                            {w.taskGroup}
                          </div>
                        )}
                        {w.detail && (
                          <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5 italic">
                            {w.detail}
                          </div>
                        )}
                      </td>

                      {/* Thời gian & Số ngày làm */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 text-[11px] text-slate-700">
                          <span className="text-slate-400">Bắt đầu:</span>
                          <span className="font-bold">{sched.startDateStr}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-700 mt-0.5">
                          <span className="text-slate-400">Kết thúc:</span>
                          <span className="font-bold">{sched.endDateStr}</span>
                        </div>
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-[#1F4E78] border border-blue-200">
                            <Timer className="w-3 h-3" /> {sched.daysCount} ngày làm
                          </span>
                        </div>
                      </td>

                      {/* Tiến độ & Kế hoạch (Nhanh/Chậm) */}
                      <td className="py-3 px-3 text-center">
                        {/* Work Status Badge */}
                        <div className="mb-1">
                          {w.status === 'Hoàn thành' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-block">
                              Hoàn thành
                            </span>
                          ) : w.status === 'Chậm' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 inline-block">
                              Chậm tiến độ
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 inline-block">
                              {w.status || 'Đang xử lý'}
                            </span>
                          )}
                        </div>

                        {/* Schedule Assessment */}
                        <div>
                          {sched.scheduleStatus === 'early' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-300 inline-block">
                              ⚡ {sched.scheduleText}
                            </span>
                          )}
                          {sched.scheduleStatus === 'on_time' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-block">
                              ✓ {sched.scheduleText}
                            </span>
                          )}
                          {sched.scheduleStatus === 'late' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-300 inline-block">
                              ⚠ {sched.scheduleText}
                            </span>
                          )}
                          {sched.scheduleStatus === 'overdue' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-50 text-red-700 border border-red-300 inline-block">
                              ✕ {sched.scheduleText}
                            </span>
                          )}
                          {sched.scheduleStatus === 'in_progress' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 inline-block">
                              ⏳ {sched.scheduleText}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tính chất & Điểm QĐ */}
                      <td className="py-3 px-3 text-center">
                        <div className="text-[11px] font-bold text-slate-700">
                          ĐK: {proposedNat} <span className="text-slate-400 font-normal">({formatScore(w.coef || 0.8)})</span>
                        </div>
                        {isNatureModified && (
                          <div className="text-[10px] font-black text-blue-700 mt-0.5 bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
                            Duyệt: {approvedNat}
                          </div>
                        )}
                        <div className="text-sm font-black text-[#1F4E78] mt-1">
                          {formatScore(w.convertedScore)} <span className="text-[10px] font-bold text-slate-500">đ</span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-medium">
                          (Đc: {formatScore(w.baseScore || 10)}đ | {w.productQty || 1} {w.unit || 'SP'})
                        </div>
                      </td>

                      {/* Minh chứng */}
                      <td className="py-3 px-3">
                        {w.evidence ? (
                          <a
                            href={w.evidence.startsWith('http') ? w.evidence : `https://${w.evidence}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline max-w-[130px] truncate"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{w.evidence}</span>
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Chưa có link</span>
                        )}
                      </td>

                      {/* Kết quả duyệt */}
                      <td className="py-3 px-3">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <Clock className="w-3 h-3 text-amber-700" /> Chưa duyệt
                          </span>
                        )}
                        {isApproved && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                              <Check className="w-3 h-3 text-emerald-700" /> Đã duyệt
                            </span>
                            {w.leaderNote && (
                              <div className="text-[10px] text-slate-600 line-clamp-1 mt-0.5 italic">"{w.leaderNote}"</div>
                            )}
                          </div>
                        )}
                        {isSupplement && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-100 text-orange-950 border border-orange-300">
                              <AlertTriangle className="w-3 h-3 text-orange-700" /> Cần bổ sung
                            </span>
                            {w.leaderNote && (
                              <div className="text-[10px] text-orange-700 line-clamp-1 mt-0.5 italic">"{w.leaderNote}"</div>
                            )}
                          </div>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-red-100 text-red-950 border border-red-300">
                            <X className="w-3 h-3 text-red-700" /> Không duyệt
                          </span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleOpenReview(w)}
                          className="px-3 py-1.5 bg-[#1F4E78] hover:bg-[#15385b] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1 w-full cursor-pointer"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>Thẩm định / Chấm điểm</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review & Scoring Modal (Isolated & Fast Local State) */}
      {reviewingWork && (
        <WorkReviewModal
          work={reviewingWork}
          currentUser={currentUser}
          workNatures={workNatures}
          onClose={() => setReviewingWork(null)}
          onSuccess={(msg) => {
            setSuccessMsg(msg);
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
          refreshAll={fetchAll}
        />
      )}
    </div>
  );
}

