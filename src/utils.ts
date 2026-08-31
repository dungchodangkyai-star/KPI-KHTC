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

export interface WorkNatureItem {
  id?: number;
  code?: string;
  name: string;
  coef: number;
  c1Point: number;
  description?: string;
  status?: string;
  order?: number;
}

export const WORK_NATURE_COEFS: Record<string, { coef: number; c1Point: number; description?: string }> = {
  'Rất đơn giản': { coef: 0.5, c1Point: 0, description: 'Nhiệm vụ thường xuyên, định kỳ đơn giản, quy trình rõ ràng' },
  'Đơn giản': { coef: 0.6, c1Point: 0, description: 'Công việc đơn giản, ít bước xử lý' },
  'Trung bình': { coef: 0.8, c1Point: 0, description: 'Công việc trung bình, yêu cầu nghiệp vụ chuyên môn tiêu chuẩn' },
  'Phức tạp': { coef: 1.0, c1Point: 1, description: 'Công việc phức tạp, phối hợp nhiều khâu hoặc nhiều bên' },
  'Rất phức tạp': { coef: 1.2, c1Point: 2, description: 'Công việc rất phức tạp, quy mô lớn hoặc tiến độ gấp' },
  'Đặc biệt phức tạp': { coef: 1.5, c1Point: 3, description: 'Công việc đột xuất trọng điểm, đặc biệt khó khăn, chuyên sâu' },
};

export const DEFAULT_WORK_NATURE_LIST: WorkNatureItem[] = [
  { code: 'NAT_01', name: 'Rất đơn giản', coef: 0.5, c1Point: 0, description: 'Nhiệm vụ thường xuyên, định kỳ đơn giản, quy trình rõ ràng', order: 1, status: 'Đang dùng' },
  { code: 'NAT_02', name: 'Đơn giản', coef: 0.6, c1Point: 0, description: 'Công việc đơn giản, ít bước xử lý', order: 2, status: 'Đang dùng' },
  { code: 'NAT_03', name: 'Trung bình', coef: 0.8, c1Point: 0, description: 'Công việc trung bình, yêu cầu nghiệp vụ chuyên môn tiêu chuẩn', order: 3, status: 'Đang dùng' },
  { code: 'NAT_04', name: 'Phức tạp', coef: 1.0, c1Point: 1, description: 'Công việc phức tạp, phối hợp nhiều khâu hoặc nhiều bên', order: 4, status: 'Đang dùng' },
  { code: 'NAT_05', name: 'Rất phức tạp', coef: 1.2, c1Point: 2, description: 'Công việc rất phức tạp, quy mô lớn hoặc tiến độ gấp', order: 5, status: 'Đang dùng' },
  { code: 'NAT_06', name: 'Đặc biệt phức tạp', coef: 1.5, c1Point: 3, description: 'Công việc đột xuất trọng điểm, đặc biệt khó khăn, chuyên sâu', order: 6, status: 'Đang dùng' },
];

/**
 * Global dynamic store for work natures loaded from database categories
 */
export let dynamicWorkNatureMap: Record<string, WorkNatureItem> = {};

// Auto initialize from localStorage if running in browser
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const cached = window.localStorage.getItem('cached_work_natures');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.forEach((item: any) => {
          if (item.name) {
            dynamicWorkNatureMap[item.name.trim()] = item;
          }
        });
      }
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Updates global work nature map from API categories response or raw list
 */
