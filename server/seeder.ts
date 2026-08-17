import { db } from '../src/db/index.ts';
import { users, categories, assignments, overtimes } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { DEFAULT_INITIAL_PASSWORD, formatStoredPassword } from './auth.ts';
import { OFFICIAL_USERS } from './syncRoutes.ts';

export async function runSeeder() {
  try {
    const defaultPwdHash = formatStoredPassword(DEFAULT_INITIAL_PASSWORD);

    // 1. Seed or update official users
    let allUsers: any[] = await db.query.users.findMany();
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
      // Ensure all 19 official users exist and khvanson@gmail.com / Khuất Văn Sơn is set as ADMIN
      for (const u of OFFICIAL_USERS) {
        await db.insert(users).values({
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
      // Force position update for main admin
      await db.update(users).set({
        position: 'Phó Trưởng phòng',
        updatedAt: new Date(),
      }).where(eq(users.email, 'khvanson@gmail.com'));
      allUsers = await db.query.users.findMany();
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
      ];
      for (const cat of defaultCategories) {
        await db.insert(categories).values(cat).onConflictDoNothing();
      }
    }

    return { success: true, message: "Official users and standard categories ready" };
  } catch (e) {
    console.error("Seed error:", e);
    return { success: false, error: String(e) };
  }
}
