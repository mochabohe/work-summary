import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import { DEEPSEEK_CONFIG } from '@work-summary/shared'
import type { ModelConfig } from '@work-summary/shared'
import { AnthropicClient } from './anthropic-client.js'
import { OpenAIResponsesClient, ResponsesAPIError } from './responses-client.js'

/**
 * 用户手动添加的模型 profile 持久化路径。
 * Electron 打包模式下 APP_DATA_PATH 指向用户的 userData 目录（由 electron/main.ts 注入）。
 * 开发模式下 APP_DATA_PATH 未设置，默认写到项目根目录。
 * 注意：此文件会明文存储 apiKey，和 history.json 一样级别。
 */
const USER_PROFILES_FILE = path.join(process.env.APP_DATA_PATH || '.', 'model-profiles.json')

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

// 全局当前模型配置
// 启动时为空配置，真实值由 bootstrapDefaultProfiles() 从 .env 读取并设置。
let currentConfig: ModelConfig = {
  provider: 'openai-compatible',
  apiKey: '',
  baseURL: '',
  model: '',
}

export interface SavedModelOption {
  id: string
  ownedBy?: string
  /** env 预设 vs 用户手动添加；前端据此决定是否隐藏真实模型名 */
  source?: 'env' | 'user'
}

interface SavedModelProfile extends ModelConfig {
  profileId: string
  models: SavedModelOption[]
}

let savedModelProfiles: SavedModelProfile[] = []

export function setLLMConfig(config: ModelConfig) {
  currentConfig = config
}

export function patchLLMConfig(patch: Partial<ModelConfig>) {
  currentConfig = { ...currentConfig, ...patch }
}

export function getLLMConfig(): Omit<ModelConfig, 'apiKey'> & { apiKey: string } {
  return { ...currentConfig, apiKey: currentConfig.apiKey ? '***' : '' }
}

function buildProfileId(config: ModelConfig): string {
  return [
    config.provider,
    config.baseURL ?? '',
    config.apiKey,
  ].join('::')
}

function mergeModelOptions(existing: SavedModelOption[], incoming: SavedModelOption[]): SavedModelOption[] {
  const merged = new Map<string, SavedModelOption>()
  for (const item of [...existing, ...incoming]) {
    if (!item?.id) continue
    const prev = merged.get(item.id)
    merged.set(item.id, {
      id: item.id,
      ownedBy: item.ownedBy ?? prev?.ownedBy ?? '',
      // env 标签优先保留：一旦被标记为 env 就不允许被后续 user 覆盖
      source: prev?.source === 'env' ? 'env' : (item.source ?? prev?.source),
    })
  }
  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id))
}

export function saveModelProfile(
  config: ModelConfig,
  models: SavedModelOption[] = [],
  source: 'env' | 'user' = 'user',
) {
  const profileId = buildProfileId(config)
  const profileModels = mergeModelOptions(
    [{ id: config.model, ownedBy: config.provider, source }],
    models.map(m => ({ ...m, source: m.source ?? source })),
  )

  const nextProfile: SavedModelProfile = {
    ...config,
    profileId,
    models: profileModels,
  }

  const existingIndex = savedModelProfiles.findIndex(profile => profile.profileId === profileId)
  if (existingIndex >= 0) {
    const existing = savedModelProfiles[existingIndex]
    savedModelProfiles[existingIndex] = {
      ...existing,
      ...nextProfile,
      model: config.model,
      models: mergeModelOptions(existing.models, profileModels),
    }
  } else {
    savedModelProfiles.push(nextProfile)
  }

  // 只持久化 user profile，env profile 每次启动都从 .env 重建
  if (source === 'user') {
    persistUserProfilesToDisk()
  }
}

export function getModelProfiles(): Array<{
  profileId: string
  provider: ModelConfig['provider']
  baseURL?: string
  model: string
  apiType?: ModelConfig['apiType']
  models: SavedModelOption[]
}> {
  return savedModelProfiles.map(profile => ({
    profileId: profile.profileId,
    provider: profile.provider,
    baseURL: profile.baseURL,
    model: profile.model,
    apiType: profile.apiType,
    models: profile.models.map(item => ({ ...item })),
  }))
}

