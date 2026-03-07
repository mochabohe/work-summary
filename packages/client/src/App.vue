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
  background-color: #f5f7fa;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
</style>
