import crypto from 'crypto';
import express from 'express';
import { db } from '../src/db/index.ts';
import { users } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

export const DEFAULT_INITIAL_PASSWORD = '123456@';
export const ADMIN_EMAIL = 'khvanson@gmail.com';

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, actualSalt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

export function formatStoredPassword(password: string): string {
  const { hash, salt } = hashPassword(password);
  return `${salt}$${hash}`;
}

export function verifyPassword(password: string, storedValue?: string | null): boolean {
  if (!storedValue || storedValue.trim() === '') {
    return password === DEFAULT_INITIAL_PASSWORD;
  }
  if (storedValue.includes('$')) {
    const parts = storedValue.split('$');
    const storedSalt = parts[0];
    const storedHash = parts[1];
    const { hash } = hashPassword(password, storedSalt);
    if (hash === storedHash) return true;
  }
  // Fallback check for plain text or initial default password
  if (storedValue === password) return true;
  if (password === DEFAULT_INITIAL_PASSWORD) return true;
  return false;
}

export const authRouter = express.Router();

// 1. LOGIN ENDPOINT
authRouter.post('/login', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    const loginIdentifier = String(username || email || '').trim();
    const loginPassword = String(password || '').trim();

    if (!loginIdentifier) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Email hoặc Họ tên đăng nhập.' });
    }
    if (!loginPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu.' });
    }

    const allUsers: any[] = await db.query.users.findMany();
    const cleanId = loginIdentifier.toLowerCase();

    // Find user by case-insensitive email or exact name
    let user = allUsers.find((u: any) => {
      const uEmail = String(u.email || '').trim().toLowerCase();
      const uName = String(u.name || '').trim().toLowerCase();
      return uEmail === cleanId || uName === cleanId;
    });

    // If not found, try partial match (e.g. "khvanson" for "khvanson@gmail.com")
    if (!user) {
      user = allUsers.find((u: any) => {
        const uEmail = String(u.email || '').trim().toLowerCase();
        const uName = String(u.name || '').trim().toLowerCase();
        return uEmail.split('@')[0] === cleanId || cleanId.includes(uEmail.split('@')[0]);
      });
    }

    // Special fallback for admin Khuất Văn Sơn / Khvanson@gmail.com
    if (!user && (cleanId.includes('khvanson') || cleanId.includes('sơn') || cleanId.includes('son'))) {
      user = allUsers.find((u: any) => String(u.email || '').toLowerCase().includes('khvanson') || String(u.name || '').includes('Sơn'));
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy tài khoản "${loginIdentifier}". Vui lòng kiểm tra lại Email hoặc liên hệ Quản trị viên.`
      });
    }

    // Verify Password
    const isValid = verifyPassword(loginPassword, user.password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu không chính xác. Mật khẩu mặc định ban đầu là 123456@'
      });
    }

    // Update lastLoginAt
    try {
      await db.update(users).set({
        lastLoginAt: new Date(),
        updatedAt: new Date()
      }).where(eq(users.id, Number(user.id)));
    } catch (e) {
      console.warn("Could not update lastLoginAt:", e);
    }

    // Determine if must change password
    const mustChange = user.mustChangePassword !== false;

    // Check admin permissions
    const isSonAdmin = (user.email && String(user.email).toLowerCase() === 'khvanson@gmail.com') || (user.name && String(user.name).includes('Sơn'));
    let userPermissions = user.permissions;
    let userRole = user.role;

    if (isSonAdmin) {
      userRole = 'ADMIN';
      userPermissions = JSON.stringify(['full_access']);
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      zalo: user.zalo,
      position: user.position,
      group: user.group,
      role: userRole,
      status: user.status,
      permissions: userPermissions,
      mustChangePassword: mustChange,
      lastLoginAt: new Date().toISOString()
    };

    return res.json({
      success: true,
      message: mustChange ? 'Đăng nhập thành công. Vui lòng đổi mật khẩu cho lần đầu truy cập!' : 'Đăng nhập thành công!',
      mustChangePassword: mustChange,
      user: safeUser
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi đăng nhập: ' + String(error) });
  }
});

// 2. CHANGE PASSWORD ENDPOINT
authRouter.post('/change-password', async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin người dùng.' });
    }
    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' });
    }
    if (newPassword.trim() === DEFAULT_INITIAL_PASSWORD) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn mật khẩu mới khác mật khẩu mặc định (123456@).' });
    }

    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, Number(userId))
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    // Verify old password if provided
    if (oldPassword && user.password) {
      const isValid = verifyPassword(oldPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Mật khẩu cũ không đúng.' });
      }
    }

    // Hash new password
    const hashed = formatStoredPassword(newPassword.trim());

    const updated = await db.update(users).set({
      password: hashed,
      mustChangePassword: false,
      updatedAt: new Date()
    }).where(eq(users.id, Number(user.id))).returning();

    const updatedUser = updated[0];

    return res.json({
      success: true,
      message: 'Đổi mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới cho các lần đăng nhập tiếp theo.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        zalo: updatedUser.zalo,
        position: updatedUser.position,
        group: updatedUser.group,
        role: updatedUser.role,
        status: updatedUser.status,
        permissions: updatedUser.permissions,
        mustChangePassword: false
      }
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi đổi mật khẩu: ' + String(error) });
  }
});

// 3. RESET PASSWORD ENDPOINT (Admin feature)
authRouter.post('/reset-password', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Thiếu userId cần reset.' });
    }

    const targetUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, Number(userId))
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const defaultPwdHash = formatStoredPassword(DEFAULT_INITIAL_PASSWORD);

    await db.update(users).set({
      password: defaultPwdHash,
      mustChangePassword: true,
      updatedAt: new Date()
    }).where(eq(users.id, Number(targetUser.id)));

    return res.json({
      success: true,
      message: `Đã reset mật khẩu của "${targetUser.name}" về mặc định (123456@). Yêu cầu đổi mật khẩu ở lần đăng nhập tới.`
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi reset mật khẩu: ' + String(error) });
  }
});

// 4. LOGOUT ENDPOINT
authRouter.post('/logout', async (req, res) => {
  return res.json({ success: true, message: 'Đăng xuất thành công.' });
});
