<template>
  <div class="onboarding">
    <div class="onboarding-bg">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
    </div>

    <div class="onboarding-content">
      <h1 class="title">
        <span>欢迎使用</span>
        <span class="title-highlight">智能工作总结</span>
      </h1>
      <p class="subtitle">请选择您的身份，我们将为您定制最合适的工作流</p>

      <div class="mode-cards">
        <div
          class="mode-card"
          :class="{ active: hoverMode === 'developer' }"
          @mouseenter="hoverMode = 'developer'"
          @mouseleave="hoverMode = null"
          @click="choose('developer')"
        >
          <div class="mode-icon">💻</div>
          <h3>研发岗位</h3>
          <p class="mode-desc">通过 Git 日志自动分析代码贡献</p>
          <ul class="mode-features">
            <li>✓ 自动扫描代码仓库</li>
            <li>✓ Git 贡献量化分析</li>
            <li>✓ 文档 + 代码综合总结</li>
          </ul>
          <div class="mode-required">
            <span class="required-tag">需要配置</span>
            <span>Git 用户名、仓库路径</span>
          </div>
          <button class="mode-btn">选择此模式</button>
        </div>

        <div
          class="mode-card"
          :class="{ active: hoverMode === 'general' }"
          @mouseenter="hoverMode = 'general'"
          @mouseleave="hoverMode = null"
          @click="choose('general')"
        >
          <div class="mode-icon">📋</div>
          <h3>通用岗位</h3>
          <p class="mode-desc">手动录入或导入文档生成总结</p>
          <ul class="mode-features">
            <li>✓ 手动录入工作项</li>
            <li>✓ Word/PDF/Excel 导入</li>
            <li>✓ 周报/月报/季报/年报模板</li>
          </ul>
          <div class="mode-required">
            <span class="required-tag optional">无需配置</span>
            <span>产品/运营/设计等任何岗位</span>
          </div>
          <button class="mode-btn">选择此模式</button>
        </div>
      </div>

      <p class="hint">稍后可在「设置」中随时切换模式</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import type { AppMode } from '@work-summary/shared'

const router = useRouter()
const appStore = useAppStore()
const hoverMode = ref<AppMode | null>(null)

function choose(m: AppMode) {
  appStore.setMode(m)
  if (m === 'developer') {
    router.replace('/settings')
  } else {
    router.replace('/workspace')
  }
}
</script>

<style scoped>
.onboarding {
  min-height: 100vh;
  width: 100%;
  background: var(--ws-bg-primary, #0f0c29);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.onboarding-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.35;
  animation: orb-float 8s ease-in-out infinite alternate;
}
.orb-1 { width: 400px; height: 400px; background: #667eea; top: -100px; left: 10%; }
.orb-2 { width: 350px; height: 350px; background: #a78bfa; bottom: -80px; right: 12%; animation-delay: 2s; }
.orb-3 { width: 250px; height: 250px; background: #ec4899; top: 40%; right: 8%; animation-delay: 4s; }

@keyframes orb-float {
  0%   { transform: translate(0, 0) scale(1); opacity: 0.3; }
  100% { transform: translate(40px, -30px) scale(1.15); opacity: 0.5; }
}

.onboarding-content {
  position: relative;
  z-index: 1;
  max-width: 1000px;
  padding: 40px 24px;
  text-align: center;
}

.title {
  font-size: 40px;
  font-weight: 800;
  margin-bottom: 16px;
  color: var(--ws-text-primary, #fff);
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}
.title-highlight {
  background: linear-gradient(135deg, #667eea 0%, #a78bfa 40%, #ec4899 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 20px rgba(102, 126, 234, 0.3));
}

.subtitle {
  font-size: 16px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.6));
  margin-bottom: 48px;
}

.mode-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 28px;
  margin-bottom: 32px;
}

.mode-card {
  position: relative;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 36px 32px;
  text-align: left;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.mode-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, #667eea, #a78bfa, #ec4899);
  opacity: 0;
  transition: opacity 0.3s;
}

.mode-card:hover,
.mode-card.active {
  transform: translateY(-6px);
  border-color: rgba(167, 139, 250, 0.4);
  background: rgba(255, 255, 255, 0.07);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 60px rgba(102, 126, 234, 0.15);
}
.mode-card:hover::before,
.mode-card.active::before { opacity: 1; }

.mode-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.mode-card h3 {
  font-size: 22px;
  color: var(--ws-text-primary, #fff);
  margin: 0 0 8px;
  font-weight: 700;
}

.mode-desc {
  font-size: 14px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.6));
  margin-bottom: 20px;
}

.mode-features {
  list-style: none;
  padding: 0;
  margin: 0 0 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mode-features li {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.7));
}

.mode-required {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
  padding: 10px 0 16px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
}

.required-tag {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(236, 72, 153, 0.15);
  color: #ec4899;
  font-weight: 500;
}
.required-tag.optional {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
}

.mode-btn {
  width: 100%;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}
.mode-card:hover .mode-btn {
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
  transform: translateY(-2px);
}

.hint {
  font-size: 12px;
  color: var(--ws-text-muted, rgba(255,255,255,0.4));
}

@media (max-width: 760px) {
  .mode-cards { grid-template-columns: 1fr; }
  .title { font-size: 28px; }
}
</style>
