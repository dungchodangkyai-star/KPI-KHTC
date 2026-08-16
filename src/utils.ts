import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  let cleanM = String(m).trim();
  
  if (cleanM.toLowerCase().includes('xóa mềm') || cleanM.toLowerCase().includes('xoa mem') || cleanM.toLowerCase().includes('thu hồi')) {
     return "";
  }

  // Handle excel serial number
  if (!isNaN(Number(cleanM)) && Number(cleanM) > 20000 && Number(cleanM) < 80000) {
     const date = new Date((Number(cleanM) - 25569) * 86400 * 1000);
     const mm = String(date.getMonth() + 1).padStart(2, '0');
     const yyyy = date.getFullYear();
     return `${mm}-${yyyy}`;
  }

  // Handle format 2026.04 or 2026-04
  const ymMatch = cleanM.match(/^(\d{4})[.\/-](\d{1,2})/);
  if (ymMatch) {
     const yyyy = ymMatch[1];
     const mm = String(Number(ymMatch[2])).padStart(2, '0');
     return `${mm}-${yyyy}`;
  }
  
  // Handle format 04-2026 or 4-2026
  const myMatch = cleanM.match(/^(\d{1,2})[.\/-](\d{4})/);
  if (myMatch) {
     const mm = String(Number(myMatch[1])).padStart(2, '0');
     const yyyy = myMatch[2];
     return `${mm}-${yyyy}`;
  }

  // Date object or ISO string
  try {
     const d = new Date(cleanM);
     if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
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
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('vi-VN');
  } catch (e) {
    return String(d);
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
