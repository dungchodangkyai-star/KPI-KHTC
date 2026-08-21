import express from 'express';
import { db } from '../src/db/index.ts';
import { users, categories, works, assignments, overtimes, kpiResults, notifications, systemLogs } from '../src/db/schema.ts';
import { eq, inArray, sql } from 'drizzle-orm';
import { DEFAULT_INITIAL_PASSWORD, formatStoredPassword } from './auth.ts';
import { formatMonth } from '../src/utils.ts';
import { calculateAndSaveUserKpi } from './kpiRoutes.ts';

export const syncRouter = express.Router();

// 19 Official verified staff members
export const OFFICIAL_USERS = [
  {
    name: 'Khuất Văn Sơn',
    email: 'khvanson@gmail.com',
    phone: '0906234585',
    zalo: '0906234585',
    position: 'Phó Trưởng phòng',
    group: 'Ban Lãnh đạo',
    role: 'ADMIN',
    status: 'Đang làm',
    permissions: JSON.stringify(['full_access']),
  },
  {
    name: 'Nguyễn Thị Hải Hà',
    email: 'nguyenhaiha.bmt@gmail.com',
    phone: '0913456789',
    zalo: '0913456789',
    position: 'Phó phòng',
    group: 'Ban Lãnh đạo',
    role: 'LEADER',
    status: 'Đang làm',
    permissions: JSON.stringify([
      'view_department_works', 'manage_works', 'approve_works',
      'evaluate_kpi', 'calculate_kpi', 'view_department_dashboard',
      'view_export_stats', 'print_department_kpi', 'approve_ot', 'view_department_ot'
    ]),
  },
  {
    name: 'Trần Anh Tuấn',
    email: 'tuandabmt@gmail.com',
    phone: '0912345601',
    zalo: '0912345601',
    position: 'Kế toán trưởng',
    group: 'Tài chính - Kế toán',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Huỳnh Trọng Hiếu',
    email: 'huynhtronghieu260495@gmail.com',
    phone: '0912345602',
    zalo: '0912345602',
    position: 'Chuyên viên',
    group: 'Kế hoạch vốn',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Đường Thị Ngọc Hà',
    email: 'duongngocha200990@gmail.com',
    phone: '0912345603',
    zalo: '0912345603',
    position: 'Chuyên viên',
    group: 'Thanh toán, giải ngân',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Lữ Hoàng Thanh',
    email: 'luhoangthanh92@gmail.com',
    phone: '0912345604',
    zalo: '0912345604',
    position: 'Chuyên viên',
    group: 'Quyết toán',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Nguyễn Thị Bích Ngoạn',
    email: 'bichngoan@gmail.com',
    phone: '0912345605',
    zalo: '0912345605',
    position: 'Chuyên viên',
    group: 'Kế hoạch vốn',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Đặng Văn Định',
    email: 'dangkydichvuson@gmail.com',
    phone: '0912345606',
    zalo: '0912345606',
    position: 'Chuyên viên',
    group: 'Lựa chọn nhà thầu',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Vũ Tuyền Hoàng',
    email: 'vutuyenhoang0901@gmail.com',
    phone: '0912345607',
    zalo: '0912345607',
    position: 'Chuyên viên',
    group: 'GPMB',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Nguyễn Thế Dinh',
    email: 'nguyenthedinhdaklak@gmail.com',
    phone: '0912345608',
    zalo: '0912345608',
    position: 'Chuyên viên',
    group: 'Thanh toán, giải ngân',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Lê Thị Thanh Thảo',
    email: 'haolethanh.ltt@gmail.com',
    phone: '0912345609',
    zalo: '0912345609',
    position: 'Chuyên viên',
    group: 'Báo cáo, GSDGĐT, ADB8',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Trần Thúy Vân',
    email: 'tranthuyvan.daklak@gmail.com',
    phone: '0912345610',
    zalo: '0912345610',
    position: 'Chuyên viên',
    group: 'Hành chính - tổng hợp',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Khuất văn Dạo',
    email: 'dangkydichvubongbi@gmail.com',
    phone: '0912345611',
    zalo: '0912345611',
    position: 'Chuyên viên',
    group: 'Kế hoạch vốn',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Lương Tâm Thành Nhân',
    email: 'LTTNVN248@gmail.com',
    phone: '0912345612',
    zalo: '0912345612',
    position: 'Chuyên viên',
    group: 'Thanh toán, giải ngân',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Nguyễn Trần Ánh Minh',
    email: 'nguyentrananhminh@gmail.com',
    phone: '0912345613',
    zalo: '0912345613',
    position: 'Chuyên viên',
    group: 'Quyết toán',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Hoàng Thị Bích Phương',
    email: 'hoangbichphuong20081996@gmail.com',
    phone: '0912345614',
    zalo: '0912345614',
    position: 'Chuyên viên',
    group: 'Báo cáo, GSDGĐT, ADB8',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Nguyễn Quang Huy',
    email: 'huynguyen.uct2@gmail.com',
    phone: '0912345615',
    zalo: '0912345615',
    position: 'Chuyên viên',
    group: 'Lựa chọn nhà thầu',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Văn Nì Niê',
    email: 'vanni3393@gmail.com',
    phone: '0912345616',
    zalo: '0912345616',
    position: 'Chuyên viên',
    group: 'GPMB',
    role: 'STAFF',
    status: 'Đang làm',
  },
  {
    name: 'Phạm Tân',
    email: 'phamtan264@gmail.com',
    phone: '0912345617',
    zalo: '0912345617',
    position: 'Chuyên viên',
    group: 'Hành chính - tổng hợp',
    role: 'STAFF',
    status: 'Đang làm',
  },
];

