import crypto from 'crypto';
import express from 'express';
import { db } from '../src/db/index.ts';
import { users } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { logActivity, removeSession, getClientIp } from './onlineTracker.ts';

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
  if (!storedValue || storedValue.trim() === '') return password === DEFAULT_INITIAL_PASSWORD;
  if (storedValue.includes('$')) {
    const [storedSalt, storedHash] = storedValue.split('$');
    if (!storedSalt || !storedHash) return false;
    const { hash } = hashPassword(password, storedSalt);
    const actual = Buffer.from(hash, 'hex');
    const expected = Buffer.from(storedHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  return storedValue === password;
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
        message: `Không tìm thấy tài khoản "${loginIdentifier}". Vui lòng kiểm tra lại Email hoặc đăng ký tài khoản mới.`
      });
    }

    // Check account status
    if (user.status === 'Chờ duyệt') {
      return res.status(403).json({
        success: false,
        message: `Tài khoản "${user.name}" đang trong trạng thái Chờ Quản trị viên (Khuất Văn Sơn) phê duyệt. Vui lòng liên hệ để được kích hoạt.`
      });
    }

    if (user.status === 'Khóa' || user.status === 'Nghỉ việc' || user.status === 'Từ chối') {
      return res.status(403).json({
        success: false,
        message: `Tài khoản "${user.name}" hiện đang bị tạm khóa hoặc đã ngưng hoạt động. Vui lòng liên hệ Quản trị viên để được hỗ trợ.`
      });
    }

    // Verify Password
    const isValid = verifyPassword(loginPassword, user.password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Mật mã truy cập không chính xác. Vui lòng kiểm tra lại hoặc liên hệ Quản trị viên.'
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

    // Log login activity
    await logActivity({
      userId: Number(user.id),
      action: 'ĐĂNG_NHẬP',
      target: user.name,
      result: 'Thành công',
      note: `Đăng nhập hệ thống từ IP: ${getClientIp(req)}`,
    });

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
  try {
    const { userId } = req.body;
    if (userId) {
      removeSession(Number(userId));
      await logActivity({
        userId: Number(userId),
        action: 'ĐĂNG_XUẤT',
        result: 'Thành công',
        note: 'Người dùng đăng xuất khỏi hệ thống',
      });
    }
    return res.json({ success: true, message: 'Đăng xuất thành công.' });
  } catch (err) {
    console.error('Logout handler error:', err);
    return res.json({ success: true, message: 'Đã đăng xuất.' });
  }
});

// 5. REGISTER ACCOUNT REQUEST (For new employees)
authRouter.post('/register-request', async (req, res) => {
  try {
    const { name, email, phone, zalo, position, group, note } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập họ và tên đầy đủ.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ Email.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại liên hệ.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // Check if email already exists
    const existingUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, cleanEmail)
    });

    if (existingUser) {
      if (existingUser.status === 'Chờ duyệt') {
        return res.status(400).json({
          success: false,
          message: `Email "${cleanEmail}" đã gửi yêu cầu đăng ký trước đó và đang chờ Quản trị viên phê duyệt.`
        });
      }
      return res.status(400).json({
        success: false,
        message: `Email "${cleanEmail}" đã tồn tại trong hệ thống. Nếu quên mật khẩu, vui lòng liên hệ Quản trị viên để được đặt lại.`
      });
    }

    const defaultPwdHash = formatStoredPassword(DEFAULT_INITIAL_PASSWORD);

    const newUser = await db.insert(users).values({
      name: cleanName,
      email: cleanEmail,
      phone: phone.trim(),
      zalo: (zalo || phone).trim(),
      position: position?.trim() || 'Chuyên viên',
      group: group?.trim() || 'Kế hoạch - Tài chính',
      role: 'STAFF',
      status: 'Chờ duyệt',
      permissions: JSON.stringify([]),
      password: defaultPwdHash,
      mustChangePassword: true,
    }).returning();

    return res.json({
      success: true,
      message: 'Đăng ký tài khoản thành công! Yêu cầu của bạn đã được gửi đến Quản trị hệ thống (Khuất Văn Sơn) để phê duyệt kích hoạt.',
      user: newUser[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi gửi yêu cầu đăng ký: ' + String(error) });
  }
});

// 6. APPROVE PENDING USER (Admin feature)
authRouter.post('/approve-user', async (req, res) => {
  try {
    const { userId, role, position, group } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Thiếu userId cần duyệt.' });
    }

    const targetUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, Number(userId))
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng cần duyệt.' });
    }

    const defaultPwdHash = formatStoredPassword(DEFAULT_INITIAL_PASSWORD);

    const updated = await db.update(users).set({
      status: 'Đang làm',
      role: role || targetUser.role || 'STAFF',
      position: position || targetUser.position || 'Chuyên viên',
      group: group || targetUser.group || 'Kế hoạch - Tài chính',
      password: targetUser.password || defaultPwdHash,
      mustChangePassword: true,
      updatedAt: new Date()
    }).where(eq(users.id, Number(targetUser.id))).returning();

    return res.json({
      success: true,
      message: `Đã phê duyệt và kích hoạt tài khoản cho nhân sự "${targetUser.name}". Mật khẩu mặc định ban đầu là 123456@.`,
      user: updated[0]
    });
  } catch (error) {
    console.error('Approve user error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi duyệt tài khoản: ' + String(error) });
  }
});

// 7. REJECT PENDING USER (Admin feature)
authRouter.post('/reject-user', async (req, res) => {
  try {
    const { userId, reason } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Thiếu userId cần từ chối.' });
    }

    const targetUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, Number(userId))
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    await db.update(users).set({
      status: 'Từ chối',
      updatedAt: new Date()
    }).where(eq(users.id, Number(targetUser.id)));

    return res.json({
      success: true,
      message: `Đã từ chối yêu cầu đăng ký của "${targetUser.name}".`
    });
  } catch (error) {
    console.error('Reject user error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi từ chối yêu cầu: ' + String(error) });
  }
});

