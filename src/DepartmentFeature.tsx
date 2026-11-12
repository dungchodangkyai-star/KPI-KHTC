import type { ReactNode } from 'react';
import type { DeploymentFeatureKey } from './deploymentFeatures.ts';
import { useFeatureFlag } from './contexts/OrgContext.tsx';

interface DepartmentFeatureProps {
  feature: DeploymentFeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * The only supported UI boundary for department-specific modules.
 * Disabled modules are not rendered for the current Cloud Run deployment.
 */
export function DepartmentFeature({ feature, children, fallback = null }: DepartmentFeatureProps) {
  return useFeatureFlag(feature) ? children : fallback;
}
