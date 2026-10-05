/**
 * 现场保护方案会签——判定规则、阈值与引用标准的规则库。
 *
 * 规则库为演示环境内置（可在本文件继续扩充）。方案创建时会调用 evaluateAdvice
 * 生成建议并把结果固化进方案快照，之后规则库调整不影响历史会签所依据的内容。
 */

export const OBJECT_CATEGORIES = [
  '陶器',
  '瓷器',
  '青铜器',
  '铁器',
  '彩绘陶器',
  '壁画',
  '石质文物',
  '骨角质',
  '漆木竹器',
  '纺织品',
] as const
export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number]

/** 各对象类别下可判定的病害类型 */
export const DISEASE_OPTIONS: Record<string, string[]> = {
  陶器: ['残断裂', '盐析泛白', '胎体酥粉'],
  瓷器: ['开片冲线', '釉面剥落'],
  青铜器: ['粉状锈（青铜病）', '稳定层状锈'],
  铁器: ['层状片状锈'],
  彩绘陶器: ['彩绘褪色', '彩绘空鼓起甲'],
  壁画: ['地仗盐析', '地仗空鼓'],
  石质文物: ['风化粉化'],
  骨角质: ['开裂翘曲'],
  漆木竹器: ['糟朽脱水'],
  纺织品: ['脆化断裂'],
}

export const SEVERITY_OPTIONS = ['轻微', '一般', '较重', '严重']

/** 拟用材料目录及材料侧使用建议 */
export const MATERIAL_TIPS: Record<string, string> = {
  B72丙烯酸树脂: '可逆性较好，可用于粘接与表面封护；按浓度梯度配制，避免在高湿表面施工。',
  环氧树脂: '粘接强度高但不可逆，仅限非关键部位补配，不得用于可见面与珍贵文物。',
  '502瞬干胶': '固化快但不可逆、易泛白，禁止用于珍贵文物，仅允许临时应急加固。',
  丙烯酸乳液: '适用于陶质酥粉胎体的低浓度渗透加固，需逐级提浓并先做小面积试验。',
  氧化银封闭剂: '用于青铜器粉状锈（氯化亚铜）锈核的局部封闭，点状使用。',
  倍半碳酸钠: '青铜器粉状锈螯合脱氯，置换周期长，需定期检测氯离子。',
  单宁酸: '可转化稳定铁器锈层，但会加深表面色泽，使用前必须做局部试验。',
  微晶蜡: '金属表面缓蚀封护，加热施工需控温，防止文物受热损伤。',
  无水乙醇: '常用清洗、脱水溶剂，易燃，现场须通风避火。',
  去离子水: '清洗、贴敷脱盐常用；对易溶彩绘与脆弱胎体慎用。',
  盐酸: '强酸，禁止直接作用于文物表面（尤其石质、金属文物），仅可用于场地除垢且不得接触文物。',
  PEG脱水剂: '聚乙二醇梯度脱水，用于饱水漆木竹器定型，周期长、需逐级提高浓度。',
  蚕丝线: '纺织品缝合修复用线，其柔度与强力应与原文物匹配。',
  桃胶: '传统可逆黏结材料，强度有限且不耐潮，仅用于低受力部位。',
  石灰水注浆料: '壁画空鼓地仗注浆，与传统钙质原材料相容性好。',
}

export const MATERIAL_OPTIONS = Object.keys(MATERIAL_TIPS)

/** 量化阈值定义：给出阈值后，方案中的实测值会被自动判读 */
export interface RuleThreshold {
  label: string
  max?: number
  min?: number
  unit: string
  overHint: string
}

export interface DiseaseRule {
  category: string
  disease: string
  /** 判定规则给出的标准处置方法 */
  method: string
  /** 规则推荐材料 */
  recommendedMaterials: string[]
  /** 规则明确禁用的材料：拟用材料命中即构成冲突 */
  forbiddenMaterials: string[]
  /** 引用标准 */
  standards: string[]
  threshold: RuleThreshold | null
  /** 规则说明（含禁用理由等） */
  ruleNote: string
}

