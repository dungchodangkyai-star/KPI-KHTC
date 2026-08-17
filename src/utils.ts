import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Formats a score or number in Vietnamese format:
 * - Rounds floating point precision (e.g. 40.980000000000004 -> 40.98 -> '40,98')
 * - Max decimals (default 2), trims trailing zeros if integer (e.g. 60 -> '60', 26.5 -> '26,5', 14.48 -> '14,48')
 * - Uses comma ',' as decimal separator according to Vietnamese standards
 */
export const formatScore = (val: any, fallback = '0', maxDecimals = 2): string => {
  if (val === null || val === undefined || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
  if (isNaN(num)) return fallback;
  
  // Round to maxDecimals to avoid floating point math errors
  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.round((num + Number.EPSILON) * factor) / factor;
  
  // Convert to string and replace '.' with ','
  return String(rounded).replace('.', ',');
};

export const formatScoreWithUnit = (val: any, unit = 'đ', fallback = '-', maxDecimals = 2): string => {
  if (val === null || val === undefined || val === '') return fallback;
  const str = formatScore(val, fallback, maxDecimals);
  if (str === fallback) return fallback;
  return `${str}${unit}`;
};

export const formatPercent = (val: any, fallback = '0%', maxDecimals = 2): string => {
  if (val === null || val === undefined || val === '') return fallback;
  const str = formatScore(val, '', maxDecimals);
  if (str === '') return fallback;
  return `${str}%`;
};

/**
 * Normalizes user position title:
 * - Strips any administrative role suffixes (e.g. '/ Quản trị', '/ Admin', '- Quản trị')
 * - Ensures position only contains purely the official job title (e.g. 'Phó Trưởng phòng', 'Trưởng phòng', 'Kế toán trưởng', 'Chuyên viên')
 */
export const cleanPosition = (pos: string | null | undefined): string => {
  if (!pos) return 'Chuyên viên';
  const cleaned = String(pos)
    .replace(/\s*[\/\-|,]\s*Quản trị viên/gi, '')
    .replace(/\s*[\/\-|,]\s*Quản trị/gi, '')
    .replace(/\s*[\/\-|,]\s*Administrator/gi, '')
    .replace(/\s*[\/\-|,]\s*Admin/gi, '')
    .replace(/\s*\(\s*Quản trị\s*\)/gi, '')
    .replace(/\s*\(\s*Admin\s*\)/gi, '')
    .trim();
  return cleaned || 'Chuyên viên';
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Standard 12 months of 2026 (matching Apps Script buildMonthListV8_)
export const STANDARD_MONTHS = [
  '01-2026', '02-2026', '03-2026', '04-2026', 
  '05-2026', '06-2026', '07-2026', '08-2026', 
  '09-2026', '10-2026', '11-2026', '12-2026'
];

export const formatMonth = (m: any): string => {
  if (!m) return "";
  if (m instanceof Date && !isNaN(m.getTime())) {
    const mm = String(m.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = m.getUTCFullYear();
    return `${mm}-${yyyy}`;
  }

  let cleanM = String(m).trim();
  
  if (cleanM.toLowerCase().includes('xóa mềm') || cleanM.toLowerCase().includes('xoa mem') || cleanM.toLowerCase().includes('thu hồi')) {
     return "";
  }

  // Handle excel serial number (e.g. 46250)
  if (!isNaN(Number(cleanM)) && Number(cleanM) >= 20000 && Number(cleanM) <= 80000) {
     const ms = (Number(cleanM) - 25569) * 86400000 + 43200000;
     const date = new Date(ms);
     const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
     const yyyy = date.getUTCFullYear();
     return `${mm}-${yyyy}`;
  }

  // Handle text like "Tháng 8/2026", "Tháng 08 năm 2026", "T08/2026", "T8-2026", "Tháng 7"
  const vnMatch = cleanM.match(/(?:tháng|t)\s*(\d{1,2})(?:[\s\/\-_.,đếnnăm]*(\d{4}))?/i);
  if (vnMatch) {
     const mm = String(Number(vnMatch[1])).padStart(2, '0');
     const yyyy = vnMatch[2] || '2026';
     if (Number(mm) >= 1 && Number(mm) <= 12) {
       return `${mm}-${yyyy}`;
     }
  }

  // Handle dd/mm/yyyy or dd-mm-yyyy or d/m/yyyy (common in Vietnam: 13/07/2026, 06/07/2026, 1/7/2026)
  const ddmmyyyy = cleanM.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ddmmyyyy) {
     const mm = String(Number(ddmmyyyy[2])).padStart(2, '0');
     const yyyy = ddmmyyyy[3];
     if (Number(mm) >= 1 && Number(mm) <= 12) {
       return `${mm}-${yyyy}`;
     }
  }

  // Handle yyyy-mm-dd or yyyy/mm/dd (ISO format: 2026-07-13)
  const ymd = cleanM.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
     const yyyy = ymd[1];
     const mm = String(Number(ymd[2])).padStart(2, '0');
     if (Number(mm) >= 1 && Number(mm) <= 12) {
       return `${mm}-${yyyy}`;
     }
  }

  // Handle format 04-2026 or 4-2026 or 04/2026 or 04.2026
  const myMatch = cleanM.match(/^(\d{1,2})[.\/-](\d{4})$/);
  if (myMatch) {
     const mm = String(Number(myMatch[1])).padStart(2, '0');
     const yyyy = myMatch[2];
     if (Number(mm) >= 1 && Number(mm) <= 12) {
       return `${mm}-${yyyy}`;
     }
  }

  // Handle format 2026.04 or 2026-04 or 2026/4
  const ymMatch = cleanM.match(/^(\d{4})[.\/-](\d{1,2})$/);
  if (ymMatch) {
     const yyyy = ymMatch[1];
     const mm = String(Number(ymMatch[2])).padStart(2, '0');
     if (Number(mm) >= 1 && Number(mm) <= 12) {
       return `${mm}-${yyyy}`;
     }
  }

  // Date object or ISO string fallback
  try {
     const d = new Date(cleanM);
     if (!isNaN(d.getTime()) && d.getUTCFullYear() >= 1990 && d.getUTCFullYear() <= 2100) {
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = d.getUTCFullYear();
        return `${mm}-${yyyy}`;
     }
  } catch (e) {}

  return cleanM;
};

export const isSoftDeleted = (w: any): boolean => {
  if (!w) return false;
  const haystack = `${w.month || ''} ${w.status || ''} ${w.leaderApproval || ''} ${w.dataStatus || ''} ${w.sysNote || ''}`.toLowerCase();
  return haystack.includes('xóa mềm') || haystack.includes('xoa mem') || haystack.includes('đã xóa') || haystack.includes('thu hồi');
};

export const formatDate = (d: any): string => {
  if (!d) return '-';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime()) || date.getFullYear() < 1990 || date.getFullYear() > 2100) return '-';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return '-';
  }
};

