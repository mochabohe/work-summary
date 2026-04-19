<template>
  <div class="import-view">
    <div class="page-header">
      <el-button link @click="$router.push('/workspace')">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h2>从文档导入工作项</h2>
    </div>

    <!-- 上传区：3 种方式 -->
    <div class="upload-grid" v-if="draft.length === 0 && !extracting">
      <!-- 方式 1：AI 解析 -->
      <div class="upload-card">
        <div class="card-icon">📄</div>
        <h3>文档智能抽取</h3>
        <p>上传周报/月报/会议纪要（Word / PDF / PPT / Markdown / TXT），<br>AI 自动结构化为工作项</p>
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept=".docx,.pdf,.pptx,.md,.txt,.html,.htm"
          :on-change="handleDocUpload"
        >
          <el-button type="primary" size="large" :loading="parsing">
            <el-icon><Upload /></el-icon>
            选择文档
          </el-button>
        </el-upload>
        <p class="card-hint">单文件 ≤ 20MB</p>
      </div>

      <!-- 方式 2：Excel 批量 -->
      <div class="upload-card">
        <div class="card-icon">📊</div>
        <h3>Excel 批量导入</h3>
        <p>按固定列模板填写，一次性导入多条工作项，<br>无需 AI 解析，速度快精度高</p>
        <div class="card-actions">
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept=".xlsx,.xls"
            :on-change="handleExcelUpload"
          >
            <el-button size="large" :loading="excelLoading">
              <el-icon><Upload /></el-icon>
              上传 Excel
            </el-button>
          </el-upload>
          <el-button size="large" link type="primary" @click="downloadTemplate">
            <el-icon><Download /></el-icon>
            下载模板
          </el-button>
        </div>
      </div>
    </div>

    <!-- 正在抽取 -->
    <div v-if="extracting" class="extracting-box">
      <el-icon class="spin"><Loading /></el-icon>
      <p>AI 正在分析文档结构，抽取工作项...</p>
      <p class="hint">通常需要 10-30 秒</p>
    </div>

    <!-- 抽取结果：待确认列表 -->
    <div v-if="draft.length > 0 && !extracting" class="draft-section">
      <div class="draft-header">
        <div>
          <h3>识别到 {{ draft.length }} 条工作项</h3>
          <p class="draft-hint" v-if="lowConfCount > 0">
            <el-icon color="#f59e0b"><Warning /></el-icon>
            {{ lowConfCount }} 条置信度较低，建议您确认细节后再保存
          </p>
        </div>
        <div>
          <el-button @click="cancelDraft">放弃</el-button>
          <el-button type="primary" @click="confirmDraft">
            全部确认导入 ({{ draft.length }})
          </el-button>
        </div>
      </div>

      <div class="draft-list">
        <div
          v-for="item in draft"
          :key="item.id"
          class="draft-card"
          :class="{ 'low-confidence': (item.confidence ?? 1) < 0.6 }"
        >
          <div class="draft-card-head">
            <div class="draft-title">
              <span
                v-if="item.confidence != null"
                class="conf-badge"
                :class="confClass(item.confidence)"
              >
                {{ Math.round(item.confidence * 100) }}%
              </span>
              <h4>{{ item.title }}</h4>
            </div>
            <div class="draft-actions">
              <el-button size="small" link @click="editingItem = { ...item }">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button size="small" link @click="store.removeDraftItem(item.id)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
          <div class="draft-meta">
            <span v-if="item.category" class="meta-chip">{{ item.category }}</span>
            <span class="meta-date">
              {{ item.date.start }}
              <template v-if="item.date.end && item.date.end !== item.date.start">
                ~ {{ item.date.end }}
              </template>
            </span>
          </div>
          <p class="draft-desc">{{ item.description }}</p>
          <div v-if="item.metrics?.length" class="draft-metrics">
            <span v-for="m in item.metrics" :key="m.label" class="metric">
              <strong>{{ m.label }}</strong>: {{ m.value }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <WorkItemEditor
      v-if="editingItem"
      :item="editingItem"
      @close="editingItem = null"
      @save="onEditorSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, Upload, Download, Loading, Warning, Edit, Delete,
} from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import type { WorkItem } from '@work-summary/shared'
import { useWorkspaceStore } from '@/stores/workspace'
import { parseDocument, extractItems, importExcel, getExcelTemplateUrl } from '@/api/workspace'
import WorkItemEditor from '@/components/workspace/WorkItemEditor.vue'

const router = useRouter()
const store = useWorkspaceStore()

const parsing = ref(false)
const extracting = ref(false)
const excelLoading = ref(false)
const editingItem = ref<WorkItem | null>(null)

const draft = computed(() => store.importDraft)
const lowConfCount = computed(() => store.lowConfidenceDraftCount)

function confClass(c: number) {
  if (c >= 0.75) return 'high'
  if (c >= 0.5) return 'mid'
  return 'low'
}

