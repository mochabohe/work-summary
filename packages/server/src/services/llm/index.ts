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
    const result = await this.validateVerbose()
    return result.valid
  }

  /**
   * 详细验证：不吞错误，返回明确的失败原因 + 模型真实回复样例。
   *
   * 判定策略：
   * - 只要请求能收到 HTTP 2xx 响应（即 baseURL/apiKey 均合法）即算通过
   * - 不强制 content 非空——某些代理在 max_tokens 过小时可能返回空字符串
   * - 成功时返回模型实际回复内容供用户直观验证
   */
  async validateVerbose(): Promise<{ valid: boolean; error?: string; reply?: string; modelUsed?: string }> {
    try {
      if (currentConfig.provider === 'anthropic') {
        const ok = await this.getAnthropicClient().validate()
        return { valid: ok, error: ok ? undefined : 'Anthropic 验证失败' }
      }
      const response = await this.getOpenAIClient().chat.completions.create({
        model: currentConfig.model,
        messages: [
          { role: 'system', content: '你是一个测试助手。用一句话（不超过 30 字）回复用户，证明你在工作。' },
          { role: 'user', content: '请简短介绍你自己，并告诉我你是什么模型。' },
        ],
        max_tokens: 80,
      })
      // 请求已返回：检查 choices 结构
      if (response && Array.isArray(response.choices) && response.choices.length > 0) {
        const msg = response.choices[0]?.message
        const content = msg?.content
        const modelUsed = response.model || currentConfig.model

        if (content && typeof content === 'string' && content.trim().length > 0) {
          return { valid: true, reply: content.trim(), modelUsed }
        }

        // 有 choices 但 message.content 缺失/为空——代理 bug 或模型名不被真实识别
        const usage = (response as any).usage
        const tokenHint = usage
          ? `（usage: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}，说明模型生成了 token 但代理没把内容放进 content 字段）`
          : ''
        const replacementHint = modelUsed !== currentConfig.model
          ? ` 注意：代理把模型名替换成了 "${modelUsed}"。`
          : ''
        return {
          valid: false,
          error: `代理返回了合法的 choices 结构但 message.content 为空${tokenHint}。`
            + `${replacementHint}`
            + `常见原因：(1) 模型名 "${currentConfig.model}" 该代理不真实支持，(2) 代理实现有 bug。`
            + `建议换成 gpt-4o-mini / gpt-4o / deepseek-chat 等标准模型名测试。`,
        }
      }
      // 返回 200 但没有 choices 字段：多半 baseURL 命中了代理的其他路径（如主页或错误页）
      const baseURL = currentConfig.baseURL ?? ''
      const urlHint = baseURL && !/\/v\d+\/?$/.test(baseURL.replace(/\/$/, ''))
        ? `（baseURL "${baseURL}" 未以 /v1 结尾，尝试改为 "${baseURL.replace(/\/$/, '')}/v1" 后重试）`
        : ''
      const bodyPreview = (() => {
        try {
          const s = JSON.stringify(response)
          return s.length > 300 ? s.slice(0, 300) + '...' : s
        } catch { return String(response) }
      })()
      return {
        valid: false,
        error: `接口返回 200 但响应结构不含 choices 字段${urlHint}。实际响应：${bodyPreview}`,
      }
    } catch (err: unknown) {
      // OpenAI SDK APIError 包含 status + message
      if (err instanceof OpenAI.APIError) {
        const status = err.status
        const hint = status === 401 ? 'API Key 无效'
          : status === 404 ? `模型 "${currentConfig.model}" 不存在或路径错误（常见：baseURL 缺 /v1 后缀）`
          : status === 403 ? '权限不足或 API Key 未开通该模型'
          : status === 429 ? '请求过于频繁，稍后再试'
          : `HTTP ${status}`
        return { valid: false, error: `${hint}：${err.message}` }
      }
      const msg = (err as Error)?.message || String(err)
      if (/ENOTFOUND|ECONNREFUSED|fetch failed|getaddrinfo/i.test(msg)) {
        return { valid: false, error: `网络错误（检查 baseURL）：${msg}` }
      }
      return { valid: false, error: msg }
    }
  }
}
