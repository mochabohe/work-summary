import { FastifyPluginAsync } from 'fastify'
import OpenAI from 'openai'
import {
  LLMService,
  getLLMConfig,
  setLLMConfig,
  saveModelProfile,
  getProfileModelOptions,
  canQuickSwitchModels,
  switchToSavedModel,
} from '../services/llm/index.js'
import type { ApiResponse, ModelConfig } from '@work-summary/shared'

type SavedModelOption = { id: string; ownedBy?: string }

export const configRoutes: FastifyPluginAsync = async (app) => {
  app.post('/validate-llm', async (_request, reply) => {
    try {
      const llm = new LLMService()
      const valid = await llm.validate()
      return reply.send({
        success: true,
        data: { valid, models: valid ? ['deepseek-chat', 'deepseek-reasoner'] : [] },
      })
    } catch {
      return reply.send({ success: true, data: { valid: false, models: [] } })
    }
  })

  app.post<{
    Body: { baseURL: string; apiKey: string }
  }>('/list-models', async (request, reply) => {
    const { baseURL, apiKey } = request.body
    if (!baseURL || !apiKey) {
      return reply.status(400).send({ success: false, error: '缺少 baseURL 或 apiKey' })
    }

    try {
      const client = new OpenAI({ baseURL, apiKey })
      const res = await client.models.list()
      const models = res.data
        .map((item: any) => ({ id: item.id, ownedBy: item.owned_by ?? '' }))
        .sort((a, b) => a.id.localeCompare(b.id))

      return reply.send({
        success: true,
        data: { models, total: models.length },
      } as ApiResponse<{ models: SavedModelOption[]; total: number }>)
    } catch (err: unknown) {
      if (err instanceof OpenAI.APIError) {
        const status = err.status
        const hint = status === 401
          ? 'API Key 无效或已过期'
          : status === 404
            ? '路径不存在，请确认 baseURL 包含 /v1'
            : status === 403
              ? '权限不足'
              : `HTTP ${status}`
        return reply.status(400).send({ success: false, error: `${hint}: ${err.message}` })
      }

      const message = (err as Error)?.message || String(err)
      return reply.status(400).send({ success: false, error: `拉取模型列表失败: ${message}` })
    }
  })

  app.get('/model', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        ...getLLMConfig(),
        quickSwitchReady: canQuickSwitchModels(),
        availableModels: getProfileModelOptions(),
      },
    } as ApiResponse<ReturnType<typeof getLLMConfig> & {
      quickSwitchReady: boolean
      availableModels: SavedModelOption[]
    }>)
  })

  app.post<{
    Body: ModelConfig & { skipValidate?: boolean; availableModels?: SavedModelOption[] }
  }>('/model', async (request, reply) => {
    const config = request.body
    const availableModels = Array.isArray(request.body.availableModels)
      ? request.body.availableModels
      : []

    if (!config.provider || !config.apiKey || !config.model) {
      return reply.status(400).send({ success: false, error: '缺少必要的模型配置字段' })
    }
    if (config.provider === 'openai-compatible' && !config.baseURL) {
      return reply.status(400).send({ success: false, error: 'OpenAI 兼容模式需要提供 baseURL' })
    }

    setLLMConfig(config)

    if (config.skipValidate) {
      saveModelProfile(config, availableModels)
      return reply.send({ success: true, data: { valid: true } } as ApiResponse<{ valid: boolean }>)
    }

    try {
      const llm = new LLMService()
      const result = await llm.validateVerbose()
      if (!result.valid) {
        return reply.status(400).send({
          success: false,
          error: result.error ?? '模型连接验证失败，请检查 API Key 和 URL 是否正确',
        })
      }

      saveModelProfile(config, availableModels)
      return reply.send({
        success: true,
        data: {
          valid: true,
          reply: result.reply,
          modelUsed: result.modelUsed,
        },
      } as ApiResponse<{ valid: boolean; reply?: string; modelUsed?: string }>)
    } catch (err) {
      return reply.status(400).send({ success: false, error: `验证失败: ${(err as Error).message}` })
    }
  })

  app.post<{
    Body: { model: string; apiType?: 'chat' | 'responses' }
  }>('/model/select', async (request, reply) => {
    const { model, apiType } = request.body
    if (!model) {
      return reply.status(400).send({ success: false, error: '缺少 model' })
    }

    const nextConfig = switchToSavedModel(model, apiType)
    if (!nextConfig?.apiKey || !nextConfig.provider || !nextConfig.model) {
      return reply.status(400).send({ success: false, error: '请先完成模型配置' })
    }

    return reply.send({
      success: true,
      data: {
        model: nextConfig.model,
        apiType: nextConfig.apiType,
        provider: nextConfig.provider,
        baseURL: nextConfig.baseURL,
      },
    } as ApiResponse<{
      model: string
      apiType?: 'chat' | 'responses'
      provider: ModelConfig['provider']
      baseURL?: string
    }>)
  })
}
