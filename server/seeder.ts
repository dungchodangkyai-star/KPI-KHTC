import fs from 'fs';
import path from 'path';
import { db, getStorageMode } from '../src/db/index.ts';
import { users, categories, assignments, overtimes } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { DEFAULT_INITIAL_PASSWORD, formatStoredPassword } from './auth.ts';
import { OFFICIAL_USERS } from './syncRoutes.ts';
import { checkNeonTargetAdminStatus } from './migrationService.ts';

export async function runSeeder() {
  try {
    const defaultPwdHash = formatStoredPassword(DEFAULT_INITIAL_PASSWORD);

    const mode = getStorageMode();
    const dataStorePath = path.join(process.cwd(), 'data', 'db-local-store.json');
    const hasLocalStore = fs.existsSync(dataStorePath);

    // In postgres mode: if target is awaiting migration (EMPTY_BOOTSTRAP or RECOVERY_REQUIRED or !hasValidAdmin),
    // or lacks the persistent migration_completed marker, strictly skip all seeding so we do NOT turn an empty
    // database into a dirty one or overwrite real user data.
    if (mode === 'postgres') {
      const targetStatus = await checkNeonTargetAdminStatus();
      if (targetStatus.state === 'EMPTY_BOOTSTRAP' || targetStatus.state === 'RECOVERY_REQUIRED' || !targetStatus.hasValidAdmin) {
        console.log(`[Seeder] Neon PostgreSQL đang ở trạng thái ${targetStatus.state} chờ di chuyển (Migration). Bỏ qua khởi tạo nhân sự, danh mục, phân công để bảo toàn trạng thái đích an toàn.`);
        return { success: true, message: `Bỏ qua seeding do CSDL đích đang ở trạng thái ${targetStatus.state}` };
      }

      // Check persistent migration completion marker in migration_metadata table
      try {
        const { pool } = await import('../src/db/index.ts');
        const metaRes = await pool.query(`
          SELECT key, value FROM migration_metadata WHERE key IN ('migration_completed', 'canonical_restored')
        `).catch(() => null);
        const hasCompletedMarker = (metaRes?.rows || []).some((r: any) => r.value === 'true');

        // Check if real users exist in target
        const userCountRes = await pool.query('SELECT COUNT(*)::int AS count FROM users').catch(() => ({ rows: [{ count: 0 }] }));
        const userCount = Number(userCountRes.rows[0]?.count || 0);

        if (userCount > 0 || hasCompletedMarker) {
          console.log(`[Seeder] Neon PostgreSQL đã có dữ liệu thực (${userCount} nhân sự, canonical restored). TUYỆT ĐỐI BỎ QUA SEEDING để bảo toàn 100% dữ liệu gốc.`);
          return { success: true, message: `Bỏ qua seeding: CSDL đã có ${userCount} nhân sự thực (canonical restored).` };
        }

        if (!hasCompletedMarker) {
          console.log('[Seeder] Neon PostgreSQL chưa có đánh dấu hoàn tất di chuyển (migration_completed). Bỏ qua seeding để bảo toàn dữ liệu thực.');
          return { success: true, message: 'Bỏ qua seeding do chưa có xác nhận hoàn tất migration.' };
        }
      } catch (err) {
        console.warn('[Seeder] Notice checking migration_metadata:', err);
        return { success: true, message: 'Bỏ qua seeding để bảo vệ dữ liệu thực.' };
      }
    }

    let allUsers: any[] = [];
    try {
      allUsers = await db.query.users.findMany();
      if (allUsers.length === 0) {
        for (const u of OFFICIAL_USERS) {
          await db.insert(users).values({
            ...u,
            password: defaultPwdHash,
            mustChangePassword: true,
          }).onConflictDoNothing();
        }
        allUsers = await db.query.users.findMany();
      } else {
        // Do NOT overwrite user modifications. Only insert missing official users without updating existing records.
        for (const u of OFFICIAL_USERS) {
          await db.insert(users).values({
            ...u,
            password: defaultPwdHash,
            mustChangePassword: true,
          }).onConflictDoNothing();
        }
        allUsers = await db.query.users.findMany();
      }
    } catch (err: any) {
      console.warn('[Seeder] Notice during user seed check:', err?.message || err);
    }

    const assigner: any = allUsers.find((u: any) => u.name && String(u.name).includes('Sơn')) || allUsers[0];
    const staffUsers: any[] = allUsers.filter((u: any) => u.id !== assigner?.id);
    const assignerId = Number(assigner?.id || 1);

    // 2. Categories
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
        { code: 'NAT_01', name: 'Rất đơn giản', type: 'WORK_NATURE', order: 1, properties: { coef: 0.5, c1Point: 0, description: 'Nhiệm vụ thường xuyên, định kỳ đơn giản, quy trình rõ ràng' }, status: 'Đang dùng' },
        { code: 'NAT_02', name: 'Đơn giản', type: 'WORK_NATURE', order: 2, properties: { coef: 0.6, c1Point: 0, description: 'Công việc đơn giản, ít bước xử lý' }, status: 'Đang dùng' },
        { code: 'NAT_03', name: 'Trung bình', type: 'WORK_NATURE', order: 3, properties: { coef: 0.8, c1Point: 0, description: 'Công việc trung bình, yêu cầu nghiệp vụ chuyên môn tiêu chuẩn' }, status: 'Đang dùng' },
        { code: 'NAT_04', name: 'Phức tạp', type: 'WORK_NATURE', order: 4, properties: { coef: 1.0, c1Point: 1, description: 'Công việc phức tạp, phối hợp nhiều khâu hoặc nhiều bên' }, status: 'Đang dùng' },
        { code: 'NAT_05', name: 'Rất phức tạp', type: 'WORK_NATURE', order: 5, properties: { coef: 1.2, c1Point: 2, description: 'Công việc rất phức tạp, quy mô lớn hoặc tiến độ gấp' }, status: 'Đang dùng' },
        { code: 'NAT_06', name: 'Đặc biệt phức tạp', type: 'WORK_NATURE', order: 6, properties: { coef: 1.5, c1Point: 3, description: 'Công việc đột xuất trọng điểm, đặc biệt khó khăn, chuyên sâu' }, status: 'Đang dùng' },
      ];
      for (const cat of defaultCategories) {
        await db.insert(categories).values(cat).onConflictDoNothing();
      }
    } else {
      // Ensure WORK_NATURE entries exist even if categories already has items
      const existingNatures = await db.query.categories.findMany({
        where: (cat, { eq }) => eq(cat.type, 'WORK_NATURE')
      });
      if (existingNatures.length === 0) {
        const defaultNatures = [
          { code: 'NAT_01', name: 'Rất đơn giản', type: 'WORK_NATURE', order: 1, properties: { coef: 0.5, c1Point: 0, description: 'Nhiệm vụ thường xuyên, định kỳ đơn giản, quy trình rõ ràng' }, status: 'Đang dùng' },
          { code: 'NAT_02', name: 'Đơn giản', type: 'WORK_NATURE', order: 2, properties: { coef: 0.6, c1Point: 0, description: 'Công việc đơn giản, ít bước xử lý' }, status: 'Đang dùng' },
          { code: 'NAT_03', name: 'Trung bình', type: 'WORK_NATURE', order: 3, properties: { coef: 0.8, c1Point: 0, description: 'Công việc trung bình, yêu cầu nghiệp vụ chuyên môn tiêu chuẩn' }, status: 'Đang dùng' },
          { code: 'NAT_04', name: 'Phức tạp', type: 'WORK_NATURE', order: 4, properties: { coef: 1.0, c1Point: 1, description: 'Công việc phức tạp, phối hợp nhiều khâu hoặc nhiều bên' }, status: 'Đang dùng' },
          { code: 'NAT_05', name: 'Rất phức tạp', type: 'WORK_NATURE', order: 5, properties: { coef: 1.2, c1Point: 2, description: 'Công việc rất phức tạp, quy mô lớn hoặc tiến độ gấp' }, status: 'Đang dùng' },
          { code: 'NAT_06', name: 'Đặc biệt phức tạp', type: 'WORK_NATURE', order: 6, properties: { coef: 1.5, c1Point: 3, description: 'Công việc đột xuất trọng điểm, đặc biệt khó khăn, chuyên sâu' }, status: 'Đang dùng' },
        ];
        for (const nat of defaultNatures) {
          await db.insert(categories).values(nat).onConflictDoNothing();
        }
      }
    }

    return { success: true, message: "Official users and standard categories ready" };
  } catch (e) {
    console.error("Seed error:", e);
    return { success: false, error: String(e) };
  }
}
