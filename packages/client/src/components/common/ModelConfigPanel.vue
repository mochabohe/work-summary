<template>
  <div class="model-config-panel">
    <div class="model-provider-row">
      <el-select v-model="modelProvider" size="small" style="width:100%;" @change="onProviderChange">
        <el-option value="deepseek" label="DeepSeek（默认）" />
        <el-option value="openai" label="OpenAI" />
        <el-option value="custom" label="自定义（OpenAI 兼容）" />
        <el-option value="anthropic" label="Claude（Anthropic）" />
      </el-select>
    </div>
    <el-input
      v-if="modelProvider === 'custom'"
      v-model="modelBaseURL"
      size="small"
      placeholder="Base URL，如 https://api.openai.com/v1"
      style="margin-top:8px;"
    />
    <div v-if="modelProvider === 'custom' && baseURLHint" class="base-url-hint">
      💡 {{ baseURLHint }}
    </div>
    <el-input
      v-model="modelApiKey"
      size="small"
      type="password"
      show-password
      placeholder="API Key"
      style="margin-top:8px;"
    />

    <!-- API 类型选择（仅 OpenAI 兼容模式） -->
    <div v-if="modelProvider !== 'anthropic'" class="api-type-row">
      <span class="api-type-label">API 类型：</span>
      <el-radio-group v-model="apiType" size="small">
        <el-radio-button value="chat">Chat Completions</el-radio-button>
        <el-radio-button value="responses">Responses API</el-radio-button>
      </el-radio-group>
      <el-tooltip
        :content="apiType === 'responses'
          ? '/v1/responses 端点，适用 reasoning 模型（gpt-5 / o1 / o3）'
          : '/v1/chat/completions 端点，适用 gpt-4o / deepseek-chat 等普通模型'"
        placement="top"
      >
        <el-icon class="hint-icon"><InfoFilled /></el-icon>
      </el-tooltip>
      <span v-if="autoRecommendedApiType" class="auto-tip">
        💡 该模型推荐用 {{ autoRecommendedApiType === 'responses' ? 'Responses API' : 'Chat Completions' }}
      </span>
    </div>

    <!-- 步骤引导式操作区（4 步：纵向） -->
    <div class="step-flow">
      <!-- 步骤 1：拉取模型列表 -->
      <div class="step" :class="{ active: activeStep === 1, done: loadedModels.length > 0 }">
        <div class="step-num">{{ loadedModels.length > 0 ? '✓' : '1' }}</div>
        <div class="step-label">拉取模型</div>
        <div class="step-action">
          <span v-if="loadedModels.length > 0" class="step-done-hint">{{ loadedModels.length }} 个可选</span>
          <el-button
            size="small"
            :type="activeStep === 1 ? 'primary' : ''"
            :loading="loadingModels"
            :disabled="!canLoadModels"
            @click="loadModels"
          >
            <el-icon><RefreshRight /></el-icon>
            {{ loadedModels.length > 0 ? '重新拉取' : '拉取' }}
          </el-button>
        </div>
      </div>

      <!-- 步骤 2：选择模型 -->
      <div class="step" :class="{ active: activeStep === 2, done: !!modelId }">
        <div class="step-num">{{ modelId ? '✓' : '2' }}</div>
        <div class="step-label">选择模型</div>
        <div class="step-action">
          <el-select
            v-if="loadedModels.length > 0"
            v-model="modelId"
            size="small"
            style="width: 240px;"
            filterable
            placeholder="从下拉选择"
          >
            <el-option
              v-for="m in loadedModels"
              :key="m.id"
              :value="m.id"
              :label="m.id"
            >
              <span>{{ m.id }}</span>
              <span v-if="m.ownedBy" class="owned-by">{{ m.ownedBy }}</span>
            </el-option>
          </el-select>
          <el-select
            v-else-if="modelProvider !== 'custom'"
            v-model="modelId"
            size="small"
            style="width: 240px;"
          >
            <el-option v-for="m in modelPresets[modelProvider]" :key="m" :value="m" :label="m" />
          </el-select>
          <el-input
            v-else
            v-model="modelId"
            size="small"
            style="width: 240px;"
            placeholder="先拉取或手填"
          />
        </div>
      </div>

      <!-- 步骤 3：测试连接 -->
      <div class="step" :class="{ active: activeStep === 3, done: modelTestResult === 'ok' }">
        <div class="step-num">{{ modelTestResult === 'ok' ? '✓' : '3' }}</div>
        <div class="step-label">测试连接</div>
        <div class="step-action">
          <span v-if="modelTestResult === 'ok'" class="step-done-hint">已通过</span>
          <el-button
            size="small"
            :type="activeStep === 3 ? 'primary' : ''"
            :loading="modelTesting"
            :disabled="!modelApiKey || !modelId"
            @click="testModel"
          >{{ modelTestResult === 'ok' ? '重新测试' : '测试' }}</el-button>
        </div>
      </div>

      <!-- 步骤 4：保存 -->
      <div class="step" :class="{ active: activeStep === 4 }">
        <div class="step-num">4</div>
        <div class="step-label">保存配置</div>
        <div class="step-action">
          <el-button
            size="small"
            type="primary"
            :loading="modelSaving"
            :disabled="!modelApiKey || !modelId"
            @click="saveModel"
          >保存</el-button>
        </div>
      </div>
    </div>

    <div v-if="modelTestResult === 'ok' && !modelReply" class="ok step-feedback">✓ 连接正常</div>

    <!-- 错误详情：完整可滚动 -->
    <div v-if="modelTestResult && modelTestResult !== 'ok'" class="error-detail">
      <div class="error-head">
        <span>✗ 测试失败</span>
        <el-button size="small" link @click="copyError">复制</el-button>
      </div>
      <pre>{{ modelTestResult }}</pre>
    </div>

    <!-- 已加载模型提示已移入步骤区，此处保留回复展示 -->

    <!-- 模型真实回复（会话测试） -->
    <div v-if="modelReply" class="chat-result">
      <div class="chat-head">
        <span class="ok">✓ 连接成功</span>
        <span v-if="modelUsed" class="model-used">实际响应模型：<strong>{{ modelUsed }}</strong></span>
      </div>
      <div class="chat-bubble">
        <div class="chat-label">🤖 模型回复：</div>
        <div class="chat-content">{{ modelReply }}</div>
      </div>
      <div v-if="modelUsed && requestedModel && modelUsed !== requestedModel" class="warn">
        ⚠️ 注意：你请求的是「{{ requestedModel }}」，但代理实际返回的是「{{ modelUsed }}」——该代理可能进行了模型替换
      </div>
    </div>
    <div class="tip">按步骤操作：① 拉取 → ② 选择模型 → ③ 测试 → ④ 保存</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { RefreshRight, InfoFilled } from '@element-plus/icons-vue'
