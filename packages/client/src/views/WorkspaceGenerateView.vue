<template>
  <div class="ws-generate">
    <div class="page-header">
      <el-button link @click="$router.push('/workspace')">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h2>生成工作总结</h2>
    </div>

    <div class="generate-grid">
      <!-- 左侧：参数面板 -->
      <div class="panel-left">
        <!-- 周期选择 -->
        <div class="panel-section">
          <h3 class="panel-title">报告周期</h3>
          <div class="period-tabs">
            <div
              v-for="p in periodTypes"
              :key="p.value"
              class="period-tab"
              :class="{ active: selectedPeriodType === p.value }"
              @click="selectPeriodType(p.value)"
            >
              <div class="period-icon">{{ p.icon }}</div>
              <div class="period-label">{{ p.label }}</div>
            </div>
          </div>

          <el-form-item label="日期范围" label-position="top" style="margin-top: 12px;">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              range-separator="~"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              style="width: 100%;"
              @change="onDateRangeChange"
            />
          </el-form-item>
        </div>

        <!-- 模板选择 -->
        <div class="panel-section">
          <h3 class="panel-title">报告模板</h3>
          <el-select
            v-model="selectedTemplateId"
            placeholder="选择报告模板"
            style="width: 100%;"
            :loading="templatesLoading"
          >
            <el-option
              v-for="t in templates"
              :key="t.id"
              :label="t.name"
              :value="t.id"
            >
              <div class="template-option">
                <div>{{ t.name }}</div>
                <div class="template-sections">
                  {{ t.sections.map(s => s.title).join(' / ') }}
                </div>
              </div>
            </el-option>
          </el-select>

          <div v-if="currentTemplate" class="template-preview">
            <div class="template-hint">{{ currentTemplate.promptHints }}</div>
            <div class="template-sections-list">
              <span
                v-for="s in currentTemplate.sections"
                :key="s.key"
                class="section-chip"
                :class="{ required: s.required }"
              >
                {{ s.title }}
              </span>
            </div>
          </div>
        </div>

        <!-- 业务背景 -->
        <div class="panel-section">
          <h3 class="panel-title">业务背景（可选）</h3>
          <el-input
            v-model="businessContext"
            type="textarea"
            :rows="3"
            placeholder="补充团队/业务背景，帮 AI 更好理解你的工作"
            maxlength="300"
            show-word-limit
          />
        </div>

        <!-- 自定义要求 -->
        <div class="panel-section">
          <h3 class="panel-title">额外要求（可选）</h3>
          <el-input
            v-model="customPrompt"
            type="textarea"
            :rows="3"
            placeholder="如：突出我在 xx 项目的主导作用 / 强调团队协作"
            maxlength="200"
            show-word-limit
          />
        </div>
      </div>

      <!-- 右侧：工作项预览 -->
      <div class="panel-right">
        <div class="panel-section">
          <h3 class="panel-title">
            周期内工作项
            <span class="count-badge">{{ filteredItems.length }}</span>
          </h3>
          <div v-if="filteredItems.length === 0" class="empty-items">
            <p>📭 当前周期内没有工作项</p>
            <el-button size="small" @click="$router.push('/workspace/manual')">
              去录入
            </el-button>
          </div>
          <div v-else class="items-preview">
            <div
              v-for="item in filteredItems"
              :key="item.id"
              class="preview-item"
            >
              <div class="preview-title">
                <span v-if="item.category" class="cat">{{ item.category }}</span>
                {{ item.title }}
              </div>
              <div class="preview-meta">{{ item.date.start }}<template v-if="item.date.end && item.date.end !== item.date.start"> ~ {{ item.date.end }}</template></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部生成按钮 -->
    <div class="footer-bar">
      <div class="footer-info">
        <template v-if="selectedTemplateId && filteredItems.length > 0">
          将基于 <strong>{{ filteredItems.length }}</strong> 条工作项生成 <strong>{{ currentTemplate?.name }}</strong>
        </template>
        <template v-else-if="filteredItems.length === 0">
          请先在工作空间录入工作项
        </template>
        <template v-else>
          请选择模板
        </template>
      </div>
      <el-button
        type="primary"
        size="large"
        :disabled="!canGenerate"
        :loading="generating"
        @click="onGenerate"
      >
        <el-icon><MagicStick /></el-icon>
        生成总结
      </el-button>
    </div>

    <!-- 生成进度浮层 -->
    <el-dialog v-model="showProgress" title="正在生成" width="600px" :close-on-click-modal="false" :show-close="false">
      <div class="progress-content">
        <div v-if="progressMsg" class="progress-msg">{{ progressMsg }}</div>
        <div class="stream-preview">{{ streamContent || '...' }}</div>
      </div>
      <template #footer>
        <el-button @click="onCancelGenerate" :disabled="!generating">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, MagicStick } from '@element-plus/icons-vue'
