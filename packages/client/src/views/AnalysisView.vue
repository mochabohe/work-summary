<template>
  <div class="analysis-view">
    <!-- 未扫描提示 -->
    <el-empty v-if="!projectStore.scanResult" description="请先完成文件扫描">
      <el-button type="primary" @click="router.push('/scan')">去扫描</el-button>
    </el-empty>

    <template v-else>
      <!-- 分析按钮（有项目时显示） -->
      <el-card v-if="projectStore.selectedProjects.size > 0 && !projectStore.analyzing && !allSelectedAnalyzed">
        <div class="analyze-prompt">
          <p>已选择 {{ projectStore.selectedProjects.size }} 个项目，点击开始深度分析</p>
          <el-button type="primary" size="large" @click="startAnalysis" :loading="projectStore.analyzing">
            开始分析
          </el-button>
        </div>
      </el-card>

      <!-- 无项目时提示（仅有独立文档） -->
      <el-card v-if="projectStore.selectedProjects.size === 0 && !projectStore.analyzing">
        <div class="analyze-prompt">
          <p>已扫描到 {{ projectStore.scanResult?.standaloneDocuments?.length || 0 }} 份独立文档，无 Git 项目需要分析，可直接进入下一步</p>
        </div>
      </el-card>

      <!-- 分析进度 -->
      <el-card v-if="projectStore.analyzing">
        <el-progress :percentage="analysisProgress" />
        <p class="progress-text">正在分析: {{ currentProject }}</p>
      </el-card>

      <!-- 分析结果列表（只展示选中的项目） -->
      <div v-if="projectStore.analyses.size > 0" class="analysis-list">
        <el-card
          v-for="[path, analysis] in selectedAnalyses"
          :key="path"
          class="analysis-card"
        >
          <template #header>
            <div class="card-header">
              <div class="card-header-left">
                <span class="project-name">{{ analysis.project.name }}</span>
                <el-tag
                  v-if="!analysis.gitStats || analysis.gitStats.totalCommits === 0"
                  size="small"
                  type="warning"
                >
                  无个人贡献
                </el-tag>
              </div>
              <div class="tech-tags">
                <el-tag
                  v-for="tech in analysis.project.techStack"
                  :key="tech"
                  size="small"
                >
                  {{ tech }}
                </el-tag>
              </div>
            </div>
          </template>

          <el-row :gutter="20">
            <!-- 无贡献提示 -->
            <el-col :span="24" v-if="!analysis.gitStats || analysis.gitStats.totalCommits === 0">
              <el-alert
                title="该项目在指定时间段内未检测到你的 Git 提交记录，将不会纳入总结生成"
                type="warning"
                :closable="false"
                show-icon
                style="margin-bottom: 12px;"
              />
            </el-col>

            <!-- Git 统计 -->
            <el-col :span="12" v-if="analysis.gitStats && analysis.gitStats.totalCommits > 0">
              <h4>Git 贡献统计</h4>
              <div class="stat-grid">
                <div class="stat-item">
                  <div class="stat-value">{{ analysis.gitStats.totalCommits }}</div>
                  <div class="stat-label">总提交数</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value add">+{{ analysis.gitStats.linesAdded.toLocaleString() }}</div>
                  <div class="stat-label">新增代码行</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value del">-{{ analysis.gitStats.linesDeleted.toLocaleString() }}</div>
                  <div class="stat-label">删除代码行</div>
                </div>
              </div>
              <div class="time-range" v-if="analysis.gitStats.firstCommitDate">
                <el-icon><Timer /></el-icon>
                {{ analysis.gitStats.firstCommitDate.split(' ')[0] }} ~
                {{ analysis.gitStats.lastCommitDate.split(' ')[0] }}
              </div>
            </el-col>

            <!-- 代码结构 -->
            <el-col :span="12">
              <h4>项目结构</h4>
              <div v-if="analysis.codeStructure.modules.length > 0">
                <p class="info-label">模块:</p>
                <el-tag
                  v-for="m in analysis.codeStructure.modules"
                  :key="m"
                  size="small"
                  type="info"
                  class="module-tag"
                >
                  {{ m }}
                </el-tag>
              </div>
              <div v-if="analysis.documents.length > 0" class="docs-section">
                <p class="info-label">文档 ({{ analysis.documents.length }}个):</p>
                <div v-for="doc in analysis.documents.slice(0, 5)" :key="doc.filename" class="doc-item">
                  <el-tag size="small" type="warning">{{ doc.type }}</el-tag>
                  {{ doc.filename }}
                </div>
              </div>
            </el-col>
          </el-row>

          <!-- 关键提交记录 -->
          <div v-if="analysis.gitStats?.commitMessages?.length" class="commits-section">
            <h4>关键提交记录</h4>
            <ul class="commit-list">
              <li v-for="(msg, i) in analysis.gitStats.commitMessages.slice(0, 8)" :key="i">
                {{ msg }}
              </li>
            </ul>
          </div>
        </el-card>
      </div>

      <!-- 操作栏 -->
      <div v-if="allSelectedAnalyzed" class="action-bar">
        <el-button @click="router.push('/scan')">返回扫描</el-button>
        <el-button type="primary" size="large" @click="router.push('/feishu')">
          下一步：补充材料
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Timer } from '@element-plus/icons-vue'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'
import { analyzeProject } from '@/api/analysis'

