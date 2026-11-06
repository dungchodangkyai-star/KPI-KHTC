import { execFileSync } from 'node:child_process';

const forbiddenExact = new Set([
  'data/db-local-store.json',
  'data/backup-config.json'
]);

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

const violations = trackedFiles().filter((file) =>
  forbiddenExact.has(file) || /^public\/assets\/aistudio\/backup_.*\.json$/i.test(file)
);

if (violations.length) {
  console.error('PHÁT HIỆN DỮ LIỆU THẬT/CẤU HÌNH RUNTIME ĐANG ĐƯỢC GIT THEO DÕI:');
  for (const file of violations) console.error(`- ${file}`);
  console.error('Hãy bỏ theo dõi các file trên. Chỉ data/backup-config.default.json được phép phát hành.');
  process.exit(1);
}

console.log('Data safety PASS: GitHub không theo dõi dữ liệu Preview, backup thật hoặc cấu hình sao lưu runtime.');
