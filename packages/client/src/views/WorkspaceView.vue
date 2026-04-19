<template>
  <div class="workspace-view">
    <!-- 顶部操作栏 -->
    <div class="ws-toolbar">
      <div class="ws-stats">
        <div class="stat-item">
          <span class="stat-value">{{ store.totalCount }}</span>
          <span class="stat-label">工作项</span>
        </div>
        <div class="stat-item" v-if="store.draftCount > 0">
          <span class="stat-value warning">{{ store.draftCount }}</span>
          <span class="stat-label">待确认草稿</span>
          <el-button size="small" type="primary" link @click="goImport">查看 →</el-button>
        </div>
      </div>
      <div class="ws-actions">
        <el-button @click="$router.push('/workspace/import')">
          <el-icon><Upload /></el-icon>
          导入文档
        </el-button>
        <el-button type="primary" @click="$router.push('/workspace/manual')">
          <el-icon><Plus /></el-icon>
          手动录入
        </el-button>
      </div>
    </div>

    <!-- 筛选条 -->
    <div class="ws-filters" v-if="store.totalCount > 0">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索标题/标签/描述"
        clearable
        size="default"
        style="width: 280px;"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select
        v-model="filterCategory"
        placeholder="全部分类"
        clearable
        style="width: 160px;"
      >
        <el-option
          v-for="cat in store.categories"
          :key="cat"
          :label="cat"
          :value="cat"
        />
      </el-select>
      <el-button-group>
        <el-button :type="dateRange === 'all' ? 'primary' : ''" @click="dateRange = 'all'">全部</el-button>
        <el-button :type="dateRange === 'month' ? 'primary' : ''" @click="dateRange = 'month'">近 30 天</el-button>
        <el-button :type="dateRange === 'quarter' ? 'primary' : ''" @click="dateRange = 'quarter'">近 90 天</el-button>
      </el-button-group>
      <div class="ws-filters-spacer"></div>
      <el-button
        v-if="filteredItems.length > 0"
        type="primary"
        @click="goGenerate"
      >
        生成总结 ({{ filteredItems.length }} 项) →
      </el-button>
    </div>

    <!-- 列表 / 空态 -->
    <div v-if="filteredItems.length > 0" class="ws-list">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="ws-card"
      >
        <div class="ws-card-head">
          <div class="ws-card-title">
            <span class="source-tag" :class="item.source">{{ sourceLabel(item.source) }}</span>
            <h3>{{ item.title }}</h3>
          </div>
          <div class="ws-card-actions">
            <el-button size="small" link @click="editItem(item)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-popconfirm title="确认删除该工作项？" @confirm="store.removeItem(item.id)">
              <template #reference>
                <el-button size="small" link>
                  <el-icon><Delete /></el-icon>
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>

        <div class="ws-card-meta">
          <span v-if="item.category" class="meta-chip">{{ item.category }}</span>
          <span class="meta-date">
            <el-icon><Calendar /></el-icon>
            {{ formatDate(item.date.start) }}
            <template v-if="item.date.end && item.date.end !== item.date.start">
              ~ {{ formatDate(item.date.end) }}
            </template>
          </span>
          <span v-for="t in item.tags" :key="t" class="meta-tag">#{{ t }}</span>
        </div>

        <p v-if="item.description" class="ws-card-desc">{{ item.description }}</p>

        <div v-if="item.metrics?.length" class="ws-card-metrics">
          <div v-for="m in item.metrics" :key="m.label" class="metric">
            <span class="metric-label">{{ m.label }}</span>
            <span class="metric-value">{{ m.value }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="ws-empty">
      <div class="empty-icon">📝</div>
      <h2>开始记录你的工作项</h2>
      <p class="empty-desc">
        工作项是产生总结报告的原材料。每条工作项代表你完成的一件具体事项，<br>
        包含标题、时间、数据成果和详细说明。
      </p>
      <div class="empty-actions">
        <el-button size="large" @click="$router.push('/workspace/import')">
          <el-icon><Upload /></el-icon>
          从文档导入
        </el-button>
        <el-button size="large" type="primary" @click="$router.push('/workspace/manual')">
          <el-icon><Plus /></el-icon>
          手动录入
        </el-button>
      </div>

      <div class="empty-tips">
        <h4>三种使用方式：</h4>
        <ul>
          <li><strong>文档导入</strong>：上传你写过的周报/月报，AI 自动结构化</li>
          <li><strong>Excel 批量</strong>：下载模板填写后一次性导入</li>
          <li><strong>手动录入</strong>：边干边记，最贴近你的实际工作</li>
        </ul>
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
import {
  Upload, Plus, Search, Edit, Delete, Calendar,
} from '@element-plus/icons-vue'
import { useWorkspaceStore } from '@/stores/workspace'
import WorkItemEditor from '@/components/workspace/WorkItemEditor.vue'
import type { WorkItem } from '@work-summary/shared'

const router = useRouter()
const store = useWorkspaceStore()

const searchKeyword = ref('')
const filterCategory = ref('')
const dateRange = ref<'all' | 'month' | 'quarter'>('all')
const editingItem = ref<WorkItem | null>(null)

const filteredItems = computed(() => {
  let list = store.workItems

  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(i =>
      i.title.toLowerCase().includes(kw)
      || i.description.toLowerCase().includes(kw)
      || (i.tags ?? []).some(t => t.toLowerCase().includes(kw)),
    )
  }

  if (filterCategory.value) {
    list = list.filter(i => i.category === filterCategory.value)
  }

  if (dateRange.value !== 'all') {
    const days = dateRange.value === 'month' ? 30 : 90
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    list = list.filter(i => {
      const start = new Date(i.date.start).getTime()
      const end = i.date.end ? new Date(i.date.end).getTime() : start
      return end >= cutoff
    })
  }

  return list
})