export function getProfileModelOptions(): SavedModelOption[] {
  return mergeModelOptions(
    [],
    savedModelProfiles.flatMap(profile => profile.models),
  )
}

export function canQuickSwitchModels(): boolean {
  return savedModelProfiles.length > 0
}

/** 读取磁盘上的用户 profile（source='user'）；读不到返回空数组 */
function loadUserProfilesFromDisk(): SavedModelProfile[] {
  try {
    if (!fs.existsSync(USER_PROFILES_FILE)) return []
    const raw = fs.readFileSync(USER_PROFILES_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is SavedModelProfile =>
      p && typeof p === 'object' && typeof p.apiKey === 'string' && typeof p.model === 'string',
    )
  } catch (err) {
    console.warn('[LLM] 读取 user profile 磁盘文件失败:', (err as Error).message)
    return []
  }
}

/** 把当前内存里 source='user' 的 profile 持久化到磁盘 */
function persistUserProfilesToDisk(): void {
  try {
    const userProfiles = savedModelProfiles.filter(profile =>
      profile.models.some(m => m.source === 'user'),
    )
    fs.writeFileSync(USER_PROFILES_FILE, JSON.stringify(userProfiles, null, 2), 'utf-8')
  } catch (err) {
    console.warn('[LLM] 写入 user profile 磁盘文件失败:', (err as Error).message)
  }
}

/**
 * 从 .env 读取 MODEL_GPT_* / MODEL_CLAUDE_* 两组默认 profile，
 * 注册到 savedModelProfiles 并把第一组设为当前 currentConfig。
 * 任一组 key/baseURL(openai)/model 缺失即跳过。
 * 两组都没配时，回退到 DEEPSEEK_API_KEY（兼容旧 .env）。
 *
 * 必须在 dotenv.config() 之后调用。
 */
export function bootstrapDefaultProfiles(): void {
  // 1. 先从磁盘恢复用户 profile
  const diskProfiles = loadUserProfilesFromDisk()
  if (diskProfiles.length > 0) {
    savedModelProfiles = diskProfiles
    console.log(`[LLM] 从磁盘恢复 ${diskProfiles.length} 个用户 profile`)
  }

  // 2. 再注册 env 预设（同 profileId 时 env 覆盖 user，保证预设总是生效）
  const readEnvProfile = (prefix: 'GPT' | 'CLAUDE'): ModelConfig | null => {
    const provider = process.env[`MODEL_${prefix}_PROVIDER`] as ModelConfig['provider'] | undefined
    const apiKey = process.env[`MODEL_${prefix}_API_KEY`]
    const baseURL = process.env[`MODEL_${prefix}_BASE_URL`]
    const model = process.env[`MODEL_${prefix}_NAME`]
    const apiType = process.env[`MODEL_${prefix}_API_TYPE`] as ModelConfig['apiType'] | undefined

    if (!provider || !apiKey || !model) return null
    if (provider === 'openai-compatible' && !baseURL) return null
    if (provider !== 'openai-compatible' && provider !== 'anthropic') return null

    return {
      provider,
      apiKey,
      baseURL: baseURL || undefined,
      model,
      ...(apiType ? { apiType } : {}),
    }
  }

  const registered: ModelConfig[] = []

  const gpt = readEnvProfile('GPT')
  if (gpt) {
    saveModelProfile(gpt, [{ id: gpt.model, ownedBy: gpt.provider, source: 'env' }], 'env')
    registered.push(gpt)
  }

  const claude = readEnvProfile('CLAUDE')
  if (claude) {
    saveModelProfile(claude, [{ id: claude.model, ownedBy: claude.provider, source: 'env' }], 'env')
    registered.push(claude)
  }

  // 兜底：两组都没配时回退 DEEPSEEK_API_KEY
  if (registered.length === 0 && process.env.DEEPSEEK_API_KEY) {
    const deepseek: ModelConfig = {
      provider: 'openai-compatible',
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || DEEPSEEK_CONFIG.baseURL,
      model: DEEPSEEK_CONFIG.defaultModel,
    }
    saveModelProfile(deepseek, [{ id: deepseek.model, ownedBy: deepseek.provider, source: 'env' }], 'env')
    registered.push(deepseek)
  }

  if (registered.length > 0) {
    currentConfig = registered[0]
    const names = registered.map(p => p.model).join(', ')
    console.log(`[LLM] 已加载默认 profile: ${names}（当前激活: ${currentConfig.model}）`)
  } else {
    console.warn('[LLM] 未配置任何默认模型 profile，请在 .env 填写 MODEL_GPT_* / MODEL_CLAUDE_* 或 DEEPSEEK_API_KEY')
  }
}

