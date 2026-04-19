<template>
  <div class="workspace-view">
    <div class="ws-placeholder">
      <div class="icon">📋</div>
      <h2>工作空间</h2>
      <p>下个阶段将在此处实现工作项录入、文档导入与管理功能。</p>
      <p class="hint">当前处于 Phase 1 地基阶段，Phase 2 将上线完整功能。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.workspace-view {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ws-placeholder {
  text-align: center;
  padding: 48px 32px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(167, 139, 250, 0.3);
  border-radius: 16px;
  max-width: 480px;
}

.icon {
  font-size: 56px;
  margin-bottom: 16px;
}

h2 {
  font-size: 22px;
  color: var(--ws-text-primary, #fff);
  margin-bottom: 8px;
}

p {
  font-size: 14px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.6));
  line-height: 1.7;
  margin: 4px 0;
}

.hint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--ws-text-muted, rgba(255,255,255,0.4));
}
</style>
