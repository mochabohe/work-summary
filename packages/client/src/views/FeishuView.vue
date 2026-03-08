<template>
  <div class="feishu-view">
    <el-card>
      <template #header>
        <span>补充材料</span>
      </template>

      <p class="section-desc">
        粘贴会议纪要、周报、项目文档等补充材料，AI 会将这些内容纳入总结参考。可添加多份文档。
      </p>

      <!-- 粘贴输入区 -->
      <el-input
        v-model="pasteContent"
        type="textarea"
        :rows="8"
        placeholder="粘贴文档内容..."
        resize="vertical"
      />
      <el-button
        type="primary"
        @click="addDoc"
        :disabled="!pasteContent.trim()"
        style="margin-top: 12px;"
      >
        添加文档
      </el-button>
    </el-card>

    <!-- 已添加的文档列表 -->
    <el-card v-if="summaryStore.feishuDocs.length > 0" class="doc-list-card">
      <template #header>
        <span>已添加的文档 ({{ summaryStore.feishuDocs.length }})</span>
      </template>

      <div v-for="(doc, index) in summaryStore.feishuDocs" :key="index" class="doc-item">
        <div class="doc-info">
          <div class="doc-label">文档 {{ index + 1 }}</div>
          <div class="doc-preview">{{ doc.content.substring(0, 120) }}{{ doc.content.length > 120 ? '...' : '' }}</div>
        </div>
        <el-button type="danger" text @click="summaryStore.removeFeishuDoc(index)">
          删除
        </el-button>
      </div>
    </el-card>

    <!-- 操作栏 -->
    <div class="action-bar">
      <el-button @click="router.push('/analysis')">上一步</el-button>
      <div>
        <el-button @click="router.push('/generate')">
          跳过此步
        </el-button>
        <el-button type="primary" size="large" @click="router.push('/generate')">
          下一步：生成总结
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useSummaryStore } from '@/stores/summary'

const router = useRouter()
const summaryStore = useSummaryStore()

const pasteContent = ref('')

function addDoc() {
  const content = pasteContent.value.trim()
  if (!content) return

  summaryStore.addFeishuDoc({ content })
  ElMessage.success('文档已添加')
  pasteContent.value = ''
}
</script>

<style scoped>
.feishu-view {
  max-width: 800px;
  margin: 0 auto;
}

.section-desc {
  font-size: 14px;
  color: #606266;
  margin-bottom: 16px;
}

.doc-list-card {
  margin-top: 16px;
}

.doc-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  margin-bottom: 8px;
}

.doc-label {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.doc-preview {
  font-size: 13px;
  color: #909399;
  line-height: 1.5;
}

.action-bar {
  margin-top: 24px;
  display: flex;
  justify-content: space-between;
}
</style>
