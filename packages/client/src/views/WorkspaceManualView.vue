<template>
  <div class="manual-view">
    <div class="page-header">
      <el-button link @click="$router.push('/workspace')">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h2>手动录入工作项</h2>
      <div class="page-header-spacer"></div>
      <el-button v-if="lastItem" @click="cloneLast">
        <el-icon><CopyDocument /></el-icon>
        复制上一条
      </el-button>
    </div>

    <div class="form-wrap">
      <el-form label-width="100px" label-position="right" class="manual-form">
        <el-form-item label="标题" required>
          <el-input
            v-model="form.title"
            placeholder="用一句话概括这项工作（例：完成 Q2 渠道运营复盘）"
            maxlength="60"
            show-word-limit
            size="large"
          />
        </el-form-item>

        <el-form-item label="分类">
          <el-select
            v-model="form.category"
            placeholder="选择或输入分类"
            clearable
            filterable
            allow-create
            default-first-option
            style="width: 100%;"
            size="large"
          >
            <el-option
              v-for="c in allCategories"
              :key="c"
              :label="c"
              :value="c"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="时间" required>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            range-separator="~"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 100%;"
            size="large"
          />
          <div class="quick-dates">
            <el-button size="small" link @click="setQuickDate('today')">今天</el-button>
            <el-button size="small" link @click="setQuickDate('thisWeek')">本周</el-button>
            <el-button size="small" link @click="setQuickDate('thisMonth')">本月</el-button>
            <el-button size="small" link @click="setQuickDate('lastMonth')">上月</el-button>
          </div>
        </el-form-item>

        <el-form-item label="数据成果">
          <div class="metrics-list">
            <div v-for="(m, idx) in form.metrics" :key="idx" class="metric-row">
              <el-input v-model="m.label" placeholder="指标（如：转化率 / 完成数）" />
              <el-input v-model="m.value" placeholder="值（如：12% / 5 个）" />
              <el-button link type="danger" @click="removeMetric(idx)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button size="small" @click="addMetric">
              <el-icon><Plus /></el-icon>
              添加数据
            </el-button>
          </div>
          <div class="hint">量化的数据更容易打动领导</div>
        </el-form-item>

        <el-form-item label="详细说明" required>
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="5"
            placeholder="详细描述这项工作：做了什么 / 解决了什么问题 / 协作对象 / 最终产出"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="标签">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入后回车创建标签"
            style="width: 100%;"
          />
        </el-form-item>
      </el-form>

      <div class="form-footer">
        <el-button @click="$router.push('/workspace')">取消</el-button>
        <el-button @click="saveAndNew" :disabled="!canSave">保存并继续录入</el-button>
        <el-button type="primary" @click="saveAndBack" :disabled="!canSave">
          保存并返回
        </el-button>
      </div>
    </div>

    <!-- 示例提示（首次进入时） -->
    <div v-if="store.totalCount === 0" class="examples">
      <h4>📌 示例参考</h4>
      <div class="example-item" v-for="ex in examples" :key="ex.title" @click="loadExample(ex)">
        <strong>{{ ex.title }}</strong>
        <p>{{ ex.description }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { v4 as uuidv4 } from 'uuid'
import {
  ArrowLeft, CopyDocument, Plus, Delete,
} from '@element-plus/icons-vue'
import type { WorkItem } from '@work-summary/shared'
import { useWorkspaceStore } from '@/stores/workspace'

const router = useRouter()
const store = useWorkspaceStore()

function createBlank(): WorkItem {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: uuidv4(),
    source: 'manual',
    title: '',
    category: '',
    date: { start: today, end: today },
    metrics: [],
    description: '',
    tags: [],
  }
}

const form = reactive<WorkItem>(createBlank())
const dateRange = ref<[string, string]>([form.date.start, form.date.end ?? form.date.start])

watch(dateRange, (v) => { if (v) form.date = { start: v[0], end: v[1] } })

const lastItem = computed(() => store.workItems[0])
const defaultCategories = ['项目', '活动', '事务', '学习', '会议', '运营', '研发', '设计']
const allCategories = computed(() => {
  const set = new Set<string>([...defaultCategories, ...store.categories])
  return Array.from(set)
})

const canSave = computed(() =>
  form.title.trim().length > 0
  && form.description.trim().length > 0
  && form.date.start,
)

function addMetric() {
  form.metrics!.push({ label: '', value: '' })
}

function removeMetric(idx: number) {
  form.metrics!.splice(idx, 1)
}

