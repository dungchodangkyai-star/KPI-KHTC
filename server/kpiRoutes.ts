import express from 'express';
import { db } from '../src/db/index.ts';
import { users, works, kpiResults, categories } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { 
  DEFAULT_KPI_CONFIG, 
  DEFAULT_ORG_CONFIG, 
  calculateTotalKpi, 
  evaluateKpiRank,
  getWorkSelfConvertedScore,
  getWorkApprovedConvertedScore,
  isWorkApproved,
  canonicalizeTaskGroup,
  KPI_A_CRITERIA,
  getCurrentMonth
} from '../src/utils.ts';
import { ADMIN_EMAIL } from './auth.ts';

export const kpiRouter = express.Router();

export function validateAndSanitizeDetailsA(
  inputDetailsA: any,
  existingDetailsA?: any,
  options?: { isSelfScore?: boolean; isApproval?: boolean; maxA?: number }
) {
  const maxA = options?.maxA || 30;
  const existingScores = (existingDetailsA && typeof existingDetailsA === 'object' && existingDetailsA.scores) ? existingDetailsA.scores : {};
  const inputScores = (inputDetailsA && typeof inputDetailsA === 'object') ? (inputDetailsA.scores || inputDetailsA) : {};
  
  const sanitizedScores: Record<string, { max: number; self: number | null; approved: number | null; reason: string }> = {};
  
  let selfSum = 0;
  let hasAnySelf = false;
  let approvedSum = 0;
  let hasAnyApproved = false;
  let allApprovedFilled = true;

  const isExplicitApproval = Boolean(options?.isApproval || inputDetailsA?.statusA === 'Đã duyệt');

  for (const crit of KPI_A_CRITERIA) {
    const code = crit.code;
    const maxScore = crit.maxScore;

    // --- 1. Evaluate self score ---
    let selfVal: number | null = null;
    if (options?.isSelfScore) {
      const rawSelf = inputScores?.[code] !== undefined ? inputScores[code] : (inputDetailsA?.[code] !== undefined ? inputDetailsA[code] : null);
      if (rawSelf !== null && rawSelf !== undefined && rawSelf !== '') {
        const num = parseFloat(String(rawSelf));
        if (!isNaN(num) && isFinite(num)) {
          selfVal = Math.round(Math.min(maxScore, Math.max(0, num)) * 10) / 10;
        }
      }
    } else {
      let rawSelf: any = undefined;
      if (inputScores?.[code]?.self !== undefined && inputScores?.[code]?.self !== null && inputScores?.[code]?.self !== '') {
        rawSelf = inputScores[code].self;
      } else if (existingScores?.[code]?.self !== undefined && existingScores?.[code]?.self !== null && existingScores?.[code]?.self !== '') {
        rawSelf = existingScores[code].self;
      } else if (inputScores?.[code] !== undefined && typeof inputScores[code] !== 'object' && inputScores[code] !== null && inputScores[code] !== '') {
        rawSelf = inputScores[code];
      }

      if (rawSelf !== undefined && rawSelf !== null && rawSelf !== '') {
        const num = parseFloat(String(rawSelf));
        if (!isNaN(num) && isFinite(num)) {
          selfVal = Math.round(Math.min(maxScore, Math.max(0, num)) * 10) / 10;
        }
      }
    }

    if (selfVal !== null) {
      hasAnySelf = true;
      selfSum += selfVal;
    }

    // --- 2. Evaluate approved score ---
    let approvedVal: number | null = null;
    let reason = '';

    if (options?.isSelfScore) {
      // When employee is self-scoring, strictly preserve any existing leader approval
      const rawApproved = existingScores?.[code]?.approved;
      if (rawApproved !== null && rawApproved !== undefined && rawApproved !== '') {
        const num = parseFloat(String(rawApproved));
        if (!isNaN(num) && isFinite(num)) {
          approvedVal = Math.round(Math.min(maxScore, Math.max(0, num)) * 10) / 10;
        }
      }
      reason = String(existingScores?.[code]?.reason || '');
    } else {
      // For approval submissions or recalculation: Prioritize input approved score, then fallback to existing
      let rawApproved: any = undefined;
      if (inputScores?.[code]?.approved !== undefined && inputScores?.[code]?.approved !== null && inputScores?.[code]?.approved !== '') {
        rawApproved = inputScores[code].approved;
      } else if (inputScores?.[code] !== undefined && typeof inputScores[code] !== 'object' && inputScores[code] !== null && inputScores[code] !== '') {
        rawApproved = inputScores[code];
      } else if (existingScores?.[code]?.approved !== undefined && existingScores?.[code]?.approved !== null && existingScores?.[code]?.approved !== '') {
        rawApproved = existingScores[code].approved;
      }

      if (rawApproved !== undefined && rawApproved !== null && rawApproved !== '') {
        const num = parseFloat(String(rawApproved));
        if (!isNaN(num) && isFinite(num)) {
          approvedVal = Math.round(Math.min(maxScore, Math.max(0, num)) * 10) / 10;
        }
      }

      reason = String(
        inputScores?.[code]?.reason || 
        inputDetailsA?.scores?.[code]?.reason || 
        existingScores?.[code]?.reason || 
        ''
      );
    }

    if (approvedVal !== null) {
      hasAnyApproved = true;
      approvedSum += approvedVal;
    } else {
      allApprovedFilled = false;
    }

    sanitizedScores[code] = {
      max: maxScore,
      self: selfVal,
      approved: approvedVal,
      reason
    };
  }

  const finalSelfTotal = hasAnySelf ? Math.round(Math.min(maxA, Math.max(0, selfSum)) * 10) / 10 : null;

  let statusA = inputDetailsA?.statusA || existingDetailsA?.statusA || 'Chưa tự chấm';
  if (options?.isSelfScore) {
    statusA = hasAnySelf ? 'Đã tự chấm' : 'Chưa tự chấm';
  } else if (isExplicitApproval) {
    statusA = (hasAnyApproved && allApprovedFilled) ? 'Đã duyệt' : (hasAnySelf ? 'Đã tự chấm' : 'Chưa tự chấm');
  } else {
    if (existingDetailsA?.statusA === 'Đã duyệt' && hasAnyApproved && allApprovedFilled) {
      statusA = 'Đã duyệt';
    } else if (hasAnyApproved && allApprovedFilled) {
      statusA = 'Đã duyệt';
    } else if (hasAnySelf) {
      statusA = 'Đã tự chấm';
    } else {
      statusA = 'Chưa tự chấm';
    }
  }

  const isApprovedA = statusA === 'Đã duyệt';
  const finalApprovedTotal = isApprovedA && hasAnyApproved 
    ? Math.round(Math.min(maxA, Math.max(0, approvedSum)) * 10) / 10 
    : null;

  return {
    statusA,
    selfTotal: finalSelfTotal,
    approvedTotal: finalApprovedTotal,
    noteA: String(inputDetailsA?.noteA ?? existingDetailsA?.noteA ?? ''),
    leaderNoteA: String(inputDetailsA?.leaderNoteA ?? existingDetailsA?.leaderNoteA ?? ''),
    scores: sanitizedScores,
    updatedAt: new Date().toISOString()
  };
}

export function isKpiLeaderOrAdmin(u: any): boolean {
  if (!u) return false;
  const role = String(u.role || '').toUpperCase();
  const email = String(u.email || '').toLowerCase();
  if (role === 'ADMIN' || email === ADMIN_EMAIL.toLowerCase()) return true;
  if (role === 'LEADER') return true;

  const pos = String(u.position || '').toLowerCase();
  const grp = String(u.group || '').toLowerCase();
  
  if (
    pos.includes('trưởng phòng') ||
    pos.includes('phó phòng') ||
    pos.includes('phó trưởng phòng') ||
    pos.includes('lãnh đạo') ||
    pos.includes('trưởng đơn vị') ||
    pos.includes('giám đốc') ||
    pos.includes('phó giám đốc') ||
    grp.includes('lãnh đạo')
  ) {
    return true;
  }

  try {
    if (u.permissions) {
      const perms = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions;
      if (Array.isArray(perms) && (perms.includes('full_access') || perms.includes('kpi_manage') || perms.includes('approve_kpi') || perms.includes('leader'))) {
        return true;
      }
    }
  } catch {}

  return false;
}

export function isUserActive(u: any): boolean {
  if (!u) return false;
  const st = String(u.status || '').toLowerCase().trim();
  if (st === 'đang làm') return true;
  if (
    st.includes('nghỉ') ||
    st.includes('khoá') ||
    st.includes('khóa') ||
    st.includes('xóa') ||
    st.includes('xoa') ||
    st.includes('từ chối') ||
    st.includes('tu choi') ||
    st.includes('chờ duyệt') ||
    st.includes('cho duyet') ||
    st === 'inactive' ||
    st === 'locked' ||
    st === 'disabled' ||
    st === 'deleted'
  ) {
    return false;
  }
  return true;
}

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

export async function getEffectiveWorkNaturePointMap(): Promise<Record<string, number>> {
  try {
    const natureCats = await db.query.categories.findMany({
      where: (cat, { eq }) => eq(cat.type, 'WORK_NATURE')
    });
    if (natureCats && natureCats.length > 0) {
      const activeCats = natureCats.filter(cat => {
        const st = String(cat.status || '').toLowerCase().trim();
        return !st.includes('khóa') && !st.includes('khoa') && !st.includes('tạm khóa') && !st.includes('xóa') && !st.includes('xoa') && st !== 'inactive';
      });
      const targetCats = activeCats.length > 0 ? activeCats : natureCats;
      const map: Record<string, number> = {};
      for (const cat of targetCats) {
        const props: any = cat.properties || {};
        const pt = props.c1Point !== undefined 
          ? Number(props.c1Point) 
          : (props.bonusC1 !== undefined 
            ? Number(props.bonusC1) 
            : (props.point !== undefined ? Number(props.point) : 0));
        map[cat.name] = isNaN(pt) ? 0 : pt;
      }
      return map;
    }
  } catch (err) {
    console.error("Error reading WORK_NATURE from DB:", err);
  }
  return {
    'Đặc biệt phức tạp': 3,
    'Rất phức tạp': 2,
    'Phức tạp': 1,
    'Trung bình': 0,
    'Đơn giản': 0,
    'Rất đơn giản': 0
  };
}

/**
 * Resolves penalty points from dynamic kpiConfig.penaltyRules or defaults
 */
export function getRuleScoreFromPenaltyRules(keywords: string[], penaltyRules: any[], defaultScore: number): number {
  if (!Array.isArray(penaltyRules)) return defaultScore;
  const found = penaltyRules.find((r: any) => {
    const g = String(r.group || '').toLowerCase();
    const d = String(r.desc || '').toLowerCase();
    return keywords.some(kw => g.includes(kw.toLowerCase()) || d.includes(kw.toLowerCase()));
  });
  if (found && found.defaultScore !== undefined && !isNaN(Number(found.defaultScore))) {
    return Number(found.defaultScore);
  }
  return defaultScore;
}

/**
 * Generates automated penalty items for criterion D from a user's works in the month:
 * 1. Synchronized with kpiConfig.penaltyRules (not hardcoded 3/2/1)
 * 2. Properly handles 'Không duyệt' (marks as failed quality penalty) and 'Cần bổ sung' (repeated supplement penalty)
 * 3. Honors leader-approved penalty exemptions (w.penaltyExemption)
 */
