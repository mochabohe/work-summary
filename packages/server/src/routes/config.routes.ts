import { FastifyPluginAsync } from 'fastify'
import { LLMService } from '../services/llm/index.js'
import type { ApiResponse } from '@work-summary/shared'

export const configRoutes: FastifyPluginAsync = async (app) => {
  // 验证代理是否可用
  app.post('/validate-llm', async (request, reply) => {
    try {
      const llm = new LLMService()
      const valid = await llm.validate()

      const response: ApiResponse<{ valid: boolean; models: string[] }> = {
        success: true,
        data: {
          valid,
          models: valid ? ['deepseek-chat', 'deepseek-reasoner'] : [],
        },
      }
      return reply.send(response)
    } catch {
      return reply.send({
        success: true,
        data: { valid: false, models: [] },
      })
    }
  })
}
