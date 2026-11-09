import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const forbiddenExact = new Set([
  'data/db-local-store.json',
  'data/backup-config.json'
]);

const forbiddenPathPatterns = [
  /^data\/backups\//i,
  /^public\/assets\/aistudio\/backup_.*\.json$/i,
  /(^|\/)\.env(?!\.example)(?:$|\.)/i
];

const forbiddenSourceMarkers = [
  /khvanson@gmail\.com/i,
  /dungchodangkyai@gmail\.com/i,
  /LTTNVN248@gmail\.com/i,
  /Khuất\s+Văn\s+Sơn/i
];

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
      .map((file) => file.replaceAll('\\', '/'));
  } catch (error) {
    console.error('Không đọc được danh sách file Git để kiểm tra an toàn dữ liệu.');
    throw error;
  }
}

const files = trackedFiles();
const violations = files.filter((file) =>
  forbiddenExact.has(file) || forbiddenPathPatterns.some((pattern) => pattern.test(file))
);

const sourceViolations = [];
for (const file of files) {
  if (!/\.(?:ts|tsx|js|mjs|cjs|json|yml|yaml)$/i.test(file)) continue;
  let content = '';
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const marker of forbiddenSourceMarkers) {
    if (marker.test(content)) sourceViolations.push(`${file}: ${marker}`);
  }
}

// Regression guard: /api/sync contains full database export/import/reset
// endpoints. A UI-only permission check is insufficient because the URLs can
// be called directly. Fail CI if the router-level ADMIN gate is removed.
const syncRoutesSource = readFileSync('server/syncRoutes.ts', 'utf8');
if (!/syncRouter\.use\(requireStrictAdminSession\)/.test(syncRoutesSource)) {
  sourceViolations.push('server/syncRoutes.ts: thiếu khóa ADMIN cấp router cho /api/sync');
}

// Regression guard: tài khoản ADMIN vận hành dùng chung phải bị ẩn khỏi danh
// sách nhân sự và bị loại khỏi mọi phép tính KPI ở phía máy chủ.
const serverSource = readFileSync('server.ts', 'utf8');
const kpiRoutesSource = readFileSync('server/kpiRoutes.ts', 'utf8');
if (!/allUsers\.filter\(\(user\) => !isSystemAccount\(user\)\)/.test(serverSource)) {
  sourceViolations.push('server.ts: /api/users chưa loại tài khoản quản trị hệ thống ẩn');
}
if (!/if \(isSystemAccount\(u\)\) return false;/.test(kpiRoutesSource)) {
  sourceViolations.push('server/kpiRoutes.ts: phép tính KPI chưa loại tài khoản quản trị hệ thống ẩn');
}

// Regression guard: biểu mẫu đăng ký dùng chung không được mang danh sách tổ/
// nhóm nghiệp vụ riêng của KHTC sang các phòng khác.
const loginSource = readFileSync('src/pages/Login.tsx', 'utf8');
if (/registerForm\.group|Tổ \/ Nhóm công tác đề xuất|Nhóm Kế hoạch vốn/.test(loginSource)) {
  sourceViolations.push('src/pages/Login.tsx: biểu mẫu đăng ký vẫn chứa tổ/nhóm mẫu riêng của KHTC');
}

if (violations.length || sourceViolations.length) {
  console.error('PHÁT HIỆN DỮ LIỆU THẬT/CẤU HÌNH RUNTIME ĐANG ĐƯỢC GIT THEO DÕI:');
  for (const file of violations) console.error(`- ${file}`);
  for (const item of sourceViolations) console.error(`- ${item}`);
  console.error('Hãy bỏ theo dõi các file trên. Chỉ data/backup-config.default.json được phép phát hành.');
  process.exit(1);
}

console.log('Data safety PASS: GitHub không theo dõi dữ liệu Preview, backup thật hoặc cấu hình sao lưu runtime.');
