<template>
  <div class="header">
    <div class="header-title">
      <h3>{{ pageTitle }}</h3>
    </div>
    <div class="header-steps">
      <el-steps :active="currentStep" finish-status="success" simple>
        <el-step title="配置" />
        <el-step title="扫描" />
        <el-step title="分析" />
        <el-step title="补充" />
        <el-step title="生成" />
        <el-step title="导出" />
      </el-steps>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const pageTitles: Record<string, string> = {
  '/': '首页',
  '/settings': '配置设置',
  '/scan': '扫描文件',
  '/analysis': '分析结果',
  '/feishu': '补充材料',
  '/generate': '生成总结',
  '/preview': '预览导出',
}

const stepMap: Record<string, number> = {
  '/settings': 0,
  '/scan': 1,
  '/analysis': 2,
  '/feishu': 3,
  '/generate': 4,
  '/preview': 5,
}

const pageTitle = computed(() => pageTitles[route.path] || '智能工作总结生成器')
const currentStep = computed(() => stepMap[route.path] ?? -1)
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
</style>
