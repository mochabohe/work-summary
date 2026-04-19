/** 导出为 Markdown 文件下载 */
export function exportMarkdown(content: string, filename = 'work-summary') {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(blob, `${filename}.md`)
}

/** 导出为 Word 文档 */
export async function exportDocx(content: string, filename = 'work-summary') {
  const response = await fetch('/api/v1/export/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, filename }),
  })

  if (!response.ok) {
    throw new Error('导出 Word 失败')
  }

  const blob = await response.blob()
  downloadBlob(blob, `${filename}.docx`)
}

/** 导出为 PDF */
export async function exportPdf(content: string, filename = 'work-summary') {
  const response = await fetch('/api/v1/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, filename }),
  })

  if (!response.ok) {
    throw new Error('导出 PDF 失败')
  }

  const blob = await response.blob()
  downloadBlob(blob, `${filename}.pdf`)
}

/** 幻灯片数据类型 */
export interface MetricItem {
  value: string
  label: string
  description?: string
}

export interface CardItem {
  title: string
  bullets: string[]
}

export interface PptSlide {
  type: 'title' | 'section' | 'content' | 'metrics' | 'two-column' | 'grid' | 'summary' | 'end'
  title: string
  subtitle?: string
  bullets?: string[]
  description?: string
  metrics?: MetricItem[]
  left?: { title: string; bullets: string[] }
  right?: { title: string; bullets: string[] }
  cards?: CardItem[]
  tags?: string[]
}

export interface PptData {
  title: string
  slides: PptSlide[]
}

export interface GenerateSlidesOptions {
  strict?: boolean
}

/** AI 分段生成幻灯片结构（SSE 流式），完成后返回 slidesData 供预览 */
export function generateSlides(
  content: string,
  title: string,
  onChunk: (chunk: string) => void,
  onDone: (slidesData: PptData) => void,
  onError: (err: string) => void,
  onProgress?: (message: string) => void,
  options?: GenerateSlidesOptions,
): () => void {
  const controller = new AbortController()

  fetch('/api/v1/generate/ppt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, title, strict: options?.strict }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        onError('请求失败')
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        onError('无法获取响应流')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              if (data.type === 'chunk') {
                onChunk(data.content || '')
              } else if (data.type === 'progress') {
                onProgress?.(data.content || '')
              } else if (data.type === 'done') {
                onDone(data.slidesData)
              } else if (data.type === 'error') {
                onError(data.content)
              }
            } catch {}
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError(err.message)
      }
    })

  return () => controller.abort()
}

/** 自定义配色 */
export interface CustomColors {
  themeColor: string
  highlightColor: string
}

/** 确认导出：发送幻灯片 JSON 到后端生成 PPTX 并下载 */
export async function downloadPptx(slidesData: PptData, filename = 'work-summary', colors?: CustomColors) {
  const response = await fetch('/api/v1/export/pptx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slidesData, filename, colors }),
  })

  if (!response.ok) {
    throw new Error('导出演示文稿失败')
  }

  const blob = await response.blob()
  downloadBlob(blob, `${filename}.pptx`)
}

/** 确认导出：发送幻灯片 JSON 到后端生成 PDF 并下载（与 PPT 视觉一致） */
export async function downloadPdfSlides(slidesData: PptData, filename = 'work-summary', colors?: CustomColors) {
  const response = await fetch('/api/v1/export/pdf-slides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slidesData, filename, colors }),
  })

  if (!response.ok) {
    throw new Error('导出 PDF 失败')
  }

  const blob = await response.blob()
  downloadBlob(blob, `${filename}.pdf`)
}

/** 触发浏览器下载 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ========== 百度 AI PPT 精美导出 ==========

export interface BaiduPptProgress {
  status: string
  is_end?: boolean
  data?: { pptx_url: string }
  error?: string
  outline?: string
}

export interface BaiduPptTheme {
  style_id: number
  tpl_id: number
  style_name_list?: string[]
}

/** 检查百度 AI PPT 是否可用 */
export async function checkBaiduPptStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/export/baidu-ppt/status')
    const json = await res.json() as any
    return json.data?.configured ?? false
  } catch {
    return false
  }
}

/** 获取百度 AI PPT 可用模板 */
export async function fetchBaiduPptThemes(): Promise<BaiduPptTheme[]> {
  const res = await fetch('/api/v1/export/baidu-ppt/themes')
  const json = await res.json() as any
  if (!json.success) {
    throw new Error(json.error || '加载 PPT 风格失败')
  }
  return json.data || []
}

/**
 * 百度 AI PPT 精美导出（SSE 流式）
 *
 * @param content 工作总结内容（Markdown 文本）
 * @param onProgress 进度回调
 * @param onDone 完成回调，返回 PPT 下载 URL
 * @param onError 错误回调
 * @param options 可选配置（模板风格/模板ID）
 * @returns 取消函数
 */
export function exportBaiduPpt(
  content: string,
  onProgress: (status: string) => void,
  onDone: (pptUrl: string) => void,
  onError: (err: string) => void,
  options?: { category?: string; tplId?: number; filename?: string },
  onOutlineChunk?: (chunk: string) => void,
): () => void {
  const controller = new AbortController()

  fetch('/api/v1/export/baidu-ppt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      category: options?.category,
      tplId: options?.tplId,
      filename: options?.filename,
    }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        onError(`请求失败: HTTP ${response.status}`)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        onError('无法获取响应流')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: BaiduPptProgress = JSON.parse(line.substring(6))
              if (data.error) {
                onError(data.error)
                return
              }
              if (data.outline) {
                onOutlineChunk?.(data.outline)
              }
              if (data.status) {
                onProgress(data.status)
              }
              if (data.is_end && data.data?.pptx_url) {
                onDone(data.data.pptx_url)
                return
              }
            } catch {}
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError(err.message)
      }
    })

  return () => controller.abort()
}

/** 通过 URL 下载 PPT 文件 */
export function downloadFromUrl(url: string, filename = 'work-summary.pptx') {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
