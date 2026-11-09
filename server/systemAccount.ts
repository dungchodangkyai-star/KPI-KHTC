export const SYSTEM_ACCOUNT_PERMISSION = 'system_account';

export function parseUserPermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [value.trim()];
  } catch {
    return [value.trim()];
  }
}

/**
 * Tài khoản quản trị hệ thống ẩn chỉ dùng để vận hành. Tài khoản này vẫn có
 * role ADMIN để dùng toàn bộ chức năng quản trị, nhưng không phải là nhân sự
 * nghiệp vụ và không được tham gia danh sách/KPI/thống kê của phòng.
 */
export function isSystemAccount(user: any): boolean {
  return parseUserPermissions(user?.permissions)
    .some((permission) => permission.toLowerCase() === SYSTEM_ACCOUNT_PERMISSION);
}

export function systemAdminPermissions(existing: unknown): string {
  const permissions = new Set(parseUserPermissions(existing));
  permissions.add('full_access');
  permissions.add(SYSTEM_ACCOUNT_PERMISSION);
  return JSON.stringify([...permissions]);
}
