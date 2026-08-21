import express from 'express';
import { db } from '../src/db/index.ts';
import { users, works, kpiResults, categories } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { DEFAULT_KPI_CONFIG, DEFAULT_ORG_CONFIG, calculateTotalKpi, evaluateKpiRank } from '../src/utils.ts';

export const kpiRouter = express.Router();

const getCurrentMonth = (): string => {
  const nowVn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${String(nowVn.getUTCMonth() + 1).padStart(2, '0')}-${nowVn.getUTCFullYear()}`;
};


const isActiveWorkRecord = (work: any): boolean => {
  const status = String(work?.dataStatus || '').toLowerCase();
  return !status.includes('xóa') &&
    !status.includes('xoá') &&
    !status.includes('xoa') &&
    !status.includes('thu hồi') &&
    !status.includes('thu hoi');
};

export async function getEffectiveOrgConfig(): Promise<any> {
  try {
    const orgCat = await db.query.categories.findFirst({
      where: (cat, { eq, and }) => and(eq(cat.code, 'SYSTEM_ORG_CONFIG'), eq(cat.type, 'SYSTEM_CONFIG'))
    });
    if (orgCat && orgCat.properties) {
      return {
        id: orgCat.id,
        ...DEFAULT_ORG_CONFIG,
        ...(orgCat.properties as any)
      };
    }
    const kpiCat = await db.query.categories.findFirst({
      where: (cat, { eq, and }) => and(eq(cat.code, 'KPI_GLOBAL_CONFIG'), eq(cat.type, 'KPI_CONFIG'))
    });
    if (kpiCat && kpiCat.properties && (kpiCat.properties as any).orgConfig) {
      return {
        ...DEFAULT_ORG_CONFIG,
        ...((kpiCat.properties as any).orgConfig)
      };
    }
  } catch (err) {
    console.error("Error reading Org config from DB:", err);
  }
  return DEFAULT_ORG_CONFIG;
}

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
      orderBy: (results, { desc }) => [desc(results.updatedAt)]
    });
    const latestByMonthAndUser = new Map<string, any>();
    for (const row of all) {
      const key = row.userId ? `${row.month}:${row.userId}` : row.kpiId;
      if (!latestByMonthAndUser.has(key)) latestByMonthAndUser.set(key, row);
    }
    const data = Array.from(latestByMonthAndUser.values()).sort(
      (a, b) => (Number(b.totalKpi) || 0) - (Number(a.totalKpi) || 0)
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching KPI results:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 1.5 GET ORG / SYSTEM CONFIG
kpiRouter.get('/org-config', async (req, res) => {
  try {
    const orgConfig = await getEffectiveOrgConfig();
    res.json({ success: true, data: orgConfig });
  } catch (error) {
    console.error("Error fetching Org config:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 1.6 SAVE ORG / SYSTEM CONFIG
kpiRouter.post('/org-config', async (req, res) => {
  try {
    const payload = req.body;
    const orgProperties = {
      parentAgency: payload.parentAgency || DEFAULT_ORG_CONFIG.parentAgency,
      departmentName: payload.departmentName || DEFAULT_ORG_CONFIG.departmentName,
      shortName: payload.shortName || DEFAULT_ORG_CONFIG.shortName,
      systemTitle: payload.systemTitle || DEFAULT_ORG_CONFIG.systemTitle,
      location: payload.location || DEFAULT_ORG_CONFIG.location,
      creatorTitle: payload.creatorTitle || DEFAULT_ORG_CONFIG.creatorTitle,
      approverTitle: payload.approverTitle || DEFAULT_ORG_CONFIG.approverTitle,
      leaderTitle: payload.leaderTitle || DEFAULT_ORG_CONFIG.leaderTitle,
      footerNote: payload.footerNote || DEFAULT_ORG_CONFIG.footerNote,
      updatedAt: new Date().toISOString()
    };

    await db.insert(categories).values({
      code: 'SYSTEM_ORG_CONFIG',
      name: orgProperties.departmentName || 'Cấu hình Cơ quan - Đơn vị',
      type: 'SYSTEM_CONFIG',
      properties: orgProperties,
      status: 'Đang áp dụng',
      order: 1
    }).onConflictDoUpdate({
      target: categories.code,
      set: {
        name: orgProperties.departmentName || 'Cấu hình Cơ quan - Đơn vị',
        properties: orgProperties,
        status: 'Đang áp dụng',
        order: 1
      }
    });

    // Also update department name in KPI_GLOBAL_CONFIG if present
    const kpiCat = await db.query.categories.findFirst({
      where: (cat, { eq, and }) => and(eq(cat.code, 'KPI_GLOBAL_CONFIG'), eq(cat.type, 'KPI_CONFIG'))
    });
    if (kpiCat && kpiCat.properties) {
      const updatedKpiProps = {
        ...(kpiCat.properties as any),
        department: orgProperties.departmentName,
        orgConfig: orgProperties
      };
      await db.update(categories).set({
        properties: updatedKpiProps
      }).where(eq(categories.id, kpiCat.id));
    }

    const effective = await getEffectiveOrgConfig();
    res.json({ success: true, data: effective, message: "Đã lưu và áp dụng thông tin Cơ quan - Đơn vị toàn hệ thống thành công!" });
  } catch (error) {
    console.error("Error saving Org config:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 1.7 RESET ORG CONFIG
kpiRouter.post('/org-config/reset', async (req, res) => {
  try {
    await db.insert(categories).values({
      code: 'SYSTEM_ORG_CONFIG',
      name: 'Cấu hình Cơ quan - Đơn vị mặc định',
      type: 'SYSTEM_CONFIG',
      properties: {
        ...DEFAULT_ORG_CONFIG,
        updatedAt: new Date().toISOString()
      },
      status: 'Đang áp dụng',
      order: 1
    }).onConflictDoUpdate({
      target: categories.code,
      set: {
        name: 'Cấu hình Cơ quan - Đơn vị mặc định',
        properties: {
          ...DEFAULT_ORG_CONFIG,
          updatedAt: new Date().toISOString()
        },
        status: 'Đang áp dụng'
      }
    });

    const effective = await getEffectiveOrgConfig();
    res.json({ success: true, data: effective, message: "Đã khôi phục thông tin Cơ quan - Đơn vị về mặc định!" });
  } catch (error) {
    console.error("Error resetting Org config:", error);
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
    const targetMonth = String(month || getCurrentMonth());
    
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
    const validWorksInMonth = allWorksInMonth.filter(isActiveWorkRecord);

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

    const autoPenaltyItems: any[] = [];
    userWorks.forEach(w => {
      const st = String(w.status || '').toLowerCase();
      let autoD = 0;
      let reason = '';
      if (st.includes('không hoàn thành') || st.includes('không đạt')) {
        autoD = 3;
        reason = st.includes('không hoàn thành') ? 'Không hoàn thành' : 'Không đạt chất lượng';
      } else if (st === 'chậm' || st === 'quá hạn' || st.includes('chậm tiến độ') || st.includes('quá hạn')) {
        autoD = 2;
        reason = 'Chậm tiến độ';
      } else if (st.includes('bổ sung nhiều lần')) {
        autoD = 1;
        reason = 'Bổ sung nhiều lần';
      }

      if (autoD > 0) {
        autoPenaltyItems.push({
          id: `work-${w.id}`,
          group: 'Công việc chuyên môn',
          content: `Nhiệm vụ: ${w.taskName || w.taskCode} - Trạng thái: ${w.status}`,
          autoD,
          officialD: autoD, // default official
          decision: 'Giữ nguyên',
          note: reason
        });
      }
    });

    const savedDetailsD = (kpiRecord?.detailsD as any) || { items: [], totalOfficialD: 0, totalAutoD: 0 };
    const savedItems = Array.isArray(savedDetailsD.items) ? savedDetailsD.items : [];
    
    // Merge: update auto items with saved decisions
    const mergedDItems = autoPenaltyItems.map(autoItem => {
      const savedMatch = savedItems.find((it: any) => it.id === autoItem.id);
      if (savedMatch) {
        return { ...autoItem, ...savedMatch, autoD: autoItem.autoD, content: autoItem.content };
      }
      return autoItem;
    });

    // Append manual penalties (those not starting with 'work-')
    const manualItems = savedItems.filter((it: any) => !String(it.id || '').startsWith('work-'));
    const finalDItems = [...mergedDItems, ...manualItems];

    const totalAutoD = finalDItems.reduce((s, it) => s + (parseFloat(it.autoD) || 0), 0);
    const totalOfficialD = finalDItems.reduce((s, it) => s + (parseFloat(it.officialD) || 0), 0);

    const detailsD = {
      ...savedDetailsD,
      items: finalDItems,
      totalAutoD,
      totalOfficialD
    };

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
        works: userWorks,
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
    const targetMonth = month || getCurrentMonth();

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

    const criterionMax: Record<string, number> = {
      A1: 5, A2: 5, A3: 5, A4: 4, A5: 4, A6: 4, A7: 3
    };
    const submittedScores = scores && typeof scores === 'object' ? scores : {};
    const unknownCode = Object.keys(submittedScores).find((code) => !(code in criterionMax));
    if (unknownCode) {
      return res.status(400).json({ success: false, message: `Mã tiêu chí A không hợp lệ: ${unknownCode}.` });
    }
    for (const [code, max] of Object.entries(criterionMax)) {
      const raw = submittedScores[code];
      if (raw === undefined || raw === null || raw === '') continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > max) {
        return res.status(400).json({ success: false, message: `Điểm ${code} phải là số từ 0 đến ${max}.` });
      }
    }
    const totalSelf = Object.keys(criterionMax).reduce(
      (sum, code) => sum + Number(submittedScores[code] ?? 0),
      0
    );
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

    // Automatically recalculate full KPI record for user
    await calculateAndSaveUserKpi(targetUser, targetMonth);

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
    const targetMonth = month || getCurrentMonth();

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
    const kpiConfig = await getEffectiveKpiConfig();
    const alloc = kpiConfig.scoreAllocation || DEFAULT_KPI_CONFIG.scoreAllocation;

    const readScore = (value: unknown) =>
      value === undefined || value === null || value === '' ? 0 : Number(value);
    const approvedA = readScore(detailsA?.approvedTotal);
    const c1Score = readScore(detailsC?.c1);
    const c2Score = readScore(detailsC?.c2);

    const invalidMainScore =
      !Number.isFinite(approvedA) || approvedA < 0 || approvedA > Number(alloc.maxA ?? 30) ||
      !Number.isFinite(c1Score) || c1Score < 0 || c1Score > Number(alloc.maxC1 ?? 6) ||
      !Number.isFinite(c2Score) || c2Score < 0 || c2Score > Number(alloc.maxC2 ?? 4);
    if (invalidMainScore) {
      return res.status(400).json({
        success: false,
        message: 'Điểm A, C1 hoặc C2 không hợp lệ hoặc vượt mức điểm tối đa.'
      });
    }
    const cScore = c1Score + c2Score;

    const dItems = detailsD?.items;
    if (dItems !== undefined && !Array.isArray(dItems)) {
      return res.status(400).json({ success: false, message: 'Danh sách điểm trừ D không hợp lệ.' });
    }
    let totalOfficialD = 0;
    for (const item of dItems || []) {
      const val = readScore(item?.officialD !== undefined ? item.officialD : item?.autoD);
      if (!Number.isFinite(val) || val < 0) {
        return res.status(400).json({ success: false, message: 'Điểm trừ D phải là số không âm.' });
      }
      totalOfficialD += val;
    }

    const existingKpi = await db.query.kpiResults.findFirst({
      where: (r, { eq }) => eq(r.kpiId, kpiId)
    });

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
    const targetMonth = month || getCurrentMonth();
    
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
    const targetMonth = month || getCurrentMonth();

    const allUsers = await db.query.users.findMany();
    const activeUsers = allUsers.filter(u => {
      const st = String(u.status || '').toLowerCase();
      return !st.includes('nghỉ') && !st.includes('khoá') && !st.includes('xóa');
    });

    const results = [];
    for (const u of activeUsers) {
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

// 10. DEPARTMENT KPI SUMMARY (Bảng tổng hợp KPI phòng & Thống kê công việc phòng)
kpiRouter.get('/department-summary', async (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = String(month || getCurrentMonth());

    const allUsers = await db.query.users.findMany({
      orderBy: (u, { asc }) => [asc(u.id)]
    });

    const validUsers = allUsers.filter(u => {
      const st = String(u.status || '').toLowerCase();
      return !st.includes('nghỉ') && !st.includes('khoá') && !st.includes('xóa');
    });

    const allWorksInMonth = await db.query.works.findMany({
      where: (w, { eq }) => eq(w.month, targetMonth),
      with: { user: true }
    });

    const validWorksInMonth = allWorksInMonth.filter(isActiveWorkRecord);

    const deptApprovedWorks = validWorksInMonth.filter(w => w.leaderApproval === 'Duyệt');
    const deptConvertedScore = deptApprovedWorks.reduce((s, w) => s + (parseFloat(w.convertedScore || '0') || 0), 0);
    const activeEmployeeIds = Array.from(new Set(deptApprovedWorks.map(w => w.userId)));
    const avgShare = activeEmployeeIds.length > 0 ? (100 / activeEmployeeIds.length) : 0;

    const naturePointMap: Record<string, number> = {
      'Đặc biệt phức tạp': 3,
      'Rất phức tạp': 2,
      'Phức tạp': 1,
      'Trung bình': 0,
      'Đơn giản': 0
    };

    let deptNatureTotal = 0;
    const natureCountMap: Record<string, number> = {
      'Đặc biệt phức tạp': 0,
      'Rất phức tạp': 0,
      'Phức tạp': 0,
      'Trung bình': 0,
      'Đơn giản': 0
    };

    deptApprovedWorks.forEach(w => {
      const nat = w.approvedNature || w.proposedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      deptNatureTotal += pt;
      if (natureCountMap[nat] !== undefined) {
        natureCountMap[nat] += 1;
      } else {
        natureCountMap[nat] = 1;
      }
    });

    const avgDeptNature = activeEmployeeIds.length > 0 ? (deptNatureTotal / activeEmployeeIds.length) : 0;

    // Fetch all KPI results for this month
    const allKpiResultsInMonth = await db.query.kpiResults.findMany({
      where: (r, { eq }) => eq(r.month, targetMonth),
      orderBy: (r, { desc }) => [desc(r.updatedAt)]
    });
    const kpiMapByUserId = new Map<number, any>();
    const kpiMapByUserName = new Map<string, any>();
    allKpiResultsInMonth.forEach(r => {
      if (r.userId && !kpiMapByUserId.has(r.userId)) kpiMapByUserId.set(r.userId, r);
      if (r.kpiId) {
        const parts = r.kpiId.split('♦');
        const userName = parts.length > 1 ? parts[1].trim() : '';
        if (userName && !kpiMapByUserName.has(userName)) kpiMapByUserName.set(userName, r);
      }
    });

    const kpiConfig = await getEffectiveKpiConfig();
    const alloc = kpiConfig.scoreAllocation || DEFAULT_KPI_CONFIG.scoreAllocation;

    // Helper: is leadership position (from Deputy Head / Phó phòng / Phó Trưởng phòng and above)
    const checkIsLeaderOrAbove = (u: any) => {
      const pos = String(u.position || '').toLowerCase();
      const grp = String(u.group || '').toLowerCase();
      const role = String(u.role || '').toUpperCase();
      return (
        pos.includes('trưởng phòng') ||
        pos.includes('phó phòng') ||
        pos.includes('phó trưởng phòng') ||
        pos.includes('lãnh đạo') ||
        pos.includes('trưởng đơn vị') ||
        pos.includes('giám đốc') ||
        pos.includes('phó giám đốc') ||
        grp.includes('lãnh đạo') ||
        role === 'ADMIN' ||
        role === 'LEADER'
      );
    };

    // Calculate details for each user
    const userKpiSummaries = validUsers.map(u => {
      const userWorks = validWorksInMonth.filter(w => w.userId === u.id);
      const userApprovedWorks = userWorks.filter(w => w.leaderApproval === 'Duyệt');
      const userCompletedWorks = userWorks.filter(w => w.status === 'Hoàn thành');
      const userPendingWorks = userWorks.filter(w => w.leaderApproval === 'Chưa duyệt' || !w.leaderApproval);
      const userDelayedWorks = userWorks.filter(w => w.status === 'Chậm' || w.status === 'Quá hạn');

      const userConvertedScore = userApprovedWorks.reduce((s, w) => s + (parseFloat(w.convertedScore || '0') || 0), 0);
      const userHours = userApprovedWorks.reduce((s, w) => s + (parseFloat(w.hours || '0') || 0), 0);
      const userShare = deptConvertedScore > 0 ? (userConvertedScore / deptConvertedScore * 100) : 0;

      // Nature points for user
      let personalNatureTotal = 0;
      userApprovedWorks.forEach(w => {
        const nat = w.approvedNature || w.proposedNature || 'Trung bình';
        const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
        personalNatureTotal += pt;
      });

      const autoC1 = avgDeptNature > 0 ? Math.round(Math.min(alloc.maxC1 || 6, (personalNatureTotal * (alloc.maxC1 || 6)) / avgDeptNature)) : 0;

      const b1 = userApprovedWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
      const b2 = (userApprovedWorks.length > 0 && avgShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userShare / avgShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
      const bTotal = Math.round(Math.min(alloc.maxB || 60, b1 + b2) * 100) / 100;

      // KPI Record from DB if available
      const kpiRecord = kpiMapByUserId.get(u.id) || kpiMapByUserName.get(u.name);
      const rawDetailsA = (kpiRecord?.detailsA as any) || null;
      const rawDetailsC = (kpiRecord?.detailsC as any) || null;
      const rawDetailsD = (kpiRecord?.detailsD as any) || null;

      // Score A: If self-scored in detailsA, use it; otherwise default to 0 for self-evaluation (do not auto-add 30)
      const explicitSelfA = rawDetailsA?.selfTotal !== null && rawDetailsA?.selfTotal !== undefined ? parseFloat(rawDetailsA.selfTotal) : null;
      
      const approvedA = rawDetailsA?.approvedTotal !== null && rawDetailsA?.approvedTotal !== undefined 
        ? parseFloat(rawDetailsA.approvedTotal) 
        : (kpiRecord?.aScore ? parseFloat(kpiRecord.aScore) : null);

      // Score C
      const c2 = rawDetailsC?.c2 !== null && rawDetailsC?.c2 !== undefined ? parseFloat(rawDetailsC.c2) : (kpiRecord?.c2Score ? parseFloat(kpiRecord.c2Score) : 0);
      const cTotal = Math.min(alloc.maxC || 10, autoC1 + c2);

      // Score D
      const autoPenaltyItems: any[] = [];
      userWorks.forEach(w => {
        const st = String(w.status || '').toLowerCase();
        let autoD = 0;
        let reason = '';
        if (st.includes('không hoàn thành') || st.includes('không đạt')) {
          autoD = 3;
          reason = st.includes('không hoàn thành') ? 'Không hoàn thành' : 'Không đạt chất lượng';
        } else if (st === 'chậm' || st === 'quá hạn' || st.includes('chậm tiến độ') || st.includes('quá hạn')) {
          autoD = 2;
          reason = 'Chậm tiến độ';
        } else if (st.includes('bổ sung nhiều lần')) {
          autoD = 1;
          reason = 'Bổ sung nhiều lần';
        }

        if (autoD > 0) {
          autoPenaltyItems.push({
            id: `work-${w.id}`,
            group: 'Công việc chuyên môn',
            content: `Nhiệm vụ: ${w.taskName || w.taskCode} - Trạng thái: ${w.status}`,
            autoD,
            officialD: autoD,
            decision: 'Giữ nguyên',
            note: reason
          });
        }
      });

      const savedDetailsD = rawDetailsD || { items: [] };
      const savedItems = Array.isArray(savedDetailsD.items) ? savedDetailsD.items : [];
      
      const mergedDItems = autoPenaltyItems.map(autoItem => {
        const savedMatch = savedItems.find((it: any) => it.id === autoItem.id);
        if (savedMatch) {
          return { ...autoItem, ...savedMatch, autoD: autoItem.autoD, content: autoItem.content };
        }
        return autoItem;
      });

      const manualItems = savedItems.filter((it: any) => !String(it.id || '').startsWith('work-'));
      const finalDItems = [...mergedDItems, ...manualItems];

      const totalOfficialD = finalDItems.reduce((s: number, item: any) => {
        const val = item.officialD !== undefined ? parseFloat(item.officialD) : parseFloat(item.autoD || '0');
        return s + (isNaN(val) ? 0 : val);
      }, 0);
      const dTotal = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;

      // Self total and ranking:
      // USER RULE: Điểm tự đánh giá = Điểm đã tự tổng hợp (B + C - D) + Điểm thực tế tự chấm A (nếu chưa tự chấm thì = 0, KHÔNG tự ý cộng 30)
      const selfAScoreForTotal = explicitSelfA !== null ? explicitSelfA : 0;
      const selfKpiTotal = calculateTotalKpi(selfAScoreForTotal, bTotal, cTotal, dTotal, kpiConfig.formula, alloc);
      
      let selfRank = 'Chưa xếp loại';
      if (explicitSelfA !== null) {
        const evalSelf = evaluateKpiRank(selfKpiTotal, kpiConfig.rankingTiers, { scoreA: explicitSelfA, scoreB: bTotal, scoreD: dTotal });
        selfRank = evalSelf.rank;
      } else {
        const evalSelf = evaluateKpiRank(selfKpiTotal, kpiConfig.rankingTiers, { scoreA: 0, scoreB: bTotal, scoreD: dTotal });
        selfRank = evalSelf.rank;
      }

      // Approved total and ranking
      let approvedKpiTotal: number | null = null;
      let approvedRank = 'Chờ duyệt';
      if (approvedA !== null) {
        approvedKpiTotal = calculateTotalKpi(approvedA, bTotal, cTotal, dTotal, kpiConfig.formula, alloc);
        const evalApproved = evaluateKpiRank(approvedKpiTotal, kpiConfig.rankingTiers, { scoreA: approvedA, scoreB: bTotal, scoreD: dTotal });
        approvedRank = evalApproved.rank;
      }

      const isLeaderOrAbove = checkIsLeaderOrAbove(u);

      // CONSTRAINT: Vị trí từ phó phòng trở lên chỉ có tự xếp loại còn lãnh đạo xếp sẽ bỏ trống
      const leaderRankDisplay = isLeaderOrAbove ? '' : approvedRank;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        position: u.position || 'Chuyên viên',
        group: u.group || 'Phòng KHTC',
        role: u.role || 'STAFF',
        isLeaderOrAbove,
        statusA: rawDetailsA?.statusA || (explicitSelfA !== null ? 'Đã tự chấm' : 'Chưa tự chấm'),
        scores: {
          selfA: explicitSelfA,
          explicitSelfA,
          approvedA,
          b1,
          b2,
          bTotal,
          c1: autoC1,
          c2,
          cTotal,
          dTotal,
          selfKpiTotal,
          approvedKpiTotal
        },
        selfRank,
        approvedRank,
        leaderRankDisplay, // Empty string for Deputy Head and above
        taskCounts: {
          total: userWorks.length,
          approved: userApprovedWorks.length,
          completed: userCompletedWorks.length,
          pending: userPendingWorks.length,
          delayed: userDelayedWorks.length,
          convertedScore: Math.round(userConvertedScore * 100) / 100,
          hours: Math.round(userHours * 10) / 10,
          personalShare: Math.round(userShare * 10) / 10
        }
      };
    });

    // Task group summary
    const taskGroupMap: Record<string, { total: number; approved: number; completed: number; score: number }> = {};
    validWorksInMonth.forEach(w => {
      const g = w.taskGroup || 'Khác';
      if (!taskGroupMap[g]) {
        taskGroupMap[g] = { total: 0, approved: 0, completed: 0, score: 0 };
      }
      taskGroupMap[g].total += 1;
      if (w.leaderApproval === 'Duyệt') {
        taskGroupMap[g].approved += 1;
        taskGroupMap[g].score += parseFloat(w.convertedScore || '0') || 0;
      }
      if (w.status === 'Hoàn thành') {
        taskGroupMap[g].completed += 1;
      }
    });

    // Rank count breakdown based on self-evaluation and approved evaluation
    const rankCounts = {
      excellent: userKpiSummaries.filter(u => u.selfRank.includes('xuất sắc') || u.approvedRank.includes('xuất sắc')).length,
      good: userKpiSummaries.filter(u => (!u.selfRank.includes('xuất sắc') && u.selfRank.includes('tốt')) || (!u.approvedRank.includes('xuất sắc') && u.approvedRank.includes('tốt'))).length,
      standard: userKpiSummaries.filter(u => (u.selfRank === 'Hoàn thành nhiệm vụ' || u.selfRank === 'Hoàn thành') || (u.approvedRank === 'Hoàn thành nhiệm vụ' || u.approvedRank === 'Hoàn thành')).length,
      fail: userKpiSummaries.filter(u => u.selfRank.includes('Không hoàn thành') || u.approvedRank.includes('Không hoàn thành')).length,
      pending: userKpiSummaries.filter(u => u.scores.approvedA === null && !u.isLeaderOrAbove).length
    };

    res.json({
      success: true,
      data: {
        month: targetMonth,
        department: 'Phòng Kế hoạch - Tài chính',
        stats: {
          totalUsers: validUsers.length,
          evaluatedSelfUsers: userKpiSummaries.filter(u => u.scores.selfA !== null).length,
          approvedUsers: userKpiSummaries.filter(u => u.scores.approvedA !== null).length,
          leaderCount: userKpiSummaries.filter(u => u.isLeaderOrAbove).length,
          staffCount: userKpiSummaries.filter(u => !u.isLeaderOrAbove).length,
          totalWorks: validWorksInMonth.length,
          approvedWorks: deptApprovedWorks.length,
          completedWorks: validWorksInMonth.filter(w => w.status === 'Hoàn thành').length,
          pendingWorks: validWorksInMonth.filter(w => w.leaderApproval === 'Chưa duyệt' || !w.leaderApproval).length,
          delayedWorks: validWorksInMonth.filter(w => w.status === 'Chậm' || w.status === 'Quá hạn').length,
          deptConvertedScore: Math.round(deptConvertedScore * 100) / 100,
          deptNatureTotal: Math.round(deptNatureTotal * 100) / 100,
          avgDeptNature: Math.round(avgDeptNature * 100) / 100,
          activeEmployeesCount: activeEmployeeIds.length,
          rankCounts
        },
        taskGroupSummary: taskGroupMap,
        natureDistribution: natureCountMap,
        users: userKpiSummaries
      }
    });
  } catch (error) {
    console.error("Error fetching department KPI summary:", error);
    res.status(500).json({ error: String(error) });
  }
});

export async function calculateAndSaveUserKpi(targetUser: any, targetMonth: string) {
  const allWorksInMonth = await db.query.works.findMany({
    where: (w, { eq }) => eq(w.month, targetMonth)
  });
  const validWorksInMonth = allWorksInMonth.filter(isActiveWorkRecord);

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
    : (existingKpi?.aScore ? parseFloat(existingKpi.aScore) : null);

  const rawDetailsC = (existingKpi?.detailsC as any) || {};
  const c2Score = rawDetailsC.c2 !== undefined ? parseFloat(rawDetailsC.c2) : (existingKpi?.c2Score ? parseFloat(existingKpi.c2Score) : 0);
  const cScore = Math.min(alloc.maxC || 10, autoC1 + c2Score);

  const rawDetailsD = (existingKpi?.detailsD as any) || {};
  
  const autoPenaltyItems: any[] = [];
  userWorks.forEach(w => {
    const st = String(w.status || '').toLowerCase();
    let autoD = 0;
    let reason = '';
    if (st.includes('không hoàn thành') || st.includes('không đạt')) {
      autoD = 3;
      reason = st.includes('không hoàn thành') ? 'Không hoàn thành' : 'Không đạt chất lượng';
    } else if (st === 'chậm' || st === 'quá hạn' || st.includes('chậm tiến độ') || st.includes('quá hạn')) {
      autoD = 2;
      reason = 'Chậm tiến độ';
    } else if (st.includes('bổ sung nhiều lần')) {
      autoD = 1;
      reason = 'Bổ sung nhiều lần';
    }

    if (autoD > 0) {
      autoPenaltyItems.push({
        id: `work-${w.id}`,
        group: 'Công việc chuyên môn',
        content: `Nhiệm vụ: ${w.taskName || w.taskCode} - Trạng thái: ${w.status}`,
        autoD,
        officialD: autoD,
        decision: 'Giữ nguyên',
        note: reason
      });
    }
  });

  const savedItems = Array.isArray(rawDetailsD.items) ? rawDetailsD.items : [];
  
  const mergedDItems = autoPenaltyItems.map(autoItem => {
    const savedMatch = savedItems.find((it: any) => it.id === autoItem.id);
    if (savedMatch) {
      return { ...autoItem, ...savedMatch, autoD: autoItem.autoD, content: autoItem.content };
    }
    return autoItem;
  });

  const manualItems = savedItems.filter((it: any) => !String(it.id || '').startsWith('work-'));
  const finalDItems = [...mergedDItems, ...manualItems];

  const totalOfficialD = finalDItems.reduce((s: number, item: any) => {
    const val = item.officialD !== undefined ? parseFloat(item.officialD) : parseFloat(item.autoD || '0');
    return s + (isNaN(val) ? 0 : val);
  }, 0);
  const dScore = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;
  const updatedDetailsD = {
    ...rawDetailsD,
    items: finalDItems,
    totalAutoD: finalDItems.reduce((s, it) => s + (parseFloat(it.autoD) || 0), 0),
    totalOfficialD
  };

  let totalKpi: number | null = null;
  let rankEval = { rank: 'Chưa xếp loại' };
  if (approvedA !== null) {
    totalKpi = calculateTotalKpi(approvedA, bTotal, cScore, dScore, kpiConfig.formula, alloc);
    rankEval = evaluateKpiRank(totalKpi, kpiConfig.rankingTiers, { scoreA: approvedA, scoreB: bTotal, scoreD: dScore });
  }

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
    aScore: approvedA !== null ? String(approvedA) : null,
    b1Score: String(b1),
    b2Score: String(b2),
    bScore: String(bTotal),
    c1Score: String(autoC1),
    c2Score: String(c2Score),
    cScore: String(cScore),
    dScore: String(dScore),
    totalKpi: totalKpi !== null ? String(totalKpi) : null,
    rank: rankEval.rank,
    detailsA: rawDetailsA,
    detailsC: updatedDetailsC,
    detailsD: updatedDetailsD,
    note: `Tự động cập nhật tính toán KPI lúc ${new Date().toLocaleString('vi-VN')}`
  }).onConflictDoUpdate({
    target: kpiResults.kpiId,
    set: {
      aScore: approvedA !== null ? String(approvedA) : null,
      b1Score: String(b1),
      b2Score: String(b2),
      bScore: String(bTotal),
      c1Score: String(autoC1),
      c2Score: String(c2Score),
      cScore: String(cScore),
      dScore: String(dScore),
      totalKpi: totalKpi !== null ? String(totalKpi) : null,
      rank: rankEval.rank,
      detailsC: updatedDetailsC,
      detailsD: updatedDetailsD,
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
