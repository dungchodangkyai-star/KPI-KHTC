import { pool } from '../src/db/index.ts';

/**
 * Migration script to ensure all tables and all required columns exist in PostgreSQL
 * Prevents missing column errors (e.g. created_at, b3_score, etc.)
 */
export interface SchemaSyncResult {
  success: boolean;
  message: string;
  errorDetail?: {
    code?: string;
    routine?: string;
    table?: string;
    column?: string;
    detail?: string;
    message?: string;
  };
}

export async function ensureDatabaseSchema(poolOrClient?: any): Promise<SchemaSyncResult> {
  let client: any = null;
  let shouldRelease = false;

  try {
    if (poolOrClient && typeof poolOrClient.query === 'function' && typeof poolOrClient.release === 'function') {
      client = poolOrClient;
      shouldRelease = false;
    } else if (poolOrClient && typeof poolOrClient.connect === 'function') {
      client = await poolOrClient.connect();
      shouldRelease = true;
    } else {
      client = await pool.connect();
      shouldRelease = true;
    }

    try {
      await client.query('BEGIN');

      // 1. Create tables if they do not exist
      await client.query(`
        -- 1. USERS
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          uid TEXT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT,
          zalo TEXT,
          position TEXT DEFAULT 'Chuyên viên',
          "group" TEXT DEFAULT 'Kế hoạch - Tài chính',
          role TEXT DEFAULT 'STAFF',
          status TEXT DEFAULT 'Đang làm',
          permissions TEXT,
          password TEXT,
          must_change_password BOOLEAN DEFAULT FALSE,
          last_login_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 2. CATEGORIES
        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'TASK',
          properties JSONB DEFAULT '{}'::jsonb,
          status TEXT DEFAULT 'Đang áp dụng',
          "order" INTEGER DEFAULT 0,
          description TEXT,
          parent_id INTEGER,
          order_num INTEGER,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 3. WORKS
        CREATE TABLE IF NOT EXISTS works (
          id SERIAL PRIMARY KEY,
          work_id TEXT NOT NULL UNIQUE,
          month TEXT NOT NULL,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          task_group TEXT,
          task_name TEXT,
          task_code TEXT,
          detail TEXT,
          start_date TIMESTAMP,
          start_time TEXT,
          end_date TIMESTAMP,
          end_time TEXT,
          actual_end_date TIMESTAMP,
          hours TEXT,
          days INTEGER,
          proposed_nature TEXT,
          approved_nature TEXT,
          coef TEXT,
          base_score TEXT,
          converted_score TEXT,
          self_converted_score TEXT,
          approved_converted_score TEXT,
          status TEXT DEFAULT 'Đang xử lý',
          evidence TEXT,
          product_type TEXT,
          product_qty INTEGER,
          unit TEXT,
          project TEXT,
          related_unit TEXT,
          late_reason TEXT,
          penalty_exemption TEXT,
          edit_note TEXT,
          leader_approval TEXT DEFAULT 'Chưa duyệt',
          leader_note TEXT,
          approver_id INTEGER REFERENCES users(id),
          approval_date TIMESTAMP,
          source TEXT DEFAULT 'WEBAPP',
          data_status TEXT,
          sys_note TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 4. ASSIGNMENTS
        CREATE TABLE IF NOT EXISTS assignments (
          id SERIAL PRIMARY KEY,
          assignment_id TEXT NOT NULL UNIQUE,
          month TEXT NOT NULL,
          assigner_id INTEGER REFERENCES users(id),
          receiver_id INTEGER REFERENCES users(id),
          task_group TEXT,
          task_name TEXT,
          task_code TEXT,
          base_score TEXT,
          suggested_nature TEXT,
          suggested_coef TEXT,
          expected_converted_score TEXT,
          detail TEXT,
          assign_date TIMESTAMP DEFAULT NOW(),
          start_date TIMESTAMP,
          deadline TIMESTAMP,
          product_required TEXT,
          product_type TEXT,
          product_qty INTEGER,
          unit TEXT,
          priority TEXT,
          receive_status TEXT DEFAULT 'Chưa xem',
          view_date TIMESTAMP,
          receive_date TIMESTAMP,
          work_id INTEGER REFERENCES works(id),
          leader_note TEXT,
          receiver_note TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 5. OVERTIMES
        CREATE TABLE IF NOT EXISTS overtimes (
          id SERIAL PRIMARY KEY,
          ot_id TEXT NOT NULL UNIQUE,
          month TEXT NOT NULL,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          reg_date TIMESTAMP DEFAULT NOW(),
          ot_date TIMESTAMP NOT NULL,
          start_time TEXT,
          end_time TEXT,
          break_minutes INTEGER DEFAULT 0,
          total_reg_hours TEXT,
          content TEXT,
          reason TEXT,
          project TEXT,
          expected_result TEXT,
          actual_result TEXT,
          evidence TEXT,
          employee_note TEXT,
          approval_status TEXT DEFAULT 'Chờ duyệt',
          approved_hours TEXT,
          approver_note TEXT,
          approver_id INTEGER REFERENCES users(id),
          approval_date TIMESTAMP,
          allow_edit BOOLEAN DEFAULT FALSE,
          data_status TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 6. KPI_RESULTS
        CREATE TABLE IF NOT EXISTS kpi_results (
          id SERIAL PRIMARY KEY,
          kpi_id TEXT NOT NULL UNIQUE,
          month TEXT NOT NULL,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          a_score TEXT,
          b1_score TEXT,
          b2_score TEXT,
          b3_score TEXT,
          b_score TEXT,
          c1_score TEXT,
          c2_score TEXT,
          c_score TEXT,
          d_score TEXT,
          total_kpi TEXT,
          rank TEXT DEFAULT 'Chưa chốt',
          registered_works INTEGER DEFAULT 0,
          approved_works INTEGER DEFAULT 0,
          pending_works INTEGER DEFAULT 0,
          supplement_works INTEGER DEFAULT 0,
          rejected_works INTEGER DEFAULT 0,
          approved_hours NUMERIC,
          converted_score NUMERIC,
          personal_share NUMERIC,
          warning TEXT,
          locked_status TEXT DEFAULT 'Chưa chốt',
          details_a JSONB DEFAULT '{}'::jsonb,
          details_b JSONB DEFAULT '{}'::jsonb,
          details_c JSONB DEFAULT '{}'::jsonb,
          details_d JSONB DEFAULT '{}'::jsonb,
          note TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 7. NOTIFICATIONS
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          notify_id TEXT NOT NULL UNIQUE,
          sender_id INTEGER REFERENCES users(id),
          receiver_id INTEGER REFERENCES users(id),
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          related_target TEXT,
          status TEXT DEFAULT 'Chưa xem',
          view_date TIMESTAMP,
          note TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 8. SYSTEM_LOGS
        CREATE TABLE IF NOT EXISTS system_logs (
          id SERIAL PRIMARY KEY,
          log_id TEXT NOT NULL UNIQUE,
          user_id INTEGER REFERENCES users(id),
          action TEXT NOT NULL,
          target TEXT,
          result TEXT DEFAULT 'Thành công',
          note TEXT,
          details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 9. WEB PUSH SETTINGS (additive, independent from business data)
        CREATE TABLE IF NOT EXISTS push_settings (
          id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          vapid_public_key TEXT NOT NULL,
          vapid_private_key TEXT NOT NULL,
          subject TEXT NOT NULL DEFAULT 'mailto:admin@kpi.internal',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        -- 10. WEB PUSH SUBSCRIPTIONS (one user may use multiple devices)
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id BIGSERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          device_label TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          last_seen_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active
          ON push_subscriptions(user_id, active);

        -- 11. MIGRATION METADATA (persistent migration completion state)
        CREATE TABLE IF NOT EXISTS migration_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // 2. ALTER TABLE ... ADD COLUMN IF NOT EXISTS for all existing tables to guarantee schema sync
      await client.query(`
        -- Users columns
        ALTER TABLE users ADD COLUMN IF NOT EXISTS uid TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS zalo TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS position TEXT DEFAULT 'Chuyên viên';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "group" TEXT DEFAULT 'Kế hoạch - Tài chính';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'STAFF';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Đang làm';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

        -- Categories columns
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Đang áp dụng';
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS order_num INTEGER;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

        -- Works columns
        ALTER TABLE works ADD COLUMN IF NOT EXISTS start_time TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS end_time TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS actual_end_date TIMESTAMP;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS hours TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS days INTEGER;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS proposed_nature TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS approved_nature TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS coef TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS base_score TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS converted_score TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS self_converted_score TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS approved_converted_score TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Đang xử lý';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS evidence TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS product_type TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS product_qty INTEGER;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS unit TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS project TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS related_unit TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS late_reason TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS penalty_exemption TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS edit_note TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS leader_approval TEXT DEFAULT 'Chưa duyệt';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS leader_note TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS approver_id INTEGER REFERENCES users(id);
        ALTER TABLE works ADD COLUMN IF NOT EXISTS approval_date TIMESTAMP;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'WEBAPP';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS data_status TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS sys_note TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE works ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

        -- Assignments columns
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS base_score TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS suggested_nature TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS suggested_coef TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS expected_converted_score TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS detail TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS assign_date TIMESTAMP DEFAULT NOW();
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS deadline TIMESTAMP;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS product_required TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS product_type TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS product_qty INTEGER;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS unit TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS priority TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS receive_status TEXT DEFAULT 'Chưa xem';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS view_date TIMESTAMP;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS receive_date TIMESTAMP;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS work_id INTEGER REFERENCES works(id);
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS leader_note TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS receiver_note TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

        -- Overtimes columns
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS reg_date TIMESTAMP DEFAULT NOW();
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS start_time TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS end_time TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS break_minutes INTEGER DEFAULT 0;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS total_reg_hours TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS content TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS reason TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS project TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS expected_result TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS actual_result TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS evidence TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS employee_note TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'Chờ duyệt';
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS approved_hours TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS approver_note TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS approver_id INTEGER REFERENCES users(id);
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS approval_date TIMESTAMP;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS allow_edit BOOLEAN DEFAULT FALSE;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS data_status TEXT;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

        -- KPI results columns
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS a_score TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS b1_score TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS b2_score TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS b3_score TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS b_score TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS c1_score TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS c2_score TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS c_score TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS d_score TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS total_kpi TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS rank TEXT DEFAULT 'Chưa chốt';
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS registered_works INTEGER DEFAULT 0;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS approved_works INTEGER DEFAULT 0;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS pending_works INTEGER DEFAULT 0;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS supplement_works INTEGER DEFAULT 0;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS rejected_works INTEGER DEFAULT 0;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS approved_hours NUMERIC;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS converted_score NUMERIC;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS personal_share NUMERIC;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS warning TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS locked_status TEXT DEFAULT 'Chưa chốt';
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS details_a JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS details_b JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS details_c JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS details_d JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS note TEXT;
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE kpi_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

        -- Notifications columns
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS note TEXT;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

        -- System Logs columns
        ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `);

      // 3. Create indexes for high performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_works_user_month ON works(user_id, month);
        CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
        CREATE INDEX IF NOT EXISTS idx_assignments_receiver_month ON assignments(receiver_id, month);
        CREATE INDEX IF NOT EXISTS idx_overtimes_user_month ON overtimes(user_id, month);
        CREATE INDEX IF NOT EXISTS idx_kpi_results_user_month ON kpi_results(user_id, month);
        CREATE INDEX IF NOT EXISTS idx_notifications_receiver ON notifications(receiver_id, status);
      `);

      await client.query('COMMIT');
      return { success: true, message: 'Database schema verified and up-to-date' };
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      console.error('[SchemaSync] Error during transaction:', err?.message || String(err));
      return { 
        success: false, 
        message: `Database schema synchronization failed: ${err?.message || String(err)}`,
        errorDetail: {
          code: err?.code,
          routine: err?.routine,
          table: err?.table,
          column: err?.column,
          detail: err?.detail,
          message: err?.message || String(err)
        }
      };
    } finally {
      if (shouldRelease && client) {
        try {
          client.release();
        } catch {}
      }
    }
  } catch (err: any) {
    console.error('[SchemaSync] Connection error:', err?.message || String(err));
    return { 
      success: false, 
      message: `Database schema synchronization failed: ${err?.message || String(err)}`,
      errorDetail: {
        message: err?.message || String(err)
      }
    };
  }
}

