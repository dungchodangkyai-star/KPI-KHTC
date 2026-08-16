import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, decimal, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(), // Firebase UID
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  zalo: text('zalo'),
  position: text('position'),
  group: text('group'),
  role: text('role').notNull().default('STAFF'), // STAFF, LEADER, ADMIN
  status: text('status').notNull().default('Đang làm'),
  permissions: text('permissions'),
  password: text('password'), // salt$hash format
  mustChangePassword: boolean('must_change_password').default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull(), 
  properties: jsonb('properties'), 
  status: text('status').notNull().default('Đang dùng'),
  order: integer('order').default(0),
});

export const works = pgTable('works', {
  id: serial('id').primaryKey(),
  workId: text('work_id').unique().notNull(), 
  month: text('month').notNull(), 
  userId: integer('user_id').references(() => users.id).notNull(),
  taskGroup: text('task_group'),
  taskName: text('task_name'),
  taskCode: text('task_code'),
  detail: text('detail'),
  startDate: timestamp('start_date'),
  startTime: text('start_time'),
  endDate: timestamp('end_date'),
  endTime: text('end_time'),
  actualEndDate: timestamp('actual_end_date'),
  hours: decimal('hours'),
  days: integer('days'),
  proposedNature: text('proposed_nature'),
  approvedNature: text('approved_nature'),
  coef: decimal('coef'),
  baseScore: decimal('base_score'),
  convertedScore: decimal('converted_score'),
  status: text('status').notNull().default('Đang xử lý'),
  evidence: text('evidence'),
  productType: text('product_type'),
  productQty: integer('product_qty').default(1),
  unit: text('unit'),
  project: text('project'),
  relatedUnit: text('related_unit'),
  lateReason: text('late_reason'),
  penaltyExemption: text('penalty_exemption').default('Không'),
  editNote: text('edit_note'),
  leaderApproval: text('leader_approval').default('Chưa duyệt'),
  leaderNote: text('leader_note'),
  approverId: integer('approver_id').references(() => users.id),
  approvalDate: timestamp('approval_date'),
  source: text('source'),
  dataStatus: text('data_status').default('OK'),
  sysNote: text('sys_note'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const assignments = pgTable('assignments', {
  id: serial('id').primaryKey(),
  assignmentId: text('assignment_id').unique().notNull(),
  month: text('month').notNull(),
  assignerId: integer('assigner_id').references(() => users.id).notNull(),
  receiverId: integer('receiver_id').references(() => users.id).notNull(),
  taskGroup: text('task_group'),
  taskName: text('task_name'),
  taskCode: text('task_code'),
  baseScore: decimal('base_score'),
  suggestedNature: text('suggested_nature'),
  suggestedCoef: decimal('suggested_coef'),
  expectedConvertedScore: decimal('expected_converted_score'),
  detail: text('detail'),
  assignDate: timestamp('assign_date').defaultNow(),
  startDate: timestamp('start_date'),
  deadline: timestamp('deadline'),
  productRequired: text('product_required'),
  productType: text('product_type'),
  productQty: integer('product_qty'),
  unit: text('unit'),
  priority: text('priority').default('Bình thường'),
  receiveStatus: text('receive_status').default('Chưa xem'),
  viewDate: timestamp('view_date'),
  receiveDate: timestamp('receive_date'),
  workId: integer('work_id').references(() => works.id),
  leaderNote: text('leader_note'),
  receiverNote: text('receiver_note'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  notifyId: text('notify_id').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  senderId: integer('sender_id').references(() => users.id),
  receiverId: integer('receiver_id').references(() => users.id).notNull(),
  type: text('type'),
  title: text('title'),
  content: text('content'),
  relatedTarget: text('related_target'), 
  status: text('status').default('Chưa xem'),
  viewDate: timestamp('view_date'),
  note: text('note'),
});

export const overtimes = pgTable('overtimes', {
  id: serial('id').primaryKey(),
  otId: text('ot_id').unique().notNull(),
  month: text('month').notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  regDate: timestamp('reg_date').defaultNow(),
  otDate: timestamp('ot_date').notNull(),
  startTime: text('start_time'),
  endTime: text('end_time'),
  breakMinutes: integer('break_minutes').default(0),
  totalRegHours: decimal('total_reg_hours'),
  content: text('content'),
  reason: text('reason'),
  project: text('project'),
  expectedResult: text('expected_result'),
  actualResult: text('actual_result'),
  evidence: text('evidence'),
  employeeNote: text('employee_note'),
  approvalStatus: text('approval_status').default('Chờ duyệt'),
  approvedHours: decimal('approved_hours'),
  approverNote: text('approver_note'),
  approverId: integer('approver_id').references(() => users.id),
  approvalDate: timestamp('approval_date'),
  allowEdit: boolean('allow_edit').default(false),
  dataStatus: text('data_status').default('OK'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const kpiResults = pgTable('kpi_results', {
  id: serial('id').primaryKey(),
  kpiId: text('kpi_id').unique().notNull(),
  month: text('month').notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  registeredWorks: integer('registered_works'),
  approvedWorks: integer('approved_works'),
  pendingWorks: integer('pending_works'),
  supplementWorks: integer('supplement_works'),
  rejectedWorks: integer('rejected_works'),
  approvedHours: decimal('approved_hours'),
  convertedScore: decimal('converted_score'),
  personalShare: decimal('personal_share'),
  aScore: decimal('a_score'),
  b1Score: decimal('b1_score'),
  b2Score: decimal('b2_score'),
  bScore: decimal('b_score'),
  c1Score: decimal('c1_score'),
  c2Score: decimal('c2_score'),
  cScore: decimal('c_score'),
  dScore: decimal('d_score'),
  totalKpi: decimal('total_kpi'),
  rank: text('rank'),
  warning: text('warning'),
  lockedStatus: text('locked_status').default('Chưa chốt'),
  note: text('note'),
  detailsA: jsonb('details_a'),
  detailsC: jsonb('details_c'),
  detailsD: jsonb('details_d'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const systemLogs = pgTable('system_logs', {
  id: serial('id').primaryKey(),
  logId: text('log_id').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  userId: integer('user_id').references(() => users.id),
  action: text('action'),
  target: text('target'),
  result: text('result'),
  note: text('note'),
  details: jsonb('details'),
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  works: many(works),
  assignmentsReceived: many(assignments, { relationName: 'receiver' }),
  assignmentsGiven: many(assignments, { relationName: 'assigner' }),
  notificationsReceived: many(notifications, { relationName: 'notify_receiver' }),
  overtimes: many(overtimes),
  kpiResults: many(kpiResults),
  logs: many(systemLogs),
}));

export const worksRelations = relations(works, ({ one }) => ({
  user: one(users, { fields: [works.userId], references: [users.id] }),
  approver: one(users, { fields: [works.approverId], references: [users.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  assigner: one(users, { fields: [assignments.assignerId], references: [users.id], relationName: 'assigner' }),
  receiver: one(users, { fields: [assignments.receiverId], references: [users.id], relationName: 'receiver' }),
  work: one(works, { fields: [assignments.workId], references: [works.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  sender: one(users, { fields: [notifications.senderId], references: [users.id], relationName: 'notify_sender' }),
  receiver: one(users, { fields: [notifications.receiverId], references: [users.id], relationName: 'notify_receiver' }),
}));

export const overtimesRelations = relations(overtimes, ({ one }) => ({
  user: one(users, { fields: [overtimes.userId], references: [users.id] }),
  approver: one(users, { fields: [overtimes.approverId], references: [users.id] }),
}));

export const kpiResultsRelations = relations(kpiResults, ({ one }) => ({
  user: one(users, { fields: [kpiResults.userId], references: [users.id] }),
}));

export const systemLogsRelations = relations(systemLogs, ({ one }) => ({
  user: one(users, { fields: [systemLogs.userId], references: [users.id] }),
}));
