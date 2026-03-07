<template>
  <div class="sidebar">
    <div class="sidebar-logo">
      <h2>WorkSummary</h2>
      <span class="subtitle">年终总结生成器</span>
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
      <el-menu-item index="/scan">
        <el-icon><FolderOpened /></el-icon>
        <span>扫描文件</span>
      </el-menu-item>
      <el-menu-item index="/analysis">
        <el-icon><DataAnalysis /></el-icon>
        <span>分析结果</span>
      </el-menu-item>
      <el-menu-item index="/feishu">
        <el-icon><ChatDotSquare /></el-icon>
        <span>补充文档</span>
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
      <el-tag type="info" size="small">v1.0.0</el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import {
  House,
  Setting,
  FolderOpened,
  DataAnalysis,
  ChatDotSquare,
  MagicStick,
  Document,
} from '@element-plus/icons-vue'

const route = useRoute()
</script>

<style scoped>
.sidebar {
  width: 220px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-logo {
  padding: 20px 16px;
  border-bottom: 1px solid #e4e7ed;
}

.sidebar-logo h2 {
  font-size: 18px;
  color: #303133;
  margin: 0;
}

.sidebar-logo .subtitle {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  display: block;
}

.sidebar-menu {
  flex: 1;
  border-right: none;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid #e4e7ed;
  text-align: center;
}
</style>
