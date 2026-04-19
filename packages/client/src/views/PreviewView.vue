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

        <div class="export-filename">
          <label class="export-filename-label">文件名</label>
          <el-input
            v-model="exportFilename"
            placeholder="例如：工作总结、Q3 季度总结"
            size="default"
            style="width: 280px;"
          >
            <template #suffix>
              <span class="filename-suffix">.md / .docx</span>
            </template>
          </el-input>
        </div>

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
            严格忠于正文 PPT
          </el-button>

          <el-button
            size="large"
            @click="copyContent"
          >
            <el-icon><CopyDocument /></el-icon>
            复制到剪贴板
          </el-button>

          <el-divider direction="vertical" />

          <el-button
            type="danger"
            size="large"
            @click="openBaiduPptStyleDialog"
            :loading="exporting === 'baidu-ppt'"
            :disabled="!baiduPptAvailable"
          >
            ✨ AI 重构美化版 PPT
          </el-button>
        </div>
      </el-card>

      <el-dialog
        v-model="baiduPptStyleVisible"
        title="选择演示文稿风格"
        width="520"
        :close-on-click-modal="false"
      >
        <el-form label-position="top">
          <el-form-item label="模板风格">
            <el-select
              v-model="selectedBaiduPptCategory"
              style="width: 100%;"
              placeholder="选择风格"
              :loading="baiduPptThemesLoading"
            >
              <el-option label="自动推荐" value="" />
              <el-option
                v-for="category in baiduPptCategories"
                :key="category"
                :label="category"
                :value="category"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <div class="baidu-style-hint">
          <span v-if="selectedBaiduPptCategory">当前将优先使用“{{ selectedBaiduPptCategory }}”风格模板。</span>
          <span v-else>当前为自动推荐，系统会根据总结内容匹配合适风格。</span>
        </div>
        <template #footer>
          <el-button @click="baiduPptStyleVisible = false">取消</el-button>
          <el-button type="primary" @click="handleBaiduPptExport">开始生成</el-button>
        </template>
      </el-dialog>

      <!-- 百度 AI PPT 进度对话框 -->
      <el-dialog
        v-model="baiduPptVisible"
        title="✨ AI 精美演示文稿生成"
        width="520"
        :close-on-click-modal="false"
        :show-close="true"
        @close="cancelBaiduPpt"
      >
        <div class="baidu-ppt-progress">
          <el-icon v-if="!baiduPptDone" class="is-loading baidu-spinner"><Loading /></el-icon>
          <el-icon v-else-if="!baiduPptError" style="font-size:40px;color:#67c23a;">
            <SuccessFilled />
          </el-icon>
          <span v-else style="font-size:32px;">❌</span>
          <p class="baidu-ppt-status">{{ baiduPptStatus }}</p>
          <div v-if="baiduPptOutline" class="baidu-ppt-outline">
            <pre>{{ baiduPptOutline }}</pre>
          </div>
          <div v-if="baiduPptUrl" class="baidu-ppt-actions">
            <el-button type="primary" size="large" @click="downloadBaiduPpt">
              📥 下载 PPT
            </el-button>
          </div>
        </div>
      </el-dialog>

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
              placeholder="例如：工作总结、Q3 季度总结、员工述职报告"
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
        <!-- 颜色自定义工具栏 -->
        <div class="color-config-bar">
          <div class="color-config-item">
            <span class="color-config-label">主题色</span>
            <el-color-picker v-model="themeColor" size="small" />
            <el-input v-model="themeColorText" size="small" class="color-input" @change="onThemeColorText" placeholder="#1B2A4A" />
          </div>
          <div class="color-config-item">
            <span class="color-config-label">高亮色</span>
            <el-color-picker v-model="highlightColor" size="small" />
            <el-input v-model="highlightColorText" size="small" class="color-input" @change="onHighlightColorText" placeholder="#4472C4" />
          </div>
        </div>

        <div class="slides-gallery" v-if="slidesData" :style="themeVars">
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
                <div class="bullet-cards" :class="{ 'bullets-compact': slide.bullets && slide.bullets.length > 4 }" v-if="slide.bullets && slide.bullets.length">
                  <div v-for="(b, bi) in slide.bullets" :key="bi" class="bullet-card" :class="{ sm: slide.bullets.length > 4 }">
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
                <div class="bullet-cards" :class="{ 'bullets-compact': slide.bullets && slide.bullets.length > 4 }" v-if="slide.bullets">
                  <div v-for="(b, bi) in slide.bullets" :key="bi" class="bullet-card" :class="{ sm: slide.bullets.length > 4 }">
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
                <div class="bullet-cards" :class="{ 'bullets-compact': slide.bullets && slide.bullets.length > 4 }" v-if="slide.bullets">
                  <div v-for="(b, bi) in slide.bullets" :key="bi" class="bullet-card" :class="{ sm: slide.bullets && slide.bullets.length > 4 }">
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
import { Document, CopyDocument } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import { useSummaryStore } from '@/stores/summary'
import { exportMarkdown, exportDocx, generateSlides, downloadPptx, downloadPdfSlides, checkBaiduPptStatus, exportBaiduPpt, downloadFromUrl, fetchBaiduPptThemes } from '@/api/exportApi'
import type { PptData, CustomColors, BaiduPptTheme } from '@/api/exportApi'