import api from '@/api/index'
import type { ApiResponse } from '@work-summary/shared'

const modelProvider = ref<'deepseek' | 'openai' | 'custom' | 'anthropic'>('deepseek')
const modelId = ref('deepseek-chat')
const modelBaseURL = ref('')
const modelApiKey = ref('')
const apiType = ref<'chat' | 'responses'>('chat')
const modelTesting = ref(false)
const modelSaving = ref(false)
const modelTestResult = ref('')
const modelReply = ref('')
const modelUsed = ref('')
const requestedModel = ref('')
const loadingModels = ref(false)
const loadedModels = ref<{ id: string; ownedBy: string }[]>([])

const modelPresets: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
}

const providerBaseURLMap: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: '',
}

/** 检测用户填写的 baseURL 是否可能遗漏 /v1 后缀 */
const baseURLHint = computed(() => {
  const url = modelBaseURL.value.trim()
  if (!url) return ''
  if (/\/v\d+\/?$/.test(url)) return ''
  if (url.endsWith('/')) return ''
  return `大多数 OpenAI 兼容代理需要以 /v1 结尾，建议改为 ${url.replace(/\/$/, '')}/v1`
})

/** 当前应进行到哪一步（4 步：拉取/选择/测试/保存） */
const activeStep = computed(() => {
  if (!modelApiKey.value) return 0
  // 自定义且未拉取 → ① 拉取
  if (loadedModels.value.length === 0 && modelProvider.value === 'custom') return 1
  // 未选模型 → ② 选择
  if (!modelId.value) return 2
  // 未测试 → ③ 测试
  if (modelTestResult.value !== 'ok') return 3
  // 已测试 → ④ 保存
  return 4
})

