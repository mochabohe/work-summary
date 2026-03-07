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

/** AI 分段生成幻灯片结构（SSE 流式），完成后返回 slidesData 供预览 */
export function generateSlides(
  content: string,
  title: string,
  onChunk: (chunk: string) => void,
  onDone: (slidesData: PptData) => void,
  onError: (err: string) => void,
  onProgress?: (message: string) => void,
): () => void {
  const controller = new AbortController()

  fetch('/api/v1/generate/ppt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, title }),
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

/** 确认导出：发送幻灯片 JSON 到后端生成 PPTX 并下载 */
export async function downloadPptx(slidesData: PptData, filename = 'work-summary') {
  const response = await fetch('/api/v1/export/pptx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slidesData, filename }),
  })

  if (!response.ok) {
    throw new Error('导出演示文稿失败')
  }

  const blob = await response.blob()
  downloadBlob(blob, `${filename}.pptx`)
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
