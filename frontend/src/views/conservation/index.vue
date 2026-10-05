<template>
  <section class="page" data-module="conservation">
    <header class="page-head">
      <div>
        <h2>现场保护管理</h2>
        <p class="page-desc">
          原始保护处理记录只做登记留档；处理建议、双方采纳意见与状态推进统一走「方案会签台」，不会改写原始记录。
        </p>
      </div>
    </header>

    <div class="tab-bar">
      <button
        class="tab-item"
        :class="{ active: tab === 'desk' }"
        type="button"
        @click="tab = 'desk'"
      >
        方案会签台
      </button>
      <button
        class="tab-item"
        :class="{ active: tab === 'records' }"
        type="button"
        @click="tab = 'records'"
      >
        原始处理记录（只读）
      </button>
    </div>

    <!-- 方案会签台 -->
    <div v-if="tab === 'desk'">
      <div class="stat-row">
        <article v-for="item in planStats" :key="item.label" class="stat-card">
          <span class="stat-label">{{ item.label }}</span>
          <strong class="stat-value">{{ item.value }}</strong>
        </article>
      </div>

      <div class="desk-toolbar">
        <form class="filter-bar inline" @submit.prevent="reloadPlans">
          <label class="filter-item">
            <span>关键字</span>
            <input v-model="planFilter.keyword" placeholder="方案号/对象/病害/遗物编号" />
          </label>
          <label class="filter-item">
            <span>方案状态</span>
            <select v-model="planFilter.status">
              <option value="">全部状态</option>
              <option v-for="status in planStatuses" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <button class="btn" type="submit">查询</button>
        </form>
        <button class="btn primary" type="button" @click="formOpen = true">新增会签方案</button>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>方案编号</th>
            <th>保护对象</th>
            <th>病害类型</th>
            <th>拟用材料</th>
            <th>引用原始记录</th>
            <th>会签进度</th>
            <th>冲突裁定</th>
            <th>回写事项</th>
            <th>当前状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="plan in plans"
            :key="plan.id"
            :class="{ selected: selectedPlan?.id === plan.id }"
          >
            <td>{{ plan.planNo }}</td>
            <td>{{ plan.objectName }}</td>
            <td>{{ plan.disease }}</td>
            <td>{{ plan.proposedMaterial || '按规则推荐' }}</td>
            <td>{{ plan.sourceRecordNo || '—' }}</td>
            <td>{{ signSummary(plan) }}</td>
            <td>
              <span v-if="plan.hasMaterialConflict" class="tag warn">
                {{ plan.conflictDecision === 'rule' ? '规则优先' : '材料优先' }}
              </span>
              <span v-else class="muted">无冲突</span>
            </td>
            <td>
              <span v-if="plan.writebackKey" class="tag ok">已生成</span>
              <span v-else class="muted">待会签</span>
            </td>
            <td>{{ plan.status }}</td>
            <td>
              <button class="link" type="button" @click="openPlan(plan)">
                {{ selectedPlan?.id === plan.id ? '收起' : '会签/推进' }}
              </button>
            </td>
          </tr>
          <tr v-if="!plans.length">
            <td colspan="10" class="empty-state">暂无会签方案，点击右上角「新增会签方案」</td>
          </tr>
        </tbody>
      </table>

      <PlanDetailPanel
        :plan="selectedPlan"
        @close="selectedPlan = null"
        @changed="reloadPlans"
      />
    </div>

    <!-- 原始处理记录：只读引用 -->
    <div v-else>
      <p class="readonly-banner">
        以下为原始保护处理记录，会签台仅引用其编号作为依据，本页不提供任何修改入口，原始记录不会被方案流程改写。
      </p>
      <form class="filter-bar" @submit.prevent="reloadRecords">
        <label v-for="field in recordFilterFields" :key="field" class="filter-item">
          <span>{{ field }}</span>
          <input v-model="recordFilters[field]" :placeholder="`按${field}检索`" />
        </label>
        <button class="btn" type="submit">查询</button>
        <button class="btn ghost" type="button" @click="resetRecordFilters">重置条件</button>
      </form>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in recordColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in records" :key="String(row.id)">
            <td v-for="column in recordColumns" :key="column">{{ row[column] ?? '—' }}</td>
            <td>{{ row.status }}</td>
          </tr>
          <tr v-if="!records.length">
            <td :colspan="recordColumns.length + 1" class="empty-state">暂无现场保护原始记录</td>
          </tr>
        </tbody>
      </table>
      <footer class="page-foot">
        <span>共 {{ records.length }} 条原始处理记录（只读）</span>
      </footer>
    </div>

    <PlanFormPanel :open="formOpen" @close="formOpen = false" @created="onCreated" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  queryPlans,
  sourceRecords,
  signStatus,
  type ConservationPlan,
} from '@/api/conservation-service'
import { PLAN_STATUSES } from '@/data/conservation-store'
import PlanDetailPanel from './components/PlanDetailPanel.vue'
import PlanFormPanel from './components/PlanFormPanel.vue'

const tab = ref<'desk' | 'records'>('desk')
const formOpen = ref(false)
const plans = ref<ConservationPlan[]>([])
const selectedPlan = ref<ConservationPlan | null>(null)

const planStatuses = [...PLAN_STATUSES]
const planFilter = reactive({ keyword: '', status: '' })

const recordColumns = ['处理编号', '保护对象', '病害类型', '处理材料', '处理方法', '处理日期', '操作人', '处理状态']
const recordFilterFields = recordColumns.slice(0, 3)
const recordFilters = ref<Record<string, string>>({})
const records = ref(sourceRecords())

const planStats = computed(() => [
  { label: '会签方案总数', value: plans.value.length },
  { label: '待处理', value: plans.value.filter((p) => p.status === '待处理').length },
  { label: '处理中', value: plans.value.filter((p) => p.status === '处理中').length },
  { label: '需观察', value: plans.value.filter((p) => p.status === '需观察').length },
  { label: '已稳定', value: plans.value.filter((p) => p.status === '已稳定').length },
])

function signSummary(plan: ConservationPlan): string {
  const s = signStatus(plan)
  const manager = s.managerSigned ? '负责人已签' : '负责人待签'
  const restorer = s.restorerSigned ? '修复已签' : '修复待签'
  return `${manager} / ${restorer}`
}

function reloadPlans() {
  plans.value = queryPlans({ keyword: planFilter.keyword, status: planFilter.status })
  if (selectedPlan.value) {
    selectedPlan.value = plans.value.find((p) => p.id === selectedPlan.value?.id) ?? null
  }
}

function openPlan(plan: ConservationPlan) {
  selectedPlan.value = selectedPlan.value?.id === plan.id ? null : plan
}

function reloadRecords() {
  records.value = sourceRecords(recordFilters.value)
}

function resetRecordFilters() {
  recordFilters.value = {}
  reloadRecords()
}

function onCreated() {
  formOpen.value = false
  planFilter.keyword = ''
  planFilter.status = ''
  reloadPlans()
}

onMounted(reloadPlans)
</script>
