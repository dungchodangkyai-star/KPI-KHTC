import type { OrgConfig } from '../src/types.ts';

export interface DeploymentRuntimeConfig {
  code: string;
  name: string;
  shortName: string;
  parentAgency?: string;
  systemTitle?: string;
  location?: string;
  appUrl?: string;
  themeColor: string;
}

function readEnv(name: string): string | undefined {
  const value = String(process.env[name] || '').trim();
  return value || undefined;
}

function normalizeCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(normalized)) {
    throw new Error(`DEPLOYMENT_CODE không hợp lệ: ${value}`);
  }
  return normalized;
}

export function getDeploymentRuntimeConfig(): DeploymentRuntimeConfig {
  const code = normalizeCode(readEnv('DEPLOYMENT_CODE') || 'khtc');
  const name = readEnv('DEPLOYMENT_NAME') || 'Phòng Kế hoạch - Tài chính';
  const shortName = readEnv('DEPLOYMENT_SHORT_NAME') || 'KHTC';
  const themeColor = readEnv('THEME_COLOR') || '#1F4E78';

  if (!/^#[0-9a-f]{6}$/i.test(themeColor)) {
    throw new Error(`THEME_COLOR không hợp lệ: ${themeColor}`);
  }

  return {
    code,
    name,
    shortName,
    parentAgency: readEnv('PARENT_AGENCY'),
    systemTitle: readEnv('SYSTEM_TITLE'),
    location: readEnv('ORG_LOCATION'),
    appUrl: readEnv('APP_URL'),
    themeColor
  };
}

export function getDeploymentOrgConfig(base: OrgConfig): OrgConfig {
  const deployment = getDeploymentRuntimeConfig();
  return {
    ...base,
    parentAgency: deployment.parentAgency || base.parentAgency,
    departmentName: deployment.name,
    shortName: deployment.shortName,
    systemTitle: deployment.systemTitle || base.systemTitle,
    location: deployment.location || base.location,
    footerNote: `Hệ thống Quản lý công việc & Đánh giá KPI — ${deployment.name}`
  };
}