/** 根据模型名推荐 API 类型 */
function detectRecommendedApiType(model: string): 'chat' | 'responses' {
  const m = model.toLowerCase()
  if (m.startsWith('o1') || m.startsWith('o3')
      || m.startsWith('gpt-5') || m.startsWith('gpt5')
      || m.includes('reasoner') || m.includes('reasoning')) {
    return 'responses'
  }
  return 'chat'
}

/** 当前模型是否与所选 apiType 不匹配 */
const autoRecommendedApiType = computed(() => {
  if (!modelId.value) return null
  const recommended = detectRecommendedApiType(modelId.value)
  return recommended !== apiType.value ? recommended : null
})

// 切换模型时自动调整 apiType
watch(modelId, (newModel) => {
  if (!newModel) return
  const recommended = detectRecommendedApiType(newModel)
  if (recommended !== apiType.value) {
    apiType.value = recommended
    ElMessage.info(`检测到 ${recommended === 'responses' ? 'reasoning' : '普通'} 模型，已自动切换 API 类型为 ${recommended === 'responses' ? 'Responses API' : 'Chat Completions'}`)
  }
})

function onProviderChange(p: string) {
  if (modelPresets[p]?.length) modelId.value = modelPresets[p][0]
  if (p !== 'custom') modelBaseURL.value = ''
  modelTestResult.value = ''
  modelReply.value = ''
  modelUsed.value = ''
  loadedModels.value = []
}

const canLoadModels = computed(() => {
  if (!modelApiKey.value) return false
  // 自定义必须填 baseURL；其他 provider 用预设 baseURL
  if (modelProvider.value === 'custom' && !modelBaseURL.value) return false
  return true
})

async function loadModels() {
  if (!canLoadModels.value) {
    ElMessage.warning('请先填写 API Key' + (modelProvider.value === 'custom' ? ' 和 Base URL' : ''))
    return
  }
  loadingModels.value = true
  loadedModels.value = []
  try {
    const baseURL = modelProvider.value === 'custom'
      ? modelBaseURL.value
      : providerBaseURLMap[modelProvider.value]
    const res = await api.post('/config/list-models', {
      baseURL,
      apiKey: modelApiKey.value,
    }) as unknown as ApiResponse<{ models: { id: string; ownedBy: string }[]; total: number }>
    if (res.success && res.data) {
      loadedModels.value = res.data.models
      ElMessage.success(`✓ 拉取到 ${res.data.total} 个模型`)
      // 如果当前模型 ID 不在列表里，自动选第一个
      if (!loadedModels.value.find(m => m.id === modelId.value)) {
        modelId.value = loadedModels.value[0]?.id ?? modelId.value
      }
    }
  } catch (e: any) {
    ElMessage.error(`拉取失败：${e.message || e}`)
  } finally {
    loadingModels.value = false
  }
}

function copyError() {
  navigator.clipboard.writeText(modelTestResult.value).then(() => {
    ElMessage.success('已复制错误信息')
  }).catch(() => {
    ElMessage.warning('复制失败，请手动选中复制')
  })
}

async function testModel() {
  if (!modelApiKey.value) { ElMessage.warning('请先填写 API Key'); return }
  modelTesting.value = true
  modelTestResult.value = ''
  modelReply.value = ''
  modelUsed.value = ''
  requestedModel.value = modelId.value
  try {
    const provider = modelProvider.value === 'anthropic' ? 'anthropic' : 'openai-compatible'
    const baseURL = modelProvider.value === 'custom' ? modelBaseURL.value : providerBaseURLMap[modelProvider.value]
    const res = await api.post('/config/model', {
      provider, apiKey: modelApiKey.value, baseURL, model: modelId.value,
      apiType: provider === 'openai-compatible' ? apiType.value : undefined,
    }) as unknown as ApiResponse<{ valid: boolean; reply?: string; modelUsed?: string }>
    if (res.data?.valid) {
      modelTestResult.value = 'ok'
      modelReply.value = res.data.reply ?? ''
      modelUsed.value = res.data.modelUsed ?? ''
    } else {
      modelTestResult.value = '连接失败'
    }
  } catch (e: any) {
    modelTestResult.value = e.message || '连接失败'
  } finally {
    modelTesting.value = false
  }
}

