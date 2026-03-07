<template>
  <div class="scan-view">
    <el-card>
      <template #header>
        <span>扫描工作文件夹</span>
      </template>

      <el-form label-width="100px">
        <el-form-item label="文件夹路径">
          <!-- 已添加的路径列表 -->
          <div class="path-tags" v-if="folderPaths.length > 0">
            <el-tag
              v-for="(p, index) in folderPaths"
              :key="p"
              closable
              @close="removePath(index)"
              class="path-tag"
            >
              {{ p }}
            </el-tag>
          </div>

          <!-- 路径输入 -->
          <div class="path-input-row">
            <el-input
              v-model="currentPath"
              placeholder="输入文件夹路径，按回车添加，如: C:\Users\xxx\projects"
              clearable
              @keyup.enter="addPath"
            />
            <el-button @click="addPath" :disabled="!currentPath.trim()">添加</el-button>
            <el-button
              type="primary"
              :loading="projectStore.scanning"
              @click="startScan"
              :disabled="folderPaths.length === 0"
            >
              {{ projectStore.scanning ? '扫描中...' : '开始扫描' }}
            </el-button>
          </div>
          <div class="form-tip">支持添加多个文件夹路径，将合并扫描所有路径下的项目</div>
        </el-form-item>
      </el-form>

      <!-- 扫描进度 -->
      <div v-if="progressInfo" class="progress-section">
        <el-progress :percentage="progressInfo.progress" :status="progressInfo.phase === 'done' ? 'success' : undefined" />
        <p class="progress-text">{{ progressText }}</p>
      </div>
    </el-card>

    <!-- 扫描结果 -->
    <el-card v-if="projectStore.scanResult" class="result-card">
      <template #header>
        <div class="result-header">
          <span>扫描结果</span>
          <el-tag type="success">
            发现 {{ projectStore.scanResult.projects.length }} 个项目，
            共 {{ projectStore.scanResult.totalFiles }} 个文件
          </el-tag>
        </div>
      </template>

      <div class="project-list">
        <div
          v-for="project in projectStore.scanResult.projects"
          :key="project.path"
          class="project-item"
          :class="{ selected: projectStore.selectedProjects.has(project.path) }"
        >
          <el-checkbox
            :model-value="projectStore.selectedProjects.has(project.path)"
            @change="projectStore.toggleProject(project.path)"
          />
          <div class="project-info">
            <div class="project-name">
              {{ project.name }}
              <el-tag size="small" type="info">{{ project.type }}</el-tag>
              <el-tag v-if="project.hasGit" size="small" type="success">Git</el-tag>
            </div>
            <div class="project-path">{{ project.path }}</div>
            <div class="project-tech" v-if="project.techStack.length > 0">
              <el-tag
                v-for="tech in project.techStack"
                :key="tech"
                size="small"
                class="tech-tag"
              >
                {{ tech }}
              </el-tag>
            </div>
          </div>
          <div class="project-stats">
            {{ project.fileCount }} 个文件
          </div>
        </div>
      </div>

      <!-- 独立文档 -->
      <div v-if="projectStore.scanResult.standaloneDocuments && projectStore.scanResult.standaloneDocuments.length > 0" class="standalone-docs-section">
        <h4 class="section-title">
          独立文档
          <el-tag size="small" type="warning">{{ projectStore.scanResult.standaloneDocuments.length }} 个</el-tag>
        </h4>
        <p class="section-tip">以下文档不属于任何代码项目，将自动纳入总结生成</p>
        <div class="doc-list">
          <div
            v-for="doc in projectStore.scanResult.standaloneDocuments"
            :key="doc.filename"
            class="doc-item"
          >
            <el-tag size="small" :type="docTagType(doc.type)">{{ doc.type }}</el-tag>
            <span class="doc-name">{{ doc.filename }}</span>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <span class="selected-count">
          已选择 {{ projectStore.selectedProjects.size }} / {{ projectStore.scanResult.projects.length }} 个项目
        </span>
        <el-button type="primary" size="large" @click="goAnalysis" :disabled="projectStore.selectedProjects.size === 0">
          下一步：分析项目
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'
import { startScan as apiStartScan, listenScanProgress, getScanResult } from '@/api/scan'
import type { ScanProgressEvent } from '@work-summary/shared'