import type { ReportPeriod, ReportPeriodType, ReportTemplate } from '@work-summary/shared'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSummaryStore } from '@/stores/summary'
import { useAppStore } from '@/stores/app'
import { listTemplates, getPeriodRange } from '@/api/templates'
import { streamGenerate } from '@/api/generate'

const router = useRouter()
const workspaceStore = useWorkspaceStore()
const summaryStore = useSummaryStore()
const appStore = useAppStore()

// ---- 周期 ----
const periodTypes: { value: ReportPeriodType; label: string; icon: string }[] = [
  { value: 'weekly', label: '周报', icon: '📅' },
  { value: 'monthly', label: '月报', icon: '🗓️' },
  { value: 'quarterly', label: '季报', icon: '📊' },
  { value: 'yearly', label: '年报', icon: '🎯' },
  { value: 'custom', label: '自定义', icon: '⚙️' },
]

const selectedPeriodType = ref<ReportPeriodType>('monthly')
const dateRange = ref<[string, string]>(['', ''])
const periodLabel = ref<string>('')

async function selectPeriodType(t: ReportPeriodType) {
  selectedPeriodType.value = t
  if (t === 'custom') return
  try {
    const range = await getPeriodRange(t)
    dateRange.value = [range.start, range.end]
    periodLabel.value = range.label
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

function onDateRangeChange() {
  // 用户手动改了日期，标签变成"自定义"
  periodLabel.value = `${dateRange.value[0]} ~ ${dateRange.value[1]}`
}

const period = computed<ReportPeriod>(() => ({
  type: selectedPeriodType.value,
  start: dateRange.value[0] || new Date().toISOString().slice(0, 10),
  end: dateRange.value[1] || new Date().toISOString().slice(0, 10),
  label: periodLabel.value || '自定义',
}))

// ---- 模板 ----
const templates = ref<ReportTemplate[]>([])
const selectedTemplateId = ref<string>('')
const templatesLoading = ref(false)

async function loadTemplates() {
  templatesLoading.value = true
  try {
    const list = await listTemplates(appStore.mode ?? 'general', selectedPeriodType.value)
    templates.value = list
    if (!selectedTemplateId.value || !list.find(t => t.id === selectedTemplateId.value)) {
      selectedTemplateId.value = list[0]?.id ?? ''
    }
  } catch (e) {
    ElMessage.error(`加载模板失败：${(e as Error).message}`)
  } finally {
    templatesLoading.value = false
  }
}

watch(selectedPeriodType, loadTemplates)

const currentTemplate = computed(() =>
  templates.value.find(t => t.id === selectedTemplateId.value),
)

// ---- 工作项 ----
const filteredItems = computed(() => workspaceStore.filterByPeriod(period.value))

// ---- 业务背景/自定义要求 ----
const businessContext = ref('')
const customPrompt = ref('')

// ---- 生成 ----
const canGenerate = computed(() =>
  selectedTemplateId.value && filteredItems.value.length > 0,
)

const generating = ref(false)
const showProgress = ref(false)
const progressMsg = ref('')
const streamContent = ref('')
let cancelGenerate: (() => void) | null = null

function onGenerate() {
  generating.value = true
  showProgress.value = true
  progressMsg.value = ''
  streamContent.value = ''

  cancelGenerate = streamGenerate(
    {
      workItems: filteredItems.value,
      period: period.value,
      templateId: selectedTemplateId.value,
      mode: appStore.mode ?? 'general',
      businessContext: businessContext.value,
      customPrompt: customPrompt.value,
    },
    (chunk) => { streamContent.value += chunk },
    () => {
      generating.value = false
      summaryStore.setContent(streamContent.value)
      summaryStore.saveVersion(`${currentTemplate.value?.name} - ${period.value.label}`)
      ElMessage.success('生成完成，跳转预览')
      showProgress.value = false
      router.push('/preview')
    },
    (err) => {
      generating.value = false
      ElMessage.error(`生成失败：${err}`)
    },
    (msg) => { progressMsg.value = msg },
  )
}

function onCancelGenerate() {
  if (cancelGenerate) {
    cancelGenerate()
    cancelGenerate = null
  }
  generating.value = false
  showProgress.value = false
  ElMessage.info('已取消生成')
}

// ---- 初始化 ----
onMounted(async () => {
  await selectPeriodType('monthly')
  await loadTemplates()
})
</script>

<style scoped>
.ws-generate {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 80px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  color: var(--ws-text-primary, #fff);
  font-size: 22px;
}

.generate-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 20px;
}

.panel-section {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 14px;
  color: var(--ws-text-primary, #fff);
  margin: 0 0 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 10px;
  background: linear-gradient(135deg, #667eea, #a78bfa);
  color: #fff;
  border-radius: 999px;
}

/* ==== 周期 tabs ==== */
.period-tabs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.period-tab {
  padding: 12px 4px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.25s ease;
}

.period-tab:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(167, 139, 250, 0.3);
}

.period-tab.active {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(167, 139, 250, 0.2));
  border-color: rgba(167, 139, 250, 0.5);
}

.period-icon {
  font-size: 22px;
  margin-bottom: 4px;
}

.period-label {
  font-size: 12px;
  color: var(--ws-text-primary, #fff);
}

/* ==== 模板预览 ==== */
.template-option {
  display: flex;
  flex-direction: column;
}

.template-sections {
  font-size: 11px;
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
  margin-top: 2px;
}

.template-preview {
  margin-top: 14px;
  padding: 12px 14px;
  background: rgba(167, 139, 250, 0.06);
  border: 1px dashed rgba(167, 139, 250, 0.25);
  border-radius: 8px;
}

.template-hint {
  font-size: 12px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.65));
  line-height: 1.7;
  margin-bottom: 10px;
}

.template-sections-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.section-chip {
  font-size: 11px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--ws-text-secondary, rgba(255,255,255,0.7));
  border-radius: 4px;
}

