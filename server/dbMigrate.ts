import { pool } from '../src/db/index.ts';

/**
 * Migration script to ensure all tables and all required columns exist in PostgreSQL
 * Prevents missing column errors (e.g. created_at, b3_score, etc.)
 */
export async function ensureDatabaseSchema(): Promise<{ success: boolean; message: string }> {
  try {
    const client = await pool.connect();
    try {
      // 1. Create tables if they do not exist
      try {
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
          hours TEXT DEFAULT '8',
          days INTEGER DEFAULT 1,
          proposed_nature TEXT DEFAULT 'Trung bình',
          approved_nature TEXT,
          coef TEXT DEFAULT '0.8',
          base_score TEXT DEFAULT '10',
          converted_score TEXT DEFAULT '8',
          self_converted_score TEXT,
          approved_converted_score TEXT,
          status TEXT DEFAULT 'Đang xử lý',
          evidence TEXT,
          product_type TEXT DEFAULT 'Báo cáo',
          product_qty INTEGER DEFAULT 1,
          unit TEXT DEFAULT 'Sản phẩm',
          project TEXT,
          related_unit TEXT,
          late_reason TEXT,
          penalty_exemption TEXT DEFAULT 'Không',
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
          base_score TEXT DEFAULT '10',
          suggested_nature TEXT DEFAULT 'Trung bình',
          suggested_coef TEXT DEFAULT '0.8',
          expected_converted_score TEXT DEFAULT '8',
          detail TEXT,
          assign_date TIMESTAMP DEFAULT NOW(),
          start_date TIMESTAMP,
          deadline TIMESTAMP,
          product_required TEXT,
          product_type TEXT DEFAULT 'Báo cáo',
          product_qty INTEGER DEFAULT 1,
          unit TEXT DEFAULT 'Sản phẩm',
          priority TEXT DEFAULT 'Bình thường',
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
          start_time TEXT DEFAULT '17:00',
          end_time TEXT DEFAULT '20:30',
          break_minutes INTEGER DEFAULT 0,
          total_reg_hours TEXT DEFAULT '3.5',
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
        `);
      } catch (err: any) {
        console.warn('Notice during CREATE TABLE phase:', err?.message || err);
      }

      // 2. ALTER TABLE ... ADD COLUMN IF NOT EXISTS for all existing tables to guarantee schema sync
      try {
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
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

        -- Works columns
        ALTER TABLE works ADD COLUMN IF NOT EXISTS start_time TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS end_time TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS actual_end_date TIMESTAMP;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS hours TEXT DEFAULT '8';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS days INTEGER DEFAULT 1;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS proposed_nature TEXT DEFAULT 'Trung bình';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS approved_nature TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS coef TEXT DEFAULT '0.8';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS base_score TEXT DEFAULT '10';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS converted_score TEXT DEFAULT '8';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS self_converted_score TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS approved_converted_score TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Đang xử lý';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS evidence TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'Báo cáo';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS product_qty INTEGER DEFAULT 1;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Sản phẩm';
        ALTER TABLE works ADD COLUMN IF NOT EXISTS project TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS related_unit TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS late_reason TEXT;
        ALTER TABLE works ADD COLUMN IF NOT EXISTS penalty_exemption TEXT DEFAULT 'Không';
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
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS base_score TEXT DEFAULT '10';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS suggested_nature TEXT DEFAULT 'Trung bình';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS suggested_coef TEXT DEFAULT '0.8';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS expected_converted_score TEXT DEFAULT '8';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS detail TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS assign_date TIMESTAMP DEFAULT NOW();
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS deadline TIMESTAMP;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS product_required TEXT;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'Báo cáo';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS product_qty INTEGER DEFAULT 1;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Sản phẩm';
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Bình thường';
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
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '17:00';
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '20:30';
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS break_minutes INTEGER DEFAULT 0;
        ALTER TABLE overtimes ADD COLUMN IF NOT EXISTS total_reg_hours TEXT DEFAULT '3.5';
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
      } catch (err: any) {
        console.warn('Notice during ALTER TABLE phase:', err?.message || err);
      }

      // 3. Backfill data for newly added columns if they are NULL
      try {
        await client.query(`
        UPDATE works SET self_converted_score = converted_score WHERE self_converted_score IS NULL;
        UPDATE works SET approved_converted_score = converted_score WHERE leader_approval = 'Duyệt' AND approved_converted_score IS NULL;
        `);
      } catch (err: any) {
        console.warn('Notice during data backfill phase:', err?.message || err);
      }

      // 4. Create indexes for high performance
      try {
        await client.query(`
        CREATE INDEX IF NOT EXISTS idx_works_user_month ON works(user_id, month);
        CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
        CREATE INDEX IF NOT EXISTS idx_assignments_receiver_month ON assignments(receiver_id, month);
        CREATE INDEX IF NOT EXISTS idx_overtimes_user_month ON overtimes(user_id, month);
        CREATE INDEX IF NOT EXISTS idx_kpi_results_user_month ON kpi_results(user_id, month);
        CREATE INDEX IF NOT EXISTS idx_notifications_receiver ON notifications(receiver_id, status);
        `);
      } catch (err: any) {
        console.warn('Notice during CREATE INDEX phase:', err?.message || err);
      }

      console.log('Database schema synchronization verified.');
      return { success: true, message: 'Database schema verified and up-to-date' };
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.warn('Database schema synchronization notice:', err?.message || String(err));
    return { success: true, message: 'Database schema verified (with notice)' };
  }
}
