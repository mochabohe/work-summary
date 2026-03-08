<template>
  <div class="preview-view">
    <!-- 未生成提示 -->
    <el-empty v-if="!summaryStore.content" description="请先生成总结内容">
      <el-button type="primary" @click="router.push('/generate')">去生成</el-button>
    </el-empty>

    <template v-else>
      <el-row :gutter="20">
        <!-- 左侧: Markdown 编辑器 -->
        <el-col :span="12">
          <el-card class="editor-card">
            <template #header>
              <div class="card-header">
                <span>编辑</span>
                <el-button size="small" text type="primary" @click="formatContent">
                  格式化
                </el-button>
              </div>
            </template>
            <el-input
              v-model="editableContent"
              type="textarea"
              :rows="30"
              class="editor-textarea"
            />
          </el-card>
        </el-col>

        <!-- 右侧: 实时预览 -->
        <el-col :span="12">
          <el-card class="preview-card">
            <template #header>
              <span>预览</span>
            </template>
            <div class="markdown-preview" v-html="renderedContent"></div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 导出面板 -->
      <el-card class="export-card">
        <template #header>
          <span>导出</span>
        </template>

        <div class="export-actions">
          <el-button
            type="primary"
            size="large"
            @click="handleExport('markdown')"
            :loading="exporting === 'markdown'"
          >
            <el-icon><Document /></el-icon>
            导出 Markdown
          </el-button>

          <el-button
            type="success"
            size="large"
            @click="handleExport('docx')"
            :loading="exporting === 'docx'"
          >
            <el-icon><Document /></el-icon>
            导出 Word
          </el-button>

          <el-button
            type="warning"
            size="large"
            @click="showPptTitleDialog"
            :loading="exporting === 'ppt'"
          >
            <el-icon><Document /></el-icon>
            导出演示文稿
          </el-button>

          <el-button
            size="large"
            @click="copyContent"
          >
            <el-icon><CopyDocument /></el-icon>
            复制到剪贴板
          </el-button>
        </div>
      </el-card>

      <!-- PPT 标题输入对话框 -->
      <el-dialog
        v-model="pptTitleVisible"
        title="设置演示文稿标题"
        width="480"
        :close-on-click-modal="false"
      >
        <el-form label-position="top">
          <el-form-item label="封面标题">
            <el-input
              v-model="pptTitle"
              placeholder="例如：年终工作总结、Q3 季度总结、员工述职报告"
              size="large"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="pptTitleVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmPptTitle">开始生成</el-button>
        </template>
      </el-dialog>

      <!-- PPT 生成加载对话框（含流式输出预览） -->
      <el-dialog
        v-model="pptLoadingVisible"
        title="生成演示文稿"
        width="680"
        :close-on-click-modal="false"
        :show-close="true"
        @close="cancelPptExport"
      >
        <div class="ppt-progress">
          <div class="ppt-progress-header">
            <el-icon class="is-loading ppt-spinner"><Loading /></el-icon>
            <p class="ppt-status">{{ pptStatus }}</p>
          </div>
          <div class="ppt-stream-box" ref="pptStreamBoxRef">
            <pre class="ppt-stream-text">{{ pptStreamText || '等待 AI 响应...' }}</pre>
          </div>
        </div>
      </el-dialog>

      <!-- PPT 幻灯片预览全屏对话框 -->
      <el-dialog
        v-model="pptPreviewVisible"
        title="演示文稿预览"
        fullscreen
        :close-on-click-modal="false"
        class="ppt-preview-dialog"
      >
        <div class="slides-gallery" v-if="slidesData">
          <div
            v-for="(slide, index) in slidesData.slides"
            :key="index"
            class="slide-wrapper"
          >
            <div class="slide-number">{{ index + 1 }} / {{ slidesData.slides.length }}</div>

            <!-- title / end -->
            <div v-if="slide.type === 'title' || slide.type === 'end'" class="slide slide-dark">
              <div class="slide-center">
                <h1 class="slide-main-title">{{ slide.title }}</h1>
                <p v-if="slide.subtitle" class="slide-subtitle">{{ slide.subtitle }}</p>
              </div>
            </div>

            <!-- section -->
            <div v-else-if="slide.type === 'section'" class="slide slide-dark">
              <div class="slide-center">
                <h2 class="slide-section-title">{{ slide.title }}</h2>
                <div class="slide-section-bar"></div>
              </div>
            </div>

            <!-- metrics -->
            <div v-else-if="slide.type === 'metrics'" class="slide slide-light">
              <div class="slide-content-header">
                <h3 class="slide-content-title">{{ slide.title }}</h3>
              </div>
              <div class="slide-body">
                <div class="metrics-row">
                  <div v-for="(m, mi) in slide.metrics" :key="mi" class="metric-card">
                    <div class="metric-value">{{ m.value }}</div>
                    <div class="metric-label">{{ m.label }}</div>
                    <div v-if="m.description" class="metric-desc">{{ m.description }}</div>
                  </div>
                </div>
                <ul class="slide-bullets compact" v-if="slide.bullets && slide.bullets.length">
                  <li v-for="(b, bi) in slide.bullets" :key="bi">
                    <span class="bullet-dot"></span><span class="bullet-text" v-html="renderBold(b)"></span>
                  </li>
                </ul>
              </div>
            </div>

            <!-- content -->
            <div v-else-if="slide.type === 'content'" class="slide slide-light">
              <div class="slide-content-header">
                <h3 class="slide-content-title">{{ slide.title }}</h3>
              </div>
              <div class="slide-body">
                <p v-if="slide.description" class="slide-desc">{{ slide.description }}</p>
                <ul class="slide-bullets" v-if="slide.bullets">
                  <li v-for="(b, bi) in slide.bullets" :key="bi">
                    <span class="bullet-dot"></span><span class="bullet-text" v-html="renderBold(b)"></span>
                  </li>
                </ul>
              </div>
            </div>

            <!-- two-column -->
            <div v-else-if="slide.type === 'two-column'" class="slide slide-light">
              <div class="slide-content-header">
                <h3 class="slide-content-title">{{ slide.title }}</h3>
              </div>
              <div class="slide-body two-col-body">
                <div class="col-card" v-if="slide.left">
                  <div class="col-card-title">{{ slide.left.title }}</div>
                  <ul class="col-bullets">
                    <li v-for="(b, bi) in slide.left.bullets" :key="bi">
                      <span class="bullet-dot"></span><span class="bullet-text" v-html="renderBold(b)"></span>
                    </li>
                  </ul>
                </div>
                <div class="col-card" v-if="slide.right">
                  <div class="col-card-title">{{ slide.right.title }}</div>
                  <ul class="col-bullets">
                    <li v-for="(b, bi) in slide.right.bullets" :key="bi">
                      <span class="bullet-dot"></span><span class="bullet-text" v-html="renderBold(b)"></span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- grid -->
            <div v-else-if="slide.type === 'grid'" class="slide slide-light">
              <div class="slide-content-header">
                <h3 class="slide-content-title">{{ slide.title }}</h3>
              </div>
              <div class="slide-body grid-body" :class="{ 'grid-3': (slide.cards?.length || 0) >= 3 }">
                <div v-for="(c, ci) in slide.cards" :key="ci" class="grid-card">
                  <div class="grid-card-title">{{ c.title }}</div>
                  <ul class="col-bullets">
                    <li v-for="(b, bi) in c.bullets" :key="bi">
                      <span class="bullet-dot small"></span><span class="bullet-text" v-html="renderBold(b)"></span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- summary -->
            <div v-else-if="slide.type === 'summary'" class="slide slide-light">
              <div class="slide-content-header">
                <h3 class="slide-content-title">{{ slide.title }}</h3>
              </div>
              <div class="slide-body">
                <ul class="slide-bullets" v-if="slide.bullets">
                  <li v-for="(b, bi) in slide.bullets" :key="bi">
                    <span class="bullet-dot"></span><span class="bullet-text" v-html="renderBold(b)"></span>
                  </li>
                </ul>
                <div class="summary-tags" v-if="slide.tags && slide.tags.length">
                  <span v-for="(tag, ti) in slide.tags" :key="ti" class="summary-tag" :class="'tag-' + (ti % 6)">{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <template #footer>
          <div class="ppt-preview-footer">
            <el-button size="large" @click="pptPreviewVisible = false">取消</el-button>
            <el-button type="danger" size="large" :loading="pdfSlidesDownloading" @click="confirmPdfSlidesDownload">
              导出 PDF
            </el-button>
            <el-button type="primary" size="large" :loading="pptDownloading" @click="confirmPptDownload">
              导出 PPTX
            </el-button>
          </div>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, CopyDocument, Loading } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import { useSummaryStore } from '@/stores/summary'
