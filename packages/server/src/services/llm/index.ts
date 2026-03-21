import OpenAI from 'openai'
import { DEEPSEEK_CONFIG } from '@work-summary/shared'
import type { ModelConfig } from '@work-summary/shared'
import { AnthropicClient } from './anthropic-client.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function isRetriableError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    const status = err.status
    return status === 429 || (status >= 500 && status < 600)
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('econnreset') || msg.includes('etimedout')
      || msg.includes('econnrefused') || msg.includes('fetch failed')
      || msg.includes('network') || msg.includes('socket hang up')
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const MAX_RETRIES = 2
const BASE_DELAY_MS = 2000

// 全局当前模型配置（可通过 setConfig 修改）
let currentConfig: ModelConfig = {
  provider: 'openai-compatible',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || DEEPSEEK_CONFIG.baseURL,
  model: DEEPSEEK_CONFIG.defaultModel,
}

export function setLLMConfig(config: ModelConfig) {
  currentConfig = config
}

export function getLLMConfig(): Omit<ModelConfig, 'apiKey'> & { apiKey: string } {
  return { ...currentConfig, apiKey: currentConfig.apiKey ? '***' : '' }
}

export class LLMService {
  private getOpenAIClient(): OpenAI {
    return new OpenAI({
      apiKey: currentConfig.apiKey,
      baseURL: currentConfig.baseURL,
    })
  }

  private getAnthropicClient(): AnthropicClient {
    return new AnthropicClient(currentConfig.apiKey, currentConfig.model)
  }

  async *streamChat(messages: ChatMessage[], _model?: string, maxTokens?: number): AsyncGenerator<string> {
    if (currentConfig.provider === 'anthropic') {
      yield* this.getAnthropicClient().streamChat(messages, maxTokens)
      return
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const stream = await this.getOpenAIClient().chat.completions.create({
          model: currentConfig.model,
          messages,
          stream: true,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
        })
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) yield content
        }
        return
      } catch (err) {
        lastError = err
        if (attempt < MAX_RETRIES && isRetriableError(err)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt)
          console.warn(`[LLM] streamChat 第 ${attempt + 1} 次失败，${delay / 1000}s 后重试:`, (err as Error).message)
          await sleep(delay)
          continue
        }
        throw err
      }
    }
    throw lastError
  }

  async chat(messages: ChatMessage[], _model?: string): Promise<string> {
    if (currentConfig.provider === 'anthropic') {
      return this.getAnthropicClient().chat(messages)
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.getOpenAIClient().chat.completions.create({
          model: currentConfig.model,
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

  async validate(): Promise<boolean> {
    try {
      if (currentConfig.provider === 'anthropic') {
        return this.getAnthropicClient().validate()
      }
      const response = await this.getOpenAIClient().chat.completions.create({
        model: currentConfig.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      })
      return !!response.choices[0]?.message?.content
    } catch {
      return false
    }
  }
}
