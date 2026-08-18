import { db } from '../src/db/index.ts';
import { systemLogs, users } from '../src/db/schema.ts';
import { desc, lt, eq } from 'drizzle-orm';

export interface ActiveSession {
  sessionId: string;
  userId: number;
  userName: string;
  userEmail: string;
  role: string;
  position: string;
  group: string;
  ip: string;
  device: string;
  browser: string;
  currentPath: string;
  loginAt: string;
  lastActiveAt: string;
  lastActiveTimestamp: number;
}

// In-Memory storage for fast, zero-database-overhead tracking
const activeSessions = new Map<number, ActiveSession>();

// Simple User-Agent parser (no heavy external package needed)
export function parseUserAgent(uaString?: string): { device: string; browser: string } {
  if (!uaString) return { device: 'Không xác định', browser: 'Trình duyệt Web' };
  
  let device = 'Máy tính';
  if (/android/i.test(uaString)) device = 'Android Mobile';
  else if (/ipad|iphone|ipod/i.test(uaString)) device = 'iOS Mobile';
  else if (/windows/i.test(uaString)) device = 'Windows PC';
  else if (/macintosh|mac os x/i.test(uaString)) device = 'Mac';
  else if (/linux/i.test(uaString)) device = 'Linux';

  let browser = 'Web Browser';
  if (/coccoc/i.test(uaString)) browser = 'Cốc Cốc';
  else if (/zalo/i.test(uaString)) browser = 'Zalo In-App';
  else if (/edg/i.test(uaString)) browser = 'Microsoft Edge';
  else if (/chrome/i.test(uaString)) browser = 'Google Chrome';
  else if (/safari/i.test(uaString) && !/chrome/i.test(uaString)) browser = 'Apple Safari';
  else if (/firefox/i.test(uaString)) browser = 'Mozilla Firefox';

  return { device, browser };
}

// Helper to extract clean Client IP
export function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
    return ip.trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

// Update or register heartbeat
export function recordHeartbeat(params: {
  userId: number;
  userName: string;
  userEmail: string;
  role: string;
  position?: string;
  group?: string;
  ip: string;
  userAgent?: string;
  currentPath?: string;
}) {
  const { device, browser } = parseUserAgent(params.userAgent);
  const now = new Date();
  const nowTs = now.getTime();

  const existing = activeSessions.get(params.userId);

  activeSessions.set(params.userId, {
    sessionId: existing?.sessionId || `sess_${params.userId}_${nowTs}`,
    userId: params.userId,
    userName: params.userName || existing?.userName || 'Cán bộ',
    userEmail: params.userEmail || existing?.userEmail || '',
    role: params.role || existing?.role || 'STAFF',
    position: params.position || existing?.position || 'Chuyên viên',
    group: params.group || existing?.group || 'Kế hoạch - Tài chính',
    ip: params.ip || existing?.ip || '127.0.0.1',
    device: device || existing?.device || 'Máy tính',
    browser: browser || existing?.browser || 'Chrome',
    currentPath: params.currentPath || existing?.currentPath || '/',
    loginAt: existing?.loginAt || now.toISOString(),
    lastActiveAt: now.toISOString(),
    lastActiveTimestamp: nowTs,
  });
}

// Remove session (Logout)
export function removeSession(userId: number) {
  activeSessions.delete(userId);
}

// Get all active sessions with computed statuses
export function getActiveSessionsSummary() {
  const nowTs = Date.now();
  const sessions: any[] = [];
  let onlineCount = 0;
  let idleCount = 0;

  // 2 minutes for Online, 10 minutes for Idle
  const ONLINE_THRESHOLD = 2 * 60 * 1000;
  const IDLE_THRESHOLD = 10 * 60 * 1000;

  for (const [userId, sess] of activeSessions.entries()) {
    const elapsed = nowTs - sess.lastActiveTimestamp;

    if (elapsed > IDLE_THRESHOLD) {
      // Auto purge stale session from memory (>10 mins inactive)
      activeSessions.delete(userId);
      continue;
    }

    let status = 'Online';
    let statusLabel = 'Đang thao tác';
    if (elapsed > ONLINE_THRESHOLD) {
      status = 'Idle';
      statusLabel = 'Tạm nghỉ (Nhàn rỗi)';
      idleCount++;
    } else {
      onlineCount++;
    }

    // Format human-friendly time
    let lastActiveText = 'Vừa xong';
    const elapsedSec = Math.floor(elapsed / 1000);
    if (elapsedSec >= 60) {
      const mins = Math.floor(elapsedSec / 60);
      lastActiveText = `${mins} phút trước`;
    } else if (elapsedSec > 5) {
      lastActiveText = `${elapsedSec} giây trước`;
    }

    sessions.push({
      ...sess,
      status,
      statusLabel,
      elapsedSeconds: elapsedSec,
      lastActiveText,
    });
  }

  // Sort: Online first, then latest activity
  sessions.sort((a, b) => {
    if (a.status === 'Online' && b.status !== 'Online') return -1;
    if (a.status !== 'Online' && b.status === 'Online') return 1;
    return b.lastActiveTimestamp - a.lastActiveTimestamp;
  });

  return {
    onlineCount,
    idleCount,
    totalActive: sessions.length,
    sessions,
  };
}

// Log system activity event to PostgreSQL
export async function logActivity(params: {
  userId?: number;
  action: string;
  target?: string;
  result?: string;
  note?: string;
  details?: any;
}) {
  try {
    const logId = `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await db.insert(systemLogs).values({
      logId,
      userId: params.userId || null,
      action: params.action,
      target: params.target || '',
      result: params.result || 'Thành công',
      note: params.note || '',
      details: params.details || {},
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn('Could not write activity log:', err);
  }
}

// Purge old system logs (> daysToKeep) to prevent database bloat
export async function purgeOldLogs(daysToKeep = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deleted = await db.delete(systemLogs).where(lt(systemLogs.createdAt, cutoffDate)).returning();
    return { success: true, count: deleted.length, cutoffDate: cutoffDate.toISOString() };
  } catch (err) {
    console.error('Error purging old logs:', err);
    return { success: false, count: 0, error: String(err) };
  }
}

// Automatic cleanup every 24 hours
setInterval(() => {
  // Purge logs older than 30 days
  purgeOldLogs(30).then((res) => {
    if (res.success && res.count > 0) {
      console.log(`[Auto-Cleanup] Purged ${res.count} old audit logs older than 30 days.`);
    }
  });
}, 24 * 60 * 60 * 1000);
