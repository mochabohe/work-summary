import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // 从 localStorage 加载配置
  const savedSettings = localStorage.getItem('work-summary-settings')
  const defaults = savedSettings ? JSON.parse(savedSettings) : {}

  const gitAuthor = ref<string>(defaults.gitAuthor || '')
  // 总结日期范围（YYYY-MM 格式）
  const now = new Date()
  const startDate = ref<string>(defaults.startDate || `${now.getFullYear()}-01`)
  const endDate = ref<string>(defaults.endDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  // 用户角色（支持多选，含自定义）
  const roles = ref<string[]>(defaults.roles || [])

  // 自动保存到 localStorage
  function save() {
    localStorage.setItem('work-summary-settings', JSON.stringify({
      gitAuthor: gitAuthor.value,
      startDate: startDate.value,
      endDate: endDate.value,
      roles: roles.value,
    }))
  }

  watch([gitAuthor, startDate, endDate, roles], save, { deep: true })

  /** 获取 Git 查询用的开始日期（YYYY-MM-DD） */
  function getGitSince(): string {
    return `${startDate.value}-01`
  }

  /** 获取 Git 查询用的结束日期（下个月第一天） */
  function getGitUntil(): string {
    const [y, m] = endDate.value.split('-').map(Number)
    if (m === 12) return `${y + 1}-01-01`
    return `${y}-${String(m + 1).padStart(2, '0')}-01`
  }

  const isConfigured = () => {
    return gitAuthor.value.length > 0
  }

  return {
    gitAuthor,
    startDate,
    endDate,
    roles,
    getGitSince,
    getGitUntil,
    isConfigured,
    save,
  }
})