export const setGlobalWorkNatures = (listOrCategories: any[] | Record<string, any>) => {
  if (!listOrCategories) return;
  const newMap: Record<string, WorkNatureItem> = {};
  const listToSave: WorkNatureItem[] = [];

  if (Array.isArray(listOrCategories)) {
    const natureItems = listOrCategories.filter((x: any) => {
      if (!x) return false;
      if (x.type) return x.type === 'WORK_NATURE';
      return true;
    });

    natureItems.forEach((item: any) => {
      const name = (item.name || item.code || '').trim();
      if (!name) return;
      const props = item.properties || {};
      const coef = props.coef !== undefined ? Number(props.coef) : (item.coef !== undefined ? Number(item.coef) : 0.8);
      const c1Point = props.c1Point !== undefined ? Number(props.c1Point) : (item.c1Point !== undefined ? Number(item.c1Point) : 0);
      const description = props.description || item.description || '';
      const order = item.order !== undefined ? Number(item.order) : (props.order !== undefined ? Number(props.order) : 0);
      const status = item.status || 'Đang dùng';

      const entry: WorkNatureItem = {
        id: item.id,
        code: item.code,
        name,
        coef: isNaN(coef) ? 0.8 : coef,
        c1Point: isNaN(c1Point) ? 0 : c1Point,
        description,
        order,
        status
      };

      newMap[name] = entry;
      listToSave.push(entry);
    });

    if (Object.keys(newMap).length > 0) {
      dynamicWorkNatureMap = newMap;
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem('cached_work_natures', JSON.stringify(listToSave));
        } catch (e) {
          // ignore
        }
      }
    }
  } else if (typeof listOrCategories === 'object') {
    Object.entries(listOrCategories).forEach(([k, v]: [string, any]) => {
      const name = k.trim();
      if (!name) return;
      const entry: WorkNatureItem = {
        name,
        coef: typeof v === 'number' ? v : (v.coef !== undefined ? Number(v.coef) : 0.8),
        c1Point: v.c1Point !== undefined ? Number(v.c1Point) : 0,
        description: v.description || '',
        order: v.order || 0,
        status: v.status || 'Đang dùng'
      };
      newMap[name] = entry;
      listToSave.push(entry);
    });
    dynamicWorkNatureMap = newMap;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('cached_work_natures', JSON.stringify(listToSave));
      } catch (e) {
        // ignore
      }
    }
  }
};

/**
 * Returns formatted list of active work natures sorted by order
 */