const STD = {
  criteria: '《中国文物古迹保护准则》（2015年修订版）',
  plan: '《可移动文物保护修复方案编写规范》（文物保护行业标准）',
  potteryDisease: '《陶质文物病害分类与图示》（文物保护行业标准）',
  potteryPainted: '《陶质彩绘文物保护修复技术规范》（文物保护行业标准）',
  metalDisease: '《金属文物病害分类与图示》（文物保护行业标准）',
  metalPlan: '《馆藏金属文物保护修复方案编写规范》（文物保护行业标准）',
  muralDisease: 'GB/T 30237-2013《古代壁画病害与图示》',
  muralSurvey: 'WW/T 0001-2007《古代壁画现状调查规范》',
  muralDesalt: '《古代壁画脱盐技术规范》（文物保护行业标准）',
  stone: '《石质文物病害分类与图示》（文物保护行业标准）',
  bone: '《骨角质文物病害分类与图示》（文物保护行业标准）',
  wood: '《漆木器病害分类与图示》（文物保护行业标准）',
  textile: '《纺织品文物病害分类与图示》（文物保护行业标准）',
}

export const DISEASE_RULES: DiseaseRule[] = [
  {
    category: '陶器',
    disease: '残断裂',
    method: '先清理断口并做可逆预拼对，确认拼合关系后以可逆树脂粘接，非受力缺失部位方可配补。',
    recommendedMaterials: ['B72丙烯酸树脂', '丙烯酸乳液'],
    forbiddenMaterials: ['502瞬干胶'],
    standards: [STD.potteryDisease, STD.plan, STD.criteria],
    threshold: null,
    ruleNote: '502瞬干胶固化不可逆且易泛白，会破坏后续再处理可能，珍贵陶质文物禁用。',
  },
  {
    category: '陶器',
    disease: '盐析泛白',
    method: '以纸浆（或纤维素类敷材）贴敷置换可溶盐，多次检测达标后再做表面封护。',
    recommendedMaterials: ['去离子水', 'B72丙烯酸树脂'],
    forbiddenMaterials: [],
    standards: [STD.potteryDisease, STD.plan],
    threshold: {
      label: '可溶盐含量（质量分数）',
      max: 0.5,
      unit: '%',
      overHint: '盐含量仍高于阈值，应继续贴敷脱盐，达标前不得封护。',
    },
    ruleNote: '盐分未稳定即封护会在器物内部继续结晶，导致表层成片剥落。',
  },
  {
    category: '陶器',
    disease: '胎体酥粉',
    method: '以低浓度丙烯酸乳液由稀到浓梯度渗透加固，施工前先在隐蔽部位做小面积试验。',
    recommendedMaterials: ['丙烯酸乳液', 'B72丙烯酸树脂'],
    forbiddenMaterials: ['环氧树脂'],
    standards: [STD.potteryDisease, STD.plan, STD.criteria],
    threshold: null,
    ruleNote: '环氧树脂渗透后不可逆，会改变胎体孔隙结构，禁止用于整体渗透加固。',
  },
  {
    category: '瓷器',
    disease: '开片冲线',
    method: '清理冲线内污物后以可逆树脂微量渗粘，保持釉面原貌，不追求接缝完全隐形。',
    recommendedMaterials: ['B72丙烯酸树脂'],
    forbiddenMaterials: ['环氧树脂'],
    standards: [STD.plan, STD.criteria],
    threshold: null,
    ruleNote: '环氧树脂用于可见釉面不可逆且老化后黄变，影响文物外观与再处理。',
  },
  {
    category: '瓷器',
    disease: '釉面剥落',
    method: '保留稳定釉层，对起翘边缘点粘回贴，缺失釉面不做大面积补釉。',
    recommendedMaterials: ['B72丙烯酸树脂'],
    forbiddenMaterials: ['502瞬干胶'],
    standards: [STD.plan, STD.criteria],
    threshold: null,
    ruleNote: '瞬干胶泛白会在釉面留下永久性白痕，禁止用于釉面部位。',
  },
  {
    category: '青铜器',
    disease: '粉状锈（青铜病）',
    method: '机械剔除氯化亚铜活性锈核，采用氧化银法局部封闭，并以倍半碳酸钠置换脱氯后整体缓蚀封护。',
    recommendedMaterials: ['氧化银封闭剂', '倍半碳酸钠', 'B72丙烯酸树脂'],
    forbiddenMaterials: ['502瞬干胶', '环氧树脂'],
    standards: [STD.metalDisease, STD.metalPlan, STD.criteria],
    threshold: null,
    ruleNote: '粉状锈是含氯活性病害（青铜病），以不可逆材料简单覆盖会把氯离子封在器内继续腐蚀。',
  },
  {
    category: '青铜器',
    disease: '稳定层状锈',
    method: '经判定稳定、无害的层状锈予以保留，仅做表面清洁与缓蚀封护，不做通体除锈。',
    recommendedMaterials: ['微晶蜡', 'B72丙烯酸树脂'],
    forbiddenMaterials: [],
    standards: [STD.metalDisease, STD.metalPlan],
    threshold: null,
    ruleNote: '稳定锈层承载年代信息，过度除锈违反最小干预原则。',
  },
  {
    category: '铁器',
    disease: '层状片状锈',
    method: '清除松动片状锈，充分脱氯后用单宁酸转化稳定，再以微晶蜡封护。',
    recommendedMaterials: ['单宁酸', '微晶蜡'],
    forbiddenMaterials: ['502瞬干胶'],
    standards: [STD.metalDisease, STD.metalPlan, STD.plan],
    threshold: {
      label: '氯离子含量（质量分数）',
      max: 0.05,
      unit: '%',
      overHint: '氯离子仍超标，应继续脱氯清洗，否则锈层会继续发展。',
    },
    ruleNote: '单宁酸会加深铁器表面色泽，使用前必须局部试验并经审批确认。',
  },
  {
    category: '彩绘陶器',
    disease: '彩绘褪色',
    method: '立即停止水洗，先用稀树脂固彩，固化后再做干法或溶剂法清理。',
    recommendedMaterials: ['B72丙烯酸树脂'],
    forbiddenMaterials: ['去离子水', '环氧树脂', '502瞬干胶'],
    standards: [STD.potteryPainted, STD.plan, STD.criteria],
    threshold: null,
    ruleNote: '彩绘胶料已劣化时遇水会溶失，禁止以水直接冲洗彩绘层。',
  },
  {
    category: '彩绘陶器',
    disease: '彩绘空鼓起甲',
    method: '以低浓度B72注射渗透，回贴起甲彩绘并控制环境湿度，待缓慢稳定。',
    recommendedMaterials: ['B72丙烯酸树脂'],
    forbiddenMaterials: ['环氧树脂'],
    standards: [STD.potteryPainted, STD.plan],
    threshold: {
      label: '环境相对湿度',
      max: 65,
      unit: '%RH',
      overHint: '环境湿度偏高，应先降湿控湿，否则回贴后的彩绘仍会反复起甲。',
    },
    ruleNote: '高湿度环境下彩绘胶料无法稳定成膜，空鼓会复发。',
  },
  {
    category: '壁画',
    disease: '地仗盐析',
    method: '以纸浆或硅藻土贴敷反复脱盐，检测可溶盐达标后再修复地仗与颜料层。',
    recommendedMaterials: ['去离子水'],
    forbiddenMaterials: ['盐酸'],
    standards: [STD.muralDisease, STD.muralDesalt, STD.muralSurvey],
    threshold: {
      label: '可溶盐含量（质量分数）',
      max: 0.3,
      unit: '%',
      overHint: '盐含量超标，应继续脱盐，禁止带盐修复地仗。',
    },
    ruleNote: '酸液会同时破坏地仗与颜料层，壁画现场禁用酸洗。',
  },
  {
    category: '壁画',
    disease: '地仗空鼓',
    method: '确认地仗含盐稳定后，以石灰质浆液注浆回贴，必要时做临时支顶，分区间施工。',
    recommendedMaterials: ['石灰水注浆料', '桃胶'],
    forbiddenMaterials: ['环氧树脂'],
    standards: [STD.muralDisease, STD.muralSurvey, STD.criteria],
    threshold: null,
    ruleNote: '环氧树脂注浆与石灰地仗胀缩不匹配，会造成新的空鼓，必须使用相容性材料。',
  },
  {
    category: '石质文物',
    disease: '风化粉化',
    method: '干法清除松散风化物，使用与石材相容的加固剂小试后渗透加固，严禁酸洗。',
    recommendedMaterials: ['B72丙烯酸树脂'],
    forbiddenMaterials: ['盐酸'],
    standards: [STD.stone, STD.plan, STD.criteria],
    threshold: null,
    ruleNote: '酸液溶蚀石质矿物并加速盐害，石质文物表面严禁使用强酸清洗。',
  },
  {
    category: '骨角质',
    disease: '开裂翘曲',
    method: '在受控湿度环境中缓慢均衡含水率，裂缝以可逆材料轻固定，禁止骤然干燥。',
    recommendedMaterials: ['B72丙烯酸树脂'],
    forbiddenMaterials: ['502瞬干胶'],
    standards: [STD.bone, STD.plan],
    threshold: {
      label: '含水率',
      max: 20,
      unit: '%',
      overHint: '含水率偏高，应继续控湿缓干，骤干会使裂缝与翘曲加剧。',
    },
    ruleNote: '骨角质失水收缩显著，快固胶会锁死变形应力，导致二次开裂。',
  },
  {
    category: '漆木竹器',
    disease: '糟朽脱水',
    method: '饱水糟朽器物采用聚乙二醇（PEG）梯度浸渍脱水定型，再做整形加固。',
    recommendedMaterials: ['PEG脱水剂'],
    forbiddenMaterials: ['无水乙醇'],
    standards: [STD.wood, STD.plan, STD.criteria],
    threshold: null,
    ruleNote: '直接以乙醇快速脱水会使饱水胎体急剧收缩、漆皮起翘，禁止跳级脱水。',
  },
  {
    category: '纺织品',
    disease: '脆化断裂',
    method: '平整后以细丝线做衬垫缝合加固，断裂处加衬同色系背衬，避免化学黏结。',
    recommendedMaterials: ['蚕丝线'],
    forbiddenMaterials: ['502瞬干胶', '环氧树脂'],
    standards: [STD.textile, STD.plan],
    threshold: null,
    ruleNote: '化学胶黏剂会使纤维板结变硬且不可逆，纺织品禁止以胶代缝。',
  },
  {
    // 兜底规则：对象/病害组合未收录时
    category: '通用',
    disease: '其他病害',
    method: '先完成病害调查与影像记录，开展最小范围试验，经专项论证后再确定处置工艺。',
    recommendedMaterials: ['B72丙烯酸树脂'],
    forbiddenMaterials: [],
    standards: [STD.plan, STD.criteria],
    threshold: null,
    ruleNote: '当前对象类别与病害组合尚无内置判定规则，按最低干预与可逆性原则先行论证。',
  },
]