export function generateWorkPenaltyItems(userWorks: any[], penaltyRules: any[]): any[] {
  const penaltyIncomplete = getRuleScoreFromPenaltyRules(['không hoàn thành', 'chưa hoàn thành'], penaltyRules, 3);
  const penaltyRejected = getRuleScoreFromPenaltyRules(['không đạt chất lượng', 'không duyệt', 'không đạt'], penaltyRules, 3);
  const penaltyLate = getRuleScoreFromPenaltyRules(['chậm', 'quá hạn'], penaltyRules, 2);
  const penaltySupplement = getRuleScoreFromPenaltyRules(['bổ sung'], penaltyRules, 1);

  const autoPenaltyItems: any[] = [];
  userWorks.forEach(w => {
    const st = String(w.status || '').toLowerCase().trim();
    const appr = String(w.leaderApproval || '').trim();
    const isExemptStr = String(w.penaltyExemption || '').trim().toLowerCase();
    const isExempt = isExemptStr === 'có' || isExemptStr === 'yes' || isExemptStr === 'miễn trừ' || isExemptStr === 'true';

    let autoD = 0;
    let reason = '';
    let group = 'Công việc chuyên môn';

    // 1. Leader rejected the work (failed quality / non-compliant)
    if (appr === 'Không duyệt') {
      autoD = penaltyRejected;
      group = 'Không đạt chất lượng / Không duyệt';
      reason = w.leaderNote ? `Lãnh đạo không duyệt: ${w.leaderNote}` : 'Sản phẩm/Hồ sơ không đạt chất lượng (Lãnh đạo không duyệt)';
    }
    // 2. Incomplete or canceled work
    else if (st.includes('không hoàn thành') || st.includes('không đạt') || st === 'hủy') {
      autoD = penaltyIncomplete;
      group = 'Không hoàn thành';
      reason = 'Không hoàn thành nhiệm vụ';
    }
    // 3. Late progress / overdue
    else if (st === 'chậm' || st === 'quá hạn' || st.includes('chậm tiến độ') || st.includes('quá hạn')) {
      autoD = penaltyLate;
      group = 'Chậm tiến độ';
      reason = 'Chậm tiến độ thực hiện so với kế hoạch';
    }
    // 4. Repeated supplement required
    else if (appr === 'Cần bổ sung' || st.includes('bổ sung nhiều lần')) {
      autoD = penaltySupplement;
      group = 'Hồ sơ bổ sung nhiều lần';
      reason = w.leaderNote ? `Yêu cầu bổ sung: ${w.leaderNote}` : 'Hồ sơ cần bổ sung, chỉnh sửa nhiều lần';
    }

    if (autoD > 0) {
      if (isExempt) {
        autoPenaltyItems.push({
          id: `work-${w.id}`,
          workId: w.workId,
          taskName: w.taskName || w.taskCode,
          group,
          content: `Nhiệm vụ: ${w.taskName || w.taskCode} - Trạng thái: ${w.status}`,
          autoD: 0,
          officialD: 0,
          decision: 'Miễn phạt',
          note: `${reason} (Đã được Lãnh đạo chấp thuận miễn trừ phạt: ${w.lateReason || 'Lý do khách quan'})`,
          reason: `${reason} (Đã được Lãnh đạo chấp thuận miễn trừ phạt: ${w.lateReason || 'Lý do khách quan'})`,
          isExempted: true
        });
      } else {
        autoPenaltyItems.push({
          id: `work-${w.id}`,
          workId: w.workId,
          taskName: w.taskName || w.taskCode,
          group,
          content: `Nhiệm vụ: ${w.taskName || w.taskCode} - Trạng thái: ${w.status}`,
          autoD,
          officialD: autoD,
          decision: 'Giữ nguyên',
          note: reason,
          reason
        });
      }
    }
  });

  return autoPenaltyItems;
}

/**
 * Merges auto penalty items with existing/saved decisions on criterion D.
 * CRITICAL FIX:
 * - If statusD === 'Đã duyệt', existing decisions and official deductions are strictly preserved.
 * - Newly arising violations that were NOT present during the leader's approval will NOT silently increase official deductions.
 * - If new unapproved violations appear after D was approved, statusD transitions to 'Chờ duyệt' so the leader must verify.
 */
export function mergePenaltyItems(
  autoPenaltyItems: any[],
  rawDetailsD: any,
  options?: { isApprovalSubmission?: boolean }
) {
  const isAlreadyApprovedD = rawDetailsD?.statusD === 'Đã duyệt';
  const savedItems = Array.isArray(rawDetailsD?.items) ? rawDetailsD.items : [];

  let hasNewUnapprovedViolations = false;
  const mergedDItems = autoPenaltyItems.map(autoItem => {
    const savedMatch = savedItems.find((it: any) => it.id === autoItem.id);
    if (savedMatch) {
      return { 
        ...autoItem, 
        ...savedMatch, 
        autoD: autoItem.autoD, 
        content: autoItem.content,
        officialD: savedMatch.officialD !== undefined && savedMatch.officialD !== null && savedMatch.officialD !== ''
          ? Number(savedMatch.officialD)
          : (savedMatch.autoD !== undefined ? Number(savedMatch.autoD) : autoItem.autoD)
      };
    }
    // Brand new penalty item not present during previous approval
    if (autoItem.autoD > 0 && !autoItem.isExempted) {
      hasNewUnapprovedViolations = true;
    }
    if (isAlreadyApprovedD && !options?.isApprovalSubmission) {
      return { 
        ...autoItem, 
        officialD: 0, 
        decision: 'Chờ thẩm định', 
        note: (autoItem.note || '') + ' [Phát sinh sau khi duyệt D - cần Lãnh đạo thẩm định lại]' 
      };
    }
    return autoItem;
  });

  const manualItems = savedItems.filter((it: any) => !String(it.id || '').startsWith('work-'));
  const finalDItems = [...mergedDItems, ...manualItems];

  const totalAutoD = autoPenaltyItems.reduce((s: number, it: any) => s + (parseFloat(it.autoD) || 0), 0);
  const totalOfficialD = finalDItems.reduce((s: number, it: any) => {
    const val = it.officialD !== undefined && it.officialD !== null && it.officialD !== '' ? parseFloat(it.officialD) : parseFloat(it.autoD || '0');
    return s + (isNaN(val) || !isFinite(val) ? 0 : Math.max(0, val));
  }, 0);

  let statusD = rawDetailsD?.statusD || 'Chờ duyệt';
  if (options?.isApprovalSubmission) {
    statusD = 'Đã duyệt';
  } else if (isAlreadyApprovedD && hasNewUnapprovedViolations) {
    statusD = 'Chờ duyệt';
  }

  return {
    items: finalDItems,
    totalAutoD,
    totalOfficialD,
    statusD,
    hasNewUnapprovedViolations
  };
}

/**
 * Generates an immutable, deterministic KPI ID strictly bound to (month, userId).
 * Eliminates issues caused by employee renaming or name homonyms.
 */
export function generateKpiId(month: string, userId: number): string {
  return `${month}♦u${userId}`;
}

/**
 * Finds a user's KPI record for a specific month with multi-stage fallback:
 * 1. Exact relational match by (month, userId)
 * 2. Canonical ID match (${month}♦u${userId})
 * 3. Legacy ID fallback (${month}♦${userName}) for backward compatibility
 */