// Helper: Normalize string for fuzzy comparison
function normalizeStr(str: any): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// Helper: Parse date from various formats
function parseExcelDate(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime()) || val.getFullYear() < 1990 || val.getFullYear() > 2100) return null;
    return val;
  }
  if (typeof val === 'number') {
    // Only accept realistic Excel serial dates (between years 1990 and 2100 => 32874 to 73050)
    // Small numbers like 8, 17, -17, 1 are durations/offsets/hours, NOT dates!
    if (val >= 20000 && val <= 80000) {
      const ms = (val - 25569) * 86400000 + 43200000; // Noon UTC to prevent timezone shifts
      const d = new Date(ms);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 0, 0));
    }
    return null;
  }
  if (typeof val === 'string') {
    val = val.trim();
    if (!val) return null;
    // dd/mm/yyyy or dd-mm-yyyy or d/m/yyyy (common in Vietnam)
    const ddmmyyyyMatch = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1], 10);
      const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
      const year = parseInt(ddmmyyyyMatch[3], 10);
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 1990 && year <= 2100) {
        return new Date(Date.UTC(year, month, day, 8, 0, 0));
      }
    }
    // yyyy-mm-dd or yyyy/mm/dd
    const ymdMatch = val.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 1990 && year <= 2100) {
        return new Date(Date.UTC(year, month, day, 8, 0, 0));
      }
    }
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 1990 && parsed.getFullYear() <= 2100) {
      return parsed;
    }
  }
  return null;
}

