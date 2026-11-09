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

if (violations.length || sourceViolations.length) {
  console.error('PHÁT HIỆN DỮ LIỆU THẬT/CẤU HÌNH RUNTIME ĐANG ĐƯỢC GIT THEO DÕI:');
  for (const file of violations) console.error(`- ${file}`);
  for (const item of sourceViolations) console.error(`- ${item}`);
  console.error('Hãy bỏ theo dõi các file trên. Chỉ data/backup-config.default.json được phép phát hành.');
  process.exit(1);
}

console.log('Data safety PASS: GitHub không theo dõi dữ liệu Preview, backup thật hoặc cấu hình sao lưu runtime.');