import { exportMarkdown, exportDocx, generateSlides, downloadPptx, downloadPdfSlides } from '@/api/exportApi'
import type { PptData } from '@/api/exportApi'

const router = useRouter()
const summaryStore = useSummaryStore()
const md = new MarkdownIt()

const editableContent = ref(summaryStore.content)
const exporting = ref<string>('')

// 同步编辑内容到 store
watch(editableContent, (val) => {
  summaryStore.setContent(val)
})

// 同步 store 到编辑器（首次加载）
watch(() => summaryStore.content, (val) => {
  if (val !== editableContent.value) {
    editableContent.value = val
  }
}, { immediate: true })

const renderedContent = computed(() => {
  return md.render(editableContent.value || '')
})

function formatContent() {
  // 简单格式化：去除多余空行
  editableContent.value = editableContent.value
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 将 **加粗** 标记转为 <strong> 标签 */
function renderBold(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
}

function copyContent() {
  // 去掉 Markdown 标记，复制为纯文本
  const plain = editableContent.value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '- ')
  navigator.clipboard.writeText(plain)
  ElMessage.success('已复制到剪贴板')
}

// PPT 导出相关
const pptLoadingVisible = ref(false)
const pptPreviewVisible = ref(false)
const pptDownloading = ref(false)
const pdfSlidesDownloading = ref(false)
const slidesData = ref<PptData | null>(null)
const pptStreamText = ref('')
const pptStreamBoxRef = ref<HTMLElement | null>(null)
const pptStatus = ref('AI 正在生成演示文稿结构...')
const pptTitleVisible = ref(false)
const pptTitle = ref('年终工作总结')
let cancelPptFn: (() => void) | null = null

