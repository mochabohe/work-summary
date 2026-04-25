import api from './index'
import type { ApiResponse, WorkItem, ReportPeriod } from '@work-summary/shared'

/** 上传文档解析为纯文本 */
export async function parseDocument(file: File): Promise<{ filename: string; type: string; text: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/workspace/parse-document', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  }) as unknown as ApiResponse<{ filename: string; type: string; text: string }>
  if (!res.success || !res.data) throw new Error(res.error || '文档解析失败')
  return res.data
}

/** /extract-items SSE 推送的事件类型 */
export type ExtractProgressEvent =
  | { type: 'plan'; totalChunks: number }
  | { type: 'chunk_done'; index: number; total: number; count: number; items: WorkItem[]; parseFailed: boolean }
  | { type: 'done'; items: WorkItem[]; parseFailed: boolean; rawResponse?: string; warning?: string }
  | { type: 'error'; message: string }

/**
 * 文本 → LLM 抽取 WorkItem[]，SSE 流式返回。
 * onProgress 在每条事件到达时回调（plan / chunk_done / done / error）。
 * 函数返回 Promise，在 done / error 事件后 resolve / reject。
 */
export async function extractItems(
  text: string,
  period?: ReportPeriod,
  onProgress?: (event: ExtractProgressEvent) => void,
): Promise<{ items: WorkItem[]; warning?: string }> {
  const res = await fetch('/api/v1/workspace/extract-items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ text, period }),
  })

  // 非 SSE 响应：通常是 4xx 校验失败，按普通 JSON 处理
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    try {
      const body = await res.json() as ApiResponse
      const message = body.error || `HTTP ${res.status}`
      if (!res.ok) throw new Error(message)
      return { items: [], warning: message }
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  if (!res.body) throw new Error('SSE 响应缺少 body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let finalItems: WorkItem[] = []
  let finalWarning: string | undefined
  let finalError: string | undefined

  const handleEvent = (raw: string) => {
    const dataLines = raw
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
    if (dataLines.length === 0) return
    const payload = dataLines.join('\n')
    let event: ExtractProgressEvent
    try {
      event = JSON.parse(payload) as ExtractProgressEvent
    } catch {
      return
    }

    onProgress?.(event)

    if (event.type === 'done') {
      finalItems = event.items
      if (event.warning) {
        finalWarning = event.warning
      } else if (event.parseFailed) {
        finalWarning = 'AI 抽取结果格式错误，建议改用手动录入'
      }
    } else if (event.type === 'error') {
      finalError = event.message
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    // SSE 事件分隔符是 \n\n（兼容 \r\n\r\n）
    while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buffer.slice(0, idx)
      const sepLen = buffer.slice(idx).match(/^\r?\n\r?\n/)?.[0].length ?? 2
      buffer = buffer.slice(idx + sepLen)
      if (raw.trim()) handleEvent(raw)
    }
  }
  if (buffer.trim()) handleEvent(buffer)

  if (finalError) throw new Error(finalError)
  return { items: finalItems, warning: finalWarning }
}
