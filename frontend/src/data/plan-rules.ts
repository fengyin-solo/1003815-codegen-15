// 方案会签台的判定规则：病害处置规则、材料建议、阈值与标准集中在这里，页面和服务都不各自写一份。
//
// 优先级约定（需求允许由实现者确定）：材料建议与病害处置规则冲突时，以病害处置规则为准。
// 理由：病害处置规则是安全约束（禁用材料会造成二次损害），材料建议只是使用参考。

export type DiseaseRule = {
  disease: string
  method: string
  bannedMaterials: string[]
  threshold: string
  standard: string
}

export type MaterialRule = {
  material: string
  suitedObjects: string[]
  bannedObjects: string[]
  suggestion: string
}

export type Recommendation = {
  method: string
  verdict: '兼容' | '谨慎' | '冲突'
  conflict: boolean
  advice: string
  basis: string
}

export const PRIORITY_NOTE = '材料建议与病害处置规则冲突时以病害处置规则为准'

export const OBJECT_OPTIONS = [
  '陶质文物',
  '石质文物',
  '铁质文物',
  '铜质文物',
  '骨器',
  '彩绘陶',
  '漆木器',
  '纸质文物',
]

// 病害处置规则：每种病害给出处置方法、禁用材料、控制阈值与执行标准。
export const DISEASE_RULES: DiseaseRule[] = [
  {
    disease: '酥碱',
    method: '表面预加固后脱盐，再低浓度渗透加固',
    bannedMaterials: ['柠檬酸', '草酸', '含氯漂白剂'],
    threshold: '加固剂浓度≤3%，分次渗透',
    standard: 'WW/T 0007《石质文物保护修复方案编写规范》',
  },
  {
    disease: '裂隙',
    method: '清理裂隙后灌浆锚固',
    bannedMaterials: ['明胶', '桃胶'],
    threshold: '灌浆压力≤0.1MPa',
    standard: 'WW/T 0007《石质文物保护修复方案编写规范》',
  },
  {
    disease: '锈蚀',
    method: '机械除锈后缓蚀封护',
    bannedMaterials: ['含氯漂白剂'],
    threshold: '缓蚀剂浓度≤5%',
    standard: 'WW/T 0010《馆藏金属文物保护修复档案记录规范》',
  },
  {
    disease: '霉变',
    method: '隔离杀菌除霉并控制存放环境',
    bannedMaterials: ['含氯漂白剂'],
    threshold: '环境相对湿度≤65%',
    standard: 'GB/T 30238《可移动文物保护修复室建设规范》',
  },
  {
    disease: '剥落',
    method: '回软后回贴复位',
    bannedMaterials: ['环氧树脂'],
    threshold: '回贴压力均匀，低温定型',
    standard: 'WW/T 0007《石质文物保护修复方案编写规范》',
  },
  {
    disease: '粉化',
    method: '低浓度多次渗透加固',
    bannedMaterials: ['环氧树脂'],
    threshold: '加固剂浓度≤2%',
    standard: 'WW/T 0007《石质文物保护修复方案编写规范》',
  },
]

