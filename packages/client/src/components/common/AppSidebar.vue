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

      <!-- 研发模式专属：Git 扫描流程 -->
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

      <!-- 通用模式专属：工作空间 -->
      <el-menu-item v-if="appStore.isGeneral" index="/workspace">
        <el-icon><Notebook /></el-icon>
        <span>工作空间</span>
      </el-menu-item>

      <el-menu-item index="/feishu">
        <el-icon><ChatDotSquare /></el-icon>
        <span>补充材料</span>
      </el-menu-item>
      <el-menu-item :index="appStore.isGeneral ? '/workspace/generate' : '/generate'">
        <el-icon><MagicStick /></el-icon>
        <span>生成总结</span>
      </el-menu-item>
      <el-menu-item index="/preview">
        <el-icon><Document /></el-icon>
        <span>预览导出</span>
      </el-menu-item>
    </el-menu>

    <div class="sidebar-footer">
      <el-button
        class="model-btn"
        @click="modelDialogVisible = true"
      >
        <el-icon><Cpu /></el-icon>
        <span>AI 模型</span>
      </el-button>
      <span class="version-tag">v1.0.0</span>
    </div>

    <el-dialog
      v-model="modelDialogVisible"
      title="AI 模型配置"
      width="520px"
      align-center
    >
      <ModelConfigPanel />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
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
} from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import ModelConfigPanel from './ModelConfigPanel.vue'

const route = useRoute()
const appStore = useAppStore()
const modelDialogVisible = ref(false)
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

/* 侧栏顶部微光效果 */
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

/* Logo 区域 */
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

/* 菜单覆盖 */
.sidebar-menu {
  flex: 1;
  border-right: none;
  background: transparent;
  padding: 8px 0;
  overflow-y: auto;
}

/* Element Plus menu 深色覆盖 */
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

/* 激活状态 */
.sidebar-menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.15) 100%);
  color: #fff;
  font-weight: 500;
}

/* 左侧亮色指示条 */
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

/* Footer */
.sidebar-footer {
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
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

.version-tag {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.2);
  letter-spacing: 1px;
  font-family: 'Courier New', monospace;
  text-align: center;
}
</style>