// Helper: Parse time from Excel time fraction or string
function parseExcelTime(val: any, defaultTime = '17:00'): string {
  if (val === null || val === undefined || val === '') return defaultTime;
  if (val instanceof Date) {
    const hh = String(val.getUTCHours()).padStart(2, '0');
    const mm = String(val.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (typeof val === 'number') {
    if (val < 1) { // Excel fractional time
      const totalMinutes = Math.round(val * 24 * 60);
      const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
      const mm = String(totalMinutes % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  }
  if (typeof val === 'string') {
    val = val.trim();
    const tZMatch = val.match(/1899-12-30T(\d{2}:\d{2})/);
    if (tZMatch) return tZMatch[1];
    
    const timeMatch = val.match(/^(\d{1,2}):(\d{2})/);
    if (timeMatch) return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    
    return val.substring(0, 5); // Best effort fallback
  }
  return defaultTime;
}

// Helper: Extract field using alias keys from messy Excel objects
function getFieldValue(row: any, aliases: string[]): any {
  if (!row || typeof row !== 'object') return undefined;
  
  // 1. Direct exact key match (case-sensitive or exact string)
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return row[alias];
    }
  }

  const rowKeys = Object.keys(row);

  // 2. Normalized exact key match (ignoring case, spaces, accents)
  for (const alias of aliases) {
    const normAlias = normalizeStr(alias).replace(/[^a-z0-9]/g, '');
    if (!normAlias) continue;
    for (const key of rowKeys) {
      const normKey = normalizeStr(key).replace(/[^a-z0-9]/g, '');
      if (normKey === normAlias) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
    }
  }

  // 3. Very strict contains match (only for long descriptive phrases)
  // We only allow contains if the alias is at least 6 characters to prevent 'name' matching 'filename'
  for (const alias of aliases) {
    const normAlias = normalizeStr(alias).replace(/[^a-z0-9]/g, '');
    if (normAlias.length < 6) continue;
    for (const key of rowKeys) {
      const normKey = normalizeStr(key).replace(/[^a-z0-9]/g, '');
      
      // Avoid capturing email columns when looking for non-email fields
      if (!normAlias.includes('email') && !normAlias.includes('mail') && (normKey.includes('email') || normKey.includes('mail'))) {
        continue;
      }
      
      if (normKey.includes(normAlias)) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
    }
  }
  return undefined;
}

/**
 * 1. GET /api/sync/overview
 * Returns counts, health check, and month distributions in PostgreSQL
 */
syncRouter.get('/overview', async (req, res) => {
  try {
    const [
      usersCount,
      categoriesCount,
      worksCount,
      assignmentsCount,
      overtimesCount,
      kpiCount,
      worksByMonthRaw,
      overtimesByMonthRaw,
      assignmentsByMonthRaw,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*)` }).from(categories),
      db.select({ count: sql<number>`count(*)` }).from(works),
      db.select({ count: sql<number>`count(*)` }).from(assignments),
      db.select({ count: sql<number>`count(*)` }).from(overtimes),
      db.select({ count: sql<number>`count(*)` }).from(kpiResults),
      db.select({ month: works.month, count: sql<number>`count(*)` }).from(works).groupBy(works.month),
      db.select({ month: overtimes.month, count: sql<number>`count(*)` }).from(overtimes).groupBy(overtimes.month),
      db.select({ month: assignments.month, count: sql<number>`count(*)` }).from(assignments).groupBy(assignments.month),
    ]);

    const allUsers = await db.query.users.findMany({
      columns: { id: true, name: true, email: true, role: true, position: true, group: true, status: true },
      orderBy: (u, { asc }) => [asc(u.name)],
    });

    // Map month breakdowns
    const monthsMap: Record<string, { works: number; assignments: number; overtimes: number }> = {};
    worksByMonthRaw.forEach((item) => {
      const m = item.month || 'Không xác định';
      if (!monthsMap[m]) monthsMap[m] = { works: 0, assignments: 0, overtimes: 0 };
      monthsMap[m].works = Number(item.count || 0);
    });
    assignmentsByMonthRaw.forEach((item) => {
      const m = item.month || 'Không xác định';
      if (!monthsMap[m]) monthsMap[m] = { works: 0, assignments: 0, overtimes: 0 };
      monthsMap[m].assignments = Number(item.count || 0);
    });
    overtimesByMonthRaw.forEach((item) => {
      const m = item.month || 'Không xác định';
      if (!monthsMap[m]) monthsMap[m] = { works: 0, assignments: 0, overtimes: 0 };
      monthsMap[m].overtimes = Number(item.count || 0);
    });

    res.json({
      success: true,
      stats: {
        users: Number(usersCount[0]?.count || 0),
        categories: Number(categoriesCount[0]?.count || 0),
        works: Number(worksCount[0]?.count || 0),
        assignments: Number(assignmentsCount[0]?.count || 0),
        overtimes: Number(overtimesCount[0]?.count || 0),
        kpiResults: Number(kpiCount[0]?.count || 0),
      },
      monthsDistribution: monthsMap,
      users: allUsers,
      database: 'Cloud SQL PostgreSQL (Đang hoạt động thật 100%)',
    });
  } catch (error) {
    console.error('Error fetching sync overview:', error);
    res.status(500).json({ error: String(error) });
  }
});

/**
 * 2. GET /api/sync/backup-data
 * Returns complete real database records for multi-table backup
 */
syncRouter.get('/backup-data', async (req, res) => {
  try {
    const [allUsers, allCategories, allWorks, allAssignments, allOvertimes, allKpiResults] = await Promise.all([
      db.query.users.findMany({ orderBy: (u, { asc }) => [asc(u.id)] }),
      db.query.categories.findMany({ orderBy: (c, { asc }) => [asc(c.order), asc(c.id)] }),
      db.query.works.findMany({ with: { user: true }, orderBy: (w, { desc }) => [desc(w.createdAt)] }),
      db.query.assignments.findMany({ with: { assigner: true, receiver: true }, orderBy: (a, { desc }) => [desc(a.assignDate)] }),
      db.query.overtimes.findMany({ with: { user: true, approver: true }, orderBy: (o, { desc }) => [desc(o.otDate)] }),
      db.query.kpiResults.findMany({ with: { user: true }, orderBy: (k, { desc }) => [desc(k.month)] }),
    ]);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      system: 'Hệ thống Quản lý Công việc & Đánh giá KPI V8.9',
      data: {
        users: allUsers,
        categories: allCategories,
        works: allWorks,
        assignments: allAssignments,
        overtimes: allOvertimes,
        kpiResults: allKpiResults,
      },
    });
  } catch (error) {
    console.error('Error exporting backup data:', error);
    res.status(500).json({ error: String(error) });
  }
});

/**
 * 3. POST /api/sync/batch
 * Handles flexible multi-sheet / single-sheet Excel imports into Cloud SQL
 */
syncRouter.post('/batch', async (req, res) => {
  try {
    const { type, sheets, mode, defaultMonth, monthSyncMode = 'ALL', selectedMonths = [], overrideMonth } = req.body;
    const fallbackMonth = formatMonth(defaultMonth) || '08-2026';
    const defaultPwdHash = formatStoredPassword(DEFAULT_INITIAL_PASSWORD);

    const affectedMonths = new Set<string>();

    const results: {
      users: { success: number; skipped: number; errors: string[] };
      categories: { success: number; skipped: number; errors: string[] };
      works: { success: number; skipped: number; errors: string[] };
      assignments: { success: number; skipped: number; errors: string[] };
      overtimes: { success: number; skipped: number; errors: string[] };
    } = {
      users: { success: 0, skipped: 0, errors: [] },
      categories: { success: 0, skipped: 0, errors: [] },
      works: { success: 0, skipped: 0, errors: [] },
      assignments: { success: 0, skipped: 0, errors: [] },
      overtimes: { success: 0, skipped: 0, errors: [] },
    };

    // Helper to resolve row month based on mode
    const resolveRowMonth = (row: any, dateAliases: string[] = []): { month: string; skip: boolean } => {
      if (monthSyncMode === 'OVERRIDE' && overrideMonth) {
        const oNorm = formatMonth(overrideMonth) || fallbackMonth;
        return { month: oNorm, skip: false };
      }

      // 1. Direct column match
      let rawMonth = getFieldValue(row, ['Tháng', 'month', 'Kỳ', 'Kỳ tháng', 'Kỳ làm việc', 'Tháng làm việc', 'Tháng báo cáo', 'Tháng KPI', 'Tháng làm thêm', 'Thang lam them']);
      let resolved = formatMonth(rawMonth);

      // 2. Check date fields if month column is missing
      if (!resolved && dateAliases.length > 0) {
        const rawDate = getFieldValue(row, dateAliases);
        if (rawDate) {
          resolved = formatMonth(rawDate);
        }
      }

      // 3. Fallback
      if (!resolved) {
        resolved = fallbackMonth;
      }

      // 4. Check if filtered when monthSyncMode is 'SELECTED'
      if (monthSyncMode === 'SELECTED' && Array.isArray(selectedMonths) && selectedMonths.length > 0) {
        const validSelected = selectedMonths.map((m: string) => formatMonth(m)).filter(Boolean);
        if (!validSelected.includes(resolved)) {
          return { month: resolved, skip: true };
        }
      }

      return { month: resolved, skip: false };
    };

    // Load existing user lookup map
    let allDbUsers = await db.query.users.findMany();
    const findUser = (query: any): any => {
      if (!query) return null;
      const str = String(query).trim();
      const numId = parseInt(str, 10);
      if (!isNaN(numId)) {
        const found = allDbUsers.find((u) => u.id === numId);
        if (found) return found;
      }
      const lower = str.toLowerCase();
      // Match by exact email
      let found = allDbUsers.find((u) => u.email && String(u.email).toLowerCase() === lower);
      if (found) return found;

      // Match by normalized name
      const norm = normalizeStr(str);
      found = allDbUsers.find((u) => normalizeStr(u.name) === norm);
      if (found) return found;

      // Match by partial name or partial email
      found = allDbUsers.find(
        (u) => (u.name && normalizeStr(u.name).includes(norm)) || (u.email && String(u.email).toLowerCase().includes(lower))
      );
      return found || null;
    };

    // --- A. PROCESS USERS ---
    const usersRows = sheets?.users || (type === 'users' ? req.body.data : null);
    if (Array.isArray(usersRows) && usersRows.length > 0) {
      for (let i = 0; i < usersRows.length; i++) {
        const row = usersRows[i];
        try {
          const name = getFieldValue(row, ['Họ và tên', 'Họ tên', 'Tên', 'name', 'Nhân viên', 'Tài khoản']);
          let email = getFieldValue(row, ['Email', 'Địa chỉ email', 'email', 'Mail']);
          const phone = getFieldValue(row, ['Số điện thoại', 'SĐT', 'phone', 'Điện thoại']);
          const zalo = getFieldValue(row, ['Zalo', 'zalo']);
          const position = getFieldValue(row, ['Chức vụ', 'Vị trí', 'position', 'Chức danh']) || 'Chuyên viên';
          const group = getFieldValue(row, ['Nhóm', 'Phòng ban', 'group', 'Bộ phận']) || 'Chuyên viên';
          let role = getFieldValue(row, ['Vai trò', 'Role', 'role', 'Phân quyền']) || 'STAFF';
          const status = getFieldValue(row, ['Trạng thái', 'status', 'Tình trạng']) || 'Đang làm';

          if (!name && !email) {
            results.users.skipped++;
            continue;
          }

          const userName = name ? String(name).trim() : 'Nhân viên mới';
          if (!email) {
            email = `${normalizeStr(userName).replace(/[^a-z0-9]/g, '')}@gmail.com`;
          }
          email = String(email).trim().toLowerCase();

          // Role normalization
          if (role.toUpperCase().includes('ADMIN') || role.toUpperCase().includes('QUẢN TRỊ')) {
            role = 'ADMIN';
          } else if (role.toUpperCase().includes('LEADER') || role.toUpperCase().includes('LÃNH ĐẠO') || role.toUpperCase().includes('TRƯỞNG') || role.toUpperCase().includes('PHÓ')) {
            role = 'LEADER';
          } else {
            role = 'STAFF';
          }

          // Special rule for Khuất Văn Sơn -> ADMIN
          if (userName.includes('Khuất Văn Sơn') || email === 'khvanson@gmail.com') {
            role = 'ADMIN';
          }

          const inserted = await db.insert(users).values({
            name: userName,
            email: email,
            phone: phone ? String(phone) : null,
            zalo: zalo ? String(zalo) : null,
            position: String(position),
            group: String(group),
            role: role,
            status: String(status),
            password: defaultPwdHash,
            mustChangePassword: true,
            permissions: role === 'ADMIN' ? JSON.stringify(['full_access']) : undefined,
          }).onConflictDoUpdate({
            target: users.email,
            set: {
              name: userName,
              phone: phone ? String(phone) : undefined,
              zalo: zalo ? String(zalo) : undefined,
              position: String(position),
              group: String(group),
              role: role,
              status: String(status),
              updatedAt: new Date(),
            },
          }).returning();

          if (inserted.length > 0) {
            results.users.success++;
          }
        } catch (err) {
          results.users.errors.push(`Dòng ${i + 1}: ${String(err)}`);
        }
      }
      // Refresh db users
      allDbUsers = await db.query.users.findMany();
    }

    // --- B. PROCESS CATEGORIES ---
    const catRows = sheets?.categories || (type === 'categories' ? req.body.data : null);
    if (Array.isArray(catRows) && catRows.length > 0) {
      for (let i = 0; i < catRows.length; i++) {
        const row = catRows[i];
        try {
          const code = getFieldValue(row, ['Mã', 'Mã danh mục', 'code', 'Mã việc', 'Mã công việc']);
          const name = getFieldValue(row, ['Tên', 'Tên danh mục', 'name', 'Tên công việc', 'Nội dung']);
          let catType = getFieldValue(row, ['Loại', 'Loại danh mục', 'type', 'Phân loại']) || 'TASK';
          const taskGroup = getFieldValue(row, ['Nhóm việc', 'taskGroup', 'Nhóm']);
          const score = getFieldValue(row, ['Điểm chuẩn', 'Điểm', 'score', 'baseScore']);
          const nature = getFieldValue(row, ['Tính chất', 'nature', 'Độ phức tạp']);
          const productType = getFieldValue(row, ['Loại sản phẩm', 'Loại SP', 'productType']);
          const unit = getFieldValue(row, ['Đơn vị', 'Đơn vị tính', 'unit', 'DVT']);
          const status = getFieldValue(row, ['Trạng thái', 'status']) || 'Đang dùng';
          const order = parseInt(getFieldValue(row, ['Thứ tự', 'STT', 'order']) || '0', 10);

          if (!name) {
            results.categories.skipped++;
            continue;
          }

          const catCode = code ? String(code).trim() : `CAT-${Date.now()}-${i}`;
          const catName = String(name).trim();

          // Normalize type
          if (catType.toUpperCase().includes('GROUP') || catType.toUpperCase().includes('NHÓM')) {
            catType = 'TASK_GROUP';
          } else if (catType.toUpperCase().includes('PRODUCT') || catType.toUpperCase().includes('SẢN PHẨM')) {
            catType = 'PRODUCT_TYPE';
          } else {
            catType = 'TASK';
          }

          const properties: any = {};
          if (taskGroup) properties.taskGroup = String(taskGroup);
          if (score !== undefined) properties.score = Number(score);
          if (nature) properties.nature = String(nature);
          if (productType) properties.productType = String(productType);
          if (unit) properties.unit = String(unit);

          await db.insert(categories).values({
            code: catCode,
            name: catName,
            type: catType,
            properties: properties,
            status: String(status),
            order: isNaN(order) ? i + 1 : order,
          }).onConflictDoUpdate({
            target: categories.code,
            set: {
              name: catName,
              type: catType,
              properties: properties,
              status: String(status),
              order: isNaN(order) ? i + 1 : order,
            },
          });

          results.categories.success++;
        } catch (err) {
          results.categories.errors.push(`Dòng ${i + 1}: ${String(err)}`);
        }
      }
    }

    // --- C. PROCESS WORKS (CÔNG VIỆC THỰC HIỆN) ---
    const worksRows = sheets?.works || (type === 'works' ? req.body.data : null);
    if (Array.isArray(worksRows) && worksRows.length > 0) {
      for (let i = 0; i < worksRows.length; i++) {
        const row = worksRows[i];
        try {
          const userQuery = getFieldValue(row, [
            'Nhân viên', 'Người thực hiện', 'Người làm', 'Họ và tên', 'Họ tên', 'Email', 'user', 'userName'
          ]);
          const matchedUser = findUser(userQuery) || allDbUsers[0];
          if (!matchedUser) {
            results.works.errors.push(`Dòng ${i + 1}: Không tìm thấy nhân sự phù hợp (${userQuery})`);
            continue;
          }

          const { month: rowMonth, skip } = resolveRowMonth(row, ['Ngày bắt đầu', 'Ngày', 'Ngày làm', 'startDate']);
          if (skip) {
            results.works.skipped++;
            continue;
          }
          affectedMonths.add(rowMonth);

          let rawWorkId = getFieldValue(row, ['Mã việc', 'Mã CV', 'Mã công việc', 'workId']);
          let workId = rawWorkId ? String(rawWorkId).trim() : '';
          // If workId is an email address, invalid or contains @, generate a proper work ID
          if (!workId || workId.includes('@') || workId.toLowerCase().includes('.com')) {
            workId = `W8-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          }

          const taskGroup = getFieldValue(row, ['Nhóm việc', 'Nhóm công việc', 'taskGroup', 'Nhóm']) || 'Kế hoạch vốn';
          
          let taskName = getFieldValue(row, ['Tên việc', 'Tên công việc', 'Nhiệm vụ', 'taskName', 'Công việc', 'Nội dung công việc']) || 'Thực hiện nhiệm vụ chuyên môn';
          taskName = String(taskName).trim();
          if (taskName.toLowerCase().includes('chưa có dữ liệu tự chấm') || taskName.toLowerCase().includes('quá hạn')) {
            const alt = getFieldValue(row, ['Nội dung', 'Chi tiết', 'Mô tả']);
            if (alt && !String(alt).toLowerCase().includes('chưa có dữ liệu')) {
              taskName = String(alt).trim();
            }
          }

          let rawTaskCode = getFieldValue(row, ['Mã danh mục', 'Mã chuẩn', 'taskCode', 'Mã CV', 'Mã công việc']);
          let taskCode = rawTaskCode ? String(rawTaskCode).trim() : '';
          if (taskCode.includes('@') || taskCode.toLowerCase().includes('.com') || taskCode.length > 30) {
            taskCode = '';
          }

          const detail = getFieldValue(row, ['Chi tiết', 'Mô tả chi tiết', 'Nội dung chi tiết', 'detail']) || '';
          const startDate = parseExcelDate(getFieldValue(row, ['Ngày bắt đầu', 'Ngày', 'Ngày làm', 'startDate'])) || new Date();
          const startTime = getFieldValue(row, ['Giờ bắt đầu', 'startTime']) || '07:30';
          const endDate = parseExcelDate(getFieldValue(row, ['Ngày kết thúc', 'Hạn chót', 'Deadline', 'endDate'])) || startDate;
          const endTime = getFieldValue(row, ['Giờ kết thúc', 'endTime']) || '17:00';
          const actualEndDate = parseExcelDate(getFieldValue(row, ['Ngày hoàn thành thực tế', 'Ngày xong', 'actualEndDate']));
          const hours = String(getFieldValue(row, ['Số giờ', 'Giờ', 'hours']) || '8');
          const days = parseInt(getFieldValue(row, ['Số ngày', 'Ngày làm', 'days']) || '1', 10);
          const proposedNature = getFieldValue(row, ['Tính chất', 'Tính chất đề xuất', 'proposedNature', 'Độ phức tạp']) || 'Trung bình';
          const approvedNature = getFieldValue(row, ['Tính chất duyệt', 'approvedNature']) || proposedNature;
          const coef = String(getFieldValue(row, ['Hệ số K', 'Hệ số', 'coef']) || '0.8');
          const baseScore = String(getFieldValue(row, ['Điểm chuẩn (Đc)', 'Điểm chuẩn', 'baseScore', 'Điểm']) || '10');
          const convertedScore = String(getFieldValue(row, ['Điểm quy đổi (Đqđ)', 'Điểm quy đổi', 'convertedScore']) || '8');
          const status = getFieldValue(row, ['Trạng thái', 'Tiến độ', 'status']) || 'Hoàn thành';
          const evidence = getFieldValue(row, ['Minh chứng', 'Link minh chứng', 'File', 'evidence']) || '';
          const productType = getFieldValue(row, ['Loại sản phẩm', 'Sản phẩm', 'productType']) || 'Báo cáo';
          const productQty = parseInt(getFieldValue(row, ['Số lượng SP', 'Số lượng', 'productQty']) || '1', 10);
          const unit = getFieldValue(row, ['Đơn vị tính', 'Đơn vị', 'unit', 'DVT']) || 'Sản phẩm';
          const project = getFieldValue(row, ['Dự án', 'Công trình', 'project']) || '';
          const relatedUnit = getFieldValue(row, ['Đơn vị phối hợp', 'Đơn vị liên quan', 'relatedUnit']) || '';
          const leaderApproval = getFieldValue(row, ['Lãnh đạo duyệt', 'Phê duyệt', 'leaderApproval', 'Duyệt']) || 'Chưa duyệt';
          const leaderNote = getFieldValue(row, ['Ý kiến lãnh đạo', 'Ghi chú duyệt', 'leaderNote']) || '';

          await db.insert(works).values({
            workId: String(workId),
            month: String(rowMonth),
            userId: matchedUser.id,
            taskGroup: String(taskGroup),
            taskName: String(taskName),
            taskCode: taskCode ? String(taskCode) : null,
            detail: detail ? String(detail) : null,
            startDate: startDate,
            startTime: String(startTime),
            endDate: endDate,
            endTime: String(endTime),
            actualEndDate: actualEndDate,
            hours: hours,
            days: isNaN(days) ? 1 : days,
            proposedNature: String(proposedNature),
            approvedNature: String(approvedNature),
            coef: coef,
            baseScore: baseScore,
            convertedScore: convertedScore,
            status: String(status),
            evidence: evidence ? String(evidence) : null,
            productType: String(productType),
            productQty: isNaN(productQty) ? 1 : productQty,
            unit: String(unit),
            project: project ? String(project) : null,
            relatedUnit: relatedUnit ? String(relatedUnit) : null,
            leaderApproval: String(leaderApproval),
            leaderNote: leaderNote ? String(leaderNote) : null,
            source: 'EXCEL_SYNC',
          }).onConflictDoUpdate({
            target: works.workId,
            set: {
              month: String(rowMonth),
              userId: matchedUser.id,
              taskGroup: String(taskGroup),
              taskName: String(taskName),
              taskCode: taskCode ? String(taskCode) : null,
              detail: detail ? String(detail) : null,
              startDate: startDate,
              endDate: endDate,
              hours: hours,
              proposedNature: String(proposedNature),
              approvedNature: String(approvedNature),
              coef: coef,
              baseScore: baseScore,
              convertedScore: convertedScore,
              status: String(status),
              evidence: evidence ? String(evidence) : null,
              productType: String(productType),
              productQty: isNaN(productQty) ? 1 : productQty,
              unit: String(unit),
              project: project ? String(project) : null,
              leaderApproval: String(leaderApproval),
              leaderNote: leaderNote ? String(leaderNote) : null,
              updatedAt: new Date(),
            },
          });

          results.works.success++;
        } catch (err) {
          results.works.errors.push(`Dòng ${i + 1}: ${String(err)}`);
        }
      }
    }

    // --- D. PROCESS ASSIGNMENTS ---
    const assignRows = sheets?.assignments || (type === 'assignments' ? req.body.data : null);
    if (Array.isArray(assignRows) && assignRows.length > 0) {
      for (let i = 0; i < assignRows.length; i++) {
        const row = assignRows[i];
        try {
          const receiverQuery = getFieldValue(row, ['Người nhận', 'Người thực hiện', 'Nhân viên', 'receiver']);
          const receiver = findUser(receiverQuery) || allDbUsers[0];
          const assignerQuery = getFieldValue(row, ['Người giao', 'Lãnh đạo', 'assigner']);
          const assigner = findUser(assignerQuery) || allDbUsers.find((u) => u.role === 'ADMIN' || u.role === 'LEADER') || allDbUsers[0];

          const { month: rowMonth, skip } = resolveRowMonth(row, ['Ngày bắt đầu', 'Ngày giao', 'startDate', 'assignDate']);
          if (skip) {
            results.assignments.skipped++;
            continue;
          }

          const assignmentId = getFieldValue(row, ['Mã giao việc', 'Mã việc', 'assignmentId', 'ID']) ||
            `A8-GV-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const taskName = getFieldValue(row, ['Tên việc', 'Nội dung', 'taskName', 'Nhiệm vụ']) || 'Nhiệm vụ giao việc';
          const taskGroup = getFieldValue(row, ['Nhóm việc', 'taskGroup']) || 'Kế hoạch vốn';
          const taskCode = getFieldValue(row, ['Mã chuẩn', 'Mã', 'taskCode']) || 'GV';
          const baseScore = String(getFieldValue(row, ['Điểm chuẩn', 'baseScore']) || '10');
          const suggestedNature = getFieldValue(row, ['Tính chất', 'suggestedNature']) || 'Trung bình';
          const suggestedCoef = String(getFieldValue(row, ['Hệ số', 'suggestedCoef']) || '0.8');
          const expectedConvertedScore = String(getFieldValue(row, ['Điểm quy đổi', 'expectedConvertedScore']) || '8');
          const detail = getFieldValue(row, ['Chi tiết', 'detail', 'Yêu cầu']) || '';
          const startDate = parseExcelDate(getFieldValue(row, ['Ngày bắt đầu', 'startDate'])) || new Date();
          const deadline = parseExcelDate(getFieldValue(row, ['Hạn chót', 'Deadline', 'deadline'])) || new Date();
          const productRequired = getFieldValue(row, ['Sản phẩm yêu cầu', 'productRequired']) || '';
          const productType = getFieldValue(row, ['Loại sản phẩm', 'productType']) || 'Báo cáo';
          const priority = getFieldValue(row, ['Mức độ ưu tiên', 'Độ ưu tiên', 'priority']) || 'Bình thường';
          const receiveStatus = getFieldValue(row, ['Trạng thái nhận', 'Trạng thái', 'receiveStatus']) || 'Chưa xem';

          await db.insert(assignments).values({
            assignmentId: String(assignmentId),
            month: String(rowMonth),
            assignerId: assigner.id,
            receiverId: receiver.id,
            taskGroup: String(taskGroup),
            taskName: String(taskName),
            taskCode: String(taskCode),
            baseScore: baseScore,
            suggestedNature: String(suggestedNature),
            suggestedCoef: suggestedCoef,
            expectedConvertedScore: expectedConvertedScore,
            detail: String(detail),
            startDate: startDate,
            deadline: deadline,
            productRequired: String(productRequired),
            productType: String(productType),
            productQty: 1,
            unit: 'Sản phẩm',
            priority: String(priority),
            receiveStatus: String(receiveStatus),
          }).onConflictDoUpdate({
            target: assignments.assignmentId,
            set: {
              month: String(rowMonth),
              assignerId: assigner.id,
              receiverId: receiver.id,
              taskGroup: String(taskGroup),
              taskName: String(taskName),
              taskCode: String(taskCode),
              detail: String(detail),
              startDate: startDate,
              deadline: deadline,
              productRequired: String(productRequired),
              productType: String(productType),
              priority: String(priority),
              receiveStatus: String(receiveStatus),
              updatedAt: new Date(),
            },
          });

          results.assignments.success++;
        } catch (err) {
          results.assignments.errors.push(`Dòng ${i + 1}: ${String(err)}`);
        }
      }
    }

    // --- E. PROCESS OVERTIMES ---
    const otRows = sheets?.overtimes || (type === 'overtimes' ? req.body.data : null);
    if (Array.isArray(otRows) && otRows.length > 0) {
      for (let i = 0; i < otRows.length; i++) {
        const row = otRows[i];
        try {
          const userQuery = getFieldValue(row, ['Nhân viên', 'Họ và tên', 'Họ tên', 'Email', 'user']);
          const matchedUser = findUser(userQuery) || allDbUsers[0];

          const rawOtDate = getFieldValue(row, ['Ngày làm thêm', 'Ngày OT', 'Ngày', 'otDate']);
          const otDate = parseExcelDate(rawOtDate) || new Date();
          
          let rowMonth = formatMonth(otDate) || formatMonth(getFieldValue(row, ['Tháng làm thêm', 'Tháng', 'month', 'Kỳ'])) || fallbackMonth;
          
          if (monthSyncMode === 'OVERRIDE' && overrideMonth) {
            rowMonth = formatMonth(overrideMonth) || rowMonth;
          }

          let skip = false;
          if (monthSyncMode === 'SELECTED' && Array.isArray(selectedMonths) && selectedMonths.length > 0) {
            const validSelected = selectedMonths.map((m: string) => formatMonth(m)).filter(Boolean);
            if (!validSelected.includes(rowMonth)) {
              skip = true;
            }
          }

          if (skip) {
            results.overtimes.skipped++;
            continue;
          }
          affectedMonths.add(rowMonth);

          const otId = getFieldValue(row, ['Mã OT', 'Mã làm thêm', 'otId', 'ID']) ||
            `OT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const startTime = parseExcelTime(getFieldValue(row, ['Giờ bắt đầu', 'startTime']), '17:00');
          const endTime = parseExcelTime(getFieldValue(row, ['Giờ kết thúc', 'endTime']), '20:30');
          const breakMinutes = parseInt(getFieldValue(row, ['Nghỉ', 'breakMinutes']) || '0', 10);
          const totalRegHours = String(getFieldValue(row, ['Số giờ đăng ký', 'Giờ đăng ký', 'totalRegHours']) || '3.5');
          const content = getFieldValue(row, ['Nội dung đăng ký', 'Nội dung làm thêm', 'Nội dung', 'content']) || 'Xử lý hồ sơ gấp';
          const reason = getFieldValue(row, ['Lý do làm thêm', 'Lý do', 'reason']) || 'Hồ sơ hỏa tốc phục vụ kỳ họp';
          const project = getFieldValue(row, ['Dự án', 'project']) || '';
          const expectedResult = getFieldValue(row, ['Kết quả dự kiến', 'expectedResult']) || '';
          const actualResult = getFieldValue(row, ['Kết quả thực tế', 'Kết quả thực hiện', 'Minh chứng', 'actualResult']) || '';
          const approvalStatus = getFieldValue(row, ['Trạng thái duyệt', 'Duyệt', 'approvalStatus']) || 'Đã duyệt';
          const approvedHours = String(getFieldValue(row, ['Số giờ duyệt', 'Giờ duyệt', 'approvedHours']) || totalRegHours);

          await db.insert(overtimes).values({
            otId: String(otId),
            month: String(rowMonth),
            userId: matchedUser.id,
            otDate: otDate,
            startTime: String(startTime),
            endTime: String(endTime),
            breakMinutes: isNaN(breakMinutes) ? 0 : breakMinutes,
            totalRegHours: totalRegHours,
            content: String(content),
            reason: String(reason),
            project: String(project),
            expectedResult: String(expectedResult),
            actualResult: String(actualResult),
            approvalStatus: String(approvalStatus),
            approvedHours: approvedHours,
          }).onConflictDoUpdate({
            target: overtimes.otId,
            set: {
              month: String(rowMonth),
              userId: matchedUser.id,
              otDate: otDate,
              startTime: String(startTime),
              endTime: String(endTime),
              breakMinutes: isNaN(breakMinutes) ? 0 : breakMinutes,
              totalRegHours: totalRegHours,
              content: String(content),
              reason: String(reason),
              project: String(project),
              expectedResult: String(expectedResult),
              actualResult: String(actualResult),
              approvalStatus: String(approvalStatus),
              approvedHours: approvedHours,
              updatedAt: new Date(),
            },
          });

          results.overtimes.success++;
        } catch (err) {
          results.overtimes.errors.push(`Dòng ${i + 1}: ${String(err)}`);
        }
      }
    }

    // --- F. AUTO RECALCULATE KPI FOR AFFECTED MONTHS ---
    if (affectedMonths.size > 0) {
      const activeUsers = allDbUsers.filter((u) => u.status === 'Đang làm');
      for (const m of Array.from(affectedMonths)) {
        for (const u of activeUsers) {
          try {
            await calculateAndSaveUserKpi(u, m);
          } catch (kpiErr) {
            console.error(`Auto KPI calc error for ${u.name} in month ${m}:`, kpiErr);
          }
        }
      }
    }

    const affectedList = Array.from(affectedMonths);
    const affectedText = affectedList.length > 0
      ? ` (Đã tự động tính lại KPI cho ${affectedList.length} kỳ: ${affectedList.join(', ')})`
      : '';

    res.json({
      success: true,
      message: `Đã hoàn tất đồng bộ và ghi nhận vào cơ sở dữ liệu Cloud SQL PostgreSQL!${affectedText}`,
      affectedMonths: affectedList,
      results: results,
    });
  } catch (error) {
    console.error('Batch sync error:', error);
    res.status(500).json({ error: String(error) });
  }
});

