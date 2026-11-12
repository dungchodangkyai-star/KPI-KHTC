import type { Express, Router } from 'express';
import type { DeploymentFeatureKey } from '../src/deploymentFeatures.ts';
import { requireSessionAuthenticated } from './auth.ts';
import { requireDeploymentFeature } from './featureGate.ts';

export const DEPARTMENT_FEATURE_API_PREFIX = '/api/department-features';

/**
 * The only supported server boundary for department-specific APIs.
 * Authentication and the deployment feature gate are always installed before
 * a feature router, so UI hiding can never become an authorization bypass.
 */
export function mountDepartmentFeatureRouter(
  app: Express,
  feature: DeploymentFeatureKey,
  router: Router
): void {
  app.use(
    `${DEPARTMENT_FEATURE_API_PREFIX}/${feature}`,
    requireSessionAuthenticated,
    requireDeploymentFeature(feature),
    router
  );
}
