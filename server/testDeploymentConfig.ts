import assert from 'node:assert/strict';
import { getDeploymentOrgConfig, getDeploymentRuntimeConfig } from './deploymentConfig.ts';
import { DEFAULT_ORG_CONFIG } from '../src/utils.ts';

const names = [
  'DEPLOYMENT_CODE', 'DEPLOYMENT_NAME', 'DEPLOYMENT_SHORT_NAME', 'PARENT_AGENCY',
  'SYSTEM_TITLE', 'ORG_LOCATION', 'APP_URL', 'THEME_COLOR'
] as const;
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

try {
  process.env.DEPLOYMENT_CODE = 'kythuat';
  process.env.DEPLOYMENT_NAME = 'Phòng Kỹ thuật và Thẩm định';
  process.env.DEPLOYMENT_SHORT_NAME = 'KTTĐ';
  process.env.PARENT_AGENCY = 'Cơ quan thử nghiệm';
  process.env.ORG_LOCATION = 'Đắk Lắk';
  process.env.APP_URL = 'https://kpi-kythuat.example.gov.vn';
  process.env.THEME_COLOR = '#0F766E';

  const deployment = getDeploymentRuntimeConfig();
  assert.equal(deployment.code, 'kythuat');
  assert.equal(deployment.shortName, 'KTTĐ');

  const storedKhtcConfig = {
    ...DEFAULT_ORG_CONFIG,
    departmentName: 'Tên cũ trong dữ liệu',
    shortName: 'CU'
  };
  const effective = getDeploymentOrgConfig(storedKhtcConfig);
  assert.equal(effective.departmentName, 'Phòng Kỹ thuật và Thẩm định');
  assert.equal(effective.shortName, 'KTTĐ');
  assert.equal(effective.parentAgency, 'Cơ quan thử nghiệm');
  assert.match(effective.footerNote || '', /Phòng Kỹ thuật và Thẩm định/);

  process.env.DEPLOYMENT_CODE = 'Mã Không Hợp Lệ';
  assert.throws(() => getDeploymentRuntimeConfig(), /DEPLOYMENT_CODE không hợp lệ/);
  console.log('DEPLOYMENT CONFIG TESTS: PASSED');
} finally {
  for (const name of names) {
    const value = previous[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
