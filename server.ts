import express from "express";
import webPushModule from "web-push";
import path from "path";
import { createServer as createViteServer } from "vite";
import { db, pool } from "./src/db/index.ts";
import { users, works, assignments, notifications, overtimes, categories } from "./src/db/schema.ts";
import { eq, desc, asc, and, or } from "drizzle-orm";
import { authRouter, requireSessionAuthenticated } from "./server/auth.ts";
import { kpiRouter, calculateAndSaveUserKpi } from "./server/kpiRoutes.ts";
import { syncRouter } from "./server/syncRoutes.ts";
import { onlineRouter } from "./server/onlineRoutes.ts";
import { databaseRouter } from "./server/databaseRoutes.ts";
import { backupRouter } from "./server/backupRoutes.ts";
import { startBackupScheduler } from "./server/backupService.ts";
import { ensureDatabaseSchema } from "./server/dbMigrate.ts";
import { runSeeder } from "./server/seeder.ts";
import { 
  getZaloConfig, 
  saveZaloConfig, 
  sendZaloNotification, 
  formatZaloMessage, 
  DEFAULT_ZALO_TEMPLATE 
} from "./server/zaloService.ts";


const webpush: any = (webPushModule as any).default || webPushModule;

type PushPayload = { title: string; body: string; url: string; assignmentId?: string; tag?: string };

const PUSH_SW_SOURCE = "self.addEventListener('push', function(event) {\n  var data = {};\n  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }\n  event.waitUntil(self.registration.showNotification(data.title || 'Thông báo giao việc', {\n    body: data.body || 'Bạn có nhiệm vụ mới.',\n    icon: '/push-icon.svg',\n    badge: '/push-icon.svg',\n    tag: data.tag || ('assignment-' + (data.assignmentId || Date.now())),\n    renotify: true,\n    data: { url: data.url || '/my-works', assignmentId: data.assignmentId || null }\n  }));\n});\nself.addEventListener('notificationclick', function(event) {\n  event.notification.close();\n  var target = (event.notification.data && event.notification.data.url) || '/my-works';\n  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {\n    for (var i = 0; i < list.length; i++) {\n      if ('focus' in list[i]) { list[i].navigate(target); return list[i].focus(); }\n    }\n    if (clients.openWindow) return clients.openWindow(target);\n  }));\n});";