export async function findUserKpiRecord(month: string, userId: number, userName?: string) {
  // 1. Primary & safest: match by composite key (month, userId)
  const byUserAndMonth = await db.query.kpiResults.findFirst({
    where: (r, { eq, and }) => and(eq(r.month, month), eq(r.userId, userId))
  });
  if (byUserAndMonth) return byUserAndMonth;

  // 2. Match by canonical KPI ID
  const canonicalId = generateKpiId(month, userId);
  const byCanonicalId = await db.query.kpiResults.findFirst({
    where: (r, { eq }) => eq(r.kpiId, canonicalId)
  });
  if (byCanonicalId) return byCanonicalId;

  // 3. Fallback for legacy records created with `${month}♦${userName}`
  if (userName) {
    const legacyId = `${month}♦${userName}`;
    const byLegacyId = await db.query.kpiResults.findFirst({
      where: (r, { eq }) => eq(r.kpiId, legacyId)
    });
    if (byLegacyId) return byLegacyId;
  }

  return null;
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
    const authUser = (req as any).authUser;
    if (!isKpiLeaderOrAdmin(authUser)) {
      return res.status(403).json({ success: false, error: 'Chỉ Quản trị viên hoặc Lãnh đạo mới có quyền chỉnh sửa thông tin Cơ quan - Đơn vị.' });
    }
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
    const authUser = (req as any).authUser;
    if (!isKpiLeaderOrAdmin(authUser)) {
      return res.status(403).json({ success: false, error: 'Chỉ Quản trị viên hoặc Lãnh đạo mới có quyền khôi phục cấu hình Cơ quan - Đơn vị.' });
    }
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
    const authUser = (req as any).authUser;
    if (!isKpiLeaderOrAdmin(authUser)) {
      return res.status(403).json({ success: false, error: 'Chỉ Quản trị viên hoặc Lãnh đạo mới có quyền lưu cấu hình phân bổ điểm & xếp loại KPI.' });
    }
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
    const authUser = (req as any).authUser;
    if (!isKpiLeaderOrAdmin(authUser)) {
      return res.status(403).json({ success: false, error: 'Chỉ Quản trị viên hoặc Lãnh đạo mới có quyền khôi phục cấu hình KPI về mặc định.' });
    }
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
    const authUser = (req as any).authUser;
    
    let targetUser: any = null;
    if (!isKpiLeaderOrAdmin(authUser)) {
      // Nhân viên chỉ được xem KPI của chính mình; không tin userId truy vấn của người khác
      if (userId && Number(userId) !== Number(authUser.id)) {
        return res.status(403).json({ success: false, error: "Bạn chỉ có quyền xem chi tiết KPI của chính mình." });
      }
      targetUser = authUser;
    } else {
      if (userId) {
        targetUser = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.id, Number(userId))
        });
      } else if (userName) {
        targetUser = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.name, String(userName))
        });
      } else {
        targetUser = authUser;
      }
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, error: "Không tìm thấy người dùng." });
    }

    const allUsers = await db.query.users.findMany();
    const activeUsers = allUsers.filter(isUserActive);
    const activeUserIds = new Set(activeUsers.map(u => u.id));

    const allWorksInMonth = await db.query.works.findMany({
      where: (w, { eq }) => eq(w.month, targetMonth)
    });
    
    // Department-level valid works ONLY include works of active employees (resigned/locked users excluded from denominator)
    const validWorksInMonth = allWorksInMonth.filter(w => {
      const ds = String(w.dataStatus || '').toLowerCase().trim();
      const isDataValid = !ds.includes('xóa') && !ds.includes('xoa') && !ds.includes('thu hồi') && ds !== 'deleted' && ds !== 'trash';
      const isUserValid = w.userId ? activeUserIds.has(w.userId) : false;
      return isDataValid && isUserValid;
    });

    const userWorks = allWorksInMonth.filter(w => {
      const ds = String(w.dataStatus || '').toLowerCase().trim();
      const isDataValid = !ds.includes('xóa') && !ds.includes('xoa') && !ds.includes('thu hồi') && ds !== 'deleted' && ds !== 'trash';
      return isDataValid && w.userId === targetUser.id;
    });
    const userApprovedWorks = userWorks.filter(w => w.leaderApproval === 'Duyệt');
    
    // Approved B calculations (leaderApproval === 'Duyệt', using approvedConvertedScore with strict fallback)
    const deptApprovedWorks = validWorksInMonth.filter(w => w.leaderApproval === 'Duyệt');
    const deptApprovedConvertedScore = deptApprovedWorks.reduce((s, w) => s + getWorkApprovedConvertedScore(w), 0);
    const userApprovedConvertedScore = userApprovedWorks.reduce((s, w) => s + getWorkApprovedConvertedScore(w), 0);
    
    const activeApprovedEmployeeIds = Array.from(new Set(deptApprovedWorks.map(w => w.userId)));
    const activeDeptPersonnelCount = Math.max(activeUsers.length, 1);
    const avgApprovedShare = 100 / activeDeptPersonnelCount;
    const userApprovedShare = deptApprovedConvertedScore > 0 ? (userApprovedConvertedScore / deptApprovedConvertedScore * 100) : 0;

    // Self B calculations (all valid works, using selfConvertedScore with fallback)
    const deptSelfConvertedScore = validWorksInMonth.reduce((s, w) => s + getWorkSelfConvertedScore(w), 0);
    const userSelfConvertedScore = userWorks.reduce((s, w) => s + getWorkSelfConvertedScore(w), 0);
    const activeSelfEmployeeIds = Array.from(new Set(validWorksInMonth.map(w => w.userId)));
    const avgSelfShare = 100 / activeDeptPersonnelCount;
    const userSelfShare = deptSelfConvertedScore > 0 ? (userSelfConvertedScore / deptSelfConvertedScore * 100) : 0;

    const naturePointMap = await getEffectiveWorkNaturePointMap();

    // Self C1 calculations (all valid works in month, independent of leaderApproval; proposedNature -> approvedNature -> 'Trung bình')
    let selfPersonalNatureTotal = 0;
    let selfDeptNatureTotal = 0;
    const selfDistribution: Record<string, { personalCount: number; deptCount: number; personalPoint: number; deptPoint: number }> = {};
    Object.keys(naturePointMap).forEach(nat => {
      selfDistribution[nat] = { personalCount: 0, deptCount: 0, personalPoint: 0, deptPoint: 0 };
    });
    validWorksInMonth.forEach(w => {
      const nat = w.proposedNature || w.approvedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      const bucket = selfDistribution[nat] || (selfDistribution[nat] = { personalCount: 0, deptCount: 0, personalPoint: 0, deptPoint: 0 });
      bucket.deptCount += 1;
      bucket.deptPoint += pt;
      selfDeptNatureTotal += pt;
    });
    userWorks.forEach(w => {
      const nat = w.proposedNature || w.approvedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      const bucket = selfDistribution[nat] || (selfDistribution[nat] = { personalCount: 0, deptCount: 0, personalPoint: 0, deptPoint: 0 });
      bucket.personalCount += 1;
      bucket.personalPoint += pt;
      selfPersonalNatureTotal += pt;
    });
    const selfComplexTasks = userWorks.filter(w => {
      const nat = w.proposedNature || w.approvedNature || 'Trung bình';
      return (naturePointMap[nat] || 0) > 0;
    });
    const avgSelfDeptNature = selfDeptNatureTotal / activeDeptPersonnelCount;

    const kpiConfig = await getEffectiveKpiConfig();
    const alloc = kpiConfig.scoreAllocation || DEFAULT_KPI_CONFIG.scoreAllocation;
    const maxC1Val = alloc.maxC1 || 6;
    const selfAutoC1 = avgSelfDeptNature > 0 ? Math.round(Math.min(maxC1Val, (selfPersonalNatureTotal * maxC1Val) / avgSelfDeptNature)) : 0;

    // Approved C1 calculations (only leaderApproval === 'Duyệt'; approvedNature -> proposedNature -> 'Trung bình')
    let personalNatureTotal = 0;
    let deptNatureTotal = 0;

    deptApprovedWorks.forEach(w => {
      const nat = w.approvedNature || w.proposedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      deptNatureTotal += pt;
    });
    userApprovedWorks.forEach(w => {
      const nat = w.approvedNature || w.proposedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      personalNatureTotal += pt;
    });

    const avgDeptNature = deptNatureTotal / activeDeptPersonnelCount;
    const approvedAutoC1 = avgDeptNature > 0 ? Math.round(Math.min(maxC1Val, (personalNatureTotal * maxC1Val) / avgDeptNature)) : 0;
    const autoC1 = approvedAutoC1;

    const approvedB1 = userApprovedWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userApprovedConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
    const approvedB2 = (userApprovedWorks.length > 0 && avgApprovedShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userApprovedShare / avgApprovedShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
    const approvedBTotal = Math.round(Math.min(alloc.maxB || 60, approvedB1 + approvedB2) * 100) / 100;

    const selfB1 = userWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userSelfConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
    const selfB2 = (userWorks.length > 0 && avgSelfShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userSelfShare / avgSelfShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
    const selfBTotal = Math.round(Math.min(alloc.maxB || 60, selfB1 + selfB2) * 100) / 100;

    const kpiId = generateKpiId(targetMonth, targetUser.id);
    const kpiRecord = await findUserKpiRecord(targetMonth, targetUser.id, targetUser.name);

    const detailsA = validateAndSanitizeDetailsA(kpiRecord?.detailsA, undefined, { maxA: alloc.maxA });
    const rawDetailsC = (kpiRecord?.detailsC as any) || {};
    const finalC1 = approvedAutoC1;
    const rawC2Val = rawDetailsC.c2 !== undefined ? rawDetailsC.c2 : (kpiRecord?.c2Score ? parseFloat(kpiRecord.c2Score) : 0);
    const finalC2 = isNaN(rawC2Val) || !isFinite(rawC2Val) ? 0 : Math.max(0, Math.min(alloc.maxC2 || 4, rawC2Val));
    const finalTotalC = Math.min(alloc.maxC || 10, finalC1 + finalC2);

    const detailsC = {
      ...rawDetailsC,
      c1: finalC1,
      c2: finalC2,
      totalC: finalTotalC,
      selfAutoC1,
      approvedAutoC1,
      autoC1: approvedAutoC1,
      personalNatureTotal: Math.round(personalNatureTotal * 100) / 100,
      deptNatureTotal: Math.round(deptNatureTotal * 100) / 100,
      activeEmployeeCount: activeDeptPersonnelCount,
      avgDeptNature: Math.round(avgDeptNature * 100) / 100,
      selfPersonalNatureTotal: Math.round(selfPersonalNatureTotal * 100) / 100,
      selfDeptNatureTotal: Math.round(selfDeptNatureTotal * 100) / 100,
      selfAvgDeptNature: Math.round(avgSelfDeptNature * 100) / 100,
      selfActiveEmployeeCount: activeDeptPersonnelCount,
      selfDistribution,
      selfComplexTasks
    };

    const penaltyRules = kpiConfig.penaltyRules || DEFAULT_KPI_CONFIG.penaltyRules;
    const autoPenaltyItems = generateWorkPenaltyItems(userWorks, penaltyRules);
    const savedDetailsD = (kpiRecord?.detailsD as any) || { items: [], totalOfficialD: 0, totalAutoD: 0, statusD: 'Chờ duyệt' };
    const mergedD = mergePenaltyItems(autoPenaltyItems, savedDetailsD);

    const totalAutoD = mergedD.totalAutoD;
    const totalOfficialD = mergedD.totalOfficialD;

    const detailsD = {
      ...savedDetailsD,
      items: mergedD.items,
      totalAutoD,
      totalOfficialD,
      statusD: mergedD.statusD,
      hasNewUnapprovedViolations: mergedD.hasNewUnapprovedViolations
    };

    const explicitSelfA = detailsA?.selfTotal !== null && detailsA?.selfTotal !== undefined && !isNaN(Number(detailsA.selfTotal)) ? Number(detailsA.selfTotal) : null;
    const selfAScoreForTotal = explicitSelfA !== null ? explicitSelfA : 0;
    const selfD = alloc.maxD ? Math.min(alloc.maxD, totalAutoD) : totalAutoD;
    const selfC = Math.min(alloc.maxC || 10, selfAutoC1);
    const selfKpiTotal = calculateTotalKpi(selfAScoreForTotal, selfBTotal, selfC, selfD, kpiConfig.formula, alloc);
    let selfRank = 'Chưa xếp loại';
    if (explicitSelfA !== null) {
      selfRank = evaluateKpiRank(selfKpiTotal, kpiConfig.rankingTiers, { scoreA: explicitSelfA, scoreB: selfBTotal, scoreD: selfD }).rank;
    } else {
      selfRank = 'Chưa tự chấm A';
    }

    const statusA = detailsA?.statusA;
    const statusC = detailsC?.statusC;
    const statusD = detailsD?.statusD;
    const isAllApproved = statusA === 'Đã duyệt' && statusC === 'Đã duyệt' && statusD === 'Đã duyệt';
    const approvedA = detailsA?.approvedTotal !== null && detailsA?.approvedTotal !== undefined && !isNaN(Number(detailsA.approvedTotal))
      ? Number(detailsA.approvedTotal)
      : (kpiRecord?.aScore && !isNaN(Number(kpiRecord.aScore)) ? Number(kpiRecord.aScore) : null);

    const approvedDScore = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;

    let approvedKpiTotal: number | null = null;
    let approvedRank = 'Chờ duyệt';
    if (isAllApproved && approvedA !== null) {
      approvedKpiTotal = calculateTotalKpi(approvedA, approvedBTotal, finalTotalC, approvedDScore, kpiConfig.formula, alloc);
      approvedRank = evaluateKpiRank(approvedKpiTotal, kpiConfig.rankingTiers, { scoreA: approvedA, scoreB: approvedBTotal, scoreD: approvedDScore }).rank;
    }

    res.json({
      success: true,
      data: {
        user: targetUser,
        month: targetMonth,
        kpiRecord: kpiRecord || null,
        selfKpiTotal,
        selfRank,
        approvedKpiTotal,
        approvedRank,
        totalKpi: approvedKpiTotal,
        rank: approvedRank,
        summary: {
          registeredWorks: userWorks.length,
          approvedWorks: userApprovedWorks.length,
          pendingWorks: userWorks.filter(w => w.leaderApproval === 'Chưa duyệt').length,
          supplementWorks: userWorks.filter(w => w.leaderApproval === 'Cần bổ sung').length,
          rejectedWorks: userWorks.filter(w => w.leaderApproval === 'Không duyệt').length,
          approvedHours: userApprovedWorks.reduce((s, w) => s + (parseFloat(w.hours || '0') || 0), 0),
          selfConvertedScore: Math.round(userSelfConvertedScore * 100) / 100,
          approvedConvertedScore: Math.round(userApprovedConvertedScore * 100) / 100,
          convertedScore: Math.round(userApprovedConvertedScore * 100) / 100,
          deptTotalWorks: validWorksInMonth.length,
          deptApprovedWorks: deptApprovedWorks.length,
          deptSelfConvertedScore: Math.round(deptSelfConvertedScore * 100) / 100,
          deptApprovedConvertedScore: Math.round(deptApprovedConvertedScore * 100) / 100,
          deptConvertedScore: Math.round(deptApprovedConvertedScore * 100) / 100,
          personalShare: Math.round(userApprovedShare * 100) / 100,
          avgShare: Math.round(avgApprovedShare * 100) / 100,
          selfPersonalShare: Math.round(userSelfShare * 100) / 100,
          selfAvgShare: Math.round(avgSelfShare * 100) / 100,
          selfB1,
          selfB2,
          selfBTotal,
          approvedB1,
          approvedB2,
          approvedBTotal,
          b1: approvedB1,
          b2: approvedB2,
          bTotal: approvedBTotal,
          selfAutoC1,
          approvedAutoC1,
          autoC1: approvedAutoC1,
          selfC,
          approvedC: finalTotalC,
          selfD,
          approvedD: approvedDScore,
          selfKpiTotal,
          selfRank,
          approvedKpiTotal,
          approvedRank,
          totalKpi: approvedKpiTotal,
          rank: approvedRank
        },
        detailsA,
        detailsC,
        detailsD,
        naturePointMap,
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
    const { month, scores, note } = req.body;
    const targetMonth = month || getCurrentMonth();
    const authUser = (req as any).authUser;

    let targetUser = null;
    if (!isKpiLeaderOrAdmin(authUser)) {
      // Nhân viên chỉ được tự chấm điểm A cho chính mình; không tin userId hay role từ body
      if (req.body.userId && Number(req.body.userId) !== Number(authUser.id)) {
        const msg = 'Bạn chỉ có quyền tự chấm điểm A cho chính mình.';
        return res.status(403).json({ success: false, error: msg, message: msg });
      }
      targetUser = authUser;
    } else {
      if (req.body.userId) {
        targetUser = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.id, Number(req.body.userId))
        });
      } else if (req.body.userName) {
        targetUser = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.name, String(req.body.userName))
        });
      }
      if (!targetUser) {
        targetUser = authUser;
      }
    }

    if (!targetUser) {
      const msg = "Không tìm thấy người dùng.";
      return res.status(404).json({ success: false, error: msg, message: msg });
    }

    const kpiConfig = await getEffectiveKpiConfig();
    const alloc = kpiConfig.scoreAllocation || DEFAULT_KPI_CONFIG.scoreAllocation;
    const existingKpi = await findUserKpiRecord(targetMonth, targetUser.id, targetUser.name);

    const sanitizedDetailsA = validateAndSanitizeDetailsA(
      { scores, noteA: note },
      existingKpi?.detailsA,
      { isSelfScore: true, maxA: alloc.maxA }
    );

    // Save and recalculate full KPI record for user atomically in a single step (no partial unfinalized state)
    const kpiResult = await calculateAndSaveUserKpi(targetUser, targetMonth, undefined, {
      overrideDetailsA: sanitizedDetailsA,
      note: `Tự chấm điểm A lúc ${new Date().toLocaleString('vi-VN')}`
    });

    res.json({
      success: true,
      message: `Đã lưu kết quả tự chấm A tháng ${targetMonth} (${sanitizedDetailsA.selfTotal ?? 0}/30 điểm). Chờ lãnh đạo duyệt!`,
      data: sanitizedDetailsA,
      kpiResult
    });
  } catch (error) {
    console.error("Error self-scoring A:", error);
    const msg = 'Lỗi hệ thống khi lưu kết quả tự chấm: ' + String(error);
    res.status(500).json({ success: false, error: msg, message: msg });
  }
});