.section-chip.required {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(167, 139, 250, 0.2));
  color: #fff;
}

/* ==== 工作项预览 ==== */
.empty-items {
  text-align: center;
  padding: 30px 20px;
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
}

.empty-items p {
  margin-bottom: 14px;
  font-size: 13px;
}

.items-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 480px;
  overflow-y: auto;
}

.preview-item {
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border-left: 2px solid rgba(167, 139, 250, 0.4);
}

.preview-title {
  font-size: 13px;
  color: var(--ws-text-primary, #fff);
  font-weight: 500;
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}

.cat {
  font-size: 10px;
  background: rgba(102, 126, 234, 0.18);
  color: #a78bfa;
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.preview-meta {
  font-size: 11px;
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
}

/* ==== 底部条 ==== */
.footer-bar {
  position: sticky;
  bottom: 0;
  margin-top: 24px;
  padding: 16px 20px;
  background: rgba(15, 12, 41, 0.85);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-info {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.7));
}
.footer-info strong { color: #a78bfa; }

/* ==== 进度对话框 ==== */
.progress-content {
  min-height: 200px;
}

.progress-msg {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.7));
  margin-bottom: 12px;
}

.stream-preview {
  max-height: 320px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ws-text-secondary, rgba(255,255,255,0.85));
  white-space: pre-wrap;
  background: rgba(0, 0, 0, 0.25);
  padding: 14px 16px;
  border-radius: 8px;
  font-family: ui-monospace, monospace;
}

@media (max-width: 900px) {
  .generate-grid { grid-template-columns: 1fr; }
}
</style>
