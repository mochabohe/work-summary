import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 版本快照 */
export interface VersionSnapshot {
  /** 该版本的完整 Markdown 内容 */
  content: string
  /** 版本标签（如 "初始生成"、用户的修改指令） */
  label: string
  /** 创建时间戳 */
  timestamp: number
}

export const useSummaryStore = defineStore('summary', () => {
  /** 生成中 */
  const generating = ref(false)
  /** 生成的总结内容 (Markdown) */
  const content = ref('')
  /** 总结维度（用户可自定义） */
  const dimensions = ref<string[]>([])
  /** 总结风格 */
  const style = ref<'formal' | 'semi-formal'>('semi-formal')
  /** 用户自定义要求 */
  const customPrompt = ref('')
  /** 补充文档 */
  const feishuDocs = ref<{ content: string }[]>([])
  /** 版本历史 */
  const versions = ref<VersionSnapshot[]>([])

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
    feishuDocs.value = []
    versions.value = []
  }

  return {
    generating,
    content,
    dimensions,
    style,
    customPrompt,
    feishuDocs,
    versions,
    setContent,
    appendContent,
    saveVersion,
    rollbackToVersion,
    clearVersions,
    addFeishuDoc,
    removeFeishuDoc,
    reset,
  }
})
