import { listRows, saveRows } from '@/data/local-store'
import { buildRecommendation, PLAN_ACTIONS, PLAN_FLOW } from '@/data/plan-rules'
import type { ActionResult, EntryRow } from '@/data/types'

// 会签方案与保护状态回写事项各用一个本地集合，和模块数据一样落在 localStorage。
// 注意：会签流程只读关联「conservation」原始处理记录，绝不对它做 saveRows，
// 保证原始处理记录不能被会签台改掉。
export const PLAN_KEY = 'conservation_plan'
export const WRITEBACK_KEY = 'artifact_writeback'

export type SignRole = 'leader' | 'restorer'

export type PlanCreateInput = {
  关联处理编号?: string
  保护对象: string
  病害类型: string
  拟用材料: string
}

const ROLE_FIELDS: Record<SignRole, { decision: string; opinion: string; label: string }> = {
  leader: { decision: '负责人采纳', opinion: '负责人意见', label: '现场负责人' },
  restorer: { decision: '修复人采纳', opinion: '修复人意见', label: '修复人员' },
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function listPlans(): EntryRow[] {
  return listRows(PLAN_KEY)
}

export function listWriteBacks(): EntryRow[] {
  return listRows(WRITEBACK_KEY)
}

// 可供方案关联的原始处理记录编号（只读引用，不回写）。
export function linkableRecordCodes(): string[] {
  return listRows('conservation')
    .map((row) => String(row['处理编号'] ?? ''))
    .filter((code) => code !== '')
}

export function createPlan(input: PlanCreateInput): ActionResult {
  const object = input.保护对象.trim()
  const disease = input.病害类型.trim()
  const material = input.拟用材料.trim()
  if (!object || !disease || !material) {
    return { ok: false, message: '保护对象、病害类型、拟用材料都要选择后才能生成处理建议' }
  }
  const rec = buildRecommendation(object, disease, material)
  const plans = listRows(PLAN_KEY)
  const id = nextId(plans)
  const plan: EntryRow = {
    id,
    status: '待处理',
    pending: true,
    abnormal: rec.conflict,
    方案编号: `PLAN-${String(id).padStart(4, '0')}`,
    关联处理编号: input.关联处理编号?.trim() || '—',
    保护对象: object,
    病害类型: disease,
    拟用材料: material,
    材料判定: rec.verdict,
    处理建议: rec.advice,
    建议依据: rec.basis,
    负责人采纳: '未填写',
    负责人意见: '',
    修复人采纳: '未填写',
    修复人意见: '',
    会签状态: '待会签',
    回写编号: '',
  }
  saveRows(PLAN_KEY, [...plans, plan])
  return {
    ok: true,
    message: `方案 ${String(plan.方案编号)} 已登记，处理建议已生成（材料判定：${rec.verdict}），等待双方会签`,
  }
}

// 现场负责人 / 修复人员分别提交采纳意见；双方都提交后会签完成，并生成回写事项。
export function submitOpinion(
  planId: number,
  role: SignRole,
  decision: string,
  opinion: string,
): ActionResult {
  const plans = listRows(PLAN_KEY)
  const index = plans.findIndex((row) => Number(row.id) === planId)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${planId} 的会签方案` }
  }
  const plan = plans[index]
  if (String(plan.会签状态) === '已会签') {
    return { ok: false, message: `方案 ${String(plan.方案编号)} 会签已完成，重复提交不会追加第二份回写事项` }
  }
  const fields = ROLE_FIELDS[role]
  if (String(plan[fields.decision]) !== '未填写') {
    return { ok: false, message: `${fields.label}已填写过采纳意见，会签留痕不可改写` }
  }
  if (decision !== '采纳' && decision !== '不采纳') {
    return { ok: false, message: '请选择「采纳」或「不采纳」' }
  }
  if (!opinion.trim()) {
    return { ok: false, message: '请填写采纳意见说明' }
  }
  const updated: EntryRow = { ...plan, [fields.decision]: decision, [fields.opinion]: opinion.trim() }
  const bothSigned = String(updated.负责人采纳) !== '未填写' && String(updated.修复人采纳) !== '未填写'
  updated.会签状态 = bothSigned ? '已会签' : '会签中'
  let message = `${fields.label}采纳意见已提交`
  if (bothSigned) {
    const writeback = ensureWriteBack(updated)
    updated.回写编号 = writeback.code
    message += writeback.created
      ? `，双方会签完成，已在出土遗物页生成保护状态回写事项 ${writeback.code}`
      : `，双方会签完成，回写事项 ${writeback.code} 已存在，不重复追加`
  }
  const next = [...plans]
  next[index] = updated
  saveRows(PLAN_KEY, next)
  return { ok: true, message }
}

// 会签完成后在出土遗物页生成保护状态回写事项；按来源方案编号去重，重复提交不会追加第二份。
function ensureWriteBack(plan: EntryRow): { created: boolean; code: string } {
  const items = listRows(WRITEBACK_KEY)
  const existing = items.find((item) => String(item.来源方案编号) === String(plan.方案编号))
  if (existing) {
    return { created: false, code: String(existing.回写编号) }
  }
  const id = nextId(items)
  const code = `WB-${String(id).padStart(4, '0')}`
  const item: EntryRow = {
    id,
    status: '待回写',
    pending: true,
    abnormal: false,
    回写编号: code,
    来源方案编号: String(plan.方案编号),
    保护对象: String(plan.保护对象),
    保护状态: String(plan.status),
    会签结论: `现场负责人：${String(plan.负责人采纳)}；修复人员：${String(plan.修复人采纳)}`,
    生成时间: today(),
  }
  saveRows(WRITEBACK_KEY, [...items, item])
  return { created: true, code }
}

// 方案状态只能依次推进：待处理→处理中→已完成→需观察→已稳定；跳过观察直接稳定化会被拒绝。
export function advancePlan(planId: number, action: string): ActionResult {
  const target = PLAN_ACTIONS[action]
  if (!target) {
    return { ok: false, message: `会签方案没有登记「${action}」这个动作` }
  }
  const plans = listRows(PLAN_KEY)
  const index = plans.findIndex((row) => Number(row.id) === planId)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${planId} 的会签方案` }
  }
  const plan = plans[index]
  const current = String(plan.status)
  if (current === target) {
    return { ok: false, message: `方案已经是「${target}」，不用重复操作` }
  }
  const currentIndex = PLAN_FLOW.indexOf(current)
  const targetIndex = PLAN_FLOW.indexOf(target)
  if (targetIndex === currentIndex + 1) {
    const updated: EntryRow = {
      ...plan,
      status: target,
      pending: target !== PLAN_FLOW[PLAN_FLOW.length - 1],
    }
    const next = [...plans]
    next[index] = updated
    saveRows(PLAN_KEY, next)
    return { ok: true, message: `方案已${action}，当前状态「${target}」` }
  }
  if (target === '已稳定' && current !== '需观察') {
    return {
      ok: false,
      message: `方案当前为「${current}」，跳过观察直接稳定化已被拒绝，须先依次推进到「需观察」`,
    }
  }
  return {
    ok: false,
    message: `方案状态只能依次推进（待处理→处理中→已完成→需观察→已稳定），当前「${current}」不能直接到「${target}」`,
  }
}

export function confirmWriteBack(id: number): ActionResult {
  const items = listRows(WRITEBACK_KEY)
  const index = items.findIndex((item) => Number(item.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的回写事项` }
  }
  if (String(items[index].status) === '已回写') {
    return { ok: false, message: `回写事项 ${String(items[index].回写编号)} 已确认过，不用重复操作` }
  }
  const next = [...items]
  next[index] = { ...items[index], status: '已回写', pending: false }
  saveRows(WRITEBACK_KEY, next)
  return { ok: true, message: `回写事项 ${String(items[index].回写编号)} 已确认回写` }
}
