import assert from 'node:assert/strict';
import {
  calculateTotalKpi,
  calculateKpiB,
  calculateKpiC,
  calculateKpiD,
  evaluateKpiRank,
  DEFAULT_KPI_CONFIG
} from './src/utils.ts';

const alloc = DEFAULT_KPI_CONFIG.scoreAllocation;

assert.equal(
  calculateTotalKpi(30, 60, 10, 0, DEFAULT_KPI_CONFIG.formula, alloc),
  100,
  'KPI tối đa phải bằng 100'
);

assert.equal(
  calculateTotalKpi(25, 50, 8, 3, DEFAULT_KPI_CONFIG.formula, alloc),
  80,
  '25 + 50 + 8 - 3 phải bằng 80'
);

assert.equal(
  calculateTotalKpi(0, 0, 0, 10, DEFAULT_KPI_CONFIG.formula, alloc),
  0,
  'Tổng âm phải được chặn về 0'
);

assert.equal(
  calculateTotalKpi(30, 80, 20, 0, DEFAULT_KPI_CONFIG.formula, alloc),
  100,
  'Tổng vượt mức phải được chặn về 100'
);

const weightedFormula = {
  type: 'WEIGHTED' as const,
  weightA: 30,
  weightB: 60,
  weightC: 10,
  capMin: 0,
  capMax: 100
};

assert.equal(
  calculateTotalKpi(15, 30, 5, 5, weightedFormula, alloc),
  45,
  'Công thức WEIGHTED mẫu phải bằng 45'
);

assert.equal(
  evaluateKpiRank(100, DEFAULT_KPI_CONFIG.rankingTiers, {
    scoreA: 30,
    scoreB: 60,
    scoreD: 0
  }).rank,
  'Hoàn thành xuất sắc nhiệm vụ',
  '100 điểm phải xếp loại xuất sắc'
);

assert.equal(
  evaluateKpiRank(80, DEFAULT_KPI_CONFIG.rankingTiers, {
    scoreA: 25,
    scoreB: 50,
    scoreD: 3
  }).rank,
  'Hoàn thành tốt nhiệm vụ',
  '80 điểm phải xếp loại hoàn thành tốt'
);

assert.deepEqual(
  calculateKpiB(true, 100, 50, 50, alloc),
  { b1: 45, b2: 15, total: 60 },
  'Engine B phải đạt 45 + 15 = 60 ở dữ liệu chuẩn'
);

assert.deepEqual(
  calculateKpiC(3, 6, 2, 4, alloc),
  { c1: 6, c2: 4, total: 10, averageDepartmentNature: 3 },
  'Engine C phải tính nhất quán C1=6, C2=4, tổng=10'
);

const dResult = calculateKpiD(
  [
    { id: 1, taskName: 'Việc 1', status: 'Không hoàn thành' },
    { id: 2, taskName: 'Việc 2', status: 'Chậm tiến độ' },
    { id: 3, taskName: 'Việc 3', status: 'Bổ sung nhiều lần' }
  ],
  { items: [{ id: 'manual-1', autoD: 0, officialD: 2 }] },
  10
);
assert.equal(dResult.score, 8, 'Engine D phải tính 3 + 2 + 1 + 2 = 8');

console.log('KPI formula tests passed: 10/10');
