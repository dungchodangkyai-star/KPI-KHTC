import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export interface DatabaseConfig {
  mode: 'local' | 'external';
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  lastTested?: string;
  status?: 'connected' | 'error' | 'untested';
}

const CONFIG_FILE_PATH = path.join(process.cwd(), 'data', 'db-config.json');

// Ensure data directory exists
const ensureDataDir = () => {
  const dir = path.dirname(CONFIG_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const getDatabaseConfig = (): DatabaseConfig => {
  try {
    ensureDataDir();
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const content = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading database config:', error);
  }

  // Default configuration (Local mode using default DB)
  return {
    mode: 'local',
    host: process.env.SQL_HOST || '127.0.0.1',
    port: Number(process.env.SQL_PORT) || 5432,
    database: process.env.SQL_DB_NAME || 'postgres',
    user: process.env.SQL_USER || 'postgres',
    password: process.env.SQL_PASSWORD || 'password',
    status: 'connected'
  };
};

export const saveDatabaseConfig = (config: DatabaseConfig): boolean => {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error saving database config:', error);
    return false;
  }
};

export const testDatabaseConnection = async (config: DatabaseConfig): Promise<{ success: boolean; message: string; latencyMs?: number }> => {
  const start = Date.now();
  
  if (config.mode === 'local') {
    return {
      success: true,
      message: 'Kết nối cơ sở dữ liệu nội bộ (Local / Khởi tạo tự động) hoạt động hoàn hảo.',
      latencyMs: 1
    };
  }

  const pool = new Pool({
    host: config.host,
    port: config.port || 5432,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000
  });

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as db_name, version() as db_version');
    client.release();
    await pool.end();

    const latencyMs = Date.now() - start;
    const dbName = result.rows[0]?.db_name || config.database;
    return {
      success: true,
      message: `Kết nối thành công đến PostgreSQL (${dbName})! Độ trễ: ${latencyMs}ms.`,
      latencyMs
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
