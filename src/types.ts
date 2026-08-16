export interface User {
  id: number;
  uid?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  zalo?: string | null;
  position?: string | null;
  group?: string | null;
  role: 'STAFF' | 'LEADER' | 'ADMIN';
  status: string;
  permissions?: string | null;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Work {
  id: number;
  workId: string;
  month: string;
  userId: number;
  user?: User;
  taskGroup?: string | null;
  taskName?: string | null;
  taskCode?: string | null;
  detail?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  actualEndDate?: string | null;
  hours?: string | null;
  days?: number | null;
  proposedNature?: string | null;
  approvedNature?: string | null;
  coef?: string | null;
  baseScore?: string | null;
  convertedScore?: string | null;
  status: string; // 'Đang xử lý' | 'Hoàn thành' | 'Chậm' | 'Không hoàn thành'
  evidence?: string | null;
  productType?: string | null;
  productQty?: number | null;
  unit?: string | null;
  project?: string | null;
  relatedUnit?: string | null;
  lateReason?: string | null;
  penaltyExemption?: string | null;
  editNote?: string | null;
  leaderApproval?: string | null; // 'Chưa duyệt' | 'Duyệt' | 'Cần bổ sung' | 'Không duyệt'
  leaderNote?: string | null;
  approverId?: number | null;
  approvalDate?: string | null;
  source?: string | null;
  dataStatus?: string | null;
  sysNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Assignment {
  id: number;
  assignmentId: string;
  month: string;
  assignerId: number;
  assigner?: User;
  receiverId: number;
  receiver?: User;
  taskGroup?: string | null;
  taskName?: string | null;
  taskCode?: string | null;
  baseScore?: string | null;
  suggestedNature?: string | null;
  suggestedCoef?: string | null;
  expectedConvertedScore?: string | null;
  detail?: string | null;
  assignDate?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  productRequired?: string | null;
  productType?: string | null;
  productQty?: number | null;
  unit?: string | null;
  priority?: string | null; // 'Bình thường' | 'Cao' | 'Khẩn'
  receiveStatus?: string | null; // 'Chưa xem' | 'Đã xem' | 'Đã nhận - đang triển khai' | 'Đã thu hồi' | 'Đã hủy'
  viewDate?: string | null;
  receiveDate?: string | null;
  workId?: number | null;
  work?: Work | null;
  leaderNote?: string | null;
  receiverNote?: string | null;
  updatedAt?: string;
}

export interface Overtime {
  id: number;
  otId: string;
  month: string;
  userId: number;
  user?: User;
  regDate?: string | null;
  otDate: string;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
  totalRegHours?: string | null;
  content?: string | null;
  reason?: string | null;
  project?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  evidence?: string | null;
  employeeNote?: string | null;
  approvalStatus?: string | null; // 'Chờ duyệt' | 'Cần bổ sung' | 'Đã bổ sung' | 'Đã duyệt' | 'Không duyệt' | 'Đã hủy'
  approvedHours?: string | null;
  approverNote?: string | null;
  approverId?: number | null;
  approver?: User;
  approvalDate?: string | null;
  allowEdit?: boolean | null;
  dataStatus?: string | null;
  updatedAt?: string;
}

export interface Category {
  id: number;
  code: string;
  name: string;
  type: string; // 'TASK_GROUP' | 'TASK' | 'PRODUCT_TYPE' | 'WORK_NATURE' | 'KPI_CRITERIA' | 'KPI_CONFIG'
  properties?: any;
  status: string;
  order?: number | null;
}

export interface KpiCriterionA {
  code: string;
  name: string;
  maxScore: number;
  description?: string;
  desc?: string;
  selfScore?: number;
  approvedScore?: number;
  note?: string;
}

export interface KpiRankingTier {
  id: string;
  name: string; // e.g. "Hoàn thành xuất sắc nhiệm vụ", "Hoàn thành tốt nhiệm vụ", etc.
  minScore: number;
  maxScore: number;
  badgeColor: 'emerald' | 'blue' | 'amber' | 'rose' | 'purple' | 'slate';
  requireNoPenalties?: boolean;
  minAScore?: number;
  minBScore?: number;
  description?: string;
  order: number;
}

export interface KpiScoreAllocation {
  maxA: number; // default: 30
  maxB: number; // default: 60
  maxB1: number; // default: 45
  maxB2: number; // default: 15
  maxC: number; // default: 10
  maxC1: number; // default: 6
  maxC2: number; // default: 4
  maxD: number; // default: 10
  targetTotalKpi: number; // default: 100
}

export interface KpiFormulaConfig {
  type: 'STANDARD' | 'WEIGHTED' | 'CUSTOM';
  expression: string; // "A + B + C - D"
  weightA?: number; // 30%
  weightB?: number; // 60%
  weightC?: number; // 10%
  capMin: number; // 0
  capMax: number; // 100
  description: string;
}

export interface KpiPenaltyRule {
  group: string;
  defaultScore: number;
  level: string;
  desc: string;
}

export interface KpiConfig {
  id?: number;
  code: string;
  name: string;
  department: string;
  applyMonth: string;
  scoreAllocation: KpiScoreAllocation;
  criteriaA: KpiCriterionA[];
  naturePoints: Record<string, number>;
  penaltyRules: KpiPenaltyRule[];
  formula: KpiFormulaConfig;
  rankingTiers: KpiRankingTier[];
  status: 'Đang áp dụng' | 'Dự thảo';
  updatedAt?: string;
}
