import { Router, Request, Response } from 'express';
import { 
  getDatabaseConfig, 
  testDatabaseConnection, 
  DatabaseConfig,
  parseConnectionString
} from './databaseStorage.ts';
import { db, pool, checkDatabaseHealth, getStorageMode, isPostgresConfigured } from '../src/db/index.ts';
import { works, users } from '../src/db/schema.ts';
import { requireSessionAuthenticated, requireStrictAdminSession } from './auth.ts';
import { 
  runMigrationDryRun, 
  executeMigrationToNeon,
  authenticateMigrationRequest,
  checkNeonTargetAdminStatus,
  maskEmail
} from './migrationService.ts';
import { getNeonBillingReminderStatus, acknowledgeNeonBilling } from './neonBillingService.ts';

export const databaseRouter = Router();

// GET /api/database/config
databaseRouter.get('/config', async (req: Request, res: Response) => {
  try {
    const config = await getDatabaseConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// GET /api/database/stats - Checks real SELECT 1, never fakes connection
databaseRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const health = await checkDatabaseHealth();
    
    if (!health.connected) {
      return res.status(503).json({
        success: false,
        error: health.error || 'Cơ sở dữ liệu Neon PostgreSQL chưa được kết nối hoặc thiếu DATABASE_URL.',
        data: {
          mode: health.storageMode === 'postgres' ? 'postgres' : 'local-json',
          storageMode: health.storageMode,
          provider: health.provider,
          status: 'error',
          connected: false,
          worksCount: 0,
          usersCount: 0,
          latencyMs: health.latencyMs || 0,
          lastSuccessfulCheck: health.lastSuccessfulCheck,
          error: health.error
        }
      });
    }

    let worksCount = 0;
    let usersCount = 0;

    try {
      if (health.storageMode === 'postgres') {
        const [wRes, uRes] = await Promise.all([
          pool.query('SELECT COUNT(*)::int as cnt FROM works'),
          pool.query('SELECT COUNT(*)::int as cnt FROM users')
        ]);
        worksCount = Number(wRes.rows[0]?.cnt || 0);
        usersCount = Number(uRes.rows[0]?.cnt || 0);
      } else {
        const { loadStore } = await import('../src/db/index.ts');
        const store = loadStore();
        worksCount = (store.works || []).length;
        usersCount = (store.users || []).length;
      }
    } catch (err) {
      console.warn('[DatabaseStats] Notice querying table counts:', err);
    }

    res.json({
      success: true,
      data: {
        mode: health.storageMode === 'postgres' ? 'postgres' : 'local-json',
        storageMode: health.storageMode,
        provider: health.provider,
        status: 'connected',
        connected: true,
        worksCount,
        usersCount,
        latencyMs: health.latencyMs,
        lastSuccessfulCheck: health.lastSuccessfulCheck,
        dbName: health.dbName,
        maskedHost: health.maskedHost
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || String(error),
      data: {
        mode: getStorageMode() === 'postgres' ? 'postgres' : 'local-json',
        storageMode: getStorageMode(),
        provider: 'postgres',
        status: 'error',
        connected: false,
        worksCount: 0,
        usersCount: 0,
        latencyMs: 0
      }
    });
  }
});

// POST /api/database/test - Strict Admin Only
databaseRouter.post('/test', requireStrictAdminSession, async (req: Request, res: Response) => {
  try {
    const inputConfig = req.body || {};
    const testResult = await testDatabaseConnection(inputConfig.connectionString);
    res.json({
      success: testResult.success,
      message: testResult.message,
      latencyMs: testResult.latencyMs,
      provider: testResult.provider
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || String(error) });
  }
});

// POST /api/database/config - Strict Admin Only
databaseRouter.post('/config', requireStrictAdminSession, async (req: Request, res: Response) => {
  try {
    const inputConfig = req.body || {};
    if (inputConfig.connectionString) {
      const testResult = await testDatabaseConnection(inputConfig.connectionString);
      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          error: `Không thể áp dụng cấu hình do kiểm tra kết nối thất bại: ${testResult.message}`
        });
      }
    }

    const currentConfig = await getDatabaseConfig();
    res.json({
      success: true,
      message: 'Để bảo vệ an toàn thông tin đăng nhập, chuỗi kết nối Neon PostgreSQL phải được thiết lập trong AI Studio Secrets (biến DATABASE_URL).',
      data: currentConfig
    });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// POST /api/database/migrate - Ensure schema (Strict Admin Only)
databaseRouter.post('/migrate', requireStrictAdminSession, async (req: Request, res: Response) => {
  try {
    const { ensureDatabaseSchema } = await import('./dbMigrate.ts');
    const result = await ensureDatabaseSchema();
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error?.message || String(error)) });
  }
});

