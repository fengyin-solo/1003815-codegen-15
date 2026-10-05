/**
 * 方案会签台业务服务：建议生成、双方会签、顺序推进、冲突优先级裁定、跨页回写。
 *
 * 边界约定：
 * - 本服务只读写会签方案与回写事项（conservation-store），不修改 entries 中的
 *   原始保护处理记录；对原始记录的引用只保存其编号快照。
 * - 状态只能沿 待处理→处理中→已完成→需观察→已稳定 依次推进，跳级一律拒绝。
 * - 会签完成时生成回写事项；重复提交（重复会签、重复推进）幂等，不追加第二份。
 */
import {
  describePriorityDecision,
  evaluateAdvice,
  type AdviceResult,
  type ConflictPriority,
} from '@/data/conservation-rules'
import {
  getPlan,
  listPlans,
  listWritebacks,
  nextPlanId,
  nextPlanNo,
  upsertPlan,
  upsertWriteback,
  type ConservationPlan,
  type ConservationWriteback,
  type PlanHistoryItem,
  type PlanStatus,
  type SignChoice,
  type SignOpinion,
  type WritebackStatus,
} from '@/data/conservation-store'
import { listRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'

export type { ConservationPlan, ConservationWriteback, PlanStatus, WritebackStatus }
export { PLAN_STATUSES } from '@/data/conservation-store'

export interface ServiceResult<T = undefined> {
  ok: boolean
  message: string
  data?: T
}

export interface PlanDraft {
  sourceRecordNo: string
  objectName: string
  objectCategory: string
  disease: string
  proposedMaterial: string
  thresholdValue: number | null
  artifactNo: string
  severity: string
  createdBy: string
  conflictDecision: ConflictPriority
  conflictDecisionBy: string
  conflictDecisionNote: string
}

export function previewAdvice(draft: {
  objectCategory: string
  disease: string
  proposedMaterial: string
  thresholdValue: number | null
}): AdviceResult {
  return evaluateAdvice(draft)
}

/** 原始处理记录只读列表——会签台引用，不提供任何写入口 */
export function sourceRecords(filters: Record<string, string> = {}): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  return listRows('conservation').filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

function nowText(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`
}

function appendHistory(history: PlanHistoryItem[], event: string): PlanHistoryItem[] {
  return [...history, { at: nowText(), event }]
}

function signPassed(plan: Pick<ConservationPlan, 'managerOpinion' | 'restorerOpinion'>): boolean {
  return (
    plan.managerOpinion !== null &&
    plan.restorerOpinion !== null &&
    plan.managerOpinion.choice !== '不予采纳' &&
    plan.restorerOpinion.choice !== '不予采纳'
  )
}

export function signStatus(plan: ConservationPlan): {
  managerSigned: boolean
  restorerSigned: boolean
  completed: boolean
  passed: boolean
} {
  const managerSigned = plan.managerOpinion !== null
  const restorerSigned = plan.restorerOpinion !== null
  const completed = managerSigned && restorerSigned
  return { managerSigned, restorerSigned, completed, passed: completed && signPassed(plan) }
}

/** 建方案：固化规则建议与实现者对材料冲突的优先级裁定 */
export function createPlan(draft: PlanDraft): ServiceResult<ConservationPlan> {
  if (!draft.objectName.trim()) {
    return { ok: false, message: '请填写保护对象名称' }
  }
  if (!draft.objectCategory || !draft.disease) {
    return { ok: false, message: '请选择保护对象类别与病害类型' }
  }
  if (draft.sourceRecordNo.trim()) {
    const exists = listRows('conservation').some(
      (row) => String(row['处理编号'] ?? '') === draft.sourceRecordNo.trim(),
    )
    if (!exists) {
      return { ok: false, message: `引用的原始处理记录「${draft.sourceRecordNo.trim()}」不存在` }
    }
  }
  const advice = evaluateAdvice({
    objectCategory: draft.objectCategory,
    disease: draft.disease,
    proposedMaterial: draft.proposedMaterial,
    thresholdValue: draft.thresholdValue,
  })
  const hasMaterialConflict = advice.conflicts.some((item) => item.kind === 'material')
  if (
    hasMaterialConflict &&
    !draft.conflictDecisionBy.trim() &&
    !draft.createdBy.trim()
  ) {
    return { ok: false, message: '材料建议与病害处置规则冲突，须由实现者（修复实施人）署名裁定优先级' }
  }

  const plan: ConservationPlan = {
    id: nextPlanId(),
    planNo: nextPlanNo(),
    sourceRecordNo: draft.sourceRecordNo.trim(),
    objectName: draft.objectName.trim(),
    objectCategory: draft.objectCategory,
    disease: draft.disease,
    proposedMaterial: draft.proposedMaterial,
    thresholdValue: draft.thresholdValue,
    artifactNo: draft.artifactNo.trim(),
    severity: draft.severity || '一般',
    createdBy: draft.createdBy.trim(),
    createdAt: nowText(),
    advice,
    hasMaterialConflict,
    conflictDecision: hasMaterialConflict ? draft.conflictDecision : 'rule',
    conflictDecisionBy: hasMaterialConflict
      ? draft.conflictDecisionBy.trim() || draft.createdBy.trim()
      : '',
    conflictDecisionNote: hasMaterialConflict ? draft.conflictDecisionNote.trim() : '',
    managerOpinion: null,
    restorerOpinion: null,
    status: '待处理',
    writebackKey: null,
    history: appendHistory(
      [],
      hasMaterialConflict
        ? '创建会签方案并生成处理建议（存在材料冲突，已由实现者裁定优先级）'
        : '创建会签方案并生成处理建议',
    ),
  }
  upsertPlan(plan)
  return { ok: true, message: `方案 ${plan.planNo} 已创建，当前状态「待处理」`, data: plan }
}

/** 实现者（修复实施人）对材料冲突的优先级裁定说明，固化进方案快照 */
export function conflictDecisionText(plan: ConservationPlan): string {
  if (!plan.hasMaterialConflict) return ''
  return describePriorityDecision(plan.advice, plan.conflictDecision, plan.conflictDecisionBy)
}

/** 现场负责人 / 修复人员分别填写采纳意见，各自只能填一次，重复提交幂等拒绝 */
export function submitOpinion(
  planId: number,
  role: 'manager' | 'restorer',
  opinion: { name: string; choice: SignChoice; comment: string },
): ServiceResult {
  const plan = getPlan(planId)
  if (!plan) {
    return { ok: false, message: `没有找到编号为 ${planId} 的会签方案` }
  }
  const roleName = role === 'manager' ? '现场负责人' : '修复人员'
  const already = role === 'manager' ? plan.managerOpinion : plan.restorerOpinion
  if (already) {
    // 重复提交不会再追加/覆盖意见，也不会追加第二份回写
    return {
      ok: false,
      message: `${roleName}意见已于 ${already.signedAt} 提交（${already.choice}），会签意见不可重复填写或修改`,
    }
  }
  if (!opinion.name.trim()) {
    return { ok: false, message: `请填写${roleName}署名` }
  }
  if (!opinion.comment.trim()) {
    return { ok: false, message: `请填写${roleName}意见说明` }
  }

  const signed: SignOpinion = {
    name: opinion.name.trim(),
    choice: opinion.choice,
    comment: opinion.comment.trim(),
    signedAt: nowText(),
  }
  const updated: ConservationPlan = {
    ...plan,
    managerOpinion: role === 'manager' ? signed : plan.managerOpinion,
    restorerOpinion: role === 'restorer' ? signed : plan.restorerOpinion,
  }
  const beforeComplete = signStatus(plan).completed
  updated.history = appendHistory(updated.history, `${roleName}会签：${signed.choice}`)
  if (!beforeComplete && signStatus(updated).completed) {
    const passed = signPassed(updated)
    updated.history = appendHistory(
      updated.history,
      passed ? '双方会签完成，会签结论：通过' : '双方会签完成，会签结论：未通过（存在不予采纳意见）',
    )
    if (passed) {
      const item = ensureWriteback(updated)
      updated.writebackKey = item.key
      updated.history = appendHistory(
        updated.history,
        '已在出土遗物页生成保护状态回写事项（重复提交不追加）',
      )
    }
  }
  upsertPlan(updated)
  const complete = signStatus(updated)
  return {
    ok: true,
    message: complete.completed
      ? complete.passed
        ? '现场负责人与修复人员均已会签，结论：通过；保护状态回写事项已生成'
        : '现场负责人与修复人员均已会签，结论：未通过'
      : `${roleName}意见已提交，等待另一方会签`,
  }
}

function buildWriteback(plan: ConservationPlan, at: string): ConservationWriteback {
  const m = plan.managerOpinion
  const r = plan.restorerOpinion
  const content =
    `方案 ${plan.planNo} 已完成会签` +
    `（现场负责人${m?.name ?? ''}：${m?.choice ?? ''}；修复人员${r?.name ?? ''}：${
      r?.choice ?? ''
    }，会签结论：通过）。` +
    `${plan.objectName}（${plan.disease}）当前保护状态：${plan.status}，请在遗物档案中同步保护状态。`
  return {
    key: `plan-${plan.id}`,
    planId: plan.id,
    planNo: plan.planNo,
    artifactNo: plan.artifactNo,
    objectName: plan.objectName,
    disease: plan.disease,
    content,
    finalStatus: plan.status,
    status: '待回写',
    createdAt: at,
    updatedAt: at,
  }
}

/**
 * 幂等生成回写事项：以方案 id 为幂等键。
 * 会签完成被重复触发（重复提交、重复推进）时不会追加第二份回写。
 */
function ensureWriteback(plan: ConservationPlan): ConservationWriteback {
  const existing = listWritebacks().find((item) => item.key === `plan-${plan.id}`)
  if (existing) {
    return existing
  }
  const item = buildWriteback(plan, nowText())
  upsertWriteback(item)
  return item
}

/** 同步既有回写事项的最终保护状态（同一条记录更新，不新增） */
function syncWritebackStatus(plan: ConservationPlan): void {
  const existing = listWritebacks().find((item) => item.key === `plan-${plan.id}`)
  if (!existing) {
    return
  }
  upsertWriteback({ ...existing, finalStatus: plan.status, updatedAt: nowText() })
}

/**
 * 方案状态推进：只允许沿状态链相邻前进。
 * 跳过观察直接稳定化（已完成→已稳定）以及一切跳级都会被拒绝。
 */
export function advancePlan(planId: number, target: PlanStatus): ServiceResult {
  const plan = getPlan(planId)
  if (!plan) {
    return { ok: false, message: `没有找到编号为 ${planId} 的会签方案` }
  }
  const chain = ['待处理', '处理中', '已完成', '需观察', '已稳定'] as PlanStatus[]
  const fromIndex = chain.indexOf(plan.status)
  const toIndex = chain.indexOf(target)

  if (toIndex < 0) {
    return { ok: false, message: `「${target}」不是方案会签台认可的状态` }
  }
  if (toIndex === fromIndex) {
    return { ok: false, message: `方案已经是「${target}」，无需重复推进` }
  }
  if (toIndex < fromIndex) {
    return { ok: false, message: `方案状态只能依次前进，不能由「${plan.status}」退回「${target}」` }
  }
  if (toIndex !== fromIndex + 1) {
    const gap = toIndex - fromIndex
    if (plan.status === '已完成' && target === '已稳定') {
      return {
        ok: false,
        message: '已拒绝：「已完成」不得直接稳定化为「已稳定」，须先进入「需观察」并完成观察期',
      }
    }
    return {
      ok: false,
      message: `已拒绝：方案只能在 待处理→处理中→已完成→需观察→已稳定 之间依次推进，不能一次跨越 ${gap} 个状态`,
    }
  }
  if (plan.status === '待处理' && target === '处理中') {
    const sign = signStatus(plan)
    if (!sign.completed) {
      return {
        ok: false,
        message: '方案尚未完成双方会签，不能由「待处理」推进到「处理中」',
      }
    }
    if (!sign.passed) {
      return { ok: false, message: '会签结论为未通过（存在不予采纳意见），方案不能进入处理' }
    }
  }

  const updated: ConservationPlan = { ...plan, status: target }
  updated.history = appendHistory(
    updated.history,
    `状态由「${plan.status}」推进至「${target}」`,
  )

  // 首次进入处理中时兜底确保回写事项存在（正常路径已在会签完成时生成）。
  if (signPassed(updated) && !updated.writebackKey) {
    const item = ensureWriteback(updated)
    updated.writebackKey = item.key
  }
  upsertPlan(updated)
  syncWritebackStatus(updated)
  return { ok: true, message: `方案已推进：「${plan.status}」→「${target}」` }
}

export interface PlanFilter {
  keyword?: string
  status?: string
}

export function queryPlans(filter: PlanFilter = {}): ConservationPlan[] {
  const keyword = filter.keyword?.trim() ?? ''
  return listPlans()
    .filter((plan) => (filter.status ? plan.status === filter.status : true))
    .filter((plan) => {
      if (!keyword) return true
      const haystack = [
        plan.planNo,
        plan.sourceRecordNo,
        plan.objectName,
        plan.objectCategory,
        plan.disease,
        plan.proposedMaterial,
        plan.artifactNo,
      ].join(' ')
      return haystack.includes(keyword)
    })
    .sort((a, b) => b.id - a.id)
}

/** 出土遗物页：按器物编号读取跨业务面的保护状态回写事项 */
export function writebacksForArtifact(artifactNo: string): ConservationWriteback[] {
  const key = artifactNo.trim()
  if (!key) return []
  return listWritebacks().filter((item) => item.artifactNo === key)
}

/** 未匹配到具体出土遗物编号的回写事项 */
export function unmatchedWritebacks(): ConservationWriteback[] {
  const artifactNos = new Set(
    listRows('artifact').map((row) => String(row['器物编号'] ?? '').trim()),
  )
  return listWritebacks().filter(
    (item) => !item.artifactNo || !artifactNos.has(item.artifactNo.trim()),
  )
}

export function allWritebacks(): ConservationWriteback[] {
  return listWritebacks()
}

/** 出土遗物页确认已完成档案同步（只更新回写事项本身，不修改遗物记录） */
export function acknowledgeWriteback(key: string): ServiceResult {
  const item = listWritebacks().find((entry) => entry.key === key)
  if (!item) {
    return { ok: false, message: '没有找到该保护状态回写事项' }
  }
  if (item.status === '已回写') {
    return { ok: false, message: '该回写事项已确认，请勿重复提交' }
  }
  upsertWriteback({ ...item, status: '已回写', updatedAt: nowText() })
  return { ok: true, message: `方案 ${item.planNo} 的保护状态已标记为回写完成` }
}