function sourceLabel(s: WorkItem['source']) {
  return { manual: '手输', document: '文档', git: 'Git' }[s]
}

function formatDate(s: string) {
  return s.replace(/-/g, '/')
}

function editItem(item: WorkItem) {
  editingItem.value = { ...item }
}

function onEditorSave(item: WorkItem) {
  store.updateItem(item.id, item)
  editingItem.value = null
}

function goImport() {
  router.push('/workspace/import')
}

function goGenerate() {
  router.push('/workspace/generate')
}
</script>

<style scoped>
.workspace-view {
  max-width: 1200px;
  margin: 0 auto;
}

/* ============= 工具栏 ============= */
.ws-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  backdrop-filter: blur(16px);
}

.ws-stats {
  display: flex;
  gap: 32px;
  align-items: center;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-value.warning {
  background: linear-gradient(135deg, #f59e0b, #ec4899);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-label {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.6));
}

.ws-actions {
  display: flex;
  gap: 12px;
}

/* ============= 筛选条 ============= */
.ws-filters {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
}

.ws-filters-spacer { flex: 1; }

/* ============= 卡片列表 ============= */
.ws-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}

.ws-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 18px 20px;
  transition: all 0.25s ease;
}

.ws-card:hover {
  border-color: rgba(167, 139, 250, 0.4);
  background: rgba(255, 255, 255, 0.06);
  transform: translateY(-2px);
}

.ws-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.ws-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.ws-card-title h3 {
  font-size: 15px;
  color: var(--ws-text-primary, #fff);
  margin: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  flex-shrink: 0;
}
.source-tag.manual { background: rgba(52, 211, 153, 0.18); color: #34d399; }
.source-tag.document { background: rgba(102, 126, 234, 0.18); color: #a78bfa; }
.source-tag.git { background: rgba(236, 72, 153, 0.18); color: #ec4899; }

.ws-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.6));
}

.meta-chip {
  background: rgba(102, 126, 234, 0.15);
  color: #a78bfa;
  padding: 2px 8px;
  border-radius: 4px;
}

.meta-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-tag {
  color: var(--ws-text-muted, rgba(255,255,255,0.4));
}

.ws-card-desc {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.7));
  line-height: 1.7;
  margin: 0 0 12px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ws-card-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.metric {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.metric-label {
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
}

.metric-value {
  color: var(--ws-text-primary, #fff);
  font-weight: 600;
}

/* ============= 空态 ============= */
.ws-empty {
  text-align: center;
  padding: 60px 24px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(167, 139, 250, 0.25);
  border-radius: 16px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.ws-empty h2 {
  font-size: 24px;
  color: var(--ws-text-primary, #fff);
  margin: 0 0 12px;
}

.empty-desc {
  font-size: 14px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.6));
  line-height: 1.8;
  margin-bottom: 28px;
}

.empty-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 32px;
}

.empty-tips {
  max-width: 480px;
  margin: 0 auto;
  text-align: left;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.empty-tips h4 {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.7));
  margin: 0 0 12px;
}

.empty-tips ul {
  margin: 0;
  padding-left: 20px;
}

.empty-tips li {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.6));
  line-height: 1.9;
}

.empty-tips strong {
  color: #a78bfa;
  font-weight: 600;
}
</style>