function showPptTitleDialog() {
  pptTitle.value = '年终工作总结'
  pptTitleVisible.value = true
}

function confirmPptTitle() {
  pptTitleVisible.value = false
  handlePptExport()
}

function handlePptExport() {
  exporting.value = 'ppt'
  pptStreamText.value = ''
  pptStatus.value = 'AI 正在生成演示文稿结构...'
  pptLoadingVisible.value = true

  cancelPptFn = generateSlides(
    editableContent.value,
    pptTitle.value,
    (chunk) => {
      pptStreamText.value += chunk
      // 自动滚动到底部
      nextTick(() => {
        if (pptStreamBoxRef.value) {
          pptStreamBoxRef.value.scrollTop = pptStreamBoxRef.value.scrollHeight
        }
      })
    },
    (data) => {
      pptLoadingVisible.value = false
      exporting.value = ''
      slidesData.value = data
      pptPreviewVisible.value = true
    },
    (err) => {
      pptLoadingVisible.value = false
      exporting.value = ''
      ElMessage.error(`生成演示文稿失败: ${err}`)
    },
    (message) => {
      pptStatus.value = message
      // 在流式输出中插入进度分隔线
      pptStreamText.value += '\n\n' + message + '\n'
    },
  )
}

function cancelPptExport() {
  if (cancelPptFn) {
    cancelPptFn()
    cancelPptFn = null
  }
  exporting.value = ''
}

async function confirmPptDownload() {
  if (!slidesData.value) return
  pptDownloading.value = true
  try {
    const filename = `${pptTitle.value || '年终工作总结'}-${new Date().getFullYear()}`
    await downloadPptx(slidesData.value, filename)
    ElMessage.success('PPTX 已下载')
  } catch (err: any) {
    ElMessage.error(`导出失败: ${err.message}`)
  } finally {
    pptDownloading.value = false
  }
}

async function confirmPdfSlidesDownload() {
  if (!slidesData.value) return
  pdfSlidesDownloading.value = true
  try {
    const filename = `${pptTitle.value || '年终工作总结'}-${new Date().getFullYear()}`
    await downloadPdfSlides(slidesData.value, filename)
    ElMessage.success('PDF 已下载')
  } catch (err: any) {
    ElMessage.error(`导出失败: ${err.message}`)
  } finally {
    pdfSlidesDownloading.value = false
  }
}

async function handleExport(format: string) {
  exporting.value = format

  try {
    const filename = `年终工作总结-${new Date().getFullYear()}`

    switch (format) {
      case 'markdown':
        exportMarkdown(editableContent.value, filename)
        ElMessage.success('Markdown 文件已下载')
        break
      case 'docx':
        await exportDocx(editableContent.value, filename)
        ElMessage.success('Word 文件已下载')
        break
    }
  } catch (err: any) {
    ElMessage.error(`导出失败: ${err.message}`)
  } finally {
    exporting.value = ''
  }
}
</script>

