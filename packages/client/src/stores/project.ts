import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ProjectInfo, ProjectAnalysis, ScanResult } from '@work-summary/shared'

const STORAGE_KEY = 'work-summary-project'

/** 从 localStorage 恢复数据 */
function loadFromStorage(): {
  scanResult: ScanResult | null
  selectedProjects: string[]
  analyses: [string, ProjectAnalysis][]
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const useProjectStore = defineStore('project', () => {
  const saved = loadFromStorage()

  /** 扫描状态 */
  const scanning = ref(false)
  /** 扫描任务ID */
  const taskId = ref<string>('')
  /** 扫描结果 */
  const scanResult = ref<ScanResult | null>(saved?.scanResult ?? null)
  /** 选中的项目 */
  const selectedProjects = ref<Set<string>>(new Set(saved?.selectedProjects ?? []))
  /** 项目分析结果 */
  const analyses = ref<Map<string, ProjectAnalysis>>(new Map(saved?.analyses ?? []))
  /** 正在分析中 */
  const analyzing = ref(false)

  /** 持久化到 localStorage */
  function persist() {
    try {
      const data = {
        scanResult: scanResult.value,
        selectedProjects: Array.from(selectedProjects.value),
        analyses: Array.from(analyses.value.entries()),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // localStorage 写入失败（容量不足等），静默忽略
    }
  }

  // 监听关键状态变化，自动持久化
  watch([scanResult, selectedProjects, analyses], persist, { deep: true })

  /** 设置扫描结果，默认只选中有个人贡献的项目 */
  function setScanResult(result: ScanResult) {
    scanResult.value = result
    // 清除旧的分析结果
    analyses.value = new Map()
    // 只自动选中有用户 Git 贡献的项目（userCommitCount > 0 或未检测的非 Git 项目）
    const selected = result.projects
      .filter((p) => !p.hasGit || p.userCommitCount === undefined || p.userCommitCount > 0)
      .map((p) => p.path)
    selectedProjects.value = new Set(selected)
  }

  /** 切换项目选中状态 */
  function toggleProject(projectPath: string) {
    const newSet = new Set(selectedProjects.value)
    if (newSet.has(projectPath)) {
      newSet.delete(projectPath)
    } else {
      newSet.add(projectPath)
    }
    selectedProjects.value = newSet
  }

  /** 设置项目分析结果 */
  function setAnalysis(projectPath: string, analysis: ProjectAnalysis) {
    const newMap = new Map(analyses.value)
    newMap.set(projectPath, analysis)
    analyses.value = newMap
  }

  /** 清除未选中项目的分析结果 */
  function clearUnselectedAnalyses() {
    const newMap = new Map<string, ProjectAnalysis>()
    for (const [path, analysis] of analyses.value) {
      if (selectedProjects.value.has(path)) {
        newMap.set(path, analysis)
      }
    }
    analyses.value = newMap
  }

  /** 获取选中的项目分析列表 */
  function getSelectedAnalyses(): ProjectAnalysis[] {
    return Array.from(selectedProjects.value)
      .map((path) => analyses.value.get(path))
      .filter((a): a is ProjectAnalysis => !!a)
  }

  /** 重置 */
  function reset() {
    scanning.value = false
    taskId.value = ''
    scanResult.value = null
    selectedProjects.value = new Set()
    analyses.value = new Map()
    analyzing.value = false
  }

  return {
    scanning,
    taskId,
    scanResult,
    selectedProjects,
    analyses,
    analyzing,
    setScanResult,
    toggleProject,
    setAnalysis,
    clearUnselectedAnalyses,
    getSelectedAnalyses,
    reset,
  }
})
