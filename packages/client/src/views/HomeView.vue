<template>
  <div class="home-view">
    <div class="hero">
      <h1>年终工作总结生成器</h1>
      <p class="hero-desc">
        输入你的工作文件夹路径，自动扫描项目代码、文档，结合 Git 贡献分析和 AI 智能总结，
        一键生成专业的年终工作总结。
      </p>

      <div class="quick-start">
        <el-button type="primary" size="large" @click="router.push('/settings')">
          开始使用
        </el-button>
      </div>
    </div>

    <div class="features">
      <h2>核心功能</h2>
      <el-row :gutter="20">
        <el-col :span="8" v-for="feature in features" :key="feature.title">
          <el-card shadow="hover" class="feature-card">
            <div class="feature-icon">{{ feature.icon }}</div>
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.desc }}</p>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div class="workflow">
      <h2>使用流程</h2>
      <el-steps direction="vertical" :active="6">
        <el-step title="配置设置" description="配置 DeepSeek API Key、Git 用户名等基础信息" />
        <el-step title="扫描文件" description="输入工作文件夹路径，自动识别项目并分析文件结构" />
        <el-step title="查看分析" description="预览每个项目的技术栈、Git 贡献统计、文档摘要" />
        <el-step title="补充文档" description="通过飞书 API 或手动粘贴补充额外的工作文档" />
        <el-step title="AI 生成" description="选择总结维度，AI 自动生成结构化的年终工作总结" />
        <el-step title="预览导出" description="在线预览和编辑，支持导出 Markdown、Word、PDF" />
      </el-steps>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

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
    desc: '基于 DeepSeek 大模型，按维度生成专业、有力度的年终总结，支持流式输出和局部润色。',
  },
  {
    icon: '📄',
    title: '多格式文档解析',
    desc: '自动解析 Word、PPT、PDF 等文档内容，提取关键信息辅助总结生成。',
  },
  {
    icon: '📋',
    title: '补充文档',
    desc: '支持粘贴飞书文档、会议纪要、周报等补充内容，可添加多份文档辅助生成。',
  },
  {
    icon: '📥',
    title: '多格式导出',
    desc: '生成的总结支持 Markdown、Word、PDF 多种格式导出，满足不同提交需求。',
  },
]
</script>

<style scoped>
.home-view {
  max-width: 1000px;
  margin: 0 auto;
}

.hero {
  text-align: center;
  padding: 48px 0 40px;
}

.hero h1 {
  font-size: 32px;
  color: #303133;
  margin-bottom: 16px;
}

.hero-desc {
  font-size: 16px;
  color: #606266;
  line-height: 1.8;
  max-width: 600px;
  margin: 0 auto 32px;
}

.features {
  margin-bottom: 48px;
}

.features h2,
.workflow h2 {
  font-size: 22px;
  color: #303133;
  margin-bottom: 24px;
}

.feature-card {
  text-align: center;
  margin-bottom: 20px;
  min-height: 200px;
}

.feature-icon {
  font-size: 36px;
  margin-bottom: 12px;
}

.feature-card h3 {
  font-size: 16px;
  color: #303133;
  margin-bottom: 8px;
}

.feature-card p {
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}

.workflow {
  margin-bottom: 48px;
}
</style>