/**
 * 4. POST /api/sync/reset-data
 * Safe, comprehensive reset & initialization tools with confirmation check
 */
syncRouter.post('/reset-data', async (req, res) => {
  try {
    const { action, confirmation, month } = req.body;

    if (confirmation !== 'XACNHAN' && confirmation !== 'CONFIRM') {
      return res.status(400).json({
        success: false,
        message: 'Mã xác nhận không đúng! Vui lòng nhập chính xác từ "XACNHAN" để đảm bảo an toàn dữ liệu.',
      });
    }

    let summary = '';

    if (action === 'reset_month' && month) {
      await db.transaction(async (tx) => {
        await tx.delete(assignments).where(eq(assignments.month, month));
        await tx.delete(works).where(eq(works.month, month));
        await tx.delete(overtimes).where(eq(overtimes.month, month));
        await tx.delete(kpiResults).where(eq(kpiResults.month, month));
      });
      summary = `Đã xóa sạch dữ liệu phát sinh (Công việc, Giao việc, Làm thêm giờ, KPI) của kỳ tháng ${month}. Danh mục và Nhân sự được giữ nguyên 100%.`;
    } else if (action === 'reset_all_works') {
      await db.transaction(async (tx) => {
        await tx.delete(kpiResults);
        await tx.delete(assignments);
        await tx.delete(works);
        await tx.delete(overtimes);
        await tx.delete(notifications);
      });
      summary = 'Đã làm mới sạch sẽ toàn bộ công việc, giao việc, làm thêm giờ và kết quả KPI. Sẵn sàng phát hành hệ thống đi vào hoạt động thật!';
    } else if (action === 'reseed_official') {
      await db.transaction(async (tx) => {
        await tx.delete(kpiResults);
        await tx.delete(assignments);
        await tx.delete(works);
        await tx.delete(overtimes);
        await tx.delete(notifications);

        const defaultPwdHash = formatStoredPassword(DEFAULT_INITIAL_PASSWORD);

        for (const u of OFFICIAL_USERS) {
          await tx.insert(users).values({
            ...u,
            password: defaultPwdHash,
            mustChangePassword: true,
          }).onConflictDoUpdate({
            target: users.email,
            set: {
              name: u.name,
              phone: u.phone,
              zalo: u.zalo,
              position: u.position,
              group: u.group,
              role: u.role,
              status: u.status,
              permissions: u.permissions,
              updatedAt: new Date(),
            },
          });
        }
      });
      summary = 'Đã chuẩn hóa toàn bộ 19 tài khoản nhân sự chính thức của đơn vị, khôi phục phân quyền Admin cho Khuất Văn Sơn và làm mới cấu hình hệ thống chuẩn!';
    } else {
      return res.status(400).json({ success: false, message: 'Hành động làm mới không hợp lệ.' });
    }

    res.json({
      success: true,
      message: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Reset data error:', error);
    res.status(500).json({ error: String(error) });
  }
});
