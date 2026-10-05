/** 冒烟测试：在 Node 中模拟 localStorage，验证会签台核心规则 */
const store: Record<string, string> = {}
;(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => delete store[k],
  },
}

async function main() {
  const svc: any = await import('./src/api/conservation-service.ts')
  const rules: any = await import('./src/data/conservation-rules.ts')
  const cstore: any = await import('./src/data/conservation-store.ts')
  let pass = 0
  let fail = 0
  function check(name: string, cond: boolean, extra = '') {
    if (cond) {
      pass++
      console.log(`  ✓ ${name}`)
    } else {
      fail++
      console.log(`  ✗ ${name} ${extra}`)
    }
  }

  // 1. 规则引擎：青铜粉状锈 + 502 → 材料冲突
  const conflictAdvice = rules.evaluateAdvice({
    objectCategory: '青铜器',
    disease: '粉状锈（青铜病）',
    proposedMaterial: '502瞬干胶',
    thresholdValue: null,
  })
  check('粉状锈+502 判定为材料冲突', conflictAdvice.conflicts.some((c: any) => c.kind === 'material'))
  check('建议给出引用标准', conflictAdvice.standards.length >= 2)

  // 阈值超标：壁画盐析 0.5% > 0.3%
  const over = rules.evaluateAdvice({
    objectCategory: '壁画',
    disease: '地仗盐析',
    proposedMaterial: '去离子水',
    thresholdValue: 0.5,
  })
  check('阈值超标被标红', over.conflicts.some((c: any) => c.kind === 'threshold'))
  const within = rules.evaluateAdvice({
    objectCategory: '壁画',
    disease: '地仗盐析',
    proposedMaterial: '去离子水',
    thresholdValue: 0.2,
  })
  check('阈值达标无冲突', within.conflicts.length === 0)
  check('未知组合走兜底规则', rules.evaluateAdvice({ objectCategory: '瓷器', disease: '不存在病害', proposedMaterial: '', thresholdValue: null }).matched === false)

  // 2. 建方案（含冲突，实现者裁定规则优先）
  let r = svc.createPlan({
    sourceRecordNo: 'CONS-0001',
    objectName: '测试陶罐',
    objectCategory: '陶器',
    disease: '残断裂',
    proposedMaterial: '502瞬干胶',
    thresholdValue: null,
    artifactNo: 'ARTI-0003',
    severity: '一般',
    createdBy: '实施人甲',
    conflictDecision: 'rule',
    conflictDecisionBy: '实施人甲',
    conflictDecisionNote: '改用B72',
  })
  check('冲突方案创建成功', r.ok, r.message)
  const planId = r.data.id
  check('方案固化冲突标记', r.data.hasMaterialConflict === true)
  check('方案含实现者优先级裁定文本', svc.conflictDecisionText(r.data).includes('以病害处置规则为准'))

  // 引用不存在原始记录应拒绝
  r = svc.createPlan({
    sourceRecordNo: 'CONS-9999', objectName: 'x', objectCategory: '陶器', disease: '残断裂',
    proposedMaterial: '', thresholdValue: null, artifactNo: '', severity: '一般', createdBy: 'a',
    conflictDecision: 'rule', conflictDecisionBy: '', conflictDecisionNote: '',
  })
  check('引用不存在的原始记录被拒绝', !r.ok)

  // 3. 未会签不得推进到处理中
  r = svc.advancePlan(planId, '处理中')
  check('未完成会签推进被拒绝', !r.ok)

  // 4. 双方各自会签
  r = svc.submitOpinion(planId, 'manager', { name: '负责人乙', choice: '采纳', comment: '同意' })
  check('负责人会签成功', r.ok, r.message)
  r = svc.submitOpinion(planId, 'manager', { name: '负责人乙', choice: '采纳', comment: '再交一次' })
  check('负责人重复会签被拒绝（幂等）', !r.ok)
  r = svc.submitOpinion(planId, 'restorer', { name: '修复丙', choice: '采纳', comment: '可行' })
  check('修复人员会签成功且会签完成', r.ok && r.message.includes('回写'), r.message)

  // 回写事项只生成一份
  const wb1 = cstore.listWritebacks().filter((w: any) => w.planId === planId)
  r = svc.submitOpinion(planId, 'restorer', { name: '修复丙', choice: '采纳', comment: '重复' })
  check('重复提交不追加第二份回写', !r.ok && cstore.listWritebacks().filter((w: any) => w.planId === planId).length === 1)
  check('回写事项按器物编号可在遗物页查到', svc.writebacksForArtifact('ARTI-0003').length === 1)

  // 5. 顺序推进：处理中 → 已完成
  check('待处理→处理中 放行', svc.advancePlan(planId, '处理中').ok)
  check('处理中重复推进拒绝', !svc.advancePlan(planId, '处理中').ok)
  check('处理中→已完成 放行', svc.advancePlan(planId, '已完成').ok)
  // 跳过观察直接稳定化
  r = svc.advancePlan(planId, '已稳定')
  check('已完成跳过观察直接稳定化被拒绝', !r.ok && r.message.includes('直接稳定化'), r.message)
  // 跨级跳跃
  check('拒绝信息明确要求先观察', r.message.includes('需观察'))
  check('已完成→需观察 放行', svc.advancePlan(planId, '需观察').ok)
  check('需观察→已稳定 放行', svc.advancePlan(planId, '已稳定').ok)
  check('终态后回退被拒绝', !svc.advancePlan(planId, '已完成').ok)

  // 回写事项最终状态同步为已稳定，仍只有一条
  const wb = cstore.listWritebacks().find((w: any) => w.planId === planId)
  check('回写最终状态同步为已稳定', wb.finalStatus === '已稳定')
  check('全程只有一份回写', cstore.listWritebacks().filter((w: any) => w.planId === planId).length === 1)

  // 6. 会签未通过（不予采纳）不能进入处理，且不生成回写
  r = svc.createPlan({
    sourceRecordNo: '', objectName: '测试瓷碗', objectCategory: '瓷器', disease: '开片冲线',
    proposedMaterial: 'B72丙烯酸树脂', thresholdValue: null, artifactNo: '', severity: '轻微', createdBy: '实施人甲',
    conflictDecision: 'rule', conflictDecisionBy: '', conflictDecisionNote: '',
  })
  const id2 = r.data.id
  svc.submitOpinion(id2, 'manager', { name: '负责人乙', choice: '不予采纳', comment: '不同意' })
  svc.submitOpinion(id2, 'restorer', { name: '修复丙', choice: '采纳', comment: '可行' })
  check('会签未通过不能进入处理', !svc.advancePlan(id2, '处理中').ok)
  check('未通过不生成回写', cstore.listWritebacks().filter((w: any) => w.planId === id2).length === 0)

  // 7. 原始保护记录未被改写
  const { listRows } = await import('./src/data/local-store.ts')
  const original = listRows('conservation').find((x: any) => x['处理编号'] === 'CONS-0001')
  check('原始处理记录保持初始状态未被方案改写', String(original.status) === '待处理')

  // 8. 回写确认幂等
  r = svc.acknowledgeWriteback(wb.key)
  check('回写确认成功', r.ok)
  r = svc.acknowledgeWriteback(wb.key)
  check('回写重复确认被拒绝', !r.ok)

  console.log(`\n结果：${pass} 通过，${fail} 失败`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