// 7. APPROVE A / C / D
kpiRouter.post('/approve-acd', async (req, res) => {
  try {
    const authUser = (req as any).authUser;
    if (!isKpiLeaderOrAdmin(authUser)) {
      const msg = "Chỉ Quản trị viên hoặc Lãnh đạo mới có quyền thẩm định và phê duyệt điểm KPI.";
      return res.status(403).json({
        success: false,
        error: msg,
        message: msg
      });
    }

    const { month, userId, userName, detailsA, detailsC, detailsD } = req.body;
    const targetMonth = month || getCurrentMonth();
    const approverName = authUser?.name || 'Lãnh đạo';

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

    if (!targetUser) {
      const msg = "Không tìm thấy người dùng.";
      return res.status(404).json({ success: false, error: msg, message: msg });
    }

    const existingKpi = await findUserKpiRecord(targetMonth, targetUser.id, targetUser.name);

    // Calculate B1, B2 and B from currently approved works in month using the exact same filter and formulas as calculateAndSaveUserKpi
    const allUsers = await db.query.users.findMany();
    const activeUsers = allUsers.filter(isUserActive);
    const activeUserIds = new Set(activeUsers.map(u => u.id));

    const allWorksInMonth = await db.query.works.findMany({
      where: (w, { eq }) => eq(w.month, targetMonth)
    });
    
    // Department-level valid works ONLY include works of active employees (resigned/locked users excluded from denominator)
    const validWorksInMonth = allWorksInMonth.filter(w => {
      const ds = String(w.dataStatus || '').toLowerCase().trim();
      const isDataValid = !ds.includes('xóa') && !ds.includes('xoa') && !ds.includes('thu hồi') && ds !== 'deleted' && ds !== 'trash';
      const isUserValid = w.userId ? activeUserIds.has(w.userId) : false;
      return isDataValid && isUserValid;
    });

    const userWorks = allWorksInMonth.filter(w => {
      const ds = String(w.dataStatus || '').toLowerCase().trim();
      const isDataValid = !ds.includes('xóa') && !ds.includes('xoa') && !ds.includes('thu hồi') && ds !== 'deleted' && ds !== 'trash';
      return isDataValid && w.userId === targetUser.id;
    });
    const userApprovedWorks = userWorks.filter(w => w.leaderApproval === 'Duyệt');
    
    // Approved B calculations (leaderApproval === 'Duyệt', using approvedConvertedScore with strict fallback)
    const deptApprovedWorks = validWorksInMonth.filter(w => w.leaderApproval === 'Duyệt');
    const deptApprovedConvertedScore = deptApprovedWorks.reduce((s, w) => s + getWorkApprovedConvertedScore(w), 0);
    const userApprovedConvertedScore = userApprovedWorks.reduce((s, w) => s + getWorkApprovedConvertedScore(w), 0);
    
    const activeApprovedEmployeeIds = Array.from(new Set(deptApprovedWorks.map(w => w.userId)));
    const activeDeptPersonnelCount = Math.max(activeUsers.length, 1);
    const avgApprovedShare = 100 / activeDeptPersonnelCount;
    const userApprovedShare = deptApprovedConvertedScore > 0 ? (userApprovedConvertedScore / deptApprovedConvertedScore * 100) : 0;

    // Self B calculations (all valid works, using selfConvertedScore with fallback)
    const deptSelfConvertedScore = validWorksInMonth.reduce((s, w) => s + getWorkSelfConvertedScore(w), 0);
    const userSelfConvertedScore = userWorks.reduce((s, w) => s + getWorkSelfConvertedScore(w), 0);
    const activeSelfEmployeeIds = Array.from(new Set(validWorksInMonth.map(w => w.userId)));
    const avgSelfShare = 100 / activeDeptPersonnelCount;
    const userSelfShare = deptSelfConvertedScore > 0 ? (userSelfConvertedScore / deptSelfConvertedScore * 100) : 0;

    const naturePointMap = await getEffectiveWorkNaturePointMap();

    // Self C1 calculations (all valid works in month, independent of leaderApproval; proposedNature -> approvedNature -> 'Trung bình')
    let selfPersonalNatureTotal = 0;
    let selfDeptNatureTotal = 0;
    validWorksInMonth.forEach(w => {
      const nat = w.proposedNature || w.approvedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      selfDeptNatureTotal += pt;
    });
    userWorks.forEach(w => {
      const nat = w.proposedNature || w.approvedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      selfPersonalNatureTotal += pt;
    });
    const avgSelfDeptNature = selfDeptNatureTotal / activeDeptPersonnelCount;

    const kpiConfig = await getEffectiveKpiConfig();
    const alloc = kpiConfig.scoreAllocation || DEFAULT_KPI_CONFIG.scoreAllocation;
    const maxC1Val = alloc.maxC1 || 6;
    const selfAutoC1 = avgSelfDeptNature > 0 ? Math.round(Math.min(maxC1Val, (selfPersonalNatureTotal * maxC1Val) / avgSelfDeptNature)) : 0;

    // Approved C1 calculations (only leaderApproval === 'Duyệt'; approvedNature -> proposedNature -> 'Trung bình')
    let personalNatureTotal = 0;
    let deptNatureTotal = 0;

    deptApprovedWorks.forEach(w => {
      const nat = w.approvedNature || w.proposedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      deptNatureTotal += pt;
    });
    userApprovedWorks.forEach(w => {
      const nat = w.approvedNature || w.proposedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      personalNatureTotal += pt;
    });

    const avgDeptNature = deptNatureTotal / activeDeptPersonnelCount;
    const approvedAutoC1 = avgDeptNature > 0 ? Math.round(Math.min(maxC1Val, (personalNatureTotal * maxC1Val) / avgDeptNature)) : 0;
    const autoC1 = approvedAutoC1;

    const approvedB1 = userApprovedWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userApprovedConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
    const approvedB2 = (userApprovedWorks.length > 0 && avgApprovedShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userApprovedShare / avgApprovedShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
    const approvedBTotal = Math.round(Math.min(alloc.maxB || 60, approvedB1 + approvedB2) * 100) / 100;

    const selfB1 = userWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userSelfConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
    const selfB2 = (userWorks.length > 0 && avgSelfShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userSelfShare / avgSelfShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
    const selfBTotal = Math.round(Math.min(alloc.maxB || 60, selfB1 + selfB2) * 100) / 100;

    const b1 = approvedB1;
    const b2 = approvedB2;
    const bScore = approvedBTotal;

    // Determine detailsA & aScore with strict server-side validation & ceiling capping
    const hasA = detailsA !== undefined && detailsA !== null;
    let finalDetailsA: any = existingKpi?.detailsA ?? null;
    let finalAScore: number | null = null;

    if (hasA) {
      finalDetailsA = validateAndSanitizeDetailsA(detailsA, existingKpi?.detailsA, { isApproval: true, maxA: alloc.maxA });
      finalAScore = finalDetailsA.approvedTotal !== null ? Number(finalDetailsA.approvedTotal) : null;
    } else {
      if (existingKpi?.detailsA) {
        finalDetailsA = validateAndSanitizeDetailsA(existingKpi.detailsA, undefined, { maxA: alloc.maxA });
        finalAScore = finalDetailsA.approvedTotal !== null ? Number(finalDetailsA.approvedTotal) : (existingKpi.aScore ? Number(existingKpi.aScore) : null);
      } else if (existingKpi?.aScore !== undefined && existingKpi?.aScore !== null && existingKpi?.aScore !== '' && !isNaN(Number(existingKpi.aScore))) {
        finalAScore = Number(existingKpi.aScore);
      }
    }

    if (finalAScore !== null) {
      finalAScore = isNaN(finalAScore) || !isFinite(finalAScore) ? 0 : Math.max(0, Math.min(alloc.maxA || 30, finalAScore));
    }

    // Determine detailsC & cScores (Ignore UI-provided c1/totalC; use approvedAutoC1 + validated c2 with alloc.maxC2 ceiling)
    const hasC = detailsC !== undefined && detailsC !== null;
    let finalDetailsC = existingKpi?.detailsC ?? null;
    let finalC1Score = approvedAutoC1;
    let finalC2Score = 0;
    let finalCScore = 0;

    if (hasC) {
      const rawC2 = detailsC.c2 !== undefined && detailsC.c2 !== null && detailsC.c2 !== '' ? Number(detailsC.c2) : 0;
      finalC2Score = isNaN(rawC2) || !isFinite(rawC2) ? 0 : Math.max(0, Math.min(alloc.maxC2 || 4, rawC2));
      finalCScore = Math.min(alloc.maxC || 10, finalC1Score + finalC2Score);

      finalDetailsC = {
        ...detailsC,
        c1: finalC1Score,
        c2: finalC2Score,
        totalC: finalCScore,
        selfAutoC1,
        approvedAutoC1,
        autoC1: approvedAutoC1,
        personalNatureTotal: Math.round(personalNatureTotal * 100) / 100,
        deptNatureTotal: Math.round(deptNatureTotal * 100) / 100,
        avgDeptNature: Math.round(avgDeptNature * 100) / 100,
        activeEmployeeCount: activeDeptPersonnelCount,
        selfPersonalNatureTotal: Math.round(selfPersonalNatureTotal * 100) / 100,
        selfDeptNatureTotal: Math.round(selfDeptNatureTotal * 100) / 100,
        selfAvgDeptNature: Math.round(avgSelfDeptNature * 100) / 100
      };
    } else {
      const existC = (existingKpi?.detailsC as any) || null;
      if (existC) {
        const rawC2 = existC.c2 !== undefined && existC.c2 !== null && existC.c2 !== '' ? Number(existC.c2) : (existingKpi?.c2Score ? Number(existingKpi.c2Score) : 0);
        finalC2Score = isNaN(rawC2) || !isFinite(rawC2) ? 0 : Math.max(0, Math.min(alloc.maxC2 || 4, rawC2));
        finalCScore = Math.min(alloc.maxC || 10, finalC1Score + finalC2Score);
        finalDetailsC = {
          ...existC,
          c1: finalC1Score,
          c2: finalC2Score,
          totalC: finalCScore,
          selfAutoC1: existC.selfAutoC1 ?? selfAutoC1,
          approvedAutoC1: existC.approvedAutoC1 ?? approvedAutoC1,
          autoC1: existC.autoC1 ?? autoC1
        };
      } else if (existingKpi?.cScore !== undefined && existingKpi?.cScore !== null && existingKpi?.cScore !== '' && !isNaN(Number(existingKpi.cScore))) {
        const rawC2 = existingKpi.c2Score ? Number(existingKpi.c2Score) : 0;
        finalC2Score = isNaN(rawC2) || !isFinite(rawC2) ? 0 : Math.max(0, Math.min(alloc.maxC2 || 4, rawC2));
        finalCScore = Math.min(alloc.maxC || 10, finalC1Score + finalC2Score);
        finalDetailsC = {
          c1: finalC1Score,
          c2: finalC2Score,
          totalC: finalCScore,
          selfAutoC1,
          approvedAutoC1,
          autoC1
        };
      } else {
        finalC1Score = approvedAutoC1;
        finalC2Score = 0;
        finalCScore = Math.min(alloc.maxC || 10, approvedAutoC1);
        finalDetailsC = {
          c1: approvedAutoC1,
          c2: 0,
          totalC: finalCScore,
          noteC2: '',
          noteC: 'C1 tự động theo điểm tính chất bình quân phòng',
          selfAutoC1,
          approvedAutoC1,
          autoC1,
          personalNatureTotal: Math.round(personalNatureTotal * 100) / 100,
          deptNatureTotal: Math.round(deptNatureTotal * 100) / 100,
          avgDeptNature: Math.round(avgDeptNature * 100) / 100,
          activeEmployeeCount: activeDeptPersonnelCount,
          selfPersonalNatureTotal: Math.round(selfPersonalNatureTotal * 100) / 100,
          selfDeptNatureTotal: Math.round(selfDeptNatureTotal * 100) / 100,
          selfAvgDeptNature: Math.round(avgSelfDeptNature * 100) / 100
        };
      }
    }

    // Determine detailsD & dScore (Always recalculate D from items, do not accept arbitrary totalOfficialD)
    const hasD = detailsD !== undefined && detailsD !== null;
    let finalDetailsD = existingKpi?.detailsD ?? null;
    let finalDScore = 0;

    if (hasD) {
      const dItems = Array.isArray(detailsD.items) ? detailsD.items : [];
      const totalOfficialD = dItems.reduce((s: number, item: any) => {
        const val = item.officialD !== undefined && item.officialD !== null && item.officialD !== '' ? parseFloat(item.officialD) : parseFloat(item.autoD || '0');
        return s + (isNaN(val) || !isFinite(val) ? 0 : Math.max(0, val));
      }, 0);
      finalDScore = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;
      finalDetailsD = {
        ...detailsD,
        items: dItems,
        totalAutoD: dItems.reduce((s: number, it: any) => s + (parseFloat(it.autoD || '0') || 0), 0),
        totalOfficialD
      };
    } else {
      const existD = (existingKpi?.detailsD as any) || null;
      if (existD && Array.isArray(existD.items)) {
        const totalOfficialD = existD.items.reduce((s: number, item: any) => {
          const val = item.officialD !== undefined && item.officialD !== null && item.officialD !== '' ? parseFloat(item.officialD) : parseFloat(item.autoD || '0');
          return s + (isNaN(val) || !isFinite(val) ? 0 : Math.max(0, val));
        }, 0);
        finalDScore = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;
        finalDetailsD = {
          ...existD,
          totalOfficialD
        };
      } else if (existingKpi?.dScore !== undefined && existingKpi?.dScore !== null && existingKpi?.dScore !== '' && !isNaN(Number(existingKpi.dScore))) {
        const totalOfficialD = Math.max(0, Number(existingKpi.dScore));
        finalDScore = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;
      } else {
        finalDScore = 0;
      }
    }

    const saveNote = (approverName || hasA || hasC || hasD)
      ? `Đã duyệt bởi ${approverName || 'Lãnh đạo'} lúc ${new Date().toLocaleString('vi-VN')}`
      : undefined;

    // Atomically recalculate and save user KPI with validated overrides
    const kpiCalcResult = await calculateAndSaveUserKpi(targetUser, targetMonth, undefined, {
      overrideDetailsA: hasA ? finalDetailsA : undefined,
      overrideDetailsC: hasC ? finalDetailsC : undefined,
      overrideDetailsD: hasD ? finalDetailsD : undefined,
      note: saveNote
    });

    res.json({ 
      success: true, 
      message: `Đã cập nhật duyệt điểm A (${kpiCalcResult.approvedA !== null ? kpiCalcResult.approvedA : 'chờ duyệt'}đ) / C (${kpiCalcResult.cScore}đ) / D (-${kpiCalcResult.dScore}đ) cho ${targetUser.name} tháng ${targetMonth}! Tổng KPI: ${kpiCalcResult.totalKpi !== null ? kpiCalcResult.totalKpi : 'Chờ duyệt'} (${kpiCalcResult.rank})`,
      data: {
        kpiId: kpiCalcResult.kpiId,
        month: targetMonth,
        userId: targetUser.id,
        userName: targetUser.name,
        approvedA: kpiCalcResult.approvedA,
        selfB1,
        selfB2,
        selfBTotal,
        approvedB1,
        approvedB2,
        approvedBTotal,
        b1Score: approvedB1,
        b2Score: approvedB2,
        bScore: approvedBTotal,
        b1: approvedB1,
        b2: approvedB2,
        bTotal: approvedBTotal,
        selfAutoC1,
        approvedAutoC1,
        autoC1: approvedAutoC1,
        c1Score: finalC1Score,
        c2Score: finalC2Score,
        cScore: kpiCalcResult.cScore,
        dScore: kpiCalcResult.dScore,
        totalKpi: kpiCalcResult.totalKpi,
        rank: kpiCalcResult.rank,
        selfKpiTotal: kpiCalcResult.selfKpiTotal,
        selfRank: kpiCalcResult.selfRank,
        approvedKpiTotal: kpiCalcResult.approvedKpiTotal,
        approvedRank: kpiCalcResult.approvedRank,
        registeredWorks: userWorks.length,
        approvedWorks: userApprovedWorks.length,
        detailsA: finalDetailsA,
        detailsC: finalDetailsC,
        detailsD: finalDetailsD
      }
    });
  } catch (error) {
    console.error("Error approving A/C/D:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 8. CALCULATE / RECALCULATE KPI FOR A SINGLE USER
kpiRouter.post('/calculate', async (req, res) => {
  try {
    const authUser = (req as any).authUser;
    if (!isKpiLeaderOrAdmin(authUser)) {
      return res.status(403).json({
        success: false,
        error: "Chỉ Quản trị viên hoặc Lãnh đạo mới có quyền thực hiện tính toán KPI."
      });
    }

    const { month, userId, userName } = req.body;
    const targetMonth = month || getCurrentMonth();
    
    let targetUser = null;
    if (userId) {
      targetUser = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, Number(userId)) });
    } else if (userName) {
      targetUser = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.name, String(userName)) });
    }
    if (!targetUser) return res.status(404).json({ success: false, error: "Không tìm thấy người dùng." });

    const result = await calculateAndSaveUserKpi(targetUser, targetMonth);
    res.json({ success: true, message: `Đã tính điểm KPI tháng ${targetMonth} cho ${targetUser.name}: ${result.totalKpi} (${result.rank})`, data: result });
  } catch (error) {
    console.error("Error calculating user KPI:", error);
    res.status(500).json({ error: String(error) });
  }
});

