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
  async chat(messages: ResponsesChatMessage[], opts?: { maxTokens?: number; reasoningEffort?: 'low' | 'medium' | 'high' }): Promise<{ text: string; modelUsed: string; raw: any }> {
    const url = this.joinPath(this.baseURL, '/responses')
    const body: any = {
      model: this.model,
      input: messages,
      // reasoning 模型 token 预算：默认给足 2048，避免推理消耗完后 output 为空
      max_output_tokens: opts?.maxTokens ?? 2048,
    }
    // 如果是 reasoning 模型（gpt-5 / o1 / o3 系列），降低推理强度，留更多 token 给输出
    if (this.looksLikeReasoningModel()) {
      body.reasoning = { effort: opts?.reasoningEffort ?? 'low' }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ResponsesAPIError(res.status, text || `HTTP ${res.status}`)
    }

    const json = await res.json() as any
    const text = this.extractText(json)
    return { text, modelUsed: json.model || this.model, raw: json }
  }

  /** 检测是否是 reasoning 模型（需要特殊 token 预算） */
  private looksLikeReasoningModel(): boolean {
    const m = this.model.toLowerCase()
    return m.startsWith('o1') || m.startsWith('o3')
      || m.startsWith('gpt-5') || m.startsWith('gpt5')
      || m.includes('reasoner') || m.includes('reasoning')
  }

  /** 流式调用：异步生成器，每次 yield 一段 delta 文本 */
  async *streamChat(messages: ResponsesChatMessage[], maxTokens?: number): AsyncGenerator<string> {
    const url = this.joinPath(this.baseURL, '/responses')
    const body: any = {
      model: this.model,
      input: messages,
      stream: true,
      max_output_tokens: maxTokens ?? 4096,
    }
    if (this.looksLikeReasoningModel()) {
      body.reasoning = { effort: 'low' }
    }

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

    // 优先 2：text 顶层字段（少数代理把内容直接放外层，但注意 text 也可能是 {format:...} 对象）
    if (typeof json.text === 'string' && json.text.trim()) return json.text

    // 标准结构：output 数组 → 遍历所有 type=message 的 item
    const output = json.output
    const parts: string[] = []
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item?.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (typeof c?.text === 'string') parts.push(c.text)
            else if (typeof c?.content === 'string') parts.push(c.content)
          }
        }
        else if (item?.type === 'text' && typeof item.text === 'string') {
          parts.push(item.text)
        }
        else if (item?.type === 'reasoning' && Array.isArray(item.summary)) {
          for (const s of item.summary) {
            if (typeof s?.text === 'string') parts.push(`[推理] ${s.text}`)
          }
        }
        else if (typeof item?.text === 'string') parts.push(item.text)
        else if (typeof item?.content === 'string') parts.push(item.content)
      }
    }

    // 兜底 1：output 为空但有 reasoning.summary（reasoning 模型 token 耗尽场景）
    if (parts.length === 0 && json.reasoning) {
      const r = json.reasoning
      if (Array.isArray(r.summary)) {
        for (const s of r.summary) {
          if (typeof s?.text === 'string') parts.push(`[仅返回推理] ${s.text}`)
        }
      } else if (typeof r.summary === 'string' && r.summary.trim()) {
        parts.push(`[仅返回推理] ${r.summary}`)
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
