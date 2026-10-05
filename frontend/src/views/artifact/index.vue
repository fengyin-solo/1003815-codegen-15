<template>
  <section class="page" data-module="artifact">
    <header class="page-head">
      <div>
        <h2>出土遗物管理</h2>
        <p class="page-desc">维护出土遗物，围绕器物编号、出土探方、出土层位、器物质地做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记出土遗物</button>
        <button class="btn" type="button" @click="exportRows">导出出土遗物清单</button>
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
          <td :colspan="columns.length + 2" class="empty-state">暂无出土遗物数据，可先登记出土遗物</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条出土遗物记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <section class="writeback-block">
      <header class="block-head">
        <div>
          <h3>保护状态回写事项</h3>
          <p class="page-desc">
            来自现场保护「方案会签台」：会签方案通过后，按器物编号跨业务面回写保护状态；同一方案重复提交不会追加第二份。
          </p>
        </div>
        <button class="btn" type="button" @click="reloadWritebacks">刷新回写事项</button>
      </header>

      <h4 class="sub-head">本页遗物相关（按器物编号匹配）</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th>回写事项</th>
            <th>器物编号</th>
            <th>保护对象 / 病害</th>
            <th>回写内容</th>
            <th>最终保护状态</th>
            <th>回写状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in matchedWritebacks" :key="item.key">
            <td>{{ item.planNo }}</td>
            <td>{{ item.artifactNo }}</td>
            <td>{{ item.objectName }} / {{ item.disease }}</td>
            <td class="content-cell">{{ item.content }}</td>
            <td>{{ item.finalStatus }}</td>
            <td>
              <span class="tag" :class="item.status === '已回写' ? 'ok' : 'warn'">{{ item.status }}</span>
            </td>
            <td>
              <button
                v-if="item.status === '待回写'"
                class="link"
                type="button"
                @click="acknowledge(item.key)"
              >
                确认回写档案
              </button>
              <span v-else class="muted">已同步</span>
            </td>
          </tr>
          <tr v-if="!matchedWritebacks.length">
            <td colspan="7" class="empty-state">暂无按器物编号匹配到本页遗物的回写事项</td>
          </tr>
        </tbody>
      </table>

      <h4 class="sub-head">未匹配到遗物编号的回写事项</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th>回写事项</th>
            <th>器物编号</th>
            <th>保护对象 / 病害</th>
            <th>回写内容</th>
            <th>最终保护状态</th>
            <th>回写状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in unmatchedItems" :key="item.key">
            <td>{{ item.planNo }}</td>
            <td>{{ item.artifactNo || '（方案未关联遗物编号）' }}</td>
            <td>{{ item.objectName }} / {{ item.disease }}</td>
            <td class="content-cell">{{ item.content }}</td>
            <td>{{ item.finalStatus }}</td>
            <td>
              <span class="tag" :class="item.status === '已回写' ? 'ok' : 'warn'">{{ item.status }}</span>
            </td>
          </tr>
          <tr v-if="!unmatchedItems.length">
            <td colspan="6" class="empty-state">没有未匹配的回写事项</td>
          </tr>
        </tbody>
      </table>
      <p v-if="writebackMessage" class="error-text">{{ writebackMessage }}</p>
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
  acknowledgeWriteback,
  unmatchedWritebacks,
  writebacksForArtifact,
  type ConservationWriteback,
} from '@/api/conservation-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('artifact')
const columns = ["器物编号", "出土探方", "出土层位", "器物质地", "器物类型", "完残程度", "登记人", "登记状态"]
const actions = ["完成清洗", "分配编号", "办理入库"]
const statuses = ["已采集", "已清洗", "已编号", "已入库", "借出展示"]
const stats = [{"label": "遗物总数", "value": 0}, {"label": "已入库数", "value": 0}, {"label": "待清洗数", "value": 0}]

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

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '出土遗物登记入口尚未接入审批流'
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
    errorMessage.value = error instanceof Error ? error.message : '出土遗物列表读取失败'
  }
}

const matchedWritebacks = ref<ConservationWriteback[]>([])
const unmatchedItems = ref<ConservationWriteback[]>([])
const writebackMessage = ref('')

function reloadWritebacks() {
  writebackMessage.value = ''
  const nos = new Set(rows.value.map((row) => String(row['器物编号'] ?? '').trim()))
  matchedWritebacks.value = [...nos].flatMap((no) => writebacksForArtifact(no))
  unmatchedItems.value = unmatchedWritebacks()
}

function acknowledge(key: string) {
  writebackMessage.value = ''
  const result = acknowledgeWriteback(key)
  if (!result.ok) {
    writebackMessage.value = result.message
    return
  }
  reloadWritebacks()
}

onMounted(() => {
  reload()
  reloadWritebacks()
})
</script>
