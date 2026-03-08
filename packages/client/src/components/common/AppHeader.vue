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
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-title h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
  white-space: nowrap;
}

.header-steps {
  flex: 1;
  max-width: 600px;
  margin-left: 40px;
}
</style>
