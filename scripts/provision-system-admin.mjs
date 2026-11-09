import pg from 'pg';

const { Client } = pg;
const sourceUrl = String(process.env.SOURCE_DATABASE_URL || '').trim();
const targetUrl = String(process.env.TARGET_DATABASE_URL || '').trim();
const requestedEmail = String(process.env.SYSTEM_ADMIN_EMAIL || '').trim().toLowerCase();

if (!sourceUrl.startsWith('postgres') || !targetUrl.startsWith('postgres')) {
  throw new Error('Thiếu SOURCE_DATABASE_URL hoặc TARGET_DATABASE_URL hợp lệ.');
}

const source = new Client({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } });
const target = new Client({ connectionString: targetUrl, ssl: { rejectUnauthorized: false } });

function mergedPermissions(value) {
  let parsed = [];
  try { parsed = Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch {}
  const permissions = new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  permissions.add('full_access');
  permissions.add('system_account');
  return JSON.stringify([...permissions]);
}

try {
  await source.connect();
  await target.connect();

  const params = [];
  let where = `role = 'ADMIN' AND status = 'Đang làm'`;
  if (requestedEmail) {
    params.push(requestedEmail);
    where += ` AND lower(email) = $1`;
  }
  const result = await source.query(
    `SELECT name, email, phone, zalo, position, "group", password, permissions, must_change_password
       FROM users WHERE ${where} ORDER BY id`,
    params,
  );
  if (result.rows.length !== 1) {
    throw new Error(requestedEmail
      ? 'Không tìm thấy đúng một ADMIN đang hoạt động theo email đã chọn.'
      : `KHTC có ${result.rows.length} ADMIN đang hoạt động; cần nhập chính xác admin_email khi chạy workflow.`);
  }

  const admin = result.rows[0];
  const permissions = mergedPermissions(admin.permissions);
  await target.query('BEGIN');
  await target.query(
    `INSERT INTO users
       (name, email, phone, zalo, position, "group", role, status, permissions, password, must_change_password, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'ADMIN','Đang làm',$7,$8,false,NOW(),NOW())
     ON CONFLICT (email) DO UPDATE SET
       name=EXCLUDED.name, phone=EXCLUDED.phone, zalo=EXCLUDED.zalo,
       position=EXCLUDED.position, "group"=EXCLUDED."group", role='ADMIN',
       status='Đang làm', permissions=EXCLUDED.permissions, password=EXCLUDED.password,
       must_change_password=false, updated_at=NOW()`,
    [admin.name, admin.email, admin.phone, admin.zalo, admin.position, admin.group, permissions, admin.password],
  );
  await target.query('COMMIT');
  console.log('Đã tạo/cập nhật một tài khoản quản trị hệ thống ẩn trong CSDL đích.');
} catch (error) {
  try { await target.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
