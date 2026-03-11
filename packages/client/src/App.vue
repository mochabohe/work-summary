<template>
  <el-config-provider :locale="zhCn">
    <div class="app-layout">
      <AppSidebar />
      <div class="app-main">
        <AppHeader />
        <div class="app-content">
          <router-view />
        </div>
      </div>
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import AppSidebar from './components/common/AppSidebar.vue'
import AppHeader from './components/common/AppHeader.vue'
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  background: var(--ws-bg-primary);
  position: relative;
  overflow: hidden;
}

/* 微妙的网格纹理背景 */
.app-layout::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 60px 60px;
  pointer-events: none;
  z-index: 0;
}

/* 右上角光晕装饰 */
.app-layout::after {
  content: '';
  position: absolute;
  top: -200px;
  right: -200px;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(102, 126, 234, 0.08) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  position: relative;
}
</style>