// GET /api/database/target-admin-status - Real-time status of target database admin & bootstrap eligibility
databaseRouter.get('/target-admin-status', async (_req: Request, res: Response) => {
  try {
    const status = await checkNeonTargetAdminStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

function sanitizeErrorMessage(msg: string): string {
  if (!msg) return 'Lỗi hệ thống';
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[REDACTED_CONNECTION_STRING]')
    .replace(/password\s*=\s*[^\s'"]+/gi, 'password=[REDACTED]')
    .replace(/(?:vapid[_-]?private[_-]?key|[a-zA-Z0-9_-]{43}=)/gi, '[REDACTED_KEY]');
}

// POST /api/database/migrate-from-json - Admin Data Migration Tool (Dry Run & Atomic Execution)
// Uses authenticateMigrationRequest: strictly requires ADMIN password in all cases; enables secure bootstrap when Neon has no ADMIN yet; auto-disables bootstrap once Neon has an ADMIN.
databaseRouter.post('/migrate-from-json', authenticateMigrationRequest, async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    const authMode = (req as any).migrationAuthMode;
    const targetState = (req as any).targetState;

    if (!authUser || authUser.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Từ chối truy cập: Chỉ Quản trị viên cấp cao (ADMIN) mới có quyền sử dụng công cụ di chuyển dữ liệu.'
      });
    }

    const dryRun = req.body?.dryRun !== false; // defaults to true
    if (dryRun) {
      const dryRunResult = await runMigrationDryRun(authUser);
      return res.json({
        ...dryRunResult,
        authMode,
        adminUser: { name: authUser.name, maskedIdentifier: maskEmail(authUser.email) },
        targetState: dryRunResult.targetState || targetState
      });
    }

    const { adminPassword, preflightToken } = req.body || {};
    const executionResult = await executeMigrationToNeon(adminPassword, authUser, preflightToken);
    return res.json({
      ...executionResult,
      authMode,
      adminUser: { name: authUser.name, maskedIdentifier: maskEmail(authUser.email) }
    });
  } catch (error: any) {
    const rawMsg = error?.message || String(error);
    const sanitizedMsg = sanitizeErrorMessage(rawMsg);
    console.error('[MigrationRoute] Error:', sanitizedMsg);
    let statusCode = 500;
    if (rawMsg.includes('preflightToken') || rawMsg.includes('Mã xác thực Dry Run') || rawMsg.includes('RECOVERY_REQUIRED') || rawMsg.includes('Token Dry Run được cấp cho Quản trị viên khác')) {
      statusCode = 403;
    } else if (rawMsg.includes('đã thay đổi sau khi đối soát')) {
      statusCode = 409;
    }
    res.status(statusCode).json({ success: false, error: sanitizedMsg });
  }
});

// GET /api/database/neon-billing-reminder - Billing check status (25th to month-end)
databaseRouter.get('/neon-billing-reminder', async (_req: Request, res: Response) => {
  try {
    const status = getNeonBillingReminderStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

// POST /api/database/neon-billing-reminder/ack - Admin acknowledgment
databaseRouter.post('/neon-billing-reminder/ack', requireStrictAdminSession, async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    if (!authUser || authUser.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Chỉ Quản trị viên cấp cao (ADMIN) mới có quyền xác nhận kiểm tra hóa đơn.'
      });
    }

    const period = req.body?.period;
    const updated = acknowledgeNeonBilling(period, authUser);
    res.json({
      success: true,
      message: `Đã xác nhận kiểm tra hóa đơn Neon tháng ${updated.currentPeriod}.`,
      data: updated
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

// GET /api/database/cleanup-preview
databaseRouter.get('/cleanup-preview', requireStrictAdminSession, async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    if (!authUser || authUser.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Từ chối truy cập: Chỉ Quản trị viên cấp cao (ADMIN) mới có quyền truy cập chức năng dọn dẹp dữ liệu.'
      });
    }

    const scope = (req.query.scope as string) || 'period';
    const targetMonth = (req.query.targetMonth as string) || '';

    if (scope !== 'period' && scope !== 'factory_reset') {
      return res.status(400).json({
        success: false,
        error: 'Phạm vi dọn dẹp không hợp lệ. Chỉ chấp nhận "period" hoặc "factory_reset".'
      });
    }

    const { computeCleanupTargetRecords, isCleanupLocked, normalizeKpiMonth, formatMonthToYyyyMm, loadCleanupStoreFromActiveDatabase } = await import('./cleanupService.ts');

    if (scope === 'period') {
      const canonicalTarget = normalizeKpiMonth(targetMonth);
      if (!canonicalTarget) {
        return res.status(400).json({
          success: false,
          error: 'Kỳ KPI không hợp lệ. Vui lòng nhập định dạng YYYY-MM hoặc MM-YYYY hợp lệ (Ví dụ: 2026-10 hoặc 10-2026).'
        });
      }
    }

    const store = await loadCleanupStoreFromActiveDatabase();

    // Get list of existing months for user dropdown selection (formatted as YYYY-MM for HTML input type="month")
    const allWorks = store.works || [];
    const allAssignments = store.assignments || [];
    const allOvertimes = store.overtimes || [];
    const allKpiResults = store.kpiResults || [];

    const monthSet = new Set<string>();
    allWorks.forEach((w: any) => w.month && monthSet.add(String(w.month).trim()));
    allAssignments.forEach((a: any) => a.month && monthSet.add(String(a.month).trim()));
    allOvertimes.forEach((o: any) => o.month && monthSet.add(String(o.month).trim()));
    allKpiResults.forEach((k: any) => k.month && monthSet.add(String(k.month).trim()));

    const availableMonthsSet = new Set<string>();
    monthSet.forEach((m) => {
      const yyyyMm = formatMonthToYyyyMm(m);
      if (yyyyMm) availableMonthsSet.add(yyyyMm);
    });
    const availableMonths = Array.from(availableMonthsSet).sort().reverse();

    const selectedMonth = scope === 'period' ? targetMonth : (availableMonths.length > 0 ? availableMonths[0] : new Date().toISOString().slice(0, 7));
    const plan = computeCleanupTargetRecords(store, scope as any, scope === 'period' ? selectedMonth : undefined);

    res.json({
      success: true,
      data: {
        scope,
        targetMonth: scope === 'period' ? selectedMonth : undefined,
        counts: plan.counts,
        availableMonths,
        lockStatus: isCleanupLocked(),
        usersCount: (store.users || []).length,
        categoriesCount: (store.categories || []).length
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

// POST /api/database/clean
databaseRouter.post('/clean', requireStrictAdminSession, async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    if (!authUser || authUser.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Từ chối truy cập: Chỉ Quản trị viên cấp cao (ADMIN) mới có quyền thực thi dọn dẹp cơ sở dữ liệu.'
      });
    }

    const { scope, targetMonth, expectedCounts, adminPassword, confirmText } = req.body;

    if (scope !== 'period' && scope !== 'factory_reset') {
      return res.status(400).json({
        success: false,
        error: 'Phạm vi dọn dẹp không hợp lệ. Chỉ chấp nhận "period" hoặc "factory_reset".'
      });
    }

    const { normalizeKpiMonth } = await import('./cleanupService.ts');

    if (scope === 'period') {
      const canonicalTarget = normalizeKpiMonth(targetMonth);
      if (!canonicalTarget) {
        return res.status(400).json({
          success: false,
          error: 'Kỳ KPI không hợp lệ. Vui lòng nhập định dạng YYYY-MM hoặc MM-YYYY hợp lệ (Ví dụ: 2026-10 hoặc 10-2026).'
        });
      }
    }

    if (confirmText !== 'XOA DU LIEU') {
      return res.status(400).json({
        success: false,
        error: 'Cụm từ xác nhận không chính xác. Bạn phải gõ chính xác: XOA DU LIEU'
      });
    }

    if (scope === 'period') {
      if (!expectedCounts || typeof expectedCounts !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Thiếu số lượng bản ghi đối soát (expectedCounts). Vui lòng xem trước số liệu trước khi thực thi.'
        });
      }
    }

    const { executeDataCleanup } = await import('./cleanupService.ts');
    const { getClientIp } = await import('./onlineTracker.ts');
    const clientIp = getClientIp(req);

    const auditReport = await executeDataCleanup({
      adminUser: authUser,
      scope,
      targetMonth: scope === 'period' ? targetMonth : undefined,
      expectedCounts: scope === 'period' ? expectedCounts : undefined,
      adminPassword,
      clientIp
    });

    res.json({
      success: true,
      message: scope === 'period' 
        ? `Đã dọn dẹp an toàn kỳ KPI ${targetMonth} thành công!` 
        : 'Đã làm sạch toàn bộ dữ liệu nghiệp vụ (giữ nguyên Người dùng & Danh mục) thành công!',
      auditReport
    });
  } catch (error: any) {
    console.error('[DatabaseClean] Error:', error?.message || error);
    res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});