export interface SchemaPreflightResult {
  compatible: boolean;
  isLegacySchema: boolean;
  existingPublicTables: string[];
  canonicalTablesPresent: string[];
  canonicalTablesMissing: string[];
  incompatibleColumns: Array<{
    table: string;
    column: string;
    actualType: string;
    expectedType: string;
    reason: string;
  }>;
  message: string;
  suggestedAction?: string;
}

/**
 * Preflight schema validation: inspects public schema on PostgreSQL to determine
 * whether it is fully compatible with canonical schema or contains legacy structure
 * (such as users.id being TEXT/UUID instead of INTEGER, or missing canonical tables).
 */
export async function validateSchemaPreflight(poolOrClient?: any): Promise<SchemaPreflightResult> {
  let client: any = null;
  let shouldRelease = false;

  try {
    if (poolOrClient && typeof poolOrClient.query === 'function') {
      client = poolOrClient;
      shouldRelease = typeof poolOrClient.release === 'function';
    } else if (poolOrClient && typeof poolOrClient.connect === 'function') {
      client = await poolOrClient.connect();
      shouldRelease = true;
    } else {
      client = await pool.connect();
      shouldRelease = true;
    }

    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const existingTables: string[] = tableRes.rows.map((r: any) => r.table_name);

    const canonicalRequired = ['users', 'categories', 'works', 'assignments', 'overtimes', 'kpi_results', 'notifications', 'system_logs'];
    const canonicalPresent = canonicalRequired.filter(t => existingTables.includes(t));
    const canonicalMissing = canonicalRequired.filter(t => !existingTables.includes(t));

    const incompatibleColumns: Array<{
      table: string;
      column: string;
      actualType: string;
      expectedType: string;
      reason: string;
    }> = [];

    // Check critical column types if tables exist
    if (existingTables.includes('users')) {
      const colRes = await client.query(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
      `);
      const idCol = colRes.rows[0];
      if (idCol && !['integer', 'int4', 'int8', 'smallint', 'bigint'].includes(idCol.data_type.toLowerCase()) && !['int4', 'int8', 'serial'].includes(idCol.udt_name.toLowerCase())) {
        incompatibleColumns.push({
          table: 'users',
          column: 'id',
          actualType: idCol.data_type,
          expectedType: 'integer',
          reason: `users.id có kiểu '${idCol.data_type}' không tương thích với schema chuẩn (SERIAL/INTEGER); đây là schema legacy (ID TEXT/UUID).`
        });
      }
    }

    if (existingTables.includes('works')) {
      const colRes = await client.query(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'works' AND column_name IN ('id', 'user_id')
      `);
      for (const r of colRes.rows) {
        if (!['integer', 'int4', 'int8', 'smallint', 'bigint'].includes(r.data_type.toLowerCase()) && !['int4', 'int8', 'serial'].includes(r.udt_name.toLowerCase())) {
          incompatibleColumns.push({
            table: 'works',
            column: r.column_name,
            actualType: r.data_type,
            expectedType: 'integer',
            reason: `works.${r.column_name} có kiểu '${r.data_type}' không tương thích với schema chuẩn (SERIAL/INTEGER); đây là schema legacy (ID TEXT/UUID).`
          });
        }
      }
    }

    const isLegacy = incompatibleColumns.length > 0 || (canonicalMissing.length > 0 && existingTables.length > 0);
    const compatible = !isLegacy && canonicalMissing.length === 0 && incompatibleColumns.length === 0;

    let message = 'Schema public hoàn toàn tương thích với chuẩn canonical.';
    let suggestedAction = 'Sẵn sàng phục hồi hoặc đồng bộ dữ liệu.';

    if (!compatible) {
      if (incompatibleColumns.length > 0) {
        message = `Phát hiện ${incompatibleColumns.length} cột không tương thích: ${incompatibleColumns.map(c => `${c.table}.${c.column} [${c.actualType} != ${c.expectedType}]`).join(', ')}.`;
      } else if (canonicalMissing.length > 0) {
        message = `Thiếu ${canonicalMissing.length} bảng canonical: ${canonicalMissing.join(', ')}.`;
      }
      suggestedAction = 'Cần chuyển bảo toàn các bảng hiện hữu sang schema legacy_pre_restore_20261027 trước khi tạo schema canonical và phục hồi dữ liệu.';
    }

    return {
      compatible,
      isLegacySchema: isLegacy,
      existingPublicTables: existingTables,
      canonicalTablesPresent: canonicalPresent,
      canonicalTablesMissing: canonicalMissing,
      incompatibleColumns,
      message,
      suggestedAction
    };
  } catch (err: any) {
    return {
      compatible: false,
      isLegacySchema: true,
      existingPublicTables: [],
      canonicalTablesPresent: [],
      canonicalTablesMissing: [],
      incompatibleColumns: [],
      message: `Lỗi khi kiểm tra schema preflight: ${err?.message || String(err)}`,
      suggestedAction: 'Kiểm tra lại quyền truy cập hoặc kết nối PostgreSQL.'
    };
  } finally {
    if (shouldRelease && client) {
      try {
        client.release();
      } catch {}
    }
  }
}