async function getVapidSettings() {
  const existing = await pool.query('SELECT vapid_public_key, vapid_private_key, subject FROM push_settings WHERE id = 1');
  if (existing.rows[0]) return existing.rows[0];
  const generated = webpush.generateVAPIDKeys();
  await pool.query(
    `INSERT INTO push_settings (id, vapid_public_key, vapid_private_key, subject)
     VALUES (1, $1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [generated.publicKey, generated.privateKey, 'mailto:admin@kpi.internal']
  );
  const current = await pool.query('SELECT vapid_public_key, vapid_private_key, subject FROM push_settings WHERE id = 1');
  if (!current.rows[0]) throw new Error('Không thể khởi tạo khóa Web Push');
  return current.rows[0];
}

async function sendPushToUser(userId: number, payload: PushPayload) {
  try {
    const settings = await getVapidSettings();
    webpush.setVapidDetails(settings.subject, settings.vapid_public_key, settings.vapid_private_key);
    const subscriptions = await pool.query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1 AND active = TRUE',
      [userId]
    );
    let sent = 0;
    let failed = 0;
    await Promise.all(subscriptions.rows.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 86400, urgency: 'high' }
        );
        sent += 1;
        await pool.query('UPDATE push_subscriptions SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1', [sub.id]);
      } catch (error: any) {
        failed += 1;
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await pool.query('UPDATE push_subscriptions SET active = FALSE, updated_at = NOW() WHERE id = $1', [sub.id]);
        }
        console.warn('Web Push delivery notice:', error?.message || error);
      }
    }));
    console.log('[WebPush] user=' + userId + ' attempted=' + subscriptions.rows.length + ' sent=' + sent + ' failed=' + failed);
    return { attempted: subscriptions.rows.length, sent, failed };
  } catch (error: any) {
    console.warn('Web Push skipped; assignment remains saved:', error?.message || error);
    return { attempted: 0, sent: 0, failed: 1, error: error?.message || String(error) };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  app.get('/manifest.webmanifest', (_req, res) => {
    res.type('application/manifest+json').send({
      name: 'Hệ thống Quản lý Công việc và Đánh giá KPI',
      short_name: 'KPI KHTC',
      start_url: '/',
      display: 'standalone',
      background_color: '#f1f5f9',
      theme_color: '#1F4E78',
      icons: [{ src: '/push-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
    });
  });

  app.get('/push-icon.svg', (_req, res) => {
    res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#1F4E78"/><path d="M64 22a30 30 0 0 0-30 30v19L23 87h82L94 71V52a30 30 0 0 0-30-30Zm0 88a16 16 0 0 0 15-11H49a16 16 0 0 0 15 11Z" fill="white"/></svg>');
  });

  app.get('/push-sw.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('application/javascript').send(PUSH_SW_SOURCE);
  });

  app.get('/api/push/public-key', requireSessionAuthenticated, async (req, res) => {
    try {
      const settings = await getVapidSettings();
      const userId = (req as any).authUser.id;
      const status = await pool.query('SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1 AND active = TRUE', [userId]);
      res.json({ success: true, publicKey: settings.vapid_public_key, subscribed: Number(status.rows[0]?.count || 0) > 0 });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  });

  app.post('/api/push/subscribe', requireSessionAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).authUser.id;
      const { endpoint, keys, deviceLabel } = req.body || {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ success: false, message: 'Thông tin đăng ký thiết bị không hợp lệ.' });
      }
      await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device_label, active, last_seen_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
         ON CONFLICT (endpoint) DO UPDATE SET
           user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
           device_label = EXCLUDED.device_label, active = TRUE, last_seen_at = NOW(), updated_at = NOW()`,
        [userId, String(endpoint), String(keys.p256dh), String(keys.auth), String(deviceLabel || req.headers['user-agent'] || 'Thiết bị')]
      );
      res.json({ success: true, message: 'Đã bật thông báo giao việc trên thiết bị này.' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  });

  app.post('/api/push/test', requireSessionAuthenticated, async (req, res) => {
    try {
      const user = (req as any).authUser;
      const delivery = await sendPushToUser(Number(user.id), {
        title: 'Kiểm tra thông báo giao việc',
        body: 'Thiết bị này đã nhận Web Push thành công.',
        url: '/my-works',
        tag: 'push-test-' + user.id + '-' + Date.now()
      });
      res.json({
        success: delivery.sent > 0,
        delivery,
        message: delivery.sent > 0
          ? 'Đã gửi thử thành công tới ' + delivery.sent + '/' + delivery.attempted + ' thiết bị.'
          : delivery.attempted === 0
            ? 'Tài khoản chưa có thiết bị đăng ký nhận thông báo.'
            : 'Máy chủ đã thử gửi nhưng thiết bị từ chối hoặc endpoint đã hết hạn.'
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  });

  app.delete('/api/push/unsubscribe', requireSessionAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).authUser.id;
      const endpoint = String(req.body?.endpoint || '');
      if (endpoint) {
        await pool.query('UPDATE push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
      } else {
        await pool.query('UPDATE push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = $1', [userId]);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  });


  // Migrate schema and seed data on startup
  setTimeout(async () => {
    try {
      const migResult = await ensureDatabaseSchema();
      console.log("Schema sync result:", migResult);
      const seedResult = await runSeeder();
      console.log("Init seed result:", seedResult);
      startBackupScheduler();
    } catch (e) {
      console.error("Startup migration/seed error:", e);
    }
  }, 200);

  // --- API Routes ---

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Seeder endpoint
  app.get("/api/seed", async (req, res) => {
    const result = await runSeeder();
    res.json(result);
  });

  // Auth Router
  app.use("/api/auth", authRouter);

  // Database Router
  app.use("/api/database", databaseRouter);

  // Backup & Disaster Recovery Router
  app.use("/api/backups", backupRouter);

  // KPI Router
  app.use("/api/kpi", kpiRouter);

  // System & Org Config route aliases for convenience
  app.get("/api/system-config", (req, res, next) => {
    req.url = '/org-config';
    kpiRouter(req, res, next);
  });
  app.post("/api/system-config", (req, res, next) => {
    req.url = '/org-config';
    kpiRouter(req, res, next);
  });
  app.post("/api/system-config/reset", (req, res, next) => {
    req.url = '/org-config/reset';
    kpiRouter(req, res, next);
  });
  app.get("/api/org-config", (req, res, next) => {
    req.url = '/org-config';
    kpiRouter(req, res, next);
  });
  app.post("/api/org-config", (req, res, next) => {
    req.url = '/org-config';
    kpiRouter(req, res, next);
  });
  app.post("/api/org-config/reset", (req, res, next) => {
    req.url = '/org-config/reset';
    kpiRouter(req, res, next);
  });

  // KPI Config route aliases for compatibility
  app.get("/api/kpi-config", (req, res, next) => {
    req.url = '/config';
    kpiRouter(req, res, next);
  });
  app.post("/api/kpi-config", (req, res, next) => {
    req.url = '/config';
    kpiRouter(req, res, next);
  });
  app.post("/api/kpi-config/reset", (req, res, next) => {
    req.url = '/config/reset';
    kpiRouter(req, res, next);
  });
  app.post("/api/kpi-config/recalculate-all", (req, res, next) => {
    req.url = '/recalculate-all';
    kpiRouter(req, res, next);
  });

  // 1. Works APIs
  app.get("/api/works", async (req, res) => {
    try {
      const allWorks = await db.query.works.findMany({
        with: { user: true },
        orderBy: (w, { desc }) => [desc(w.createdAt)],
      });
      res.json({ success: true, data: allWorks });
    } catch (error) {
      console.error("Error fetching works:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/works", async (req, res) => {
    try {
      const p = req.body;
      let user = null;
      if (p.userId) {
        user = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.id, Number(p.userId)),
        });
      }
      if (!user && p.userEmail) {
        user = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.email, String(p.userEmail)),
        });
      }
      if (!user && p.userName) {
        user = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.name, String(p.userName)),
        });
      }
      const userId = user ? user.id : (p.userId ? Number(p.userId) : 1);

      const newWork = await db.insert(works).values({
        workId: p.workId || `W8-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        month: p.month || "08-2026",
        userId: userId,
        taskGroup: p.taskGroup || p.group,
        taskName: p.taskName || p.task,
        taskCode: p.taskCode || p.code,
        detail: p.detail,
        startDate: p.startDate ? new Date(p.startDate) : null,
        startTime: p.startTime || "07:30",
        endDate: p.endDate ? new Date(p.endDate) : null,
        endTime: p.endTime || "17:00",
        actualEndDate: p.actualEndDate ? new Date(p.actualEndDate) : null,
        hours: String(p.hours || "8"),
        days: parseInt(p.days || "1"),
        proposedNature: p.proposedNature || p.nature || "Trung bình",
        approvedNature: p.approvedNature || "",
        coef: String(p.coef || "0.8"),
        baseScore: String(p.baseScore || p.score || "10"),
        convertedScore: String(p.convertedScore || p.selfConvertedScore || "8"),
        selfConvertedScore: String(p.selfConvertedScore || p.convertedScore || "8"),
        approvedConvertedScore: p.approvedConvertedScore ? String(p.approvedConvertedScore) : (p.leaderApproval === 'Duyệt' ? String(p.convertedScore || p.selfConvertedScore || "8") : null),
        status: p.status || "Đang xử lý",
        evidence: p.evidence || "",
        productType: p.productType || "Báo cáo",
        productQty: parseInt(p.productQty || "1"),
        unit: p.unit || "Sản phẩm",
        project: p.project || "",
        relatedUnit: p.relatedUnit || "",
        lateReason: p.lateReason || "",
        penaltyExemption: p.penaltyExemption || "Không",
        editNote: p.editNote || "",
        leaderApproval: p.leaderApproval || "Chưa duyệt",
        leaderNote: p.leaderNote || "",
        source: p.source || "WEBAPP",
      }).returning();

      res.json({ success: true, data: newWork[0], message: "Đã lưu công việc thành công!" });
    } catch (error) {
      console.error("Error creating work:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.put("/api/works/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const p = req.body;
      const updateData: any = { updatedAt: new Date() };

      if (p.userId !== undefined) updateData.userId = parseInt(p.userId);
      if (p.taskGroup !== undefined) updateData.taskGroup = p.taskGroup;
      if (p.taskName !== undefined) updateData.taskName = p.taskName;
      if (p.taskCode !== undefined) updateData.taskCode = p.taskCode;
      if (p.detail !== undefined) updateData.detail = p.detail;
      if (p.startDate !== undefined) updateData.startDate = p.startDate ? new Date(p.startDate) : null;
      if (p.startTime !== undefined) updateData.startTime = p.startTime;
      if (p.endDate !== undefined) updateData.endDate = p.endDate ? new Date(p.endDate) : null;
      if (p.endTime !== undefined) updateData.endTime = p.endTime;
      if (p.actualEndDate !== undefined) updateData.actualEndDate = p.actualEndDate ? new Date(p.actualEndDate) : null;
      if (p.hours !== undefined) updateData.hours = String(p.hours);
      if (p.days !== undefined) updateData.days = parseInt(p.days);
      if (p.status !== undefined) updateData.status = p.status;
      if (p.evidence !== undefined) updateData.evidence = p.evidence;
      if (p.productType !== undefined) updateData.productType = p.productType;
      if (p.productQty !== undefined) updateData.productQty = parseInt(p.productQty);
      if (p.unit !== undefined) updateData.unit = p.unit;
      if (p.project !== undefined) updateData.project = p.project;
      if (p.relatedUnit !== undefined) updateData.relatedUnit = p.relatedUnit;
      if (p.proposedNature !== undefined) updateData.proposedNature = p.proposedNature;
      if (p.approvedNature !== undefined) updateData.approvedNature = p.approvedNature;
      if (p.coef !== undefined) updateData.coef = String(p.coef);
      if (p.baseScore !== undefined) updateData.baseScore = String(p.baseScore);

      if (p.approvedConvertedScore !== undefined && p.approvedConvertedScore !== null) {
        // Chỉ xử lý nhánh điểm duyệt khi approvedConvertedScore khác undefined và khác null
        updateData.approvedConvertedScore = String(p.approvedConvertedScore);
        updateData.convertedScore = String(p.approvedConvertedScore);
      } else if (p.convertedScore !== undefined) {
        // Nếu approvedConvertedScore là null hoặc undefined và có convertedScore: cập nhật selfConvertedScore và convertedScore
        updateData.convertedScore = String(p.convertedScore);
        updateData.selfConvertedScore = String(p.convertedScore);
        if (p.approvedConvertedScore === null) {
          updateData.approvedConvertedScore = null;
        }
      } else {
        if (p.selfConvertedScore !== undefined) {
          updateData.selfConvertedScore = p.selfConvertedScore !== null ? String(p.selfConvertedScore) : null;
        }
        if (p.approvedConvertedScore === null) {
          updateData.approvedConvertedScore = null;
        }
      }

      if (p.leaderApproval !== undefined) updateData.leaderApproval = p.leaderApproval;
      if (p.leaderNote !== undefined) updateData.leaderNote = p.leaderNote;
      if (p.approverId !== undefined) updateData.approverId = p.approverId ? parseInt(p.approverId) : null;
      if (p.approvalDate !== undefined) updateData.approvalDate = p.approvalDate ? new Date(p.approvalDate) : null;
      if (p.lateReason !== undefined) updateData.lateReason = p.lateReason;
      if (p.penaltyExemption !== undefined) updateData.penaltyExemption = p.penaltyExemption;
      if (p.editNote !== undefined) updateData.editNote = p.editNote;
      if (p.month !== undefined) updateData.month = p.month;
      if (p.dataStatus !== undefined) updateData.dataStatus = p.dataStatus;
      if (p.sysNote !== undefined) updateData.sysNote = p.sysNote;

      const updated = await db.update(works).set(updateData).where(eq(works.id, id)).returning();
      const updatedWork = updated[0];

      // Tự động tính lại KPI đúng nhân viên và tháng của công việc khi dữ liệu duyệt hoặc điểm quy đổi thay đổi
      if (updatedWork && updatedWork.userId) {
        const isRelevantChange = 
          p.leaderApproval !== undefined ||
          p.approvedConvertedScore !== undefined ||
          p.convertedScore !== undefined ||
          p.selfConvertedScore !== undefined ||
          p.approvedNature !== undefined ||
          p.proposedNature !== undefined ||
          p.coef !== undefined ||
          p.baseScore !== undefined ||
          p.hours !== undefined ||
          p.days !== undefined ||
          p.status !== undefined ||
          p.dataStatus !== undefined ||
          p.month !== undefined ||
          p.userId !== undefined;

        if (isRelevantChange) {
          const targetUser = await db.query.users.findFirst({
            where: eq(users.id, updatedWork.userId)
          });
          if (targetUser) {
            try {
              const targetMonth = updatedWork.month || "08-2026";
              await calculateAndSaveUserKpi(targetUser, targetMonth);
            } catch (kpiErr) {
              console.error("Error auto recalculating KPI for user after work update:", kpiErr);
            }
          }
        }
      }

      res.json({ success: true, data: updatedWork, message: "Đã cập nhật công việc thành công!" });
    } catch (error) {
      console.error("Error updating work:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete("/api/works/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await db.update(works).set({
        dataStatus: "Đã xóa mềm",
        sysNote: `Xóa mềm lúc ${new Date().toISOString()}`,
        updatedAt: new Date(),
      }).where(eq(works.id, id)).returning();
      res.json({ success: true, data: updated[0], message: "Đã xóa mềm công việc thành công!" });
    } catch (error) {
      console.error("Error deleting work:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // 2. Users APIs
  app.get("/api/users", async (req, res) => {
    try {
      const allUsers = await db.query.users.findMany({
        orderBy: (u, { asc }) => [asc(u.name)],
      });
      res.json({ success: true, data: allUsers });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const p = req.body;
      const newUser = await db.insert(users).values({
        name: p.name,
        email: p.email || `${Date.now()}@kpi.local`,
        phone: p.phone,
        zalo: p.zalo,
        position: p.position || "Chuyên viên",
        group: p.group || "Nhân viên",
        role: p.role || "STAFF",
        status: p.status || "Đang làm",
        permissions: p.permissions || "",
      }).onConflictDoUpdate({
        target: users.email,
        set: {
          name: p.name,
          phone: p.phone,
          zalo: p.zalo,
          position: p.position,
          group: p.group,
          role: p.role,
          status: p.status,
          permissions: p.permissions,
          updatedAt: new Date(),
        },
      }).returning();
      res.json({ success: true, data: newUser[0], message: "Đã lưu người dùng!" });
    } catch (error) {
      console.error("Error creating/updating user:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const p = req.body;
      const updated = await db.update(users).set({
        name: p.name,
        email: p.email,
        phone: p.phone,
        zalo: p.zalo,
        position: p.position,
        group: p.group,
        role: p.role,
        status: p.status,
        permissions: p.permissions,
        updatedAt: new Date(),
      }).where(eq(users.id, id)).returning();
      res.json({ success: true, data: updated[0], message: "Đã cập nhật người dùng!" });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(users).where(eq(users.id, id));
      res.json({ success: true, message: "Đã xóa nhân sự" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // --- Zalo Integration APIs ---
  app.get("/api/zalo/config", (req, res) => {
    try {
      const config = getZaloConfig();
      res.json({ success: true, data: config });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  app.post("/api/zalo/config", (req, res) => {
    try {
      const saved = saveZaloConfig(req.body);
      if (saved) {
        res.json({ success: true, message: "Đã lưu cấu hình Zalo thành công!", data: getZaloConfig() });
      } else {
        res.status(500).json({ success: false, error: "Không thể lưu cấu hình Zalo" });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  app.post("/api/zalo/send", async (req, res) => {
    try {
      const params = req.body;
      const result = await sendZaloNotification(params);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || String(err) });
    }
  });

  app.post("/api/zalo/test", async (req, res) => {
    try {
      const { phone, name, customMessage } = req.body;
      const config = getZaloConfig();
      const testResult = await sendZaloNotification({
        receiverName: name || "Cán bộ thử nghiệm",
        receiverPhone: phone || config.senderPhone || "0988888888",
        assignerName: config.senderName || "Lãnh đạo Phòng",
        taskName: "Nhiệm vụ thử nghiệm kết nối Zalo",
        taskCode: "TEST-01",
        taskGroup: "Thử nghiệm hệ thống",
        score: 10,
        coef: 1.0,
        deadline: new Date().toLocaleDateString("vi-VN"),
        leaderNote: customMessage || "Kiểm tra tính năng phát thông báo Zalo 1-Chạm hoạt động hoàn hảo",
        role: "Chủ trì"
      });
      res.json(testResult);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || String(err) });
    }
  });

  // 3. Assignments APIs
  app.get("/api/assignments", async (req, res) => {
    try {
      const all = await db.query.assignments.findMany({
        with: {
          assigner: true,
          receiver: true,
          work: true,
        },
        orderBy: (a, { desc }) => [desc(a.assignDate)],
      });
      res.json({ success: true, data: all });
    } catch (error) {
      console.error("Error fetching assignments:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/assignments", async (req, res) => {
    try {
      const p = req.body;
      let assigner = null;
      if (p.assignerId) {
        assigner = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.id, Number(p.assignerId)),
        });
      }
      if (!assigner && p.assignerEmail) {
        assigner = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.email, String(p.assignerEmail)),
        });
      }
      if (!assigner && p.assignerName) {
        assigner = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.name, String(p.assignerName)),
        });
      }
      const assignerId = assigner ? assigner.id : (p.assignerId ? Number(p.assignerId) : 1);
      const assignerName = assigner ? assigner.name : (p.assignerName || "Lãnh đạo Phòng");

      // Check if multi-receiver payload is provided
      const receiversList: Array<{ userId: number; userName?: string; userEmail?: string; userPhone?: string; role?: string; coef?: number }> = 
        (Array.isArray(p.receivers) && p.receivers.length > 0)
          ? p.receivers
          : [{ userId: p.receiverId || 1, userName: p.receiverName, userEmail: p.receiverEmail, userPhone: p.receiverPhone, role: p.role || "Chủ trì", coef: Number(p.suggestedCoef || 0.8) }];

      const createdAssignments: any[] = [];
      const zaloResults: any[] = [];
      const pushResults: any[] = [];

      for (const rec of receiversList) {
        let receiverUser = null;
        if (rec.userId) {
          receiverUser = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, Number(rec.userId)),
          });
        }
        if (!receiverUser && rec.userEmail) {
          receiverUser = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.email, String(rec.userEmail)),
          });
        }
        if (!receiverUser && rec.userName) {
          receiverUser = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.name, String(rec.userName)),
          });
        }

        const effectiveReceiverId = receiverUser ? receiverUser.id : (rec.userId ? Number(rec.userId) : 1);
        const effectiveReceiverName = receiverUser ? receiverUser.name : (rec.userName || "Cán bộ");
        const effectiveReceiverPhone = receiverUser ? receiverUser.phone : rec.userPhone;

        const role = rec.role || "Chủ trì";
        const coef = rec.coef !== undefined ? String(rec.coef) : String(p.suggestedCoef || "0.8");
        const baseScore = String(p.baseScore || p.score || "10");
        const expectedConvertedScore = String(Math.round(Number(baseScore) * Number(coef) * Number(p.productQty || 1) * 10) / 10);

        const newAssignment = await db.transaction(async (tx) => {
          const inserted = await tx.insert(assignments).values({
          assignmentId: `A8-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          month: p.month || "08-2026",
          assignerId: assignerId,
          receiverId: effectiveReceiverId,
          taskGroup: p.taskGroup || p.group,
          taskName: p.taskName || p.task,
          taskCode: p.taskCode || p.code,
          baseScore: baseScore,
          suggestedNature: p.suggestedNature || p.nature || "Trung bình",
          suggestedCoef: coef,
          expectedConvertedScore: expectedConvertedScore,
          detail: p.detail || "",
          startDate: p.startDate ? new Date(p.startDate) : new Date(),
          deadline: p.deadline ? new Date(p.deadline) : new Date(),
          productRequired: p.productRequired || "",
          productType: p.productType || "Báo cáo",
          productQty: parseInt(p.productQty || "1"),
          unit: p.unit || "Sản phẩm",
          priority: p.priority || "Bình thường",
          receiveStatus: "Chờ nhận việc",
          leaderNote: `${role === "Phối hợp" ? "[Phối hợp] " : ""}${p.note || p.leaderNote || ""}`.trim(),
          }).returning();

          // Assignment and internal notification are committed atomically.
          await tx.insert(notifications).values({
          notifyId: `N-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: assignerId,
          receiverId: effectiveReceiverId,
          type: "Giao việc",
          title: `Lãnh đạo giao nhiệm vụ (${role}): ${p.taskName || p.task || ""}`,
          content: `[${p.taskCode || "NV"}] ${p.taskName || p.task || ""} - Vai trò: ${role} - Hạn chót: ${p.deadline ? new Date(p.deadline).toLocaleDateString("vi-VN") : "Trong tháng"}`,
          relatedTarget: inserted[0].assignmentId,
          status: "Chưa xem",
          }).onConflictDoNothing();
          return inserted;
        });

        createdAssignments.push(newAssignment[0]);

        // External notification runs only after the database transaction commits.
        const pushResult = await sendPushToUser(effectiveReceiverId, {
          title: `Nhiệm vụ mới: ${p.taskName || p.task || ""}`,
          body: `[${p.taskCode || "NV"}] Vai trò: ${role}. Hạn: ${p.deadline ? new Date(p.deadline).toLocaleDateString("vi-VN") : "Trong tháng"}`,
          url: `/my-works?assignmentId=${encodeURIComponent(newAssignment[0].assignmentId)}`,
          assignmentId: newAssignment[0].assignmentId,
          tag: `assignment-${newAssignment[0].assignmentId}`
        });
        pushResults.push({ receiverId: effectiveReceiverId, ...pushResult });

        // If Flow 2 (Auto Send Zalo requested)
        if (p.sendZalo || p.flow === 'zalo' || p.sendZaloDirect) {
          const zaloRes = await sendZaloNotification({
            receiverName: effectiveReceiverName,
            receiverPhone: effectiveReceiverPhone,
            assignerName: assignerName,
            taskName: p.taskName || p.task,
            taskCode: p.taskCode || p.code,
            taskGroup: p.taskGroup || p.group,
            score: baseScore,
            coef: coef,
            productRequired: p.productRequired || p.productType,
            deadline: p.deadline ? new Date(p.deadline).toLocaleDateString("vi-VN") : "Theo hạn chót",
            leaderNote: p.note || p.leaderNote || "Thực hiện đúng tiến độ",
            role: role
          });
          zaloResults.push({ receiverId: effectiveReceiverId, name: effectiveReceiverName, phone: effectiveReceiverPhone, zalo: zaloRes });
        }
      }

      res.json({ 
        success: true, 
        data: createdAssignments[0], 
        all: createdAssignments, 
        zaloResults,
        pushResults,
        message: `Đã giao việc thành công cho ${createdAssignments.length} nhân sự!` 
      });
    } catch (error) {
      console.error("Error creating assignment:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.put("/api/assignments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const p = req.body;
      const updateData: any = { updatedAt: new Date() };

      if (p.receiverId !== undefined) updateData.receiverId = parseInt(p.receiverId);
      if (p.taskGroup !== undefined) updateData.taskGroup = p.taskGroup;
      if (p.taskName !== undefined) updateData.taskName = p.taskName;
      if (p.taskCode !== undefined) updateData.taskCode = p.taskCode;
      if (p.baseScore !== undefined) updateData.baseScore = String(p.baseScore);
      if (p.suggestedNature !== undefined) updateData.suggestedNature = p.suggestedNature;
      if (p.suggestedCoef !== undefined) updateData.suggestedCoef = String(p.suggestedCoef);
      if (p.expectedConvertedScore !== undefined) updateData.expectedConvertedScore = String(p.expectedConvertedScore);
      if (p.detail !== undefined) updateData.detail = p.detail;
      if (p.startDate !== undefined) updateData.startDate = p.startDate ? new Date(p.startDate) : null;
      if (p.deadline !== undefined) updateData.deadline = p.deadline ? new Date(p.deadline) : null;
      if (p.productRequired !== undefined) updateData.productRequired = p.productRequired;
      if (p.productType !== undefined) updateData.productType = p.productType;
      if (p.productQty !== undefined) updateData.productQty = parseInt(p.productQty);
      if (p.unit !== undefined) updateData.unit = p.unit;
      if (p.priority !== undefined) updateData.priority = p.priority;
      if (p.receiveStatus !== undefined) updateData.receiveStatus = p.receiveStatus;
      if (p.viewDate !== undefined) updateData.viewDate = p.viewDate ? new Date(p.viewDate) : new Date();
      if (p.receiveDate !== undefined) updateData.receiveDate = p.receiveDate ? new Date(p.receiveDate) : new Date();
      if (p.workId !== undefined) updateData.workId = p.workId;
      if (p.receiverNote !== undefined) updateData.receiverNote = p.receiverNote;
      if (p.leaderNote !== undefined) updateData.leaderNote = p.leaderNote;
      if (p.month !== undefined) updateData.month = p.month;

      const updated = await db.update(assignments).set(updateData).where(eq(assignments.id, id)).returning();
      res.json({ success: true, data: updated[0], message: "Đã cập nhật giao việc!" });
    } catch (error) {
      console.error("Error updating assignment:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/assignments/:id/accept", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const assignment = await db.query.assignments.findFirst({
        where: (a, { eq }) => eq(a.id, id),
        with: { receiver: true, assigner: true },
      });

      if (!assignment) {
        return res.status(404).json({ success: false, message: "Không tìm thấy nhiệm vụ giao việc!" });
      }

      let createdWorkId = assignment.workId;
      let workData: any = null;

      if (!createdWorkId) {
        const newWork = await db.insert(works).values({
          workId: `W-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          month: assignment.month,
          userId: assignment.receiverId,
          taskGroup: assignment.taskGroup || "Công việc được giao",
          taskName: assignment.taskName || "Nhiệm vụ theo chỉ đạo",
          taskCode: assignment.taskCode || "GV",
          detail: assignment.detail || "",
          startDate: assignment.startDate || new Date(),
          startTime: "08:00",
          endDate: assignment.deadline || new Date(),
          endTime: "17:00",
          hours: "8",
          days: 1,
          proposedNature: assignment.suggestedNature || "Trung bình",
          approvedNature: assignment.suggestedNature || "Trung bình",
          coef: assignment.suggestedCoef || "0.8",
          baseScore: assignment.baseScore || "10",
          convertedScore: assignment.expectedConvertedScore || "8",
          status: "Đang xử lý",
          productType: assignment.productType || "Báo cáo",
          productQty: assignment.productQty || 1,
          unit: assignment.unit || "Sản phẩm",
          project: assignment.productRequired || "Nhiệm vụ được Lãnh đạo giao",
          source: "Giao việc",
          leaderApproval: "Chưa duyệt",
          sysNote: `Giao bởi Lãnh đạo (Mã GV: ${assignment.assignmentId})`,
        }).returning();

        createdWorkId = newWork[0].id;
        workData = newWork[0];
      }

      const updated = await db.update(assignments).set({
        receiveStatus: "Đã nhận - đang triển khai",
        receiveDate: new Date(),
        workId: createdWorkId,
        updatedAt: new Date(),
      }).where(eq(assignments.id, id)).returning();

      if (assignment.assignerId) {
        await db.insert(notifications).values({
          notifyId: `N-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: assignment.receiverId,
          receiverId: assignment.assignerId,
          type: "Nhận việc",
          title: "Nhân viên đã tiếp nhận nhiệm vụ",
          content: `${assignment.receiver?.name || "Nhân sự"} đã tiếp nhận: [${assignment.taskCode || ""}] ${assignment.taskName}`,
          relatedTarget: assignment.assignmentId,
          status: "Chưa xem",
        }).onConflictDoNothing();
      }

      res.json({
        success: true,
        data: updated[0],
        work: workData,
        message: "Đã tiếp nhận công việc thành công! Công việc đã được đưa vào danh sách cá nhân để thực hiện.",
      });
    } catch (error) {
      console.error("Error accepting assignment:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/assignments/:id/decline", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { reason } = req.body;

      const assignment = await db.query.assignments.findFirst({
        where: (a, { eq }) => eq(a.id, id),
        with: { receiver: true, assigner: true },
      });

      if (!assignment) {
        return res.status(404).json({ success: false, message: "Không tìm thấy nhiệm vụ!" });
      }

      const updated = await db.update(assignments).set({
        receiveStatus: "Từ chối",
        receiverNote: reason || "Nhân viên phản hồi không thể tiếp nhận",
        updatedAt: new Date(),
      }).where(eq(assignments.id, id)).returning();

      if (assignment.assignerId) {
        await db.insert(notifications).values({
          notifyId: `N-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: assignment.receiverId,
          receiverId: assignment.assignerId,
          type: "Từ chối việc",
          title: "Nhân viên phản hồi/từ chối nhiệm vụ",
          content: `${assignment.receiver?.name || "Nhân sự"} từ chối: [${assignment.taskCode || ""}] ${assignment.taskName} - Lý do: ${reason || "Không nêu lý do"}`,
          relatedTarget: assignment.assignmentId,
          status: "Chưa xem",
        }).onConflictDoNothing();
      }

      res.json({ success: true, data: updated[0], message: "Đã gửi phản hồi từ chối nhiệm vụ tới Lãnh đạo!" });
    } catch (error) {
      console.error("Error declining assignment:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/assignments/:id/remind", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { message } = req.body;

      const assignment = await db.query.assignments.findFirst({
        where: (a, { eq }) => eq(a.id, id),
        with: { receiver: true, assigner: true },
      });

      if (!assignment) {
        return res.status(404).json({ success: false, message: "Không tìm thấy nhiệm vụ!" });
      }

      await db.insert(notifications).values({
        notifyId: `N-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderId: assignment.assignerId,
        receiverId: assignment.receiverId,
        type: "Nhắc việc",
        title: "⚠️ LÃNH ĐẠO NHẮC VIỆC KHẨN",
        content: message || `Lãnh đạo nhắc nhở nhiệm vụ: [${assignment.taskCode || ""}] ${assignment.taskName}. Vui lòng khẩn trương tiếp nhận và báo cáo tiến độ!`,
        relatedTarget: assignment.assignmentId,
        status: "Chưa xem",
      }).onConflictDoNothing();

      res.json({ success: true, message: `Đã gửi thông báo nhắc việc tới ${assignment.receiver?.name || "nhân viên"}!` });
    } catch (error) {
      console.error("Error reminding assignment:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete("/api/assignments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const assignment = await db.query.assignments.findFirst({
        where: (a, { eq }) => eq(a.id, id),
        with: { receiver: true },
      });

      if (!assignment) {
        return res.status(404).json({ success: false, message: "Không tìm thấy nhiệm vụ!" });
      }

      const updated = await db.update(assignments).set({
        receiveStatus: "Đã thu hồi",
        updatedAt: new Date(),
      }).where(eq(assignments.id, id)).returning();

      if (assignment.workId) {
        await db.update(works).set({
          dataStatus: "Đã thu hồi",
          sysNote: "Nhiệm vụ đã được Lãnh đạo thu hồi",
        }).where(eq(works.id, assignment.workId));
      }

      if (assignment.receiverId) {
        await db.insert(notifications).values({
          notifyId: `N-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: assignment.assignerId,
          receiverId: assignment.receiverId,
          type: "Thu hồi việc",
          title: "Nhiệm vụ đã được Lãnh đạo thu hồi",
          content: `Lãnh đạo đã thu hồi nhiệm vụ [${assignment.taskCode || ""}] ${assignment.taskName}`,
          relatedTarget: assignment.assignmentId,
          status: "Chưa xem",
        }).onConflictDoNothing();
      }

      res.json({ success: true, data: updated[0], message: "Đã thu hồi nhiệm vụ giao việc thành công!" });
    } catch (error) {
      console.error("Error revoking assignment:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // 4. Overtime APIs
  app.get("/api/overtimes", async (req, res) => {
    try {
      const all = await db.query.overtimes.findMany({
        with: {
          user: true,
          approver: true,
        },
        orderBy: (o, { desc }) => [desc(o.otDate)],
      });
      res.json({ success: true, data: all });
    } catch (error) {
      console.error("Error fetching overtimes:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/overtimes", async (req, res) => {
    try {
      const p = req.body;
      let user = null;
      if (p.userId) {
        user = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.id, Number(p.userId)),
        });
      }
      if (!user && p.userEmail) {
        user = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.email, String(p.userEmail)),
        });
      }
      if (!user && p.userName) {
        user = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.name, String(p.userName)),
        });
      }
      const userId = user ? user.id : (p.userId ? Number(p.userId) : 1);

      const newOt = await db.insert(overtimes).values({
        otId: p.otId || `OT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        month: p.month || "08-2026",
        userId: userId,
        otDate: new Date(p.otDate || new Date()),
        startTime: p.startTime || "17:00",
        endTime: p.endTime || "20:30",
        breakMinutes: parseInt(p.breakMinutes || "0") || 0,
        totalRegHours: String(p.totalRegHours || "3.5"),
        content: p.content || "",
        reason: p.reason || "",
        project: p.project || "",
        expectedResult: p.expectedResult || "",
        actualResult: p.actualResult || "",
        evidence: p.evidence || "",
        employeeNote: p.note || p.employeeNote || "",
        approvalStatus: p.approvalStatus || "Chờ duyệt",
      }).returning();

      // Notify leaders about new overtime registration
      try {
        const leaders = await db.query.users.findMany({
          where: (u, { or, eq }) => or(eq(u.role, 'LEADER'), eq(u.role, 'ADMIN'))
        });
        const dateStr = new Date(p.otDate || new Date()).toLocaleDateString('vi-VN');
        for (const leader of leaders) {
          if (leader.id !== userId) {
            await db.insert(notifications).values({
              notifyId: `NOTIF-OT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              senderId: userId,
              receiverId: leader.id,
              type: 'OT_REGISTRATION',
              title: `Đăng ký làm thêm mới từ ${user?.name || 'Nhân viên'}`,
              content: `${user?.name || 'Nhân viên'} vừa đăng ký làm thêm ngoài giờ ngày ${dateStr} (${p.totalRegHours || '3.5'} giờ): ${p.content || ''}`,
              relatedTarget: `/approve-ot`,
              status: 'Chưa xem'
            });
          }
        }
      } catch (errNotif) {
        console.error("Error creating leader notification for OT:", errNotif);
      }

      res.json({ success: true, data: newOt[0], message: "Đăng ký làm thêm ngoài giờ thành công!" });
    } catch (error) {
      console.error("Error creating overtime:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Batch action on overtimes (Duyệt, Yêu cầu bổ sung, Không duyệt, Cho phép sửa, Hủy đăng ký)
  app.post("/api/overtimes/batch-action", async (req, res) => {
    try {
      const { ids, action, approverNote, approverId, hoursMap } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: "Chưa chọn dòng nào để xử lý" });
      }

      let targetStatus = 'Đã duyệt';
      let allowEdit = false;
      let actionLabel = 'Phê duyệt';

      if (action === 'approve' || action === 'Đã duyệt') {
        targetStatus = 'Đã duyệt';
        allowEdit = false;
        actionLabel = 'Đã duyệt';
      } else if (action === 'supplement' || action === 'Yêu cầu bổ sung') {
        targetStatus = 'Yêu cầu bổ sung';
        allowEdit = true;
        actionLabel = 'Yêu cầu bổ sung';
      } else if (action === 'reject' || action === 'Không duyệt') {
        targetStatus = 'Không duyệt';
        allowEdit = false;
        actionLabel = 'Không duyệt';
      } else if (action === 'allow_edit' || action === 'Cho phép sửa') {
        targetStatus = 'Cho phép sửa';
        allowEdit = true;
        actionLabel = 'Cho phép sửa';
      } else if (action === 'cancel' || action === 'Hủy đăng ký' || action === 'Đã hủy') {
        targetStatus = 'Đã hủy';
        allowEdit = false;
        actionLabel = 'Đã hủy';
      }

      const updatedList = [];

      for (const rawId of ids) {
        const id = parseInt(rawId);
        if (isNaN(id)) continue;

        const currentOt = await db.query.overtimes.findFirst({
          where: eq(overtimes.id, id),
          with: { user: true }
        });
        if (!currentOt) continue;

        const approvedHours = hoursMap && hoursMap[id] !== undefined
          ? String(hoursMap[id])
          : (targetStatus === 'Không duyệt' || targetStatus === 'Đã hủy' ? '0' : String(currentOt.approvedHours || currentOt.totalRegHours || '0'));

        const updateData: any = {
          approvalStatus: targetStatus,
          approvedHours: approvedHours,
          allowEdit: allowEdit,
          updatedAt: new Date(),
          approvalDate: new Date(),
        };

        if (approverNote !== undefined) {
          updateData.approverNote = approverNote;
        }
        if (approverId) {
          updateData.approverId = parseInt(approverId);
        }

        const [upd] = await db.update(overtimes).set(updateData).where(eq(overtimes.id, id)).returning();
        updatedList.push(upd);

        // Notify the employee about the decision
        if (currentOt.userId) {
          try {
            const dateStr = currentOt.otDate ? new Date(currentOt.otDate).toLocaleDateString('vi-VN') : '';
            await db.insert(notifications).values({
              notifyId: `NOTIF-OT-ACT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              senderId: approverId ? parseInt(approverId) : null,
              receiverId: currentOt.userId,
              type: 'OT_STATUS_UPDATE',
              title: `Kết quả xử lý làm thêm: ${targetStatus}`,
              content: `Phiếu làm thêm ngày ${dateStr} (${approvedHours} giờ) đã được chuyển trạng thái: ${targetStatus}. ${approverNote ? `Ý kiến: ${approverNote}` : ''}`,
              relatedTarget: `/ot-my`,
              status: 'Chưa xem'
            });
          } catch (eNotif) {
            console.error("Error creating employee notification:", eNotif);
          }
        }
      }

      res.json({
        success: true,
        count: updatedList.length,
        data: updatedList,
        message: `Đã xử lý ${updatedList.length} bản ghi sang trạng thái "${targetStatus}" thành công!`
      });
    } catch (error) {
      console.error("Error batch processing overtimes:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.put("/api/overtimes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const p = req.body;
      const updateData: any = { updatedAt: new Date() };

      if (p.approvalStatus !== undefined) updateData.approvalStatus = p.approvalStatus;
      if (p.approvedHours !== undefined) {
        updateData.approvedHours = (p.approvedHours !== null && p.approvedHours !== undefined && p.approvedHours !== '' && p.approvedHours !== 'null')
          ? String(p.approvedHours)
          : null;
      }
      if (p.approverNote !== undefined) updateData.approverNote = p.approverNote;
      if (p.approverId !== undefined) {
        updateData.approverId = (p.approverId && !isNaN(parseInt(p.approverId))) ? parseInt(p.approverId) : null;
      }
      if (p.approvalDate !== undefined) {
        updateData.approvalDate = (p.approvalDate && p.approvalDate !== 'null' && p.approvalDate !== '') ? new Date(p.approvalDate) : null;
      }
      if (p.actualResult !== undefined) updateData.actualResult = p.actualResult;
      if (p.evidence !== undefined) updateData.evidence = p.evidence;
      if (p.employeeNote !== undefined) updateData.employeeNote = p.employeeNote;
      if (p.allowEdit !== undefined) updateData.allowEdit = !!p.allowEdit;
      if (p.content !== undefined) updateData.content = p.content;
      if (p.reason !== undefined) updateData.reason = p.reason;
      if (p.project !== undefined) updateData.project = p.project;
      if (p.expectedResult !== undefined) updateData.expectedResult = p.expectedResult;
      if (p.startTime !== undefined) updateData.startTime = p.startTime;
      if (p.endTime !== undefined) updateData.endTime = p.endTime;
      if (p.breakMinutes !== undefined) {
        updateData.breakMinutes = (p.breakMinutes !== null && p.breakMinutes !== undefined) ? (parseInt(p.breakMinutes) || 0) : 0;
      }
      if (p.totalRegHours !== undefined) {
        updateData.totalRegHours = (p.totalRegHours !== null && p.totalRegHours !== undefined && p.totalRegHours !== '') ? String(p.totalRegHours) : '3.5';
      }
      if (p.month !== undefined) updateData.month = p.month;
      if (p.otDate !== undefined && p.otDate) {
        updateData.otDate = new Date(p.otDate);
      }

      const updated = await db.update(overtimes).set(updateData).where(eq(overtimes.id, id)).returning();
      res.json({ success: true, data: updated[0], message: "Đã cập nhật đăng ký làm thêm!" });
    } catch (error) {
      console.error("Error updating overtime:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete("/api/overtimes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(overtimes).where(eq(overtimes.id, id));
      res.json({ success: true, message: "Đã xóa đăng ký làm thêm!" });
    } catch (error) {
      console.error("Error deleting overtime:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // 5. Categories APIs
  app.get("/api/categories", async (req, res) => {
    try {
      const all = await db.query.categories.findMany({
        orderBy: (cat, { asc }) => [asc(cat.order)],
      });
      res.json({ success: true, data: all });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const p = req.body;
      const newCat = await db.insert(categories).values({
        code: p.code || `CAT-${Date.now()}`,
        name: p.name,
        type: p.type || "TASK",
        properties: p.properties || {},
        status: p.status || "Đang dùng",
        order: parseInt(p.order || "0"),
      }).onConflictDoUpdate({
        target: categories.code,
        set: {
          name: p.name,
          properties: p.properties || {},
          status: p.status || "Đang dùng",
          order: parseInt(p.order || "0"),
        },
      }).returning();

      res.json({ success: true, data: newCat[0], message: "Đã lưu danh mục thành công!" });
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.put("/api/categories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const p = req.body;
      const updatedCat = await db.update(categories).set({
        code: p.code,
        name: p.name,
        type: p.type,
        properties: p.properties || {},
        status: p.status || "Đang dùng",
        order: parseInt(p.order || "0"),
      }).where(eq(categories.id, id)).returning();
      res.json({ success: true, data: updatedCat[0] });
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete("/api/categories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(categories).where(eq(categories.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // 6. Notifications APIs
  app.get("/api/notifications", requireSessionAuthenticated, async (req, res) => {
    try {
      const all = await db.query.notifications.findMany({
        where: (n, { eq }) => eq(n.receiverId, Number((req as any).authUser.id)),
        with: { sender: true, receiver: true },
        orderBy: (n, { desc }) => [desc(n.createdAt)],
      });
      res.json({ success: true, data: all });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // 7. Sync & Backup Router
  app.use("/api/sync", syncRouter);

  // 8. Online & Session Tracking Router
  app.use("/api/online", onlineRouter);

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
