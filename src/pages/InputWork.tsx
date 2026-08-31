import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, Calendar, User, Briefcase, FileText, Check, 
  RefreshCw, Info, AlertCircle, ArrowLeft, CheckCircle2,
  Clock, Hash, Award, Building, ExternalLink, Sparkles,
  HelpCircle, ChevronRight, BookmarkPlus, Layers, ShieldCheck, X,
  Download, Upload, FileDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { downloadStyledTemplate } from '../excelUtils';
import { useNavigate } from 'react-router-dom';
import { 
  STANDARD_MONTHS, 
  WORK_NATURE_COEFS, 
  formatDateInput,
  getActiveLoggedInUser,
  getWorkStatusFactor,
  computeWorkConvertedScore,
  formatScore,
  getWorkNatureList,
  setGlobalWorkNatures,
  getNatureCoef,
  WorkNatureItem,
  safeFetch,
  safeParseResponse
} from '../utils';
import { User as UserType } from '../types';

export default function InputWork() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserType[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number | 'custom'>('custom');

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Dynamic catalog state
  const [taskGroups, setTaskGroups] = useState<string[]>([]);
  const [taskDict, setTaskDict] = useState<Record<string, any[]>>({});
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [workNatures, setWorkNatures] = useState<WorkNatureItem[]>(getWorkNatureList());

  const [showProposeModal, setShowProposeModal] = useState(false);
  const [proposal, setProposal] = useState({ name: '', taskGroup: '', score: 10, nature: 'Trung bình', productType: 'Bảng tổng hợp' });

  // Form State with ALL 39 fields from PMO1 / Apps Script specification
  const [formData, setFormData] = useState({
    month: '08-2026',
    userId: 1,
    userName: '',
    taskGroup: '',
    taskName: '',
    taskCode: '',
    detail: '',
    startDate: new Date().toISOString().split('T')[0],
    startTime: '07:30',
    endDate: new Date().toISOString().split('T')[0],
    endTime: '17:00',
    actualEndDate: '',
    hours: '8',
    days: 1,
    proposedNature: 'Trung bình',
    coef: '0.8',
    baseScore: '10',
    convertedScore: '7',
    status: 'Đang xử lý',
    evidence: '',
    productType: '',
    productQty: 1,
    unit: 'Sản phẩm',
    project: '',
    relatedUnit: '',
    lateReason: '',
    penaltyExemption: 'Không',
    editNote: ''
  });

  const currentGroupTasks = taskDict[formData.taskGroup] || [];

  // Calculate status factor for Converted Score
  const getStatusFactor = (st: string) => {
    switch (st) {
      case 'Hoàn thành': return 1.0;
      case 'Đang xử lý': return 0.7;
      case 'Chậm': return 0.5;
      case 'Không hoàn thành': return 0.0;
      default: return 0.7;
    }
  };

  // Recompute Converted Score based on BaseScore * Coef * StatusFactor
  const recomputeConvertedScore = (baseStr: string, coefStr: string, statusStr: string) => {
    const base = parseFloat(baseStr) || 0;
    const coef = parseFloat(coefStr) || 0.8;
    const factor = getStatusFactor(statusStr);
    const score = Math.round(base * coef * factor * 10) / 10;
    return String(score);
  };

  // Recompute Days & Hours based on start/end dates and times
  const recomputeTimeAndDays = (sDate: string, eDate: string, sTime: string, eTime: string) => {
    let days = 1;
    let hours = 8;
    if (sDate && eDate) {
      const d1 = new Date(sDate);
      const d2 = new Date(eDate);
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        const diffMs = d2.getTime() - d1.getTime();
        const diffDays = Math.max(1, Math.round(diffMs / 86400000) + 1);
        days = diffDays;
        
        if (days === 1 && sTime && eTime) {
          const [h1, m1] = sTime.split(':').map(Number);
          const [h2, m2] = eTime.split(':').map(Number);
          if (!isNaN(h1) && !isNaN(h2)) {
            const timeDiff = Math.max(0, (h2 + (m2 || 0) / 60) - (h1 + (m1 || 0) / 60));
            // Subtract lunch break if > 4h
            const effectiveHours = timeDiff > 4 ? Math.max(0, timeDiff - 1.5) : timeDiff;
            hours = Math.round(effectiveHours * 10) / 10 || 8;
          }
        } else {
          hours = days * 8;
        }
      }
    }
    return { days, hours: String(hours) };
  };

  useEffect(() => {
    const fetchUsersAndCatalog = async () => {
      try {
        const [usersRes, catRes] = await Promise.all([
          safeFetch('/api/users'),
          safeFetch('/api/categories')
        ]);
        
        const d = await safeParseResponse(usersRes);
        if (d.success && d.data?.length > 0) {
          setUsers(d.data);
          const active = getActiveLoggedInUser(d.data);
          setCurrentUser(active);
          if (active) {
            setFormData(prev => ({ 
              ...prev, 
              userId: active.id, 
              userName: active.name 
            }));
          }
        }

        const c = await safeParseResponse(catRes);
        if (c.success) {
          const catData = c.data;
          setGlobalWorkNatures(catData);
          const dynamicNatures = getWorkNatureList(catData);
          setWorkNatures(dynamicNatures);

          const directGroups = catData.filter((x: any) => x.type === 'TASK_GROUP' && x.status === 'Đang dùng').map((x: any) => x.name);
          const taskGroupNames = catData.filter((x: any) => x.type === 'TASK' && x.status === 'Đang dùng').map((x: any) => x.properties?.taskGroup).filter(Boolean);
          const groups = Array.from(new Set([...directGroups, ...taskGroupNames]));
          const products = catData.filter((x: any) => x.type === 'PRODUCT_TYPE' && x.status === 'Đang dùng').map((x: any) => x.name);
          const tasks = catData.filter((x: any) => x.type === 'TASK' && x.status === 'Đang dùng');
          
          const dict: Record<string, any[]> = {};
          groups.forEach((g: string) => dict[g] = []);
          tasks.forEach((t: any) => {
            const g = t.properties?.taskGroup;
            if (g && !dict[g]) dict[g] = [];
            if (g) {
              dict[g].push({
                code: t.code,
                name: t.name,
                score: t.properties?.score || 10,
                nature: t.properties?.nature || (dynamicNatures[0]?.name || 'Trung bình'),
                productType: t.properties?.productType || 'Khác',
                unit: t.properties?.unit || 'Sản phẩm'
              });
            }
          });

          setTaskGroups(groups);
          setProductTypes(products);
          setTaskDict(dict);

          // Set initial form data
          if (groups.length > 0) {
            const firstGroup = groups[0];
            const availableTasks = dict[firstGroup] || [];
            if (availableTasks.length > 0) {
              const firstTask = availableTasks[0];
              const coef = getNatureCoef(firstTask.nature);
              setFormData(prev => ({
                ...prev,
                taskGroup: firstGroup,
                taskName: firstTask.name,
                taskCode: firstTask.code,
                baseScore: String(firstTask.score),
                proposedNature: firstTask.nature,
                coef: String(coef),
                productType: firstTask.productType,
                unit: firstTask.unit,
                convertedScore: recomputeConvertedScore(String(firstTask.score), String(coef), prev.status)
              }));
              setSelectedTaskIndex(0);
            } else {
              setFormData(prev => ({ ...prev, taskGroup: firstGroup }));
            }
            setProposal(p => ({ ...p, taskGroup: firstGroup }));
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchUsersAndCatalog();

    const handleUserChange = () => {
      if (users.length > 0) {
        const active = getActiveLoggedInUser(users);
        setCurrentUser(active);
        if (active) {
          setFormData(prev => ({
            ...prev,
            userId: active.id,
            userName: active.name
          }));
        }
      }
    };
    window.addEventListener('kpi_user_changed', handleUserChange);
    return () => window.removeEventListener('kpi_user_changed', handleUserChange);
  }, [users.length]);

  const handleProposeSubmit = async () => {
    try {
      const res = await safeFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: `NEW-${Date.now()}`,
          name: proposal.name,
          type: 'TASK',
          status: 'Chờ duyệt',
          properties: {
            taskGroup: proposal.taskGroup,
            score: proposal.score,
            nature: proposal.nature,
            productType: proposal.productType,
            unit: 'Sản phẩm'
          }
        })
      });
      const data = await safeParseResponse(res);
      if (data.success) {
        alert('Đề xuất công việc mới đã được gửi thành công!');
        setShowProposeModal(false);
      }
    } catch (e) {
      console.error(e);
      alert('Đã xảy ra lỗi.');
    }
  };

  // When taskGroup changes, update task suggestions
  const handleGroupChange = (group: string) => {
    const availableTasks = taskDict[group] || [];
    if (availableTasks.length > 0) {
      const first = availableTasks[0];
      const coef = getNatureCoef(first.nature);
      const conv = recomputeConvertedScore(String(first.score), String(coef), formData.status);
      setSelectedTaskIndex(0);
      setFormData(prev => ({
        ...prev,
        taskGroup: group,
        taskName: first.name,
        taskCode: first.code,
        baseScore: String(first.score),
        proposedNature: first.nature,
        coef: String(coef),
        productType: first.productType,
        unit: first.unit,
        convertedScore: conv
      }));
    } else {
      setSelectedTaskIndex('custom');
      setFormData(prev => ({
        ...prev,
        taskGroup: group,
        taskName: '',
        taskCode: ''
      }));
    }
  };

  // When predefined task is selected
  const handleTaskSelect = (taskIdx: number | 'custom') => {
    setSelectedTaskIndex(taskIdx);
    if (taskIdx === 'custom') {
      return;
    }
    const list = taskDict[formData.taskGroup] || [];
    const task = list[taskIdx];
    if (task) {
      const coef = getNatureCoef(task.nature);
      const conv = recomputeConvertedScore(String(task.score), String(coef), formData.status);
      setFormData(prev => ({
        ...prev,
        taskName: task.name,
        taskCode: task.code,
        baseScore: String(task.score),
        proposedNature: task.nature,
        coef: String(coef),
        productType: task.productType,
        unit: task.unit,
        convertedScore: conv
      }));
    }
  };

  // When Nature changes
  const handleNatureChange = (nature: string) => {
    const coef = getNatureCoef(nature);
    const conv = recomputeConvertedScore(formData.baseScore, String(coef), formData.status);
    setFormData(prev => ({
      ...prev,
      proposedNature: nature,
      coef: String(coef),
      convertedScore: conv
    }));
  };

  // When Base Score changes
  const handleBaseScoreChange = (score: string) => {
    const conv = recomputeConvertedScore(score, formData.coef, formData.status);
    setFormData(prev => ({
      ...prev,
      baseScore: score,
      convertedScore: conv
    }));
  };

  // When Status changes
  const handleStatusChange = (st: string) => {
    const conv = recomputeConvertedScore(formData.baseScore, formData.coef, st);
    setFormData(prev => ({
      ...prev,
      status: st,
      convertedScore: conv
    }));
  };

  // Date and Time handlers
  const handleDateChange = (field: 'startDate' | 'endDate' | 'startTime' | 'endTime', value: string) => {
    const nextData = { ...formData, [field]: value };
    const { days, hours } = recomputeTimeAndDays(
      field === 'startDate' ? value : formData.startDate,
      field === 'endDate' ? value : formData.endDate,
      field === 'startTime' ? value : formData.startTime,
      field === 'endTime' ? value : formData.endTime
    );

    // Auto-detect delay if actualEndDate is greater than planned endDate
    let status = nextData.status;
    let lateReason = nextData.lateReason;
    if (nextData.actualEndDate && nextData.endDate && nextData.actualEndDate > nextData.endDate && nextData.status === 'Hoàn thành') {
      status = 'Chậm';
      if (!lateReason) lateReason = 'Hoàn thành thực tế sau ngày kết thúc dự kiến';
    }

    const conv = recomputeConvertedScore(nextData.baseScore, nextData.coef, status);
    setFormData({
      ...nextData,
      days,
      hours,
      status,
      lateReason,
      convertedScore: conv
    });
  };

  const handleActualEndDateChange = (val: string) => {
    let status = formData.status;
    let lateReason = formData.lateReason;
    if (val && formData.endDate && val > formData.endDate) {
      status = 'Chậm';
      if (!lateReason) lateReason = 'Hoàn thành thực tế sau ngày kết thúc dự kiến';
    } else if (val && formData.endDate && val <= formData.endDate && status === 'Chậm') {
      status = 'Hoàn thành';
    }
    const conv = recomputeConvertedScore(formData.baseScore, formData.coef, status);
    setFormData(prev => ({
      ...prev,
      actualEndDate: val,
      status,
      lateReason,
      convertedScore: conv
    }));
  };

  const handleDownloadTemplate = () => {
    const data = [{
      'Tháng': '08-2026',
      'Người thực hiện (ID)': 1,
      'Nhóm việc': 'Kế hoạch vốn',
      'Tên nhiệm vụ': 'Theo dõi kế hoạch vốn theo dự án',
      'Nội dung chi tiết': 'Rà soát bảng tổng hợp',
      'Ngày bắt đầu': '2026-08-01',
      'Giờ BĐ': '08:00',
      'Ngày hoàn thành': '2026-08-15',
      'Giờ HT': '17:00',
      'Trạng thái': 'Đang xử lý',
      'Tính chất': 'Trung bình',
      'Loại sản phẩm': 'Bảng tổng hợp',
      'Số lượng SP': 1
    }];
    const columns = [
      { header: 'Tháng', key: 'Tháng', width: 15 },
      { header: 'Người thực hiện (ID)', key: 'Người thực hiện (ID)', width: 20 },
      { header: 'Nhóm việc', key: 'Nhóm việc', width: 25 },
      { header: 'Tên nhiệm vụ', key: 'Tên nhiệm vụ', width: 35 },
      { header: 'Nội dung chi tiết', key: 'Nội dung chi tiết', width: 35 },
      { header: 'Ngày bắt đầu', key: 'Ngày bắt đầu', width: 15 },
      { header: 'Giờ BĐ', key: 'Giờ BĐ', width: 15 },
      { header: 'Ngày hoàn thành', key: 'Ngày hoàn thành', width: 15 },
      { header: 'Giờ HT', key: 'Giờ HT', width: 15 },
      { header: 'Trạng thái', key: 'Trạng thái', width: 15 },
      { header: 'Tính chất', key: 'Tính chất', width: 15 },
      { header: 'Loại sản phẩm', key: 'Loại sản phẩm', width: 20 },
      { header: 'Số lượng SP', key: 'Số lượng SP', width: 15 }
    ];
    downloadStyledTemplate(data, columns, 'Mau_Nhap_Viec.xlsx', 'Mau_Nhap_Viec');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        let successCount = 0;
        const importWarnings: string[] = [];

        for (let idx = 0; idx < (data as any[]).length; idx++) {
          const row = (data as any[])[idx];
          const rawTaskName = row['Tên nhiệm vụ'] || row['Tên công việc'] || row['Nhiệm vụ'] || row['taskName'];
          if (!rawTaskName) continue;

          const rawSelfScore = row['Điểm tự chấm'] || row['Điểm tự đánh giá'] || row['selfConvertedScore'];
          const rawStatus = row['Trạng thái'] || row['Tiến độ'] || row['status'];
          const status = rawStatus !== undefined && rawStatus !== null ? String(rawStatus).trim() : '';

          const rawBaseScore = row['Điểm chuẩn (Đc)'] || row['Điểm chuẩn'] || row['baseScore'] || row['Điểm'];
          const parsedBase = (rawBaseScore !== undefined && rawBaseScore !== null && String(rawBaseScore).trim() !== '' && !isNaN(parseFloat(String(rawBaseScore))))
            ? parseFloat(String(rawBaseScore))
            : 0;

          const rawProposedNature = row['Tính chất'] || row['Tính chất đề xuất'] || row['proposedNature'] || row['Độ phức tạp'];
          const proposedNature = rawProposedNature !== undefined && rawProposedNature !== null ? String(rawProposedNature).trim() : '';

          const rawCoef = row['Hệ số K'] || row['Hệ số'] || row['coef'];
          const parsedCoef = (rawCoef !== undefined && rawCoef !== null && String(rawCoef).trim() !== '' && !isNaN(parseFloat(String(rawCoef))) && parseFloat(String(rawCoef)) > 0)
            ? parseFloat(String(rawCoef))
            : 0;

          const resolvedCoef = parsedCoef > 0 ? parsedCoef : (proposedNature ? getNatureCoef(proposedNature) : 0);

          const hasExplicitSelfScore = rawSelfScore !== undefined && rawSelfScore !== null && String(rawSelfScore).trim() !== '' && !isNaN(parseFloat(String(rawSelfScore)));
          const hasValidStatus = Boolean(status && status.length > 0);
          const hasValidBaseScore = parsedBase > 0;
          const hasValidCoef = resolvedCoef > 0;

          let selfScore: string;
          if (hasExplicitSelfScore) {
            selfScore = String(parseFloat(String(rawSelfScore)));
          } else if (hasValidStatus && hasValidBaseScore && hasValidCoef) {
            const factor = getWorkStatusFactor(status);
            const computedConvertedScore = Math.round(parsedBase * resolvedCoef * factor * 10) / 10;
            selfScore = String(computedConvertedScore);
          } else {
            selfScore = '0';
            const missing: string[] = [];
            if (!hasValidStatus) missing.push('Trạng thái');
            if (!hasValidBaseScore) missing.push('Điểm chuẩn');
            if (!hasValidCoef) missing.push('Hệ số K/Tính chất');
            importWarnings.push(`Dòng ${idx + 1} (${rawTaskName}): Thiếu ${missing.join(', ')} -> Điểm tự chấm = 0`);
          }

          const dbCoef = String(resolvedCoef > 0 ? resolvedCoef : (parsedCoef > 0 ? parsedCoef : '0.8'));
          const dbBaseScore = rawBaseScore !== undefined && rawBaseScore !== null && String(rawBaseScore).trim() !== '' ? String(rawBaseScore) : (parsedBase > 0 ? String(parsedBase) : '0');
          const dbStatus = status || 'Chưa cập nhật';
          const dbProposedNature = proposedNature || 'Trung bình';

          const payload = {
            workId: `W-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            month: row['Tháng'] || '08-2026',
            userId: row['Người thực hiện (ID)'] || formData.userId,
            taskGroup: row['Nhóm việc'] || 'Khác',
            taskName: String(rawTaskName).trim(),
            taskCode: row['Mã chuẩn'] || row['Mã danh mục'] || '',
            detail: row['Nội dung chi tiết'] || '',
            startDate: row['Ngày bắt đầu'],
            startTime: row['Giờ BĐ'] || '07:30',
            endDate: row['Ngày hoàn thành'],
            endTime: row['Giờ HT'] || '17:00',
            status: dbStatus,
            proposedNature: dbProposedNature,
            coef: dbCoef,
            baseScore: dbBaseScore,
            convertedScore: selfScore,
            selfConvertedScore: selfScore,
            productType: row['Loại sản phẩm'] || 'Khác',
            productQty: row['Số lượng SP'] || 1,
            unit: row['Đơn vị tính'] || 'Sản phẩm'
          };
          
          await fetch('/api/works', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          successCount++;
        }
        if (importWarnings.length > 0) {
          alert(`Đã import ${successCount} công việc.\nCảnh báo (${importWarnings.length} dòng thiếu dữ liệu):\n` + importWarnings.slice(0, 5).join('\n') + (importWarnings.length > 5 ? `\n...và ${importWarnings.length - 5} cảnh báo khác.` : ''));
        } else {
          alert(`Đã import thành công ${successCount} công việc.`);
        }
      } catch (err) {
        console.error(err);
        alert('Lỗi import file Excel.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const resetForm = () => {
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      month: '08-2026',
      userId: currentUser?.id || users[0]?.id || 1,
      userName: currentUser?.name || users[0]?.name || '',
      taskGroup: 'Kế hoạch vốn',
      taskName: '',
      taskCode: '',
      detail: '',
      startDate: today,
      startTime: '07:30',
      endDate: today,
      endTime: '17:00',
      actualEndDate: '',
      hours: '8',
      days: 1,
      proposedNature: 'Trung bình',
      coef: '0.8',
      baseScore: '10',
      convertedScore: '7',
      status: 'Đang xử lý',
      evidence: '',
      productType: 'Báo cáo',
      productQty: 1,
      unit: 'Báo cáo',
      project: '',
      relatedUnit: '',
      lateReason: '',
      penaltyExemption: 'Không',
      editNote: ''
    });
    setSelectedTaskIndex('custom');
  };

  const handleSubmit = async (e: React.FormEvent, stayOnPage = false) => {
    e.preventDefault();
    if (!formData.taskName.trim()) {
      alert("Vui lòng nhập tên nhiệm vụ / công việc!");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        selfConvertedScore: formData.convertedScore
      };
      const res = await safeFetch('/api/works', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await safeParseResponse(res);
      if (data.success) {
        setSuccessMessage(`Đã đăng ký công việc "${formData.taskName}" thành công vào tháng ${formData.month}!`);
        if (stayOnPage) {
          resetForm();
          setTimeout(() => setSuccessMessage(""), 3500);
        } else {
          setTimeout(() => {
            navigate('/my-works');
          }, 1200);
        }
      } else {
        alert("Lỗi khi lưu: " + (data.error || "Không xác định"));
      }
    } catch (err: any) {
      alert("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header Banner */}
      <div className="bg-white border border-slate-300 p-5 rounded-2xl shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/80 text-[#1F4E78] text-xs font-black mb-2 border border-blue-200">
            <PlusCircle className="w-3.5 h-3.5" />
            <span>ĐĂNG KÝ KẾ HOẠCH & TIẾN ĐỘ</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0f2440] tracking-tight">
            Nhập kế hoạch & Công việc thực hiện
          </h2>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Đăng ký chi tiết công việc, thời gian, tính chất nhiệm vụ và minh chứng đầu ra để tính điểm KPI chuẩn.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors shadow-2xs"
            title="Tải file mẫu"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tải mẫu</span>
          </button>
          <label className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-blue-900 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-xl cursor-pointer transition-colors shadow-2xs" title="Nhập từ Excel">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import Excel</span>
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImport} />
          </label>
          <button 
            type="button"
            onClick={resetForm}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới biểu mẫu</span>
          </button>
          <button 
            type="button"
            onClick={() => navigate('/my-works')}
            className="flex items-center gap-1 text-xs font-black text-white bg-[#1F4E78] hover:bg-[#15385b] px-3.5 py-2 rounded-xl transition-colors shadow-2xs border border-blue-900"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>Công việc của tôi</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl flex items-center gap-3 font-bold text-sm shadow-2xs animate-in fade-in">
          <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" />
          <div className="flex-1">
            <div className="font-black text-emerald-900">Thành công!</div>
            <div className="text-xs text-emerald-800 font-medium">{successMessage}</div>
          </div>
        </div>
      )}

      {/* Main Form Form */}
      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
        
        {/* SECTION 1: KỲ & NHÂN SỰ */}
        <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm">
          <h3 className="text-xs font-black text-[#1F4E78] uppercase tracking-wider mb-4 pb-2.5 border-b border-slate-200 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
            <span>1. Kỳ báo cáo & Nhân sự thực hiện</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#1F4E78]" />
                <span>Tháng thực hiện <span className="text-red-500">*</span></span>
              </label>
              <select 
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-black text-[#1F4E78] outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
              >
                {STANDARD_MONTHS.map(m => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-[#1F4E78]" />
                <span>Cá nhân đăng ký việc <span className="text-red-500">*</span></span>
              </label>
              <div className="flex items-center gap-2.5 p-2 bg-blue-50/70 border border-blue-300 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#17466e] to-[#2f75b5] text-white flex items-center justify-center text-xs font-black shrink-0 shadow-2xs">
                  {getInitials(currentUser?.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-[#1F4E78] truncate">{currentUser?.name || 'Đang xác thực...'}</div>
                  <div className="text-[10px] text-slate-600 font-bold">Tài khoản cá nhân</div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-[#1F4E78]" />
                <span>Chức danh / Vị trí</span>
              </label>
              <input 
                type="text" 
                readOnly 
                value={currentUser?.position || 'Chuyên viên'} 
                className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                <span>Email công vụ</span>
              </label>
              <input 
                type="text" 
                readOnly 
                value={currentUser?.email || ''} 
                className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 cursor-not-allowed text-ellipsis overflow-hidden"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: DANH MỤC & NHIỆM VỤ */}
        <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm">
          <h3 className="text-xs font-black text-[#1F4E78] uppercase tracking-wider mb-4 pb-2.5 border-b border-slate-200 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
            <span>2. Danh mục nhóm & Tên nhiệm vụ (Tự động nạp Điểm chuẩn & Tính chất)</span>
          </h3>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-[#1F4E78]" />
                  <span>Nhóm công việc <span className="text-red-500">*</span></span>
                </label>
                <select 
                  value={formData.taskGroup}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
                >
                  {taskGroups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Chọn nhiệm vụ mẫu theo danh mục</span>
                  </span>
                  <button type="button" onClick={() => setShowProposeModal(true)} className="text-[11px] text-blue-700 hover:text-blue-900 font-black underline cursor-pointer">
                    + Đề xuất nhiệm vụ mới
                  </button>
                </label>
                <select 
                  value={selectedTaskIndex}
                  onChange={(e) => handleTaskSelect(e.target.value === 'custom' ? 'custom' : parseInt(e.target.value))}
                  className="w-full p-2.5 bg-blue-50/70 border border-blue-300 rounded-xl text-sm font-black text-[#1F4E78] outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
                >
                  <option value="custom">-- Nhập nhiệm vụ tự do / tùy chỉnh --</option>
                  {currentGroupTasks.map((t, idx) => (
                    <option key={t.code} value={idx}>
                      [{t.code}] {t.name} (Đc: {t.score}, {t.nature})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-3">
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  Tên nhiệm vụ / Công việc thực hiện <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={formData.taskName}
                  onChange={(e) => setFormData({ ...formData, taskName: e.target.value })}
                  placeholder="VD: Lập báo cáo quyết toán A-B dự án đường tránh..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5 text-[#1F4E78]" />
                  <span>Mã việc (Task Code)</span>
                </label>
                <input 
                  type="text"
                  value={formData.taskCode}
                  onChange={(e) => setFormData({ ...formData, taskCode: e.target.value })}
                  placeholder="VD: KH01, B2.2, QT01..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-black text-slate-800 outline-none uppercase shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">
                Nội dung thực hiện chi tiết
              </label>
              <textarea 
                rows={3}
                value={formData.detail}
                onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
                placeholder="Mô tả cụ thể phạm vi công việc, tài liệu đối chiếu, các bước đã thực hiện hoặc yêu cầu chỉ đạo..."
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 font-medium outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: THỜI GIAN & TIẾN ĐỘ THỰC HIỆN */}
        <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm">
          <h3 className="text-xs font-black text-[#1F4E78] uppercase tracking-wider mb-4 pb-2.5 border-b border-slate-200 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
            <span>3. Thời gian & Tiến độ thực hiện</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Ngày bắt đầu</label>
              <input 
                type="date"
                value={formData.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Giờ bắt đầu</label>
              <input 
                type="text"
                value={formData.startTime}
                onChange={(e) => handleDateChange('startTime', e.target.value)}
                placeholder="07:30"
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold outline-none shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Ngày kết thúc dự kiến</label>
              <input 
                type="date"
                value={formData.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Giờ kết thúc</label>
              <input 
                type="text"
                value={formData.endTime}
                onChange={(e) => handleDateChange('endTime', e.target.value)}
                placeholder="17:00"
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold outline-none shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-300 rounded-xl shadow-2xs">
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Ngày hoàn thành thực tế</label>
              <input 
                type="date"
                value={formData.actualEndDate}
                onChange={(e) => handleActualEndDateChange(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-sm outline-none font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Số ngày công tác</label>
              <input 
                type="number"
                min="1"
                value={formData.days}
                onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value || '1') })}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-sm font-black text-center text-slate-900 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Tổng số giờ (h)</label>
              <input 
                type="number"
                step="0.5"
                value={formData.hours}
                onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-sm font-black text-center text-slate-900 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Trạng thái tiến độ</label>
              <select 
                value={formData.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className={`w-full p-2 border rounded-xl text-sm font-black outline-none shadow-2xs ${
                  formData.status === 'Hoàn thành' ? 'bg-emerald-50 border-emerald-400 text-emerald-900' :
                  formData.status === 'Chậm' ? 'bg-rose-50 border-rose-400 text-rose-900' :
                  formData.status === 'Không hoàn thành' ? 'bg-red-50 border-red-400 text-red-900' :
                  'bg-blue-50 border-blue-400 text-blue-900'
                }`}
              >
                <option value="Đang xử lý">Đang xử lý (HS 0.7)</option>
                <option value="Hoàn thành">Hoàn thành (HS 1.0)</option>
                <option value="Chậm">Chậm tiến độ (HS 0.5)</option>
                <option value="Không hoàn thành">Không hoàn thành (HS 0.0)</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 4: TÍNH CHẤT & ĐIỂM KPI */}
        <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm">
          <h3 className="text-xs font-black text-[#1F4E78] uppercase tracking-wider mb-4 pb-2.5 border-b border-slate-200 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
            <span>4. Tính chất công việc & Công thức quy đổi điểm KPI</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-300 rounded-2xl shadow-2xs">
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Tính chất NV đề xuất</label>
              <select 
                value={formData.proposedNature}
                onChange={(e) => handleNatureChange(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-900 outline-none shadow-2xs"
              >
                {workNatures.map(nat => (
                  <option key={nat.code || nat.name} value={nat.name}>
                    {nat.name} (K = {formatScore(nat.coef)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Hệ số tính chất (K)</label>
              <input 
                type="text" 
                readOnly 
                value={formData.coef} 
                className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-sm font-black text-slate-800 text-center cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Điểm chuẩn (Đc)</label>
              <input 
                type="text" 
                readOnly 
                value={formData.baseScore} 
                className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-sm font-black text-slate-800 text-center cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">
                Điểm quy đổi (QĐ)
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  readOnly 
                  value={formData.convertedScore} 
                  className="w-full p-2.5 bg-emerald-100 border border-emerald-400 rounded-xl text-base font-black text-emerald-950 text-center cursor-not-allowed shadow-2xs"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-emerald-800">
                  điểm
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-700 flex items-center gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-300 font-medium">
            <Info className="w-4 h-4 text-[#1F4E78] shrink-0" />
            <span>
              Công thức: <b>Điểm quy đổi (QĐ) = Điểm chuẩn ({formData.baseScore}) × Hệ số tính chất ({formData.coef}) × Hệ số tiến độ ({getStatusFactor(formData.status)}) = {formData.convertedScore} điểm</b>.
            </span>
          </div>
        </div>

        {/* SECTION 5: SẢN PHẨM & DỰ ÁN */}
        <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm">
          <h3 className="text-xs font-black text-[#1F4E78] uppercase tracking-wider mb-4 pb-2.5 border-b border-slate-200 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
            <span>5. Sản phẩm đầu ra, Dự án & Đơn vị phối hợp</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Loại sản phẩm</label>
              <select 
                value={formData.productType}
                onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold outline-none shadow-2xs"
              >
                {productTypes.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Số lượng sản phẩm</label>
              <input 
                type="number"
                min="1"
                value={formData.productQty}
                onChange={(e) => setFormData({ ...formData, productQty: parseInt(e.target.value || '1') })}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black text-center outline-none shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Đơn vị tính</label>
              <input 
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="Báo cáo, Tờ trình, Hồ sơ, Bộ..."
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold outline-none shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">Đơn vị liên quan / Phối hợp</label>
              <input 
                type="text"
                value={formData.relatedUnit}
                onChange={(e) => setFormData({ ...formData, relatedUnit: e.target.value })}
                placeholder="Kho bạc, Sở KHĐT, Nhà thầu..."
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium outline-none shadow-2xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-800 mb-1.5">Dự án / Công trình / Gói thầu liên quan</label>
            <input 
              type="text"
              value={formData.project}
              onChange={(e) => setFormData({ ...formData, project: e.target.value })}
              placeholder="VD: Dự án Đường tránh Đông TP. Buôn Ma Thuột, Dự án Cải tạo Tỉnh lộ 1..."
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
            />
          </div>
        </div>

        {/* SECTION 6: MINH CHỨNG & GIẢI TRÌNH */}
        <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm">
          <h3 className="text-xs font-black text-[#1F4E78] uppercase tracking-wider mb-4 pb-2.5 border-b border-slate-200 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1F4E78]"></span>
            <span>6. Minh chứng kết quả & Giải trình tiến độ</span>
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center justify-between">
                <span>Đường dẫn tài liệu minh chứng (Link Google Drive / PDF / Văn bản ban hành)</span>
                <span className="text-slate-500 font-bold text-[11px]">Bắt buộc khi báo cáo Hoàn thành để Lãnh đạo duyệt</span>
              </label>
              <input 
                type="text"
                value={formData.evidence}
                onChange={(e) => setFormData({ ...formData, evidence: e.target.value })}
                placeholder="https://drive.google.com/file/d/... hoặc Số CV/QĐ ban hành"
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm text-blue-700 font-bold outline-none focus:ring-2 focus:ring-[#1F4E78] shadow-2xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  Lý do chậm tiến độ / Ghi chú phát sinh
                </label>
                <input 
                  type="text"
                  value={formData.lateReason}
                  onChange={(e) => setFormData({ ...formData, lateReason: e.target.value })}
                  placeholder="Nêu rõ lý do khách quan/chủ quan nếu công việc bị kéo dài..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium outline-none shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  Đề xuất miễn phạt nếu chậm
                </label>
                <select 
                  value={formData.penaltyExemption}
                  onChange={(e) => setFormData({ ...formData, penaltyExemption: e.target.value })}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-800 outline-none shadow-2xs"
                >
                  <option value="Không">Không miễn phạt</option>
                  <option value="Có">Có đề xuất miễn phạt (Chờ duyệt)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="bg-white border border-slate-300 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="text-xs text-slate-700 font-medium">
            Công việc sẽ được ghi nhận vào kế hoạch tháng <b className="text-[#1F4E78]">{formData.month}</b> cho chuyên viên <b className="text-[#1F4E78]">{formData.userName || 'được chọn'}</b>.
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button 
              type="button"
              onClick={() => navigate('/my-works')}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-800 font-black rounded-xl text-xs transition-colors shadow-2xs"
            >
              Hủy bỏ
            </button>

            <button 
              type="button"
              disabled={isSubmitting}
              onClick={(e) => handleSubmit(e, true)}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl text-xs transition-all shadow-2xs disabled:opacity-50"
            >
              Lưu & Thêm việc khác
            </button>

            <button 
              type="submit"
              disabled={isSubmitting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-[#1F4E78] hover:bg-[#15385b] text-white font-black rounded-xl text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 border border-blue-900"
            >
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Lưu công việc & Đăng ký KPI</span>
            </button>
          </div>
        </div>
      </form>

      {showProposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Đề xuất nhiệm vụ mới</h3>
              <button onClick={() => setShowProposeModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên nhiệm vụ</label>
                <input 
                  type="text" 
                  value={proposal.name} 
                  onChange={e => setProposal({ ...proposal, name: e.target.value })} 
                  className="w-full p-2 border border-slate-300 rounded" 
                  placeholder="Nhập tên nhiệm vụ đề xuất..." 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nhóm công việc</label>
                <select 
                  value={proposal.taskGroup} 
                  onChange={e => setProposal({ ...proposal, taskGroup: e.target.value })} 
                  className="w-full p-2 border border-slate-300 rounded"
                >
                  {taskGroups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Điểm chuẩn (Đc)</label>
                  <input 
                    type="number" 
                    value={proposal.score} 
                    onChange={e => setProposal({ ...proposal, score: Number(e.target.value) })} 
                    className="w-full p-2 border border-slate-300 rounded" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tính chất</label>
                  <select 
                    value={proposal.nature} 
                    onChange={e => setProposal({ ...proposal, nature: e.target.value })} 
                    className="w-full p-2 border border-slate-300 rounded"
                  >
                    {workNatures.map(n => <option key={n.code || n.name} value={n.name}>{n.name} (K={formatScore(n.coef)})</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Loại sản phẩm dự kiến</label>
                <select 
                  value={proposal.productType} 
                  onChange={e => setProposal({ ...proposal, productType: e.target.value })} 
                  className="w-full p-2 border border-slate-300 rounded"
                >
                  {productTypes.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                * Sau khi gửi, quản trị viên sẽ nhận được thông báo để xem xét phê duyệt nhiệm vụ này vào danh mục chung.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button onClick={() => setShowProposeModal(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg">Hủy</button>
              <button onClick={handleProposeSubmit} disabled={!proposal.name} className="px-4 py-2 text-sm font-bold text-white bg-[#1F4E78] hover:bg-opacity-90 rounded-lg disabled:opacity-50">Gửi đề xuất</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