const router = useRouter()
const projectStore = useProjectStore()
const settings = useSettingsStore()

const folderPaths = ref<string[]>([])
const currentPath = ref('')
const progressInfo = ref<ScanProgressEvent | null>(null)

function addPath() {
  const p = currentPath.value.trim()
  if (!p) return
  if (folderPaths.value.includes(p)) {
    ElMessage.warning('该路径已添加')
    return
  }
  folderPaths.value.push(p)
  currentPath.value = ''
}

function removePath(index: number) {
  folderPaths.value.splice(index, 1)
}

const progressText = computed(() => {
  if (!progressInfo.value) return ''
  const p = progressInfo.value
  switch (p.phase) {
    case 'walking': return `正在扫描目录... 已发现 ${p.found.projects} 个项目`
    case 'parsing': return `正在分析项目: ${p.current}`
    case 'git': return `正在分析 Git 历史: ${p.current}`
    case 'done': return '扫描完成!'
    default: return ''
  }
})

async function startScan() {
  if (folderPaths.value.length === 0) return

  projectStore.scanning = true
  progressInfo.value = null

  try {
    const { taskId } = await apiStartScan(folderPaths.value, settings.gitAuthor, settings.getGitSince(), settings.getGitUntil())
    projectStore.taskId = taskId

    // 监听进度
    listenScanProgress(
      taskId,
      (event) => {
        progressInfo.value = event
      },
      async () => {
        // 扫描完成，获取结果
        try {
          const result = await getScanResult(taskId)
          projectStore.setScanResult(result)
          const docCount = result.standaloneDocuments?.length || 0
          const docMsg = docCount > 0 ? `，${docCount} 个独立文档` : ''
          ElMessage.success(`扫描完成! 发现 ${result.projects.length} 个项目${docMsg}`)
        } catch (err: any) {
          ElMessage.error(err.message)
        } finally {
          projectStore.scanning = false
        }
      },
      (err) => {
        ElMessage.error(`扫描失败: ${err}`)
        projectStore.scanning = false
      },
    )
  } catch (err: any) {
    ElMessage.error(err.message)
    projectStore.scanning = false
  }
}

function docTagType(type: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    md: '',
    docx: 'success',
    pptx: 'warning',
    pdf: 'danger',
    txt: 'info',
  }
  return map[type] || 'info'
}

function goAnalysis() {
  router.push('/analysis')
}
</script>

<style scoped>
.scan-view {
  max-width: 900px;
  margin: 0 auto;
}

.path-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
  width: 100%;
}

.path-tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.path-input-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.path-input-row .el-input {
  flex: 1;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.progress-section {
  margin-top: 20px;
}

.progress-text {
  font-size: 13px;
  color: #606266;
  margin-top: 8px;
}

.result-card {
  margin-top: 20px;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.project-list {
  max-height: 500px;
  overflow-y: auto;
}

.project-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.2s;
  cursor: pointer;
}

.project-item:hover {
  border-color: #409eff;
  background: #f5f7ff;
}

.project-item.selected {
  border-color: #409eff;
  background: #ecf5ff;
}

.project-info {
  flex: 1;
}

.project-name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.project-path {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.tech-tag {
  margin-right: 4px;
  margin-bottom: 4px;
}

.project-stats {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

.action-bar {
  margin-top: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selected-count {
  font-size: 14px;
  color: #606266;
}

.standalone-docs-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
}

.section-title {
  font-size: 14px;
  color: #303133;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-tip {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.doc-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
}

.doc-name {
  color: #606266;
}
</style>
