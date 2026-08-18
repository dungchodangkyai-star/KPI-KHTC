import express from 'express';
import { db } from '../src/db/index.ts';
import { systemLogs, users } from '../src/db/schema.ts';
import { desc } from 'drizzle-orm';
import {
  recordHeartbeat,
  removeSession,
  getActiveSessionsSummary,
  logActivity,
  purgeOldLogs,
  getClientIp,
} from './onlineTracker.ts';

export const onlineRouter = express.Router();

// 1. HEARTBEAT ENDPOINT (Called from client every 45s or on route change)
onlineRouter.post('/heartbeat', async (req, res) => {
  try {
    const { userId, userName, userEmail, role, position, group, currentPath } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Thiếu userId.' });
    }

    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    recordHeartbeat({
      userId: Number(userId),
      userName: userName || 'Cán bộ',
      userEmail: userEmail || '',
      role: role || 'STAFF',
      position: position || 'Chuyên viên',
      group: group || 'Kế hoạch - Tài chính',
      ip,
      userAgent,
      currentPath: currentPath || '/',
    });

    return res.json({ success: true, serverTime: Date.now() });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

// 2. GET ACTIVE SESSIONS LIST & SUMMARY
onlineRouter.get('/sessions', async (req, res) => {
  try {
    const summary = getActiveSessionsSummary();
    const totalUsersCount = await db.$count(users);

    return res.json({
      success: true,
      data: {
        onlineCount: summary.onlineCount,
        idleCount: summary.idleCount,
        totalActive: summary.totalActive,
        totalUsers: totalUsersCount,
        sessions: summary.sessions,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching online sessions:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

// 3. DISCONNECT / TERMINATE SESSION (Admin action)
onlineRouter.post('/disconnect', async (req, res) => {
  try {
    const { userId, adminName } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Thiếu userId cần ngắt phiên.' });
    }

    removeSession(Number(userId));

    // Record audit log
    await logActivity({
      userId: Number(userId),
      action: 'NGẮT_PHIÊN',
      target: `User ID #${userId}`,
      result: 'Thành công',
      note: `Quản trị viên (${adminName || 'Admin'}) đã ngắt phiên làm việc của người dùng.`,
    });

    return res.json({ success: true, message: `Đã ngắt phiên truy cập của người dùng #${userId}.` });
  } catch (error) {
    console.error('Error disconnecting session:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

// 4. GET AUDIT / ACTIVITY LOGS (Filtered, limited to 100)
onlineRouter.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const logs = await db.query.systemLogs.findMany({
      with: { user: true },
      orderBy: [desc(systemLogs.createdAt)],
      limit,
    });

    return res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

// 5. PURGE OLD LOGS (Manual trigger by Admin)
onlineRouter.post('/purge-logs', async (req, res) => {
  try {
    const days = parseInt(req.body.days) || 30;
    const result = await purgeOldLogs(days);

    if (result.success) {
      return res.json({
        success: true,
        message: `Đã dọn dẹp ${result.count} bản ghi nhật ký cũ hơn ${days} ngày. Kho lưu trữ đã được tối ưu sạch sẽ!`,
        count: result.count,
      });
    } else {
      return res.status(500).json({ success: false, message: 'Lỗi khi dọn dẹp nhật ký: ' + result.error });
    }
  } catch (error) {
    console.error('Error in purge-logs endpoint:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});
