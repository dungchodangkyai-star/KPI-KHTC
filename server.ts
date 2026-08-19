import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db/index.ts";
import { users, works, assignments, notifications, overtimes, categories } from "./src/db/schema.ts";
import { eq, desc, asc, and, or } from "drizzle-orm";
import { authRouter } from "./server/auth.ts";
import { kpiRouter } from "./server/kpiRoutes.ts";
import { syncRouter } from "./server/syncRoutes.ts";
import { onlineRouter } from "./server/onlineRoutes.ts";
import { databaseRouter } from "./server/databaseRoutes.ts";
import { runSeeder } from "./server/seeder.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Seed data on startup
  setTimeout(() => {
    runSeeder().then((res) => console.log("Init seed result:", res));
  }, 1000);

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
      const user = await db.query.users.findFirst({
        where: (u, { eq, or }) => or(eq(u.id, p.userId || 1), eq(u.name, p.userName || "Khuất Văn Sơn")),
      });
      const userId = user ? user.id : 1;

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
        convertedScore: String(p.convertedScore || "8"),
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
      if (p.convertedScore !== undefined) updateData.convertedScore = String(p.convertedScore);
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
      res.json({ success: true, data: updated[0], message: "Đã cập nhật công việc thành công!" });
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
      const assigner = await db.query.users.findFirst({
        where: (u, { eq, or }) => or(eq(u.id, p.assignerId || 0), eq(u.name, p.assignerName || "Khuất Văn Sơn")),
      });
      const receiver = await db.query.users.findFirst({
        where: (u, { eq, or }) => or(eq(u.id, p.receiverId || 0), eq(u.name, p.receiverName || "")),
      });

      const newAssignment = await db.insert(assignments).values({
        assignmentId: p.assignmentId || `A8-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        month: p.month || "08-2026",
        assignerId: assigner ? assigner.id : 1,
        receiverId: receiver ? receiver.id : 1,
        taskGroup: p.taskGroup || p.group,
        taskName: p.taskName || p.task,
        taskCode: p.taskCode || p.code,
        baseScore: String(p.baseScore || p.score || "10"),
        suggestedNature: p.suggestedNature || p.nature || "Trung bình",
        suggestedCoef: String(p.suggestedCoef || p.coef || "0.8"),
        expectedConvertedScore: String(p.expectedConvertedScore || "8"),
        detail: p.detail || "",
        startDate: p.startDate ? new Date(p.startDate) : new Date(),
        deadline: p.deadline ? new Date(p.deadline) : new Date(),
        productRequired: p.productRequired || "",
        productType: p.productType || "Báo cáo",
        productQty: parseInt(p.productQty || "1"),
        unit: p.unit || "Sản phẩm",
        priority: p.priority || "Bình thường",
        receiveStatus: "Chờ nhận việc",
        leaderNote: p.note || p.leaderNote || "",
      }).returning();

      if (receiver) {
        await db.insert(notifications).values({
          notifyId: `N-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: assigner ? assigner.id : 1,
          receiverId: receiver.id,
          type: "Giao việc",
          title: "Bạn có nhiệm vụ mới được Lãnh đạo giao",
          content: `[${p.taskCode || "NV"}] ${p.taskName || p.task || ""} - Hạn chót: ${p.deadline ? new Date(p.deadline).toLocaleDateString("vi-VN") : "Trong tháng"}`,
          relatedTarget: newAssignment[0].assignmentId,
          status: "Chưa xem",
        }).onConflictDoNothing();
      }

      res.json({ success: true, data: newAssignment[0], message: "Đã giao việc thành công!" });
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
      const user = await db.query.users.findFirst({
        where: (u, { eq, or }) => or(eq(u.id, p.userId || 0), eq(u.name, p.userName || "Khuất Văn Sơn")),
      });
      const userId = user ? user.id : 1;

      const newOt = await db.insert(overtimes).values({
        otId: p.otId || `OT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        month: p.month || "08-2026",
        userId: userId,
        otDate: new Date(p.otDate || new Date()),
        startTime: p.startTime || "17:00",
        endTime: p.endTime || "20:30",
        breakMinutes: parseInt(p.breakMinutes || "0"),
        totalRegHours: String(p.totalRegHours || "3.5"),
        content: p.content || "",
        reason: p.reason || "",
        project: p.project || "",
        expectedResult: p.expectedResult || "",
        employeeNote: p.note || p.employeeNote || "",
        approvalStatus: "Chờ duyệt",
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
      if (p.approvedHours !== undefined) updateData.approvedHours = String(p.approvedHours);
      if (p.approverNote !== undefined) updateData.approverNote = p.approverNote;
      if (p.approverId !== undefined) updateData.approverId = p.approverId ? parseInt(p.approverId) : null;
      if (p.approvalDate !== undefined) updateData.approvalDate = p.approvalDate ? new Date(p.approvalDate) : new Date();
      if (p.actualResult !== undefined) updateData.actualResult = p.actualResult;
      if (p.evidence !== undefined) updateData.evidence = p.evidence;
      if (p.employeeNote !== undefined) updateData.employeeNote = p.employeeNote;
      if (p.allowEdit !== undefined) updateData.allowEdit = !!p.allowEdit;
      if (p.content !== undefined) updateData.content = p.content;
      if (p.reason !== undefined) updateData.reason = p.reason;
      if (p.startTime !== undefined) updateData.startTime = p.startTime;
      if (p.endTime !== undefined) updateData.endTime = p.endTime;
      if (p.totalRegHours !== undefined) updateData.totalRegHours = String(p.totalRegHours);
      if (p.month !== undefined) updateData.month = p.month;

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
  app.get("/api/notifications", async (req, res) => {
    try {
      const all = await db.query.notifications.findMany({
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
