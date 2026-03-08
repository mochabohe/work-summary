import type { GenerateRequest } from '@work-summary/shared'

/** 流式生成总结 (SSE) */
export function streamGenerate(
  request: GenerateRequest,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onProgress?: (message: string) => void,
): () => void {
  const controller = new AbortController()

  fetch('/api/v1/generate/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: controller.signal,
  })
    .then(async (response) => {
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
                onChunk(data.content)
              } else if (data.type === 'done') {
                onDone()
              } else if (data.type === 'error') {
                onError(data.content)
              } else if (data.type === 'progress' && onProgress) {
                onProgress(data.content)
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

/** 对话式修改总结 (SSE) */
export function streamRefine(
  params: {
    content: string
    instruction: string
    history?: { role: string; content: string }[]
  },
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const controller = new AbortController()

  fetch('/api/v1/generate/refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: controller.signal,
  })
    .then(async (response) => {
      const reader = response.body?.getReader()
      if (!reader) return

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
              if (data.type === 'chunk') onChunk(data.content)
              else if (data.type === 'done') onDone()
              else if (data.type === 'error') onError(data.content)
            } catch {}
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err.message)
    })

  return () => controller.abort()
}

/** 章节级修改 (SSE) */
export function streamRefineSection(
  params: {
    fullContent: string
    sectionIndex: number
    instruction: string
  },
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const controller = new AbortController()

  fetch('/api/v1/generate/refine-section', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: controller.signal,
  })
    .then(async (response) => {
      const reader = response.body?.getReader()
      if (!reader) return

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
              if (data.type === 'chunk') onChunk(data.content)
              else if (data.type === 'done') onDone()
              else if (data.type === 'error') onError(data.content)
            } catch {}
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err.message)
    })

  return () => controller.abort()
}

/** 生成结构化大纲 (SSE) */
export function streamGenerateOutline(
  request: GenerateRequest,
  onDone: (outline: { title: string; points: string[] }[]) => void,
  onError: (err: string) => void,
  onProgress?: (message: string) => void,
): () => void {
  const controller = new AbortController()

  fetch('/api/v1/generate/outline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: controller.signal,
  })
    .then(async (response) => {
      const reader = response.body?.getReader()
      if (!reader) return

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
              if (data.type === 'done' && data.outline) onDone(data.outline)
              else if (data.type === 'error') onError(data.content)
              else if (data.type === 'progress' && onProgress) onProgress(data.content)
            } catch {}
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err.message)
    })

  return () => controller.abort()
}

/** 基于大纲生成全文 (SSE) */
export function streamFromOutline(
  request: GenerateRequest & { outline: { title: string; points: string[] }[] },
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onProgress?: (message: string) => void,
): () => void {
  const controller = new AbortController()

  fetch('/api/v1/generate/from-outline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: controller.signal,
  })
    .then(async (response) => {
      const reader = response.body?.getReader()
      if (!reader) return

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
              if (data.type === 'chunk') onChunk(data.content)
              else if (data.type === 'done') onDone()
              else if (data.type === 'error') onError(data.content)
              else if (data.type === 'progress' && onProgress) onProgress(data.content)
            } catch {}
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err.message)
    })

  return () => controller.abort()
}
