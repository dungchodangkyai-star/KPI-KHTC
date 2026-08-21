import { pgTable, serial, text, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Users Table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid'),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  zalo: text('zalo'),
  position: text('position').default('Chuyên viên'),
  group: text('group').default('Kế hoạch - Tài chính'),
  role: text('role').default('STAFF'), // 'STAFF' | 'LEADER' | 'ADMIN'
  status: text('status').default('Đang làm'), // 'Đang làm' | 'Chờ duyệt' | 'Khóa' | 'Nghỉ việc' | 'Từ chối'
  permissions: text('permissions'),
  password: text('password'),
  mustChangePassword: boolean('must_change_password').default(false),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. Categories Table
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull().default('TASK'), // 'TASK_GROUP' | 'TASK' | 'PRODUCT_TYPE' | 'WORK_NATURE' | 'KPI_CRITERIA' | 'KPI_CONFIG' | 'SYSTEM_CONFIG'
  properties: jsonb('properties').default({}),
  status: text('status').default('Đang áp dụng'),
  order: integer('order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 3. Works Table
export const works = pgTable('works', {
  id: serial('id').primaryKey(),
  workId: text('work_id').notNull().unique(),
  month: text('month').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  taskGroup: text('task_group'),
  taskName: text('task_name'),
  taskCode: text('task_code'),
  detail: text('detail'),
  startDate: timestamp('start_date'),
  startTime: text('start_time'),
  endDate: timestamp('end_date'),
  endTime: text('end_time'),
  actualEndDate: timestamp('actual_end_date'),
  hours: text('hours').default('8'),
  days: integer('days').default(1),
  proposedNature: text('proposed_nature').default('Trung bình'),
  approvedNature: text('approved_nature'),
  coef: text('coef').default('0.8'),
  baseScore: text('base_score').default('10'),
  convertedScore: text('converted_score').default('8'),
  status: text('status').default('Đang xử lý'), // 'Đang xử lý' | 'Hoàn thành' | 'Chậm' | 'Không hoàn thành'
  evidence: text('evidence'),
  productType: text('product_type').default('Báo cáo'),
  productQty: integer('product_qty').default(1),
  unit: text('unit').default('Sản phẩm'),
  project: text('project'),
  relatedUnit: text('related_unit'),
  lateReason: text('late_reason'),
  penaltyExemption: text('penalty_exemption').default('Không'),
  editNote: text('edit_note'),
  leaderApproval: text('leader_approval').default('Chưa duyệt'), // 'Chưa duyệt' | 'Duyệt' | 'Cần bổ sung' | 'Không duyệt'
  leaderNote: text('leader_note'),
  approverId: integer('approver_id').references(() => users.id),
  approvalDate: timestamp('approval_date'),
  source: text('source').default('WEBAPP'),
  dataStatus: text('data_status'),
  sysNote: text('sys_note'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 4. Assignments Table
export const assignments = pgTable('assignments', {
  id: serial('id').primaryKey(),
  assignmentId: text('assignment_id').notNull().unique(),
  month: text('month').notNull(),
  assignerId: integer('assigner_id').references(() => users.id),
  receiverId: integer('receiver_id').references(() => users.id),
  taskGroup: text('task_group'),
  taskName: text('task_name'),
  taskCode: text('task_code'),
  baseScore: text('base_score').default('10'),
  suggestedNature: text('suggested_nature').default('Trung bình'),
  suggestedCoef: text('suggested_coef').default('0.8'),
  expectedConvertedScore: text('expected_converted_score').default('8'),
  detail: text('detail'),
  assignDate: timestamp('assign_date').defaultNow(),
  startDate: timestamp('start_date'),
  deadline: timestamp('deadline'),
  productRequired: text('product_required'),
  productType: text('product_type').default('Báo cáo'),
  productQty: integer('product_qty').default(1),
  unit: text('unit').default('Sản phẩm'),
  priority: text('priority').default('Bình thường'), // 'Bình thường' | 'Cao' | 'Khẩn'
  receiveStatus: text('receive_status').default('Chưa xem'), // 'Chưa xem' | 'Đã xem' | 'Đã nhận - đang triển khai' | 'Đã thu hồi' | 'Đã hủy'
  viewDate: timestamp('view_date'),
  receiveDate: timestamp('receive_date'),
  workId: integer('work_id').references(() => works.id),
  leaderNote: text('leader_note'),
  receiverNote: text('receiver_note'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 5. Overtimes Table
export const overtimes = pgTable('overtimes', {
  id: serial('id').primaryKey(),
  otId: text('ot_id').notNull().unique(),
  month: text('month').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  regDate: timestamp('reg_date').defaultNow(),
  otDate: timestamp('ot_date').notNull(),
  startTime: text('start_time').default('17:00'),
  endTime: text('end_time').default('20:30'),
  breakMinutes: integer('break_minutes').default(0),
  totalRegHours: text('total_reg_hours').default('3.5'),
  content: text('content'),
  reason: text('reason'),
  project: text('project'),
  expectedResult: text('expected_result'),
  actualResult: text('actual_result'),
  evidence: text('evidence'),
  employeeNote: text('employee_note'),
  approvalStatus: text('approval_status').default('Chờ duyệt'), // 'Chờ duyệt' | 'Cần bổ sung' | 'Đã bổ sung' | 'Đã duyệt' | 'Không duyệt' | 'Đã hủy'
  approvedHours: text('approved_hours'),
  approverNote: text('approver_note'),
  approverId: integer('approver_id').references(() => users.id),
  approvalDate: timestamp('approval_date'),
  allowEdit: boolean('allow_edit').default(false),
  dataStatus: text('data_status'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 6. KPI Results Table
export const kpiResults = pgTable('kpi_results', {
  id: serial('id').primaryKey(),
  kpiId: text('kpi_id').notNull().unique(),
  month: text('month').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  aScore: text('a_score'),
  b1Score: text('b1_score'),
  b2Score: text('b2_score'),
  b3Score: text('b3_score'),
  bScore: text('b_score'),
  c1Score: text('c1_score'),
  c2Score: text('c2_score'),
  cScore: text('c_score'),
  dScore: text('d_score'),
  totalKpi: text('total_kpi'),
  rank: text('rank').default('Chưa chốt'),
  registeredWorks: integer('registered_works').default(0),
  approvedWorks: integer('approved_works').default(0),
  detailsA: jsonb('details_a').default({}),
  detailsB: jsonb('details_b').default({}),
  detailsC: jsonb('details_c').default({}),
  detailsD: jsonb('details_d').default({}),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 7. Notifications Table
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  notifyId: text('notify_id').notNull().unique(),
  senderId: integer('sender_id').references(() => users.id),
  receiverId: integer('receiver_id').references(() => users.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  relatedTarget: text('related_target'),
  status: text('status').default('Chưa xem'),
  viewDate: timestamp('view_date'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 8. System Logs Table
export const systemLogs = pgTable('system_logs', {
  id: serial('id').primaryKey(),
  logId: text('log_id').notNull().unique(),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  target: text('target'),
  result: text('result').default('Thành công'),
  note: text('note'),
  details: jsonb('details').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// =======================
// RELATIONS
// =======================

export const usersRelations = relations(users, ({ many }) => ({
  works: many(works),
  receivedAssignments: many(assignments, { relationName: 'receiverAssignments' }),
  sentAssignments: many(assignments, { relationName: 'assignerAssignments' }),
  overtimes: many(overtimes),
  kpiResults: many(kpiResults),
  sentNotifications: many(notifications, { relationName: 'senderNotifications' }),
  receivedNotifications: many(notifications, { relationName: 'receiverNotifications' }),
  logs: many(systemLogs),
}));

export const worksRelations = relations(works, ({ one, many }) => ({
  user: one(users, {
    fields: [works.userId],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [works.approverId],
    references: [users.id],
  }),
  assignments: many(assignments),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  assigner: one(users, {
    fields: [assignments.assignerId],
    references: [users.id],
    relationName: 'assignerAssignments',
  }),
  receiver: one(users, {
    fields: [assignments.receiverId],
    references: [users.id],
    relationName: 'receiverAssignments',
  }),
  work: one(works, {
    fields: [assignments.workId],
    references: [works.id],
  }),
}));

export const overtimesRelations = relations(overtimes, ({ one }) => ({
  user: one(users, {
    fields: [overtimes.userId],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [overtimes.approverId],
    references: [users.id],
  }),
}));

export const kpiResultsRelations = relations(kpiResults, ({ one }) => ({
  user: one(users, {
    fields: [kpiResults.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  sender: one(users, {
    fields: [notifications.senderId],
    references: [users.id],
    relationName: 'senderNotifications',
  }),
  receiver: one(users, {
    fields: [notifications.receiverId],
    references: [users.id],
    relationName: 'receiverNotifications',
  }),
}));

export const systemLogsRelations = relations(systemLogs, ({ one }) => ({
  user: one(users, {
    fields: [systemLogs.userId],
    references: [users.id],
  }),
}));
