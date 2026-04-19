<template>
  <div class="header">
    <div class="header-title">
      <h3>{{ pageTitle }}</h3>
    </div>
    <div class="header-steps">
      <el-steps :active="currentStep" finish-status="success" simple>
        <el-step v-for="s in steps" :key="s" :title="s" />
      </el-steps>
    </div>
    <div class="header-mode">
      <el-dropdown trigger="click" @command="onModeCommand">
        <span class="mode-badge" :class="appStore.mode ?? ''">
          <span class="mode-dot"></span>
          <span>{{ modeLabel }}</span>
          <el-icon class="mode-caret"><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              command="developer"
              :disabled="appStore.mode === 'developer'"
            >
              💻 研发模式（Git 扫描）
            </el-dropdown-item>
            <el-dropdown-item
              command="general"
              :disabled="appStore.mode === 'general'"
            >
              📋 通用模式（手动/文档）
            </el-dropdown-item>
            <el-dropdown-item divided command="onboarding">
              重新选择身份
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import type { AppMode } from '@work-summary/shared'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const pageTitles: Record<string, string> = {
  '/': '首页',
  '/settings': '配置设置',
  '/scan': '扫描文件',
  '/analysis': '分析结果',
  '/feishu': '补充材料',
  '/generate': '生成总结',
  '/preview': '预览导出',
  '/workspace': '工作空间',
  '/workspace/import': '文档导入',
  '/workspace/manual': '手动录入',
}

// 不同模式下步骤序列不同
const developerSteps = ['配置', '扫描', '分析', '补充', '生成', '导出']
const generalSteps = ['身份', '录入', '补充', '生成', '导出']

const developerStepMap: Record<string, number> = {
  '/settings': 0, '/scan': 1, '/analysis': 2, '/feishu': 3, '/generate': 4, '/preview': 5,
}
const generalStepMap: Record<string, number> = {
  '/workspace': 1, '/feishu': 2, '/generate': 3, '/preview': 4,
}

const steps = computed(() => appStore.isGeneral ? generalSteps : developerSteps)
const currentStep = computed(() => {
  const map = appStore.isGeneral ? generalStepMap : developerStepMap
  return map[route.path] ?? -1
})

const pageTitle = computed(() => pageTitles[route.path] || '智能工作总结生成器')

const modeLabel = computed(() => {
  if (appStore.mode === 'developer') return '研发模式'
  if (appStore.mode === 'general') return '通用模式'
  return '未选择'
})

function onModeCommand(cmd: AppMode | 'onboarding') {
  if (cmd === 'onboarding') {
    appStore.resetMode()
    router.push('/onboarding')
    return
  }
  appStore.setMode(cmd)
  if (cmd === 'developer' && !['/settings','/scan','/analysis','/generate','/preview','/feishu'].includes(route.path)) {
    router.push('/')
  }
  if (cmd === 'general' && !['/workspace','/generate','/preview','/feishu'].includes(route.path)) {
    router.push('/workspace')
  }
}
</script>

<style scoped>
.header {
  background: rgba(15, 15, 35, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding: 14px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  position: relative;
}

/* 底部微妙渐变光带 */
.header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.3), rgba(167, 139, 250, 0.3), transparent);
}

.header-title h3 {
  margin: 0;
  font-size: 16px;
  color: var(--ws-text-primary);
  white-space: nowrap;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.header-steps {
  flex: 1;
  max-width: 600px;
  margin-left: 40px;
}

/* Element Plus Steps 深色覆盖 */
.header-steps :deep(.el-steps--simple) {
  background: transparent;
  border-radius: var(--ws-radius-md);
  padding: 8px 16px;
}

.header-steps :deep(.el-step__title) {
  color: rgba(255, 255, 255, 0.35) !important;
  font-size: 12px;
  font-weight: 400;
}

.header-steps :deep(.el-step__title.is-process) {
  color: #fff !important;
  font-weight: 600;
}

.header-steps :deep(.el-step__title.is-finish) {
  color: rgba(255, 255, 255, 0.7) !important;
}

/* 自定义步骤圆点 */
.header-steps :deep(.el-step__icon) {
  width: 22px;
  height: 22px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.header-steps :deep(.el-step__icon-inner) {
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  font-weight: 600;
}

/* 进行中的步骤 — 渐变发光 */
.header-steps :deep(.el-step__head.is-process .el-step__icon) {
  background: linear-gradient(135deg, #667eea, #a78bfa);
  box-shadow: 0 0 16px rgba(102, 126, 234, 0.5), 0 0 30px rgba(102, 126, 234, 0.2);
}

.header-steps :deep(.el-step__head.is-process .el-step__icon-inner) {
  color: #fff;
}

/* 已完成的步骤 */
.header-steps :deep(.el-step__head.is-finish .el-step__icon) {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.6), rgba(167, 139, 250, 0.6));
}

.header-steps :deep(.el-step__head.is-finish .el-step__icon-inner) {
  color: #fff;
}

/* 步骤线 */
.header-steps :deep(.el-step__line) {
  background: rgba(255, 255, 255, 0.08) !important;
}

.header-steps :deep(.el-step__head.is-finish + .el-step__line),
.header-steps :deep(.is-finish .el-step__line) {
  background: linear-gradient(90deg, rgba(102, 126, 234, 0.4), rgba(167, 139, 250, 0.4)) !important;
}

/* ======================== 模式徽标 ======================== */
.header-mode {
  margin-left: 24px;
  flex-shrink: 0;
}

.mode-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
}

.mode-badge:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(167, 139, 250, 0.4);
  color: #fff;
}

.mode-badge.developer {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
  border-color: rgba(102, 126, 234, 0.4);
}
.mode-badge.developer .mode-dot {
  background: #667eea;
  box-shadow: 0 0 8px #667eea;
}

.mode-badge.general {
  background: linear-gradient(135deg, rgba(52, 211, 153, 0.18), rgba(16, 185, 129, 0.18));
  border-color: rgba(52, 211, 153, 0.4);
}
.mode-badge.general .mode-dot {
  background: #34d399;
  box-shadow: 0 0 8px #34d399;
}

.mode-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
}

.mode-caret {
  font-size: 10px;
  opacity: 0.7;
}
</style>
