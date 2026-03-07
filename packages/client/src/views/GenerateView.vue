<template>
  <div class="generate-view" :class="{ 'compare-active': compareActive }">
    <!-- 对比模式：三栏布局 -->
    <template v-if="compareActive">
      <div class="compare-header-bar">
        <div class="compare-title-area">
          <span class="compare-title">三版本对比</span>
          <span class="compare-subtitle">同一份数据，三种风格同时生成，选择最合适的版本</span>
        </div>
        <div class="compare-actions">
          <el-button v-if="anyCompareGenerating" @click="abortAllCompare" type="danger" plain size="small">
            停止生成
          </el-button>
          <el-button @click="exitCompare">返回配置</el-button>
        </div>
      </div>

      <el-row :gutter="12">
        <el-col :span="8" v-for="s in styleOptions" :key="s.key">
          <el-card class="compare-card">
            <template #header>
              <div class="compare-card-header">
                <div>
                  <span class="compare-style-name">{{ s.label }}</span>
                  <div class="compare-style-desc">{{ s.desc }}</div>
                </div>
                <div class="compare-card-btns">
                  <el-button
                    v-if="compareContents[s.key] && !compareGenerating[s.key]"
                    size="small"
                    @click="copyCompareContent(s.key)"
                  >
                    复制
                  </el-button>
                  <el-button
                    v-if="compareContents[s.key] && !compareGenerating[s.key]"
                    type="primary"
                    size="small"
                    @click="selectVersion(s.key)"
                  >
                    选择此版本
                  </el-button>
                </div>
              </div>
            </template>

            <div class="compare-card-body">
              <template v-if="compareGenerating[s.key]">
                <div
                  v-if="compareContents[s.key]"
                  class="markdown-preview"
                  v-html="renderMarkdown(compareContents[s.key])"
                ></div>
                <div class="compare-loading-tip">
                  <span class="loading-dots">
                    <span></span><span></span><span></span>
                  </span>
                  生成中...
                </div>
              </template>

              <div
                v-else-if="compareContents[s.key]"
                class="markdown-preview"
                v-html="renderMarkdown(compareContents[s.key])"
              ></div>

              <div v-else class="compare-empty">
                <el-empty description="等待生成" :image-size="60" />
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </template>

    <!-- 普通模式：原有布局 -->
    <template v-else>
      <el-row :gutter="20">
        <!-- 左侧: 配置面板 -->
        <el-col :span="10">
          <el-card>
            <template #header>
              <div class="config-header">
                <span>生成配置</span>
                <el-button
                  v-if="summaryStore.content && !summaryStore.generating"
                  text
                  size="small"
                  @click="configCollapsed = !configCollapsed"
                >
                  {{ configCollapsed ? '展开配置' : '收起配置' }}
                </el-button>
              </div>
            </template>

            <!-- 折叠状态 -->
            <template v-if="configCollapsed && summaryStore.content && !summaryStore.generating">
              <div class="collapsed-config">
                <div class="collapsed-item">
                  <span class="collapsed-label">维度：</span>
                  <template v-if="summaryStore.dimensions.length > 0">
                    <el-tag v-for="dim in summaryStore.dimensions" :key="dim" size="small" class="collapsed-tag">{{ dim }}</el-tag>
                  </template>
                  <span v-else class="collapsed-auto">AI 自动组织</span>
                </div>
                <div class="collapsed-item">
                  <span class="collapsed-label">风格：</span>
                  <span>{{ styleLabel }}</span>
                </div>
                <div class="collapsed-item">
                  <span class="collapsed-label">事实模式：</span>
                  <el-tag v-if="summaryStore.strictFactMode" type="warning" size="small">严格</el-tag>
                  <span v-else class="collapsed-auto">关闭</span>
                </div>
                <div v-if="summaryStore.customPrompt" class="collapsed-item">
                  <span class="collapsed-label">额外说明：</span>
                  <span class="collapsed-prompt">{{ summaryStore.customPrompt }}</span>
                </div>
                <el-button
                  type="primary"
                  plain
                  style="width: 100%; margin-top: 12px;"
                  @click="configCollapsed = false"
                >
                  修改配置并重新生成
                </el-button>
              </div>
            </template>

            <!-- 展开状态 -->
            <template v-else>
              <!-- 总结维度 -->
              <div class="section">
                <h4>总结维度</h4>
                <div class="selected-dims" v-if="summaryStore.dimensions.length > 0">
                  <el-tag
                    v-for="(dim, index) in summaryStore.dimensions"
                    :key="dim"
                    closable
                    @close="removeDimension(index)"
                    class="dim-tag"
                  >
                    {{ dim }}
                  </el-tag>
                </div>
                <div v-else class="empty-dims">可选：不选维度时 AI 将根据项目数据自动组织内容结构</div>

                <div class="dim-input">
                  <el-input
                    v-model="customDim"
                    placeholder="输入自定义维度，按回车添加"
                    @keyup.enter="addCustomDimension"
                    size="small"
                  />
                  <el-button size="small" @click="addCustomDimension" :disabled="!customDim.trim()">添加</el-button>
                </div>

                <div class="dim-suggestions">
                  <span class="suggestion-label">建议：</span>
                  <el-tag
                    v-for="s in availableSuggestions"
                    :key="s"
                    class="suggestion-tag"
                    effect="plain"
                    @click="addDimension(s)"
                  >
                    + {{ s }}
                  </el-tag>
                </div>
              </div>

              <!-- 总结风格 -->
              <div class="section">
                <h4>总结风格</h4>
                <el-radio-group v-model="summaryStore.style" class="style-radio-group">
                  <el-radio value="formal">业务导向</el-radio>
                  <span class="style-desc">突出业务价值和战略意义，弱化技术细节，适合向上汇报</span>
                  <el-radio value="semi-formal">技术叙述</el-radio>
                  <span class="style-desc">兼顾业务成果和技术实现，可展开技术方案和攻坚过程</span>
                  <el-radio value="data-driven">数据驱动</el-radio>
                  <span class="style-desc">一切用数据说话，突出代码量、提交数、时间线等量化指标</span>
                </el-radio-group>
              </div>

              <!-- 严格事实模式 -->
              <div class="section">
                <div class="fact-mode-row">
                  <div class="fact-mode-info">
                    <h4 style="margin-bottom: 2px;">严格事实模式</h4>
                    <div class="fact-mode-desc">
                      开启后 AI 只引用已采集的数据，未证实的内容将改为模糊表达，防止"幻觉"
                    </div>
                  </div>
                  <el-switch v-model="summaryStore.strictFactMode" />
                </div>
              </div>

              <!-- 自定义要求 -->
              <div class="section">
                <h4>额外说明 (可选)</h4>
                <el-input
                  v-model="summaryStore.customPrompt"
                  type="textarea"
                  :rows="4"
                  placeholder="填写补充说明，如：侧重前端技术方面的总结、我是团队技术负责人..."
                />
                <div class="form-tip">此项仅影响重新生成。如需微调已有总结，请使用右侧「对话修改」</div>
              </div>

              <!-- 生成按钮组 -->
              <div class="generate-buttons">
                <el-button
                  type="primary"
                  size="large"
                  @click="generate"
                  :loading="summaryStore.generating"
                  :disabled="!canGenerate"
                  class="generate-btn"
                >
                  {{ summaryStore.generating ? '生成中...' : (summaryStore.content ? '重新生成总结' : 'AI 生成总结') }}
                </el-button>
                <el-button
                  size="large"
                  @click="generateCompare"
                  :disabled="!canGenerate || summaryStore.generating"
                  class="generate-btn"
                >
                  对比生成 (3种风格)
                </el-button>
              </div>
            </template>
          </el-card>
        </el-col>

        <!-- 右侧: 生成结果预览 -->
        <el-col :span="14">
          <el-card class="preview-card">
            <template #header>
              <div class="preview-header">
                <span>生成预览</span>
                <el-button
                  v-if="summaryStore.content"
                  size="small"
                  @click="copyContent"
                >
                  复制内容
                </el-button>
              </div>
            </template>

            <div v-if="!summaryStore.content && !summaryStore.generating" class="empty-preview">
              <el-empty description="配置完成后点击生成按钮" />
            </div>

            <div v-else class="markdown-preview" v-html="renderedContent"></div>
          </el-card>

          <!-- 对话式修改 -->
          <el-card v-if="summaryStore.content && !summaryStore.generating" class="chat-card">
            <template #header>
              <span>对话修改</span>
            </template>

            <div v-if="chatMessages.length > 0" class="chat-history">
              <div
                v-for="(msg, index) in chatMessages"
                :key="index"
                class="chat-msg"
                :class="msg.role"
              >
                <div class="chat-role">{{ msg.role === 'user' ? '修改意见' : 'AI 回应' }}</div>
                <div class="chat-text">{{ msg.role === 'user' ? msg.content : '已应用修改' }}</div>
              </div>
            </div>

            <div class="chat-input-row">
              <el-input
                v-model="refineInput"
                type="textarea"
                :rows="2"
                placeholder="输入修改意见，如：第二部分的数据不对，改成 xxx；把技术升级那段删掉；加一段关于团队管理的内容..."
                :disabled="refining"
                @keyup.ctrl.enter="submitRefine"
              />
              <el-button
                type="primary"
                @click="submitRefine"
                :loading="refining"
                :disabled="!refineInput.trim() || refining"
                style="margin-top: 8px; align-self: flex-end;"
              >
                {{ refining ? '修改中...' : '提交修改' }}
              </el-button>
            </div>
            <div class="form-tip">输入自然语言修改意见，AI 将基于当前总结进行调整。支持多轮对话，按 Ctrl+Enter 快捷提交</div>
          </el-card>

          <!-- 版本历史 -->
          <el-card
            v-if="summaryStore.versions.length > 0 && !summaryStore.generating"
            class="version-card"
          >
            <template #header>
              <div class="version-header">
                <span>版本历史 ({{ summaryStore.versions.length }})</span>
                <span class="version-tip">每次修改自动保存快照，可随时回退</span>
              </div>
            </template>

            <div class="version-list">
              <div
                v-for="(ver, idx) in summaryStore.versions"
                :key="idx"
                class="version-item"
                :class="{ 'is-current': idx === summaryStore.versions.length - 1 }"
              >
                <div class="version-info">
                  <span class="version-badge">V{{ idx + 1 }}</span>
                  <span class="version-label">{{ ver.label }}</span>
                  <el-tag
                    v-if="idx === summaryStore.versions.length - 1"
                    size="small"
                    type="success"
                    class="version-current-tag"
                  >
                    当前
                  </el-tag>
                  <span class="version-time">{{ formatTime(ver.timestamp) }}</span>
                </div>
                <div class="version-actions">
                  <el-button
                    v-if="idx > 0"
                    text
                    size="small"
                    @click="openDiff(idx)"
                  >
                    对比
                  </el-button>
                  <el-button
                    v-if="idx < summaryStore.versions.length - 1"
                    text
                    size="small"
                    type="warning"
                    @click="handleRollback(idx)"
                  >
                    回退
                  </el-button>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 操作栏 -->
      <div class="action-bar" v-if="summaryStore.content && !summaryStore.generating">
        <el-button @click="router.push('/feishu')">上一步</el-button>
        <el-button type="primary" size="large" @click="router.push('/preview')">
          下一步：预览导出
        </el-button>
      </div>
    </template>

    <!-- Diff 对比弹窗 -->
    <el-dialog
      v-model="diffDialogVisible"
      title="版本对比"
      width="80%"
      top="5vh"
      destroy-on-close
    >
      <template v-if="diffData">
        <div class="diff-header">
          <span class="diff-label diff-old">V{{ diffData.oldIndex + 1 }}: {{ diffData.oldLabel }}</span>
          <span class="diff-arrow">-></span>
          <span class="diff-label diff-new">V{{ diffData.newIndex + 1 }}: {{ diffData.newLabel }}</span>
        </div>
        <div class="diff-content">
          <div
            v-for="(part, idx) in diffData.changes"
            :key="idx"
            class="diff-line"
            :class="{
              'diff-added': part.added,
              'diff-removed': part.removed,
            }"
          >
            <span class="diff-indicator">{{ part.added ? '+' : part.removed ? '-' : ' ' }}</span>
            <span class="diff-text">{{ part.value }}</span>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="diffDialogVisible = false">关闭</el-button>
        <el-button
          v-if="diffData && diffData.oldIndex < summaryStore.versions.length - 1"
          type="warning"
          @click="handleRollback(diffData!.oldIndex); diffDialogVisible = false"
        >
          回退到 V{{ diffData!.oldIndex + 1 }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MarkdownIt from 'markdown-it'
import { diffLines, type Change } from 'diff'
import { DIMENSION_SUGGESTIONS } from '@work-summary/shared'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'
import { useSummaryStore } from '@/stores/summary'
import { streamGenerate, streamRefine } from '@/api/generate'

const router = useRouter()
const projectStore = useProjectStore()
const settings = useSettingsStore()
const summaryStore = useSummaryStore()

const md = new MarkdownIt()
const customDim = ref('')
const refineInput = ref('')
const refining = ref(false)
const configCollapsed = ref(false)
const chatMessages = ref<{ role: 'user' | 'assistant'; content: string }[]>([])

// ===== 对比模式状态 =====
const compareActive = ref(false)
const compareContents = reactive<Record<string, string>>({
  'formal': '',
  'semi-formal': '',
  'data-driven': '',
})
const compareGenerating = reactive<Record<string, boolean>>({
  'formal': false,
  'semi-formal': false,
  'data-driven': false,
})
const compareAborts: (() => void)[] = []

const styleOptions = [
  { key: 'formal', label: '业务导向', desc: '突出业务价值，适合向上汇报' },
  { key: 'semi-formal', label: '技术叙述', desc: '兼顾业务和技术，适合团队内' },
  { key: 'data-driven', label: '数据驱动', desc: '量化指标为主，适合绩效评审' },
]

const anyCompareGenerating = computed(() => {
  return compareGenerating['formal'] || compareGenerating['semi-formal'] || compareGenerating['data-driven']
})

// ===== 版本历史 Diff 状态 =====
const diffDialogVisible = ref(false)
const diffData = ref<{
  oldIndex: number
  newIndex: number
  oldLabel: string
  newLabel: string
  changes: Change[]
} | null>(null)

// ===== 原有逻辑 =====
const styleLabel = computed(() => {
  const map: Record<string, string> = {
    'formal': '业务导向',
    'semi-formal': '技术叙述',
    'data-driven': '数据驱动',
  }
  return map[summaryStore.style] || summaryStore.style
})

const availableSuggestions = computed(() => {
  return DIMENSION_SUGGESTIONS.filter(s => !summaryStore.dimensions.includes(s))
})

const canGenerate = computed(() => {
  return projectStore.analyses.size > 0
})

function addDimension(dim: string) {
  if (!summaryStore.dimensions.includes(dim)) {
    summaryStore.dimensions.push(dim)
  }
}

function removeDimension(index: number) {
  summaryStore.dimensions.splice(index, 1)
}

function addCustomDimension() {
  const dim = customDim.value.trim()
  if (!dim) return
  if (summaryStore.dimensions.includes(dim)) {
    ElMessage.warning('该维度已添加')
    return
  }
  summaryStore.dimensions.push(dim)
  customDim.value = ''
}

const renderedContent = computed(() => {
  return md.render(summaryStore.content || '')
})

function renderMarkdown(content: string): string {
  return md.render(content || '')
}

/** 清理 AI 开场白废话 */
function cleanAIOutput(text: string): string {
  return text.replace(
    /^(好的[，,]?|作为[一位]*.*?[，,。]|我将[根据]?.*?[，,。]|以下是.*?[：:。\n]|根据.*?修改.*?[：:。\n])+/s,
    ''
  ).trimStart()
}

/** 格式化时间戳 */
function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// ===== 单版本生成 =====
function generate() {
  summaryStore.generating = true
  summaryStore.setContent('')
  summaryStore.clearVersions()
  chatMessages.value = []

  const analyses = projectStore.getSelectedAnalyses()

  streamGenerate(
    {
      projects: analyses,
      feishuDocs: summaryStore.feishuDocs,
      standaloneDocuments: projectStore.scanResult?.standaloneDocuments || [],
      dimensions: summaryStore.dimensions,
      style: summaryStore.style,
      customPrompt: summaryStore.customPrompt || undefined,
      strictFactMode: summaryStore.strictFactMode || undefined,
      apiKey: settings.apiKey,
    },
    (chunk) => {
      summaryStore.appendContent(chunk)
    },
    () => {
      const cleaned = cleanAIOutput(summaryStore.content)
      if (cleaned !== summaryStore.content) {
        summaryStore.setContent(cleaned)
      }
      summaryStore.generating = false
      summaryStore.saveVersion('初始生成')
      configCollapsed.value = true
      ElMessage.success('总结生成完成!')
    },
    (err) => {
      summaryStore.generating = false
      ElMessage.error(`生成失败: ${err}`)
    },
  )
}

// ===== 对比生成（3种风格并行） =====
function generateCompare() {
  compareActive.value = true
  for (const s of styleOptions) {
    compareContents[s.key] = ''
    compareGenerating[s.key] = true
  }
  compareAborts.length = 0

  const analyses = projectStore.getSelectedAnalyses()

  for (const s of styleOptions) {
    const abort = streamGenerate(
      {
        projects: analyses,
        feishuDocs: summaryStore.feishuDocs,
        standaloneDocuments: projectStore.scanResult?.standaloneDocuments || [],
        dimensions: summaryStore.dimensions,
        style: s.key as 'formal' | 'semi-formal' | 'data-driven',
        customPrompt: summaryStore.customPrompt || undefined,
        strictFactMode: summaryStore.strictFactMode || undefined,
        apiKey: settings.apiKey,
      },
      (chunk) => {
        compareContents[s.key] += chunk
      },
      () => {
        compareContents[s.key] = cleanAIOutput(compareContents[s.key])
        compareGenerating[s.key] = false

        if (!compareGenerating['formal'] && !compareGenerating['semi-formal'] && !compareGenerating['data-driven']) {
          ElMessage.success('三个版本全部生成完成，请选择满意的版本')
        }
      },
      (err) => {
        compareGenerating[s.key] = false
        ElMessage.error(`「${s.label}」生成失败: ${err}`)
      },
    )
    compareAborts.push(abort)
  }
}

function selectVersion(styleKey: string) {
  summaryStore.setContent(compareContents[styleKey])
  summaryStore.style = styleKey as 'formal' | 'semi-formal' | 'data-driven'
  summaryStore.clearVersions()
  summaryStore.saveVersion('初始生成')
  compareActive.value = false
  chatMessages.value = []
  configCollapsed.value = true
  const label = styleOptions.find(s => s.key === styleKey)?.label || styleKey
  ElMessage.success(`已选择「${label}」版本，可继续使用对话修改`)
}

function abortAllCompare() {
  for (const abort of compareAborts) {
    abort()
  }
  compareAborts.length = 0
  for (const s of styleOptions) {
    compareGenerating[s.key] = false
  }
}

function exitCompare() {
  abortAllCompare()
  compareActive.value = false
}

function copyCompareContent(styleKey: string) {
  navigator.clipboard.writeText(compareContents[styleKey])
  ElMessage.success('已复制到剪贴板')
}

// ===== 对话式修改 =====
function submitRefine() {
  const instruction = refineInput.value.trim()
  if (!instruction || refining.value) return

  refining.value = true

  chatMessages.value.push({ role: 'user', content: instruction })

  const history = chatMessages.value.length <= 1
    ? undefined
    : buildChatHistory()

  const previousContent = summaryStore.content
  summaryStore.setContent('')

  streamRefine(
    {
      content: previousContent,
      instruction,
      history,
      apiKey: settings.apiKey,
    },
    (chunk) => {
      summaryStore.appendContent(chunk)
    },
    () => {
      const cleaned = cleanAIOutput(summaryStore.content)
      if (cleaned !== summaryStore.content) {
        summaryStore.setContent(cleaned)
      }

      chatMessages.value.push({ role: 'assistant', content: summaryStore.content })

      // 保存版本快照
      summaryStore.saveVersion(instruction)

      refining.value = false
      refineInput.value = ''
      ElMessage.success('修改完成!')
    },
    (err) => {
      summaryStore.setContent(previousContent)
      chatMessages.value.pop()
      refining.value = false
      ElMessage.error(`修改失败: ${err}`)
    },
  )
}

function buildChatHistory(): { role: string; content: string }[] {
  return chatMessages.value.slice(0, -1)
}

// ===== 版本历史操作 =====

/** 打开 diff 对比弹窗：对比选中版本与其前一个版本 */
function openDiff(index: number) {
  if (index <= 0 || index >= summaryStore.versions.length) return

  const oldVer = summaryStore.versions[index - 1]
  const newVer = summaryStore.versions[index]
  const changes = diffLines(oldVer.content, newVer.content)

  diffData.value = {
    oldIndex: index - 1,
    newIndex: index,
    oldLabel: oldVer.label,
    newLabel: newVer.label,
    changes,
  }
  diffDialogVisible.value = true
}

/** 回退到指定版本 */
async function handleRollback(index: number) {
  const ver = summaryStore.versions[index]
  if (!ver) return

  try {
    await ElMessageBox.confirm(
      `确定回退到 V${index + 1}（${ver.label}）？当前内容将被替换。`,
      '回退确认',
      { confirmButtonText: '确定回退', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 用户取消
  }

  summaryStore.rollbackToVersion(index)
  // 保存回退操作本身作为新版本
  summaryStore.saveVersion(`回退到 V${index + 1}`)
  ElMessage.success(`已回退到 V${index + 1}`)
}

function copyContent() {
  navigator.clipboard.writeText(summaryStore.content)
  ElMessage.success('已复制到剪贴板')
}
</script>

<style scoped>
.generate-view {
  max-width: 1200px;
  margin: 0 auto;
}

.generate-view.compare-active {
  max-width: 1600px;
}

/* ===== 对比模式样式 ===== */
.compare-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.compare-title-area {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.compare-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.compare-subtitle {
  font-size: 13px;
  color: #909399;
}

.compare-actions {
  display: flex;
  gap: 8px;
}

.compare-card {
  height: calc(100vh - 160px);
  display: flex;
  flex-direction: column;
}

.compare-card :deep(.el-card__body) {
  flex: 1;
  overflow: hidden;
  padding: 12px;
}

.compare-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.compare-style-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.compare-style-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.compare-card-btns {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.compare-card-body {
  height: 100%;
  overflow-y: auto;
}

.compare-loading-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  color: #909399;
}

.loading-dots {
  display: inline-flex;
  gap: 3px;
}

.loading-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #409eff;
  animation: dotPulse 1.2s ease-in-out infinite;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.compare-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
}

/* ===== 普通模式样式 ===== */
.section {
  margin-bottom: 20px;
}

.section h4 {
  font-size: 14px;
  color: #303133;
  margin-bottom: 10px;
}

.style-radio-group {
  display: grid !important;
  grid-template-columns: auto 1fr;
  gap: 8px 12px;
  align-items: baseline;
}

.style-desc {
  font-size: 12px;
  color: #909399;
}

.selected-dims {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.dim-tag {
  font-size: 13px;
}

.empty-dims {
  font-size: 13px;
  color: #909399;
  margin-bottom: 10px;
}

.dim-input {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.dim-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.suggestion-label {
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
}

.suggestion-tag {
  cursor: pointer;
  font-size: 12px;
}

.suggestion-tag:hover {
  color: #409eff;
  border-color: #409eff;
}

.fact-mode-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.fact-mode-info {
  flex: 1;
}

.fact-mode-desc {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.generate-buttons {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.generate-btn {
  flex: 1;
}

.preview-card {
  min-height: 600px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.empty-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.markdown-preview {
  line-height: 1.8;
  font-size: 14px;
}

.markdown-preview :deep(h1) {
  font-size: 24px;
  border-bottom: 2px solid #eee;
  padding-bottom: 8px;
  margin: 20px 0 12px;
}

.markdown-preview :deep(h2) {
  font-size: 20px;
  color: #2c3e50;
  margin: 20px 0 10px;
}

.markdown-preview :deep(h3) {
  font-size: 16px;
  color: #34495e;
  margin: 16px 0 8px;
}

.markdown-preview :deep(strong) {
  color: #2c3e50;
}

.markdown-preview :deep(ul) {
  padding-left: 20px;
}

.markdown-preview :deep(li) {
  margin: 6px 0;
}

.chat-card {
  margin-top: 16px;
}

.chat-history {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
  padding: 8px;
  background: #fafafa;
  border-radius: 6px;
}

.chat-msg {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.chat-msg.user {
  background: #ecf5ff;
  border-left: 3px solid #409eff;
}

.chat-msg.assistant {
  background: #f0f9eb;
  border-left: 3px solid #67c23a;
}

.chat-role {
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
}

.chat-text {
  color: #303133;
  line-height: 1.5;
}

.chat-input-row {
  display: flex;
  flex-direction: column;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.collapsed-config {
  font-size: 13px;
}

.collapsed-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.collapsed-label {
  color: #909399;
  flex-shrink: 0;
}

.collapsed-tag {
  margin: 2px 0;
}

.collapsed-auto {
  color: #909399;
  font-style: italic;
}

.collapsed-prompt {
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.action-bar {
  margin-top: 24px;
  display: flex;
  justify-content: space-between;
}

/* ===== 版本历史样式 ===== */
.version-card {
  margin-top: 16px;
}

.version-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.version-tip {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}

.version-list {
  max-height: 240px;
  overflow-y: auto;
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.version-item:hover {
  background: #f5f7fa;
}

.version-item.is-current {
  background: #f0f9eb;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.version-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 20px;
  border-radius: 10px;
  background: #409eff;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.version-item.is-current .version-badge {
  background: #67c23a;
}

.version-label {
  font-size: 13px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-current-tag {
  flex-shrink: 0;
}

.version-time {
  font-size: 12px;
  color: #c0c4cc;
  flex-shrink: 0;
}

.version-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* ===== Diff 对比弹窗样式 ===== */
.diff-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
}

.diff-label {
  font-weight: 600;
}

.diff-old {
  color: #f56c6c;
}

.diff-new {
  color: #67c23a;
}

.diff-arrow {
  color: #909399;
}

.diff-content {
  max-height: 60vh;
  overflow-y: auto;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.diff-line {
  display: flex;
  padding: 2px 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-added {
  background: #e6ffec;
}

.diff-removed {
  background: #ffebe9;
  text-decoration: line-through;
  opacity: 0.7;
}

.diff-indicator {
  width: 16px;
  flex-shrink: 0;
  color: #909399;
  font-weight: 600;
  user-select: none;
}

.diff-added .diff-indicator {
  color: #67c23a;
}

.diff-removed .diff-indicator {
  color: #f56c6c;
}

.diff-text {
  flex: 1;
}
</style>
