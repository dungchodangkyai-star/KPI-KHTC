export const DDL_SCRIPT = `-- =========================================================================
-- MÃ LỆNH SQL KHỞI TẠO CƠ SỞ DỮ LIỆU CHUẨN (DDL SCRIPT)
-- HỆ THỐNG QUẢN LÝ CÔNG VIỆC & ĐÁNH GIÁ KPI PHÒNG KẾ HOẠCH - TÀI CHÍNH
-- Tương thích 100% với PostgreSQL 14+, Supabase, Neon.tech, Synology NAS Docker, Windows PostgreSQL
-- =========================================================================

-- 1. BẢNG USERS (Người dùng & Cán bộ phòng)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uid TEXT UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    zalo TEXT,
    position TEXT,
    "group" TEXT,
    role TEXT NOT NULL DEFAULT 'STAFF',
    status TEXT NOT NULL DEFAULT 'Đang làm',
    permissions TEXT,
    password TEXT,
    must_change_password BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. BẢNG CATEGORIES (Danh mục chuẩn: Nhiệm vụ, Nhóm việc, Loại sản phẩm, Cấu hình)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    properties JSONB,
    status TEXT NOT NULL DEFAULT 'Đang dùng',
    "order" INTEGER DEFAULT 0
);

-- 3. BẢNG WORKS (Nhật ký công việc hàng ngày)
CREATE TABLE IF NOT EXISTS works (
    id SERIAL PRIMARY KEY,
    work_id TEXT UNIQUE NOT NULL,
    month TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_group TEXT,
    task_name TEXT,
    task_code TEXT,
    detail TEXT,
    start_date TIMESTAMP,
    start_time TEXT,
    end_date TIMESTAMP,
    end_time TEXT,
    actual_end_date TIMESTAMP,
    hours NUMERIC,
    days INTEGER,
    proposed_nature TEXT,
    approved_nature TEXT,
    coef NUMERIC,
    base_score NUMERIC,
    converted_score NUMERIC,
    status TEXT NOT NULL DEFAULT 'Đang xử lý',
    evidence TEXT,
    product_type TEXT,
    product_qty INTEGER DEFAULT 1,
    unit TEXT,
    project TEXT,
    related_unit TEXT,
    late_reason TEXT,
    penalty_exemption TEXT DEFAULT 'Không',
    edit_note TEXT,
    leader_approval TEXT DEFAULT 'Chưa duyệt',
    leader_note TEXT,
    approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approval_date TIMESTAMP,
    source TEXT,
    data_status TEXT DEFAULT 'OK',
    sys_note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. BẢNG ASSIGNMENTS (Giao việc & Điều hành)
CREATE TABLE IF NOT EXISTS assignments (
    id SERIAL PRIMARY KEY,
    assignment_id TEXT UNIQUE NOT NULL,
    month TEXT NOT NULL,
    assigner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_group TEXT,
    task_name TEXT,
    task_code TEXT,
    base_score NUMERIC,
    suggested_nature TEXT,
    suggested_coef NUMERIC,
    expected_converted_score NUMERIC,
    detail TEXT,
    assign_date TIMESTAMP DEFAULT NOW(),
    start_date TIMESTAMP,
    deadline TIMESTAMP,
    product_required TEXT,
    product_type TEXT,
    product_qty INTEGER,
    unit TEXT,
    priority TEXT DEFAULT 'Bình thường',
    receive_status TEXT DEFAULT 'Chưa xem',
    view_date TIMESTAMP,
    receive_date TIMESTAMP,
    work_id INTEGER REFERENCES works(id) ON DELETE SET NULL,
    leader_note TEXT,
    receiver_note TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. BẢNG NOTIFICATIONS (Thông báo hệ thống & Điều hành)
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    notify_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT,
    title TEXT,
    content TEXT,
    related_target TEXT,
    status TEXT DEFAULT 'Chưa xem',
    view_date TIMESTAMP,
    note TEXT
);

-- 6. BẢNG OVERTIMES (Đăng ký làm thêm giờ)
CREATE TABLE IF NOT EXISTS overtimes (
    id SERIAL PRIMARY KEY,
    ot_id TEXT UNIQUE NOT NULL,
    month TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reg_date TIMESTAMP DEFAULT NOW(),
    ot_date TIMESTAMP NOT NULL,
    start_time TEXT,
    end_time TEXT,
    break_minutes INTEGER DEFAULT 0,
    total_reg_hours NUMERIC,
    content TEXT,
    reason TEXT,
    project TEXT,
    expected_result TEXT,
    actual_result TEXT,
    evidence TEXT,
    employee_note TEXT,
    approval_status TEXT DEFAULT 'Chờ duyệt',
    approved_hours NUMERIC,
    approver_note TEXT,
    approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approval_date TIMESTAMP,
    allow_edit BOOLEAN DEFAULT FALSE,
    data_status TEXT DEFAULT 'OK',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. BẢNG KPI_RESULTS (Bảng điểm tổng hợp KPI & Phân loại)
CREATE TABLE IF NOT EXISTS kpi_results (
    id SERIAL PRIMARY KEY,
    kpi_id TEXT UNIQUE NOT NULL,
    month TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registered_works INTEGER,
    approved_works INTEGER,
    pending_works INTEGER,
    supplement_works INTEGER,
    rejected_works INTEGER,
    approved_hours NUMERIC,
    converted_score NUMERIC,
    personal_share NUMERIC,
    a_score NUMERIC,
    b1_score NUMERIC,
    b2_score NUMERIC,
    b_score NUMERIC,
    c1_score NUMERIC,
    c2_score NUMERIC,
    c_score NUMERIC,
    d_score NUMERIC,
    total_kpi NUMERIC,
    rank TEXT,
    warning TEXT,
    locked_status TEXT DEFAULT 'Chưa chốt',
    note TEXT,
    details_a JSONB,
    details_c JSONB,
    details_d JSONB,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 8. BẢNG SYSTEM_LOGS (Nhật ký truy cập & Thao tác hệ thống)
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    log_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT,
    target TEXT,
    result TEXT,
    note TEXT,
    details JSONB
);

-- TẠO CHỈ MỤC (INDEXES) TỐI ƯU HÓA TỐC ĐỘ TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_works_user_month ON works(user_id, month);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_assignments_receiver_month ON assignments(receiver_id, month);
CREATE INDEX IF NOT EXISTS idx_overtimes_user_month ON overtimes(user_id, month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_results_month_user_unique ON kpi_results(month, user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_receiver ON notifications(receiver_id, status);
`;
