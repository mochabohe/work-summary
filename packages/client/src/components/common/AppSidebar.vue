<template>
  <div class="sidebar">
    <div class="sidebar-logo">
      <h2 class="logo-text">WorkSummary</h2>
      <span class="subtitle">智能总结生成器</span>
    </div>

    <el-menu
      :default-active="route.path"
      router
      class="sidebar-menu"
    >
      <el-menu-item index="/">
        <el-icon><House /></el-icon>
        <span>首页</span>
      </el-menu-item>
      <el-menu-item index="/settings">
        <el-icon><Setting /></el-icon>
        <span>配置设置</span>
      </el-menu-item>

      <template v-if="!appStore.isGeneral">
        <el-menu-item index="/scan">
          <el-icon><FolderOpened /></el-icon>
          <span>扫描文件</span>
        </el-menu-item>
        <el-menu-item index="/analysis">
          <el-icon><DataAnalysis /></el-icon>
          <span>分析结果</span>
        </el-menu-item>
      </template>

      <el-menu-item v-if="appStore.isGeneral" index="/workspace">
        <el-icon><Notebook /></el-icon>
        <span>工作空间</span>
      </el-menu-item>

      <el-menu-item index="/feishu">
        <el-icon><ChatDotSquare /></el-icon>
        <span>补充材料</span>
      </el-menu-item>
      <el-menu-item index="/generate">
        <el-icon><MagicStick /></el-icon>
        <span>生成总结</span>
      </el-menu-item>
      <el-menu-item index="/preview">
        <el-icon><Document /></el-icon>
        <span>预览导出</span>
      </el-menu-item>
    </el-menu>

    <div class="sidebar-footer">
      <template v-if="modelStore.hasQuickSwitch">
        <div class="model-switcher">
          <div class="model-switcher-label">AI 模型</div>
          <div class="model-switcher-row">
            <el-select
              v-model="selectedModel"
              class="footer-model-select"
              size="small"
              popper-class="model-option-popper footer-model-popper"
              :loading="switchingModel"
              @change="handleQuickSwitch"
            >
              <el-option
                v-for="item in modelStore.availableModels"
                :key="item.id"
                :label="displayModelName(item)"
                :value="item.id"
              >
                <div class="footer-model-option">
                  <span class="footer-model-option-name">{{ displayModelName(item) }}</span>
                </div>
              </el-option>
            </el-select>
          </div>
          <el-button
            class="model-config-btn"
            @click="openModelConfig"
          >
            <el-icon><Operation /></el-icon>
            <span>模型配置</span>
          </el-button>
        </div>
      </template>

      <el-button
        v-else
        class="model-btn"
        @click="openModelConfig"
      >
        <el-icon><Cpu /></el-icon>
        <span>AI 模型</span>
      </el-button>

      <span class="version-tag">v1.0.0</span>
    </div>

    <el-dialog
      v-model="modelDialogVisible"
      title="模型配置"
      width="720px"
      align-center
    >
      <ModelConfigPanel @saved="handleConfigSaved" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  House,
  Setting,
  FolderOpened,
  DataAnalysis,
  ChatDotSquare,
  MagicStick,
  Document,
  Notebook,
  Cpu,
  Operation,
} from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { useModelStore } from '@/stores/model'
import api from '@/api/index'
import ModelConfigPanel from './ModelConfigPanel.vue'

const route = useRoute()
const appStore = useAppStore()
const modelStore = useModelStore()

const modelDialogVisible = ref(false)
const selectedModel = ref('')
const switchingModel = ref(false)

function displayModelName(item: { id: string; source?: 'env' | 'user' }): string {
  return item.source === 'env' ? '系统预设' : item.id
}

function detectRecommendedApiType(model: string): 'chat' | 'responses' {
  const normalized = model.toLowerCase()
  if (
    normalized.startsWith('o1')
    || normalized.startsWith('o3')
    || normalized.startsWith('gpt-5')
    || normalized.startsWith('gpt5')
    || normalized.includes('reasoner')
    || normalized.includes('reasoning')
  ) {
    return 'responses'
  }
  return 'chat'
}

function openModelConfig() {
  modelDialogVisible.value = true
}

async function handleConfigSaved() {
  modelDialogVisible.value = false
  await modelStore.refreshCurrentConfig()
}

async function handleQuickSwitch(model: string) {
  const previous = modelStore.currentModel
  if (!model || model === previous) return

  switchingModel.value = true
  try {
    const nextApiType = modelStore.current.provider === 'openai-compatible'
      ? detectRecommendedApiType(model)
      : undefined

    await api.post('/config/model/select', {
      model,
      apiType: nextApiType,
    })

    await modelStore.refreshCurrentConfig()
    selectedModel.value = modelStore.currentModel
    ElMessage.success(`已切换到 ${model}`)
  } catch (err: any) {
    selectedModel.value = previous
    ElMessage.error(err.message || '模型切换失败')
  } finally {
    switchingModel.value = false
  }
}

