import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDeploymentRuntimeConfig } from './deploymentConfig.ts';
import { requireDeploymentFeature } from './featureGate.ts';
import { DEPLOYMENT_FEATURE_KEYS } from '../src/deploymentFeatures.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/deployments.json'), 'utf8'));
const envNames = ['DEPLOYMENT_CODE', 'DEPLOYMENT_NAME', 'DEPLOYMENT_SHORT_NAME', 'THEME_COLOR', 'DEPLOYMENT_FEATURES_JSON'] as const;
const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

function disabledResponse() {
  let status = 0;
  return {
    response: {
      status(code: number) { status = code; return this; },
      json() { return this; }
    } as any,
    getStatus: () => status
  };
}

try {
  for (const deployment of config.deployments) {
    process.env.DEPLOYMENT_CODE = deployment.code;
    process.env.DEPLOYMENT_NAME = deployment.name;
    process.env.DEPLOYMENT_SHORT_NAME = deployment.shortName;
    process.env.THEME_COLOR = deployment.themeColor;
    process.env.DEPLOYMENT_FEATURES_JSON = JSON.stringify(deployment.features);
    const runtime = getDeploymentRuntimeConfig();
    assert.deepEqual(runtime.features, deployment.features, `Sai ma trận tính năng của ${deployment.code}`);

    for (const feature of DEPLOYMENT_FEATURE_KEYS) {
      let nextCalled = false;
      const disabled = disabledResponse();
      requireDeploymentFeature(feature)({} as any, disabled.response, () => { nextCalled = true; });
      if (deployment.features[feature]) {
        assert.equal(nextCalled, true, `${deployment.code}.${feature} phải được phép`);
      } else {
        assert.equal(nextCalled, false, `${deployment.code}.${feature} không được gọi next()`);
        assert.equal(disabled.getStatus(), 404, `${deployment.code}.${feature} phải bị chặn`);
      }
    }
  }
  console.log(`DEPARTMENT FEATURE MATRIX: PASSED (${config.deployments.length} deployments).`);
} finally {
  for (const name of envNames) {
    const value = previous[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
