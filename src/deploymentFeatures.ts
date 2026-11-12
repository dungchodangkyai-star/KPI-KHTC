/**
 * Registry of optional, department-specific modules.
 *
 * Important: KPI formulas and core approval rules must not be feature flags.
 * They require a separately reviewed, versioned rules profile. These flags are
 * only for isolated UI/API modules that are safe to enable per deployment.
 */
export const DEPLOYMENT_FEATURE_KEYS = [
  'specializedWorkFields',
  'specializedApprovalFlow',
  'specializedReports'
] as const;

export type DeploymentFeatureKey = typeof DEPLOYMENT_FEATURE_KEYS[number];
export type DeploymentFeatureFlags = Record<DeploymentFeatureKey, boolean>;

export const DEFAULT_DEPLOYMENT_FEATURES: DeploymentFeatureFlags = {
  specializedWorkFields: false,
  specializedApprovalFlow: false,
  specializedReports: false
};

export function parseDeploymentFeatureFlags(raw?: string): DeploymentFeatureFlags {
  if (!raw?.trim()) return { ...DEFAULT_DEPLOYMENT_FEATURES };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('DEPLOYMENT_FEATURES_JSON phải là JSON hợp lệ.');
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('DEPLOYMENT_FEATURES_JSON phải là một object JSON.');
  }

  const values = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(values).filter(
    (key) => !DEPLOYMENT_FEATURE_KEYS.includes(key as DeploymentFeatureKey)
  );
  if (unknownKeys.length) {
    throw new Error(`Tính năng không được đăng ký: ${unknownKeys.join(', ')}`);
  }

  const result = { ...DEFAULT_DEPLOYMENT_FEATURES };
  for (const key of DEPLOYMENT_FEATURE_KEYS) {
    if (values[key] === undefined) continue;
    if (typeof values[key] !== 'boolean') {
      throw new Error(`Cấu hình tính năng ${key} phải là true hoặc false.`);
    }
    result[key] = values[key];
  }
  return result;
}

