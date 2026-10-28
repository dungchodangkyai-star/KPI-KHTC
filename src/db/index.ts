import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import * as schema from './schema.ts';
import { eq, desc, asc, and, or, inArray, sql } from 'drizzle-orm';

const { Pool } = pg;

export type StorageMode = 'postgres' | 'local-json';

/**
 * Storage Mode Resolution:
 * Default in production is 'postgres'.
 * 'local-json' is strictly an explicit opt-in for local development.
 */
export function getStorageMode(): StorageMode {
  if (process.env.STORAGE_MODE === 'local-json') {
    return 'local-json';
  }
  return 'postgres';
}

/**
 * Single source of truth for PostgreSQL connection string on server.
 * Never exposed to frontend, client logs, or committed files.
 */
export function getDatabaseUrl(): string {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
}

export function isPostgresConfigured(): boolean {
  if (getStorageMode() !== 'postgres') return true;
  return Boolean(getDatabaseUrl());
}

declare global {
  var _activePostgresPool: pg.Pool | undefined;
  var _activeDrizzleDb: any | undefined;
  var _inMemoryStore: any | undefined;
  var _isInsideTransaction: boolean | undefined;
  var _lastSuccessfulHealthCheck: string | null | undefined;
}

const DATA_STORE_PATH = path.join(process.cwd(), 'data', 'db-local-store.json');