export const formatDateInput = (d: any): string => {
  if (!d) return '';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
};

export const getDaysDiff = (targetDateStr: string | null | undefined): number | null => {
  if (!targetDateStr) return null;
  try {
    const target = new Date(targetDateStr);
    if (isNaN(target.getTime())) return null;
    target.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / 86400000);
  } catch (e) {
    return null;
  }
};

export const WORK_NATURE_COEFS: Record<string, { coef: number; c1Point: number }> = {
  'Đơn giản': { coef: 0.6, c1Point: 0 },
  'Trung bình': { coef: 0.8, c1Point: 0 },
  'Phức tạp': { coef: 1.0, c1Point: 1 },
  'Rất phức tạp': { coef: 1.2, c1Point: 2 },
  'Đặc biệt phức tạp': { coef: 1.5, c1Point: 3 },
};

export const DEFAULT_TASK_GROUPS = [
  'Kế hoạch vốn',
  'Thanh toán, giải ngân',
  'Quyết toán',
  'Lựa chọn nhà thầu',
  'GPMB',
  'Báo cáo, GSDGĐT, ADB8',
  'Hành chính - tổng hợp'
];

export const DEFAULT_TASKS: Record<string, Array<{ code: string; name: string; score: number; nature: string; productType: string; unit: string }>> = {
  'Kế hoạch vốn': [
    { code: 'KH01', name: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn', score: 10, nature: 'Trung bình', productType: 'Bảng tổng hợp', unit: 'Bảng' },
    { code: 'KH02', name: 'Tổng hợp nhu cầu điều chỉnh kế hoạch vốn', score: 12, nature: 'Phức tạp', productType: 'Tờ trình', unit: 'Tờ trình' },
    { code: 'KH03', name: 'Lập kế hoạch đầu tư công trung hạn và hằng năm', score: 15, nature: 'Rất phức tạp', productType: 'Báo cáo', unit: 'Báo cáo' },
    { code: 'KH04', name: 'Theo dõi, tổng hợp và báo cáo tiến độ giải ngân vốn đầu tư công', score: 12, nature: 'Phức tạp', productType: 'Báo cáo', unit: 'Báo cáo' }
  ],
  'Thanh toán, giải ngân': [
    { code: 'B2.1', name: 'Kiểm tra, rà soát hồ sơ tạm ứng, thanh toán khối lượng hoàn thành', score: 12, nature: 'Phức tạp', productType: 'Hồ sơ thanh toán', unit: 'Hồ sơ' },
    { code: 'B2.2', name: 'Lập hồ sơ thanh toán, giải ngân gửi Kho bạc', score: 12, nature: 'Phức tạp', productType: 'Hồ sơ thanh toán', unit: 'Hồ sơ' },
    { code: 'B2.3', name: 'Đối chiếu số liệu giải ngân với Kho bạc Nhà nước', score: 10, nature: 'Trung bình', productType: 'Biên bản', unit: 'Biên bản' }
  ],
  'Quyết toán': [
    { code: 'QT01', name: 'Lập hồ sơ quyết toán A-B', score: 15, nature: 'Rất phức tạp', productType: 'Hồ sơ quyết toán', unit: 'Hồ sơ' },
    { code: 'QT02', name: 'Lập báo cáo quyết toán dự án hoàn thành (Thông tư 96/2021/TT-BTC)', score: 18, nature: 'Đặc biệt phức tạp', productType: 'Hồ sơ quyết toán', unit: 'Hồ sơ' },
    { code: 'QT03', name: 'Theo dõi, đôn đốc phê duyệt quyết toán vốn đầu tư dự án hoàn thành', score: 12, nature: 'Phức tạp', productType: 'Tờ trình', unit: 'Tờ trình' }
  ],
  'Lựa chọn nhà thầu': [
    { code: 'B6.1', name: 'Lập, điều chỉnh, bổ sung kế hoạch lựa chọn nhà thầu', score: 13, nature: 'Phức tạp', productType: 'Hồ sơ lựa chọn nhà thầu', unit: 'Hồ sơ' },
    { code: 'B6.2', name: 'Thẩm định kế hoạch lựa chọn nhà thầu, hồ sơ mời thầu', score: 14, nature: 'Phức tạp', productType: 'Báo cáo', unit: 'Báo cáo' }
  ],
  'GPMB': [
    { code: 'GPMB01', name: 'Tổng hợp hồ sơ đền bù, giải phóng mặt bằng', score: 12, nature: 'Phức tạp', productType: 'Hồ sơ đền bù/GPMB', unit: 'Hồ sơ' },
    { code: 'GPMB02', name: 'Phối hợp chi trả tiền bồi thường, hỗ trợ tái định cư', score: 10, nature: 'Trung bình', productType: 'Biên bản', unit: 'Biên bản' }
  ],
  'Báo cáo, GSDGĐT, ADB8': [
    { code: 'B9.1', name: 'Lập báo cáo định kỳ, đột xuất, giao ban, cấp trên', score: 8, nature: 'Trung bình', productType: 'Báo cáo', unit: 'Báo cáo' },
    { code: 'B9.2', name: 'Giám sát, đánh giá đầu tư dự án trên hệ thống quốc gia', score: 10, nature: 'Phức tạp', productType: 'Báo cáo', unit: 'Báo cáo' }
  ],
  'Hành chính - tổng hợp': [
    { code: 'HC01', name: 'Soạn thảo văn bản, tờ trình, công văn đi/đến', score: 8, nature: 'Trung bình', productType: 'Văn bản', unit: 'Văn bản' },
    { code: 'HC02', name: 'Quản lý hồ sơ lưu trữ, bảo mật tài liệu và số liệu dự án', score: 8, nature: 'Đơn giản', productType: 'Hồ sơ', unit: 'Hồ sơ' }
  ]
};

export const DEFAULT_PRODUCT_TYPES = [
  'Báo cáo', 'Văn bản', 'Tờ trình', 'Bảng tổng hợp', 'Hồ sơ thanh toán',
  'Hồ sơ quyết toán', 'Hồ sơ lựa chọn nhà thầu', 'Hồ sơ đền bù/GPMB', 'Biên bản', 'Khác'
];

export const KPI_A_CRITERIA: Array<{ code: string; name: string; maxScore: number; desc: string }> = [
  { code: 'A1', name: 'Chấp hành thời gian, kỷ luật làm việc', maxScore: 5, desc: 'Chấp hành giờ giấc, kỷ luật, quy định về thời gian làm việc, đi công tác, tham dự họp.' },
  { code: 'A2', name: 'Chấp hành phân công và quy chế làm việc', maxScore: 5, desc: 'Thực hiện nhiệm vụ được phân công, tuân thủ quy chế làm việc và chỉ đạo điều hành.' },
  { code: 'A3', name: 'Tinh thần trách nhiệm, chủ động trong công việc', maxScore: 5, desc: 'Chủ động xử lý công việc, báo cáo kịp thời, không đùn đẩy trách nhiệm.' },
  { code: 'A4', name: 'Chất lượng phối hợp nội bộ và phối hợp bên ngoài', maxScore: 4, desc: 'Phối hợp với phòng ban, đơn vị liên quan; bảo đảm thông tin thông suốt, đúng trách nhiệm.' },
  { code: 'A5', name: 'Ý thức cập nhật, quản lý hồ sơ, minh chứng công việc', maxScore: 4, desc: 'Cập nhật dữ liệu, lưu hồ sơ, minh chứng đầy đủ, đúng quy định và phục vụ kiểm tra.' },
  { code: 'A6', name: 'Thái độ, đạo đức công vụ, văn hóa ứng xử', maxScore: 4, desc: 'Giữ thái độ chuẩn mực, văn hóa công sở, đạo đức công vụ và tinh thần đoàn kết.' },
  { code: 'A7', name: 'Ứng dụng công nghệ, sử dụng hệ thống KPI và dữ liệu chung', maxScore: 3, desc: 'Sử dụng hệ thống KPI, dữ liệu dùng chung và công cụ số đúng yêu cầu quản trị.' },
];

export const DEFAULT_KPI_CONFIG = {
  code: 'KPI_GLOBAL_CONFIG',
  name: 'Cấu hình phân bổ điểm KPI & Quy ước xếp loại tiêu chuẩn',
  department: 'Phòng Kế hoạch - Tài chính',
  applyMonth: 'all',
  scoreAllocation: {
    maxA: 30,
    maxB: 60,
    maxB1: 45,
    maxB2: 15,
    maxC: 10,
    maxC1: 6,
    maxC2: 4,
    maxD: 10,
    targetTotalKpi: 100
  },
  criteriaA: [
    { code: 'A1', name: 'Chấp hành thời gian, kỷ luật làm việc', maxScore: 5, desc: 'Chấp hành giờ giấc, kỷ luật, quy định về thời gian làm việc, đi công tác, tham dự họp.' },
    { code: 'A2', name: 'Chấp hành phân công và quy chế làm việc', maxScore: 5, desc: 'Thực hiện nhiệm vụ được phân công, tuân thủ quy chế làm việc và chỉ đạo điều hành.' },
    { code: 'A3', name: 'Tinh thần trách nhiệm, chủ động trong công việc', maxScore: 5, desc: 'Chủ động xử lý công việc, báo cáo kịp thời, không đùn đẩy trách nhiệm.' },
    { code: 'A4', name: 'Chất lượng phối hợp nội bộ và phối hợp bên ngoài', maxScore: 4, desc: 'Phối hợp với phòng ban, đơn vị liên quan; bảo đảm thông tin thông suốt, đúng trách nhiệm.' },
    { code: 'A5', name: 'Ý thức cập nhật, quản lý hồ sơ, minh chứng công việc', maxScore: 4, desc: 'Cập nhật dữ liệu, lưu hồ sơ, minh chứng đầy đủ, đúng quy định và phục vụ kiểm tra.' },
    { code: 'A6', name: 'Thái độ, đạo đức công vụ, văn hóa ứng xử', maxScore: 4, desc: 'Giữ thái độ chuẩn mực, văn hóa công sở, đạo đức công vụ và tinh thần đoàn kết.' },
    { code: 'A7', name: 'Ứng dụng công nghệ, sử dụng hệ thống KPI và dữ liệu chung', maxScore: 3, desc: 'Sử dụng hệ thống KPI, dữ liệu dùng chung và công cụ số đúng yêu cầu quản trị.' },
  ],
  naturePoints: {
    'Đặc biệt phức tạp': 3,
    'Rất phức tạp': 2,
    'Phức tạp': 1,
    'Trung bình': 0,
    'Đơn giản': 0
  },
  penaltyRules: [
    { group: 'Chậm tiến độ', defaultScore: 2, level: 'Trung bình', desc: 'Chậm tiến độ thực hiện so với hạn chót mà không có lý do bất khả kháng' },
    { group: 'Không hoàn thành', defaultScore: 3, level: 'Nặng', desc: 'Không hoàn thành nhiệm vụ được giao' },
    { group: 'Không đạt chất lượng / Không duyệt', defaultScore: 3, level: 'Nặng', desc: 'Sản phẩm/Hồ sơ không đạt chất lượng bị Lãnh đạo từ chối duyệt' },
    { group: 'Hồ sơ bổ sung nhiều lần', defaultScore: 1, level: 'Nhẹ', desc: 'Hồ sơ phải bổ sung chỉnh sửa trên 2 lần' },
    { group: 'Vi phạm kỷ luật nội bộ / chậm báo cáo', defaultScore: 2, level: 'Trung bình', desc: 'Vi phạm giờ giấc, nội quy cơ quan hoặc chậm nộp báo cáo' }
  ],
  formula: {
    type: 'STANDARD' as const,
    expression: 'A + B + C - D',
    weightA: 30,
    weightB: 60,
    weightC: 10,
    capMin: 0,
    capMax: 100,
    description: 'Tổng điểm = A (Ý thức) + B (Khối lượng & Hiệu quả) + C (Tính chất & Sáng kiến) - D (Trừ vi phạm)'
  },
  rankingTiers: [
    {
      id: 'tier-1',
      name: 'Hoàn thành xuất sắc nhiệm vụ',
      minScore: 95,
      maxScore: 100,
      badgeColor: 'emerald' as const,
      badgeText: 'Xuất sắc',
      requireNoPenalties: false,
      minAScore: 26,
      minBScore: 50,
      description: 'Tổng điểm KPI từ 95 đến 100 điểm, hoàn thành vượt mức các nhiệm vụ trọng tâm',
      order: 1
    },
    {
      id: 'tier-2',
      name: 'Hoàn thành tốt nhiệm vụ',
      minScore: 80,
      maxScore: 94.99,
      badgeColor: 'blue' as const,
      badgeText: 'Tốt',
      requireNoPenalties: false,
      description: 'Tổng điểm KPI từ 80 đến dưới 95 điểm, hoàn thành đúng hạn chất lượng tốt',
      order: 2
    },
    {
      id: 'tier-3',
      name: 'Hoàn thành nhiệm vụ',
      minScore: 65,
      maxScore: 79.99,
      badgeColor: 'amber' as const,
      badgeText: 'Hoàn thành',
      requireNoPenalties: false,
      description: 'Tổng điểm KPI từ 65 đến dưới 80 điểm',
      order: 3
    },
    {
      id: 'tier-4',
      name: 'Không hoàn thành nhiệm vụ',
      minScore: 0,
      maxScore: 64.99,
      badgeColor: 'rose' as const,
      badgeText: 'Không HT',
      requireNoPenalties: false,
      description: 'Tổng điểm KPI dưới 65 điểm hoặc có vi phạm kỷ luật nghiêm trọng',
      order: 4
    }
  ],
  status: 'Đang áp dụng' as const
};

/**
 * Calculates total KPI score based on dynamic formula configuration
 */
export const calculateTotalKpi = (
  scoreA: number,
  scoreB: number,
  scoreC: number,
  scoreD: number,
  formulaConfig: any = DEFAULT_KPI_CONFIG.formula,
  alloc: any = DEFAULT_KPI_CONFIG.scoreAllocation
): number => {
  const a = Math.max(0, Number(scoreA) || 0);
  const b = Math.max(0, Number(scoreB) || 0);
  const c = Math.max(0, Number(scoreC) || 0);
  const d = Math.max(0, Number(scoreD) || 0);

  const fType = formulaConfig?.type || 'STANDARD';
  const capMin = formulaConfig?.capMin !== undefined ? formulaConfig.capMin : 0;
  const capMax = formulaConfig?.capMax !== undefined ? formulaConfig.capMax : 100;

  let rawTotal = 0;
  if (fType === 'WEIGHTED') {
    const maxA = alloc?.maxA || 30;
    const maxB = alloc?.maxB || 60;
    const maxC = alloc?.maxC || 10;
    const wA = (formulaConfig?.weightA ?? 30) / 100;
    const wB = (formulaConfig?.weightB ?? 60) / 100;
    const wC = (formulaConfig?.weightC ?? 10) / 100;
    const partA = maxA > 0 ? (a / maxA) * (wA * 100) : 0;
    const partB = maxB > 0 ? (b / maxB) * (wB * 100) : 0;
    const partC = maxC > 0 ? (c / maxC) * (wC * 100) : 0;
    rawTotal = partA + partB + partC - d;
  } else {
    // STANDARD: A + B + C - D
    rawTotal = a + b + c - d;
  }

  const bounded = Math.min(capMax, Math.max(capMin, rawTotal));
  return Math.round(bounded * 100) / 100;
};

/**
 * Evaluates ranking classification based on dynamic ranking tiers
 */
export const evaluateKpiRank = (
  totalScore: number | null | undefined,
  rankingTiers: any[] = DEFAULT_KPI_CONFIG.rankingTiers,
  extra: { scoreA?: number; scoreB?: number; scoreD?: number } = {}
): { rank: string; tier: any; badgeColor: string } => {
  if (totalScore === null || totalScore === undefined || isNaN(totalScore)) {
    return {
      rank: 'Chưa xếp loại',
      tier: null,
      badgeColor: 'slate'
    };
  }

  const score = Number(totalScore);
  const sortedTiers = [...rankingTiers].sort((x, y) => (x.order ?? 0) - (y.order ?? 0));

  for (const tier of sortedTiers) {
    const min = tier.minScore !== undefined ? Number(tier.minScore) : -Infinity;
    const max = tier.maxScore !== undefined ? Number(tier.maxScore) : Infinity;

    if (score >= min && score <= max + 0.001) {
      // Check additional conditions if specified
      if (tier.requireNoPenalties && (extra.scoreD || 0) > 0) {
        continue; // Fall to next lower tier
      }
      if (tier.minAScore && (extra.scoreA || 0) < tier.minAScore) {
        continue;
      }
      if (tier.minBScore && (extra.scoreB || 0) < tier.minBScore) {
        continue;
      }

      return {
        rank: normalizeNFC(tier.name),
        tier,
        badgeColor: tier.badgeColor || 'blue'
      };
    }
  }

  // Fallback to lowest tier or default
  const lastTier = sortedTiers[sortedTiers.length - 1];
  return {
    rank: normalizeNFC(lastTier?.name || 'Không hoàn thành nhiệm vụ'),
    tier: lastTier || null,
    badgeColor: lastTier?.badgeColor || 'rose'
  };
};

/**
 * Normalizes Vietnamese text to NFC (Precomposed Unicode) to avoid font splitting/accent spacing defects
 */
export const normalizeNFC = (str: any): string => {
  if (str === null || str === undefined) return '';
  return String(str).normalize('NFC');
};

/**
 * Standard default password and admin email
 */
export const DEFAULT_INITIAL_PASSWORD = '123456@';
export const ADMIN_EMAIL = 'khvanson@gmail.com';

/**
 * Parses user's permissions array
 */
export const getUserPermissionsList = (user: any): string[] => {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  if (typeof user.permissions === 'string') {
    try {
      const parsed = JSON.parse(user.permissions);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      if (user.permissions.trim()) return [user.permissions.trim()];
    }
  }
  return [];
};

/**
 * Checks if user has specific permission code
 */
export const hasUserPermission = (user: any, permissionCode?: string): boolean => {
  if (!user) return false;
  
  // Admin role or Khvanson@gmail.com has full access to everything
  const email = (user.email || '').trim().toLowerCase();
  if (email === 'khvanson@gmail.com' || user.role === 'ADMIN') {
    return true;
  }

  // If no specific permission requested, true
  if (!permissionCode) return true;

  const perms = getUserPermissionsList(user);
  if (perms.includes('full_access')) return true;

  return perms.includes(permissionCode);
};

/**
 * Checks if a route path is personal (all authenticated users can access)
 */
export const isPersonalRoute = (path: string): boolean => {
  const cleanPath = path.split('?')[0];
  const personalRoutes = [
    '/input',
    '/my-works',
    '/ot-register',
    '/ot-my',
    '/ot-print',
    '/self-score-a',
    '/score-a',
    '/kpi',
    '/print-personal'
  ];
  return personalRoutes.includes(cleanPath);
};

/**
 * Checks if a user holds a position of Deputy Head (Phó phòng) or above
 */
export const isLeadershipRole = (userOrPosition: any): boolean => {
  if (!userOrPosition) return false;
  const pos = typeof userOrPosition === 'string' ? userOrPosition : (userOrPosition.position || '');
  const grp = typeof userOrPosition === 'object' ? (userOrPosition.group || '') : '';
  const role = typeof userOrPosition === 'object' ? (userOrPosition.role || '') : '';
  
  const norm = `${pos} ${grp}`.toLowerCase();
  return (
    norm.includes('trưởng phòng') ||
    norm.includes('phó phòng') ||
    norm.includes('phó trưởng phòng') ||
    norm.includes('lãnh đạo') ||
    norm.includes('trưởng đơn vị') ||
    norm.includes('giám đốc') ||
    norm.includes('phó giám đốc') ||
    role === 'ADMIN' ||
    role === 'LEADER'
  );
};

/**
 * Map route to required permission
 */
export const ROUTE_PERMISSION_MAP: Record<string, string> = {
  '/assign': 'manage_works',
  '/approve': 'approve_works',
  '/approve-ot': 'approve_ot',
  '/ot-approve': 'approve_ot',
  '/score-acd': 'evaluate_kpi',
  '/monitor': 'view_department_works',
  '/': 'view_department_dashboard',
  '/department-kpi': 'view_department_kpi',
  '/stats': 'view_export_stats',
  '/print-department': 'print_department_kpi',
  '/ot-summary': 'view_department_ot',
  '/admin/online': 'monitor_sessions',
  '/admin/users': 'manage_users',
  '/admin/sync': 'manage_data',
  '/admin/settings': 'manage_categories'
};

/**
 * Checks if user is authorized to access route
 */
export const canAccessRoute = (user: any, path: string): boolean => {
  if (!user) return false;
  const cleanPath = path.split('?')[0];
  if (isPersonalRoute(cleanPath)) return true;

  const email = (user.email || '').trim().toLowerCase();
  if (email === 'khvanson@gmail.com' || user.role === 'ADMIN') {
    return true;
  }

  const requiredPerm = ROUTE_PERMISSION_MAP[cleanPath];
  if (!requiredPerm) {
    // Other admin/dept routes default to leader or permission
    return user.role === 'LEADER';
  }

  return hasUserPermission(user, requiredPerm) || (user.role === 'LEADER' && !cleanPath.startsWith('/admin'));
};

/**
 * Get the currently logged-in user from localStorage
 */
export const getActiveLoggedInUser = (userList: any[] = []): any => {
  try {
    const storedUserStr = localStorage.getItem('kpi_logged_in_user');
    if (storedUserStr) {
      const parsed = JSON.parse(storedUserStr);
      if (parsed && parsed.id) {
        if (userList.length > 0) {
          const found = userList.find(u => u.id === parsed.id || u.email?.toLowerCase() === parsed.email?.toLowerCase());
          if (found) {
            return { ...found, mustChangePassword: parsed.mustChangePassword ?? found.mustChangePassword };
          }
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error("Error getting logged in user:", e);
  }
  return null;
};

/**
 * Set the currently logged-in user into localStorage
 */
export const setActiveLoggedInUser = (user: any, dispatchEvent = true) => {
  if (!user) return;
  try {
    localStorage.setItem('kpi_logged_in_user', JSON.stringify(user));
    localStorage.setItem('kpi_current_user_id', String(user.id));
    if (dispatchEvent) {
      window.dispatchEvent(new Event('kpi_user_changed'));
    }
  } catch (e) {
    console.error("Error setting logged in user:", e);
  }
};

/**
 * Clear logged in user session
 */
export const clearActiveLoggedInUser = () => {
  try {
    localStorage.removeItem('kpi_logged_in_user');
    localStorage.removeItem('kpi_current_user_id');
    window.dispatchEvent(new Event('kpi_user_changed'));
  } catch (e) {
    console.error("Error clearing user session:", e);
  }
};

/**
 * Safe fetch with automatic retry and exponential backoff
 */
export async function safeFetch(url: string, options?: RequestInit, retries = 2, delayMs = 400): Promise<Response> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      lastError = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(1.5, i)));
      }
    }
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
}

/**
 * Safe fetch JSON with error handling
 */
export async function safeFetchJson<T = any>(
  url: string, 
  options?: RequestInit, 
  retries = 2
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const res = await safeFetch(url, options, retries);
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const json = await res.json();
    return json;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch' };
  }
}


