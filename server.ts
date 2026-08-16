import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db/index.ts";
import { users, works, assignments, notifications, overtimes, kpiResults, categories, systemLogs } from "./src/db/schema.ts";
import { eq, desc, asc, and, or, sql } from "drizzle-orm";

export async function runSeeder() {
  try {
    const allUsers = await db.query.users.findMany();
    if (allUsers.length === 0) return { success: false, message: "No users found" };

    const assigner: any = allUsers.find((u: any) => u.name && u.name.includes('Sơn')) || allUsers[0];
    const staffUsers: any[] = allUsers.filter((u: any) => u.id !== assigner?.id);
    const assignerId = Number(assigner?.id || 1);

    // 1. Categories
    const existingCats = await db.query.categories.findMany({ limit: 1 });
    if (existingCats.length === 0) {
      const defaultCategories = [
        { code: 'GRP_VON', name: 'Kế hoạch vốn', type: 'TASK_GROUP', order: 1, status: 'Đang dùng' },
        { code: 'GRP_THANHTOAN', name: 'Thanh toán, giải ngân', type: 'TASK_GROUP', order: 2, status: 'Đang dùng' },
        { code: 'GRP_QUYETTOAN', name: 'Quyết toán', type: 'TASK_GROUP', order: 3, status: 'Đang dùng' },
        { code: 'GRP_LCNT', name: 'Lựa chọn nhà thầu', type: 'TASK_GROUP', order: 4, status: 'Đang dùng' },
        { code: 'GRP_GPMB', name: 'GPMB', type: 'TASK_GROUP', order: 5, status: 'Đang dùng' },
        { code: 'GRP_BAOCAO', name: 'Báo cáo, GSDGĐT, ADB8', type: 'TASK_GROUP', order: 6, status: 'Đang dùng' },
        { code: 'GRP_HANHCHINH', name: 'Hành chính - tổng hợp', type: 'TASK_GROUP', order: 7, status: 'Đang dùng' },
        { code: 'PROD_BAOCAO', name: 'Báo cáo', type: 'PRODUCT_TYPE', order: 1, properties: { unit: 'Báo cáo' }, status: 'Đang dùng' },
        { code: 'PROD_VANBAN', name: 'Văn bản', type: 'PRODUCT_TYPE', order: 2, properties: { unit: 'Văn bản' }, status: 'Đang dùng' },
        { code: 'PROD_TOTRINH', name: 'Tờ trình', type: 'PRODUCT_TYPE', order: 3, properties: { unit: 'Tờ trình' }, status: 'Đang dùng' },
        { code: 'PROD_BANG', name: 'Bảng tổng hợp', type: 'PRODUCT_TYPE', order: 4, properties: { unit: 'Bảng' }, status: 'Đang dùng' },
        { code: 'PROD_HSTT', name: 'Hồ sơ thanh toán', type: 'PRODUCT_TYPE', order: 5, properties: { unit: 'Hồ sơ' }, status: 'Đang dùng' },
        { code: 'PROD_HSQT', name: 'Hồ sơ quyết toán', type: 'PRODUCT_TYPE', order: 6, properties: { unit: 'Hồ sơ' }, status: 'Đang dùng' },
        { code: 'PROD_HSLCNT', name: 'Hồ sơ lựa chọn nhà thầu', type: 'PRODUCT_TYPE', order: 7, properties: { unit: 'Hồ sơ' }, status: 'Đang dùng' },
        { code: 'PROD_HSGPMB', name: 'Hồ sơ đền bù/GPMB', type: 'PRODUCT_TYPE', order: 8, properties: { unit: 'Hồ sơ' }, status: 'Đang dùng' },
        { code: 'PROD_BIENBAN', name: 'Biên bản', type: 'PRODUCT_TYPE', order: 9, properties: { unit: 'Biên bản' }, status: 'Đang dùng' },
        { code: 'PROD_KHAC', name: 'Khác', type: 'PRODUCT_TYPE', order: 10, properties: { unit: 'Sản phẩm' }, status: 'Đang dùng' },
      ];
      for (const cat of defaultCategories) {
        await db.insert(categories).values(cat).onConflictDoNothing();
      }
    }

    // 2. Assignments
    const existingAssigns = await db.query.assignments.findMany({ limit: 1 });
    if (existingAssigns.length === 0) {
      const sampleAssignments: any[] = [
        {
          assignmentId: 'A8-GV-2026-001',
          month: '08-2026',
          assignerId: assignerId,
          receiverId: Number(staffUsers[0]?.id || 2),
          taskGroup: 'Kế hoạch vốn',
          taskName: 'Theo dõi kế hoạch vốn theo dự án, nguồn vốn',
          taskCode: 'KH01',
          baseScore: '10',
          suggestedNature: 'Trung bình',
          suggestedCoef: '0.8',
          expectedConvertedScore: '8',
          detail: 'Rà soát bảng tổng hợp phân bổ kế hoạch vốn đầu tư công năm 2026 cho 5 dự án giao thông trọng điểm.',
          assignDate: new Date('2026-08-01T08:00:00Z'),
          startDate: new Date('2026-08-01T08:00:00Z'),
          deadline: new Date('2026-08-15T17:00:00Z'),
          productRequired: 'Bảng tổng hợp kế hoạch vốn dự án',
          productType: 'Bảng tổng hợp',
          productQty: 1,
          unit: 'Bảng',
          priority: 'Cao',
          receiveStatus: 'Chưa xem'
        },
        {
          assignmentId: 'A8-GV-2026-002',
          month: '08-2026',
          assignerId: assignerId,
          receiverId: Number(staffUsers[1]?.id || 3),
          taskGroup: 'Thanh toán, giải ngân',
          taskName: 'Lập hồ sơ thanh toán, giải ngân gửi Kho bạc',
          taskCode: 'B2.2',
          baseScore: '12',
          suggestedNature: 'Phức tạp',
          suggestedCoef: '1.0',
          expectedConvertedScore: '12',
          detail: 'Hoàn thiện hồ sơ thanh toán khối lượng xây lắp đợt 3 tuyến đường tránh Đông Buôn Ma Thuột.',
          assignDate: new Date('2026-08-05T08:00:00Z'),
          startDate: new Date('2026-08-05T08:00:00Z'),
          deadline: new Date('2026-08-15T17:00:00Z'),
          productRequired: 'Hồ sơ thanh toán và chứng từ KBNN',
          productType: 'Hồ sơ thanh toán',
          productQty: 2,
          unit: 'Hồ sơ',
          priority: 'Khẩn',
          receiveStatus: 'Đã nhận - đang triển khai',
          receiveDate: new Date('2026-08-06T09:00:00Z')
        },
        {
          assignmentId: 'A8-GV-2026-003',
          month: '08-2026',
          assignerId: assignerId,
          receiverId: Number(staffUsers[2]?.id || 4),
          taskGroup: 'Quyết toán',
          taskName: 'Lập báo cáo quyết toán dự án hoàn thành (Thông tư 96/2021/TT-BTC)',
          taskCode: 'QT02',
          baseScore: '18',
          suggestedNature: 'Đặc biệt phức tạp',
          suggestedCoef: '1.5',
          expectedConvertedScore: '27',
          detail: 'Lập báo cáo tổng hợp quyết toán toàn bộ dự án Cải tạo nâng cấp Tỉnh lộ 1 hoàn thành nghiệm thu.',
          assignDate: new Date('2026-08-02T08:00:00Z'),
          startDate: new Date('2026-08-03T08:00:00Z'),
          deadline: new Date('2026-08-14T17:00:00Z'),
          productRequired: 'Hồ sơ quyết toán A-B kèm tờ trình phê duyệt',
          productType: 'Hồ sơ quyết toán',
          productQty: 1,
          unit: 'Hồ sơ',
          priority: 'Cao',
          receiveStatus: 'Đã xem',
          viewDate: new Date('2026-08-04T10:00:00Z')
        },
        {
          assignmentId: 'A8-GV-2026-004',
          month: '07-2026',
          assignerId: assignerId,
          receiverId: Number(staffUsers[3]?.id || 5),
          taskGroup: 'Báo cáo, GSDGĐT, ADB8',
          taskName: 'Lập báo cáo định kỳ, đột xuất, giao ban, cấp trên',
          taskCode: 'B9.1',
          baseScore: '8',
          suggestedNature: 'Trung bình',
          suggestedCoef: '0.8',
          expectedConvertedScore: '6.4',
          detail: 'Báo cáo tình hình thực hiện kế hoạch phát triển kinh tế xã hội và đầu tư công tháng 7/2026.',
          assignDate: new Date('2026-07-20T08:00:00Z'),
          startDate: new Date('2026-07-20T08:00:00Z'),
          deadline: new Date('2026-07-28T17:00:00Z'),
          productRequired: 'Báo cáo định kỳ tháng 7',
          productType: 'Báo cáo',
          productQty: 1,
          unit: 'Báo cáo',
          priority: 'Bình thường',
          receiveStatus: 'Đã nhận - đang triển khai',
          receiveDate: new Date('2026-07-21T08:30:00Z')
        }
      ];

      for (const a of sampleAssignments) {
        await db.insert(assignments).values(a).onConflictDoNothing();
      }
    }

    // 3. Overtimes
    const existingOvertimes = await db.query.overtimes.findMany({ limit: 1 });
    if (existingOvertimes.length === 0) {
      const sampleOvertimes: any[] = [
        {
          otId: 'OT-2026-08-001',
          month: '08-2026',
          userId: Number(staffUsers[0]?.id || 2),
          regDate: new Date('2026-08-10T16:00:00Z'),
          otDate: new Date('2026-08-11T00:00:00Z'),
          startTime: '17:00',
          endTime: '20:30',
          breakMinutes: 0,
          totalRegHours: '3.5',
          content: 'Tổng hợp số liệu điều chỉnh kế hoạch vốn đợt 3 trình UBND tỉnh',
          reason: 'Hồ sơ gấp theo chỉ đạo hỏa tốc của UBND tỉnh phục vụ phiên họp thường kỳ',
          project: 'Kế hoạch vốn đầu tư công năm 2026',
          expectedResult: 'Dự thảo Tờ trình và Bảng tổng hợp chi tiết',
          actualResult: 'Đã hoàn thành dự thảo tờ trình và gửi lãnh đạo phòng rà soát',
          evidence: 'https://drive.google.com/file/d/sample_ot_doc_1/view',
          employeeNote: 'Đã nộp bản in ký nháy',
          approvalStatus: 'Đã duyệt',
          approvedHours: '3.5',
          approverId: assignerId,
          approvalDate: new Date('2026-08-12T09:00:00Z'),
          approverNote: 'Đồng ý duyệt 3.5 giờ làm thêm ngoài giờ'
        },
        {
          otId: 'OT-2026-08-002',
          month: '08-2026',
          userId: Number(staffUsers[1]?.id || 3),
          regDate: new Date('2026-08-12T16:30:00Z'),
          otDate: new Date('2026-08-13T00:00:00Z'),
          startTime: '17:00',
          endTime: '21:00',
          breakMinutes: 30,
          totalRegHours: '3.5',
          content: 'Kiểm tra hồ sơ thanh toán khối lượng hoàn thành dự án Cầu 110',
          reason: 'Nhà thầu nộp hồ sơ muộn, cần đẩy nhanh giải ngân vốn trước ngày 15',
          project: 'Dự án Cầu 110',
          expectedResult: 'Hồ sơ thanh toán hoàn chỉnh gửi KBNN',
          approvalStatus: 'Chờ duyệt'
        },
        {
          otId: 'OT-2026-08-003',
          month: '08-2026',
          userId: Number(staffUsers[2]?.id || 4),
          regDate: new Date('2026-08-08T15:00:00Z'),
          otDate: new Date('2026-08-09T00:00:00Z'),
          startTime: '08:00',
          endTime: '12:00',
          breakMinutes: 0,
          totalRegHours: '4.0',
          content: 'Đối chiếu số liệu giải ngân với Kho bạc Nhà nước tỉnh',
          reason: 'Làm việc ngày thứ 7 để đối khớp toàn bộ dữ liệu 7 tháng đầu năm',
          project: 'Toàn bộ các dự án giao thông',
          expectedResult: 'Biên bản đối chiếu số liệu có chữ ký KBNN',
          actualResult: '',
          evidence: '',
          approvalStatus: 'Cần bổ sung',
          approverId: assignerId,
          approvalDate: new Date('2026-08-10T08:30:00Z'),
          approverNote: 'Đề nghị bổ sung biên bản đối chiếu có xác nhận của KBNN'
        },
        {
          otId: 'OT-2026-07-001',
          month: '07-2026',
          userId: Number(staffUsers[0]?.id || 2),
          regDate: new Date('2026-07-25T16:00:00Z'),
          otDate: new Date('2026-07-26T00:00:00Z'),
          startTime: '17:00',
          endTime: '20:00',
          breakMinutes: 0,
          totalRegHours: '3.0',
          content: 'Lập báo cáo giám sát đánh giá đầu tư quý 2/2026',
          reason: 'Hạn chót nhập cổng thông tin quốc gia ngày 30/7',
          project: 'Hệ thống GSDGĐT quốc gia',
          expectedResult: 'Báo cáo nộp trên hệ thống',
          actualResult: 'Đã hoàn tất nhập liệu và xuất file xác nhận',
          evidence: 'https://gsdgdt.gov.vn/export/sample_7.pdf',
          approvalStatus: 'Đã duyệt',
          approvedHours: '3.0',
          approverId: assignerId,
          approvalDate: new Date('2026-07-27T10:00:00Z')
        }
      ];

      for (const ot of sampleOvertimes) {
        await db.insert(overtimes).values(ot).onConflictDoNothing();
      }
    }

    return { success: true, message: "Seed completed" };
  } catch (e) {
    console.error("Seed error:", e);
    return { success: false, error: String(e) };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Seed data
  setTimeout(() => {
    runSeeder().then(res => console.log("Init seed result:", res));
  }, 1000);

  // --- API Routes ---
  app.get("/api/seed", async (req, res) => {
    const result = await runSeeder();
    res.json(result);
  });

  // 1. Works APIs
  app.get("/api/works", async (req, res) => {
    try {
      const allWorks = await db.query.works.findMany({
        with: { user: true },
        orderBy: (works, { desc }) => [desc(works.createdAt)]
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
        where: (users, { eq, or }) => or(eq(users.id, p.userId || 1), eq(users.name, p.userName || 'Khuất Văn Sơn'))
      });
      const userId = user ? user.id : 1;

      const newWork = await db.insert(works).values({
        workId: p.workId || `W8-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        month: p.month || '08-2026',
        userId: userId,
        taskGroup: p.taskGroup || p.group,
        taskName: p.taskName || p.task,
        taskCode: p.taskCode || p.code,
        detail: p.detail,
        startDate: p.startDate ? new Date(p.startDate) : null,
        startTime: p.startTime || '07:30',
        endDate: p.endDate ? new Date(p.endDate) : null,
        endTime: p.endTime || '17:00',
        actualEndDate: p.actualEndDate ? new Date(p.actualEndDate) : null,
        hours: String(p.hours || '8'),
        days: parseInt(p.days || '1'),
        proposedNature: p.proposedNature || p.nature || 'Trung bình',
        approvedNature: p.approvedNature || '',
        coef: String(p.coef || '0.8'),
        baseScore: String(p.baseScore || p.score || '10'),
        convertedScore: String(p.convertedScore || '8'),
        status: p.status || 'Đang xử lý',
        evidence: p.evidence || '',
        productType: p.productType || 'Báo cáo',
        productQty: parseInt(p.productQty || '1'),
        unit: p.unit || 'Sản phẩm',
        project: p.project || '',
        relatedUnit: p.relatedUnit || '',
        lateReason: p.lateReason || '',
        penaltyExemption: p.penaltyExemption || 'Không',
        editNote: p.editNote || '',
        leaderApproval: p.leaderApproval || 'Chưa duyệt',
        leaderNote: p.leaderNote || '',
        source: p.source || 'WEBAPP',
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
        dataStatus: 'Đã xóa mềm',
        sysNote: `Xóa mềm lúc ${new Date().toISOString()}`,
        updatedAt: new Date()
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
        orderBy: (users, { asc }) => [asc(users.name)]
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
        position: p.position || 'Chuyên viên',
        group: p.group || 'Nhân viên',
        role: p.role || 'STAFF',
        status: p.status || 'Đang làm',
        permissions: p.permissions || ''
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
          updatedAt: new Date()
        }
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
        updatedAt: new Date()
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
          work: true
        },
        orderBy: (assignments, { desc }) => [desc(assignments.assignDate)]
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
        where: (users, { eq }) => eq(users.name, p.assignerName || 'Khuất Văn Sơn')
      });
      const receiver = await db.query.users.findFirst({
        where: (users, { eq, or }) => or(eq(users.id, p.receiverId || 0), eq(users.name, p.receiverName || ''))
      });

      const newAssignment = await db.insert(assignments).values({
        assignmentId: p.assignmentId || `A8-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        month: p.month || '08-2026',
        assignerId: assigner ? assigner.id : 1,
        receiverId: receiver ? receiver.id : 1,
        taskGroup: p.taskGroup || p.group,
        taskName: p.taskName || p.task,
        taskCode: p.taskCode || p.code,
        baseScore: String(p.baseScore || p.score || '10'),
        suggestedNature: p.suggestedNature || p.nature || 'Trung bình',
        suggestedCoef: String(p.suggestedCoef || p.coef || '0.8'),
        expectedConvertedScore: String(p.expectedConvertedScore || '8'),
        detail: p.detail,
        startDate: p.startDate ? new Date(p.startDate) : new Date(),
        deadline: p.deadline ? new Date(p.deadline) : new Date(),
        productRequired: p.productRequired || '',
        productType: p.productType || 'Báo cáo',
        productQty: parseInt(p.productQty || '1'),
        unit: p.unit || 'Sản phẩm',
        priority: p.priority || 'Bình thường',
        receiveStatus: 'Chưa xem',
        leaderNote: p.note || p.leaderNote || ''
      }).returning();

      if (receiver) {
        await db.insert(notifications).values({
          notifyId: `N-${Date.now()}`,
          senderId: assigner ? assigner.id : 1,
          receiverId: receiver.id,
          type: 'Giao việc',
          title: 'Bạn được giao việc mới',
          content: `${p.taskCode || ''} - ${p.taskName || p.task || ''} (Hạn: ${p.deadline ? new Date(p.deadline).toLocaleDateString('vi-VN') : ''})`,
          relatedTarget: newAssignment[0].assignmentId,
          status: 'Chưa xem'
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

      if (p.receiveStatus !== undefined) updateData.receiveStatus = p.receiveStatus;
      if (p.viewDate !== undefined) updateData.viewDate = p.viewDate ? new Date(p.viewDate) : new Date();
      if (p.receiveDate !== undefined) updateData.receiveDate = p.receiveDate ? new Date(p.receiveDate) : new Date();
      if (p.workId !== undefined) updateData.workId = p.workId;
      if (p.receiverNote !== undefined) updateData.receiverNote = p.receiverNote;
      if (p.leaderNote !== undefined) updateData.leaderNote = p.leaderNote;

      const updated = await db.update(assignments).set(updateData).where(eq(assignments.id, id)).returning();
      res.json({ success: true, data: updated[0], message: "Đã cập nhật giao việc!" });
    } catch (error) {
      console.error("Error updating assignment:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // 4. Overtime APIs
  app.get("/api/overtimes", async (req, res) => {
    try {
      const all = await db.query.overtimes.findMany({
        with: {
          user: true,
          approver: true
        },
        orderBy: (overtimes, { desc }) => [desc(overtimes.otDate)]
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
        where: (users, { eq, or }) => or(eq(users.id, p.userId || 0), eq(users.name, p.userName || 'Khuất Văn Sơn'))
      });
      const userId = user ? user.id : 1;

      const newOt = await db.insert(overtimes).values({
        otId: p.otId || `OT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        month: p.month || '08-2026',
        userId: userId,
        otDate: new Date(p.otDate || new Date()),
        startTime: p.startTime || '17:00',
        endTime: p.endTime || '20:30',
        breakMinutes: parseInt(p.breakMinutes || '0'),
        totalRegHours: String(p.totalRegHours || '3.5'),
        content: p.content || '',
        reason: p.reason || '',
        project: p.project || '',
        expectedResult: p.expectedResult || '',
        employeeNote: p.note || '',
        approvalStatus: 'Chờ duyệt',
      }).returning();

      res.json({ success: true, data: newOt[0], message: "Đăng ký làm thêm ngoài giờ thành công!" });
    } catch (error) {
      console.error("Error creating overtime:", error);
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
      if (p.actualResult !== undefined) updateData.actualResult = p.actualResult;
      if (p.evidence !== undefined) updateData.evidence = p.evidence;
      if (p.employeeNote !== undefined) updateData.employeeNote = p.employeeNote;
      if (p.allowEdit !== undefined) updateData.allowEdit = !!p.allowEdit;

      const updated = await db.update(overtimes).set(updateData).where(eq(overtimes.id, id)).returning();
      res.json({ success: true, data: updated[0], message: "Đã cập nhật đăng ký làm thêm!" });
    } catch (error) {
      console.error("Error updating overtime:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // 5. KPI Results APIs
  app.get("/api/kpi", async (req, res) => {
    try {
      const all = await db.query.kpiResults.findMany({
        with: { user: true },
        orderBy: (kpiResults, { desc }) => [desc(kpiResults.totalKpi)]
      });
      res.json({ success: true, data: all });
    } catch (error) {
      console.error("Error fetching KPI results:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/kpi/calculate", async (req, res) => {
    try {
      const { month } = req.body;
      const targetMonth = month || '08-2026';
      
      const allUsers = await db.query.users.findMany();
      const allWorksInMonth = await db.query.works.findMany({
        where: (works, { eq }) => eq(works.month, targetMonth)
      });

      const totalScoreDept = allWorksInMonth
        .filter(w => w.leaderApproval === 'Duyệt')
        .reduce((sum, w) => sum + (parseFloat(w.convertedScore || '0') || 0), 0);

      const activeEmployees = allUsers.filter(u => 
        allWorksInMonth.some(w => w.userId === u.id && w.leaderApproval === 'Duyệt')
      );
      const avgShare = activeEmployees.length > 0 ? (100 / activeEmployees.length) : 0;

      const calculatedResults = [];

      for (const u of allUsers) {
        const uWorks = allWorksInMonth.filter(w => w.userId === u.id);
        const registered = uWorks.length;
        const approvedWorks = uWorks.filter(w => w.leaderApproval === 'Duyệt');
        const approvedCount = approvedWorks.length;
        const pendingCount = uWorks.filter(w => w.leaderApproval === 'Chưa duyệt').length;
        const supplementCount = uWorks.filter(w => w.leaderApproval === 'Cần bổ sung').length;
        const rejectedCount = uWorks.filter(w => w.leaderApproval === 'Không duyệt').length;
        
        const approvedHours = approvedWorks.reduce((sum, w) => sum + (parseFloat(w.hours || '0') || 0), 0);
        const workScore = approvedWorks.reduce((sum, w) => sum + (parseFloat(w.convertedScore || '0') || 0), 0);
        const personalShare = totalScoreDept > 0 ? (workScore / totalScoreDept * 100) : 0;

        const aScore = 30;
        const b1Score = registered > 0 ? Math.min(45, (workScore / 100) * 45) : 0;
        const b2Score = avgShare > 0 ? Math.min(15, (personalShare / avgShare) * 15) : 0;
        const bScore = Math.min(60, b1Score + b2Score);
        
        const c1Score = approvedCount > 0 ? 5 : 0;
        const c2Score = 0;
        const cScore = Math.min(10, c1Score + c2Score);
        const dScore = 0;

        const totalKpi = Math.min(100, Math.max(0, aScore + bScore + cScore - dScore));
        
        let rank = 'Hoàn thành tốt';
        if (totalKpi >= 95) rank = 'Hoàn thành xuất sắc';
        else if (totalKpi >= 80) rank = 'Hoàn thành tốt';
        else if (totalKpi >= 65) rank = 'Hoàn thành';
        else rank = 'Không hoàn thành';

        const kpiId = `${targetMonth}♦${u.name}`;
        
        await db.insert(kpiResults).values({
          kpiId: kpiId,
          month: targetMonth,
          userId: Number((u as any).id),
          registeredWorks: registered,
          approvedWorks: approvedCount,
          pendingWorks: pendingCount,
          supplementWorks: supplementCount,
          rejectedWorks: rejectedCount,
          approvedHours: String(Math.round(approvedHours * 10) / 10),
          convertedScore: String(Math.round(workScore * 100) / 100),
          personalShare: String(Math.round(personalShare * 10) / 10),
          aScore: String(aScore),
          b1Score: String(Math.round(b1Score * 100) / 100),
          b2Score: String(Math.round(b2Score * 100) / 100),
          bScore: String(Math.round(bScore * 100) / 100),
          c1Score: String(c1Score),
          c2Score: String(c2Score),
          cScore: String(cScore),
          dScore: String(dScore),
          totalKpi: String(Math.round(totalKpi * 100) / 100),
          rank: rank,
          warning: pendingCount > 0 ? `Còn ${pendingCount} việc chưa duyệt` : ''
        }).onConflictDoUpdate({
          target: kpiResults.kpiId,
          set: {
            registeredWorks: registered,
            approvedWorks: approvedCount,
            pendingWorks: pendingCount,
            supplementWorks: supplementCount,
            rejectedWorks: rejectedCount,
            approvedHours: String(Math.round(approvedHours * 10) / 10),
            convertedScore: String(Math.round(workScore * 100) / 100),
            personalShare: String(Math.round(personalShare * 10) / 10),
            b1Score: String(Math.round(b1Score * 100) / 100),
            b2Score: String(Math.round(b2Score * 100) / 100),
            bScore: String(Math.round(bScore * 100) / 100),
            c1Score: String(c1Score),
            totalKpi: String(Math.round(totalKpi * 100) / 100),
            rank: rank,
            updatedAt: new Date()
          }
        });

        calculatedResults.push({ name: u.name, totalKpi, rank });
      }

      res.json({ success: true, count: calculatedResults.length, message: `Đã tính lại KPI cho ${calculatedResults.length} nhân sự tháng ${targetMonth}!` });
    } catch (error) {
      console.error("Error calculating KPI:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // 6. Categories APIs
  app.get("/api/categories", async (req, res) => {
    try {
      const all = await db.query.categories.findMany({
        orderBy: (categories, { asc }) => [asc(categories.order)]
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
        type: p.type || 'TASK',
        properties: p.properties || {},
        status: p.status || 'Đang dùng',
        order: parseInt(p.order || '0')
      }).onConflictDoUpdate({
        target: categories.code,
        set: {
          name: p.name,
          properties: p.properties || {},
          status: p.status || 'Đang dùng',
          order: parseInt(p.order || '0')
        }
      }).returning();

      // Create notification if status is Chờ duyệt
      if (p.status === 'Chờ duyệt') {
        const allUsers = await db.query.users.findMany();
        const assigner = (allUsers as any[]).find((u: any) => u.name && u.name.includes('Sơn')) || allUsers[0];
        if (assigner && assigner.id) {
          await db.insert(notifications).values({
            notifyId: `NOTIFY-${Date.now()}`,
            receiverId: Number(assigner.id),
            title: 'Đề xuất công việc mới',
            content: `Có một đề xuất công việc mới cần phê duyệt vào danh mục: ${p.name}`,
            type: 'Hệ thống',
            relatedTarget: '/admin/settings',
            status: 'Chưa xem'
          });
        }
      }

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
        status: p.status || 'Đang dùng',
        order: parseInt(p.order || '0')
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

  // 7. Notifications APIs
  app.get("/api/notifications", async (req, res) => {
    try {
      const all = await db.query.notifications.findMany({
        with: { sender: true, receiver: true },
        orderBy: (notifications, { desc }) => [desc(notifications.createdAt)]
      });
      res.json({ success: true, data: all });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Proxy to Apps Script
  app.get("/api/appscript", async (req, res) => {
    try {
      const { ping, action, tab } = req.query;
      let url = "https://script.google.com/macros/s/AKfycbwl6pG6LVw8oAXIX00pgNOpj4Q2pjSg-g75Za0UCjDp5H3140QzPO3fMFV7sje7aFWt/exec";
      const queryParams = new URLSearchParams();
      if (ping) queryParams.append("ping", String(ping));
      if (action) queryParams.append("action", String(action));
      if (tab) queryParams.append("tab", String(tab));
      const queryString = queryParams.toString();
      if (queryString) url += `?${queryString}`;

      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/appscript", async (req, res) => {
    try {
      const url = "https://script.google.com/macros/s/AKfycbwl6pG6LVw8oAXIX00pgNOpj4Q2pjSg-g75Za0UCjDp5H3140QzPO3fMFV7sje7aFWt/exec";
      const params = new URLSearchParams();
      for (const key in req.body) params.append(key, String(req.body[key]));

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        redirect: 'follow'
      });
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        res.json(data);
      } catch (parseError) {
        res.status(500).json({ error: "Invalid response from App Script", details: text.substring(0, 500) });
      }
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Sync API
  app.post("/api/sync", async (req, res) => {
    try {
      const { type, data } = req.body;
      if (!type || !data || !Array.isArray(data)) {
        return res.status(400).json({ error: "Invalid payload. Expected { type: string, data: array }" });
      }

      if (type === 'users') {
         for (const item of data) {
           await db.insert(users).values({
             uid: item['Uid'] || item['uid'] || null,
             name: item['Nhân viên'] || item['name'] || 'Unknown',
             email: item['Email'] || item['email'] || `${Date.now()}_${Math.random()}@example.com`,
             position: item['Vị trí'] || item['position'],
             group: item['Nhóm'] || item['group'],
             role: item['Role'] || item['role'] || 'STAFF'
           }).onConflictDoNothing();
         }
      }

      if (type === 'works') {
         for (const item of data) {
            const userEmail = item['Email'] || item['email'];
            let userId = 1; 
            if (userEmail) {
               const u = await db.query.users.findFirst({ where: (users, { eq }) => eq(users.email, userEmail) });
               if (u) userId = u.id;
            }

            await db.insert(works).values({
              workId: item['Work_ID'] || item['Mã việc'] || `W-${Date.now()}-${Math.random()}`,
              month: String(item['Tháng'] || item['month'] || '2026.04'),
              userId: userId,
              taskGroup: item['Nhóm công việc'] || item['taskGroup'],
              taskName: item['Tên nhiệm vụ'] || item['taskName'],
              taskCode: item['Mã việc'] || item['taskCode'],
              detail: item['Nội dung chi tiết'] || item['detail'],
              hours: item['Tổng giờ'] ? String(item['Tổng giờ']) : null,
              days: item['Số ngày'] ? parseInt(item['Số ngày']) : null,
              proposedNature: item['Tính chất NV đề xuất'] || item['proposedNature'],
              approvedNature: item['Tính chất lãnh đạo duyệt'] || item['approvedNature'],
              coef: item['Hệ số'] ? String(item['Hệ số']) : null,
              baseScore: item['Điểm chuẩn'] ? String(item['Điểm chuẩn']) : null,
              convertedScore: item['Điểm quy đổi'] ? String(item['Điểm quy đổi']) : null,
              status: item['Trạng thái'] || item['status'] || 'Đang xử lý',
              evidence: item['Minh chứng'] || item['evidence'],
              productType: item['Loại sản phẩm'] || item['productType'],
              productQty: item['Số lượng sản phẩm'] ? parseInt(item['Số lượng sản phẩm']) : 1,
              unit: item['Đơn vị tính'] || item['unit'],
              relatedUnit: item['Đơn vị liên quan'] || item['relatedUnit'],
              leaderApproval: item['Lãnh đạo duyệt'] || item['leaderApproval'] || 'Chưa duyệt',
              source: item['Nguồn nhập'] || item['source'],
            }).onConflictDoNothing();
         }
      }

      res.json({ success: true, message: `Đã tiếp nhận và xử lý ${data.length} bản ghi loại ${type}.` });
    } catch (error) {
      console.error("Sync error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

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
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