watch(
  () => modelStore.currentModel,
  (value) => {
    selectedModel.value = value
  },
  { immediate: true },
)

onMounted(async () => {
  await modelStore.refreshCurrentConfig()
})
</script>

<style scoped>
.sidebar {
  width: 220px;
  background: linear-gradient(180deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 4px 0 30px rgba(0, 0, 0, 0.4);
}

.sidebar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: radial-gradient(ellipse at 50% 0%, rgba(102, 126, 234, 0.15) 0%, transparent 70%);
  pointer-events: none;
}

.sidebar-logo {
  padding: 24px 20px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #667eea 0%, #a78bfa 50%, #ec4899 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.5px;
}

.sidebar-logo .subtitle {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 6px;
  display: block;
  letter-spacing: 1px;
}

.sidebar-menu {
  flex: 1;
  border-right: none;
  background: transparent;
  padding: 8px 0;
  overflow-y: auto;
}

.sidebar-menu :deep(.el-menu) {
  background: transparent;
  border: none;
}

.sidebar-menu :deep(.el-menu-item) {
  color: rgba(255, 255, 255, 0.6);
  height: 48px;
  line-height: 48px;
  margin: 2px 8px;
  border-radius: 10px;
  padding-left: 20px !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.sidebar-menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.sidebar-menu :deep(.el-menu-item:hover .el-icon) {
  color: #a78bfa;
  filter: drop-shadow(0 0 6px rgba(167, 139, 250, 0.5));
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.15) 100%);
  color: #fff;
  font-weight: 500;
}

.sidebar-menu :deep(.el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 24px;
  background: linear-gradient(180deg, #667eea, #a78bfa);
  border-radius: 0 3px 3px 0;
  box-shadow: 0 0 12px rgba(102, 126, 234, 0.6);
}

.sidebar-menu :deep(.el-menu-item.is-active .el-icon) {
  color: #a78bfa;
  filter: drop-shadow(0 0 8px rgba(167, 139, 250, 0.6));
}

.sidebar-menu :deep(.el-menu-item .el-icon) {
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.3s ease;
  font-size: 18px;
}

.sidebar-footer {
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}

.model-switcher {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-switcher-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.8px;
  padding-left: 2px;
}

.model-switcher-row {
  display: block;
}

.model-btn {
  width: 100%;
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(167, 139, 250, 0.2) !important;
  color: rgba(255, 255, 255, 0.85) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  height: 36px;
  transition: all 0.3s ease;
}

.model-btn:hover {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.18), rgba(167, 139, 250, 0.18)) !important;
  border-color: rgba(167, 139, 250, 0.5) !important;
  color: #fff !important;
}

.model-btn :deep(.el-icon) {
  color: #a78bfa;
  font-size: 14px;
}

.footer-model-select {
  width: 100%;
}

.footer-model-select :deep(.el-select__wrapper) {
  min-height: 42px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04)) !important;
  border: 1px solid rgba(167, 139, 250, 0.22) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 8px 18px rgba(7, 5, 18, 0.18);
  padding-left: 16px;
  padding-right: 14px;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.footer-model-select :deep(.el-select__selection) {
  min-width: 0;
}

.footer-model-select :deep(.el-select__wrapper:hover),
.footer-model-select :deep(.el-select__wrapper.is-focused) {
  border-color: rgba(167, 139, 250, 0.42) !important;
  background: linear-gradient(180deg, rgba(102, 126, 234, 0.18), rgba(167, 139, 250, 0.08)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 10px 24px rgba(11, 8, 26, 0.28);
}

.footer-model-select :deep(.el-select__selected-item) {
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-model-select :deep(.el-select__caret) {
  color: rgba(255, 255, 255, 0.5);
}

.model-config-btn {
  width: 100%;
  height: 36px;
  margin-top: 8px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04)) !important;
  border: 1px solid rgba(167, 139, 250, 0.22) !important;
  color: rgba(255, 255, 255, 0.78) !important;
  justify-content: center;
  gap: 6px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 8px 18px rgba(7, 5, 18, 0.18);
}

.model-config-btn:hover {
  background: linear-gradient(180deg, rgba(102, 126, 234, 0.2), rgba(167, 139, 250, 0.1)) !important;
  border-color: rgba(167, 139, 250, 0.42) !important;
  color: #fff !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 10px 24px rgba(11, 8, 26, 0.28);
}

.footer-model-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding-right: 8px;
}

.footer-model-option-name {
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  width: 100%;
}

.version-tag {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.2);
  letter-spacing: 1px;
  font-family: 'Courier New', monospace;
  text-align: center;
}
</style>
