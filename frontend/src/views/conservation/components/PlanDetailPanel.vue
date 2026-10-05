<template>
  <div v-if="plan" class="detail-drawer">
    <header class="detail-head">
      <div>
        <h3>{{ plan.planNo }} · {{ plan.objectName }}</h3>
        <p class="muted">
          引用原始处理记录：{{ plan.sourceRecordNo || '（未关联）' }} ｜ 关联遗物编号：{{
            plan.artifactNo || '（未关联）'
          }}
        </p>
      </div>
      <button class="link" type="button" @click="emit('close')">收起详情</button>
    </header>

    <div class="detail-grid">
      <article class="detail-card">
        <h4>基本信息</h4>
        <dl class="kv">
          <dt>对象类别 / 病害</dt>
          <dd>{{ plan.objectCategory }} · {{ plan.disease }}（{{ plan.severity }}）</dd>
          <dt>拟用材料</dt>
          <dd>{{ plan.proposedMaterial || '未指定，按规则推荐' }}</dd>
          <dt>阈值实测</dt>
          <dd>{{ plan.thresholdValue == null ? '未录入' : plan.thresholdValue }}</dd>
          <dt>实现者</dt>
          <dd>{{ plan.createdBy }}（{{ plan.createdAt }} 创建）</dd>
          <dt>当前状态</dt>
          <dd><strong>{{ plan.status }}</strong></dd>
        </dl>
      </article>

      <article class="detail-card">
        <h4>规则引擎处理建议（建方案时固化快照）</h4>
        <p class="advice-summary">{{ plan.advice.summary }}</p>
        <p v-if="plan.advice.thresholdHint" class="advice-line">阈值判读：{{ plan.advice.thresholdHint }}</p>
        <p v-if="plan.advice.materialVerdict" class="advice-line">材料判读：{{ plan.advice.materialVerdict }}</p>
        <p class="advice-line muted">规则说明：{{ plan.advice.ruleNote }}</p>
        <p class="advice-line muted">引用标准：{{ plan.advice.standards.join('；') }}</p>

        <div v-if="plan.hasMaterialConflict" class="conflict-box">
          <p class="conflict-title">材料建议与病害处置规则冲突——优先级已由实现者裁定</p>
          <p class="advice-line">{{ decisionText }}</p>
          <p class="advice-line">裁定人：{{ plan.conflictDecisionBy || plan.createdBy }}</p>
          <p v-if="plan.conflictDecisionNote" class="advice-line">裁定说明：{{ plan.conflictDecisionNote }}</p>
        </div>
      </article>
    </div>

    <article class="detail-card">
      <h4>会签意见（现场负责人与修复人员分别填写，各自仅可提交一次）</h4>
      <div class="sign-grid">
        <section class="sign-col" :class="{ done: plan.managerOpinion }">
          <h5>现场负责人</h5>
          <template v-if="plan.managerOpinion">
            <p>结论：<strong>{{ plan.managerOpinion.choice }}</strong></p>
            <p class="muted">署名：{{ plan.managerOpinion.name }}</p>
            <p>{{ plan.managerOpinion.comment }}</p>
            <p class="muted">提交于 {{ plan.managerOpinion.signedAt }}（不可重复填写）</p>
          </template>
          <template v-else>
            <label class="form-item">
              <span>署名</span>
              <input v-model="manager.name" placeholder="现场负责人姓名" />
            </label>
            <label class="form-item">
              <span>采纳意见</span>
              <select v-model="manager.choice">
                <option value="采纳">采纳</option>
                <option value="部分采纳">部分采纳</option>
                <option value="不予采纳">不予采纳</option>
              </select>
            </label>
            <label class="form-item">
              <span>意见说明</span>
              <textarea v-model="manager.comment" rows="3" placeholder="对处理建议与冲突裁定的采纳意见"></textarea>
            </label>
            <button class="btn primary" type="button" @click="sign('manager')">提交现场负责人意见</button>
          </template>
        </section>

        <section class="sign-col" :class="{ done: plan.restorerOpinion }">
          <h5>修复人员</h5>
          <template v-if="plan.restorerOpinion">
            <p>结论：<strong>{{ plan.restorerOpinion.choice }}</strong></p>
            <p class="muted">署名：{{ plan.restorerOpinion.name }}</p>
            <p>{{ plan.restorerOpinion.comment }}</p>
            <p class="muted">提交于 {{ plan.restorerOpinion.signedAt }}（不可重复填写）</p>
          </template>
          <template v-else>
            <label class="form-item">
              <span>署名</span>
              <input v-model="restorer.name" placeholder="修复人员姓名" />
            </label>
            <label class="form-item">
              <span>采纳意见</span>
              <select v-model="restorer.choice">
                <option value="采纳">采纳</option>
                <option value="部分采纳">部分采纳</option>
                <option value="不予采纳">不予采纳</option>
              </select>
            </label>
            <label class="form-item">
              <span>意见说明</span>
              <textarea v-model="restorer.comment" rows="3" placeholder="对处理建议与施工可行性的采纳意见"></textarea>
            </label>
            <button class="btn primary" type="button" @click="sign('restorer')">提交修复人员意见</button>
          </template>
        </section>
      </div>
      <p class="sign-result">
        会签状态：
        <em class="tag">{{ plan.managerOpinion ? '现场负责人已签' : '现场负责人待签' }}</em>
        <em class="tag">{{ plan.restorerOpinion ? '修复人员已签' : '修复人员待签' }}</em>
        <em v-if="signState.completed" class="tag" :class="signState.passed ? 'ok' : 'bad'">
          会签结论：{{ signState.passed ? '通过' : '未通过' }}
        </em>
        <em v-if="plan.writebackKey" class="tag ok">保护状态回写事项已生成（不重复追加）</em>
      </p>
    </article>

    <article class="detail-card">
      <h4>状态推进（只能沿 待处理→处理中→已完成→需观察→已稳定 依次前进）</h4>
      <div class="flow-bar">
        <template v-for="(step, index) in statusChain" :key="step">
          <span class="flow-step" :class="{ active: step === plan.status, passed: isPassed(index) }">{{ step }}</span>
          <span v-if="index < statusChain.length - 1" class="flow-arrow">→</span>
        </template>
      </div>
      <div class="advance-row">
        <button v-if="nextStatus" class="btn primary" type="button" @click="advance(nextStatus)">
          推进到「{{ nextStatus }}」
        </button>
        <p v-else class="muted">方案已到终态「已稳定」。</p>
        <label class="form-item inline">
          <span>任意跳转（用于验证跳级拒绝）</span>
          <select v-model="jumpTarget">
            <option value="" disabled>选择目标状态</option>
            <option v-for="step in statusChain" :key="step" :value="step">{{ step }}</option>
          </select>
        </label>
        <button class="btn" type="button" :disabled="!jumpTarget" @click="advance(jumpTarget as PlanStatus)">
          尝试跳转
        </button>
      </div>
      <p v-if="plan.status === '已完成'" class="muted warn">
        提示：「已完成」必须先进入「需观察」，跳过观察直接稳定化会被拒绝。
      </p>
    </article>

    <article class="detail-card">
      <h4>处理轨迹</h4>
      <ul class="history-list">
        <li v-for="(item, index) in plan.history" :key="index">
          <span class="muted">{{ item.at }}</span> {{ item.event }}
        </li>
      </ul>
    </article>

    <p v-if="message" class="error-text">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import {
  advancePlan,
  conflictDecisionText,
  signStatus,
  submitOpinion,
  type ConservationPlan,
} from '@/api/conservation-service'
import { PLAN_STATUSES, type PlanStatus } from '@/data/conservation-store'

