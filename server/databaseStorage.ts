import { Pool } from 'pg';
import { getStorageMode, getDatabaseUrl, isPostgresConfigured, checkDatabaseHealth, StorageMode } from '../src/db/index.ts';

export interface DatabaseConfig {
  mode: 'local' | 'external' | 'neon' | 'postgres' | 'local-json';
  storageMode: StorageMode;
  provider: 'neon' | 'postgres' | 'local-json';
  configured: boolean;
  maskedHost?: string;
  maskedDatabase?: string;
  maskedUser?: string;
  ssl?: boolean;
  lastTested?: string;
  status: 'connected' | 'error' | 'unconfigured';
  message?: string;
}

export const getDatabaseConfig = async (): Promise<DatabaseConfig> => {
  const mode = getStorageMode();
  const configured = isPostgresConfigured();
  const health = await checkDatabaseHealth();
  const url = getDatabaseUrl();

  let maskedHost = '';
  let maskedDatabase = '';
  let maskedUser = '';

  if (url) {
    try {
      const parsed = new URL(url);
      maskedHost = parsed.hostname;
      maskedDatabase = parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'postgres';
      maskedUser = parsed.username ? `${parsed.username.slice(0, 3)}***` : '***';
    } catch {}
  }

  let status: DatabaseConfig['status'] = 'connected';
  if (mode === 'postgres') {
    if (!configured) {
      status = 'unconfigured';
    } else if (!health.connected) {
      status = 'error';
    } else {
      status = 'connected';
    }
  }

  return {
    mode: mode === 'postgres' ? 'postgres' : 'local-json',
    storageMode: mode,
    provider: health.provider,
    configured,
    maskedHost: maskedHost || (mode === 'local-json' ? 'localhost' : undefined),
    maskedDatabase: maskedDatabase || (mode === 'local-json' ? 'db-local-store.json' : undefined),
    maskedUser: maskedUser || undefined,
    ssl: mode === 'postgres',
    lastTested: health.lastSuccessfulCheck || undefined,
    status,
    message: health.error || undefined
  };
};

export const parseConnectionString = (uri: string): { host?: string; port?: number; database?: string; user?: string; ssl?: boolean } => {
  try {
    const url = new URL(uri);
    return {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 5432,
      database: url.pathname ? url.pathname.replace(/^\//, '') : 'postgres',
      user: decodeURIComponent(url.username || 'postgres'),
      ssl: url.searchParams.get('sslmode') !== 'disable' && url.searchParams.get('ssl') !== 'false'
    };
  } catch (e) {
    return {};
  }
};

export const testDatabaseConnection = async (candidateUri?: string): Promise<{ success: boolean; message: string; latencyMs?: number; provider?: string }> => {
  const uriToTest = candidateUri?.trim() || getDatabaseUrl();

  if (!uriToTest) {
    const mode = getStorageMode();
    if (mode === 'local-json') {
      return {
        success: true,
        message: 'Chế độ CSDL cục bộ JSON (local-json) đang hoạt động bình thường.',
        latencyMs: 1,
        provider: 'local-json'
      };
    }
    return {
      success: false,
      message: 'Chưa có chuỗi kết nối DATABASE_URL để kiểm tra. Vui lòng thiết lập biến môi trường DATABASE_URL trong Secrets.'
    };
  }

  const start = Date.now();
  const isNeon = uriToTest.includes('neon') || uriToTest.includes('neon.tech');
  const isSsl = !uriToTest.includes('sslmode=disable') && !uriToTest.includes('127.0.0.1') && !uriToTest.includes('localhost');

  const pool = new Pool({
    connectionString: uriToTest,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000
  });

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as db_name, version() as db_version');
    client.release();
    await pool.end();

    const latencyMs = Date.now() - start;
    const dbName = result.rows[0]?.db_name || 'postgres';
    const providerName = isNeon ? 'Neon Serverless PostgreSQL' : 'PostgreSQL';

    return {
      success: true,
      message: `Kết nối thành công đến ${providerName} (${dbName})! Độ trễ: ${latencyMs}ms.`,
      latencyMs,
      provider: isNeon ? 'neon' : 'postgres'
    };
  } catch (err: any) {
    try {
      await pool.end();
    } catch (_) {}
    return {
      success: false,
      message: `Lỗi kết nối cơ sở dữ liệu: ${err?.message || String(err)}`
    };
  }
};
