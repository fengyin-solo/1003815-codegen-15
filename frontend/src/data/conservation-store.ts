/**
 * 方案会签与保护状态回写事项的本地持久化。
 *
 * 会签方案是独立的业务单据：只「只读引用」保护处理记录编号，不会回写或改写
 * entries（原始处理记录）。回写事项同样单独存放，供跨业务面的出土遗物页读取。
 */
import type { AdviceResult, ConflictPriority } from './conservation-rules'
import { evaluateAdvice } from './conservation-rules'

const STORAGE_KEY = 'field-archaeology-digital:conservation-countersign'

export const PLAN_STATUSES = ['待处理', '处理中', '已完成', '需观察', '已稳定'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

export type SignChoice = '采纳' | '部分采纳' | '不予采纳'

export interface SignOpinion {
  name: string
  choice: SignChoice
  comment: string
  signedAt: string
}

export interface PlanHistoryItem {
  at: string
  event: string
}

export interface ConservationPlan {
  id: number
  planNo: string
  sourceRecordNo: string
  objectName: string
  objectCategory: string
  disease: string
  proposedMaterial: string
  thresholdValue: number | null
  artifactNo: string
  severity: string
  createdBy: string
  createdAt: string
  /** 建方案时固化的规则建议快照 */
  advice: AdviceResult
  hasMaterialConflict: boolean
  conflictDecision: ConflictPriority
  conflictDecisionBy: string
  conflictDecisionNote: string
  managerOpinion: SignOpinion | null
  restorerOpinion: SignOpinion | null
  status: PlanStatus
  writebackKey: string | null
  history: PlanHistoryItem[]
}

export type WritebackStatus = '待回写' | '已回写'

export interface ConservationWriteback {
  /** 幂等键：同一方案永远只对应一份回写事项 */
  key: string
  planId: number
  planNo: string
  artifactNo: string
  objectName: string
  disease: string
  content: string
  finalStatus: string
  status: WritebackStatus
  createdAt: string
  updatedAt: string
}

interface ConservationState {
  plans: ConservationPlan[]
  writebacks: ConservationWriteback[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function demoPlans(): ConservationPlan[] {
  // 演示数据引用规则库即时评估后固化，保证结构与当前规则一致。
  const signedAdvice = evaluateAdvice({
    objectCategory: '青铜器',
    disease: '粉状锈（青铜病）',
    proposedMaterial: 'B72丙烯酸树脂',
    thresholdValue: null,
  })
  const pendingAdvice = evaluateAdvice({
    objectCategory: '陶器',
    disease: '残断裂',
    proposedMaterial: '502瞬干胶',
    thresholdValue: null,
  })
  return [
    {
      id: 1,
      planNo: 'CCSP-0001',
      sourceRecordNo: 'CONS-0003',
      objectName: '青铜鼎残件',
      objectCategory: '青铜器',
      disease: '粉状锈（青铜病）',
      proposedMaterial: 'B72丙烯酸树脂',
      thresholdValue: null,
      artifactNo: 'ARTI-0001',
      severity: '较重',
      createdBy: '修复实施人-周岩',
      createdAt: '2026-09-04 09:20',
      advice: signedAdvice,
      hasMaterialConflict: false,
      conflictDecision: 'rule',
      conflictDecisionBy: '',
      conflictDecisionNote: '',
      managerOpinion: {
        name: '现场负责人-韩岭',
        choice: '采纳',
        comment: '脱氯方案符合青铜病处置要求，同意按推荐材料施工。',
        signedAt: '2026-09-04 10:05',
      },
      restorerOpinion: {
        name: '修复人员-周岩',
        choice: '采纳',
        comment: '将按氧化银封闭＋倍半碳酸钠脱氯工艺执行。',
        signedAt: '2026-09-04 10:22',
      },
      status: '需观察',
      writebackKey: 'plan-1',
      history: [
        { at: '2026-09-04 09:20', event: '创建会签方案并生成处理建议' },
        { at: '2026-09-04 10:05', event: '现场负责人会签：采纳' },
        { at: '2026-09-04 10:22', event: '修复人员会签：采纳，会签完成' },
        { at: '2026-09-04 10:23', event: '状态由「待处理」推进至「处理中」，并生成保护状态回写事项' },
        { at: '2026-09-05 16:00', event: '状态由「处理中」推进至「已完成」' },
        { at: '2026-09-06 09:00', event: '状态由「已完成」推进至「需观察」' },
      ],
    },
    {
      id: 2,
      planNo: 'CCSP-0002',
      sourceRecordNo: 'CONS-0001',
      objectName: '陶罐残片',
      objectCategory: '陶器',
      disease: '残断裂',
      proposedMaterial: '502瞬干胶',
      thresholdValue: null,
      artifactNo: 'ARTI-0002',
      severity: '一般',
      createdBy: '修复实施人-周岩',
      createdAt: '2026-10-02 14:40',
      advice: pendingAdvice,
      hasMaterialConflict: true,
      conflictDecision: 'rule',
      conflictDecisionBy: '修复实施人-周岩',
      conflictDecisionNote: '接受规则结论，改用B72丙烯酸树脂粘接，502仅作废方案对照。',
      managerOpinion: null,
      restorerOpinion: null,
      status: '待处理',
      writebackKey: null,
      history: [{ at: '2026-10-02 14:40', event: '创建会签方案并生成处理建议（存在材料冲突，已由实现者裁定优先级）' }],
    },
  ]
}

function demoWritebacks(): ConservationWriteback[] {
  const plans = demoPlans()
  const plan = plans.find((item) => item.id === 1)
  if (!plan || !plan.managerOpinion || !plan.restorerOpinion) {
    return []
  }
  return [
    {
      key: 'plan-1',
      planId: 1,
      planNo: 'CCSP-0001',
      artifactNo: 'ARTI-0001',
      objectName: '青铜鼎残件',
      disease: '粉状锈（青铜病）',
      content:
        '方案 CCSP-0001 已完成会签（现场负责人：采纳；修复人员：采纳，会签结论：通过）。青铜鼎残件（粉状锈（青铜病））当前保护状态：需观察，请在遗物档案中同步保护状态。',
      finalStatus: '需观察',
      status: '待回写',
      createdAt: '2026-09-04 10:22',
      updatedAt: '2026-09-06 09:00',
    },
  ]
}

function seedState(): ConservationState {
  return { plans: demoPlans(), writebacks: demoWritebacks() }
}

function readState(): ConservationState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return seedState()
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seed = seedState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
    return seed
  }
  try {
    const parsed = JSON.parse(raw) as ConservationState
    return { plans: parsed.plans ?? [], writebacks: parsed.writebacks ?? [] }
  } catch {
    const seed = seedState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
    return seed
  }
}

let cache: ConservationState | null = null

export function conservationState(): ConservationState {
  if (cache === null) {
    cache = readState()
  }
  return cache
}

export function saveConservationState(state: ConservationState): void {
  cache = state
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
}

export function listPlans(): ConservationPlan[] {
  return conservationState().plans
}

export function getPlan(id: number): ConservationPlan | null {
  return listPlans().find((plan) => plan.id === id) ?? null
}

export function upsertPlan(plan: ConservationPlan): void {
  const state = conservationState()
  const index = state.plans.findIndex((item) => item.id === plan.id)
  const plans = clone(state.plans)
  if (index >= 0) {
    plans[index] = clone(plan)
  } else {
    plans.push(clone(plan))
  }
  saveConservationState({ ...state, plans })
}

export function listWritebacks(): ConservationWriteback[] {
  return conservationState().writebacks
}

export function upsertWriteback(item: ConservationWriteback): void {
  const state = conservationState()
  const index = state.writebacks.findIndex((entry) => entry.key === item.key)
  const writebacks = clone(state.writebacks)
  if (index >= 0) {
    writebacks[index] = clone(item)
  } else {
    writebacks.push(clone(item))
  }
  saveConservationState({ ...state, writebacks })
}

export function nextPlanId(): number {
  return listPlans().reduce((max, plan) => Math.max(max, plan.id), 0) + 1
}

export function nextPlanNo(): string {
  const max = listPlans().reduce((max, plan) => {
    const seq = Number(plan.planNo.replace(/\D/g, ''))
    return Number.isFinite(seq) ? Math.max(max, seq) : max
  }, 0)
  return `CCSP-${String(max + 1).padStart(4, '0')}`
}

export function conservationStorageKey(): string {
  return STORAGE_KEY
}