<style scoped>
.preview-view {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.editor-card,
.preview-card {
  min-height: 600px;
}

.editor-textarea :deep(textarea) {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 14px;
  line-height: 1.6;
}

.markdown-preview {
  line-height: 1.8;
  font-size: 14px;
  max-height: 560px;
  overflow-y: auto;
}

.markdown-preview :deep(h1) {
  font-size: 24px;
  border-bottom: 2px solid #eee;
  padding-bottom: 8px;
  margin: 20px 0 12px;
}

.markdown-preview :deep(h2) {
  font-size: 20px;
  color: #2c3e50;
  margin: 20px 0 10px;
}

.markdown-preview :deep(h3) {
  font-size: 16px;
  color: #34495e;
  margin: 16px 0 8px;
}

.markdown-preview :deep(strong) {
  color: #2c3e50;
}

.markdown-preview :deep(ul) {
  padding-left: 20px;
}

.markdown-preview :deep(li) {
  margin: 6px 0;
}

.export-card {
  margin-top: 20px;
}

.export-actions {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.ppt-progress {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.ppt-progress-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.ppt-stream-box {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
}

.ppt-stream-text {
  color: #d4d4d4;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.ppt-spinner {
  font-size: 20px;
  color: var(--el-color-primary);
  margin-bottom: 16px;
}

.ppt-status {
  font-size: 14px;
  color: #666;
}

/* 幻灯片预览 */
.slides-gallery {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  padding: 24px 0;
  max-height: calc(100vh - 140px);
  overflow-y: auto;
}
.slide-wrapper {
  position: relative;
  width: 100%;
  max-width: 860px;
}
.slide-number {
  position: absolute;
  top: -20px;
  right: 4px;
  font-size: 12px;
  color: #999;
}
.slide {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

/* --- 深色页 --- */
.slide-dark {
  background: linear-gradient(135deg, #1B2A4A 0%, #0f1c36 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.slide-center { text-align: center; padding: 0 48px; }
.slide-main-title { color: #fff; font-size: 32px; font-weight: 700; margin: 0 0 16px; letter-spacing: 2px; }
.slide-subtitle { color: #B0BEC5; font-size: 18px; margin: 0; }
.slide-section-title { color: #fff; font-size: 28px; font-weight: 700; margin: 0 0 20px; }
.slide-section-bar { width: 60px; height: 4px; background: #4472C4; margin: 0 auto; border-radius: 2px; }

/* --- 浅色页通用 --- */
.slide-light { background: #fff; display: flex; flex-direction: column; }
.slide-content-header { background: #1B2A4A; padding: 14px 32px; flex-shrink: 0; }
.slide-content-title { color: #fff; font-size: 18px; font-weight: 700; margin: 0; }
.slide-body { flex: 1; padding: 20px 32px; overflow: hidden; display: flex; flex-direction: column; }
.slide-desc { color: #666; font-size: 13px; margin: 0 0 12px; }

/* 要点列表 */
.slide-bullets { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.slide-bullets.compact { margin-top: 16px; }
.slide-bullets li { display: flex; align-items: flex-start; gap: 10px; }
.bullet-dot { width: 7px; height: 7px; min-width: 7px; background: #4472C4; border-radius: 50%; margin-top: 6px; }
.bullet-dot.small { width: 5px; height: 5px; min-width: 5px; margin-top: 7px; }
.bullet-text { color: #333; font-size: 14px; line-height: 1.6; }

/* --- metrics --- */
.metrics-row { display: flex; gap: 16px; }
.metric-card {
  flex: 1;
  background: linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%);
  border-radius: 10px;
  padding: 18px 14px 14px;
  text-align: center;
  border-top: 3px solid #2CB9C5;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.metric-value { font-size: 28px; font-weight: 800; color: #2CB9C5; margin-bottom: 4px; }
.metric-label { font-size: 12px; color: #555; font-weight: 600; }
.metric-desc { font-size: 11px; color: #999; margin-top: 6px; }

/* --- two-column --- */
.two-col-body { flex-direction: row; gap: 20px; }
.col-card {
  flex: 1;
  background: #f8fafc;
  border-radius: 10px;
  padding: 18px 20px;
  border-top: 3px solid #4472C4;
}
.col-card-title { font-size: 15px; font-weight: 700; color: #1B2A4A; margin-bottom: 12px; }
.col-bullets { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.col-bullets li { display: flex; align-items: flex-start; gap: 8px; }

/* --- grid --- */
.grid-body { flex-direction: row; flex-wrap: wrap; gap: 16px; }
.grid-body.grid-3 .grid-card { flex: 1 1 30%; }
.grid-card {
  flex: 1 1 45%;
  background: #f8fafc;
  border-radius: 10px;
  padding: 16px 18px;
  border-top: 3px solid #4472C4;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.grid-card-title { font-size: 14px; font-weight: 700; color: #1B2A4A; margin-bottom: 10px; }

/* --- summary tags --- */
.summary-tags { display: flex; flex-wrap: wrap; gap: 10px; margin-top: auto; padding-top: 16px; }
.summary-tag {
  padding: 6px 20px;
  border-radius: 20px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.tag-0 { background: #4472C4; }
.tag-1 { background: #2CB9C5; }
.tag-2 { background: #E67E22; }
.tag-3 { background: #8E44AD; }
.tag-4 { background: #E74C3C; }
.tag-5 { background: #27AE60; }

.ppt-preview-footer { display: flex; justify-content: center; gap: 16px; }
</style>