// 9. RECALCULATE ALL OR SPECIFIED USERS FOR A MONTH
const handleRecalculateAllRequest = async (req: express.Request, res: express.Response) => {
  try {
    const authUser = (req as any).authUser;
    if (!isKpiLeaderOrAdmin(authUser)) {
      return res.status(403).json({
        success: false,
        error: "Chỉ Quản trị viên hoặc Lãnh đạo mới có quyền tính toán lại toàn bộ KPI."
      });
    }

    const { month, userIds } = req.body || {};
    const targetMonth = month || getCurrentMonth();

    const result = await recalculateKpiForMonth(targetMonth, userIds);

    let message = '';
    if (result.total === 0) {
      message = `Không tìm thấy nhân sự phù hợp để tính toán KPI tháng ${targetMonth}.`;
    } else if (result.failed.length === 0) {
      const targetDesc = Array.isArray(userIds) && userIds.length > 0 ? `cho ${result.succeeded.length} nhân sự được chọn` : `toàn bộ ${result.succeeded.length}/${result.total} nhân sự`;
      message = `Đã tính toán lại KPI tháng ${targetMonth} ${targetDesc} thành công 100%!`;
    } else if (result.succeeded.length > 0) {
      message = `Đã tính toán thành công ${result.succeeded.length}/${result.total} nhân sự. Có ${result.failed.length} nhân sự bị lỗi khi xử lý!`;
    } else {
      message = `Tính toán KPI thất bại cho toàn bộ ${result.total} nhân sự!`;
    }

    res.json({
      success: result.failed.length === 0 && result.total > 0,
      partialSuccess: result.failed.length > 0 && result.succeeded.length > 0,
      message,
      summary: {
        total: result.total,
        successCount: result.succeeded.length,
        failCount: result.failed.length,
      },
      succeeded: result.succeeded,
      failed: result.failed,
      month: targetMonth
    });
  } catch (error) {
    console.error("Error recalculating KPI:", error);
    res.status(500).json({ error: String(error) });
  }
};