async function handleDocUpload(uploadFile: UploadFile) {
  const file = uploadFile.raw
  if (!file) return
  parsing.value = true
  try {
    const parsed = await parseDocument(file)
    parsing.value = false
    extracting.value = true
    const res = await extractItems(parsed.text)
    if (res.warning) {
      ElMessage.warning(res.warning)
      return
    }
    if (res.items.length === 0) {
      ElMessage.info('未从文档中识别到工作项，请尝试手动录入')
      return
    }
    store.setDraft(res.items)
    ElMessage.success(`识别出 ${res.items.length} 条工作项，请确认后导入`)
  } catch (err) {
    ElMessage.error(`解析失败：${(err as Error).message}`)
  } finally {
    parsing.value = false
    extracting.value = false
  }
}

async function handleExcelUpload(uploadFile: UploadFile) {
  const file = uploadFile.raw
  if (!file) return
  excelLoading.value = true
  try {
    const res = await importExcel(file)
    if (res.items.length === 0) {
      ElMessage.warning('未从 Excel 中解析到有效工作项（标题为空的行会被跳过）')
      return
    }
    store.setDraft(res.items)
    const msg = `识别 ${res.items.length} 条工作项`
      + (res.skipped > 0 ? `，跳过 ${res.skipped} 条` : '')
    ElMessage.success(msg)
    if (res.errors.length > 0) {
      ElMessageBox.alert(res.errors.join('\n'), '部分行解析失败', { type: 'warning' })
    }
  } catch (err) {
    ElMessage.error(`Excel 导入失败：${(err as Error).message}`)
  } finally {
    excelLoading.value = false
  }
}

function downloadTemplate() {
  window.open(getExcelTemplateUrl(), '_blank')
}

function confirmDraft() {
  const count = store.commitDraft()
  if (count > 0) {
    ElMessage.success(`已导入 ${count} 条工作项`)
    router.push('/workspace')
  }
}

function cancelDraft() {
  ElMessageBox.confirm('放弃本次导入？已识别的工作项草稿将被清空', '提示', {
    type: 'warning',
  }).then(() => {
    store.clearDraft()
  }).catch(() => undefined)
}

function onEditorSave(item: WorkItem) {
  store.updateDraftItem(item.id, item)
  editingItem.value = null
}
</script>

<style scoped>
.import-view {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 28px;
}

.page-header h2 {
  margin: 0;
  color: var(--ws-text-primary, #fff);
  font-size: 22px;
}

/* ============= 上传卡片 ============= */
.upload-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.upload-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 32px 28px;
  text-align: center;
  transition: all 0.3s ease;
}

.upload-card:hover {
  border-color: rgba(167, 139, 250, 0.4);
  background: rgba(255, 255, 255, 0.06);
  transform: translateY(-3px);
}

.card-icon {
  font-size: 52px;
  margin-bottom: 12px;
}

.upload-card h3 {
  font-size: 18px;
  color: var(--ws-text-primary, #fff);
  margin: 0 0 8px;
}

.upload-card p {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.6));
  line-height: 1.7;
  margin-bottom: 20px;
}

.card-hint {
  font-size: 12px;
  color: var(--ws-text-muted, rgba(255,255,255,0.4));
  margin-top: 10px;
  margin-bottom: 0;
}

.card-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* ============= 抽取中 ============= */
.extracting-box {
  text-align: center;
  padding: 80px 24px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
}

.spin {
  font-size: 48px;
  color: #a78bfa;
  margin-bottom: 20px;
  animation: ws-spin 1s linear infinite;
}

@keyframes ws-spin {
  to { transform: rotate(360deg); }
}

.extracting-box p {
  font-size: 15px;
  color: var(--ws-text-primary, #fff);
  margin: 4px 0;
}

.extracting-box .hint {
  font-size: 12px;
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
}

/* ============= 草稿列表 ============= */
.draft-section {
  /* 无额外样式 */
}

.draft-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 18px 20px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(167, 139, 250, 0.08));
  border: 1px solid rgba(167, 139, 250, 0.2);
  border-radius: 12px;
}

.draft-header h3 {
  font-size: 17px;
  color: var(--ws-text-primary, #fff);
  margin: 0 0 4px;
}

.draft-hint {
  font-size: 12px;
  color: #f59e0b;
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.draft-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.draft-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 16px 20px;
  transition: all 0.25s ease;
}

.draft-card.low-confidence {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.04);
}

.draft-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.draft-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.draft-title h4 {
  margin: 0;
  font-size: 15px;
  color: var(--ws-text-primary, #fff);
  font-weight: 600;
}

.conf-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 700;
}
.conf-badge.high { background: rgba(52, 211, 153, 0.18); color: #34d399; }
.conf-badge.mid { background: rgba(251, 191, 36, 0.18); color: #fbbf24; }
.conf-badge.low { background: rgba(248, 113, 113, 0.18); color: #f87171; }

.draft-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.6));
}

.meta-chip {
  background: rgba(102, 126, 234, 0.15);
  color: #a78bfa;
  padding: 2px 8px;
  border-radius: 4px;
}

.draft-desc {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.7));
  line-height: 1.7;
  margin: 0 0 8px;
}

.draft-metrics {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.metric {
  font-size: 12px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.7));
  background: rgba(255, 255, 255, 0.04);
  padding: 3px 10px;
  border-radius: 6px;
}

.metric strong {
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
  font-weight: 500;
  margin-right: 4px;
}

@media (max-width: 700px) {
  .upload-grid { grid-template-columns: 1fr; }
}
</style>
