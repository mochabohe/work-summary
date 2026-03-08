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
              <div class="deco-ring deco-ring-tl"></div>
              <div class="deco-ring deco-ring-br"></div>
              <div class="deco-dots"></div>
              <div class="slide-center">
                <div class="title-accent-line"></div>
                <h1 class="slide-main-title">{{ slide.title }}</h1>
                <p v-if="slide.subtitle" class="slide-subtitle">{{ slide.subtitle }}</p>
                <div class="title-accent-line bottom"></div>
              </div>
            </div>

            <!-- section -->
            <div v-else-if="slide.type === 'section'" class="slide slide-dark">
              <div class="deco-ring deco-ring-tl small"></div>
              <div class="deco-ring deco-ring-br small"></div>
              <div class="slide-center">
                <div class="section-icon">{{ getSlideIcon(slide.title) }}</div>
                <h2 class="slide-section-title">{{ slide.title }}</h2>
                <div class="slide-section-bar"></div>
              </div>
            </div>

            <!-- metrics -->
            <div v-else-if="slide.type === 'metrics'" class="slide slide-modern">
              <div class="slide-sidebar">
                <div class="sidebar-deco-top"></div>
                <div class="sidebar-deco-bot"></div>
                <div class="sidebar-icon">{{ getSlideIcon(slide.title) }}</div>
                <h3 class="sidebar-title">{{ slide.title }}</h3>
                <div class="sidebar-line"></div>
              </div>
              <div class="slide-main">
                <div class="metrics-row">
                  <div v-for="(m, mi) in slide.metrics" :key="mi" class="metric-card">
                    <div class="metric-value">{{ m.value }}</div>
                    <div class="metric-label">{{ m.label }}</div>
                    <div v-if="m.description" class="metric-desc">{{ m.description }}</div>
                  </div>
                </div>
                <div class="bullet-cards" v-if="slide.bullets && slide.bullets.length">
                  <div v-for="(b, bi) in slide.bullets" :key="bi" class="bullet-card">
                    <div v-html="renderBulletContent(b)"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- content -->
            <div v-else-if="slide.type === 'content'" class="slide slide-modern">
              <div class="slide-sidebar">
                <div class="sidebar-deco-top"></div>
                <div class="sidebar-deco-bot"></div>
                <div class="sidebar-icon">{{ getSlideIcon(slide.title) }}</div>
                <h3 class="sidebar-title">{{ slide.title }}</h3>
                <div class="sidebar-line"></div>
              </div>
              <div class="slide-main">
                <p v-if="slide.description" class="slide-desc">{{ slide.description }}</p>
                <div class="bullet-cards" v-if="slide.bullets">
                  <div v-for="(b, bi) in slide.bullets" :key="bi" class="bullet-card">
                    <div v-html="renderBulletContent(b)"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- two-column -->
            <div v-else-if="slide.type === 'two-column'" class="slide slide-modern">
              <div class="slide-sidebar">
                <div class="sidebar-deco-top"></div>
                <div class="sidebar-deco-bot"></div>
                <div class="sidebar-icon">{{ getSlideIcon(slide.title) }}</div>
                <h3 class="sidebar-title">{{ slide.title }}</h3>
                <div class="sidebar-line"></div>
              </div>
              <div class="slide-main two-col-main">
                <div class="col-panel" v-if="slide.left">
                  <div class="col-panel-header">{{ slide.left.title }}</div>
                  <div class="col-panel-body">
                    <div v-for="(b, bi) in slide.left.bullets" :key="bi" class="bullet-card sm">
                      <div v-html="renderBulletContent(b)"></div>
                    </div>
                  </div>
                </div>
                <div class="col-panel teal" v-if="slide.right">
                  <div class="col-panel-header">{{ slide.right.title }}</div>
                  <div class="col-panel-body">
                    <div v-for="(b, bi) in slide.right.bullets" :key="bi" class="bullet-card sm">
                      <div v-html="renderBulletContent(b)"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- grid -->
            <div v-else-if="slide.type === 'grid'" class="slide slide-modern">
              <div class="slide-sidebar">
                <div class="sidebar-deco-top"></div>
                <div class="sidebar-deco-bot"></div>
                <div class="sidebar-icon">{{ getSlideIcon(slide.title) }}</div>
                <h3 class="sidebar-title">{{ slide.title }}</h3>
                <div class="sidebar-line"></div>
              </div>
              <div class="slide-main grid-main" :class="{ 'grid-3': (slide.cards?.length || 0) >= 3 }">
                <div v-for="(c, ci) in slide.cards" :key="ci" class="grid-panel">
                  <div class="grid-panel-title">{{ c.title }}</div>
                  <ul class="grid-panel-bullets">
                    <li v-for="(b, bi) in c.bullets" :key="bi" v-html="renderBold(b)"></li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- summary -->
            <div v-else-if="slide.type === 'summary'" class="slide slide-modern">
              <div class="slide-sidebar">
                <div class="sidebar-deco-top"></div>
                <div class="sidebar-deco-bot"></div>
                <div class="sidebar-icon">{{ getSlideIcon(slide.title) }}</div>
                <h3 class="sidebar-title">{{ slide.title }}</h3>
                <div class="sidebar-line"></div>
              </div>
              <div class="slide-main">
                <div class="bullet-cards" v-if="slide.bullets">
                  <div v-for="(b, bi) in slide.bullets" :key="bi" class="bullet-card">
                    <div v-html="renderBulletContent(b)"></div>
                  </div>
                </div>
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

