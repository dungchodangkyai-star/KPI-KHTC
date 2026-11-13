const USER_SECRET_FIELDS = new Set([
  'password',
  'passwordHash',
  'password_hash',
]);

/** Never send authentication material to a browser response. */
export function sanitizeUserRecord<T extends Record<string, any>>(user: T | null | undefined) {
  if (!user) return user;
  return Object.fromEntries(
    Object.entries(user).filter(([key]) => !USER_SECRET_FIELDS.has(key))
  );
}

export function sanitizeUserRecords<T extends Record<string, any>>(users: T[]) {
  return users.map((user) => sanitizeUserRecord(user));
}
