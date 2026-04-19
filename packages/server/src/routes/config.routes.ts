import { FastifyPluginAsync } from 'fastify'
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

  // 获取当前模型配置（apiKey 脱敏）
  app.get('/model', async (_request, reply) => {
    return reply.send({ success: true, data: getLLMConfig() } as ApiResponse<ReturnType<typeof getLLMConfig>>)
  })

  // 设置模型配置并验证连通性
  app.post<{ Body: ModelConfig }>('/model', async (request, reply) => {
    const config = request.body
    if (!config.provider || !config.apiKey || !config.model) {
      return reply.status(400).send({ success: false, error: '缺少必要的模型配置字段' })
    }
    if (config.provider === 'openai-compatible' && !config.baseURL) {
      return reply.status(400).send({ success: false, error: 'OpenAI 兼容模式需要提供 baseURL' })
    }

    setLLMConfig(config)

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