// 材料建议：每种材料给出适用对象、禁用对象与使用建议，优先级低于病害处置规则。
export const MATERIAL_RULES: MaterialRule[] = [
  {
    material: '丙烯酸乳液',
    suitedObjects: ['陶质文物', '石质文物', '骨器', '彩绘陶'],
    bannedObjects: [],
    suggestion: '浓度≤3%渗透加固，可逆性较好',
  },
  {
    material: '环氧树脂',
    suitedObjects: ['石质文物', '铁质文物', '铜质文物'],
    bannedObjects: ['彩绘陶', '纸质文物', '漆木器'],
    suggestion: '裂隙粘接强度高，固化后难以逆转',
  },
  {
    material: '柠檬酸',
    suitedObjects: ['铁质文物', '铜质文物'],
    bannedObjects: ['石质文物', '骨器'],
    suggestion: '络合除锈，用后需中和漂洗',
  },
  {
    material: '草酸',
    suitedObjects: ['铁质文物'],
    bannedObjects: ['石质文物', '骨器', '陶质文物'],
    suggestion: '除锈用，钙质对象禁用',
  },
  {
    material: '明胶',
    suitedObjects: ['彩绘陶', '纸质文物'],
    bannedObjects: [],
    suggestion: '回软贴护，浓度≤2%',
  },
  {
    material: '桃胶',
    suitedObjects: ['纸质文物', '彩绘陶'],
    bannedObjects: [],
    suggestion: '传统回软剂，注意防霉',
  },
  {
    material: '聚乙烯醇',
    suitedObjects: ['陶质文物'],
    bannedObjects: ['漆木器'],
    suggestion: '成膜封护，控制成膜厚度',
  },
  {
    material: '含氯漂白剂',
    suitedObjects: [],
    bannedObjects: [...OBJECT_OPTIONS],
    suggestion: '强氧化性，文物保护场合一般禁用',
  },
]

export const DISEASE_OPTIONS = DISEASE_RULES.map((rule) => rule.disease)
export const MATERIAL_OPTIONS = MATERIAL_RULES.map((rule) => rule.material)

// 方案状态只能沿这条链依次推进：待处理→处理中→已完成→需观察→已稳定。
export const PLAN_FLOW = ['待处理', '处理中', '已完成', '需观察', '已稳定']
export const PLAN_ACTIONS: Record<string, string> = {
  开始处理: '处理中',
  完成处理: '已完成',
  标记观察: '需观察',
  确认稳定: '已稳定',
}

// 按保护对象、病害类型、拟用材料生成处理建议：先查病害处置规则，再核材料建议。
export function buildRecommendation(object: string, disease: string, material: string): Recommendation {
  const diseaseRule = DISEASE_RULES.find((rule) => rule.disease === disease)
  const materialRule = MATERIAL_RULES.find((rule) => rule.material === material)
  const method = diseaseRule?.method ?? '现场评估后按最小干预原则处理'
  const threshold = diseaseRule?.threshold ?? '—'
  const standard = diseaseRule?.standard ?? '《文物保护修复通用准则》'

  const conflicts: string[] = []
  if (diseaseRule && diseaseRule.bannedMaterials.includes(material)) {
    conflicts.push(`病害处置规则禁用「${material}」`)
  }
  if (materialRule && materialRule.bannedObjects.includes(object)) {
    conflicts.push(`「${material}」的材料建议不适用于「${object}」`)
  }
  const conflict = conflicts.length > 0
  const unsure =
    !conflict &&
    (!materialRule ||
      (materialRule.suitedObjects.length > 0 && !materialRule.suitedObjects.includes(object)))
  const verdict: Recommendation['verdict'] = conflict ? '冲突' : unsure ? '谨慎' : '兼容'

  const head = `按病害处置规则应「${method}」（阈值：${threshold}）。`
  let advice: string
  if (conflict) {
    const alternative = MATERIAL_RULES.find(
      (rule) =>
        rule.material !== material &&
        rule.suitedObjects.includes(object) &&
        !rule.bannedObjects.includes(object) &&
        !(diseaseRule?.bannedMaterials ?? []).includes(rule.material),
    )
    advice = `${head}拟用材料「${material}」与病害处置规则冲突（${conflicts.join('；')}），${PRIORITY_NOTE}，建议改用「${alternative?.material ?? '兼容材料'}」。`
  } else if (unsure) {
    advice = `${head}拟用材料「${material}」未登记对「${object}」的适用建议，须小面积试用确认后再推广。`
  } else {
    advice = `${head}拟用材料「${material}」适用于「${object}」，与病害处置规则不冲突，可按材料建议使用：${materialRule?.suggestion ?? ''}。`
  }
  const basis = `病害处置规则：${disease}→${method}；阈值：${threshold}；标准：${standard}；材料建议：${materialRule?.suggestion ?? '未登记'}；优先级：${PRIORITY_NOTE}`
  return { method, verdict, conflict, advice, basis }
}
