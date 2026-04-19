/**
 * OpenAI Responses API 客户端
 *
 * 适用模型：gpt-5 / o1 / o3 等 reasoning 模型，以及任何代理把 chat completions
 * 路由到 /v1/responses 的场景。
 *
 * 与 chat completions 的差异：
 *   端点：       POST /v1/responses
 *   请求字段：   { model, input: ChatMessage[] | string }
 *   响应内容：   output[*].content[*].text  （而非 choices[0].message.content）
 *   流式 event： response.output_text.delta  （而非 chunk.choices[0].delta.content）
 *
 * 直接用 fetch 实现，避免依赖 OpenAI SDK 版本（SDK 5.x 才正式支持）。
 */
export interface ResponsesChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class OpenAIResponsesClient {
  constructor(
    private baseURL: string,
    private apiKey: string,
    private model: string,
  ) {}

  /** 非流式调用：返回完整文本 */
  async chat(messages: ResponsesChatMessage[]): Promise<{ text: string; modelUsed: string; raw: any }> {
    const url = this.joinPath(this.baseURL, '/responses')
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: messages,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ResponsesAPIError(res.status, text || `HTTP ${res.status}`)
    }

    const json = await res.json() as any
    const text = this.extractText(json)
    return { text, modelUsed: json.model || this.model, raw: json }
  }

  /** 流式调用：异步生成器，每次 yield 一段 delta 文本 */
  async *streamChat(messages: ResponsesChatMessage[], maxTokens?: number): AsyncGenerator<string> {
    const url = this.joinPath(this.baseURL, '/responses')
    const body: any = {
      model: this.model,
      input: messages,
      stream: true,
    }
    if (maxTokens) body.max_output_tokens = maxTokens

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw new ResponsesAPIError(res.status, text || `HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 按 \n\n 分隔事件
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const evt of events) {
        const dataLine = evt.split('\n').find(line => line.startsWith('data: '))
        if (!dataLine) continue
        const dataStr = dataLine.slice(6).trim()
        if (!dataStr || dataStr === '[DONE]') continue
        try {
          const data = JSON.parse(dataStr)
          // Responses API 流式 event 类型：
          //   response.output_text.delta  → 文本增量
          //   response.completed          → 流结束
          //   error                       → 错误
          if (data.type === 'response.output_text.delta' && typeof data.delta === 'string') {
            yield data.delta
          } else if (data.type === 'error') {
            throw new ResponsesAPIError(0, data.error?.message || 'Stream error')
          }
        } catch (err) {
          if (err instanceof ResponsesAPIError) throw err
          // 解析失败的单条 event 静默跳过，下条继续
        }
      }
    }
  }

  /** 从 Responses API 响应里提取所有输出文本（兼容多种代理实现） */
  private extractText(json: any): string {
    if (!json) return ''
    // 优先 1：output_text 顶层字段（部分代理直接给）
    if (typeof json.output_text === 'string' && json.output_text.trim()) return json.output_text

    // 优先 2：text 顶层字段（少数代理把内容直接放外层）
    if (typeof json.text === 'string' && json.text.trim()) return json.text

    // 标准结构：output 数组 → 遍历所有 type=message 的 item
    const output = json.output
    if (!Array.isArray(output)) return ''
    const parts: string[] = []
    for (const item of output) {
      // 类型 message：标准
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          // type=output_text 是标准；text 是兼容字段
          if (typeof c?.text === 'string') parts.push(c.text)
          else if (typeof c?.content === 'string') parts.push(c.content)
        }
      }
      // 类型 text：直接是文本节点
      else if (item?.type === 'text' && typeof item.text === 'string') {
        parts.push(item.text)
      }
      // 类型 reasoning：reasoning 模型的中间推理（一般不展示，但作为 fallback）
      else if (item?.type === 'reasoning' && Array.isArray(item.summary)) {
        for (const s of item.summary) {
          if (typeof s?.text === 'string') parts.push(`[reasoning] ${s.text}`)
        }
      }
      // 兜底：item 本身有 text 字段
      else if (typeof item?.text === 'string') {
        parts.push(item.text)
      }
      // 兜底：item.content 是字符串
      else if (typeof item?.content === 'string') {
        parts.push(item.content)
      }
    }
    return parts.join('').trim()
  }

  /** 智能 join：避免重复 / 缺失 */
  private joinPath(base: string, path: string): string {
    const b = base.replace(/\/$/, '')
    const p = path.startsWith('/') ? path : `/${path}`
    return `${b}${p}`
  }
}

export class ResponsesAPIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ResponsesAPIError'
  }
}
