import OpenAI from 'openai'
import { DEEPSEEK_CONFIG } from '@work-summary/shared'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class LLMService {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: DEEPSEEK_CONFIG.baseURL,
    })
  }

  /** 流式对话，返回异步迭代器 */
  async *streamChat(messages: ChatMessage[], model?: string): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: model || DEEPSEEK_CONFIG.defaultModel,
      messages,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }
    }
  }

  /** 非流式对话 */
  async chat(messages: ChatMessage[], model?: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: model || DEEPSEEK_CONFIG.defaultModel,
      messages,
    })

    return response.choices[0]?.message?.content || ''
  }

  /** 验证 API Key 是否有效 */
  async validate(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: DEEPSEEK_CONFIG.defaultModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      })
      return !!response.choices[0]?.message?.content
    } catch {
      return false
    }
  }
}