const ensureDataDir = () => {
  const dir = path.dirname(DATA_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Seed 19 official staff members
export const INITIAL_USERS = [
  { id: 1, name: 'Khuất Văn Sơn', email: 'khvanson@gmail.com', phone: '0906234585', zalo: '0906234585', position: 'Phó Trưởng phòng', group: 'Ban Lãnh đạo', role: 'ADMIN', status: 'Đang làm', permissions: JSON.stringify(['full_access']) },
  { id: 2, name: 'Nguyễn Thị Hải Hà', email: 'nguyenhaiha.bmt@gmail.com', phone: '0913456789', zalo: '0913456789', position: 'Phó phòng', group: 'Ban Lãnh đạo', role: 'LEADER', status: 'Đang làm', permissions: JSON.stringify(['view_department_works', 'manage_works', 'approve_works', 'evaluate_kpi', 'calculate_kpi', 'view_department_dashboard', 'view_export_stats', 'print_department_kpi', 'approve_ot', 'view_department_ot']) },
  { id: 3, name: 'Trần Anh Tuấn', email: 'tuandabmt@gmail.com', phone: '0912345601', zalo: '0912345601', position: 'Kế toán trưởng', group: 'Tài chính - Kế toán', role: 'STAFF', status: 'Đang làm' },
  { id: 4, name: 'Huỳnh Trọng Hiếu', email: 'huynhtronghieu260495@gmail.com', phone: '0912345602', zalo: '0912345602', position: 'Chuyên viên', group: 'Kế hoạch vốn', role: 'STAFF', status: 'Đang làm' },
  { id: 5, name: 'Đường Thị Ngọc Hà', email: 'duongngocha200990@gmail.com', phone: '0912345603', zalo: '0912345603', position: 'Chuyên viên', group: 'Thanh toán, giải ngân', role: 'STAFF', status: 'Đang làm' },
  { id: 6, name: 'Lữ Hoàng Thanh', email: 'luhoangthanh92@gmail.com', phone: '0912345604', zalo: '0912345604', position: 'Chuyên viên', group: 'Quyết toán', role: 'STAFF', status: 'Đang làm' },
  { id: 7, name: 'Nguyễn Thị Bích Ngoạn', email: 'bichngoan@gmail.com', phone: '0912345605', zalo: '0912345605', position: 'Chuyên viên', group: 'Kế hoạch vốn', role: 'STAFF', status: 'Đang làm' },
  { id: 8, name: 'Đặng Văn Định', email: 'dangkydichvuson@gmail.com', phone: '0912345606', zalo: '0912345606', position: 'Chuyên viên', group: 'Lựa chọn nhà thầu', role: 'STAFF', status: 'Đang làm' },
  { id: 9, name: 'Vũ Tuyền Hoàng', email: 'vutuyenhoang0901@gmail.com', phone: '0912345607', zalo: '0912345607', position: 'Chuyên viên', group: 'GPMB', role: 'STAFF', status: 'Đang làm' },
  { id: 10, name: 'Nguyễn Thế Dinh', email: 'nguyenthedinhdaklak@gmail.com', phone: '0912345608', zalo: '0912345608', position: 'Chuyên viên', group: 'Thanh toán, giải ngân', role: 'STAFF', status: 'Đang làm' },
  { id: 11, name: 'Lê Thị Thanh Thảo', email: 'haolethanh.ltt@gmail.com', phone: '0912345609', zalo: '0912345609', position: 'Chuyên viên', group: 'Báo cáo, GSDGĐT, ADB8', role: 'STAFF', status: 'Đang làm' },
  { id: 12, name: 'Trần Thúy Vân', email: 'tranthuyvan.daklak@gmail.com', phone: '0912345610', zalo: '0912345610', position: 'Chuyên viên', group: 'Hành chính - tổng hợp', role: 'STAFF', status: 'Đang làm' },
  { id: 13, name: 'Khuất văn Dạo', email: 'dangkydichvubongbi@gmail.com', phone: '0912345611', zalo: '0912345611', position: 'Chuyên viên', group: 'Kế hoạch vốn', role: 'STAFF', status: 'Đang làm' },
  { id: 14, name: 'Lương Tâm Thành Nhân', email: 'LTTNVN248@gmail.com', phone: '0912345612', zalo: '0912345612', position: 'Chuyên viên', group: 'Thanh toán, giải ngân', role: 'STAFF', status: 'Đang làm' },
  { id: 15, name: 'Nguyễn Trần Ánh Minh', email: 'nguyentrananhminh@gmail.com', phone: '0912345613', zalo: '0912345613', position: 'Chuyên viên', group: 'Quyết toán', role: 'STAFF', status: 'Đang làm' },
  { id: 16, name: 'Hoàng Thị Bích Phương', email: 'hoangbichphuong20081996@gmail.com', phone: '0912345614', zalo: '0912345614', position: 'Chuyên viên', group: 'Báo cáo, GSDGĐT, ADB8', role: 'STAFF', status: 'Đang làm' },
  { id: 17, name: 'Nguyễn Quang Huy', email: 'huynguyen.uct2@gmail.com', phone: '0912345615', zalo: '0912345615', position: 'Chuyên viên', group: 'Lựa chọn nhà thầu', role: 'STAFF', status: 'Đang làm' },
  { id: 18, name: 'Văn Nì Niê', email: 'vanni3393@gmail.com', phone: '0912345616', zalo: '0912345616', position: 'Chuyên viên', group: 'GPMB', role: 'STAFF', status: 'Đang làm' },
  { id: 19, name: 'Phạm Tân', email: 'phamtan264@gmail.com', phone: '0912345617', zalo: '0912345617', position: 'Chuyên viên', group: 'Hành chính - tổng hợp', role: 'STAFF', status: 'Đang làm' },
];

export const INITIAL_CATEGORIES = [
  { id: 1, code: 'GRP_VON', name: 'Kế hoạch vốn', type: 'TASK_GROUP', order: 1, status: 'Đang dùng' },
  { id: 2, code: 'GRP_THANHTOAN', name: 'Thanh toán, giải ngân', type: 'TASK_GROUP', order: 2, status: 'Đang dùng' },
  { id: 3, code: 'GRP_QUYETTOAN', name: 'Quyết toán', type: 'TASK_GROUP', order: 3, status: 'Đang dùng' },
  { id: 4, code: 'GRP_LCNT', name: 'Lựa chọn nhà thầu', type: 'TASK_GROUP', order: 4, status: 'Đang dùng' },
  { id: 5, code: 'GRP_GPMB', name: 'GPMB', type: 'TASK_GROUP', order: 5, status: 'Đang dùng' },
  { id: 6, code: 'GRP_BAOCAO', name: 'Báo cáo, GSDGĐT, ADB8', type: 'TASK_GROUP', order: 6, status: 'Đang dùng' },
  { id: 7, code: 'GRP_HANHCHINH', name: 'Hành chính - tổng hợp', type: 'TASK_GROUP', order: 7, status: 'Đang dùng' },
  { id: 8, code: 'PROD_BAOCAO', name: 'Báo cáo', type: 'PRODUCT_TYPE', order: 1, properties: { unit: 'Báo cáo' }, status: 'Đang dùng' },
  { id: 9, code: 'PROD_VANBAN', name: 'Văn bản', type: 'PRODUCT_TYPE', order: 2, properties: { unit: 'Văn bản' }, status: 'Đang dùng' },
  { id: 10, code: 'PROD_TOTRINH', name: 'Tờ trình', type: 'PRODUCT_TYPE', order: 3, properties: { unit: 'Tờ trình' }, status: 'Đang dùng' },
  { id: 11, code: 'PROD_BANG', name: 'Bảng tổng hợp', type: 'PRODUCT_TYPE', order: 4, properties: { unit: 'Bảng' }, status: 'Đang dùng' },
  { id: 12, code: 'PROD_HSTT', name: 'Hồ sơ thanh toán', type: 'PRODUCT_TYPE', order: 5, properties: { unit: 'Hồ sơ' }, status: 'Đang dùng' },
  { id: 13, code: 'PROD_HSQT', name: 'Hồ sơ quyết toán', type: 'PRODUCT_TYPE', order: 6, properties: { unit: 'Hồ sơ' }, status: 'Đang dùng' },
  { id: 14, code: 'PROD_HSLCNT', name: 'Hồ sơ lựa chọn nhà thầu', type: 'PRODUCT_TYPE', order: 7, properties: { unit: 'Hồ sơ' }, status: 'Đang dùng' },
  { id: 15, code: 'PROD_HSGPMB', name: 'Hồ sơ đền bù/GPMB', type: 'PRODUCT_TYPE', order: 8, properties: { unit: 'Hồ sơ' }, status: 'Đang dùng' },
  { id: 16, code: 'PROD_BIENBAN', name: 'Biên bản', type: 'PRODUCT_TYPE', order: 9, properties: { unit: 'Biên bản' }, status: 'Đang dùng' },
  { id: 17, code: 'PROD_KHAC', name: 'Khác', type: 'PRODUCT_TYPE', order: 10, properties: { unit: 'Sản phẩm' }, status: 'Đang dùng' },
  { id: 18, code: 'NAT_01', name: 'Rất đơn giản', type: 'WORK_NATURE', order: 1, properties: { coef: 0.5, c1Point: 0, description: 'Nhiệm vụ thường xuyên, định kỳ đơn giản' }, status: 'Đang dùng' },
  { id: 19, code: 'NAT_02', name: 'Đơn giản', type: 'WORK_NATURE', order: 2, properties: { coef: 0.6, c1Point: 0, description: 'Công việc đơn giản, ít bước xử lý' }, status: 'Đang dùng' },
  { id: 20, code: 'NAT_03', name: 'Trung bình', type: 'WORK_NATURE', order: 3, properties: { coef: 0.8, c1Point: 0, description: 'Công việc trung bình, yêu cầu nghiệp vụ tiêu chuẩn' }, status: 'Đang dùng' },
  { id: 21, code: 'NAT_04', name: 'Phức tạp', type: 'WORK_NATURE', order: 4, properties: { coef: 1.0, c1Point: 1, description: 'Công việc phức tạp, phối hợp nhiều khâu' }, status: 'Đang dùng' },
  { id: 22, code: 'NAT_05', name: 'Rất phức tạp', type: 'WORK_NATURE', order: 5, properties: { coef: 1.2, c1Point: 2, description: 'Công việc rất phức tạp, quy mô lớn' }, status: 'Đang dùng' },
  { id: 23, code: 'NAT_06', name: 'Đặc biệt phức tạp', type: 'WORK_NATURE', order: 6, properties: { coef: 1.5, c1Point: 3, description: 'Công việc đột xuất trọng điểm' }, status: 'Đang dùng' },
];

function normalizeTableName(name: string): string {
  if (name === 'kpi_results' || name === 'kpiResults') return 'kpiResults';
  if (name === 'system_logs' || name === 'systemLogs' || name === 'logs') return 'systemLogs';
  if (name === 'push_settings' || name === 'pushSettings') return 'pushSettings';
  if (name === 'push_subscriptions' || name === 'pushSubscriptions') return 'pushSubscriptions';
  return name;
}

export function createStoreProxy(rawStore: Record<string, any[]>): Record<string, any[]> {
  return new Proxy(rawStore, {
    get(target, prop: string | symbol) {
      if (typeof prop === 'string') {
        const normalized = normalizeTableName(prop);
        if (!target[normalized]) {
          target[normalized] = [];
        }
        return target[normalized];
      }
      return (target as any)[prop];
    },
    set(target, prop: string | symbol, value: any) {
      if (typeof prop === 'string') {
        const normalized = normalizeTableName(prop);
        target[normalized] = value;
        return true;
      }
      (target as any)[prop] = value;
      return true;
    }
  });
}

function getInitialStore(): Record<string, any[]> {
  const usersWithPass = INITIAL_USERS.map(u => ({
    ...u,
    password: '123456@',
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  return {
    users: usersWithPass,
    categories: INITIAL_CATEGORIES,
    works: [],
    assignments: [],
    overtimes: [],
    notifications: [],
    kpiResults: [],
    systemLogs: [],
    pushSettings: [{
      id: 1,
      vapid_public_key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5NMPH84',
      vapid_private_key: 'mock_vapid_private_key_for_internal_app',
      subject: 'mailto:admin@kpi.internal'
    }],
    pushSubscriptions: []
  };
}

export function loadStore(): Record<string, any[]> {
  if (global._inMemoryStore) return global._inMemoryStore;
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_STORE_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_STORE_PATH, 'utf-8'));
      const proxy = createStoreProxy(data);
      global._inMemoryStore = proxy;
      return proxy;
    }
  } catch (e) {
    console.warn('[AI Studio] Could not read local store, using default seed:', e);
  }
  const init = getInitialStore();
  const proxy = createStoreProxy(init);
  global._inMemoryStore = proxy;
  saveStore(proxy);
  return proxy;
}

export function saveStore(store: Record<string, any[]>) {
  try {
    ensureDataDir();
    const lockFile = path.join(path.dirname(DATA_STORE_PATH), '.cleanup.lock');
    if (fs.existsSync(lockFile) && !(global as any)._isInsideCleanup) {
      try {
        const raw = fs.readFileSync(lockFile, 'utf-8');
        const lock = JSON.parse(raw);
        if (lock.expiresAt && lock.expiresAt > Date.now()) {
          console.warn('[AI Studio] saveStore blocked by active cleanup lock.');
          return;
        }
      } catch {}
    }
    fs.writeFileSync(DATA_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[AI Studio] Could not save local store:', e);
  }
}

// -----------------------------------------------------------------------------
// POSTGRESQL POOL & DRIZZLE INITIALIZATION (FAIL-CLOSED)
// -----------------------------------------------------------------------------

function getOrCreatePostgresPool(): pg.Pool | null {
  const url = getDatabaseUrl();
  if (!url) {
    return null;
  }

  if (!global._activePostgresPool) {
    const isSslRequired = !url.includes('sslmode=disable') && !url.includes('127.0.0.1') && !url.includes('localhost');
    global._activePostgresPool = new Pool({
      connectionString: url,
      ssl: isSslRequired ? { rejectUnauthorized: false } : undefined,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    });

    global._activePostgresPool.on('error', (err) => {
      console.error('[Neon PostgreSQL Pool Error]:', err?.message || err);
    });

    global._activeDrizzleDb = drizzle(global._activePostgresPool, { schema });
  }

  return global._activePostgresPool;
}

export const createPool = () => {
  return getOrCreatePostgresPool();
};

/**
 * Health check with real SELECT 1 ping.
 * Never returns fake connected and never leaks credentials.
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  storageMode: StorageMode;
  provider: 'neon' | 'postgres' | 'local-json';
  latencyMs: number;
  lastSuccessfulCheck: string | null;
  error?: string;
  dbName?: string;
  version?: string;
  maskedHost?: string;
}> {
  const mode = getStorageMode();

  if (mode === 'local-json') {
    return {
      connected: true,
      storageMode: 'local-json',
      provider: 'local-json',
      latencyMs: 1,
      lastSuccessfulCheck: new Date().toISOString(),
      dbName: 'db-local-store.json'
    };
  }

  const url = getDatabaseUrl();
  const isNeon = url.includes('neon') || url.includes('neon.tech');
  const provider = isNeon ? 'neon' : 'postgres';

  if (!url) {
    return {
      connected: false,
      storageMode: 'postgres',
      provider,
      latencyMs: 0,
      lastSuccessfulCheck: global._lastSuccessfulHealthCheck || null,
      error: 'Hệ thống đang ở chế độ PostgreSQL Production nhưng biến môi trường DATABASE_URL chưa được thiết lập trong Secrets. (Chế độ an toàn Fail-Closed: khóa thao tác ghi để bảo vệ toàn vẹn dữ liệu).'
    };
  }

  const start = Date.now();
  try {
    const p = getOrCreatePostgresPool();
    if (!p) {
      throw new Error('Không thể khởi tạo Pool kết nối tới PostgreSQL');
    }

    const client = await p.connect();
    let res: pg.QueryResult;
    try {
      res = await client.query('SELECT 1 as ping, current_database() as db_name, version() as version');
    } finally {
      client.release();
    }

    const latencyMs = Date.now() - start;
    const nowIso = new Date().toISOString();
    global._lastSuccessfulHealthCheck = nowIso;

    let maskedHost = '';
    try {
      const parsed = new URL(url);
      maskedHost = parsed.hostname;
    } catch {}

    return {
      connected: true,
      storageMode: 'postgres',
      provider,
      latencyMs,
      lastSuccessfulCheck: nowIso,
      dbName: res.rows[0]?.db_name || 'postgres',
      version: res.rows[0]?.version || '',
      maskedHost
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      connected: false,
      storageMode: 'postgres',
      provider,
      latencyMs,
      lastSuccessfulCheck: global._lastSuccessfulHealthCheck || null,
      error: `Lỗi kết nối cơ sở dữ liệu Neon PostgreSQL: ${err?.message || String(err)}`
    };
  }
}

// -----------------------------------------------------------------------------
// LOCAL-JSON IN-MEMORY DRIZZLE PROXY (ONLY USED WHEN STORAGE_MODE === 'local-json')
// -----------------------------------------------------------------------------

function flattenChunks(chunk: any, list: any[] = []): any[] {
  if (!chunk) return list;
  if (chunk.queryChunks && Array.isArray(chunk.queryChunks)) {
    for (const sub of chunk.queryChunks) flattenChunks(sub, list);
  } else {
    list.push(chunk);
  }
  return list;
}

function matchesCondition(item: any, cond: any, schemaTable?: any): boolean {
  if (!cond) return true;
  if (typeof cond === 'function') {
    try {
      const built = cond(schemaTable, { eq, and, or, inArray, desc, asc });
      return matchesCondition(item, built, schemaTable);
    } catch {
      return true;
    }
  }

  const flattened = flattenChunks(cond);
  if (flattened.length === 0) return true;

  for (let i = 0; i < flattened.length; i++) {
    const f = flattened[i];
    if (f && f.name && typeof f.name === 'string') {
      const colName = f.name;
      let paramVal: any = undefined;
      let hasParam = false;
      let op = '=';

      for (let j = i + 1; j < Math.min(i + 5, flattened.length); j++) {
        const next = flattened[j];
        if (next && next.constructor?.name === 'StringChunk' && next.value) {
          const strVal = Array.isArray(next.value) ? next.value.join('') : String(next.value);
          if (strVal.includes('in') || strVal.includes('IN')) op = 'in';
          else if (strVal.includes('!=')) op = '!=';
          else if (strVal.includes('=')) op = '=';
        } else if (next && (next.value !== undefined || next.constructor?.name === 'Param') && next.constructor?.name !== 'StringChunk') {
          paramVal = next.value;
          hasParam = true;
          break;
        }
      }

      if (hasParam) {
        const camelCol = colName.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
        const actualVal = item[camelCol] !== undefined ? item[camelCol] : item[colName];

        if (op === '=') {
          if (String(actualVal) !== String(paramVal)) {
            return false;
          }
        } else if (op === 'in') {
          if (Array.isArray(paramVal)) {
            if (!paramVal.map(String).includes(String(actualVal))) return false;
          }
        } else if (op === '!=') {
          if (String(actualVal) === String(paramVal)) return false;
        }
      }
    }
  }

  return true;
}

function getCollectionName(target: any): string {
  if (typeof target === 'string') return target;
  if (target?._?.name) return target._.name;
  if (target?.name) return target.name;
  if (target?.[Symbol.for('drizzle:Name')]) return target[Symbol.for('drizzle:Name')];
  return 'users';
}

function populateRelations(tableName: string, items: any[], withOpts: any, store: any): any[] {
  if (!withOpts) return items;
  return items.map(item => {
    const copy = { ...item };
    if (tableName === 'works' && withOpts.user) {
      copy.user = (store.users || []).find((u: any) => u.id === item.userId) || null;
    }
    if (tableName === 'assignments') {
      if (withOpts.assigner) copy.assigner = (store.users || []).find((u: any) => u.id === item.assignerId) || null;
      if (withOpts.receiver) copy.receiver = (store.users || []).find((u: any) => u.id === item.receiverId) || null;
    }
    if (tableName === 'overtimes') {
      if (withOpts.user) copy.user = (store.users || []).find((u: any) => u.id === item.userId) || null;
      if (withOpts.approver) copy.approver = (store.users || []).find((u: any) => u.id === item.approverId) || null;
    }
    if (tableName === 'notifications') {
      if (withOpts.sender) copy.sender = (store.users || []).find((u: any) => u.id === item.senderId) || null;
      if (withOpts.receiver) copy.receiver = (store.users || []).find((u: any) => u.id === item.receiverId) || null;
    }
    if (tableName === 'kpiResults') {
      if (withOpts.user) copy.user = (store.users || []).find((u: any) => u.id === item.userId) || null;
    }
    return copy;
  });
}

function createLocalQueryHandler(tableNameInput: string) {
  const tableName = normalizeTableName(tableNameInput);
  const schemaTable = (schema as any)[tableName] || (schema as any)[tableNameInput];
  return {
    findMany: async (options?: any) => {
      const store = loadStore();
      let list = [...(store[tableName] || [])];
      if (options?.where) {
        list = list.filter(item => matchesCondition(item, options.where, schemaTable));
      }
      list = populateRelations(tableName, list, options?.with, store);
      return list;
    },
    findFirst: async (options?: any) => {
      const store = loadStore();
      let list = [...(store[tableName] || [])];
      if (options?.where) {
        list = list.filter(item => matchesCondition(item, options.where, schemaTable));
      }
      list = populateRelations(tableName, list, options?.with, store);
      return list[0] || null;
    }
  };
}

function performLocalUpsert(tableNameInput: string, vals: any, options?: { conflictTarget?: any; doUpdateSet?: any; doNothing?: boolean }) {
  const tableName = normalizeTableName(tableNameInput);
  const store = loadStore();
  store[tableName] = store[tableName] || [];
  const rows = Array.isArray(vals) ? vals : [vals];
  const insertedList: any[] = [];

  for (const sourceRow of rows) {
    let existingIndex = -1;
    const uniqueCandidateKeys = ['workId', 'assignmentId', 'otId', 'code', 'email', 'kpiId', 'notifyId', 'logId'];
    let targetKey: string | null = null;
    
    if (options?.conflictTarget) {
      const colObj = options.conflictTarget;
      if (colObj?.name) {
        targetKey = colObj.name.replace(/_([a-z])/g, (_: any, g: string) => g.toUpperCase());
      }
    }

    if (!targetKey) {
      for (const k of uniqueCandidateKeys) {
        if (sourceRow[k] !== undefined && sourceRow[k] !== null && String(sourceRow[k]).trim() !== '') {
          targetKey = k;
          break;
        }
      }
    }

    if (targetKey && sourceRow[targetKey] !== undefined && sourceRow[targetKey] !== null) {
      const valToMatch = String(sourceRow[targetKey]).trim().toLowerCase();
      existingIndex = store[tableName].findIndex((item: any) => {
        const itemVal = item[targetKey!];
        return itemVal !== undefined && itemVal !== null && String(itemVal).trim().toLowerCase() === valToMatch;
      });
    }

    if (existingIndex === -1 && sourceRow.id !== undefined && sourceRow.id !== null) {
      existingIndex = store[tableName].findIndex((item: any) => Number(item.id) === Number(sourceRow.id));
    }

    if (existingIndex >= 0) {
      if (options?.doNothing) {
        insertedList.push(store[tableName][existingIndex]);
      } else if (options?.doUpdateSet) {
        store[tableName][existingIndex] = {
          ...store[tableName][existingIndex],
          ...options.doUpdateSet,
          updatedAt: new Date().toISOString()
        };
        insertedList.push(store[tableName][existingIndex]);
      } else {
        store[tableName][existingIndex] = {
          ...store[tableName][existingIndex],
          ...sourceRow,
          updatedAt: new Date().toISOString()
        };
        insertedList.push(store[tableName][existingIndex]);
      }
    } else {
      const id = sourceRow.id !== undefined && sourceRow.id !== null
        ? Number(sourceRow.id)
        : (store[tableName].length > 0 ? Math.max(...store[tableName].map((x: any) => Number(x.id) || 0)) + 1 : 1);

      const newItem = {
        ...sourceRow,
        id,
        createdAt: sourceRow.createdAt || new Date().toISOString(),
        updatedAt: sourceRow.updatedAt || new Date().toISOString()
      };
      store[tableName].push(newItem);
      insertedList.push(newItem);
    }
  }

  if (!global._isInsideTransaction) {
    saveStore(store);
  }

  return insertedList;
}

const localJsonDbProxy = {
  transaction: async (callback: (tx: any) => Promise<any>) => {
    global._isInsideTransaction = true;
    try {
      const result = await callback(localJsonDbProxy);
      const store = loadStore();
      saveStore(store);
      return result;
    } finally {
      global._isInsideTransaction = false;
    }
  },
  execute: async () => ({ rows: [] }),
  query: new Proxy({}, {
    get(_, tableProp: string) {
      return createLocalQueryHandler(tableProp);
    }
  }),
  insert: (table: any) => {
    const tableName = normalizeTableName(getCollectionName(table));
    return {
      values: (vals: any) => ({
        returning: async () => performLocalUpsert(tableName, vals),
        onConflictDoNothing: () => ({
          returning: async () => performLocalUpsert(tableName, vals, { doNothing: true }),
          then: (resolve: any, reject: any) => Promise.resolve(performLocalUpsert(tableName, vals, { doNothing: true })).then(resolve, reject)
        }),
        onConflictDoUpdate: (config: any) => ({
          returning: async () => performLocalUpsert(tableName, vals, { conflictTarget: config?.target, doUpdateSet: config?.set }),
          then: (resolve: any, reject: any) => Promise.resolve(performLocalUpsert(tableName, vals, { conflictTarget: config?.target, doUpdateSet: config?.set })).then(resolve, reject)
        }),
        then: (resolve: any, reject: any) => Promise.resolve(performLocalUpsert(tableName, vals)).then(resolve, reject)
      })
    };
  },
  update: (table: any) => {
    const tableName = normalizeTableName(getCollectionName(table));
    return {
      set: (vals: any) => ({
        where: (cond: any) => {
          const store = loadStore();
          store[tableName] = store[tableName] || [];
          const updatedList: any[] = [];
          store[tableName] = store[tableName].map((item: any) => {
            if (matchesCondition(item, cond)) {
              const updated = { ...item, ...vals, updatedAt: new Date().toISOString() };
              updatedList.push(updated);
              return updated;
            }
            return item;
          });
          if (!global._isInsideTransaction) saveStore(store);
          return {
            returning: async () => updatedList,
            then: (resolve: any, reject: any) => Promise.resolve(updatedList).then(resolve, reject)
          };
        }
      })
    };
  },
  delete: (table: any) => {
    const tableName = normalizeTableName(getCollectionName(table));
    const executeDelete = (cond?: any) => {
      const store = loadStore();
      store[tableName] = store[tableName] || [];
      const remaining: any[] = [];
      const removed: any[] = [];
      for (const item of store[tableName]) {
        if (!cond || matchesCondition(item, cond)) {
          removed.push(item);
        } else {
          remaining.push(item);
        }
      }
      store[tableName] = remaining;
      if (!global._isInsideTransaction) saveStore(store);
      return removed;
    };
    return {
      where: (cond: any) => ({
        returning: async () => executeDelete(cond),
        then: (resolve: any, reject: any) => Promise.resolve(executeDelete(cond)).then(resolve, reject)
      }),
      returning: async () => executeDelete(),
      then: (resolve: any, reject: any) => Promise.resolve(executeDelete()).then(resolve, reject)
    };
  },
  select: () => ({
    from: (table: any) => {
      const tableName = normalizeTableName(getCollectionName(table));
      return {
        where: (cond: any) => {
          const store = loadStore();
          const items = (store[tableName] || []).filter((item: any) => matchesCondition(item, cond));
          return Promise.resolve(items);
        },
        then: (resolve: any) => {
          const store = loadStore();
          return Promise.resolve(store[tableName] || []).then(resolve);
        }
      };
    }
  })
};

// -----------------------------------------------------------------------------
// EXPORTED DB & POOL (FAIL-CLOSED IN PRODUCTION POSTGRES MODE)
// -----------------------------------------------------------------------------

function failClosedError(operationName?: string): Error {
  const op = operationName ? ` (${operationName})` : '';
  return new Error(
    `[Fail-Closed] Cơ sở dữ liệu Neon PostgreSQL chưa được kết nối${op}. ` +
    `Biến môi trường DATABASE_URL chưa được thiết lập trong Secrets của AI Studio. ` +
    `Ứng dụng đang hoạt động ở chế độ Production (STORAGE_MODE=postgres), do đó từ chối thao tác dữ liệu để bảo vệ tính toàn vẹn ` +
    `và ngăn chặn tạo ra hai nguồn dữ liệu không đồng bộ (không tự động fallback sang JSON). ` +
    `Vui lòng cấu hình DATABASE_URL trong Secrets để tiếp tục.`
  );
}

function createFailClosedProxy(path = 'db'): any {
  const targetFn = () => {
    throw failClosedError(path);
  };
  return new Proxy(targetFn, {
    get(_, prop: string | symbol) {
      if (prop === 'then') return undefined;
      return createFailClosedProxy(`${path}.${String(prop)}`);
    },
    apply() {
      throw failClosedError(path);
    }
  });
}

/**
 * Global pool export.
 * In Postgres mode, routes directly to pg.Pool. If DATABASE_URL is missing, fails closed.
 * In local-json mode, routes push settings/subscriptions to in-memory store.
 */
export const pool: any = new Proxy({}, {
  get(_, prop: string | symbol) {
    const mode = getStorageMode();

    if (mode === 'postgres') {
      const pgPool = getOrCreatePostgresPool();
      if (!pgPool) {
        if (prop === 'query' || prop === 'connect') {
          return async () => {
            throw failClosedError(String(prop));
          };
        }
        if (prop === 'on' || prop === 'end') {
          return () => {};
        }
        return undefined;
      }
      return (pgPool as any)[prop];
    }

    // Local JSON development fallback for pool
    if (prop === 'query') {
      return async (textOrConfig: any, values?: any[]) => {
        const sqlText = typeof textOrConfig === 'string' ? textOrConfig : textOrConfig?.text || '';
        const store = loadStore();

        if (/push_settings/i.test(sqlText)) {
          if (/SELECT/i.test(sqlText)) {
            return { rows: store.pushSettings || [] };
          }
          if (/INSERT/i.test(sqlText)) {
            if (values && values.length >= 3) {
              store.pushSettings = [{
                id: 1,
                vapid_public_key: values[0],
                vapid_private_key: values[1],
                subject: values[2]
              }];
              if (!global._isInsideTransaction) saveStore(store);
            }
            return { rows: store.pushSettings || [] };
          }
        }

        if (/push_subscriptions/i.test(sqlText)) {
          if (/SELECT COUNT/i.test(sqlText)) {
            const userId = values?.[0];
            const active = (store.pushSubscriptions || []).filter((s: any) => !userId || s.userId === userId);
            return { rows: [{ count: active.length }] };
          }
          if (/SELECT/i.test(sqlText)) {
            const userId = values?.[0];
            const subs = (store.pushSubscriptions || []).filter((s: any) => !userId || s.userId === userId);
            return { rows: subs };
          }
          if (/INSERT/i.test(sqlText)) {
            store.pushSubscriptions = store.pushSubscriptions || [];
            store.pushSubscriptions.push({
              id: Date.now(),
              userId: values?.[0],
              endpoint: values?.[1],
              p256dh: values?.[2],
              auth: values?.[3],
              deviceLabel: values?.[4],
              active: true
            });
            if (!global._isInsideTransaction) saveStore(store);
            return { rows: [] };
          }
          if (/UPDATE/i.test(sqlText)) {
            return { rows: [] };
          }
        }

        return { rows: [] };
      };
    }

    if (prop === 'connect') {
      return async () => ({
        query: async () => ({ rows: [] }),
        release: () => {},
      });
    }

    if (prop === 'on' || prop === 'end') {
      return () => {};
    }

    return undefined;
  }
});

/**
 * Global db export.
 * In Postgres mode, routes directly to real Drizzle instance (drizzle(pool, { schema })).
 * If DATABASE_URL is missing, fails closed! NEVER falls back to local JSON.
 * In local-json mode, routes to localJsonDbProxy.
 */
export const db: any = new Proxy({}, {
  get(_, prop: string | symbol) {
    if (prop === 'then') return undefined;

    const mode = getStorageMode();

    if (mode === 'postgres') {
      getOrCreatePostgresPool();
      if (!global._activeDrizzleDb) {
        return createFailClosedProxy(`db.${String(prop)}`);
      }
      return global._activeDrizzleDb[prop];
    }

    // Explicit local-json mode only
    return (localJsonDbProxy as any)[prop];
  }
});
