<template>
  <section class="page" data-module="conservation">
    <header class="page-head">
      <div>
        <h2>现场保护管理</h2>
        <p class="page-desc">维护保护处理记录，围绕处理编号、保护对象、病害类型、处理材料做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记保护处理记录</button>
        <button class="btn" type="button" @click="exportRows">导出现场保护清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无现场保护数据，可先登记保护处理记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条现场保护记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <section class="desk-block">
      <header class="desk-head">
        <div>
          <h3 class="desk-title">方案会签台</h3>
          <p class="desk-desc">
            按保护对象、病害类型和拟用材料生成处理建议，由现场负责人与修复人员分别会签；会签只新增方案，不改写上方原始处理记录。
          </p>
        </div>
        <button class="btn primary" type="button" @click="toggleCreate">新建会签方案</button>
      </header>

      <form v-if="showCreate" class="create-form" @submit.prevent="submitCreate">
        <label>
          <span>关联处理编号（可选）</span>
          <select v-model="createForm.关联处理编号">
            <option value="">不关联</option>
            <option v-for="code in recordCodes" :key="code" :value="code">{{ code }}</option>
          </select>
        </label>
        <label>
          <span>保护对象</span>
          <select v-model="createForm.保护对象">
            <option value="">请选择</option>
            <option v-for="item in objectOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          <span>病害类型</span>
          <select v-model="createForm.病害类型">
            <option value="">请选择</option>
            <option v-for="item in diseaseOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          <span>拟用材料</span>
          <select v-model="createForm.拟用材料">
            <option value="">请选择</option>
            <option v-for="item in materialOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <button class="btn primary" type="submit">生成建议并登记方案</button>
        <button class="btn ghost" type="button" @click="toggleCreate">取消</button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>方案编号</th>
            <th>关联处理编号</th>
            <th>保护对象</th>
            <th>病害类型</th>
            <th>拟用材料</th>
            <th>材料判定</th>
            <th>会签状态</th>
            <th>方案状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="plan in plans" :key="String(plan.id)">
            <td>{{ plan.方案编号 }}</td>
            <td>{{ plan.关联处理编号 }}</td>
            <td>{{ plan.保护对象 }}</td>
            <td>{{ plan.病害类型 }}</td>
            <td>{{ plan.拟用材料 }}</td>
            <td><span class="badge" :class="verdictClass(plan)">{{ plan.材料判定 }}</span></td>
            <td>{{ plan.会签状态 }}</td>
            <td>{{ plan.status }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="openSign(plan)">会签意见</button>
              <button
                v-for="action in planActions"
                :key="action"
                class="link"
                type="button"
                @click="advance(action, plan)"
              >
                {{ action }}
              </button>
            </td>
          </tr>
          <tr v-if="!plans.length">
            <td colspan="9" class="empty-state">暂无会签方案，可点击「新建会签方案」生成处理建议</td>
          </tr>
        </tbody>
      </table>

      <div v-if="activePlan" class="sign-panel">
        <h4 class="sign-title">
          会签详情：{{ activePlan.方案编号 }}（{{ activePlan.保护对象 }} · {{ activePlan.病害类型 }} · 拟用{{ activePlan.拟用材料 }}）
        </h4>
        <p class="advice-text"><strong>处理建议：</strong>{{ activePlan.处理建议 }}</p>
        <p class="advice-text"><strong>建议依据：</strong>{{ activePlan.建议依据 }}</p>
        <div class="opinion-grid">
          <div class="opinion-card">
            <h5>现场负责人</h5>
            <template v-if="canSign('leader')">
              <select v-model="leaderForm.decision">
                <option>采纳</option>
                <option>不采纳</option>
              </select>
              <textarea v-model="leaderForm.opinion" placeholder="填写采纳意见说明"></textarea>
              <button class="btn" type="button" @click="submitSign('leader')">提交负责人意见</button>
            </template>
            <p v-else class="opinion-done">
              {{ activePlan.负责人采纳 }}：{{ activePlan.负责人意见 }}
            </p>
          </div>
          <div class="opinion-card">
            <h5>修复人员</h5>
            <template v-if="canSign('restorer')">
              <select v-model="restorerForm.decision">
                <option>采纳</option>
                <option>不采纳</option>
              </select>
              <textarea v-model="restorerForm.opinion" placeholder="填写采纳意见说明"></textarea>
              <button class="btn" type="button" @click="submitSign('restorer')">提交修复人意见</button>
            </template>
            <p v-else class="opinion-done">
              {{ activePlan.修复人采纳 }}：{{ activePlan.修复人意见 }}
            </p>
          </div>
        </div>
        <p v-if="String(activePlan.会签状态) === '已会签'" class="sign-done">
          会签已完成，回写事项：{{ activePlan.回写编号 }}（出土遗物页可见，重复提交不会追加第二份）。
        </p>
      </div>

      <p v-if="deskMessage" :class="deskError ? 'error-text' : 'ok-text'">{{ deskMessage }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  advancePlan,
  createPlan,
  linkableRecordCodes,
  listPlans,
  submitOpinion,
} from '@/api/plan-service'
import type { SignRole } from '@/api/plan-service'
import {
  DISEASE_OPTIONS,
  MATERIAL_OPTIONS,
  OBJECT_OPTIONS,
  PLAN_ACTIONS,
} from '@/data/plan-rules'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('conservation')
const columns = ["处理编号", "保护对象", "病害类型", "处理材料", "处理方法", "处理日期", "操作人", "处理状态"]
const actions = ["开始处理", "完成处理", "标记观察"]
const statuses = ["待处理", "处理中", "已完成", "需观察", "已稳定"]
const stats = [{"label": "处理总数", "value": 0}, {"label": "已完成数", "value": 0}, {"label": "待处理数", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 方案会签台
const plans = ref<EntryRow[]>([])
const recordCodes = ref<string[]>([])
const showCreate = ref(false)
const createForm = ref({ 关联处理编号: '', 保护对象: '', 病害类型: '', 拟用材料: '' })
const activePlanId = ref<number | null>(null)
const leaderForm = ref({ decision: '采纳', opinion: '' })
const restorerForm = ref({ decision: '采纳', opinion: '' })
const deskMessage = ref('')
const deskError = ref(false)
const objectOptions = OBJECT_OPTIONS
const diseaseOptions = DISEASE_OPTIONS
const materialOptions = MATERIAL_OPTIONS
const planActions = Object.keys(PLAN_ACTIONS)

const activePlan = computed(
  () => plans.value.find((plan) => Number(plan.id) === activePlanId.value) ?? null,
)

function canSign(role: SignRole): boolean {
  const plan = activePlan.value
  if (!plan || String(plan.会签状态) === '已会签') {
    return false
  }
  const field = role === 'leader' ? '负责人采纳' : '修复人采纳'
  return String(plan[field]) === '未填写'
}

function verdictClass(plan: EntryRow): string {
  const verdict = String(plan.材料判定)
  if (verdict === '冲突') {
    return 'conflict'
  }
  if (verdict === '谨慎') {
    return 'warn'
  }
  return 'ok'
}

function notify(result: { ok: boolean; message: string }) {
  deskMessage.value = result.message
  deskError.value = !result.ok
}

function toggleCreate() {
  showCreate.value = !showCreate.value
}

function submitCreate() {
  const result = createPlan(createForm.value)
  notify(result)
  if (result.ok) {
    showCreate.value = false
    createForm.value = { 关联处理编号: '', 保护对象: '', 病害类型: '', 拟用材料: '' }
    reloadPlans()
  }
}

function openSign(plan: EntryRow) {
  activePlanId.value = Number(plan.id)
  leaderForm.value = { decision: '采纳', opinion: '' }
  restorerForm.value = { decision: '采纳', opinion: '' }
}

function submitSign(role: SignRole) {
  if (!activePlan.value) {
    return
  }
  const form = role === 'leader' ? leaderForm.value : restorerForm.value
  const result = submitOpinion(Number(activePlan.value.id), role, form.decision, form.opinion)
  notify(result)
  if (result.ok) {
    reloadPlans()
  }
}

function advance(action: string, plan: EntryRow) {
  const result = advancePlan(Number(plan.id), action)
  notify(result)
  if (result.ok) {
    reloadPlans()
  }
}

function reloadPlans() {
  plans.value = listPlans()
  recordCodes.value = linkableRecordCodes()
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '保护处理记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '现场保护列表读取失败'
  }
}

onMounted(() => {
  reload()
  reloadPlans()
})
</script>
