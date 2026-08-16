import express from 'express';
import { db } from '../src/db/index.ts';
import { users, works, kpiResults, categories } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { DEFAULT_KPI_CONFIG, calculateTotalKpi, evaluateKpiRank } from '../src/utils.ts';

export const kpiRouter = express.Router();

export async function getEffectiveKpiConfig(): Promise<any> {
  try {
    const configCat = await db.query.categories.findFirst({
      where: (cat, { eq, and }) => and(eq(cat.code, 'KPI_GLOBAL_CONFIG'), eq(cat.type, 'KPI_CONFIG'))
    });
    if (configCat && configCat.properties) {
      return {
        id: configCat.id,
        code: configCat.code,
        name: configCat.name,
        status: configCat.status,
        ...(configCat.properties as any)
      };
    }
  } catch (err) {
    console.error("Error reading KPI config from DB:", err);
  }
  return DEFAULT_KPI_CONFIG;
}

// 1. GET ALL KPI RESULTS
kpiRouter.get('/', async (req, res) => {
  try {
    const all = await db.query.kpiResults.findMany({
      with: { user: true },
      orderBy: (results, { desc }) => [desc(results.totalKpi)]
    });
    res.json({ success: true, data: all });
  } catch (error) {
    console.error("Error fetching KPI results:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 2. GET KPI CONFIG
kpiRouter.get('/config', async (req, res) => {
  try {
    const config = await getEffectiveKpiConfig();
    const allConfigs = await db.query.categories.findMany({
      where: (cat, { eq }) => eq(cat.type, 'KPI_CONFIG')
    });
    res.json({ 
      success: true, 
      data: config,
      profiles: allConfigs.map(c => ({
        id: c.id,
        code: c.code,
        name: c.name,
        status: c.status,
        ...(c.properties as any || {})
      }))
    });
  } catch (error) {
    console.error("Error fetching KPI config:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 3. SAVE KPI CONFIG
kpiRouter.post('/config', async (req, res) => {
  try {
    const payload = req.body;
    const code = payload.code || 'KPI_GLOBAL_CONFIG';
    const name = payload.name || 'Cấu hình phân bổ điểm KPI & Quy ước xếp loại';
    
    const configProperties = {
      department: payload.department || 'Phòng Kế hoạch - Tài chính',
      applyMonth: payload.applyMonth || 'all',
      scoreAllocation: payload.scoreAllocation || DEFAULT_KPI_CONFIG.scoreAllocation,
      criteriaA: payload.criteriaA || DEFAULT_KPI_CONFIG.criteriaA,
      naturePoints: payload.naturePoints || DEFAULT_KPI_CONFIG.naturePoints,
      penaltyRules: payload.penaltyRules || DEFAULT_KPI_CONFIG.penaltyRules,
      formula: payload.formula || DEFAULT_KPI_CONFIG.formula,
      rankingTiers: payload.rankingTiers || DEFAULT_KPI_CONFIG.rankingTiers,
      updatedAt: new Date().toISOString()
    };

    await db.insert(categories).values({
      code,
      name,
      type: 'KPI_CONFIG',
      properties: configProperties,
      status: payload.status || 'Đang áp dụng',
      order: 1
    }).onConflictDoUpdate({
      target: categories.code,
      set: {
        name,
        properties: configProperties,
        status: payload.status || 'Đang áp dụng',
        order: 1
      }
    });

    const effective = await getEffectiveKpiConfig();
    res.json({ success: true, data: effective, message: "Đã lưu cấu hình phân bổ điểm & xếp loại KPI thành công!" });
  } catch (error) {
    console.error("Error saving KPI config:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 4. RESET KPI CONFIG
kpiRouter.post('/config/reset', async (req, res) => {
  try {
    await db.insert(categories).values({
      code: 'KPI_GLOBAL_CONFIG',
      name: 'Cấu hình phân bổ điểm KPI & Quy ước xếp loại tiêu chuẩn',
      type: 'KPI_CONFIG',
      properties: {
        ...DEFAULT_KPI_CONFIG,
        updatedAt: new Date().toISOString()
      },
      status: 'Đang áp dụng',
      order: 1
    }).onConflictDoUpdate({
      target: categories.code,
      set: {
        name: 'Cấu hình phân bổ điểm KPI & Quy ước xếp loại tiêu chuẩn',
        properties: {
          ...DEFAULT_KPI_CONFIG,
          updatedAt: new Date().toISOString()
        },
        status: 'Đang áp dụng'
      }
    });

    const effective = await getEffectiveKpiConfig();
    res.json({ success: true, data: effective, message: "Đã khôi phục cấu hình KPI về mặc định tiêu chuẩn!" });
  } catch (error) {
    console.error("Error resetting KPI config:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 5. KPI DETAIL FOR A USER
kpiRouter.get('/detail', async (req, res) => {
  try {
    const { month, userId, userName } = req.query;
    const targetMonth = String(month || '08-2026');
    
    let targetUser = null;
    if (userId) {
      targetUser = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, Number(userId))
      });
    } else if (userName) {
      targetUser = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.name, String(userName))
      });
    } else {
      targetUser = await db.query.users.findFirst();
    }

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const allUsers = await db.query.users.findMany();
    const allWorksInMonth = await db.query.works.findMany({
      where: (w, { eq }) => eq(w.month, targetMonth)
    });
    const validWorksInMonth = allWorksInMonth.filter(w => {
      const ds = String(w.dataStatus || '').toLowerCase();
      return !ds.includes('xóa') && !ds.includes('xoa');
    });

    const userWorks = validWorksInMonth.filter(w => w.userId === targetUser.id);
    const userApprovedWorks = userWorks.filter(w => w.leaderApproval === 'Duyệt');
    
    const deptApprovedWorks = validWorksInMonth.filter(w => w.leaderApproval === 'Duyệt');
    const deptConvertedScore = deptApprovedWorks.reduce((s, w) => s + (parseFloat(w.convertedScore || '0') || 0), 0);
    const userConvertedScore = userApprovedWorks.reduce((s, w) => s + (parseFloat(w.convertedScore || '0') || 0), 0);
    
    const activeEmployeeIds = Array.from(new Set(deptApprovedWorks.map(w => w.userId)));
    const avgShare = activeEmployeeIds.length > 0 ? (100 / activeEmployeeIds.length) : 0;
    const userShare = deptConvertedScore > 0 ? (userConvertedScore / deptConvertedScore * 100) : 0;

    const naturePointMap: Record<string, number> = {
      'Đặc biệt phức tạp': 3,
      'Rất phức tạp': 2,
      'Phức tạp': 1,
      'Trung bình': 0,
      'Đơn giản': 0
    };

    let personalNatureTotal = 0;
    let deptNatureTotal = 0;

    deptApprovedWorks.forEach(w => {
      const nat = w.approvedNature || w.proposedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      deptNatureTotal += pt;
      if (w.userId === targetUser.id) {
        personalNatureTotal += pt;
      }
    });

    const avgDeptNature = activeEmployeeIds.length > 0 ? (deptNatureTotal / activeEmployeeIds.length) : 0;
    const autoC1 = avgDeptNature > 0 ? Math.round(Math.min(6, (personalNatureTotal * 6) / avgDeptNature)) : 0;

    const kpiId = `${targetMonth}♦${targetUser.name}`;
    const kpiRecord = await db.query.kpiResults.findFirst({
      where: (r, { eq }) => eq(r.kpiId, kpiId)
    });

    const defaultDetailsA = {
      statusA: 'Chưa tự chấm',
      selfTotal: null,
      approvedTotal: null,
      noteA: '',
      leaderNoteA: '',
      scores: {
        A1: { max: 5, self: null, approved: null, reason: '' },
        A2: { max: 5, self: null, approved: null, reason: '' },
        A3: { max: 5, self: null, approved: null, reason: '' },
        A4: { max: 4, self: null, approved: null, reason: '' },
        A5: { max: 4, self: null, approved: null, reason: '' },
        A6: { max: 4, self: null, approved: null, reason: '' },
        A7: { max: 3, self: null, approved: null, reason: '' }
      }
    };

    const detailsA = (kpiRecord?.detailsA as any) || defaultDetailsA;
    const rawDetailsC = (kpiRecord?.detailsC as any) || {};
    const finalC1 = autoC1;
    const finalC2 = rawDetailsC.c2 !== undefined ? rawDetailsC.c2 : (kpiRecord?.c2Score ? parseFloat(kpiRecord.c2Score) : 0);
    const finalTotalC = Math.min(10, finalC1 + finalC2);

    const detailsC = {
      ...rawDetailsC,
      c1: finalC1,
      c2: finalC2,
      totalC: finalTotalC,
      personalNatureTotal: Math.round(personalNatureTotal * 100) / 100,
      deptNatureTotal: Math.round(deptNatureTotal * 100) / 100,
      activeEmployeeCount: activeEmployeeIds.length,
      avgDeptNature: Math.round(avgDeptNature * 100) / 100,
      autoC1
    };

    const detailsD = (kpiRecord?.detailsD as any) || { items: [], totalOfficialD: 0, totalAutoD: 0 };

    res.json({
      success: true,
      data: {
        user: targetUser,
        month: targetMonth,
        kpiRecord: kpiRecord || null,
        summary: {
          registeredWorks: userWorks.length,
          approvedWorks: userApprovedWorks.length,
          pendingWorks: userWorks.filter(w => w.leaderApproval === 'Chưa duyệt').length,
          supplementWorks: userWorks.filter(w => w.leaderApproval === 'Cần bổ sung').length,
          rejectedWorks: userWorks.filter(w => w.leaderApproval === 'Không duyệt').length,
          approvedHours: userApprovedWorks.reduce((s, w) => s + (parseFloat(w.hours || '0') || 0), 0),
          convertedScore: Math.round(userConvertedScore * 100) / 100,
          deptTotalWorks: validWorksInMonth.length,
          deptApprovedWorks: deptApprovedWorks.length,
          deptConvertedScore: Math.round(deptConvertedScore * 100) / 100,
          personalShare: Math.round(userShare * 100) / 100,
          avgShare: Math.round(avgShare * 100) / 100,
          b1: userApprovedWorks.length > 0 ? Math.round(Math.min(45, (userConvertedScore / 100) * 45) * 100) / 100 : 0,
          b2: (userApprovedWorks.length > 0 && avgShare > 0) ? Math.round(Math.min(15, (userShare / avgShare) * 15) * 100) / 100 : 0,
          bTotal: userApprovedWorks.length > 0 ? Math.round(Math.min(60, Math.min(45, (userConvertedScore / 100) * 45) + (avgShare > 0 ? Math.min(15, (userShare / avgShare) * 15) : 0)) * 100) / 100 : 0
        },
        detailsA,
        detailsC,
        detailsD,
        approvedTasks: userApprovedWorks
      }
    });
  } catch (error) {
    console.error("Error fetching KPI detail:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 6. SELF SCORE A
kpiRouter.post('/self-score-a', async (req, res) => {
  try {
    const { month, userId, userName, scores, note } = req.body;
    const targetMonth = month || '08-2026';

    let targetUser = null;
    if (userId) {
      targetUser = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, Number(userId))
      });
    } else if (userName) {
      targetUser = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.name, String(userName))
      });
    } else {
      targetUser = await db.query.users.findFirst();
    }

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const totalSelf = Object.keys(scores || {}).reduce((s, k) => s + (parseFloat(scores[k]) || 0), 0);
    const kpiId = `${targetMonth}♦${targetUser.name}`;

    const existingKpi = await db.query.kpiResults.findFirst({
      where: (r, { eq }) => eq(r.kpiId, kpiId)
    });

    const detailsA = {
      statusA: 'Đã tự chấm',
      selfTotal: Math.round(totalSelf * 10) / 10,
      approvedTotal: existingKpi?.detailsA ? (existingKpi.detailsA as any).approvedTotal : null,
      noteA: note || '',
      leaderNoteA: existingKpi?.detailsA ? (existingKpi.detailsA as any).leaderNoteA : '',
      scores: {
        A1: { max: 5, self: scores?.A1 ?? null, approved: (existingKpi?.detailsA as any)?.scores?.A1?.approved ?? null, reason: '' },
        A2: { max: 5, self: scores?.A2 ?? null, approved: (existingKpi?.detailsA as any)?.scores?.A2?.approved ?? null, reason: '' },
        A3: { max: 5, self: scores?.A3 ?? null, approved: (existingKpi?.detailsA as any)?.scores?.A3?.approved ?? null, reason: '' },
        A4: { max: 4, self: scores?.A4 ?? null, approved: (existingKpi?.detailsA as any)?.scores?.A4?.approved ?? null, reason: '' },
        A5: { max: 4, self: scores?.A5 ?? null, approved: (existingKpi?.detailsA as any)?.scores?.A5?.approved ?? null, reason: '' },
        A6: { max: 4, self: scores?.A6 ?? null, approved: (existingKpi?.detailsA as any)?.scores?.A6?.approved ?? null, reason: '' },
        A7: { max: 3, self: scores?.A7 ?? null, approved: (existingKpi?.detailsA as any)?.scores?.A7?.approved ?? null, reason: '' },
      },
      updatedAt: new Date().toISOString()
    };

    await db.insert(kpiResults).values({
      kpiId,
      month: targetMonth,
      userId: targetUser.id,
      aScore: '0',
      detailsA,
      registeredWorks: 0,
      approvedWorks: 0,
      totalKpi: '0',
      rank: 'Chưa chốt'
    }).onConflictDoUpdate({
      target: kpiResults.kpiId,
      set: {
        detailsA,
        updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: `Đã lưu kết quả tự chấm A tháng ${targetMonth} (${totalSelf}/30 điểm). Chờ lãnh đạo duyệt!`,
      data: detailsA
    });
  } catch (error) {
    console.error("Error self-scoring A:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 7. APPROVE A / C / D
kpiRouter.post('/approve-acd', async (req, res) => {
  try {
    const { month, userId, userName, detailsA, detailsC, detailsD, approverName } = req.body;
    const targetMonth = month || '08-2026';

    let targetUser = null;
    if (userId) {
      targetUser = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, Number(userId))
      });
    } else if (userName) {
      targetUser = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.name, String(userName))
      });
    }

    if (!targetUser) return res.status(404).json({ error: "User not found" });

    const kpiId = `${targetMonth}♦${targetUser.name}`;
    const approvedA = parseFloat(detailsA?.approvedTotal || '0') || 0;
    const c1Score = parseFloat(detailsC?.c1 || '0') || 0;
    const c2Score = parseFloat(detailsC?.c2 || '0') || 0;
    const cScore = Math.min(10, c1Score + c2Score);

    const dItems = detailsD?.items || [];
    const totalOfficialD = dItems.reduce((s: number, item: any) => {
      const val = item.officialD !== undefined ? parseFloat(item.officialD) : parseFloat(item.autoD || '0');
      return s + (isNaN(val) ? 0 : val);
    }, 0);

    const existingKpi = await db.query.kpiResults.findFirst({
      where: (r, { eq }) => eq(r.kpiId, kpiId)
    });

    const kpiConfig = await getEffectiveKpiConfig();
    const alloc = kpiConfig.scoreAllocation || DEFAULT_KPI_CONFIG.scoreAllocation;

    const bScore = parseFloat(existingKpi?.bScore || '0') || 0;
    const dScore = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;
    const totalKpi = calculateTotalKpi(approvedA, bScore, cScore, dScore, kpiConfig.formula, alloc);
    const rankEval = evaluateKpiRank(totalKpi, kpiConfig.rankingTiers, { scoreA: approvedA, scoreB: bScore, scoreD: dScore });

    await db.insert(kpiResults).values({
      kpiId,
      month: targetMonth,
      userId: targetUser.id,
      aScore: String(approvedA),
      c1Score: String(c1Score),
      c2Score: String(c2Score),
      cScore: String(cScore),
      dScore: String(dScore),
      totalKpi: String(totalKpi),
      rank: rankEval.rank,
      detailsA,
      detailsC,
      detailsD,
      note: `Đã duyệt bởi ${approverName || 'Lãnh đạo'} lúc ${new Date().toLocaleString('vi-VN')}`
    }).onConflictDoUpdate({
      target: kpiResults.kpiId,
      set: {
        aScore: String(approvedA),
        c1Score: String(c1Score),
        c2Score: String(c2Score),
        cScore: String(cScore),
        dScore: String(dScore),
        totalKpi: String(totalKpi),
        rank: rankEval.rank,
        detailsA,
        detailsC,
        detailsD,
        updatedAt: new Date()
      }
    });

    res.json({ 
      success: true, 
      message: `Đã cập nhật duyệt điểm A (${approvedA}đ) / C (${cScore}đ) / D (-${dScore}đ) cho ${targetUser.name} tháng ${targetMonth}! Tổng KPI: ${totalKpi} (${rankEval.rank})`
    });
  } catch (error) {
    console.error("Error approving A/C/D:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 8. CALCULATE / RECALCULATE KPI FOR A SINGLE USER
kpiRouter.post('/calculate', async (req, res) => {
  try {
    const { month, userId, userName } = req.body;
    const targetMonth = month || '08-2026';
    
    let targetUser = null;
    if (userId) {
      targetUser = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, Number(userId)) });
    } else if (userName) {
      targetUser = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.name, String(userName)) });
    }
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    const result = await calculateAndSaveUserKpi(targetUser, targetMonth);
    res.json({ success: true, message: `Đã tính điểm KPI tháng ${targetMonth} cho ${targetUser.name}: ${result.totalKpi} (${result.rank})`, data: result });
  } catch (error) {
    console.error("Error calculating user KPI:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 9. RECALCULATE ALL USERS FOR A MONTH
kpiRouter.post('/recalculate-all', async (req, res) => {
  try {
    const { month } = req.body;
    const targetMonth = month || '08-2026';

    const allUsers = await db.query.users.findMany({
      where: (u, { eq }) => eq(u.status, 'Hoạt động')
    });

    const results = [];
    for (const u of allUsers) {
      const resKpi = await calculateAndSaveUserKpi(u, targetMonth);
      results.push({ name: u.name, ...resKpi });
    }

    res.json({
      success: true,
      message: `Đã tính toán lại toàn bộ KPI tháng ${targetMonth} cho ${results.length} nhân sự thành công!`,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error("Error recalculating all KPI:", error);
    res.status(500).json({ error: String(error) });
  }
});

export async function calculateAndSaveUserKpi(targetUser: any, targetMonth: string) {
  const allWorksInMonth = await db.query.works.findMany({
    where: (w, { eq }) => eq(w.month, targetMonth)
  });
  const validWorksInMonth = allWorksInMonth.filter(w => {
    const ds = String(w.dataStatus || '').toLowerCase();
    return !ds.includes('xóa') && !ds.includes('xoa');
  });

  const userWorks = validWorksInMonth.filter(w => w.userId === targetUser.id);
  const userApprovedWorks = userWorks.filter(w => w.leaderApproval === 'Duyệt');
  
  const deptApprovedWorks = validWorksInMonth.filter(w => w.leaderApproval === 'Duyệt');
  const deptConvertedScore = deptApprovedWorks.reduce((s, w) => s + (parseFloat(w.convertedScore || '0') || 0), 0);
  const userConvertedScore = userApprovedWorks.reduce((s, w) => s + (parseFloat(w.convertedScore || '0') || 0), 0);
  
  const activeEmployeeIds = Array.from(new Set(deptApprovedWorks.map(w => w.userId)));
  const avgShare = activeEmployeeIds.length > 0 ? (100 / activeEmployeeIds.length) : 0;
  const userShare = deptConvertedScore > 0 ? (userConvertedScore / deptConvertedScore * 100) : 0;

  const naturePointMap: Record<string, number> = {
    'Đặc biệt phức tạp': 3,
    'Rất phức tạp': 2,
    'Phức tạp': 1,
    'Trung bình': 0,
    'Đơn giản': 0
  };

  let personalNatureTotal = 0;
  let deptNatureTotal = 0;

  deptApprovedWorks.forEach(w => {
    const nat = w.approvedNature || w.proposedNature || 'Trung bình';
    const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
    deptNatureTotal += pt;
    if (w.userId === targetUser.id) {
      personalNatureTotal += pt;
    }
  });

  const avgDeptNature = activeEmployeeIds.length > 0 ? (deptNatureTotal / activeEmployeeIds.length) : 0;
  const autoC1 = avgDeptNature > 0 ? Math.round(Math.min(6, (personalNatureTotal * 6) / avgDeptNature)) : 0;

  const kpiConfig = await getEffectiveKpiConfig();
  const alloc = kpiConfig.scoreAllocation || DEFAULT_KPI_CONFIG.scoreAllocation;

  const b1 = userApprovedWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
  const b2 = (userApprovedWorks.length > 0 && avgShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userShare / avgShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
  const bTotal = Math.round(Math.min(alloc.maxB || 60, b1 + b2) * 100) / 100;

  const kpiId = `${targetMonth}♦${targetUser.name}`;
  const existingKpi = await db.query.kpiResults.findFirst({
    where: (r, { eq }) => eq(r.kpiId, kpiId)
  });

  const rawDetailsA = (existingKpi?.detailsA as any) || {};
  const approvedA = rawDetailsA.approvedTotal !== undefined && rawDetailsA.approvedTotal !== null 
    ? parseFloat(rawDetailsA.approvedTotal) 
    : (existingKpi?.aScore ? parseFloat(existingKpi.aScore) : (rawDetailsA.selfTotal ? parseFloat(rawDetailsA.selfTotal) : 0));

  const rawDetailsC = (existingKpi?.detailsC as any) || {};
  const c2Score = rawDetailsC.c2 !== undefined ? parseFloat(rawDetailsC.c2) : (existingKpi?.c2Score ? parseFloat(existingKpi.c2Score) : 0);
  const cScore = Math.min(alloc.maxC || 10, autoC1 + c2Score);

  const rawDetailsD = (existingKpi?.detailsD as any) || {};
  const dItems = rawDetailsD.items || [];
  const totalOfficialD = dItems.reduce((s: number, item: any) => {
    const val = item.officialD !== undefined ? parseFloat(item.officialD) : parseFloat(item.autoD || '0');
    return s + (isNaN(val) ? 0 : val);
  }, 0);
  const dScore = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;

  const totalKpi = calculateTotalKpi(approvedA, bTotal, cScore, dScore, kpiConfig.formula, alloc);
  const rankEval = evaluateKpiRank(totalKpi, kpiConfig.rankingTiers, { scoreA: approvedA, scoreB: bTotal, scoreD: dScore });

  const updatedDetailsC = {
    ...rawDetailsC,
    c1: autoC1,
    c2: c2Score,
    totalC: cScore,
    personalNatureTotal: Math.round(personalNatureTotal * 100) / 100,
    deptNatureTotal: Math.round(deptNatureTotal * 100) / 100,
    activeEmployeeCount: activeEmployeeIds.length,
    avgDeptNature: Math.round(avgDeptNature * 100) / 100,
    autoC1
  };

  await db.insert(kpiResults).values({
    kpiId,
    month: targetMonth,
    userId: targetUser.id,
    aScore: String(approvedA),
    b1Score: String(b1),
    b2Score: String(b2),
    bScore: String(bTotal),
    c1Score: String(autoC1),
    c2Score: String(c2Score),
    cScore: String(cScore),
    dScore: String(dScore),
    totalKpi: String(totalKpi),
    rank: rankEval.rank,
    detailsA: rawDetailsA,
    detailsC: updatedDetailsC,
    detailsD: rawDetailsD,
    note: `Tự động cập nhật tính toán KPI lúc ${new Date().toLocaleString('vi-VN')}`
  }).onConflictDoUpdate({
    target: kpiResults.kpiId,
    set: {
      aScore: String(approvedA),
      b1Score: String(b1),
      b2Score: String(b2),
      bScore: String(bTotal),
      c1Score: String(autoC1),
      c2Score: String(c2Score),
      cScore: String(cScore),
      dScore: String(dScore),
      totalKpi: String(totalKpi),
      rank: rankEval.rank,
      detailsC: updatedDetailsC,
      updatedAt: new Date()
    }
  });

  return {
    kpiId,
    totalKpi,
    rank: rankEval.rank,
    approvedA,
    b1,
    b2,
    bTotal,
    cScore,
    dScore
  };
}
