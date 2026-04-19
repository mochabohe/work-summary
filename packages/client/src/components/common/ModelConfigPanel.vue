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
      <span v-if="modelTestResult" :class="modelTestResult === 'ok' ? 'ok' : 'err'">
        {{ modelTestResult === 'ok' ? '✓ 连接正常' : '✗ ' + modelTestResult }}
      </span>
    </div>
    <div class="tip">切换模型后点击"测试连接"确认可用，再"保存"生效</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api/index'
import type { ApiResponse } from '@work-summary/shared'

const modelProvider = ref<'deepseek' | 'openai' | 'custom' | 'anthropic'>('deepseek')
const modelId = ref('deepseek-chat')
const modelBaseURL = ref('')
const modelApiKey = ref('')
const modelTesting = ref(false)
const modelTestResult = ref('')

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

function onProviderChange(p: string) {
  if (modelPresets[p]?.length) modelId.value = modelPresets[p][0]
  if (p !== 'custom') modelBaseURL.value = ''
  modelTestResult.value = ''
}

async function testModel() {
  if (!modelApiKey.value) { ElMessage.warning('请先填写 API Key'); return }
  modelTesting.value = true
  modelTestResult.value = ''
  try {
    const provider = modelProvider.value === 'anthropic' ? 'anthropic' : 'openai-compatible'
    const baseURL = modelProvider.value === 'custom' ? modelBaseURL.value : providerBaseURLMap[modelProvider.value]
    const res = await api.post('/config/model', {
      provider, apiKey: modelApiKey.value, baseURL, model: modelId.value,
    }) as unknown as ApiResponse<{ valid: boolean }>
    modelTestResult.value = res.data?.valid ? 'ok' : '连接失败'
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
</style>