export const getWorkNatureList = (categories?: any[]): WorkNatureItem[] => {
  if (categories && Array.isArray(categories)) {
    const rawNatures = categories.filter((c: any) => c.type === 'WORK_NATURE' && c.status !== 'Tạm khóa');
    if (rawNatures.length > 0) {
      return rawNatures.map((c: any) => {
        const props = c.properties || {};
        const coef = props.coef !== undefined ? Number(props.coef) : 0.8;
        const c1Point = props.c1Point !== undefined ? Number(props.c1Point) : 0;
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          coef: isNaN(coef) ? 0.8 : coef,
          c1Point: isNaN(c1Point) ? 0 : c1Point,
          description: props.description || '',
          status: c.status || 'Đang dùng',
          order: c.order !== undefined ? Number(c.order) : 0
        };
      }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
  }

  const dynamicKeys = Object.keys(dynamicWorkNatureMap);
  if (dynamicKeys.length > 0) {
    return Object.values(dynamicWorkNatureMap)
      .filter(x => x.status !== 'Tạm khóa')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return DEFAULT_WORK_NATURE_LIST;
};

/**
 * Resolves work nature coefficient and C1 point object with custom category support and fuzzy fallback
 */
export const getNatureCoefObj = (
  natureName: string | null | undefined, 
  customMap?: Record<string, { coef: number; c1Point: number; description?: string }>
): { coef: number; c1Point: number; description?: string } => {
  if (!natureName) return { coef: 0.8, c1Point: 0 };
  const trimmed = String(natureName).trim();
  if (customMap && customMap[trimmed]) return customMap[trimmed];
  if (dynamicWorkNatureMap[trimmed]) return dynamicWorkNatureMap[trimmed];
  if (WORK_NATURE_COEFS[trimmed]) return WORK_NATURE_COEFS[trimmed];

  const norm = normalizeNFC(trimmed).toLowerCase();
  if (customMap) {
    for (const [k, v] of Object.entries(customMap)) {
      if (normalizeNFC(k).toLowerCase() === norm) return v;
    }
  }
  for (const [k, v] of Object.entries(dynamicWorkNatureMap)) {
    if (normalizeNFC(k).toLowerCase() === norm) return v;
  }
  for (const [k, v] of Object.entries(WORK_NATURE_COEFS)) {
    if (normalizeNFC(k).toLowerCase() === norm) return v;
  }
  return { coef: 0.8, c1Point: 0 };
};

export const getNatureCoef = (
  natureName: string | null | undefined, 
  customMap?: Record<string, { coef: number; c1Point: number; description?: string }>
): number => {
  return getNatureCoefObj(natureName, customMap).coef;
};

export const getNatureBonusC1 = (
  natureName: string | null | undefined, 
  customMap?: Record<string, { coef: number; c1Point: number; description?: string }>
): number => {
  return getNatureCoefObj(natureName, customMap).c1Point;
};

/**
 * Helper to identify whether a work record is a valid legacy record.
 * Clear, explicit criteria (never based solely on an empty score field):
 * 1. work.isLegacy === true
 * 2. OR work.source is one of 'LEGACY_IMPORT', 'LEGACY', 'MIGRATION', 'BACKUP'
 * 3. OR work.dataStatus is one of 'LEGACY', 'MIGRATED'
 * 4. OR work.workId starts with 'LEGACY-', 'MIGRATED-'
 * 5. OR work.sysNote contains 'LEGACY' or 'MIGRATION'
 * Note: Live/monthly Excel synchronization (source: 'EXCEL_SYNC') is NOT legacy data.
 */
export const isLegacyWork = (work: any): boolean => {
  if (!work) return false;
  if (work.isLegacy === true) return true;

  const source = String(work.source || '').toUpperCase().trim();
  if (
    source === 'LEGACY_IMPORT' ||
    source === 'LEGACY' ||
    source === 'MIGRATION' ||
    source === 'BACKUP'
  ) {
    return true;
  }

  const dataStatus = String(work.dataStatus || '').toUpperCase().trim();
  if (dataStatus === 'LEGACY' || dataStatus === 'MIGRATED') {
    return true;
  }

  const workId = String(work.workId || '').toUpperCase().trim();
  if (workId.startsWith('LEGACY-') || workId.startsWith('MIGRATED-')) {
    return true;
  }

  const sysNote = String(work.sysNote || '').toUpperCase().trim();
  if (sysNote.includes('LEGACY') || sysNote.includes('MIGRATION')) {
    return true;
  }

  return false;
};

/**
 * Computes status factor for work score conversion
 */
export const getWorkStatusFactor = (status: string | null | undefined): number => {
  const st = String(status || '').trim();
  if (st === 'Hoàn thành' || st === 'Đã hoàn thành') return 1.0;
  if (st === 'Chậm' || st === 'Quá hạn') return 0.5;
  if (st === 'Đang xử lý' || st === 'Đang thực hiện') return 0.7;
  if (st === 'Tạm dừng') return 0.3;
  if (st === 'Không hoàn thành' || st === 'Hủy') return 0.0;
  return 0.7;
};

/**
 * Recomputes converted score from baseScore, nature coef, and status factor
 */
export const computeWorkConvertedScore = (
  baseScore: string | number | null | undefined,
  coef: string | number | null | undefined,
  status: string | null | undefined
): number => {
  const base = parseFloat(String(baseScore ?? '10')) || 10;
  const c = parseFloat(String(coef ?? '0.8')) || 0.8;
  const factor = getWorkStatusFactor(status);
  return Math.round(base * c * factor * 10) / 10;
};

/**
 * Checks if a work is officially approved by leader
 */
export const isWorkApproved = (work: any): boolean => {
  if (!work) return false;
  const app = String(work.leaderApproval || '').trim();
  return app === 'Duyệt';
};

/**
 * Resolves self-evaluated converted score for a work item.
 * 
 * Requirements:
 * 1. Keep selfConvertedScore = 0 strictly as 0 (NEVER fallback).
 * 2. Only fallback to convertedScore for valid legacy records with explicit identification criteria.
 * 3. For new work items missing selfConvertedScore: compute dynamically using the standard formula
 *    (baseScore * coef * statusFactor) according to current progress/status;
 *    if insufficient data to calculate (missing/non-positive baseScore or missing/non-positive coef), return 0.
 */
export const getWorkSelfConvertedScore = (work: any): number => {
  if (!work) return 0;

  // 1. Explicit selfConvertedScore present (including 0 or '0') -> return directly without fallback
  if (work.selfConvertedScore !== undefined && work.selfConvertedScore !== null && String(work.selfConvertedScore).trim() !== '') {
    const val = parseFloat(String(work.selfConvertedScore));
    if (!isNaN(val)) return val;
  }

  // 2. Only fallback to convertedScore for valid legacy records with explicit identification criteria
  if (isLegacyWork(work)) {
    if (work.convertedScore !== undefined && work.convertedScore !== null && String(work.convertedScore).trim() !== '') {
      const val = parseFloat(String(work.convertedScore));
      if (!isNaN(val)) return val;
    }
  }

  // 3. New work items without selfConvertedScore: compute dynamically according to formula and current progress/status
  const rawBase = work.baseScore !== undefined && work.baseScore !== null && String(work.baseScore).trim() !== '' 
    ? parseFloat(String(work.baseScore)) 
    : NaN;

  if (isNaN(rawBase) || rawBase <= 0) {
    return 0; // Insufficient baseScore data -> return 0
  }

  // Resolve nature and coef
  let coef: number | null = null;
  if (work.coef !== undefined && work.coef !== null && String(work.coef).trim() !== '') {
    const parsedCoef = parseFloat(String(work.coef));
    if (!isNaN(parsedCoef) && parsedCoef > 0) {
      coef = parsedCoef;
    }
  }

  if (coef === null) {
    const nature = work.proposedNature || work.approvedNature;
    if (nature) {
      coef = getNatureCoef(nature);
    }
  }

  if (coef === null || coef <= 0) {
    return 0; // Insufficient nature / coef data -> return 0
  }

  const factor = getWorkStatusFactor(work.status);
  return Math.round(rawBase * coef * factor * 10) / 10;
};

/**
 * Resolves approved converted score for a work item.
 * STRICT CRITERIA:
 * 1. If work is NOT approved by leader (leaderApproval !== 'Duyệt') -> ALWAYS 0 (never use fallback).
 * 2. If work is approved (leaderApproval === 'Duyệt'):
 *    - If approvedConvertedScore exists and is valid -> return it.
 *    - If approvedConvertedScore is missing:
 *      - For valid legacy records: allowed fallback to convertedScore or selfConvertedScore.
 *      - Otherwise: calculate dynamically from approvedNature/proposedNature, coef, baseScore, status.
 */
export const getWorkApprovedConvertedScore = (work: any): number => {
  if (!work) return 0;
  if (!isWorkApproved(work)) {
    return 0;
  }
  if (work.approvedConvertedScore !== undefined && work.approvedConvertedScore !== null && String(work.approvedConvertedScore).trim() !== '') {
    const val = parseFloat(String(work.approvedConvertedScore));
    if (!isNaN(val)) return val;
  }
  // For valid legacy approved records without approvedConvertedScore
  if (isLegacyWork(work)) {
    if (work.selfConvertedScore !== undefined && work.selfConvertedScore !== null && String(work.selfConvertedScore).trim() !== '') {
      const val = parseFloat(String(work.selfConvertedScore));
      if (!isNaN(val)) return val;
    }
    if (work.convertedScore !== undefined && work.convertedScore !== null && String(work.convertedScore).trim() !== '') {
      const val = parseFloat(String(work.convertedScore));
      if (!isNaN(val)) return val;
    }
  }
  // Dynamic fallback calculation for approved records
  const rawBase = work.baseScore !== undefined && work.baseScore !== null && String(work.baseScore).trim() !== '' 
    ? parseFloat(String(work.baseScore)) 
    : 10;
  const nature = work.approvedNature || work.proposedNature || 'Trung bình';
  const natureCoef = getNatureCoef(nature);
  const coef = (work.coef && !isNaN(parseFloat(String(work.coef)))) ? parseFloat(String(work.coef)) : natureCoef;
  return computeWorkConvertedScore(rawBase, coef, work.status);
};

export const DEFAULT_TASK_GROUPS = [
  'Kế hoạch vốn',
  'Thanh toán, giải ngân',
  'Quyết toán',
  'Lựa chọn nhà thầu',
  'Quản lý hợp đồng',
  'GPMB',
  'Báo cáo, GSDGĐT, ADB8',
  'Báo cáo, GSDGĐT, ADB9',
  'Rà soát, kiểm soát, xem xét, góp ý',
  'Thanh tra, Kiểm toán, Kiểm tra, Giám sát',
  'Thủ quỹ',
  'Kế toán nội bộ',
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
    { code: 'QT02', name: 'Lập báo cáo quyết toán dự án hoàn thành', score: 18, nature: 'Đặc biệt phức tạp', productType: 'Hồ sơ quyết toán', unit: 'Hồ sơ' },
    { code: 'QT03', name: 'Theo dõi, đôn đốc phê duyệt quyết toán vốn đầu tư dự án hoàn thành', score: 12, nature: 'Phức tạp', productType: 'Tờ trình', unit: 'Tờ trình' },
    { code: 'QT04', name: 'Báo cáo, giải trình quyết toán', score: 12, nature: 'Phức tạp', productType: 'Báo cáo', unit: 'Báo cáo' }
  ],
  'Lựa chọn nhà thầu': [
    { code: 'B6.1', name: 'Lập, điều chỉnh, bổ sung kế hoạch lựa chọn nhà thầu', score: 13, nature: 'Phức tạp', productType: 'Hồ sơ lựa chọn nhà thầu', unit: 'Hồ sơ' },
    { code: 'B6.2', name: 'Thẩm định kế hoạch lựa chọn nhà thầu, hồ sơ mời thầu', score: 14, nature: 'Phức tạp', productType: 'Báo cáo', unit: 'Báo cáo' },
    { code: 'B6.3', name: 'Lập Hồ sơ chỉ định thầu', score: 12, nature: 'Phức tạp', productType: 'Hồ sơ', unit: 'Hồ sơ' }
  ],
  'Quản lý hợp đồng': [
    { code: 'HD01', name: 'Góp ý, rà soát, thương thảo hợp đồng', score: 8, nature: 'Trung bình', productType: 'Hợp đồng', unit: 'Bộ' },
    { code: 'HD02', name: 'Điều chỉnh thông tin hợp đồng', score: 1, nature: 'Rất đơn giản', productType: 'PL hợp đồng', unit: 'Bộ' },
    { code: 'HD03', name: 'Thanh lý, chấm dứt hợp đồng', score: 8, nature: 'Trung bình', productType: 'Biên bản', unit: 'Biên bản' },
    { code: 'HD04', name: 'Ký hợp đồng', score: 1, nature: 'Rất đơn giản', productType: 'Hợp đồng', unit: 'Bộ' },
    { code: 'HD05', name: 'Điều chỉnh khối lượng, điều chỉnh tạm ứng, các điều chỉnh khác', score: 12, nature: 'Rất phức tạp', productType: 'Hồ sơ', unit: 'Bộ' }
  ],
  'GPMB': [
    { code: 'GPMB01', name: 'Tổng hợp hồ sơ đền bù, giải phóng mặt bằng', score: 12, nature: 'Phức tạp', productType: 'Hồ sơ đền bù/GPMB', unit: 'Hồ sơ' },
    { code: 'GPMB02', name: 'Phối hợp chi trả tiền bồi thường, hỗ trợ tái định cư', score: 10, nature: 'Trung bình', productType: 'Biên bản', unit: 'Biên bản' },
    { code: 'GPMB03', name: 'Tổng hợp hồ sơ Thanh toán, hoàn ứng GPMB', score: 12, nature: 'Phức tạp', productType: 'Hồ sơ', unit: 'Hồ sơ' }
  ],
  'Báo cáo, GSDGĐT, ADB8': [
    { code: 'B9.1', name: 'Lập báo cáo định kỳ, đột xuất, giao ban, cấp trên', score: 8, nature: 'Trung bình', productType: 'Báo cáo', unit: 'Báo cáo' },
    { code: 'B9.2', name: 'Giám sát, đánh giá đầu tư dự án trên hệ thống quốc gia', score: 10, nature: 'Phức tạp', productType: 'Báo cáo', unit: 'Báo cáo' }
  ],
  'Báo cáo, GSDGĐT, ADB9': [
    { code: 'B9.3', name: 'Báo cáo định kỳ, hàng ngày', score: 5, nature: 'Đơn giản', productType: 'Báo cáo', unit: 'Báo cáo' }
  ],
  'Rà soát, kiểm soát, xem xét, góp ý': [
    { code: 'RS01', name: 'Góp ý, rà soát, kiểm soát hồ sơ, tài liệu, văn bản', score: 8, nature: 'Trung bình', productType: 'Văn bản', unit: 'Văn bản' }
  ],
  'Thanh tra, Kiểm toán, Kiểm tra, Giám sát': [
    { code: 'TTr01', name: 'Phục vụ công tác thanh tra, kiểm toán, kiểm tra, giám sát', score: 15, nature: 'Rất phức tạp', productType: 'Hồ sơ', unit: 'Hồ sơ' },
    { code: 'TTr02', name: 'Thực hiện kết luận, kiến nghị thanh tra, kiểm tra, kiểm toán', score: 15, nature: 'Rất phức tạp', productType: 'Báo cáo', unit: 'Báo cáo' }
  ],
  'Thủ quỹ': [
    { code: 'TQ01', name: 'Vào sổ sách quỹ', score: 5, nature: 'Đơn giản', productType: 'Sổ sách', unit: 'Sổ' },
    { code: 'TQ02', name: 'Rút tiền', score: 5, nature: 'Đơn giản', productType: 'Chứng từ', unit: 'Bộ' },
    { code: 'TQ03', name: 'Chuyển tiền', score: 5, nature: 'Đơn giản', productType: 'Chứng từ', unit: 'Bộ' },
    { code: 'TQ04', name: 'Chi tiền', score: 5, nature: 'Đơn giản', productType: 'Phiếu chi', unit: 'Phiếu' },
    { code: 'TQ05', name: 'Chi GPMB', score: 10, nature: 'Trung bình', productType: 'Phiếu chi', unit: 'Phiếu' },
    { code: 'TQ06', name: 'Kiểm kê quỹ', score: 8, nature: 'Trung bình', productType: 'Biên bản', unit: 'Biên bản' }
  ],
  'Kế toán nội bộ': [
    { code: 'KT01', name: 'Thanh toán công tác', score: 8, nature: 'Trung bình', productType: 'Hồ sơ', unit: 'Hồ sơ' },
    { code: 'KT02', name: 'Thanh toán tiếp khách', score: 8, nature: 'Trung bình', productType: 'Hồ sơ', unit: 'Hồ sơ' },
    { code: 'KT03', name: 'Thanh toán chi mua sắm, sửa chữa', score: 8, nature: 'Trung bình', productType: 'Hồ sơ', unit: 'Hồ sơ' },
    { code: 'KT04', name: 'Thanh toán lương, bảo hiểm, phúc lợi', score: 10, nature: 'Trung bình', productType: 'Bảng lương', unit: 'Bảng' },
    { code: 'KT05', name: 'Quyết toán thuế cơ quan, cá nhân', score: 15, nature: 'Rất phức tạp', productType: 'Tờ khai', unit: 'Bộ' }
  ],
  'Hành chính - tổng hợp': [
    { code: 'HC01', name: 'Soạn thảo văn bản, tờ trình, công văn đi/đến', score: 8, nature: 'Trung bình', productType: 'Văn bản', unit: 'Văn bản' },
    { code: 'HC02', name: 'Quản lý hồ sơ lưu trữ, bảo mật tài liệu và số liệu dự án', score: 8, nature: 'Đơn giản', productType: 'Hồ sơ', unit: 'Hồ sơ' }
  ]
};

import { OrgConfig } from './types';

export const DEFAULT_ORG_CONFIG: OrgConfig = {
  parentAgency: 'Ban Quản lý dự án ĐTXD CT Giao thông và Nông nghiệp PTNT tỉnh Đắk Lắk',
  departmentName: 'Phòng Kế hoạch - Tài chính',
  shortName: 'KHTC',
  systemTitle: 'HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI',
  location: 'Đắk Lắk',
  creatorTitle: 'NGƯỜI LẬP BIỂU',
  approverTitle: 'TRƯỞNG PHÒNG',
  leaderTitle: 'LÃNH ĐẠO BAN',
  footerNote: 'Hệ thống Quản lý công việc & Đánh giá KPI'
};

export interface OrgPreset {
  id: string;
  name: string;
  category: string;
  config: OrgConfig;
}

export const ORG_CONFIG_PRESETS: OrgPreset[] = [
  {
    id: 'bql_khtc',
    name: 'Ban QLDA ĐTXD — Phòng Kế hoạch - Tài chính',
    category: 'Ban Quản lý dự án',
    config: {
      parentAgency: 'Ban Quản lý dự án ĐTXD CT Giao thông và Nông nghiệp PTNT tỉnh Đắk Lắk',
      departmentName: 'Phòng Kế hoạch - Tài chính',
      shortName: 'KHTC',
      systemTitle: 'HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI',
      location: 'Đắk Lắk',
      creatorTitle: 'NGƯỜI LẬP BIỂU',
      approverTitle: 'TRƯỞNG PHÒNG',
      leaderTitle: 'LÃNH ĐẠO BAN',
      footerNote: 'Hệ thống Quản lý công việc & Đánh giá KPI — Phòng KHTC'
    }
  },
  {
    id: 'bql_kt_td',
    name: 'Ban QLDA ĐTXD — Phòng Kỹ thuật & Thẩm định',
    category: 'Ban Quản lý dự án',
    config: {
      parentAgency: 'Ban Quản lý dự án ĐTXD Công trình Giao thông và NN PTNT',
      departmentName: 'Phòng Kỹ thuật & Thẩm định',
      shortName: 'KTTĐ',
      systemTitle: 'HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI',
      location: 'Đắk Lắk',
      creatorTitle: 'NGƯỜI LẬP BIỂU',
      approverTitle: 'TRƯỞNG PHÒNG',
      leaderTitle: 'GIÁM ĐỐC BAN',
      footerNote: 'Hệ thống Quản lý công việc & Đánh giá KPI — Phòng Kỹ thuật'
    }
  },
  {
    id: 'bql_dhda',
    name: 'Ban QLDA ĐTXD — Phòng Điều hành Dự án',
    category: 'Ban Quản lý dự án',
    config: {
      parentAgency: 'Ban Quản lý dự án Đầu tư Xây dựng Công trình',
      departmentName: 'Phòng Điều hành Dự án 1',
      shortName: 'ĐHDA1',
      systemTitle: 'HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI',
      location: 'Đắk Lắk',
      creatorTitle: 'NGƯỜI LẬP BIỂU',
      approverTitle: 'TRƯỞNG PHÒNG',
      leaderTitle: 'LÃNH ĐẠO BAN',
      footerNote: 'Hệ thống Quản lý tiến độ & KPI Dự án'
    }
  },
  {
    id: 'so_ban_nganh',
    name: 'Sở / Ngành / Cơ quan — Phòng Kế hoạch - Tổng hợp',
    category: 'Cơ quan Nhà nước',
    config: {
      parentAgency: 'SỞ GIAO THÔNG VẬN TẢI TỈNH ĐẮK LẮK',
      departmentName: 'Phòng Kế hoạch - Tổng hợp',
      shortName: 'KHTH',
      systemTitle: 'HỆ THỐNG ĐIỀU HÀNH CÔNG VIỆC & ĐÁNH GIÁ KPI',
      location: 'Đắk Lắk',
      creatorTitle: 'CHUYÊN VIÊN TỔNG HỢP',
      approverTitle: 'TRƯỞNG PHÒNG',
      leaderTitle: 'GIÁM ĐỐC SỞ',
      footerNote: 'Hệ thống Quản lý công việc & Đánh giá kết quả công tác'
    }
  },
  {
    id: 'doanh_nghiep',
    name: 'Doanh nghiệp / Công ty — Phòng Tài chính - Kế toán',
    category: 'Doanh nghiệp',
    config: {
      parentAgency: 'TỔNG CÔNG TY XÂY DỰNG CÔNG TRÌNH',
      departmentName: 'Phòng Tài chính - Kế toán',
      shortName: 'TCKT',
      systemTitle: 'HỆ THỐNG QUẢN TRỊ HIỆU SUẤT & ĐÁNH GIÁ KPI',
      location: 'TP. Buôn Ma Thuột',
      creatorTitle: 'NGƯỜI TỔNG HỢP',
      approverTitle: 'KẾ TOÁN TRƯỞNG / TRƯỞNG PHÒNG',
      leaderTitle: 'TỔNG GIÁM ĐỐC',
      footerNote: 'Hệ thống Quản trị hiệu suất & KPI doanh nghiệp'
    }
  },
  {
    id: 'trung_tam_cntt',
    name: 'Đơn vị sự nghiệp — Trung tâm CNTT & Chuyển đổi số',
    category: 'Đơn vị Sự nghiệp',
    config: {
      parentAgency: 'TRUNG TÂM CÔNG NGHỆ THÔNG TIN VÀ TRUYỀN THÔNG',
      departmentName: 'Phòng Phát triển Phần mềm & Chuyển đổi số',
      shortName: 'CNTT',
      systemTitle: 'HỆ THỐNG QUẢN LÝ TIẾN ĐỘ & ĐÁNH GIÁ KPI',
      location: 'Đắk Lắk',
      creatorTitle: 'NGƯỜI LẬP BÁO CÁO',
      approverTitle: 'TRƯỞNG PHÒNG',
      leaderTitle: 'GIÁM ĐỐC TRUNG TÂM',
      footerNote: 'Hệ thống Quản lý công việc & Hiệu suất'
    }
  }
];

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
  const sortedTiers = [...(rankingTiers || DEFAULT_KPI_CONFIG.rankingTiers)].sort(
    (x, y) => (x.order ?? 0) - (y.order ?? 0)
  );

  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    const min = tier.minScore !== undefined ? Number(tier.minScore) : -Infinity;
    const max = tier.maxScore !== undefined ? Number(tier.maxScore) : Infinity;

    if (score >= min && (i === 0 || score <= max + 0.001)) {
      let conditionFailed = false;
      if (tier.requireNoPenalties && (extra.scoreD || 0) > 0) {
        conditionFailed = true;
      }
      if (tier.minAScore && (extra.scoreA || 0) < tier.minAScore) {
        conditionFailed = true;
      }
      if (tier.minBScore && (extra.scoreB || 0) < tier.minBScore) {
        conditionFailed = true;
      }

      if (conditionFailed) {
        // If highest tier (e.g. Xuất sắc) fails condition, drop down exactly one tier
        if (i + 1 < sortedTiers.length) {
          const nextTier = sortedTiers[i + 1];
          return {
            rank: normalizeNFC(nextTier.name),
            tier: nextTier,
            badgeColor: nextTier.badgeColor || 'blue'
          };
        }
      } else {
        return {
          rank: normalizeNFC(tier.name),
          tier,
          badgeColor: tier.badgeColor || 'blue'
        };
      }
    }
  }

  // Fallback to lowest tier
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