function cloneLast() {
  if (!lastItem.value) return
  Object.assign(form, {
    ...lastItem.value,
    id: uuidv4(),
    title: '',
    description: '',
    metrics: (lastItem.value.metrics ?? []).map(m => ({ label: m.label, value: '' })),
  })
  dateRange.value = [form.date.start, form.date.end ?? form.date.start]
  ElMessage.success('已复制上一条的分类/日期/标签，请修改内容')
}

function setQuickDate(kind: 'today' | 'thisWeek' | 'thisMonth' | 'lastMonth') {
  const now = new Date()
  let start = ''
  let end = ''
  if (kind === 'today') {
    start = end = now.toISOString().slice(0, 10)
  } else if (kind === 'thisWeek') {
    const day = now.getDay() || 7
    const monday = new Date(now); monday.setDate(now.getDate() - (day - 1))
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    start = monday.toISOString().slice(0, 10)
    end = sunday.toISOString().slice(0, 10)
  } else if (kind === 'thisMonth') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    start = first.toISOString().slice(0, 10)
    end = last.toISOString().slice(0, 10)
  } else if (kind === 'lastMonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    start = first.toISOString().slice(0, 10)
    end = last.toISOString().slice(0, 10)
  }
  dateRange.value = [start, end]
}

function buildItem(): WorkItem {
  return {
    ...form,
    metrics: form.metrics?.filter(m => m.label.trim() && m.value.trim()),
    tags: form.tags?.filter(t => t.trim()),
  }
}

function saveAndBack() {
  store.addItem(buildItem())
  ElMessage.success('已保存')
  router.push('/workspace')
}

function saveAndNew() {
  store.addItem(buildItem())
  const prevCat = form.category
  const prevTags = form.tags
  const prevDate = { ...form.date }
  // 重置表单但保留分类/标签/日期
  Object.assign(form, createBlank(), {
    category: prevCat,
    tags: prevTags,
    date: prevDate,
  })
  form.metrics = []
  dateRange.value = [form.date.start, form.date.end ?? form.date.start]
  ElMessage.success('已保存，请继续录入')
}

const examples = [
  {
    title: '完成 Q2 渠道运营复盘报告',
    category: '项目',
    description: '系统梳理 Q2 渠道运营数据，完成对 5 个核心渠道的 ROI 分析，输出 30 页复盘报告，为 Q3 渠道策略提供数据支撑',
    metrics: [{ label: '渠道数', value: '5' }, { label: '转化率提升', value: '12%' }],
    tags: ['渠道', '复盘'],
  },
  {
    title: '组织全员团建 & 季度颁奖',
    category: '活动',
    description: '策划执行 30 人规模团建活动，协调场地/餐饮/物料/议程；搭配季度颁奖典礼，增强团队凝聚力',
    metrics: [{ label: '参与人数', value: '30' }],
    tags: ['团建', '活动策划'],
  },
  {
    title: '完成用户增长课程学习',
    category: '学习',
    description: '系统学习增长黑客课程 20 小时，输出 3 份读书笔记，并在团队分享会上做 30 分钟讲解',
    metrics: [{ label: '学时', value: '20h' }, { label: '笔记', value: '3 份' }],
    tags: ['学习', '分享'],
  },
]

function loadExample(ex: typeof examples[0]) {
  form.title = ex.title
  form.category = ex.category
  form.description = ex.description
  form.metrics = ex.metrics.map(m => ({ ...m }))
  form.tags = [...ex.tags]
  ElMessage.info('已填入示例，请按需修改')
}
</script>

<style scoped>
.manual-view {
  max-width: 800px;
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

.page-header-spacer { flex: 1; }

.form-wrap {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 28px 32px;
  backdrop-filter: blur(16px);
}

.quick-dates {
  margin-top: 6px;
  display: flex;
  gap: 8px;
}

.metrics-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.metric-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
}

.hint {
  font-size: 12px;
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
  margin-top: 6px;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* ============= 示例 ============= */
.examples {
  margin-top: 28px;
  padding: 20px 24px;
  background: rgba(167, 139, 250, 0.05);
  border: 1px dashed rgba(167, 139, 250, 0.25);
  border-radius: 10px;
}

.examples h4 {
  font-size: 13px;
  color: var(--ws-text-secondary, rgba(255,255,255,0.7));
  margin: 0 0 14px;
}

.example-item {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.example-item:hover {
  background: rgba(255, 255, 255, 0.06);
  transform: translateX(4px);
}

.example-item strong {
  font-size: 13px;
  color: var(--ws-text-primary, #fff);
  font-weight: 600;
}

.example-item p {
  font-size: 12px;
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
  margin: 4px 0 0;
  line-height: 1.6;
}
</style>