export interface AdviceInput {
  objectCategory: string
  disease: string
  proposedMaterial: string
  thresholdValue: number | null
}

export interface ConflictMark {
  /** material=材料建议与病害处置规则冲突；threshold=实测值未达阈值要求 */
  kind: 'material' | 'threshold'
  message: string
}

export interface AdviceResult {
  /** 是否命中了明确的判定规则（false 表示走了兜底规则） */
  matched: boolean
  category: string
  disease: string
  method: string
  recommendedMaterials: string[]
  /** 针对拟用材料的判读意见 */
  materialVerdict: string
  materialTip: string
  thresholdHint: string
  standards: string[]
  ruleNote: string
  conflicts: ConflictMark[]
  /** 汇总后的处理建议文本 */
  summary: string
}

export function findRule(category: string, disease: string): DiseaseRule | null {
  return (
    DISEASE_RULES.find((rule) => rule.category === category && rule.disease === disease) ?? null
  )
}

function formatThreshold(rule: DiseaseRule): string {
  const t = rule.threshold
  if (!t) return ''
  if (t.max != null) return `≤ ${t.max}${t.unit}`
  return `≥ ${t.min ?? ''}${t.unit}`
}

/** 按判定规则、阈值和标准生成一份处理建议 */
export function evaluateAdvice(input: AdviceInput): AdviceResult {
  const material = input.proposedMaterial.trim()
  const exact = findRule(input.objectCategory, input.disease)
  const rule: DiseaseRule = exact ?? DISEASE_RULES[DISEASE_RULES.length - 1]
  const conflicts: ConflictMark[] = []

  let materialVerdict = ''
  if (material) {
    if (rule.forbiddenMaterials.includes(material)) {
      materialVerdict = `拟用材料「${material}」被该病害处置规则明确禁用。`
      conflicts.push({
        kind: 'material',
        message: `材料建议与病害处置规则冲突：${materialVerdict}${rule.ruleNote}`,
      })
    } else if (rule.recommendedMaterials.includes(material)) {
      materialVerdict = `拟用材料「${material}」在规则推荐清单内，符合病害处置方向。`
    } else {
      materialVerdict = `拟用材料「${material}」不在规则推荐清单（${rule.recommendedMaterials.join(
        '、',
      )}）内，采用前应完成相容性与可逆性试验并留档。`
    }
  }

  let thresholdHint = ''
  if (rule.threshold) {
    const range = formatThreshold(rule)
    const label = rule.threshold.label
    const validValue = input.thresholdValue != null && Number.isFinite(input.thresholdValue)
    if (!validValue) {
      thresholdHint = `处置前须检测「${label}」，规则阈值为 ${range}。`
    } else if (
      (rule.threshold.max != null && (input.thresholdValue as number) > rule.threshold.max) ||
      (rule.threshold.min != null && (input.thresholdValue as number) < rule.threshold.min)
    ) {
      thresholdHint = `「${label}」实测 ${input.thresholdValue}${rule.threshold.unit}，不满足阈值 ${range}：${rule.threshold.overHint}`
      conflicts.push({ kind: 'threshold', message: thresholdHint })
    } else {
      thresholdHint = `「${label}」实测 ${input.thresholdValue}${rule.threshold.unit}，满足阈值 ${range}。`
    }
  }

  const summary = [
    `依据「${rule.category}·${rule.disease}」判定规则：${rule.method}`,
    `推荐材料：${rule.recommendedMaterials.join('、') || '见规则正文'}。`,
    materialVerdict ? materialVerdict : '本次未指定拟用材料，按规则推荐材料选用。',
    thresholdHint,
    `引用标准：${rule.standards.join('；')}。`,
  ]
    .filter(Boolean)
    .join('')

  return {
    matched: exact !== null,
    category: rule.category,
    disease: rule.disease,
    method: rule.method,
    recommendedMaterials: rule.recommendedMaterials,
    materialVerdict,
    materialTip: material ? MATERIAL_TIPS[material] ?? '' : '',
    thresholdHint,
    standards: rule.standards,
    ruleNote: rule.ruleNote,
    conflicts,
    summary,
  }
}

/** 会签方案中由实现者（修复实施人）对冲突作出的优先级裁定 */
export type ConflictPriority = 'rule' | 'material'

export function describePriorityDecision(
  advice: AdviceResult,
  decision: ConflictPriority,
  decidedBy: string,
): string {
  const hasMaterialConflict = advice.conflicts.some((item) => item.kind === 'material')
  if (!hasMaterialConflict) return ''
  const person = decidedBy.trim() || '实现者'
  if (decision === 'rule') {
    return `经实现者（修复实施人）${person}裁定：材料建议与病害处置规则冲突时，以病害处置规则为准——拟用材料不予采用，改用规则推荐材料。`
  }
  return `经实现者（修复实施人）${person}裁定：材料建议与病害处置规则冲突时，以拟用材料为准——在落实风险控制、完成小试与记录留痕的前提下保留该材料，偏离规则的责任由裁定人承担。`
}