export const PERMISSION_ALIASES: Record<string, string[]> = {
  assign_task: ['manage_works', 'assign_task'],
  manage_works: ['assign_task', 'manage_works'],
  approve_works: ['approve_works'],
  approve_ot: ['approve_ot'],
  evaluate_kpi: ['evaluate_kpi', 'calculate_kpi'],
  calculate_kpi: ['calculate_kpi', 'evaluate_kpi'],
  monitor_works: ['view_department_works', 'monitor_works'],
  view_department_works: ['monitor_works', 'view_department_works'],
  view_department_kpi: ['view_department_kpi', 'calculate_kpi'],
  view_department_dashboard: ['view_department_dashboard'],
  view_export_stats: ['view_export_stats'],
  print_department_kpi: ['print_department_kpi'],
  view_department_ot: ['view_department_ot'],
  monitor_sessions: ['monitor_sessions'],
  manage_users: ['manage_users'],
  manage_data: ['manage_data'],
  manage_categories: ['manage_categories'],
  manage_permissions: ['manage_permissions']
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
  if (perms.includes(permissionCode)) return true;

  const aliases = PERMISSION_ALIASES[permissionCode];
  if (aliases && aliases.some(a => perms.includes(a))) {
    return true;
  }

  return false;
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
  '/admin/database': 'manage_data',
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
 * Safe parse response to JSON with protection against HTML, text, and "Rate exceeded" errors
 */
export async function safeParseResponse<T = any>(
  res: Response | Promise<Response>
): Promise<{ success: boolean; data?: T; error?: string; [key: string]: any }> {
  try {
    const response = await res;
    if (!response) {
      return { success: false, error: 'Không nhận được phản hồi từ máy chủ.', data: [] as any };
    }

    const contentType = response.headers?.get('content-type') || '';
    const text = await response.text();

    if (!text || text.trim() === '') {
      return { success: response.ok, data: [] as any };
    }

    // Check if response is text or contains Rate exceeded
    if (text.includes('Rate exceeded') || text.trim().startsWith('<') || !contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch {
        if (text.includes('Rate exceeded')) {
          return {
            success: false,
            error: 'Tần suất gửi yêu cầu tạm thời vượt giới hạn. Hệ thống đang tự động tải lại dữ liệu.',
            data: [] as any
          };
        }
        return {
          success: false,
          error: response.ok ? 'Dữ liệu nhận về không phải JSON hợp lệ.' : `Lỗi máy chủ (${response.status} ${response.statusText})`,
          data: [] as any
        };
      }
    }

    return JSON.parse(text);
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Lỗi xử lý phản hồi máy chủ.',
      data: [] as any
    };
  }
}

/**
 * Safe fetch with automatic retry and exponential backoff
 */
export async function safeFetch(url: string, options?: RequestInit, retries = 2, delayMs = 400): Promise<Response> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 && i < retries) {
        // Rate exceeded - exponential backoff + jitter
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i) + Math.random() * 200));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(1.5, i) + Math.random() * 200));
      }
    }
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
}

/**
 * Safe fetch JSON with error handling and HTML/Non-JSON response guard
 */
export async function safeFetchJson<T = any>(
  url: string, 
  options?: RequestInit, 
  retries = 2
): Promise<{ success: boolean; data?: T; error?: string; [key: string]: any }> {
  try {
    const res = await safeFetch(url, options, retries);
    return await safeParseResponse<T>(res);
  } catch (err: any) {
    return { success: false, error: err?.message || 'Không thể kết nối đến máy chủ.', data: [] as any };
  }
}