kpiRouter.post('/recalculate-all', handleRecalculateAllRequest);
kpiRouter.post('/recalculate', handleRecalculateAllRequest);

// 10. DEPARTMENT KPI SUMMARY (Bảng tổng hợp KPI phòng & Thống kê công việc phòng)
kpiRouter.get('/department-summary', async (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = String(month || getCurrentMonth());

    const allUsers = await db.query.users.findMany({
      orderBy: (u, { asc }) => [asc(u.id)]
    });

    const validUsers = allUsers.filter(isUserActive);
    const activeUserIds = new Set(validUsers.map(u => u.id));

    const allWorksInMonth = await db.query.works.findMany({
      where: (w, { eq }) => eq(w.month, targetMonth),
      with: { user: true }
    });

    // Department-level valid works ONLY include works of active employees (resigned/locked users excluded from denominator)
    const validWorksInMonth = allWorksInMonth.filter(w => {
      const ds = String(w.dataStatus || '').toLowerCase().trim();
      const isDataValid = !ds.includes('xóa') && !ds.includes('xoa') && !ds.includes('thu hồi') && ds !== 'deleted' && ds !== 'trash';
      const isUserValid = w.userId ? activeUserIds.has(w.userId) : false;
      return isDataValid && isUserValid;
    });

    // Approved B calculations (dept level)
    const deptApprovedWorks = validWorksInMonth.filter(w => w.leaderApproval === 'Duyệt');
    const deptApprovedConvertedScore = deptApprovedWorks.reduce((s, w) => s + getWorkApprovedConvertedScore(w), 0);
    const deptConvertedScore = deptApprovedConvertedScore;
    const activeApprovedEmployeeIds = Array.from(new Set(deptApprovedWorks.map(w => w.userId)));
    const activeDeptPersonnelCount = Math.max(validUsers.length, 1);
    const activeEmployeeIds = activeApprovedEmployeeIds;
    const avgApprovedShare = 100 / activeDeptPersonnelCount;
    const avgShare = avgApprovedShare;

    // Self B calculations (dept level)
    const deptSelfConvertedScore = validWorksInMonth.reduce((s, w) => s + getWorkSelfConvertedScore(w), 0);
    const activeSelfEmployeeIds = Array.from(new Set(validWorksInMonth.map(w => w.userId)));
    const avgSelfShare = 100 / activeDeptPersonnelCount;

    const naturePointMap = await getEffectiveWorkNaturePointMap();

    let deptNatureTotal = 0;
    let selfDeptNatureTotal = 0;
    const natureCountMap: Record<string, number> = {};
    Object.keys(naturePointMap).forEach(k => {
      natureCountMap[k] = 0;
    });

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

    validWorksInMonth.forEach(w => {
      const nat = w.proposedNature || w.approvedNature || 'Trung bình';
      const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
      selfDeptNatureTotal += pt;
    });

    const avgDeptNature = deptNatureTotal / activeDeptPersonnelCount;
    const avgSelfDeptNature = selfDeptNatureTotal / activeDeptPersonnelCount;

    // Fetch all KPI results for this month
    const allKpiResultsInMonth = await db.query.kpiResults.findMany({
      where: (r, { eq }) => eq(r.month, targetMonth)
    });
    const kpiMapByUserId = new Map<number, any>();
    const kpiMapByUserName = new Map<string, any>();
    allKpiResultsInMonth.forEach(r => {
      if (r.userId) {
        kpiMapByUserId.set(r.userId, r);
      }
      if (r.kpiId) {
        const uMatch = r.kpiId.match(/♦u(\d+)$/);
        if (uMatch) {
          kpiMapByUserId.set(parseInt(uMatch[1], 10), r);
        } else {
          const parts = r.kpiId.split('♦');
          if (parts.length > 1) {
            kpiMapByUserName.set(parts[1].trim(), r);
          }
        }
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

      // Approved B calculations (user level)
      const userApprovedConvertedScore = userApprovedWorks.reduce((s, w) => s + getWorkApprovedConvertedScore(w), 0);
      const userConvertedScore = userApprovedConvertedScore;
      const userHours = userApprovedWorks.reduce((s, w) => s + (parseFloat(w.hours || '0') || 0), 0);
      const userApprovedShare = deptApprovedConvertedScore > 0 ? (userApprovedConvertedScore / deptApprovedConvertedScore * 100) : 0;
      const userShare = userApprovedShare;

      const approvedB1 = userApprovedWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userApprovedConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
      const approvedB2 = (userApprovedWorks.length > 0 && avgApprovedShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userApprovedShare / avgApprovedShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
      const approvedBTotal = Math.round(Math.min(alloc.maxB || 60, approvedB1 + approvedB2) * 100) / 100;

      // Self B calculations (user level)
      const userSelfConvertedScore = userWorks.reduce((s, w) => s + getWorkSelfConvertedScore(w), 0);
      const userSelfShare = deptSelfConvertedScore > 0 ? (userSelfConvertedScore / deptSelfConvertedScore * 100) : 0;

      const selfB1 = userWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userSelfConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
      const selfB2 = (userWorks.length > 0 && avgSelfShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userSelfShare / avgSelfShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
      const selfBTotal = Math.round(Math.min(alloc.maxB || 60, selfB1 + selfB2) * 100) / 100;

      const b1 = approvedB1;
      const b2 = approvedB2;
      const bTotal = approvedBTotal;

      // Approved nature points for user
      let personalApprovedNatureTotal = 0;
      userApprovedWorks.forEach(w => {
        const nat = w.approvedNature || w.proposedNature || 'Trung bình';
        const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
        personalApprovedNatureTotal += pt;
      });
      const approvedAutoC1 = avgDeptNature > 0 ? Math.round(Math.min(alloc.maxC1 || 6, (personalApprovedNatureTotal * (alloc.maxC1 || 6)) / avgDeptNature)) : 0;
      const autoC1 = approvedAutoC1;

      // Self nature points for user (all valid works, proposedNature fallback approvedNature fallback 'Trung bình')
      let personalSelfNatureTotal = 0;
      userWorks.forEach(w => {
        const nat = w.proposedNature || w.approvedNature || 'Trung bình';
        const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
        personalSelfNatureTotal += pt;
      });
      const selfAutoC1 = avgSelfDeptNature > 0 ? Math.round(Math.min(alloc.maxC1 || 6, (personalSelfNatureTotal * (alloc.maxC1 || 6)) / avgSelfDeptNature)) : 0;

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
      const rawC2 = rawDetailsC?.c2 !== null && rawDetailsC?.c2 !== undefined ? parseFloat(rawDetailsC.c2) : (kpiRecord?.c2Score ? parseFloat(kpiRecord.c2Score) : 0);
      const c2 = isNaN(rawC2) || !isFinite(rawC2) ? 0 : Math.max(0, Math.min(alloc.maxC2 || 4, rawC2));
      const cTotal = Math.min(alloc.maxC || 10, approvedAutoC1 + c2);
      const selfC = Math.min(alloc.maxC || 10, selfAutoC1);

      // Score D
      const penaltyRules = kpiConfig.penaltyRules || DEFAULT_KPI_CONFIG.penaltyRules;
      const autoPenaltyItems = generateWorkPenaltyItems(userWorks, penaltyRules);
      const savedDetailsD = rawDetailsD || { items: [], statusD: 'Chờ duyệt' };
      const mergedD = mergePenaltyItems(autoPenaltyItems, savedDetailsD);

      const totalAutoD = mergedD.totalAutoD;
      const selfD = alloc.maxD ? Math.min(alloc.maxD, totalAutoD) : totalAutoD;
      const totalOfficialD = mergedD.totalOfficialD;
      const dTotal = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;
      const statusD = mergedD.statusD;

      // Self total and ranking (completely independent from leader evaluation):
      // USER RULE: selfKpiTotal uses selfBTotal, selfC, and selfD
      const selfAScoreForTotal = explicitSelfA !== null ? explicitSelfA : 0;
      const selfKpiTotal = calculateTotalKpi(selfAScoreForTotal, selfBTotal, selfC, selfD, kpiConfig.formula, alloc);
      
      let selfRank = 'Chưa xếp loại';
      if (explicitSelfA !== null) {
        const evalSelf = evaluateKpiRank(selfKpiTotal, kpiConfig.rankingTiers, { scoreA: explicitSelfA, scoreB: selfBTotal, scoreD: selfD });
        selfRank = evalSelf.rank;
      } else {
        selfRank = 'Chưa tự chấm A';
      }

      // Check all 3 statuses for leader approval
      const statusA = (rawDetailsA as any)?.statusA;
      const statusC = (rawDetailsC as any)?.statusC;
      const isAllApproved = statusA === 'Đã duyệt' && statusC === 'Đã duyệt' && statusD === 'Đã duyệt';

      // Approved total and ranking:
      // USER RULE: approvedKpiTotal uses approvedBTotal and requires all A, C, D to be "Đã duyệt"
      let approvedKpiTotal: number | null = null;
      let approvedRank = 'Chờ duyệt';
      if (isAllApproved && approvedA !== null) {
        approvedKpiTotal = calculateTotalKpi(approvedA, approvedBTotal, cTotal, dTotal, kpiConfig.formula, alloc);
        const evalApproved = evaluateKpiRank(approvedKpiTotal, kpiConfig.rankingTiers, { scoreA: approvedA, scoreB: approvedBTotal, scoreD: dTotal });
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
          selfB1,
          selfB2,
          selfBTotal,
          approvedB1,
          approvedB2,
          approvedBTotal,
          b1: approvedB1,
          b2: approvedB2,
          bTotal: approvedBTotal,
          c1: approvedAutoC1,
          selfAutoC1,
          approvedAutoC1,
          autoC1: approvedAutoC1,
          selfC,
          c2,
          cTotal,
          selfD,
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
          convertedScore: Math.round(userApprovedConvertedScore * 100) / 100,
          selfConvertedScore: Math.round(userSelfConvertedScore * 100) / 100,
          approvedConvertedScore: Math.round(userApprovedConvertedScore * 100) / 100,
          hours: Math.round(userHours * 10) / 10,
          personalShare: Math.round(userApprovedShare * 10) / 10
        }
      };
    });

    // Task group summary
    const taskGroupMap: Record<string, { total: number; approved: number; completed: number; score: number }> = {};
    validWorksInMonth.forEach(w => {
      const g = canonicalizeTaskGroup(w.taskGroup);
      if (!taskGroupMap[g]) {
        taskGroupMap[g] = { total: 0, approved: 0, completed: 0, score: 0 };
      }
      taskGroupMap[g].total += 1;
      if (w.leaderApproval === 'Duyệt') {
        taskGroupMap[g].approved += 1;
        taskGroupMap[g].score += getWorkApprovedConvertedScore(w);
      }
      if (w.status === 'Hoàn thành') {
        taskGroupMap[g].completed += 1;
      }
    });

    // Rank count breakdown: selfRankCounts and approvedRankCounts (mutually exclusive)
    const selfRankCounts = {
      excellent: 0,
      good: 0,
      standard: 0,
      fail: 0,
      pending: 0
    };

    const approvedRankCounts = {
      excellent: 0,
      good: 0,
      standard: 0,
      fail: 0,
      pending: 0,
      leader: 0
    };

    userKpiSummaries.forEach(u => {
      // Tự chấm: chưa tự chấm A tính vào pending, không xếp loại; mỗi nhân sự thuộc đúng 1 nhóm
      if (u.scores.explicitSelfA === null || u.scores.selfA === null || u.selfRank === 'Chưa tự chấm A') {
        selfRankCounts.pending += 1;
      } else if (u.selfRank.includes('xuất sắc') || u.selfRank.includes('Xuất sắc')) {
        selfRankCounts.excellent += 1;
      } else if (u.selfRank.includes('tốt') || u.selfRank.includes('Tốt')) {
        selfRankCounts.good += 1;
      } else if (u.selfRank.includes('Không hoàn thành') || u.selfRank.includes('Không HT')) {
        selfRankCounts.fail += 1;
      } else if (u.selfRank === 'Hoàn thành nhiệm vụ' || u.selfRank === 'Hoàn thành' || u.selfRank.includes('Hoàn thành')) {
        selfRankCounts.standard += 1;
      } else {
        selfRankCounts.pending += 1;
      }

      // Lãnh đạo: chưa duyệt A tính vào pending, không xếp loại; giữ quy định không xếp loại Phó phòng trở lên
      if (u.isLeaderOrAbove) {
        approvedRankCounts.leader += 1;
      } else if (u.scores.approvedA === null || u.approvedRank === 'Chờ duyệt') {
        approvedRankCounts.pending += 1;
      } else if (u.approvedRank.includes('xuất sắc') || u.approvedRank.includes('Xuất sắc')) {
        approvedRankCounts.excellent += 1;
      } else if (u.approvedRank.includes('tốt') || u.approvedRank.includes('Tốt')) {
        approvedRankCounts.good += 1;
      } else if (u.approvedRank.includes('Không hoàn thành') || u.approvedRank.includes('Không HT')) {
        approvedRankCounts.fail += 1;
      } else if (u.approvedRank === 'Hoàn thành nhiệm vụ' || u.approvedRank === 'Hoàn thành' || u.approvedRank.includes('Hoàn thành')) {
        approvedRankCounts.standard += 1;
      } else {
        approvedRankCounts.pending += 1;
      }
    });

    // Giữ rankCounts tương thích với mã cũ
    const rankCounts = {
      excellent: approvedRankCounts.excellent,
      good: approvedRankCounts.good,
      standard: approvedRankCounts.standard,
      fail: approvedRankCounts.fail,
      pending: approvedRankCounts.pending
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
          rankCounts,
          selfRankCounts,
          approvedRankCounts
        },
        taskGroupSummary: taskGroupMap,
        natureDistribution: natureCountMap,
        naturePointMap: naturePointMap,
        users: userKpiSummaries
      }
    });
  } catch (error) {
    console.error("Error fetching department KPI summary:", error);
    res.status(500).json({ error: String(error) });
  }
});

