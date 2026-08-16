import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  host: process.env.SQL_HOST || '127.0.0.1',
  user: process.env.SQL_USER || 'postgres',
  password: process.env.SQL_PASSWORD || 'password',
  database: process.env.SQL_DB_NAME || 'postgres',
});
async function alter() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN phone TEXT;");
    console.log("Added phone column");
  } catch (e) {
    console.log(e.message);
  }
  try {
    await pool.query("ALTER TABLE users ADD COLUMN zalo TEXT;");
    console.log("Added zalo column");
  } catch (e) {
    console.log(e.message);
  }
  process.exit(0);
}
alter();
