<template>
  <div class="home-view">
    <!-- Hero 区域 -->
    <div class="hero">
      <!-- 粒子/网格动画背景 -->
      <div class="hero-bg">
        <div class="hero-grid"></div>
        <div class="hero-particles">
          <div class="particle" v-for="n in 20" :key="n" :style="particleStyle(n)"></div>
        </div>
        <div class="hero-orb hero-orb-1"></div>
        <div class="hero-orb hero-orb-2"></div>
        <div class="hero-orb hero-orb-3"></div>
      </div>

      <div class="hero-content">
        <h1 class="hero-title">
          <span class="title-line">智能工作总结</span>
          <span class="title-line title-highlight">生成器</span>
        </h1>
        <p class="hero-desc">
          输入你的工作文件夹路径，自动扫描项目代码、文档，结合 Git 贡献分析和 AI 智能总结，
          一键生成专业的工作总结。
        </p>

        <div class="quick-start">
          <button class="glow-button" @click="onStart">
            <span class="glow-button-text">{{ startButtonText }}</span>
            <span class="glow-button-icon">→</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 功能卡片 -->
    <div class="features">
      <h2 class="section-title">
        <span class="section-title-text">核心功能</span>
        <span class="section-title-line"></span>
      </h2>
      <div class="features-grid">
        <div
          class="feature-card"
          v-for="(feature, index) in features"
          :key="feature.title"
          :style="{ animationDelay: `${index * 0.1}s` }"
        >
          <div class="feature-card-glow"></div>
          <div class="feature-icon">{{ feature.icon }}</div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.desc }}</p>
        </div>
      </div>
    </div>

    <!-- 使用流程 — 水平时间线 -->
    <div class="workflow">
      <h2 class="section-title">
        <span class="section-title-text">使用流程</span>
        <span class="section-title-line"></span>
      </h2>
      <div class="timeline">
        <div class="timeline-track"></div>
        <div class="timeline-track-fill"></div>
        <div
          class="timeline-item"
          v-for="(step, index) in steps"
          :key="index"
        >
          <div class="timeline-dot">
            <span class="timeline-dot-num">{{ index + 1 }}</span>
          </div>
          <div class="timeline-content">
            <h4>{{ step.title }}</h4>
            <p>{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

const startButtonText = computed(() =>
  appStore.isGeneral ? '进入工作空间' : '开始使用',
)

function onStart() {
  if (appStore.isGeneral) {
    router.push('/workspace')
  } else {
    router.push('/settings')
  }
}

const features = [
  {
    icon: '🔍',
    title: '智能项目扫描',
    desc: '自动识别文件夹中的项目边界和技术栈，支持前端、后端、Python、Java 等多种项目类型。',
  },
  {
    icon: '📊',
    title: 'Git 贡献分析',
    desc: '通过 Git 日志精确识别个人代码贡献，统计提交数、代码行数、开发时间线等关键指标。',
  },
  {
    icon: '🤖',
    title: 'AI 智能总结',
    desc: '基于 DeepSeek 大模型，按维度生成专业、有力度的工作总结，支持流式输出和局部润色。',
  },
  {
    icon: '📄',
    title: '多格式文档解析',
    desc: '自动解析 Word、PPT、PDF 等文档内容，提取关键信息辅助总结生成。',
  },
  {
    icon: '📋',
    title: '补充材料',
    desc: '支持粘贴会议纪要、周报等补充材料，可添加多份文档辅助 AI 生成更全面的总结。',
  },
  {
    icon: '📥',
    title: '多格式导出',
    desc: '生成的总结支持 Markdown、Word、PDF、PPT 多种格式导出，满足不同提交需求。',
  },
]

const steps = [
  { title: '配置设置', desc: '配置 API Key、Git 用户名等' },
  { title: '扫描文件', desc: '输入路径，自动识别项目' },
  { title: '查看分析', desc: '预览技术栈、Git 统计' },
  { title: '补充材料', desc: '粘贴会议纪要等补充' },
  { title: 'AI 生成', desc: '智能生成结构化总结' },
  { title: '预览导出', desc: '编辑并导出多种格式' },
]

const particleStyle = (n: number) => {
  const left = Math.random() * 100
  const top = Math.random() * 100
  const size = 2 + Math.random() * 3
  const duration = 3 + Math.random() * 4
  const delay = Math.random() * 5
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${size}px`,
    height: `${size}px`,
    animationDuration: `${duration}s`,
    animationDelay: `${delay}s`,
  }
}
</script>

<style scoped>
.home-view {
  max-width: 1100px;
  margin: 0 auto;
  padding-bottom: 60px;
}

/* ======================== Hero 区域 ======================== */
.hero {
  position: relative;
  text-align: center;
  padding: 60px 20px 50px;
  margin: -24px -24px 0;
  overflow: hidden;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Hero 背景层 */
.hero-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

/* 网格动画 */
.hero-grid {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background-image:
    linear-gradient(rgba(102, 126, 234, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(102, 126, 234, 0.06) 1px, transparent 1px);
  background-size: 40px 40px;
  animation: ws-grid-move 8s linear infinite;
}

/* 粒子效果 */
.hero-particles {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.particle {
  position: absolute;
  background: rgba(102, 126, 234, 0.5);
  border-radius: 50%;
  animation: particle-float linear infinite;
}

@keyframes particle-float {
  0% {
    opacity: 0;
    transform: translateY(0) scale(0);
  }
  10% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-100px) scale(0.5);
  }
}

/* 光球装饰 */
.hero-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
  animation: orb-pulse 6s ease-in-out infinite alternate;
}

.hero-orb-1 {
  width: 300px;
  height: 300px;
  background: rgba(102, 126, 234, 0.3);
  top: -100px;
  left: 10%;
  animation-delay: 0s;
}

.hero-orb-2 {
  width: 250px;
  height: 250px;
  background: rgba(167, 139, 250, 0.25);
  bottom: -80px;
  right: 15%;
  animation-delay: 2s;
}

.hero-orb-3 {
  width: 200px;
  height: 200px;
  background: rgba(236, 72, 153, 0.15);
  top: 20%;
  right: 5%;
  animation-delay: 4s;
}

@keyframes orb-pulse {
  0% { transform: scale(1); opacity: 0.3; }
  100% { transform: scale(1.3); opacity: 0.5; }
}

/* Hero 内容 */
.hero-content {
  position: relative;
  z-index: 1;
  animation: ws-fade-in-up 0.8s ease-out;
}

.hero-title {
  font-size: 42px;
  font-weight: 800;
  margin-bottom: 20px;
  line-height: 1.3;
}

.title-line {
  display: block;
  color: var(--ws-text-primary);
}

.title-highlight {
  background: linear-gradient(135deg, #667eea 0%, #a78bfa 40%, #ec4899 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 20px rgba(102, 126, 234, 0.3));
}

.hero-desc {
  font-size: 16px;
  color: var(--ws-text-secondary);
  line-height: 1.8;
  max-width: 560px;
  margin: 0 auto 36px;
}

/* 发光按钮 */
.glow-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 36px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow:
    0 4px 20px rgba(102, 126, 234, 0.4),
    0 0 40px rgba(102, 126, 234, 0.1);
  overflow: hidden;
}

.glow-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.6s ease;
}

.glow-button:hover {
  transform: translateY(-3px) scale(1.03);
  box-shadow:
    0 8px 30px rgba(102, 126, 234, 0.5),
    0 0 60px rgba(102, 126, 234, 0.2),
    0 0 100px rgba(118, 75, 162, 0.1);
}

.glow-button:hover::before {
  left: 100%;
}

.glow-button:active {
  transform: translateY(-1px) scale(1.01);
}

.glow-button-icon {
  transition: transform 0.3s ease;
  font-size: 18px;
}

.glow-button:hover .glow-button-icon {
  transform: translateX(4px);
}

/* ======================== Section 通用标题 ======================== */
.section-title {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  padding: 0 20px;
}

.section-title-text {
  font-size: 24px;
  font-weight: 700;
  color: var(--ws-text-primary);
  white-space: nowrap;
  background: linear-gradient(135deg, #e8eaf6, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.section-title-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(167, 139, 250, 0.3), transparent);
}

/* ======================== 功能卡片 ======================== */
.features {
  margin-bottom: 60px;
  padding: 0 20px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.feature-card {
  position: relative;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 28px 24px;
  text-align: center;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  animation: ws-fade-in-up 0.6s ease-out both;
}

/* 卡片顶部光晕 */
.feature-card-glow {
  position: absolute;
  top: -50px;
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  height: 80px;
  background: radial-gradient(ellipse, rgba(102, 126, 234, 0.15) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.4s ease;
}

.feature-card:hover {
  transform: translateY(-8px);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(102, 126, 234, 0.3);
  box-shadow:
    0 20px 40px rgba(0, 0, 0, 0.4),
    0 0 40px rgba(102, 126, 234, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.feature-card:hover .feature-card-glow {
  opacity: 1;
}

.feature-icon {
  font-size: 40px;
  margin-bottom: 16px;
  display: inline-block;
  animation: ws-float 4s ease-in-out infinite;
}

.feature-card h3 {
  font-size: 16px;
  color: var(--ws-text-primary);
  margin-bottom: 10px;
  font-weight: 600;
}

.feature-card p {
  font-size: 13px;
  color: var(--ws-text-secondary);
  line-height: 1.7;
}

/* ======================== 水平时间线 ======================== */
.workflow {
  margin-bottom: 48px;
  padding: 0 20px;
}

.timeline {
  position: relative;
  display: flex;
  justify-content: space-between;
  padding: 30px 0 0;
}

/* 时间线轨道 */
.timeline-track {
  position: absolute;
  top: 44px;
  left: 5%;
  right: 5%;
  height: 2px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 1px;
}

.timeline-track-fill {
  position: absolute;
  top: 44px;
  left: 5%;
  right: 5%;
  height: 2px;
  background: linear-gradient(90deg, #667eea, #a78bfa, #ec4899);
  border-radius: 1px;
  opacity: 0.5;
}

.timeline-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
  z-index: 1;
  animation: ws-fade-in-up 0.5s ease-out both;
}

.timeline-item:nth-child(3) { animation-delay: 0.1s; }
.timeline-item:nth-child(4) { animation-delay: 0.2s; }
.timeline-item:nth-child(5) { animation-delay: 0.3s; }
.timeline-item:nth-child(6) { animation-delay: 0.4s; }
.timeline-item:nth-child(7) { animation-delay: 0.5s; }
.timeline-item:nth-child(8) { animation-delay: 0.6s; }

/* 时间线圆点 */
.timeline-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #a78bfa);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  box-shadow:
    0 0 16px rgba(102, 126, 234, 0.4),
    0 0 30px rgba(102, 126, 234, 0.15);
  transition: all 0.3s ease;
  position: relative;
}

/* 圆点外圈脉冲 */
.timeline-dot::before {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid rgba(102, 126, 234, 0.3);
  animation: dot-ring-pulse 3s ease-in-out infinite;
}

@keyframes dot-ring-pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.5); opacity: 0; }
}

.timeline-dot-num {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.timeline-item:hover .timeline-dot {
  transform: scale(1.2);
  box-shadow:
    0 0 24px rgba(102, 126, 234, 0.6),
    0 0 50px rgba(102, 126, 234, 0.2);
}

/* 时间线文本 */
.timeline-content {
  text-align: center;
  padding: 0 4px;
}

.timeline-content h4 {
  font-size: 13px;
  color: var(--ws-text-primary);
  font-weight: 600;
  margin-bottom: 4px;
}

.timeline-content p {
  font-size: 11px;
  color: var(--ws-text-muted);
  line-height: 1.5;
}

/* ======================== 响应式 ======================== */
@media (max-width: 900px) {
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .hero-title {
    font-size: 32px;
  }

  .timeline {
    flex-wrap: wrap;
    gap: 20px;
    justify-content: center;
  }

  .timeline-track,
  .timeline-track-fill {
    display: none;
  }

  .timeline-item {
    flex: 0 0 30%;
  }
}

@media (max-width: 600px) {
  .features-grid {
    grid-template-columns: 1fr;
  }

  .hero-title {
    font-size: 26px;
  }

  .hero-desc {
    font-size: 14px;
  }

  .timeline-item {
    flex: 0 0 45%;
  }
}
</style>