const router = useRouter()
const summaryStore = useSummaryStore()
const md = new MarkdownIt()

const editableContent = ref(summaryStore.content)
const exporting = ref<string>('')

// ====== 颜色自定义 ======
const themeColor = ref('#1B2A4A')
const highlightColor = ref('#4472C4')
const themeColorText = ref('#1B2A4A')
const highlightColorText = ref('#4472C4')

/** 解析任意 CSS 颜色字符串为 #hex 格式（支持 #fff, red, rgb() 等） */
function resolveColor(input: string): string {
  input = input.trim()
  if (!input) return ''
  const short = /^#?([a-fA-F0-9])([a-fA-F0-9])([a-fA-F0-9])$/.exec(input)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
  if (/^#[a-fA-F0-9]{6}$/i.test(input)) return input.toLowerCase()
  if (/^[a-fA-F0-9]{6}$/.test(input)) return `#${input}`.toLowerCase()
  if (/^[a-fA-F0-9]{3}$/.test(input)) return `#${input[0]}${input[0]}${input[1]}${input[1]}${input[2]}${input[2]}`.toLowerCase()
  // 使用 canvas 解析命名颜色
  const ctx = document.createElement('canvas').getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#010101'
    ctx.fillStyle = input
    if (ctx.fillStyle !== '#010101' || input.toLowerCase() === 'black') return ctx.fillStyle
  }
  return ''
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * Math.max(0, Math.min(1, c))).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function adjustLight(hex: string, amount: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex))
  return hslToHex(h, s, Math.max(0, Math.min(100, l + amount)))
}

function shiftHue(hex: string, degrees: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex))
  return hslToHex((h + degrees + 360) % 360, s, l)
}

// 颜色输入同步
watch(themeColor, (v) => { themeColorText.value = v })
watch(highlightColor, (v) => { highlightColorText.value = v })

function onThemeColorText(val: string) {
  const hex = resolveColor(val)
  if (hex) { themeColor.value = hex; themeColorText.value = hex }
}
function onHighlightColorText(val: string) {
  const hex = resolveColor(val)
  if (hex) { highlightColor.value = hex; highlightColorText.value = hex }
}

/** 根据主题色和高亮色生成全部 CSS 自定义属性 */
const themeVars = computed(() => {
  const t = themeColor.value
  const h = highlightColor.value
  const tRgb = hexToRgb(t)
  const hRgb = hexToRgb(h)
  // 从高亮色推导互补色（类似原来的 teal）
  const h2 = shiftHue(h, 160)
  const h2Rgb = hexToRgb(h2)
  // 从高亮色推导第三辅助色（类似原来的 purple）
  const h3 = shiftHue(h, -60)

  return {
    '--t': t,
    '--t-rgb': tRgb.join(' '),
    '--t-darkest': adjustLight(t, -15),
    '--t-darker': adjustLight(t, -8),
    '--t-lighter': adjustLight(t, 8),
    '--t-lightest': adjustLight(t, 12),
    '--t-text': adjustLight(t, -5),
    '--h': h,
    '--h-rgb': hRgb.join(' '),
    '--h-darker': adjustLight(h, -10),
    '--h-lighter': adjustLight(h, 10),
    '--h-bright': adjustLight(h, 15),
    '--h2': h2,
    '--h2-rgb': h2Rgb.join(' '),
    '--h2-darker': adjustLight(h2, -10),
    '--h2-lighter': adjustLight(h2, 10),
    '--h3': h3,
  } as Record<string, string>
})

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

// 导出文件名
const exportFilename = ref(`工作总结-${new Date().getFullYear()}`)

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
const pptTitle = ref('工作总结')
let cancelPptFn: (() => void) | null = null

