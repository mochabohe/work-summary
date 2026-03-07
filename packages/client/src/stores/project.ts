import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProjectInfo, ProjectAnalysis, ScanResult } from '@work-summary/shared'

export const useProjectStore = defineStore('project', () => {
  /** 扫描状态 */
  const scanning = ref(false)
  /** 扫描任务ID */
  const taskId = ref<string>('')
  /** 扫描结果 */
  const scanResult = ref<ScanResult | null>(null)
  /** 选中的项目 */
  const selectedProjects = ref<Set<string>>(new Set())
  /** 项目分析结果 */
  const analyses = ref<Map<string, ProjectAnalysis>>(new Map())
  /** 正在分析中 */
  const analyzing = ref(false)

  /** 设置扫描结果并默认选中所有项目 */
  function setScanResult(result: ScanResult) {
    scanResult.value = result
    selectedProjects.value = new Set(result.projects.map((p) => p.path))
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