/**
 * Determine a collision-free preservation schema name before BEGIN transaction.
 * If the default schema (e.g. legacy_pre_restore_20261027) already contains any tables,
 * automatically generates a unique timestamp-suffixed schema name to prevent collision or overwriting.
 */
export async function determineSafeLegacySchemaName(
  clientOrPool: any, 
  baseSchemaName: string = 'legacy_pre_restore_20261027'
): Promise<{ schemaName: string; isFallback: boolean; existingCount: number }> {
  const checkRes = await clientOrPool.query(`
    SELECT COUNT(*)::int AS count 
    FROM information_schema.tables 
    WHERE table_schema = $1 AND table_type = 'BASE TABLE'
  `, [baseSchemaName]);

  const count = checkRes.rows[0]?.count || 0;
  if (count === 0) {
    return { schemaName: baseSchemaName, isFallback: false, existingCount: 0 };
  }

  // Schema already contains tables! Automatically pick a unique timestamped schema name
  const timestampSuffix = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const uniqueSchemaName = `${baseSchemaName}_${timestampSuffix}`;
  return { schemaName: uniqueSchemaName, isFallback: true, existingCount: count };
}

/**
 * Move all tables in public schema into a designated preservation schema (e.g. legacy_pre_restore_20261027)
 * Safe operation: zero DROP, zero DELETE.
 */
