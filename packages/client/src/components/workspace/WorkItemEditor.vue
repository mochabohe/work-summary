<template>
  <el-dialog
    :model-value="true"
    :title="title"
    width="600px"
    :close-on-click-modal="false"
    @close="$emit('close')"
  >
    <el-form label-width="80px" label-position="right">
      <el-form-item label="标题" required>
        <el-input
          v-model="form.title"
          placeholder="工作项标题（10-30 字）"
          maxlength="60"
          show-word-limit
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
        >
          <el-option
            v-for="c in commonCategories"
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
        />
      </el-form-item>

      <el-form-item label="数据成果">
        <div class="metrics-list">
          <div
            v-for="(m, idx) in form.metrics"
            :key="idx"
            class="metric-row"
          >
            <el-input v-model="m.label" placeholder="指标名（如 转化率）" size="default" />
            <el-input v-model="m.value" placeholder="值（如 12%）" size="default" />
            <el-button link type="danger" @click="removeMetric(idx)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button size="small" @click="addMetric">
            <el-icon><Plus /></el-icon>
            添加数据
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="详细说明">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          placeholder="详细描述这项工作：做了什么，解决了什么问题，产出是什么"
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
        >
        </el-select>
      </el-form-item>

      <el-form-item v-if="form.confidence != null" label="AI 置信度">
        <el-progress
          :percentage="Math.round((form.confidence ?? 0) * 100)"
          :color="confidenceColor"
          :stroke-width="8"
        />
        <span class="hint-text">置信度越低越建议人工复核</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" @click="onSave" :disabled="!canSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { WorkItem } from '@work-summary/shared'

const props = defineProps<{ item: WorkItem; title?: string }>()
const emit = defineEmits<{ close: []; save: [item: WorkItem] }>()

const title = computed(() => props.title ?? (props.item.title ? '编辑工作项' : '新增工作项'))

// 内部表单副本
const form = reactive<WorkItem>({ ...props.item })
form.metrics = form.metrics ? form.metrics.map(m => ({ ...m })) : []
form.tags = form.tags ? [...form.tags] : []

const dateRange = ref<[string, string]>([
  form.date.start,
  form.date.end ?? form.date.start,
])

watch(dateRange, (v) => {
  if (!v) return
  form.date = { start: v[0], end: v[1] }
})

const commonCategories = ['项目', '活动', '事务', '学习', '会议', '运营', '研发', '设计']

const confidenceColor = computed(() => {
  const c = form.confidence ?? 0
  if (c >= 0.75) return '#34d399'
  if (c >= 0.5) return '#fbbf24'
  return '#f87171'
})

const canSave = computed(() =>
  form.title.trim().length > 0 && form.date.start,
)

function addMetric() {
  if (!form.metrics) form.metrics = []
  form.metrics.push({ label: '', value: '' })
}

function removeMetric(idx: number) {
  form.metrics?.splice(idx, 1)
}

function onSave() {
  const cleaned: WorkItem = {
    ...form,
    metrics: form.metrics?.filter(m => m.label.trim() && m.value.trim()),
    tags: form.tags?.filter(t => t.trim()),
  }
  emit('save', cleaned)
}
</script>

<style scoped>
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
  align-items: center;
}

.hint-text {
  font-size: 12px;
  color: var(--ws-text-muted, rgba(255,255,255,0.5));
  margin-left: 12px;
}
</style>
