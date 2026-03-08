import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type {
  SummaryAudience,
  SummaryDocType,
  SummaryLanguage,
  SummaryLength,
  SummaryStyle,
  SummaryTone,
} from '@work-summary/shared'

const STORAGE_KEY = 'work-summary-summary'

/** 版本快照 */
export interface VersionSnapshot {
  /** 该版本的完整 Markdown 内容 */
  content: string
  /** 版本标签（如 "初始生成"、用户的修改指令） */
  label: string
  /** 创建时间戳 */
  timestamp: number
}

/** 对话消息 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 从 localStorage 恢复数据 */
function loadFromStorage(): Record<string, any> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const useSummaryStore = defineStore('summary', () => {
  const saved = loadFromStorage()

  /** 生成中 */
  const generating = ref(false)
  /** 生成的总结内容 (Markdown) */
  const content = ref<string>(saved?.content ?? '')
  /** 总结维度（用户可自定义） */
  const dimensions = ref<string[]>(saved?.dimensions ?? [])
  /** 总结风格 */
  const style = ref<SummaryStyle>(saved?.style ?? 'semi-formal')
  /** 文档类型 */
  const docType = ref<SummaryDocType>(saved?.docType ?? 'yearly-summary')
  /** 目标读者 */
  const audience = ref<SummaryAudience>(saved?.audience ?? 'manager')
  /** 语气偏好 */
  const tone = ref<SummaryTone>(saved?.tone ?? 'professional')
  /** 输出长度 */
  const length = ref<SummaryLength>(saved?.length ?? 'medium')
  /** 输出语言 */
  const language = ref<SummaryLanguage>(saved?.language ?? 'zh-CN')
  /** 用户自定义要求 */
  const customPrompt = ref<string>(saved?.customPrompt ?? '')
  /** 业务背景 */
  const businessContext = ref<string>(saved?.businessContext ?? '')
  /** 补充文档 */
  const feishuDocs = ref<{ content: string }[]>(saved?.feishuDocs ?? [])
  /** 版本历史 */
  const versions = ref<VersionSnapshot[]>(saved?.versions ?? [])
  /** 对话式修改的历史记录 */
  const chatMessages = ref<ChatMessage[]>(saved?.chatMessages ?? [])

  /** 持久化到 localStorage */
  function persist() {
    try {
      const data = {
        content: content.value,
        dimensions: dimensions.value,
        style: style.value,
        docType: docType.value,
        audience: audience.value,
        tone: tone.value,
        length: length.value,
        language: language.value,
        customPrompt: customPrompt.value,
        businessContext: businessContext.value,
        feishuDocs: feishuDocs.value,
        versions: versions.value,
        chatMessages: chatMessages.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // localStorage 写入失败，静默忽略
    }
  }

  // 监听关键状态变化，自动持久化
  watch(
    [content, dimensions, style, docType, audience, tone, length, language, customPrompt, businessContext, feishuDocs, versions, chatMessages],
    persist,
    { deep: true },
  )

  function setContent(newContent: string) {
    content.value = newContent
  }

  function appendContent(chunk: string) {
    content.value += chunk
  }

  /** 保存当前内容为一个版本快照 */
  function saveVersion(label: string) {
    if (!content.value) return
    versions.value = [...versions.value, {
      content: content.value,
      label,
      timestamp: Date.now(),
    }]
  }

  /** 回退到指定版本 */
  function rollbackToVersion(index: number) {
    if (index < 0 || index >= versions.value.length) return
    content.value = versions.value[index].content
  }

  /** 清空版本历史 */
  function clearVersions() {
    versions.value = []
  }

  /** 替换指定章节内容（按 ## 标题拆分） */
  function replaceSection(sectionIndex: number, newSectionContent: string) {
    const sections = content.value.split(/(?=^## )/m)
    if (sectionIndex < 0 || sectionIndex >= sections.length) return
    sections[sectionIndex] = newSectionContent
    content.value = sections.join('')
  }

  function addFeishuDoc(doc: { content: string }) {
    feishuDocs.value.push(doc)
  }

  function removeFeishuDoc(index: number) {
    feishuDocs.value.splice(index, 1)
  }

  function reset() {
    generating.value = false
    content.value = ''
    customPrompt.value = ''
    businessContext.value = ''
    feishuDocs.value = []
    versions.value = []
    chatMessages.value = []
    docType.value = 'yearly-summary'
    audience.value = 'manager'
    tone.value = 'professional'
    length.value = 'medium'
    language.value = 'zh-CN'
  }

  return {
    generating,
    content,
    dimensions,
    style,
    docType,
    audience,
    tone,
    length,
    language,
    customPrompt,
    businessContext,
    feishuDocs,
    versions,
    chatMessages,
    setContent,
    appendContent,
    saveVersion,
    rollbackToVersion,
    clearVersions,
    replaceSection,
    addFeishuDoc,
    removeFeishuDoc,
    reset,
  }
})
