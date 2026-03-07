import { FastifyPluginAsync } from 'fastify'
import { LLMService } from '../services/llm/index.js'
import type { ApiResponse } from '@work-summary/shared'

export const configRoutes: FastifyPluginAsync = async (app) => {
  // 验证 API Key
  app.post<{
    Body: { apiKey: string }
  }>('/validate-llm', async (request, reply) => {
    const { apiKey } = request.body

    try {
      const llm = new LLMService(apiKey)
      const valid = await llm.validate()

      const response: ApiResponse<{ valid: boolean; models: string[] }> = {
        success: true,
        data: {
          valid,
          models: valid ? ['deepseek-chat', 'deepseek-reasoner'] : [],
        },
      }
      return reply.send(response)
    } catch (err) {
      return reply.send({
        success: true,
        data: { valid: false, models: [] },
      })
    }
  })
}
