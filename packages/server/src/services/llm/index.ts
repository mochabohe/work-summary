import OpenAI from 'openai'
import { DEEPSEEK_CONFIG } from '@work-summary/shared'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 判断错误是否可重试（网络错误、429、5xx） */
function isRetriableError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    const status = err.status
    return status === 429 || (status >= 500 && status < 600)
  }
  // 网络错误（ECONNRESET、ETIMEDOUT、fetch 失败等）
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('econnreset') || msg.includes('etimedout')
      || msg.includes('econnrefused') || msg.includes('fetch failed')
      || msg.includes('network') || msg.includes('socket hang up')
  }
  return false
}

/** 延迟指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const MAX_RETRIES = 2
const BASE_DELAY_MS = 2000

export class LLMService {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || DEEPSEEK_CONFIG.baseURL,
    })
  }

  /** 流式对话，返回异步迭代器（含自动重试） */
  async *streamChat(messages: ChatMessage[], model?: string, maxTokens?: number): AsyncGenerator<string> {
    let lastError: unknown

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const stream = await this.client.chat.completions.create({
          model: model || DEEPSEEK_CONFIG.defaultModel,
          messages,
          stream: true,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
        })

        // 连接建立成功后，流式输出过程中不再重试（避免重复输出）
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            yield content
          }
        }
        return // 正常完成，退出
      } catch (err) {
        lastError = err
        if (attempt < MAX_RETRIES && isRetriableError(err)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt) // 2s, 4s
          console.warn(`[LLM] streamChat 第 ${attempt + 1} 次失败，${delay / 1000}s 后重试:`, (err as Error).message)
          await sleep(delay)
          continue
        }
        throw err // 不可重试或已用尽重试次数
      }
    }

    throw lastError
  }

  /** 非流式对话（含自动重试） */
  async chat(messages: ChatMessage[], model?: string): Promise<string> {
    let lastError: unknown

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: model || DEEPSEEK_CONFIG.defaultModel,
          messages,
        })
        return response.choices[0]?.message?.content || ''
      } catch (err) {
        lastError = err
        if (attempt < MAX_RETRIES && isRetriableError(err)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt)
          console.warn(`[LLM] chat 第 ${attempt + 1} 次失败，${delay / 1000}s 后重试:`, (err as Error).message)
          await sleep(delay)
          continue
        }
        throw err
      }
    }

    throw lastError
  }

  /** 验证代理是否可用 */
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
