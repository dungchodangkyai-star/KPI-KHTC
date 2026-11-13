import assert from 'node:assert/strict';
import { sanitizeUserRecord, sanitizeUserRecords } from './userSecurity.ts';

const source = {
  id: 7,
  name: 'Nguyễn Văn A',
  email: 'a@example.com',
  password: 'pbkdf2-secret-material',
  passwordHash: 'legacy-secret',
  password_hash: 'legacy-sql-secret',
  status: 'Chờ duyệt',
};

const safe = sanitizeUserRecord(source) as Record<string, any>;
assert.equal(safe.id, 7);
assert.equal(safe.status, 'Chờ duyệt');
assert.equal('password' in safe, false);
assert.equal('passwordHash' in safe, false);
assert.equal('password_hash' in safe, false);
assert.equal(source.password, 'pbkdf2-secret-material', 'Sanitizing must not mutate the database object');

const list = sanitizeUserRecords([source]);
assert.equal(list.length, 1);
assert.equal('password' in (list[0] as Record<string, any>), false);

console.log('User security sanitization tests passed.');
