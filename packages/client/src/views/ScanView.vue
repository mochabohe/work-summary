<template>
  <div class="scan-view">
    <el-card>
      <template #header>
        <span>扫描工作文件夹</span>
      </template>

      <el-form label-width="100px" @submit.prevent>
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
              placeholder="输入文件夹路径，按回车添加"
              clearable
              @keyup.enter="addPath"
            />
            <el-button native-type="button" @click="addPath" :disabled="!currentPath.trim()">添加</el-button>
            <el-button native-type="button" @click="openBrowser">选择文件夹</el-button>
            <el-button
              type="primary"
              :loading="projectStore.scanning"
              @click="startScan(false)"
              :disabled="folderPaths.length === 0"
            >
              {{ projectStore.scanning ? '扫描中...' : '开始扫描' }}
            </el-button>
            <el-button
              :disabled="folderPaths.length === 0 || projectStore.scanning"
              @click="startScan(true)"
              title="忽略缓存，重新扫描"
            >
              刷新
            </el-button>
          </div>
          <div class="form-tip">支持添加多个文件夹路径，点击「选择文件夹」可视化浏览</div>
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
              <el-tag v-if="project.hasGit && project.userCommitCount === 0" size="small" type="danger">无贡献</el-tag>
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
          <template v-if="projectStore.scanResult.standaloneDocuments?.length">
            ，{{ projectStore.scanResult.standaloneDocuments.length }} 份独立文档
          </template>
        </span>
        <el-button type="primary" size="large" @click="goAnalysis" :disabled="projectStore.selectedProjects.size === 0 && !(projectStore.scanResult.standaloneDocuments?.length)">
          下一步：分析项目
        </el-button>
      </div>
    </el-card>

    <!-- 目录浏览对话框 -->
    <el-dialog
      v-model="browserVisible"
      title="选择文件夹"
      width="560px"
      :close-on-click-modal="false"
      class="folder-browser-dialog"
    >
      <!-- 快捷路径 -->
      <div class="browser-shortcuts">
        <el-button
          v-for="s in shortcuts"
          :key="s.path"
          size="small"
          @click="browseTo(s.path)"
        >
          {{ s.name }}
        </el-button>
      </div>

      <!-- 当前路径 -->
      <div class="browser-path-bar">
        <el-button size="small" :icon="ArrowLeft" @click="browseTo(browserParent)" :disabled="browserCurrent === browserParent" />
        <span class="browser-current-path">{{ browserCurrent }}</span>
      </div>

      <!-- 目录列表 -->
      <div class="browser-list" v-loading="browserLoading">
        <div v-if="browserEntries.length === 0 && !browserLoading" class="browser-empty">
          此目录下没有子文件夹
        </div>
        <div
          v-for="entry in browserEntries"
          :key="entry.path"
          class="browser-item"
          :class="{ active: browserSelected === entry.path }"
          @click="browserSelected = entry.path"
          @dblclick="browseTo(entry.path)"
        >
          <span class="folder-icon">{{ entry.isShortcut ? '&#128279;' : '&#128193;' }}</span>
          <span class="folder-name">{{ entry.name }}</span>
        </div>
      </div>

      <template #footer>
        <el-button @click="browserVisible = false">取消</el-button>
        <el-button @click="confirmBrowser(browserCurrent)">选择当前目录</el-button>
        <el-button type="primary" @click="confirmBrowser(browserSelected || browserCurrent)">确认选择</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'
import { useSummaryStore } from '@/stores/summary'
import { startScan as apiStartScan, listenScanProgress, getScanResult } from '@/api/scan'
import { browseDir, getShortcuts } from '@/api/fs'
import type { ScanProgressEvent } from '@work-summary/shared'
import type { DirEntry, Shortcut } from '@/api/fs'

const router = useRouter()
const projectStore = useProjectStore()
const settings = useSettingsStore()
const summaryStore = useSummaryStore()

const folderPaths = ref<string[]>([])
const currentPath = ref('')
const progressInfo = ref<ScanProgressEvent | null>(null)

// 目录浏览相关
const browserVisible = ref(false)
const browserLoading = ref(false)
const browserCurrent = ref('')
const browserParent = ref('')
const browserEntries = ref<DirEntry[]>([])
const browserSelected = ref('')
const shortcuts = ref<Shortcut[]>([])

