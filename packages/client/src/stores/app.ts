import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import type { AppMode } from '@work-summary/shared'

const STORAGE_KEY = 'work-summary-app'

interface PersistedState {
  mode?: AppMode
  onboarded?: boolean
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
 * 应用级全局状态：工作模式（研发/通用）与首次引导标记
 *
 * 存储键独立于 settings/summary，避免互相干扰；跨模式切换时各自 store 保持独立。
 */
export const useAppStore = defineStore('app', () => {
  const saved = loadFromStorage()

  /** 当前模式；未选择时为 null，触发引导页 */
  const mode = ref<AppMode | null>(saved.mode ?? null)
  /** 是否已完成身份选择（即便后续切换也保持 true） */
  const onboarded = ref<boolean>(saved.onboarded ?? false)

  const isDeveloper = computed(() => mode.value === 'developer')
  const isGeneral = computed(() => mode.value === 'general')

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode: mode.value, onboarded: onboarded.value }),
      )
    } catch {
      // localStorage 写入失败静默忽略（隐私模式等场景）
    }
  }

  watch([mode, onboarded], persist)

  function setMode(m: AppMode) {
    mode.value = m
    onboarded.value = true
  }

  /** 重置身份（调试用） */
  function resetMode() {
    mode.value = null
    onboarded.value = false
  }

  return {
    mode,
    onboarded,
    isDeveloper,
    isGeneral,
    setMode,
    resetMode,
  }
})
