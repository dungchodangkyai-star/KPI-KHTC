import type { RequestHandler } from 'express';
import type { DeploymentFeatureKey } from '../src/deploymentFeatures.ts';
import { isDeploymentFeatureEnabled } from './deploymentConfig.ts';

/**
 * Server-side gate for every API belonging to a department-specific module.
 * Returning 404 avoids advertising disabled modules and prevents a UI-only
 * feature flag from becoming an authorization bypass.
 */
export function requireDeploymentFeature(feature: DeploymentFeatureKey): RequestHandler {
  return (_req, res, next) => {
    if (!isDeploymentFeatureEnabled(feature)) {
      return res.status(404).json({
        success: false,
        error: 'Chức năng này không được bật cho đơn vị hiện tại.'
      });
    }
    next();
  };
}

