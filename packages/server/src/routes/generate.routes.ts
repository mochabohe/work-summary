import { FastifyPluginAsync } from 'fastify'
import { LLMService } from '../services/llm/index.js'
import { PromptBuilder } from '../services/llm/prompt-builder.js'
import type { GenerateRequest } from '@work-summary/shared'

export const generateRoutes: FastifyPluginAsync = async (app) => {
  // AI 流式生成总结
  app.post<{
    Body: GenerateRequest & { apiKey?: string }
  }>('/summary', async (request, reply) => {
    const { projects, feishuDocs, standaloneDocuments, dimensions, style, customPrompt, strictFactMode, apiKey } = request.body

    const key = apiKey || process.env.DEEPSEEK_API_KEY
    if (!key) {
      return reply.status(400).send({ success: false, error: '请提供 DeepSeek API Key' })
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    try {
      const promptBuilder = new PromptBuilder()
      const messages = promptBuilder.buildSummaryPrompt({
        projects,
        feishuDocs,
        standaloneDocuments,
        dimensions,
        style,
        customPrompt,
        strictFactMode,
      })

      const llm = new LLMService(key)

      for await (const chunk of llm.streamChat(messages)) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
      }

      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: (err as Error).message })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })

  // 对话式修改总结
  app.post<{
    Body: { content: string; instruction: string; history?: { role: string; content: string }[]; apiKey?: string }
  }>('/refine', async (request, reply) => {
    const { content, instruction, history, apiKey } = request.body

    const key = apiKey || process.env.DEEPSEEK_API_KEY
    if (!key) {
      return reply.status(400).send({ success: false, error: '请提供 DeepSeek API Key' })
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    try {
      const llm = new LLMService(key)

      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        {
          role: 'system',
          content: `你是一位专业的年终工作总结修改助手。用户会给你一份已生成的年终工作总结（Markdown 格式），并提出修改意见。

## 你的任务
根据用户的修改意见对总结进行调整，输出**修改后的完整总结**。

## 规则
1. **只输出修改后的完整 Markdown 总结正文**，不要输出任何解释、说明、开场白
2. 保持原文中未被要求修改的部分不变
3. 如果用户要求增加内容，在合适的位置自然地融入
4. 如果用户要求删除或缩减，直接移除或精简对应部分
5. 如果用户要求调整措辞或风格，只改措辞不改事实
6. 保持 Markdown 格式规范（二级标题、加粗、列表等）`,
        },
      ]

      // 加入历史对话记录（实现多轮修改）
      if (history && history.length > 0) {
        for (const msg of history) {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })
        }
      } else {
        // 首次修改，把当前总结作为 assistant 的初始输出
        messages.push({
          role: 'assistant',
          content: content,
        })
      }

      // 用户本轮修改意见
      messages.push({
        role: 'user',
        content: instruction,
      })

      for await (const chunk of llm.streamChat(messages)) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
      }

      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: (err as Error).message })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })
}
