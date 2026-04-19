<template>
  <div class="model-config-panel">
    <div class="model-provider-row">
      <el-select v-model="modelProvider" size="small" style="width:160px;" @change="onProviderChange">
        <el-option value="deepseek" label="DeepSeek（默认）" />
        <el-option value="openai" label="OpenAI" />
        <el-option value="custom" label="自定义（OpenAI 兼容）" />
        <el-option value="anthropic" label="Claude（Anthropic）" />
      </el-select>
      <el-select v-if="modelProvider !== 'custom'" v-model="modelId" size="small" style="width:200px;">
        <el-option v-for="m in modelPresets[modelProvider]" :key="m" :value="m" :label="m" />
      </el-select>
      <el-input v-else v-model="modelId" size="small" placeholder="模型 ID，如 gpt-4o" style="width:200px;" />
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
    <div class="model-actions">
      <el-button size="small" :loading="modelTesting" @click="testModel">测试连接</el-button>
      <el-button size="small" type="primary" @click="saveModel">保存</el-button>
      <span v-if="modelTestResult && !modelReply" :class="modelTestResult === 'ok' ? 'ok' : 'err'">
        {{ modelTestResult === 'ok' ? '✓ 连接正常' : '✗ ' + modelTestResult }}
      </span>
    </div>

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
    <div class="tip">切换模型后点击"测试连接"确认可用，再"保存"生效</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api/index'
import type { ApiResponse } from '@work-summary/shared'

const modelProvider = ref<'deepseek' | 'openai' | 'custom' | 'anthropic'>('deepseek')
const modelId = ref('deepseek-chat')
const modelBaseURL = ref('')
const modelApiKey = ref('')
const modelTesting = ref(false)
const modelTestResult = ref('')
const modelReply = ref('')
const modelUsed = ref('')
const requestedModel = ref('')

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

function onProviderChange(p: string) {
  if (modelPresets[p]?.length) modelId.value = modelPresets[p][0]
  if (p !== 'custom') modelBaseURL.value = ''
  modelTestResult.value = ''
  modelReply.value = ''
  modelUsed.value = ''
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
  try {
    await api.post('/config/model', { provider, apiKey: modelApiKey.value, baseURL, model: modelId.value })
    ElMessage.success('模型配置已保存')
    modelTestResult.value = 'ok'
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败')
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
</style>
