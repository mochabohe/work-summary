import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { WorkItem, ReportPeriod } from '@work-summary/shared'

const STORAGE_KEY = 'work-summary-workspace'

interface PersistedState {
  workItems?: WorkItem[]
  importDraft?: WorkItem[]
}

function loadFromStorage(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PersistedState
  } catch {
    return {}
  }
}

/**
 * 通用模式工作项管理：录入 / 导入 / 筛选 / 持久化
 *
 * - workItems：用户最终确认的工作项列表
 * - importDraft：从文档抽取的待校准卡片，确认后才写入 workItems
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const saved = loadFromStorage()

  const workItems = ref<WorkItem[]>(saved.workItems ?? [])
  const importDraft = ref<WorkItem[]>(saved.importDraft ?? [])

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        workItems: workItems.value,
        importDraft: importDraft.value,
      }))
    } catch {
      // ignore
    }
  }

  watch([workItems, importDraft], persist, { deep: true })

  // ---- WorkItem CRUD ----
  function addItem(item: WorkItem) {
    workItems.value.unshift(item)
  }

  function addItems(items: WorkItem[]) {
    workItems.value.unshift(...items)
  }

  function updateItem(id: string, patch: Partial<WorkItem>) {
    const idx = workItems.value.findIndex(i => i.id === id)
    if (idx === -1) return
    workItems.value[idx] = { ...workItems.value[idx], ...patch }
  }

  function removeItem(id: string) {
    workItems.value = workItems.value.filter(i => i.id !== id)
  }

  function clearItems() {
    workItems.value = []
  }

  // ---- Draft 草稿 ----
  function setDraft(items: WorkItem[]) {
    importDraft.value = items
  }

  function updateDraftItem(id: string, patch: Partial<WorkItem>) {
    const idx = importDraft.value.findIndex(i => i.id === id)
    if (idx === -1) return
    importDraft.value[idx] = { ...importDraft.value[idx], ...patch }
  }

  function removeDraftItem(id: string) {
    importDraft.value = importDraft.value.filter(i => i.id !== id)
  }

  function clearDraft() {
    importDraft.value = []
  }

  /** 把全部草稿确认写入 workItems */
  function commitDraft() {
    if (importDraft.value.length === 0) return 0
    const count = importDraft.value.length
    addItems(importDraft.value)
    clearDraft()
    return count
  }

  // ---- 筛选 ----
  function filterByPeriod(period: ReportPeriod): WorkItem[] {
    const start = new Date(period.start).getTime()
    const end = new Date(period.end).getTime()
    return workItems.value.filter(item => {
      const itemStart = new Date(item.date.start).getTime()
      const itemEnd = item.date.end ? new Date(item.date.end).getTime() : itemStart
      // 工作项与周期有交集即算入选
      return itemEnd >= start && itemStart <= end
    })
  }

  function filterByCategory(category: string): WorkItem[] {
    return workItems.value.filter(i => i.category === category)
  }

  // ---- 衍生 ----
  const totalCount = computed(() => workItems.value.length)
  const draftCount = computed(() => importDraft.value.length)
  const lowConfidenceDraftCount = computed(
    () => importDraft.value.filter(i => (i.confidence ?? 1) < 0.6).length,
  )

  /** 全部已用过的分类（去重） */
  const categories = computed(() => {
    const set = new Set<string>()
    workItems.value.forEach(i => i.category && set.add(i.category))
    return Array.from(set)
  })

  return {
    workItems,
    importDraft,
    totalCount,
    draftCount,
    lowConfidenceDraftCount,
    categories,
    addItem,
    addItems,
    updateItem,
    removeItem,
    clearItems,
    setDraft,
    updateDraftItem,
    removeDraftItem,
    clearDraft,
    commitDraft,
    filterByPeriod,
    filterByCategory,
  }
})
