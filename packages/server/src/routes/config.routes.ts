import { FastifyPluginAsync } from 'fastify'
import OpenAI from 'openai'
import { LLMService, setLLMConfig, getLLMConfig } from '../services/llm/index.js'
import type { ApiResponse, ModelConfig } from '@work-summary/shared'

export const configRoutes: FastifyPluginAsync = async (app) => {
  // 验证代理是否可用
  app.post('/validate-llm', async (_request, reply) => {
    try {
      const llm = new LLMService()
      const valid = await llm.validate()
      return reply.send({ success: true, data: { valid, models: valid ? ['deepseek-chat', 'deepseek-reasoner'] : [] } })
    } catch {
      return reply.send({ success: true, data: { valid: false, models: [] } })
    }
  })

  // 拉取代理支持的模型列表（OpenAI 标准 /v1/models 接口）
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
      // res.data: Array<{ id, object, created, owned_by }>
      const models = res.data
        .map((m: any) => ({ id: m.id, ownedBy: m.owned_by ?? '' }))
        .sort((a, b) => a.id.localeCompare(b.id))
      return reply.send({
        success: true,
        data: { models, total: models.length },
      } as ApiResponse<{ models: { id: string; ownedBy: string }[]; total: number }>)
    } catch (err: unknown) {
      if (err instanceof OpenAI.APIError) {
        const status = err.status
        const hint = status === 401 ? 'API Key 无效或过期'
          : status === 404 ? `路径不存在（baseURL 可能错误，确认含 /v1）`
          : status === 403 ? '权限不足'
          : `HTTP ${status}`
        return reply.status(400).send({ success: false, error: `${hint}：${err.message}` })
      }
      const msg = (err as Error)?.message || String(err)
      return reply.status(400).send({ success: false, error: `拉取模型列表失败：${msg}` })
    }
  })

  // 获取当前模型配置（apiKey 脱敏）
  app.get('/model', async (_request, reply) => {
    return reply.send({ success: true, data: getLLMConfig() } as ApiResponse<ReturnType<typeof getLLMConfig>>)
  })

  // 设置模型配置并验证连通性
  app.post<{ Body: ModelConfig & { skipValidate?: boolean } }>('/model', async (request, reply) => {
    const config = request.body
    if (!config.provider || !config.apiKey || !config.model) {
      return reply.status(400).send({ success: false, error: '缺少必要的模型配置字段' })
    }
    if (config.provider === 'openai-compatible' && !config.baseURL) {
      return reply.status(400).send({ success: false, error: 'OpenAI 兼容模式需要提供 baseURL' })
    }

    setLLMConfig(config)

    // 已通过测试时跳过验证（保存秒响应，省一次模型调用费用 + 延迟）
    if (config.skipValidate) {
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
}