function showPptTitleDialog() {
  pptTitle.value = '工作总结'
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
    { strict: true },
  )
}

function cancelPptExport() {
  if (cancelPptFn) {
    cancelPptFn()
    cancelPptFn = null
  }
  exporting.value = ''
}

/** 获取当前自定义配色 */
function getCustomColors(): CustomColors {
  return { themeColor: themeColor.value, highlightColor: highlightColor.value }
}

async function confirmPptDownload() {
  if (!slidesData.value) return
  pptDownloading.value = true
  try {
    const filename = `${pptTitle.value || '工作总结'}-${new Date().getFullYear()}`
    await downloadPptx(slidesData.value, filename, getCustomColors())
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
    const filename = `${pptTitle.value || '工作总结'}-${new Date().getFullYear()}`
    await downloadPdfSlides(slidesData.value, filename, getCustomColors())
    ElMessage.success('PDF 已下载')
  } catch (err: any) {
    ElMessage.error(`导出失败: ${err.message}`)
  } finally {
    pdfSlidesDownloading.value = false
  }
}

// ====== 百度 AI PPT 精美导出 ======
const baiduPptAvailable = ref(false)
const baiduPptVisible = ref(false)
const baiduPptStatus = ref('')
const baiduPptOutline = ref('')
const baiduPptUrl = ref('')
const baiduPptDone = ref(false)
const baiduPptError = ref(false)
const baiduPptStyleVisible = ref(false)
const baiduPptThemesLoading = ref(false)
const baiduPptThemes = ref<BaiduPptTheme[]>([])
const selectedBaiduPptCategory = ref('')
let cancelBaiduPptFn: (() => void) | null = null

// 启动时检查百度 API 是否可用
checkBaiduPptStatus().then((ok) => { baiduPptAvailable.value = ok })

