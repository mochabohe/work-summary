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
            @click="handleExport('pdf')"
            :loading="exporting === 'pdf'"
          >
            <el-icon><Document /></el-icon>
            导出 PDF
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, CopyDocument } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import { useSummaryStore } from '@/stores/summary'
import { exportMarkdown, exportDocx, exportPdf } from '@/api/exportApi'

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

function copyContent() {
  navigator.clipboard.writeText(editableContent.value)
  ElMessage.success('已复制到剪贴板')
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
      case 'pdf':
        await exportPdf(editableContent.value, filename)
        ElMessage.success('PDF 文件已下载')
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
</style>
