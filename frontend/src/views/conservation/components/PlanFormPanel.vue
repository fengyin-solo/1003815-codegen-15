<template>
  <div v-if="open" class="modal-mask" @click.self="close">
    <section class="modal wide">
      <header class="modal-head">
        <h3>新增保护处理会签方案</h3>
        <button class="link" type="button" @click="close">关闭</button>
      </header>

      <div class="form-grid">
        <label class="form-item span-2">
          <span>引用原始处理记录编号（只读引用，不改写原记录）</span>
          <input v-model="form.sourceRecordNo" list="conservation-record-nos" placeholder="如 CONS-0001，可留空" />
          <datalist id="conservation-record-nos">
            <option v-for="row in records" :key="String(row.id)" :value="String(row['处理编号'])"></option>
          </datalist>
        </label>

        <label class="form-item">
          <span>保护对象名称 *</span>
          <input v-model="form.objectName" placeholder="如 青铜鼎残件" />
        </label>
        <label class="form-item">
          <span>严重程度</span>
          <select v-model="form.severity">
            <option v-for="item in severityOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>

        <label class="form-item">
          <span>保护对象类别 *</span>
          <select v-model="form.objectCategory" @change="onCategoryChange">
            <option value="" disabled>请选择类别</option>
            <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="form-item">
          <span>病害类型 *</span>
          <select v-model="form.disease">
            <option value="" disabled>请选择病害</option>
            <option v-for="item in diseaseOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>

        <label class="form-item">
          <span>拟用材料</span>
          <select v-model="form.proposedMaterial">
            <option value="">不指定（按规则推荐）</option>
            <option v-for="item in materialOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="form-item">
          <span>阈值实测值（无阈值要求时留空）</span>
          <input v-model.number="form.thresholdValue" type="number" step="0.01" placeholder="按规则阈值项录入" />
        </label>

        <label class="form-item span-2">
          <span>关联出土遗物器物编号（会签完成后向该遗物页回写保护状态）</span>
          <input v-model="form.artifactNo" list="artifact-nos" placeholder="如 ARTI-0001，可留空" />
          <datalist id="artifact-nos">
            <option v-for="row in artifactRows" :key="String(row.id)" :value="String(row['器物编号'])"></option>
          </datalist>
        </label>

        <label class="form-item">
          <span>实现者（修复实施人）署名 *</span>
          <input v-model="form.createdBy" placeholder="冲突时由其裁定优先级" />
        </label>
      </div>

      <div v-if="advice" class="advice-box">
        <h4>规则引擎处理建议 <em class="tag">{{ advice.matched ? '命中判定规则' : '兜底规则' }}</em></h4>
        <p class="advice-summary">{{ advice.summary }}</p>
        <p v-if="advice.thresholdHint" class="advice-line">阈值判读：{{ advice.thresholdHint }}</p>
        <p v-if="advice.materialVerdict" class="advice-line">材料判读：{{ advice.materialVerdict }}</p>
        <p v-if="advice.materialTip" class="advice-line muted">材料侧提示：{{ advice.materialTip }}</p>
        <p class="advice-line muted">规则说明：{{ advice.ruleNote }}</p>

        <div v-if="hasMaterialConflict" class="conflict-box">
          <p class="conflict-title">检测到材料建议与病害处置规则冲突，须由实现者确定优先级：</p>
          <label class="radio-item">
            <input v-model="form.conflictDecision" type="radio" value="rule" />
            以病害处置规则为准（拟用材料不予采用，改用规则推荐材料）
          </label>
          <label class="radio-item">
            <input v-model="form.conflictDecision" type="radio" value="material" />
            以拟用材料为准（落实风险控制、完成小试与留痕，偏离责任由裁定人承担）
          </label>
          <label class="form-item">
            <span>冲突优先级裁定人（默认取实现者署名）</span>
            <input v-model="form.conflictDecisionBy" placeholder="修复实施人姓名" />
          </label>
          <label class="form-item">
            <span>裁定说明</span>
            <textarea v-model="form.conflictDecisionNote" rows="2" placeholder="记录偏离理由与控制措施"></textarea>
          </label>
        </div>
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      <footer class="modal-foot">
        <button class="btn" type="button" @click="preview">生成/刷新处理建议</button>
        <button class="btn primary" type="button" @click="submit">提交会签方案</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import {
  createPlan,
  previewAdvice,
  sourceRecords,
} from '@/api/conservation-service'
import {
  DISEASE_OPTIONS,
  MATERIAL_OPTIONS,
  OBJECT_CATEGORIES,
  SEVERITY_OPTIONS,
  type AdviceResult,
  type ConflictPriority,
} from '@/data/conservation-rules'
import { listRows } from '@/data/local-store'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'created'): void }>()

const records = sourceRecords()
const artifactRows = listRows('artifact')
const categories = [...OBJECT_CATEGORIES]
const materialOptions = MATERIAL_OPTIONS
const severityOptions = SEVERITY_OPTIONS

interface PlanFormState {
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

const emptyForm = (): PlanFormState => ({
  sourceRecordNo: '',
  objectName: '',
  objectCategory: '',
  disease: '',
  proposedMaterial: '',
  thresholdValue: null,
  artifactNo: '',
  severity: '一般',
  createdBy: '',
  conflictDecision: 'rule',
  conflictDecisionBy: '',
  conflictDecisionNote: '',
})

const form = reactive<PlanFormState>(emptyForm())
const advice = ref<AdviceResult | null>(null)
const errorMessage = ref('')

const diseaseOptions = computed(() => DISEASE_OPTIONS[form.objectCategory] ?? [])
const hasMaterialConflict = computed(
  () => advice.value?.conflicts.some((item) => item.kind === 'material') ?? false,
)

watch(
  () => props.open,
  (open) => {
    if (open) {
      Object.assign(form, emptyForm())
      advice.value = null
      errorMessage.value = ''
    }
  },
)

function onCategoryChange() {
  const options = DISEASE_OPTIONS[form.objectCategory] ?? []
  if (!options.includes(form.disease)) {
    form.disease = ''
  }
}

function preview() {
  errorMessage.value = ''
  if (!form.objectCategory || !form.disease) {
    errorMessage.value = '请先选择保护对象类别与病害类型，再生成处理建议'
    return
  }
  advice.value = previewAdvice({
    objectCategory: form.objectCategory,
    disease: form.disease,
    proposedMaterial: form.proposedMaterial,
    thresholdValue: Number.isFinite(form.thresholdValue) ? form.thresholdValue : null,
  })
}

function close() {
  emit('close')
}

function submit() {
  errorMessage.value = ''
  if (!form.objectCategory || !form.disease) {
    errorMessage.value = '请先选择保护对象类别与病害类型'
    return
  }
  advice.value = previewAdvice({
    objectCategory: form.objectCategory,
    disease: form.disease,
    proposedMaterial: form.proposedMaterial,
    thresholdValue: Number.isFinite(form.thresholdValue) ? form.thresholdValue : null,
  })
  const result = createPlan({
    ...form,
    thresholdValue: Number.isFinite(form.thresholdValue) ? form.thresholdValue : null,
  })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  emit('created')
}
</script>