export async function calculateAndSaveUserKpi(
  targetUser: any, 
  targetMonth: string,
  preloadedData?: { 
    allUsers?: any[]; 
    allWorksInMonth?: any[]; 
    naturePointMap?: Record<string, number>; 
    kpiConfig?: any;
  },
  options?: {
    overrideDetailsA?: any;
    overrideDetailsC?: any;
    overrideDetailsD?: any;
    note?: string;
  }
) {
  const allUsers = preloadedData?.allUsers || await db.query.users.findMany();
  const activeUsers = allUsers.filter(isUserActive);
  const activeUserIds = new Set(activeUsers.map(u => u.id));

  const allWorksInMonth = preloadedData?.allWorksInMonth || await db.query.works.findMany({
    where: (w, { eq }) => eq(w.month, targetMonth)
  });

  // Department-level valid works ONLY include works of active employees (resigned/locked users excluded from denominator)
  const validWorksInMonth = allWorksInMonth.filter((w: any) => {
    const ds = String(w.dataStatus || '').toLowerCase().trim();
    const isDataValid = !ds.includes('xóa') && !ds.includes('xoa') && !ds.includes('thu hồi') && ds !== 'deleted' && ds !== 'trash';
    const isUserValid = w.userId ? activeUserIds.has(w.userId) : false;
    return isDataValid && isUserValid;
  });

  const userWorks = allWorksInMonth.filter((w: any) => {
    const ds = String(w.dataStatus || '').toLowerCase().trim();
    const isDataValid = !ds.includes('xóa') && !ds.includes('xoa') && !ds.includes('thu hồi') && ds !== 'deleted' && ds !== 'trash';
    return isDataValid && w.userId === targetUser.id;
  });
  const userApprovedWorks = userWorks.filter((w: any) => w.leaderApproval === 'Duyệt');
  
  // Approved B calculations (leaderApproval === 'Duyệt', using approvedConvertedScore with strict fallback)
  const deptApprovedWorks = validWorksInMonth.filter((w: any) => w.leaderApproval === 'Duyệt');
  const deptApprovedConvertedScore = deptApprovedWorks.reduce((s: number, w: any) => s + getWorkApprovedConvertedScore(w), 0);
  const userApprovedConvertedScore = userApprovedWorks.reduce((s: number, w: any) => s + getWorkApprovedConvertedScore(w), 0);
  
  const activeApprovedEmployeeIds = Array.from(new Set(deptApprovedWorks.map((w: any) => w.userId)));
  const activeDeptPersonnelCount = Math.max(activeUsers.length, 1);
  const avgApprovedShare = 100 / activeDeptPersonnelCount;
  const userApprovedShare = deptApprovedConvertedScore > 0 ? (userApprovedConvertedScore / deptApprovedConvertedScore * 100) : 0;

  // Self B calculations (all valid works, using selfConvertedScore with fallback)
  const deptSelfConvertedScore = validWorksInMonth.reduce((s: number, w: any) => s + getWorkSelfConvertedScore(w), 0);
  const userSelfConvertedScore = userWorks.reduce((s: number, w: any) => s + getWorkSelfConvertedScore(w), 0);
  const activeSelfEmployeeIds = Array.from(new Set(validWorksInMonth.map((w: any) => w.userId)));
  const avgSelfShare = 100 / activeDeptPersonnelCount;
  const userSelfShare = deptSelfConvertedScore > 0 ? (userSelfConvertedScore / deptSelfConvertedScore * 100) : 0;

  const naturePointMap = preloadedData?.naturePointMap || await getEffectiveWorkNaturePointMap();

  // Self C1 calculations (all valid dept works in month, independent of leaderApproval; proposedNature -> approvedNature -> 'Trung bình')
  let selfPersonalNatureTotal = 0;
  let selfDeptNatureTotal = 0;
  validWorksInMonth.forEach((w: any) => {
    const nat = w.proposedNature || w.approvedNature || 'Trung bình';
    const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
    selfDeptNatureTotal += pt;
  });
  userWorks.forEach((w: any) => {
    const nat = w.proposedNature || w.approvedNature || 'Trung bình';
    const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
    selfPersonalNatureTotal += pt;
  });
  const avgSelfDeptNature = selfDeptNatureTotal / activeDeptPersonnelCount;

  const kpiConfig = preloadedData?.kpiConfig || await getEffectiveKpiConfig();
  const alloc = kpiConfig.scoreAllocation || DEFAULT_KPI_CONFIG.scoreAllocation;
  const maxC1Val = alloc.maxC1 || 6;
  const selfAutoC1 = avgSelfDeptNature > 0 ? Math.round(Math.min(maxC1Val, (selfPersonalNatureTotal * maxC1Val) / avgSelfDeptNature)) : 0;

  // Approved C1 calculations (only leaderApproval === 'Duyệt'; approvedNature -> proposedNature -> 'Trung bình')
  let personalNatureTotal = 0;
  let deptNatureTotal = 0;

  deptApprovedWorks.forEach((w: any) => {
    const nat = w.approvedNature || w.proposedNature || 'Trung bình';
    const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
    deptNatureTotal += pt;
  });
  userApprovedWorks.forEach((w: any) => {
    const nat = w.approvedNature || w.proposedNature || 'Trung bình';
    const pt = naturePointMap[nat] !== undefined ? naturePointMap[nat] : 0;
    personalNatureTotal += pt;
  });

  const avgDeptNature = deptNatureTotal / activeDeptPersonnelCount;
  const approvedAutoC1 = avgDeptNature > 0 ? Math.round(Math.min(maxC1Val, (personalNatureTotal * maxC1Val) / avgDeptNature)) : 0;
  const autoC1 = approvedAutoC1;

  const approvedB1 = userApprovedWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userApprovedConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
  const approvedB2 = (userApprovedWorks.length > 0 && avgApprovedShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userApprovedShare / avgApprovedShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
  const approvedBTotal = Math.round(Math.min(alloc.maxB || 60, approvedB1 + approvedB2) * 100) / 100;

  const selfB1 = userWorks.length > 0 ? Math.round(Math.min(alloc.maxB1 || 45, (userSelfConvertedScore / 100) * (alloc.maxB1 || 45)) * 100) / 100 : 0;
  const selfB2 = (userWorks.length > 0 && avgSelfShare > 0) ? Math.round(Math.min(alloc.maxB2 || 15, (userSelfShare / avgSelfShare) * (alloc.maxB2 || 15)) * 100) / 100 : 0;
  const selfBTotal = Math.round(Math.min(alloc.maxB || 60, selfB1 + selfB2) * 100) / 100;

  const b1 = approvedB1;
  const b2 = approvedB2;
  const bTotal = approvedBTotal;

  const canonicalKpiId = generateKpiId(targetMonth, targetUser.id);
  const existingKpi = await findUserKpiRecord(targetMonth, targetUser.id, targetUser.name);

  const rawDetailsA = options?.overrideDetailsA !== undefined
    ? options.overrideDetailsA
    : ((existingKpi?.detailsA as any) || null);

  const isAApproval = options?.overrideDetailsA?.statusA === 'Đã duyệt' || rawDetailsA?.statusA === 'Đã duyệt';
  const validatedDetailsA = rawDetailsA 
    ? validateAndSanitizeDetailsA(rawDetailsA, existingKpi?.detailsA, { 
        maxA: alloc.maxA,
        isApproval: isAApproval
      })
    : null;

  const approvedA = validatedDetailsA?.approvedTotal !== undefined && validatedDetailsA?.approvedTotal !== null 
    ? Number(validatedDetailsA.approvedTotal) 
    : (existingKpi?.aScore ? parseFloat(existingKpi.aScore) : null);

  const rawDetailsC = options?.overrideDetailsC !== undefined
    ? options.overrideDetailsC
    : ((existingKpi?.detailsC as any) || {});

  const rawC2 = rawDetailsC.c2 !== undefined ? parseFloat(rawDetailsC.c2) : (existingKpi?.c2Score ? parseFloat(existingKpi.c2Score) : 0);
  const c2Score = isNaN(rawC2) || !isFinite(rawC2) ? 0 : Math.max(0, Math.min(alloc.maxC2 || 4, rawC2));
  const selfC = Math.min(alloc.maxC || 10, selfAutoC1);
  const cScore = Math.min(alloc.maxC || 10, approvedAutoC1 + c2Score);

  const rawDetailsD = options?.overrideDetailsD !== undefined
    ? options.overrideDetailsD
    : ((existingKpi?.detailsD as any) || {});
  
  const penaltyRules = kpiConfig.penaltyRules || DEFAULT_KPI_CONFIG.penaltyRules;
  const autoPenaltyItems = generateWorkPenaltyItems(userWorks, penaltyRules);
  const mergedD = mergePenaltyItems(autoPenaltyItems, rawDetailsD, {
    isApprovalSubmission: options?.overrideDetailsD?.statusD === 'Đã duyệt'
  });

  const totalOfficialD = mergedD.totalOfficialD;
  const dScore = alloc.maxD ? Math.min(alloc.maxD, totalOfficialD) : totalOfficialD;
  const updatedDetailsD = {
    ...rawDetailsD,
    items: mergedD.items,
    totalAutoD: mergedD.totalAutoD,
    totalOfficialD,
    statusD: mergedD.statusD,
    hasNewUnapprovedViolations: mergedD.hasNewUnapprovedViolations
  };

  // Check if statusA, statusC, statusD are all 'Đã duyệt'
  const statusA = validatedDetailsA?.statusA;
  const statusC = (rawDetailsC as any)?.statusC;
  const statusD = updatedDetailsD?.statusD;
  const isAllApproved = statusA === 'Đã duyệt' && statusC === 'Đã duyệt' && statusD === 'Đã duyệt';

  let totalKpi: number | null = null;
  let rankEval = { rank: 'Chờ duyệt' };

  if (isAllApproved) {
    if (approvedA !== null && !isNaN(approvedA)) {
      totalKpi = calculateTotalKpi(approvedA, bTotal, cScore, dScore, kpiConfig.formula, alloc);
      rankEval = evaluateKpiRank(totalKpi, kpiConfig.rankingTiers, { scoreA: approvedA, scoreB: bTotal, scoreD: dScore });
    }
  } else {
    totalKpi = null;
    rankEval = { rank: 'Chờ duyệt' };
  }

  const updatedDetailsC = {
    ...rawDetailsC,
    c1: approvedAutoC1,
    c2: c2Score,
    totalC: cScore,
    selfAutoC1,
    approvedAutoC1,
    autoC1: approvedAutoC1,
    personalNatureTotal: Math.round(personalNatureTotal * 100) / 100,
    deptNatureTotal: Math.round(deptNatureTotal * 100) / 100,
    activeEmployeeCount: activeApprovedEmployeeIds.length,
    avgDeptNature: Math.round(avgDeptNature * 100) / 100,
    selfPersonalNatureTotal: Math.round(selfPersonalNatureTotal * 100) / 100,
    selfDeptNatureTotal: Math.round(selfDeptNatureTotal * 100) / 100,
    selfAvgDeptNature: Math.round(avgSelfDeptNature * 100) / 100
  };

  const finalTotalKpiStr = isAllApproved && totalKpi !== null ? String(totalKpi) : null;
  const finalRankStr = isAllApproved ? rankEval.rank : 'Chờ duyệt';
  const saveNote = options?.note || `Tự động cập nhật tính toán KPI lúc ${new Date().toLocaleString('vi-VN')}`;

  if (existingKpi && existingKpi.id) {
    await db.update(kpiResults).set({
      kpiId: canonicalKpiId,
      month: targetMonth,
      userId: targetUser.id,
      aScore: approvedA !== null ? String(approvedA) : null,
      b1Score: String(b1),
      b2Score: String(b2),
      bScore: String(bTotal),
      c1Score: String(approvedAutoC1),
      c2Score: String(c2Score),
      cScore: String(cScore),
      dScore: String(dScore),
      registeredWorks: userWorks.length,
      approvedWorks: userApprovedWorks.length,
      totalKpi: finalTotalKpiStr,
      rank: finalRankStr,
      detailsA: validatedDetailsA,
      detailsC: updatedDetailsC,
      detailsD: updatedDetailsD,
      note: saveNote,
      updatedAt: new Date()
    }).where(eq(kpiResults.id, existingKpi.id));
  } else {
    await db.insert(kpiResults).values({
      kpiId: canonicalKpiId,
      month: targetMonth,
      userId: targetUser.id,
      aScore: approvedA !== null ? String(approvedA) : null,
      b1Score: String(b1),
      b2Score: String(b2),
      bScore: String(bTotal),
      c1Score: String(approvedAutoC1),
      c2Score: String(c2Score),
      cScore: String(cScore),
      dScore: String(dScore),
      registeredWorks: userWorks.length,
      approvedWorks: userApprovedWorks.length,
      totalKpi: finalTotalKpiStr,
      rank: finalRankStr,
      detailsA: validatedDetailsA,
      detailsC: updatedDetailsC,
      detailsD: updatedDetailsD,
      note: saveNote
    }).onConflictDoUpdate({
      target: kpiResults.kpiId,
      set: {
        userId: targetUser.id,
        aScore: approvedA !== null ? String(approvedA) : null,
        b1Score: String(b1),
        b2Score: String(b2),
        bScore: String(bTotal),
        c1Score: String(approvedAutoC1),
        c2Score: String(c2Score),
        cScore: String(cScore),
        dScore: String(dScore),
        registeredWorks: userWorks.length,
        approvedWorks: userApprovedWorks.length,
        totalKpi: finalTotalKpiStr,
        rank: finalRankStr,
        detailsA: validatedDetailsA,
        detailsC: updatedDetailsC,
        detailsD: updatedDetailsD,
        note: saveNote,
        updatedAt: new Date()
      }
    });
  }

  const explicitSelfA = validatedDetailsA?.selfTotal !== undefined && validatedDetailsA?.selfTotal !== null && !isNaN(Number(validatedDetailsA.selfTotal)) ? Number(validatedDetailsA.selfTotal) : null;
  const selfAScoreForTotal = explicitSelfA !== null ? explicitSelfA : 0;
  const selfAutoD = autoPenaltyItems.reduce((s: number, it: any) => s + (parseFloat(it.autoD || '0') || 0), 0);
  const selfD = alloc.maxD ? Math.min(alloc.maxD, selfAutoD) : selfAutoD;
  const selfKpiTotal = calculateTotalKpi(selfAScoreForTotal, selfBTotal, selfC, selfD, kpiConfig.formula, alloc);
  let selfRank = 'Chưa xếp loại';
  if (explicitSelfA !== null) {
    selfRank = evaluateKpiRank(selfKpiTotal, kpiConfig.rankingTiers, { scoreA: explicitSelfA, scoreB: selfBTotal, scoreD: selfD }).rank;
  } else {
    selfRank = 'Chưa tự chấm A';
  }

  return {
    kpiId: canonicalKpiId,
    totalKpi,
    rank: rankEval.rank,
    selfKpiTotal,
    selfRank,
    approvedKpiTotal: totalKpi,
    approvedRank: rankEval.rank,
    approvedA,
    selfB1,
    selfB2,
    selfBTotal,
    approvedB1,
    approvedB2,
    approvedBTotal,
    b1,
    b2,
    bTotal,
    selfAutoC1,
    approvedAutoC1,
    autoC1: approvedAutoC1,
    selfC,
    cScore,
    dScore
  };
}

export interface RecalculateUserSuccess {
  userId: number;
  name: string;
  kpiId: string;
  totalKpi: number | null;
  rank: string;
  selfKpiTotal: number | null;
  selfRank: string;
  approvedKpiTotal: number | null;
  approvedRank: string;
}

export interface RecalculateUserFailure {
  userId: number;
  name: string;
  error: string;
}

export interface RecalculateResult {
  month: string;
  total: number;
  succeeded: RecalculateUserSuccess[];
  failed: RecalculateUserFailure[];
  isAllSuccess: boolean;
  hasFailures: boolean;
}

export async function recalculateKpiForMonth(targetMonth: string, specificUserIds?: number[]): Promise<RecalculateResult> {
  if (!targetMonth) {
    return {
      month: targetMonth || '',
      total: 0,
      succeeded: [],
      failed: [],
      isAllSuccess: false,
      hasFailures: false
    };
  }

  const allUsers: any[] = await db.query.users.findMany();
  let targetUsers = allUsers.filter(isUserActive);

  if (Array.isArray(specificUserIds) && specificUserIds.length > 0) {
    const idSet = new Set(specificUserIds.map(Number));
    targetUsers = targetUsers.filter(u => idSet.has(Number(u.id)));
  }

  const allWorksInMonth = await db.query.works.findMany({
    where: (w, { eq }) => eq(w.month, targetMonth)
  });

  const naturePointMap = await getEffectiveWorkNaturePointMap();
  const kpiConfig = await getEffectiveKpiConfig();

  const succeeded: RecalculateUserSuccess[] = [];
  const failed: RecalculateUserFailure[] = [];

  for (const u of targetUsers) {
    try {
      const res = await calculateAndSaveUserKpi(u, targetMonth, { allUsers, allWorksInMonth, naturePointMap, kpiConfig });
      succeeded.push({
        userId: Number(u.id),
        name: String(u.name || ''),
        kpiId: res.kpiId,
        totalKpi: res.totalKpi,
        rank: res.rank,
        selfKpiTotal: res.selfKpiTotal,
        selfRank: res.selfRank,
        approvedKpiTotal: res.approvedKpiTotal,
        approvedRank: res.approvedRank
      });
    } catch (err: any) {
      console.error(`Error recalculating KPI for user ${u.id} (${u.name}) in month ${targetMonth}:`, err);
      failed.push({
        userId: Number(u.id),
        name: String(u.name || ''),
        error: err?.message || String(err)
      });
    }
  }

  return {
    month: targetMonth,
    total: targetUsers.length,
    succeeded,
    failed,
    isAllSuccess: failed.length === 0 && targetUsers.length > 0,
    hasFailures: failed.length > 0
  };
}

export interface AffectedMonthsRecalculateResult {
  success: boolean;
  totalMonths: number;
  succeededMonths: string[];
  failedUsers: { month: string; userId: number; name: string; error: string }[];
  details: any[];
}

export async function recalculateAffectedMonths(months: (string | undefined | null)[]): Promise<AffectedMonthsRecalculateResult> {
  const distinctMonths = Array.from(new Set(months.filter((m): m is string => Boolean(m))));
  const failedUsers: { month: string; userId: number; name: string; error: string }[] = [];
  const succeededMonths: string[] = [];
  const details: any[] = [];

  for (const m of distinctMonths) {
    try {
      const res = await recalculateKpiForMonth(m);
      details.push(res);
      if (res.failed && res.failed.length > 0) {
        for (const f of res.failed) {
          failedUsers.push({ month: m, userId: f.userId, name: f.name, error: f.error });
        }
      } else {
        succeededMonths.push(m);
      }
    } catch (err: any) {
      console.error(`Failed to run recalculateKpiForMonth for month ${m}:`, err);
      failedUsers.push({ month: m, userId: 0, name: 'TẤT CẢ', error: err?.message || String(err) });
    }
  }

  return {
    success: failedUsers.length === 0,
    totalMonths: distinctMonths.length,
    succeededMonths,
    failedUsers,
    details
  };
}

