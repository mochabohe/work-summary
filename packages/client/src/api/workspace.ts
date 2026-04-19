import api from './index'
import type { ApiResponse, WorkItem, ReportPeriod } from '@work-summary/shared'

/** 上传文档解析为纯文本 */
export async function parseDocument(file: File): Promise<{ filename: string; type: string; text: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/workspace/parse-document', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }) as unknown as ApiResponse<{ filename: string; type: string; text: string }>
  if (!res.success || !res.data) throw new Error(res.error || '文档解析失败')
  return res.data
}

/** 文本 → LLM 抽取 WorkItem[] */
export async function extractItems(
  text: string,
  period?: ReportPeriod,
): Promise<{ items: WorkItem[]; warning?: string }> {
  const res = await api.post('/workspace/extract-items', { text, period }, {
    timeout: 180000,
  }) as unknown as ApiResponse<{ items: WorkItem[]; rawResponse?: string }>
  if (!res.success) {
    return { items: [], warning: res.error }
  }
  return { items: res.data?.items ?? [] }
}

