import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool } = pg;
import * as schema from './schema.ts';

declare global {
  var _postgresPool: pg.Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    if (!process.env.SQL_HOST) {
      console.warn("SQL_HOST is not defined, using default connection parameters.");
    }
    
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST || '127.0.0.1',
      port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
      user: process.env.SQL_USER || 'postgres',
      password: process.env.SQL_PASSWORD || 'password',
      database: process.env.SQL_DB_NAME || 'postgres',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    global._postgresPool.on('error', (err) => {
      // Do not crash server on idle client disconnections (e.g. scale to zero / idle socket drops)
      console.warn('PostgreSQL pool idle client notification:', err?.message || err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();

export const db = drizzle(pool, { schema });

