import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'config', 'deployments.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const requiredDefaults = [
  'projectId', 'projectNumber', 'region', 'container', 'artifactRepository',
  'imageName', 'backupBucket', 'workloadIdentityProvider', 'serviceAccount'
];
for (const key of requiredDefaults) {
  if (!String(config.defaults?.[key] || '').trim()) throw new Error(`Thiếu defaults.${key}`);
}

if (!Array.isArray(config.deployments) || config.deployments.length === 0) {
  throw new Error('deployments phải có ít nhất một phòng ban.');
}

const unique = {
  code: new Set(),
  service: new Set(),
  databaseSecret: new Set(),
  fixedUrl: new Set()
};

for (const deployment of config.deployments) {
  for (const field of ['code', 'name', 'shortName', 'service', 'databaseSecret', 'fixedUrl', 'themeColor']) {
    if (!String(deployment[field] || '').trim()) throw new Error(`Thiếu ${field} trong một deployment.`);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(deployment.code)) throw new Error(`code không hợp lệ: ${deployment.code}`);
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(deployment.service)) throw new Error(`service không hợp lệ: ${deployment.service}`);
  if (!/^https:\/\//.test(deployment.fixedUrl)) throw new Error(`fixedUrl phải dùng HTTPS: ${deployment.fixedUrl}`);
  if (!/^#[0-9a-f]{6}$/i.test(deployment.themeColor)) throw new Error(`themeColor không hợp lệ: ${deployment.themeColor}`);

  for (const field of Object.keys(unique)) {
    const value = deployment[field];
    if (unique[field].has(value)) throw new Error(`${field} bị trùng: ${value}`);
    unique[field].add(value);
  }
}

const enabled = config.deployments.filter((item) => item.enabled !== false);
if (enabled.length === 0) throw new Error('Không có deployment nào đang bật.');

console.log(`Cấu hình hợp lệ: ${enabled.length} deployment đang bật (${enabled.map((item) => item.code).join(', ')}).`);