export function switchToSavedModel(model: string, apiType?: ModelConfig['apiType']): ModelConfig | null {
  const profile = [...savedModelProfiles]
    .reverse()
    .find(item => item.models.some(option => option.id === model) || item.model === model)

  if (!profile) return null

  const nextConfig: ModelConfig = {
    provider: profile.provider,
    apiKey: profile.apiKey,
    baseURL: profile.baseURL,
    model,
    apiType: apiType ?? profile.apiType,
  }

  currentConfig = nextConfig
  return { ...nextConfig }
}

export class LLMService {
  private getOpenAIClient(): OpenAI {
    return new OpenAI({
      apiKey: currentConfig.apiKey,
      baseURL: currentConfig.baseURL,
      // 比前端 axios 超时（300s）略短，确保后端先返回错误而不是被前端先断开
      timeout: 280_000,
    })
  }

  private getAnthropicClient(): AnthropicClient {
    return new AnthropicClient(currentConfig.apiKey, currentConfig.model, currentConfig.baseURL)
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

  /**
   * 多模态：传文本 + 图片，调用 vision 模型返回纯文本
   * 当前仅 openai-compatible provider 走 chat.completions（vision 格式）
   * anthropic 走 Messages API 的 image content block
   */
  async chatWithImage(prompt: string, imageBase64: string, mimeType: string): Promise<string> {
    if (currentConfig.provider === 'anthropic') {
      return this.getAnthropicClient().chatWithImage(prompt, imageBase64, mimeType)
    }

    const dataUrl = `data:${mimeType};base64,${imageBase64}`
    const messages = [{
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: prompt },
        { type: 'image_url' as const, image_url: { url: dataUrl } },
      ],
    }]

    let lastError: unknown
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.getOpenAIClient().chat.completions.create({
          model: currentConfig.model,
          messages: messages as any,
          max_tokens: 4096,
        })
        return response.choices[0]?.message?.content || ''
      } catch (err) {
        lastError = err
        if (attempt < MAX_RETRIES && isRetriableError(err)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt)
          console.warn(`[LLM] chatWithImage 第 ${attempt + 1} 次失败，${delay / 1000}s 后重试:`, (err as Error).message)
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
        return await this.getAnthropicClient().validateVerbose()
      }

      // Responses API 路径
      if (this.isResponsesMode()) {
        try {
          const testMessages: ChatMessage[] = [
            { role: 'system', content: '你是一个测试助手。用一句话（不超过 30 字）回复用户，证明你在工作。' },
            { role: 'user', content: '请简短介绍你自己，并告诉我你是什么模型。' },
          ]
          let result = await this.getResponsesClient().chat(testMessages)
          for (let attempt = 2; attempt <= 3; attempt++) {
            if (result.text && result.text.trim()) break
            const raw = result.raw ?? {}
            const shouldRetry = raw.status === 'completed' && Array.isArray(raw.output) && raw.output.length === 0
            if (!shouldRetry) break
            await sleep(800 * (attempt - 1))
            result = await this.getResponsesClient().chat(testMessages)
          }
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
