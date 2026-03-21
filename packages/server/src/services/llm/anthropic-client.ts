import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage } from './index.js'

export class AnthropicClient {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey })
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
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return res.content.length > 0
    } catch {
      return false
    }
  }
}