const baiduPptCategories = computed(() => {
  const set = new Set<string>()
  for (const theme of baiduPptThemes.value) {
    for (const name of theme.style_name_list || []) {
      if (name && name !== '默认') set.add(name)
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

async function openBaiduPptStyleDialog() {
  selectedBaiduPptCategory.value = ''

  if (baiduPptThemesLoading.value) return

  if (baiduPptThemes.value.length === 0) {
    baiduPptThemesLoading.value = true
    try {
      baiduPptThemes.value = await fetchBaiduPptThemes()
    } catch (err) {
      ElMessage.warning(`加载 PPT 风格失败，将继续使用自动推荐：${(err as Error).message}`)
    } finally {
      baiduPptThemesLoading.value = false
    }
  }

  if (baiduPptCategories.value.length === 0) {
    handleBaiduPptExport()
    return
  }

  baiduPptStyleVisible.value = true
}

function handleBaiduPptExport() {
  baiduPptStyleVisible.value = false
  exporting.value = 'baidu-ppt'
  baiduPptStatus.value = '正在连接百度 AI PPT 服务...'
  baiduPptOutline.value = ''
  baiduPptUrl.value = ''
  baiduPptDone.value = false
  baiduPptError.value = false
  baiduPptVisible.value = true

  cancelBaiduPptFn = exportBaiduPpt(
    editableContent.value,
    (status) => {
      baiduPptStatus.value = status
    },
    (pptUrl) => {
      baiduPptUrl.value = pptUrl
      baiduPptDone.value = true
      baiduPptStatus.value = '🎉 PPT 生成完成！点击下方按钮下载'
      exporting.value = ''
    },
    (err) => {
      baiduPptStatus.value = `生成失败: ${err}`
      baiduPptDone.value = true
      baiduPptError.value = true
      exporting.value = ''
      ElMessage.error(`AI PPT 生成失败: ${err}`)
    },
    {
      filename: exportFilename.value,
      category: selectedBaiduPptCategory.value || undefined,
    },
    (chunk) => {
      baiduPptOutline.value += chunk
    },
  )
}

function cancelBaiduPpt() {
  if (cancelBaiduPptFn) {
    cancelBaiduPptFn()
    cancelBaiduPptFn = null
  }
  exporting.value = ''
}

function downloadBaiduPpt() {
  if (baiduPptUrl.value) {
    const filename = `${exportFilename.value || '工作总结'}.pptx`
    downloadFromUrl(baiduPptUrl.value, filename)
    ElMessage.success('PPT 已开始下载')
  }
}

async function handleExport(format: string) {
  exporting.value = format

  try {
    const filename = exportFilename.value.trim() || `工作总结-${new Date().getFullYear()}`

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

.preview-view :deep(.el-row) {
  align-items: stretch;
}

.preview-view :deep(.el-col) {
  display: flex;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.editor-card,
.preview-card {
  height: 600px;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.editor-card :deep(.el-card__body),
.preview-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-textarea {
  flex: 1;
  min-height: 0;
}

.editor-textarea :deep(.el-textarea__inner) {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 14px;
  line-height: 1.6;
  height: 100% !important;
  min-height: 100% !important;
  resize: none;
}

.markdown-preview {
  flex: 1;
  min-height: 0;
  line-height: 1.8;
  font-size: 14px;
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
  color: #e2e8f0;
  margin: 20px 0 10px;
}

.markdown-preview :deep(h3) {
  font-size: 16px;
  color: #cbd5e1;
  margin: 16px 0 8px;
}

.markdown-preview :deep(strong) {
  color: #e2e8f0;
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

.export-filename {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.export-filename-label {
  font-size: 14px;
  color: #cbd5e1;
  white-space: nowrap;
}

.filename-suffix {
  font-size: 12px;
  color: #c0c4cc;
}

.export-actions {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.export-actions > :deep(.el-button--warning) {
  font-size: 0;
}

.export-actions > :deep(.el-button--warning .el-icon) {
  margin-right: 8px;
}

.export-actions > :deep(.el-button--warning::after) {
  content: '导出为演示文稿';
  font-size: 16px;
}

.export-actions > :deep(.el-divider--vertical),
.export-actions > :deep(.el-button--danger) {
  display: none !important;
}

.baidu-style-hint {
  font-size: 13px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.65);
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
  color: rgba(255, 255, 255, 0.6);
}

/* 全屏对话框布局：让画廊占满对话框主体 */
.ppt-preview-dialog :deep(.el-dialog) {
  display: flex;
  flex-direction: column;
}
.ppt-preview-dialog :deep(.el-dialog__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

/* 幻灯片预览 — 沉浸式深色画廊 */
.slides-gallery {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 40px;
  padding: 36px 0 48px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background:
    radial-gradient(ellipse at 50% 0%, rgb(var(--h-rgb) / 0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 0% 50%, rgb(var(--h2-rgb) / 0.03) 0%, transparent 40%),
    linear-gradient(180deg, #f5f7fa 0%, #edf1f7 50%, #e8ecf2 100%);
  border-radius: 0;
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
    url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E"),
    repeating-linear-gradient(
      -45deg, transparent, transparent 8px,
      rgb(var(--h-rgb) / 0.018) 8px, rgb(var(--h-rgb) / 0.018) 9px
    ),
    radial-gradient(ellipse at 20% 80%, rgb(var(--t-rgb) / 0.6) 0%, transparent 50%),
    radial-gradient(ellipse at 85% 15%, rgb(var(--h2-rgb) / 0.07) 0%, transparent 40%),
    radial-gradient(ellipse at 50% 0%, rgb(var(--h-rgb) / 0.1) 0%, transparent 35%),
    linear-gradient(160deg, var(--t-darkest) 0%, var(--t-darker) 25%, var(--t) 50%, var(--t-lighter) 75%, var(--t) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

/* 装饰性光环 — 多层辉光 */
.deco-ring {
  position: absolute;
  border: 1.5px solid rgb(var(--h-rgb) / 0.12);
  border-radius: 50%;
  pointer-events: none;
}
.deco-ring-tl {
  width: 320px; height: 320px;
  top: -100px; left: -100px;
  box-shadow:
    0 0 80px rgb(var(--h-rgb) / 0.06),
    inset 0 0 60px rgb(var(--h-rgb) / 0.03);
}
.deco-ring-tl::after {
  content: '';
  position: absolute;
  width: 200px; height: 200px;
  top: 60px; left: 60px;
  border: 1px solid rgb(var(--h2-rgb) / 0.1);
  border-radius: 50%;
  box-shadow: 0 0 40px rgb(var(--h2-rgb) / 0.04);
}
.deco-ring-br {
  width: 260px; height: 260px;
  bottom: -80px; right: -80px;
  border-color: rgb(var(--h2-rgb) / 0.1);
  box-shadow:
    0 0 60px rgb(var(--h2-rgb) / 0.05),
    inset 0 0 40px rgb(var(--h2-rgb) / 0.02);
}
.deco-ring-br::after {
  content: '';
  position: absolute;
  width: 400px; height: 400px;
  top: -70px; left: -70px;
  border: 1px solid rgb(var(--h-rgb) / 0.04);
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
  background: linear-gradient(90deg, transparent, var(--h), var(--h2), transparent);
  margin: 0 auto 24px;
  border-radius: 2px;
  box-shadow: 0 0 12px rgb(var(--h-rgb) / 0.3);
}
.title-accent-line.bottom {
  margin: 28px auto 0;
  width: 48px; height: 2px;
  opacity: 0.4;
  box-shadow: 0 0 8px rgb(var(--h2-rgb) / 0.2);
}

.slide-center { text-align: center; padding: 0 56px; position: relative; z-index: 1; }
.slide-main-title {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  color: #fff; font-size: 36px; font-weight: 700; margin: 0 0 16px;
  letter-spacing: 4px;
  text-shadow: 0 2px 20px rgba(0,0,0,0.35), 0 0 40px rgb(var(--h-rgb) / 0.15);
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
  text-shadow: 0 2px 16px rgba(0,0,0,0.25), 0 0 30px rgb(var(--h-rgb) / 0.1);
}
.slide-section-bar {
  width: 88px; height: 3px;
  background: linear-gradient(90deg, transparent, var(--h), var(--h2), transparent);
  margin: 0 auto;
  border-radius: 2px;
  box-shadow: 0 0 16px rgb(var(--h-rgb) / 0.25);
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
    repeating-linear-gradient(
      0deg, transparent, transparent 39px,
      rgb(var(--h-rgb) / 0.015) 39px, rgb(var(--h-rgb) / 0.015) 40px
    ),
    repeating-linear-gradient(
      90deg, transparent, transparent 39px,
      rgb(var(--h-rgb) / 0.015) 39px, rgb(var(--h-rgb) / 0.015) 40px
    ),
    linear-gradient(180deg, #ffffff 0%, #f7f9fc 50%, #f0f3f8 100%);
}

/* --- 左侧暗色侧栏 --- */
.slide-sidebar {
  width: 28%;
  background:
    repeating-linear-gradient(
      -45deg, transparent, transparent 6px,
      rgba(255, 255, 255, 0.012) 6px, rgba(255, 255, 255, 0.012) 7px
    ),
    radial-gradient(ellipse at 50% 0%, rgb(var(--h-rgb) / 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 30% 100%, rgb(var(--h2-rgb) / 0.08) 0%, transparent 40%),
    linear-gradient(180deg, var(--t-darkest) 0%, var(--t-darker) 30%, var(--t) 60%, var(--t-lightest) 100%);
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
  border: 1.5px solid rgb(var(--h-rgb) / 0.1);
  border-radius: 50%;
  pointer-events: none;
  box-shadow: inset 0 0 30px rgb(var(--h-rgb) / 0.04);
}
.sidebar-deco-bot {
  position: absolute;
  bottom: -35px; left: -35px;
  width: 110px; height: 110px;
  border: 1px solid rgb(var(--h2-rgb) / 0.08);
  border-radius: 50%;
  pointer-events: none;
  box-shadow: inset 0 0 20px rgb(var(--h2-rgb) / 0.03);
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
  background: linear-gradient(90deg, transparent, var(--h), var(--h2), transparent);
  margin-top: 18px;
  border-radius: 2px;
  box-shadow: 0 0 10px rgb(var(--h-rgb) / 0.2);
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
  border: 1px solid rgb(var(--h-rgb) / 0.06);
  border-left: none;
  border-radius: 0 10px 10px 0;
  padding: 10px 16px 10px 18px;
  font-size: 13px;
  color: #2d3748;
  line-height: 1.7;
  box-shadow:
    0 1px 3px rgba(0,0,0,0.04),
    0 4px 12px rgb(var(--h-rgb) / 0.04);
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
  background: linear-gradient(180deg, var(--h), var(--h2));
  border-radius: 2px 0 0 2px;
  box-shadow: 2px 0 8px rgb(var(--h-rgb) / 0.15);
}
.bullet-card.sm {
  padding: 6px 12px 6px 15px;
  font-size: 12px;
  line-height: 1.5;
}
.bullets-compact {
  gap: 4px;
}
.bullets-compact .bullet-card.sm :deep(.bc-title) {
  font-size: 12px;
  margin-bottom: 2px;
  padding-bottom: 3px;
}
.bullets-compact .bullet-card.sm :deep(.bc-desc) {
  font-size: 11px;
  line-height: 1.5;
}
.bullet-card :deep(strong) { color: var(--t, #1B2A4A); font-weight: 700; }

/* 小标题独立展示模块 */
.bullet-card :deep(.bc-title) {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  font-size: 14px;
  font-weight: 700;
  color: var(--t-text, #1a2744);
  margin-bottom: 5px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgb(var(--h-rgb) / 0.1);
  display: flex;
  align-items: center;
  gap: 7px;
  letter-spacing: 0.5px;
}
.bullet-card :deep(.bc-title)::before {
  content: '';
  display: inline-block;
  width: 7px; height: 7px;
  background: linear-gradient(135deg, var(--h), var(--h2));
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgb(var(--h-rgb) / 0.3);
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
  border: 1px solid rgb(var(--h-rgb) / 0.08);
  border-radius: 14px;
  padding: 18px 10px 14px;
  text-align: center;
  box-shadow:
    0 2px 4px rgba(0,0,0,0.03),
    0 8px 24px rgb(var(--h-rgb) / 0.06),
    inset 0 1px 0 rgba(255,255,255,0.9);
  position: relative;
  overflow: hidden;
}
.metric-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--h-bright), var(--h), var(--h3));
}
.metric-card::after {
  content: '';
  position: absolute;
  top: 3px; left: 0; right: 0;
  height: 40px;
  background: linear-gradient(180deg, rgb(var(--h-rgb) / 0.04) 0%, transparent 100%);
  pointer-events: none;
}
.metric-value {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  font-size: 30px; font-weight: 900;
  background: linear-gradient(135deg, var(--h-bright), var(--h-darker), var(--h));
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
  border: 1px solid rgb(var(--h-rgb) / 0.06);
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    0 2px 6px rgba(0,0,0,0.03),
    0 8px 24px rgb(var(--h-rgb) / 0.05);
  display: flex;
  flex-direction: column;
}
.col-panel-header {
  background: linear-gradient(135deg, var(--h-darker), var(--h), var(--h-lighter));
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
  background: linear-gradient(135deg, var(--h2-darker), var(--h2), var(--h2-lighter));
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
  border: 1px solid rgb(var(--h-rgb) / 0.06);
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow:
    0 2px 6px rgba(0,0,0,0.03),
    0 8px 24px rgb(var(--h-rgb) / 0.05);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.grid-panel::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--h), var(--h2), var(--h3));
}
.grid-panel::after {
  content: '';
  position: absolute;
  top: 3px; left: 0; right: 0;
  height: 30px;
  background: linear-gradient(180deg, rgb(var(--h-rgb) / 0.03) 0%, transparent 100%);
  pointer-events: none;
}
.grid-panel-title {
  font-family: 'Noto Serif SC', 'Georgia', serif;
  font-size: 13px; font-weight: 700; color: var(--t-text, #1a2744);
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
  background: linear-gradient(135deg, var(--h), var(--h2));
  border-radius: 50%;
  box-shadow: 0 0 4px rgb(var(--h-rgb) / 0.25);
}
.grid-panel-bullets li :deep(strong) { color: var(--t-text, #1a2744); }

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
  background: linear-gradient(135deg, var(--h-darker), var(--h), var(--h-lighter));
  box-shadow: 0 3px 12px rgb(var(--h-rgb) / 0.35);
}
.tag-1 {
  background: linear-gradient(135deg, var(--h2-darker), var(--h2), var(--h2-lighter));
  box-shadow: 0 3px 12px rgb(var(--h2-rgb) / 0.35);
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

/* --- 颜色配置工具栏 --- */
.color-config-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid #e8ecf2;
  flex-shrink: 0;
}
.color-config-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.color-config-label {
  font-size: 13px;
  font-weight: 600;
  color: #3d4f63;
  white-space: nowrap;
}
.color-input {
  width: 110px;
}

.ppt-preview-footer { display: flex; justify-content: center; gap: 16px; }

/* 百度 AI PPT 进度 */
.baidu-ppt-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0;
  gap: 16px;
}
.baidu-spinner {
  font-size: 40px;
  color: var(--el-color-danger);
}
.baidu-ppt-status {
  font-size: 15px;
  color: #e2e8f0;
  text-align: center;
  line-height: 1.6;
}
.baidu-ppt-outline {
  width: 100%;
  max-height: 260px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 12px 14px;
  text-align: left;
}
.baidu-ppt-outline pre {
  margin: 0;
  font-size: 13px;
  color: #cbd5e1;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.7;
}
.baidu-ppt-actions {
  margin-top: 8px;
}
</style>