export async function movePublicTablesToLegacySchema(
  client: any, 
  legacySchemaName: string = 'legacy_pre_restore_20261027'
): Promise<{
  success: boolean;
  movedTables: string[];
  message: string;
}> {
  // 1. Safety check: Abort if preservation schema already exists AND contains tables
  const existingInLegacyRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = $1 AND table_type = 'BASE TABLE'
  `, [legacySchemaName]);

  if (existingInLegacyRes.rows.length > 0) {
    const existingTableNames = existingInLegacyRes.rows.map((r: any) => r.table_name);
    throw new Error(
      `[Safety Abort] Schema bảo toàn '${legacySchemaName}' đã tồn tại và đang chứa ${existingTableNames.length} bảng (${existingTableNames.join(', ')}). Thao tác APPLY bị hủy an toàn để chống ghi đè hoặc nhập lẫn dữ liệu.`
    );
  }

  // 2. Ensure destination schema exists
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${legacySchemaName}"`);

  // 3. Query all existing public tables
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const tables: string[] = res.rows.map((r: any) => r.table_name);
  const movedTables: string[] = [];

  // 4. Move tables and all their associated constraints/indexes to legacy schema
  for (const t of tables) {
    await client.query(`ALTER TABLE public."${t}" SET SCHEMA "${legacySchemaName}"`);
    movedTables.push(t);
  }

  // 5. Move sequences in public schema to preserve integrity and avoid naming collision
  try {
    const seqRes = await client.query(`
      SELECT sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_schema = 'public'
    `);
    for (const s of seqRes.rows) {
      try {
        await client.query(`ALTER SEQUENCE public."${s.sequence_name}" SET SCHEMA "${legacySchemaName}"`);
      } catch {}
    }
  } catch {}

  return {
    success: true,
    movedTables,
    message: `Đã bảo toàn thành công ${movedTables.length} bảng sang schema ${legacySchemaName}: ${movedTables.join(', ')}`
  };
}