const router = useRouter()
const projectStore = useProjectStore()
const settings = useSettingsStore()

const analysisProgress = ref(0)
const currentProject = ref('')

/** 只展示选中项目的分析结果 */
const selectedAnalyses = computed(() => {
  const result: [string, any][] = []
  for (const [path, analysis] of projectStore.analyses) {
    if (projectStore.selectedProjects.has(path)) {
      result.push([path, analysis])
    }
  }
  return result
})

/** 检查所有选中的项目是否都已分析完成（无项目时视为完成） */
const allSelectedAnalyzed = computed(() => {
  if (projectStore.selectedProjects.size === 0) return true
  for (const path of projectStore.selectedProjects) {
    if (!projectStore.analyses.has(path)) return false
  }
  return true
})

async function startAnalysis() {
  projectStore.analyzing = true
  // 清除旧的分析结果，只保留当前选中的项目
  projectStore.clearUnselectedAnalyses()
  const selectedPaths = Array.from(projectStore.selectedProjects)

  for (let i = 0; i < selectedPaths.length; i++) {
    const projectPath = selectedPaths[i]
    const project = projectStore.scanResult?.projects.find((p) => p.path === projectPath)
    currentProject.value = project?.name || projectPath
    analysisProgress.value = Math.round(((i + 1) / selectedPaths.length) * 100)

    try {
      const analysis = await analyzeProject(projectPath, settings.gitAuthor, settings.getGitSince(), settings.getGitUntil())
      projectStore.setAnalysis(projectPath, analysis)
    } catch (err: any) {
      ElMessage.warning(`项目 ${currentProject.value} 分析失败: ${err.message}`)
    }
  }

  projectStore.analyzing = false
  ElMessage.success('所有项目分析完成')
}
</script>

<style scoped>
.analysis-view {
  max-width: 1000px;
  margin: 0 auto;
}

.analyze-prompt {
  text-align: center;
  padding: 24px;
}

.analyze-prompt p {
  margin-bottom: 16px;
  font-size: 16px;
  color: #cbd5e1;
}

.progress-text {
  text-align: center;
  margin-top: 12px;
  color: #cbd5e1;
}

.analysis-list {
  margin-top: 16px;
}

.analysis-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-name {
  font-size: 16px;
  font-weight: 600;
}

.tech-tags {
  display: flex;
  gap: 4px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin: 12px 0;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #e2e8f0;
}

.stat-value.add { color: #67c23a; }
.stat-value.del { color: #f56c6c; }

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 4px;
}

.time-range {
  font-size: 13px;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  gap: 4px;
}

h4 {
  font-size: 14px;
  color: #e2e8f0;
  margin-bottom: 8px;
}

.info-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 4px;
}

.module-tag {
  margin: 2px 4px 2px 0;
}

.docs-section {
  margin-top: 12px;
}

.doc-item {
  font-size: 13px;
  margin: 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.commits-section {
  margin-top: 16px;
  border-top: 1px solid #e4e7ed;
  padding-top: 12px;
}

.commit-list {
  font-size: 13px;
  color: #cbd5e1;
  padding-left: 20px;
  line-height: 1.8;
}

.action-bar {
  margin-top: 24px;
  display: flex;
  justify-content: space-between;
}
</style>