async function openBrowser() {
  browserVisible.value = true
  browserSelected.value = ''
  // 加载快捷路径
  try {
    shortcuts.value = await getShortcuts()
  } catch {}
  // 打开用户主目录
  await browseTo('')
}

async function browseTo(dirPath: string) {
  browserLoading.value = true
  browserSelected.value = ''
  try {
    const result = await browseDir(dirPath || undefined)
    browserCurrent.value = result.current
    browserParent.value = result.parent
    browserEntries.value = result.entries
  } catch (err: any) {
    ElMessage.error(err.message)
  } finally {
    browserLoading.value = false
  }
}

function confirmBrowser(selectedPath: string) {
  if (!selectedPath) return
  if (folderPaths.value.includes(selectedPath)) {
    ElMessage.warning('该路径已添加')
  } else {
    folderPaths.value.push(selectedPath)
  }
  browserVisible.value = false
}

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

async function startScan(forceRescan = false) {
  if (folderPaths.value.length === 0) return

  projectStore.scanning = true
  progressInfo.value = null
  summaryStore.clearGenerated()
  projectStore.analyses = new Map()

  try {
    const { taskId, fromCache, savedAt } = await apiStartScan(
      folderPaths.value, settings.gitAuthor, settings.getGitSince(), settings.getGitUntil(), forceRescan,
    )
    projectStore.taskId = taskId

    // 命中缓存：直接取结果，无需 SSE
    if (fromCache) {
      const result = await getScanResult(taskId)
      projectStore.setScanResult(result)
      progressInfo.value = { phase: 'done', progress: 100, current: '', found: { projects: result.projects.length, files: result.totalFiles } }
      const cacheTime = savedAt ? new Date(savedAt).toLocaleString() : '上次'
      ElMessage.success(`使用缓存结果（${cacheTime}），发现 ${result.projects.length} 个项目`)
      projectStore.scanning = false
      return
    }

    // 监听进度
    listenScanProgress(
      taskId,
      (event) => { progressInfo.value = event },
      async () => {
        progressInfo.value = { phase: 'done', progress: 100, current: '', found: progressInfo.value?.found ?? { projects: 0, files: 0 } }
        try {
          const result = await getScanResult(taskId)
          projectStore.setScanResult(result)
          const docCount = result.standaloneDocuments?.length || 0
          const noContribCount = result.projects.filter(p => p.hasGit && p.userCommitCount === 0).length
          const docMsg = docCount > 0 ? `，${docCount} 个独立文档` : ''
          const noContribMsg = noContribCount > 0 ? `（已自动排除 ${noContribCount} 个无贡献项目）` : ''
          ElMessage.success(`扫描完成! 发现 ${result.projects.length} 个项目${docMsg}${noContribMsg}`)
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
    html: 'success',
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
  color: rgba(255, 255, 255, 0.55);
  margin-top: 4px;
}

.progress-section {
  margin-top: 20px;
}

.progress-text {
  font-size: 13px;
  color: #cbd5e1;
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
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.2s;
  cursor: pointer;
}

.project-item:hover {
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.1);
}

.project-item.selected {
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.18);
}

.project-info {
  flex: 1;
}

.project-name {
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.project-path {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 6px;
}

.tech-tag {
  margin-right: 4px;
  margin-bottom: 4px;
}

.project-stats {
  font-size: 13px;
  color: #cbd5e1;
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
  color: #cbd5e1;
}

.standalone-docs-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
}

.section-title {
  font-size: 14px;
  color: #e2e8f0;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
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
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  font-size: 13px;
}

.doc-name {
  color: #cbd5e1;
}

/* 目录浏览对话框 */
.browser-shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.browser-path-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(15, 12, 41, 0.5);
  border-radius: 6px;
  margin-bottom: 12px;
  border: 1px solid rgba(102, 126, 234, 0.2);
}

.browser-current-path {
  font-size: 13px;
  color: #e2e8f0;
  word-break: break-all;
  flex: 1;
}

.browser-list {
  height: 320px;
  overflow-y: auto;
  border: 1px solid rgba(102, 126, 234, 0.25);
  border-radius: 8px;
  background: rgba(15, 12, 41, 0.6);
}

.browser-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
}

.browser-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.browser-item:hover {
  background: rgba(102, 126, 234, 0.15);
}

.browser-item.active {
  background: rgba(102, 126, 234, 0.25);
}

.folder-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.folder-name {
  font-size: 13px;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