/** 渲染 bullet 卡片内容：将 **小标题**：描述 拆为独立展示模块 */
function renderBulletContent(text: string): string {
  // 匹配 **标题**：描述 或 **标题**: 描述
  const match = text.match(/^\*\*(.*?)\*\*[：:]\s*(.+)$/s)
  if (match) {
    const desc = match[2].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    return `<div class="bc-title">${match[1]}</div><div class="bc-desc">${desc}</div>`
  }
  // 没有标题：描述格式，按普通方式渲染
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
}

/** 根据标题关键词匹配图标 */
function getSlideIcon(title: string): string {
  const map: [RegExp, string][] = [
    [/数据|指标|概览|总览|概况|统计/, '📊'],
    [/目标|规划|计划|方向|战略/, '🎯'],
    [/成果|成就|完成|业绩|绩效|产出/, '🏆'],
    [/团队|协作|人员|管理|组织/, '👥'],
    [/技术|开发|工程|架构|系统/, '⚙️'],
    [/项目|产品|需求|交付/, '📋'],
    [/增长|提升|优化|效率|改进/, '📈'],
    [/总结|回顾|复盘|年度/, '📝'],
    [/展望|未来|下一步|明年/, '🚀'],
    [/创新|突破|亮点|特色/, '💡'],
    [/风险|问题|挑战|不足|困难/, '⚠️'],
    [/客户|用户|服务|满意/, '🤝'],
    [/学习|成长|培训|能力/, '📚'],
    [/质量|安全|稳定|可靠/, '🛡️'],
    [/财务|成本|预算|收入|营收/, '💰'],
    [/市场|营销|推广|品牌/, '📢'],
  ]
  for (const [re, icon] of map) {
    if (re.test(title)) return icon
  }
  return '◆'
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

/* 幻灯片预览 — 沉浸式深色画廊 */
.slides-gallery {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 40px;
  padding: 36px 0 48px;
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  background:
    /* 微妙径向光晕 */
    radial-gradient(ellipse at 50% 0%, rgba(68, 114, 196, 0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 0% 50%, rgba(44, 185, 197, 0.03) 0%, transparent 40%),
    /* 基色 */
    linear-gradient(180deg, #f5f7fa 0%, #edf1f7 50%, #e8ecf2 100%);
  border-radius: 8px;
}
.slide-wrapper {
  position: relative;
  width: 100%;
  max-width: 880px;
}
.slide-number {
  position: absolute;
  top: -26px;
  right: 4px;
  font-size: 11px;
  color: #99a8b8;
  font-weight: 500;
  letter-spacing: 1.5px;
  font-variant-numeric: tabular-nums;
}
.slide {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  box-shadow:
    0 4px 8px rgba(0, 0, 0, 0.06),
    0 12px 40px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  position: relative;
}

/* --- 深色页 --- */
.slide-dark {
  background:
    /* 噪点纹理叠加 — 增加质感深度 */
    url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E"),
    /* 对角线几何纹理 — 精致商务感 */
    repeating-linear-gradient(
      -45deg, transparent, transparent 8px,
      rgba(68, 114, 196, 0.018) 8px, rgba(68, 114, 196, 0.018) 9px
    ),
    /* mesh 径向渐变 — 光源感 */
    radial-gradient(ellipse at 20% 80%, rgba(36, 59, 106, 0.6) 0%, transparent 50%),
    radial-gradient(ellipse at 85% 15%, rgba(44, 185, 197, 0.07) 0%, transparent 40%),
    radial-gradient(ellipse at 50% 0%, rgba(68, 114, 196, 0.1) 0%, transparent 35%),
    /* 主渐变 */
    linear-gradient(160deg, #060d1a 0%, #0f1d38 25%, #1B2A4A 50%, #1a3260 75%, #152548 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

/* 装饰性光环 — 多层辉光 */
.deco-ring {
  position: absolute;
  border: 1.5px solid rgba(68, 114, 196, 0.12);
  border-radius: 50%;
  pointer-events: none;
}
.deco-ring-tl {
  width: 320px; height: 320px;
  top: -100px; left: -100px;
  box-shadow:
    0 0 80px rgba(68, 114, 196, 0.06),
    inset 0 0 60px rgba(68, 114, 196, 0.03);
}
.deco-ring-tl::after {
  content: '';
  position: absolute;
  width: 200px; height: 200px;
  top: 60px; left: 60px;
  border: 1px solid rgba(44, 185, 197, 0.1);
  border-radius: 50%;
  box-shadow: 0 0 40px rgba(44, 185, 197, 0.04);
}
.deco-ring-br {
  width: 260px; height: 260px;
  bottom: -80px; right: -80px;
  border-color: rgba(44, 185, 197, 0.1);
  box-shadow:
    0 0 60px rgba(44, 185, 197, 0.05),
    inset 0 0 40px rgba(44, 185, 197, 0.02);
}
.deco-ring-br::after {
  content: '';
  position: absolute;
  width: 400px; height: 400px;
  top: -70px; left: -70px;
  border: 1px solid rgba(68, 114, 196, 0.04);
  border-radius: 50%;
}
.deco-ring.small { width: 180px; height: 180px; }
.deco-ring.small.deco-ring-tl { top: -60px; left: -60px; }
.deco-ring.small.deco-ring-br { bottom: -50px; right: -50px; }
.deco-ring.small::after { display: none; }

/* 装饰性点阵 — 扩大范围，更精致 */
.deco-dots {
  position: absolute;
  top: 14px; right: 28px;
  width: 120px; height: 80px;
  background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1.2px, transparent 1.2px);
  background-size: 14px 14px;
  pointer-events: none;
  mask-image: linear-gradient(135deg, rgba(0,0,0,0.7), transparent);
  -webkit-mask-image: linear-gradient(135deg, rgba(0,0,0,0.7), transparent);
}

/* 标题页强调装饰线 — 更长渐变，金属光泽 */
.title-accent-line {
  width: 72px; height: 2.5px;
  background: linear-gradient(90deg, transparent, #4472C4, #2CB9C5, transparent);
  margin: 0 auto 24px;
  border-radius: 2px;
  box-shadow: 0 0 12px rgba(68, 114, 196, 0.3);
}
.title-accent-line.bottom {
  margin: 28px auto 0;
  width: 48px; height: 2px;
  opacity: 0.4;
  box-shadow: 0 0 8px rgba(44, 185, 197, 0.2);
}

.slide-center { text-align: center; padding: 0 56px; position: relative; z-index: 1; }
.slide-main-title {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  color: #fff; font-size: 36px; font-weight: 700; margin: 0 0 16px;
  letter-spacing: 4px;
  text-shadow: 0 2px 20px rgba(0,0,0,0.35), 0 0 40px rgba(68, 114, 196, 0.15);
}
.slide-subtitle {
  color: rgba(176, 190, 197, 0.85); font-size: 17px; margin: 0;
  letter-spacing: 2px;
  font-weight: 300;
}
.slide-section-title {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  color: #fff; font-size: 30px; font-weight: 700; margin: 0 0 24px;
  letter-spacing: 3px;
  text-shadow: 0 2px 16px rgba(0,0,0,0.25), 0 0 30px rgba(68, 114, 196, 0.1);
}
.slide-section-bar {
  width: 88px; height: 3px;
  background: linear-gradient(90deg, transparent, #4472C4, #2CB9C5, transparent);
  margin: 0 auto;
  border-radius: 2px;
  box-shadow: 0 0 16px rgba(68, 114, 196, 0.25);
}

/* --- section 页图标 --- */
.section-icon {
  font-size: 46px;
  margin-bottom: 20px;
  filter: drop-shadow(0 4px 16px rgba(0,0,0,0.4));
}

/* ====== 现代侧栏布局（所有内容页通用） ====== */
.slide-modern {
  display: flex;
  flex-direction: row;
  background:
    /* 右侧内容区微妙网格纹理 */
    repeating-linear-gradient(
      0deg, transparent, transparent 39px,
      rgba(68, 114, 196, 0.015) 39px, rgba(68, 114, 196, 0.015) 40px
    ),
    repeating-linear-gradient(
      90deg, transparent, transparent 39px,
      rgba(68, 114, 196, 0.015) 39px, rgba(68, 114, 196, 0.015) 40px
    ),
    linear-gradient(180deg, #ffffff 0%, #f7f9fc 50%, #f0f3f8 100%);
}

/* --- 左侧暗色侧栏 --- */
.slide-sidebar {
  width: 28%;
  background:
    /* 对角线纹理 */
    repeating-linear-gradient(
      -45deg, transparent, transparent 6px,
      rgba(255, 255, 255, 0.012) 6px, rgba(255, 255, 255, 0.012) 7px
    ),
    /* 顶部光晕 */
    radial-gradient(ellipse at 50% 0%, rgba(68, 114, 196, 0.15) 0%, transparent 50%),
    /* 底部冷光 */
    radial-gradient(ellipse at 30% 100%, rgba(44, 185, 197, 0.08) 0%, transparent 40%),
    /* 主渐变 */
    linear-gradient(180deg, #060d1a 0%, #0f1d38 30%, #1B2A4A 60%, #1e3563 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar-deco-top {
  position: absolute;
  top: -50px; right: -50px;
  width: 160px; height: 160px;
  border: 1.5px solid rgba(68, 114, 196, 0.1);
  border-radius: 50%;
  pointer-events: none;
  box-shadow: inset 0 0 30px rgba(68, 114, 196, 0.04);
}
.sidebar-deco-bot {
  position: absolute;
  bottom: -35px; left: -35px;
  width: 110px; height: 110px;
  border: 1px solid rgba(44, 185, 197, 0.08);
  border-radius: 50%;
  pointer-events: none;
  box-shadow: inset 0 0 20px rgba(44, 185, 197, 0.03);
}
.sidebar-icon {
  font-size: 44px;
  margin-bottom: 20px;
  filter: drop-shadow(0 4px 16px rgba(0,0,0,0.35));
  position: relative;
  z-index: 1;
}
.sidebar-title {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 3px;
  line-height: 2;
  margin: 0;
  position: relative;
  z-index: 1;
  text-shadow: 0 1px 8px rgba(0,0,0,0.3);
}
.sidebar-line {
  width: 36px; height: 2.5px;
  background: linear-gradient(90deg, transparent, #4472C4, #2CB9C5, transparent);
  margin-top: 18px;
  border-radius: 2px;
  box-shadow: 0 0 10px rgba(68, 114, 196, 0.2);
}

/* --- 右侧内容区 --- */
.slide-main {
  flex: 1;
  padding: 22px 26px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.slide-desc {
  color: #8899aa;
  font-size: 12px;
  margin: 0 0 12px;
  font-style: italic;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

/* --- 卡片式要点列表 --- */
.bullet-cards {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1;
  overflow: hidden;
}
.bullet-card {
  position: relative;
  background: linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(240,244,249,0.9) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(68, 114, 196, 0.06);
  border-left: none;
  border-radius: 0 10px 10px 0;
  padding: 10px 16px 10px 18px;
  font-size: 13px;
  color: #2d3748;
  line-height: 1.7;
  box-shadow:
    0 1px 3px rgba(0,0,0,0.04),
    0 4px 12px rgba(68, 114, 196, 0.04);
  /* 伸展填满可用垂直空间 */
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.bullet-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3.5px;
  background: linear-gradient(180deg, #4472C4, #2CB9C5);
  border-radius: 2px 0 0 2px;
  box-shadow: 2px 0 8px rgba(68, 114, 196, 0.15);
}
.bullet-card.sm {
  padding: 7px 12px 7px 15px;
  font-size: 12px;
}
.bullet-card :deep(strong) { color: #1B2A4A; font-weight: 700; }

/* 小标题独立展示模块 */
.bullet-card :deep(.bc-title) {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  font-size: 14px;
  font-weight: 700;
  color: #1a2744;
  margin-bottom: 5px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(68, 114, 196, 0.1);
  display: flex;
  align-items: center;
  gap: 7px;
  letter-spacing: 0.5px;
}
.bullet-card :deep(.bc-title)::before {
  content: '';
  display: inline-block;
  width: 7px; height: 7px;
  background: linear-gradient(135deg, #4472C4, #2CB9C5);
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(68, 114, 196, 0.3);
}
.bullet-card :deep(.bc-desc) {
  font-size: 12px;
  color: #5a6577;
  line-height: 1.7;
}
.bullet-card.sm :deep(.bc-title) {
  font-size: 12px;
  margin-bottom: 2px;
  padding-bottom: 3px;
}
.bullet-card.sm :deep(.bc-desc) {
  font-size: 11px;
}

/* --- 指标卡片 --- */
.metrics-row {
  display: flex;
  gap: 14px;
  margin-bottom: 14px;
  flex-shrink: 0;
}
.metric-card {
  flex: 1;
  background: linear-gradient(160deg, rgba(255,255,255,0.95) 0%, rgba(240,244,249,0.9) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(68, 114, 196, 0.08);
  border-radius: 14px;
  padding: 18px 10px 14px;
  text-align: center;
  box-shadow:
    0 2px 4px rgba(0,0,0,0.03),
    0 8px 24px rgba(68, 114, 196, 0.06),
    inset 0 1px 0 rgba(255,255,255,0.9);
  position: relative;
  overflow: hidden;
}
.metric-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, #3a8ef5, #4472C4, #6b5ce7);
}
.metric-card::after {
  content: '';
  position: absolute;
  top: 3px; left: 0; right: 0;
  height: 40px;
  background: linear-gradient(180deg, rgba(58, 142, 245, 0.04) 0%, transparent 100%);
  pointer-events: none;
}
.metric-value {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  font-size: 30px; font-weight: 900;
  background: linear-gradient(135deg, #3a8ef5, #2d6fd6, #4472C4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 6px;
  position: relative;
  z-index: 1;
}
.metric-label {
  font-size: 11px; color: #3d4f63; font-weight: 600;
  letter-spacing: 0.8px; text-transform: uppercase;
  position: relative; z-index: 1;
}
.metric-desc { font-size: 10px; color: #8899aa; margin-top: 5px; position: relative; z-index: 1; }

/* --- 双栏布局 --- */
.two-col-main { flex-direction: row; gap: 16px; }
.col-panel {
  flex: 1;
  background: linear-gradient(160deg, rgba(255,255,255,0.92) 0%, rgba(244,247,251,0.9) 100%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(68, 114, 196, 0.06);
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    0 2px 6px rgba(0,0,0,0.03),
    0 8px 24px rgba(68, 114, 196, 0.05);
  display: flex;
  flex-direction: column;
}
.col-panel-header {
  background: linear-gradient(135deg, #3a63a8, #4472C4, #5b8bd6);
  color: #fff;
  font-family: 'Noto Serif SC', 'Georgia', serif;
  font-size: 14px;
  font-weight: 700;
  padding: 11px 18px;
  letter-spacing: 1px;
  text-shadow: 0 1px 4px rgba(0,0,0,0.15);
  flex-shrink: 0;
}
.col-panel.teal .col-panel-header {
  background: linear-gradient(135deg, #22a0ac, #2CB9C5, #3dd4e0);
}
.col-panel-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

/* --- 网格布局 --- */
.grid-main { flex-direction: row; flex-wrap: wrap; gap: 14px; align-content: stretch; }
.grid-main.grid-3 .grid-panel { flex: 1 1 30%; }
.grid-panel {
  flex: 1 1 45%;
  background: linear-gradient(160deg, rgba(255,255,255,0.92) 0%, rgba(244,247,251,0.9) 100%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(68, 114, 196, 0.06);
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow:
    0 2px 6px rgba(0,0,0,0.03),
    0 8px 24px rgba(68, 114, 196, 0.05);
  position: relative;
  overflow: hidden;
  /* 伸展填满垂直空间 */
  display: flex;
  flex-direction: column;
}
.grid-panel::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, #4472C4, #2CB9C5, #6b5ce7);
}
.grid-panel::after {
  content: '';
  position: absolute;
  top: 3px; left: 0; right: 0;
  height: 30px;
  background: linear-gradient(180deg, rgba(68, 114, 196, 0.03) 0%, transparent 100%);
  pointer-events: none;
}
.grid-panel-title {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  font-size: 13px; font-weight: 700; color: #1a2744;
  margin-bottom: 10px; letter-spacing: 0.8px;
  position: relative; z-index: 1;
  flex-shrink: 0;
}
.grid-panel-bullets {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 5px;
  position: relative; z-index: 1;
  flex: 1;
  justify-content: center;
}
.grid-panel-bullets li {
  font-size: 11px; color: #5a6577; line-height: 1.55;
  padding-left: 15px;
  position: relative;
}
.grid-panel-bullets li::before {
  content: '';
  position: absolute;
  left: 0; top: 7px;
  width: 5px; height: 5px;
  background: linear-gradient(135deg, #4472C4, #2CB9C5);
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(68, 114, 196, 0.25);
}
.grid-panel-bullets li :deep(strong) { color: #1a2744; }

/* --- 总结标签 --- */
.summary-tags {
  display: flex; flex-wrap: wrap; gap: 10px;
  margin-top: auto; padding-top: 16px;
}
.summary-tag {
  padding: 7px 22px;
  border-radius: 22px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.8px;
  position: relative;
  overflow: hidden;
}
/* 标签内部光泽 */
.summary-tag::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%);
  pointer-events: none;
}
.tag-0 {
  background: linear-gradient(135deg, #3a63a8, #4472C4, #5b8bd6);
  box-shadow: 0 3px 12px rgba(68, 114, 196, 0.35);
}
.tag-1 {
  background: linear-gradient(135deg, #22a0ac, #2CB9C5, #3dd4e0);
  box-shadow: 0 3px 12px rgba(44, 185, 197, 0.35);
}
.tag-2 {
  background: linear-gradient(135deg, #d06c1a, #E67E22, #f0993c);
  box-shadow: 0 3px 12px rgba(230, 126, 34, 0.35);
}
.tag-3 {
  background: linear-gradient(135deg, #763698, #8E44AD, #a35bc4);
  box-shadow: 0 3px 12px rgba(142, 68, 173, 0.35);
}
.tag-4 {
  background: linear-gradient(135deg, #c73a2e, #E74C3C, #f06b5e);
  box-shadow: 0 3px 12px rgba(231, 76, 60, 0.35);
}
.tag-5 {
  background: linear-gradient(135deg, #1e9050, #27AE60, #3cc975);
  box-shadow: 0 3px 12px rgba(39, 174, 96, 0.35);
}

.ppt-preview-footer { display: flex; justify-content: center; gap: 16px; }
</style>
