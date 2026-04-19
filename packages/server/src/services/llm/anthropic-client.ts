import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage } from './index.js'

export class AnthropicClient {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.client = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    })
    this.model = model
  }

  async *streamChat(messages: ChatMessage[], maxTokens?: number): AsyncGenerator<string> {
    const systemMsg = messages.find(m => m.role === 'system')?.content
    const userMsgs = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: maxTokens || 4096,
      ...(systemMsg ? { system: systemMsg } : {}),
      messages: userMsgs,
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text
      }
    }
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find(m => m.role === 'system')?.content
    const userMsgs = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      ...(systemMsg ? { system: systemMsg } : {}),
      messages: userMsgs,
    })

    return response.content[0]?.type === 'text' ? response.content[0].text : ''
  }

  async validate(): Promise<boolean> {
    return (await this.validateVerbose()).valid
  }

  async validateVerbose(): Promise<{ valid: boolean; error?: string; reply?: string; modelUsed?: string }> {
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 80,
        messages: [{ role: 'user', content: '请简短介绍你自己（不超过 30 字），并告诉我你是什么模型。' }],
      })
      const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
      if (!text.trim()) return { valid: false, error: 'Anthropic 响应内容为空' }
      return { valid: true, reply: text.trim(), modelUsed: res.model }
    } catch (err: unknown) {
      if (err instanceof Anthropic.APIError) {
        const status = err.status
        const hint = status === 401 ? 'API Key 无效或过期'
          : status === 404 ? `路径错误（baseURL 是否含 /v1？）或模型 "${this.model}" 不存在`
          : status === 403 ? '权限不足'
          : status === 429 ? '请求过频'
          : `HTTP ${status}`
        return { valid: false, error: `${hint}：${err.message.slice(0, 200)}` }
      }
      const msg = (err as Error)?.message || String(err)
      if (/ENOTFOUND|ECONNREFUSED|fetch failed|getaddrinfo/i.test(msg)) {
        return { valid: false, error: `网络错误（检查 baseURL）：${msg}` }
      }
      return { valid: false, error: msg }
    }
  }
}