const props = defineProps<{ plan: ConservationPlan | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()

const statusChain = [...PLAN_STATUSES]
const message = ref('')
const jumpTarget = ref<PlanStatus | ''>('')

const manager = reactive({ name: '', choice: '采纳' as '采纳', comment: '' })
const restorer = reactive({ name: '', choice: '采纳' as '采纳', comment: '' })

const plan = computed(() => props.plan)
const signState = computed(() =>
  plan.value
    ? signStatus(plan.value)
    : { managerSigned: false, restorerSigned: false, completed: false, passed: false },
)
const decisionText = computed(() => (plan.value ? conflictDecisionText(plan.value) : ''))

const nextStatus = computed<PlanStatus | null>(() => {
  if (!plan.value) return null
  const index = statusChain.indexOf(plan.value.status)
  return index >= 0 && index < statusChain.length - 1 ? statusChain[index + 1] : null
})

watch(
  () => props.plan?.id,
  () => {
    message.value = ''
    jumpTarget.value = ''
  },
)

function isPassed(index: number): boolean {
  if (!plan.value) return false
  return statusChain.indexOf(plan.value.status) > index
}

function sign(role: 'manager' | 'restorer') {
  if (!plan.value) return
  message.value = ''
  const form = role === 'manager' ? manager : restorer
  const result = submitOpinion(plan.value.id, role, { ...form })
  if (!result.ok) {
    message.value = result.message
    return
  }
  form.name = ''
  form.comment = ''
  emit('changed')
}

function advance(target: PlanStatus) {
  if (!plan.value) return
  message.value = ''
  const result = advancePlan(plan.value.id, target)
  jumpTarget.value = ''
  if (!result.ok) {
    message.value = result.message
    return
  }
  emit('changed')
}
</script>