async function saveModel() {
  if (!modelApiKey.value) { ElMessage.warning('请先填写 API Key'); return }
  const provider = modelProvider.value === 'anthropic' ? 'anthropic' : 'openai-compatible'
  const baseURL = modelProvider.value === 'custom' ? modelBaseURL.value : providerBaseURLMap[modelProvider.value]
  modelSaving.value = true
  try {
    // 已测试通过的情况下跳过重复验证（保存秒响应，省一次推理费用）
    const skipValidate = modelTestResult.value === 'ok'
    await api.post('/config/model', {
      provider, apiKey: modelApiKey.value, baseURL, model: modelId.value,
      apiType: provider === 'openai-compatible' ? apiType.value : undefined,
      skipValidate,
    })
    ElMessage.success(skipValidate ? '✓ 模型配置已保存' : '✓ 模型配置已保存（已验证）')
    modelTestResult.value = 'ok'
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    modelSaving.value = false
  }
}
</script>

<style scoped>
.model-config-panel { width: 100%; }
.model-provider-row { display: flex; gap: 8px; flex-wrap: wrap; }
.model-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.ok { color: #67c23a; font-size: 12px; }
.err { color: #f56c6c; font-size: 12px; }
.tip {
  margin-top: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.6;
}
.base-url-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #fbbf24;
  line-height: 1.6;
}

/* ==== 会话测试结果 ==== */
.chat-result {
  margin-top: 12px;
  padding: 12px 14px;
  background: rgba(52, 211, 153, 0.06);
  border: 1px solid rgba(52, 211, 153, 0.25);
  border-radius: 10px;
}

.chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}

.model-used {
  color: rgba(255, 255, 255, 0.6);
}
.model-used strong {
  color: #a78bfa;
  font-weight: 600;
}

.chat-bubble {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  padding: 10px 12px;
}

.chat-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

.chat-content {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.warn {
  margin-top: 8px;
  font-size: 11px;
  color: #fbbf24;
  line-height: 1.6;
}

.owned-by {
  float: right;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-left: 12px;
}

.loaded-tip {
  margin-top: 8px;
  font-size: 11px;
  color: #34d399;
  line-height: 1.6;
}

.api-type-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.api-type-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}

.hint-icon {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  cursor: help;
}
.hint-icon:hover { color: #a78bfa; }

.auto-tip {
  font-size: 11px;
  color: #fbbf24;
  margin-left: 4px;
}

/* ==== 步骤引导（纵向布局） ==== */
.step-flow {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  transition: all 0.25s ease;
  position: relative;
}

/* 步骤之间的连接线 */
.step:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 21px;     /* 与 step-num 中心对齐 */
  bottom: -7px;
  width: 2px;
  height: 7px;
  background: rgba(255, 255, 255, 0.1);
}

.step.done:not(:last-child)::after {
  background: rgba(52, 211, 153, 0.4);
}

.step.active {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.12), rgba(167, 139, 250, 0.08));
  border-color: rgba(167, 139, 250, 0.5);
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.12);
}

.step.done {
  background: rgba(52, 211, 153, 0.05);
  border-color: rgba(52, 211, 153, 0.25);
}

.step-num {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step.active .step-num {
  background: linear-gradient(135deg, #667eea, #a78bfa);
  color: #fff;
  box-shadow: 0 0 10px rgba(167, 139, 250, 0.4);
}

.step.done .step-num {
  background: #34d399;
  color: #0f0c29;
}

.step-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
  min-width: 70px;
  font-weight: 500;
}

.step.active .step-label {
  color: #fff;
}

.step-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.step-done-hint {
  font-size: 11px;
  color: #34d399;
}

.step-feedback {
  margin-top: 10px;
  font-size: 12px;
}

/* ==== 错误详情 ==== */
.error-detail {
  margin-top: 10px;
  padding: 10px 12px;
  background: rgba(248, 113, 113, 0.06);
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 8px;
  max-height: 320px;
  overflow-y: auto;
}
.error-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  color: #f87171;
  font-size: 12px;
  font-weight: 600;
}
.error-detail pre {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, monospace;
}
</style>
