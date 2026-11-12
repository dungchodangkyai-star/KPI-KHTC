import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const catalog = readJson('config/department-features.json');
const deployments = readJson('config/deployments.json');
const featureKeys = Object.keys(catalog.features || {});

if (!featureKeys.length) throw new Error('Danh mục tính năng riêng đang trống.');
if (new Set(featureKeys).size !== featureKeys.length) throw new Error('Danh mục tính năng riêng có khóa trùng.');

const registrySource = fs.readFileSync(path.join(root, 'src/deploymentFeatures.ts'), 'utf8');
const registryBlock = registrySource.match(/DEPLOYMENT_FEATURE_KEYS\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] || '';
const registryKeys = [...registryBlock.matchAll(/['"]([A-Za-z0-9]+)['"]/g)].map((match) => match[1]);
const sameKeys = (a, b) => a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);
if (!sameKeys(featureKeys, registryKeys)) {
  throw new Error(`Danh mục config và DEPLOYMENT_FEATURE_KEYS không đồng nhất: catalog=${featureKeys.join(',')} registry=${registryKeys.join(',')}`);
}

function validateExplicitFlags(owner, flags) {
  if (!flags || Array.isArray(flags) || typeof flags !== 'object') {
    throw new Error(`${owner}.features phải là object và phải khai báo tường minh.`);
  }
  const keys = Object.keys(flags);
  if (!sameKeys(featureKeys, keys)) {
    throw new Error(`${owner}.features phải khai báo đủ và chỉ gồm: ${featureKeys.join(', ')}`);
  }
  for (const key of featureKeys) {
    if (typeof flags[key] !== 'boolean') throw new Error(`${owner}.features.${key} phải là true hoặc false.`);
  }
}

validateExplicitFlags('defaults', deployments.defaults?.features);
for (const deployment of deployments.deployments || []) {
  validateExplicitFlags(`deployment ${deployment.code}`, deployment.features);
}

const frontendRoot = path.join(root, catalog.frontendRoot);
const serverRoot = path.join(root, catalog.serverRoot);

function validateFeatureDirectories(baseDir, side) {
  if (!fs.existsSync(baseDir)) return;
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!featureKeys.includes(entry.name)) {
      throw new Error(`Thư mục ${side} chưa đăng ký trong danh mục: ${path.relative(root, path.join(baseDir, entry.name))}`);
    }
    const entryFile = path.join(baseDir, entry.name, side === 'frontend' ? 'index.tsx' : 'index.ts');
    if (!fs.existsSync(entryFile)) throw new Error(`Thiếu entrypoint bắt buộc: ${path.relative(root, entryFile)}`);
    const source = fs.readFileSync(entryFile, 'utf8');
    const requiredBoundary = side === 'frontend' ? 'DepartmentFeature' : 'mountDepartmentFeatureRouter';
    if (!source.includes(requiredBoundary) || !source.includes(entry.name)) {
      throw new Error(`${path.relative(root, entryFile)} phải dùng ${requiredBoundary} và khai báo khóa ${entry.name}.`);
    }
  }
}

validateFeatureDirectories(frontendRoot, 'frontend');
validateFeatureDirectories(serverRoot, 'server');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const serverFiles = [path.join(root, 'server.ts'), ...walk(path.join(root, 'server'))];
for (const file of serverFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const isBoundary = relative === 'server/departmentFeatureRouter.ts';
  const isGateDefinition = relative === 'server/featureGate.ts';
  const isTest = /(^|\/)test[^/]*\.ts$/.test(relative);
  if (!isBoundary && source.includes('/api/department-features')) {
    throw new Error(`API tính năng riêng phải được gắn qua mountDepartmentFeatureRouter, không khai báo trực tiếp tại ${path.relative(root, file)}.`);
  }
  if (!isBoundary && !isGateDefinition && !isTest && source.includes('requireDeploymentFeature(')) {
    throw new Error(`Không gọi requireDeploymentFeature trực tiếp tại ${relative}; phải dùng mountDepartmentFeatureRouter trong entrypoint của module.`);
  }
}

for (const file of walk(path.join(root, 'src'))) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const isBoundary = relative === 'src/DepartmentFeature.tsx';
  const isHookDefinition = relative === 'src/contexts/OrgContext.tsx';
  if (!isBoundary && !isHookDefinition && fs.readFileSync(file, 'utf8').includes('useFeatureFlag(')) {
    throw new Error(`Không gọi useFeatureFlag trực tiếp tại ${relative}; phải bọc module bằng DepartmentFeature.`);
  }
}

console.log(`DEPARTMENT ISOLATION: PASSED (${featureKeys.length} feature flags, ${(deployments.deployments || []).length} deployments).`);
