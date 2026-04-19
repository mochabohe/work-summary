import OpenAI from 'openai'
import { DEEPSEEK_CONFIG } from '@work-summary/shared'
import type { ModelConfig } from '@work-summary/shared'
import { AnthropicClient } from './anthropic-client.js'
import { OpenAIResponsesClient, ResponsesAPIError } from './responses-client.js'

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

  private getResponsesClient(): OpenAIResponsesClient {
    return new OpenAIResponsesClient(
      currentConfig.baseURL ?? '',
      currentConfig.apiKey,
      currentConfig.model,
    )
  }

  private isResponsesMode(): boolean {
    return currentConfig.provider === 'openai-compatible' && currentConfig.apiType === 'responses'
  }

  async *streamChat(messages: ChatMessage[], _model?: string, maxTokens?: number): AsyncGenerator<string> {
    if (currentConfig.provider === 'anthropic') {
      yield* this.getAnthropicClient().streamChat(messages, maxTokens)
      return
    }

    // Responses API 路径（适用 reasoning 模型 / 代理把模型路由到 /v1/responses）
    if (this.isResponsesMode()) {
      let lastError: unknown
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          yield* this.getResponsesClient().streamChat(messages, maxTokens)
          return
        } catch (err) {
          lastError = err
          const msg = (err as Error).message?.toLowerCase() ?? ''
          const retriable = err instanceof ResponsesAPIError
            && (err.status === 429 || (err.status >= 500 && err.status < 600))
          const networkErr = msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('etimedout')
          if (attempt < MAX_RETRIES && (retriable || networkErr)) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt)
            console.warn(`[LLM] Responses streamChat 第 ${attempt + 1} 次失败，${delay / 1000}s 后重试:`, (err as Error).message)
            await sleep(delay)
            continue
          }
          throw err
        }
      }
      throw lastError
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
    if (this.isResponsesMode()) {
      const result = await this.getResponsesClient().chat(messages)
      return result.text
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

      // Responses API 路径
      if (this.isResponsesMode()) {
        try {
          const result = await this.getResponsesClient().chat([
            { role: 'system', content: '你是一个测试助手。用一句话（不超过 30 字）回复用户，证明你在工作。' },
            { role: 'user', content: '请简短介绍你自己，并告诉我你是什么模型。' },
          ])
          if (result.text && result.text.trim()) {
            return { valid: true, reply: result.text.trim(), modelUsed: result.modelUsed }
          }
          // 文本为空但请求成功：dump 完整 output + 关键诊断字段
          const raw = result.raw ?? {}
          const status = raw.status ?? '?'
          const incompleteDetails = raw.incomplete_details
            ? JSON.stringify(raw.incomplete_details)
            : 'null'
          const reasoningInfo = raw.reasoning
            ? JSON.stringify(raw.reasoning).slice(0, 300)
            : 'null'
          const usage = raw.usage
            ? `prompt=${raw.usage.input_tokens ?? raw.usage.prompt_tokens ?? '?'}, output=${raw.usage.output_tokens ?? raw.usage.completion_tokens ?? '?'}, reasoning=${raw.usage.reasoning_tokens ?? raw.usage.output_tokens_details?.reasoning_tokens ?? '?'}`
            : '无 usage'
          let outputDump = ''
          try {
            const outputJson = JSON.stringify(raw.output ?? raw, null, 2)
            outputDump = outputJson.length > 1500 ? outputJson.slice(0, 1500) + '\n...(truncated)' : outputJson
          } catch {
            outputDump = '<failed to stringify>'
          }

          // 给出针对性建议
          const isEmptyOutput = Array.isArray(raw.output) && raw.output.length === 0
          const isReasoningExhausted = raw.usage?.output_tokens_details?.reasoning_tokens > 0 && isEmptyOutput
          const suggestion = isReasoningExhausted
            ? '⚠️ 诊断：reasoning 模型把所有 token 用在推理上，没留给最终输出。已自动设置 reasoning.effort=low + max_output_tokens=2048，但仍不够——请在代理侧确认 max_output_tokens 上限是否被限制，或者把模型换成非 reasoning 模型测试。'
            : isEmptyOutput
              ? '⚠️ 诊断：output 数组为空。可能：(1) 模型实际不支持 Responses API，(2) 代理对该模型的实现有 bug，(3) status="incomplete" 见上方 incomplete_details。'
              : ''

          return {
            valid: false,
            error: `Responses API 调通了但提取不到文本。\n`
              + `status: ${status}\n`
              + `incomplete_details: ${incompleteDetails}\n`
              + `usage: ${usage}\n`
              + `reasoning: ${reasoningInfo}\n`
              + `${suggestion}\n\n`
              + `output 完整内容:\n${outputDump}`,
          }
        } catch (err) {
          if (err instanceof ResponsesAPIError) {
            const status = err.status
            const hint = status === 401 ? 'API Key 无效或过期'
              : status === 404 ? `路径错误（确认 baseURL 含 /v1，且代理支持 /v1/responses 端点）`
              : status === 403 ? '权限不足或未开通 Responses API'
              : status === 429 ? '请求过频'
              : `HTTP ${status}`
            return { valid: false, error: `${hint}：${err.message.slice(0, 200)}` }
          }
          throw err
        }
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
        const msg = response.choices[0]?.message as any
        const modelUsed = response.model || currentConfig.model

        // 常规 content 字段（Chat Completions 标准）
        const content = msg?.content
        if (content && typeof content === 'string' && content.trim().length > 0) {
          return { valid: true, reply: content.trim(), modelUsed }
        }

        // 兼容 reasoning 模型（DeepSeek-Reasoner / OpenAI o1 / o3 / gpt-5 系列）
        // 这些模型把输出放在 reasoning_content 而不是 content
        const reasoningContent = msg?.reasoning_content
        if (reasoningContent && typeof reasoningContent === 'string' && reasoningContent.trim().length > 0) {
          return {
            valid: true,
            reply: `[推理内容]\n${reasoningContent.trim()}`,
            modelUsed,
          }
        }

        // 兼容 refusal 字段（OpenAI 安全拒绝响应）
        const refusal = msg?.refusal
        if (refusal && typeof refusal === 'string') {
          return { valid: false, error: `模型拒绝了请求：${refusal}` }
        }

        // 兼容 tool_calls（如果代理只允许函数调用模式）
        if (Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0) {
          return { valid: false, error: `模型只返回了 tool_calls 而非 content，可能该模型配置为强制函数调用` }
        }

        // 有 choices 但各种 content 字段都缺失——代理 bug 或 API 路径错位
        const usage = (response as any).usage
        const tokenHint = usage
          ? `（usage: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}，说明模型生成了 token 但代理没把内容放进 content/reasoning_content 字段）`
          : ''
        const replacementHint = modelUsed !== currentConfig.model
          ? ` 注意：代理把模型名替换成了 "${modelUsed}"。`
          : ''

        // 检测 id 前缀：resp_ 说明走的是 Responses API（reasoning 模型）
        const isResponsesApi = typeof response.id === 'string' && response.id.startsWith('resp_')
        const apiHint = isResponsesApi
          ? ` 响应 id 以 "resp_" 开头，说明代理把这个模型路由到了 Responses API（通常用于 o1/o3/gpt-5 等 reasoning 模型），但本应用只支持 Chat Completions API。`
          : ''

        // 列出 message 实际有的字段名，方便定位
        const msgFields = msg && typeof msg === 'object'
          ? Object.keys(msg).join(', ')
          : '无'

        return {
          valid: false,
          error: `代理返回了合法的 choices 结构但 message 不含可读内容${tokenHint}。`
            + `${replacementHint}${apiHint}`
            + ` message 字段: [${msgFields}]。`
            + `建议：(1) 换成标准 Chat Completions 模型（gpt-4o-mini / gpt-4o / deepseek-chat），`
            + `(2) 或让代理商修复 "${currentConfig.model}" 的响应格式映射。`,
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
