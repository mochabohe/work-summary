import { FastifyPluginAsync } from 'fastify'
import { LLMService } from '../services/llm/index.js'
import { PromptBuilder } from '../services/llm/prompt-builder.js'
import { scoreTextQuality } from '../services/algorithm/index.js'
import type { GenerateRequest, GitStats, ApiResponse, TextQualityScore } from '@work-summary/shared'

/**
 * 修复被截断的 JSON 字符串。
 * AI 输出可能因 token 上限而中途截断，导致 JSON 不完整。
 * 此函数尝试关闭未闭合的字符串、数组和对象，使 JSON 可解析。
 */
function repairTruncatedJson(json: string): string {
  let str = json

  // 第一步：如果在字符串内部被截断，关闭字符串
  let inString = false
  let escaped = false
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString }
  }
  if (inString) {
    str += '"'
  }

  // 第二步：反复清理尾部不完整的片段，直到稳定
  // 需要多轮清理，因为去掉一层后可能暴露出新的不完整片段
  let prev = ''
  while (prev !== str) {
    prev = str
    // 去掉尾部 "key": （key 后面缺少 value）
    str = str.replace(/,?\s*"[^"]*"\s*:\s*$/, '')
    // 去掉尾部孤立的 "key"（在对象内，逗号后的 key 没有冒号）
    str = str.replace(/,?\s*"[^"]*"\s*$/, '')
    // 去掉尾部残留逗号
    str = str.replace(/,\s*$/, '')
    // 去掉尾部不完整的数字/布尔/null 值（如 "key": tru 或 "key": 12）
    str = str.replace(/,?\s*"[^"]*"\s*:\s*[a-zA-Z0-9.]+\s*$/, '')
  }

  // 第三步：统计未闭合的括号，依次补全
  const stack: string[] = []
  inString = false
  escaped = false
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if ((ch === '}' || ch === ']') && stack.length > 0) stack.pop()
  }

  // 反向补全所有未闭合的括号
  while (stack.length > 0) {
    str += stack.pop()
  }

  return str
}

/** 解析 Markdown 文本，按 ## 标题拆分为多个章节 */
function parseMarkdownSections(markdown: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = []
  const parts = markdown.split(/^## /m)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const firstNewline = trimmed.indexOf('\n')
    if (firstNewline === -1) continue // 只有标题没有内容，跳过

    const title = trimmed.substring(0, firstNewline).trim()
    const content = trimmed.substring(firstNewline + 1).trim()
    if (title && content) {
      sections.push({ title, content })
    }
  }

  return sections
}

/** 清理并解析 AI 返回的 JSON（处理代码块包裹和截断） */
function parseAiJson(raw: string): any {
  let jsonStr = raw.trim()
  // 清理 markdown 代码块包裹
  if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7)
  else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3)
  if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3)
  jsonStr = jsonStr.trim()

  try {
    return JSON.parse(jsonStr)
  } catch {
    try {
      return JSON.parse(repairTruncatedJson(jsonStr))
    } catch {
      return null
    }
  }
}

export const generateRoutes: FastifyPluginAsync = async (app) => {
  // AI 分段生成 PPT 幻灯片 (SSE)
  // 策略：将 Markdown 按章节拆分，每个章节独立调用 AI 生成幻灯片，避免单次输出超过 token 上限
  app.post<{
    Body: { content: string; title?: string }
  }>('/ppt', async (request, reply) => {
    const { content, title: pptTitle } = request.body
    const coverTitle = pptTitle || '年终工作总结'

    reply.hijack()

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) }
    }, 15000)

    try {
      const promptBuilder = new PromptBuilder()
      const llm = new LLMService()
      const allSlides: any[] = []

      // 解析 Markdown 章节
      const sections = parseMarkdownSections(content)
      const totalSteps = sections.length + 2 // metrics + 各章节 + summary
      let step = 0

      // --- 1. 封面页（自动生成，无需 AI） ---
      allSlides.push({ type: 'title', title: coverTitle, subtitle: `${new Date().getFullYear()}` })

      // --- 2. 全年概览指标（AI 提取关键数据） ---
      step++
      reply.raw.write(`data: ${JSON.stringify({ type: 'progress', content: `[${step}/${totalSteps}] 正在提取全年关键数据...` })}\n\n`)

      const metricsMessages = promptBuilder.buildOverviewMetricsPrompt(content)
      let metricsRaw = ''
      for await (const chunk of llm.streamChat(metricsMessages, undefined, 2048)) {
        metricsRaw += chunk
        reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
      }

      const metricsSlide = parseAiJson(metricsRaw)
      if (metricsSlide) {
        allSlides.push(metricsSlide)
        app.log.info('成功生成 metrics 幻灯片')
      }

      // --- 3. 逐章节生成幻灯片 ---
      for (let i = 0; i < sections.length; i++) {
        step++
        const section = sections[i]
        reply.raw.write(`data: ${JSON.stringify({ type: 'progress', content: `[${step}/${totalSteps}] 正在生成板块：${section.title}...` })}\n\n`)

        // AI 生成该章节的内容幻灯片
        const sectionMessages = promptBuilder.buildSectionSlidesPrompt(section.title, section.content)
        let sectionRaw = ''
        for await (const chunk of llm.streamChat(sectionMessages, undefined, 4096)) {
          sectionRaw += chunk
          reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
        }

        const sectionSlides = parseAiJson(sectionRaw)
        const parsedSlides: any[] = Array.isArray(sectionSlides)
          ? sectionSlides
          : sectionSlides ? [sectionSlides] : []

        // 只有 AI 成功生成了内容幻灯片，才插入章节过渡页 + 内容页
        // 避免连续出现两个空的章节标题页
        if (parsedSlides.length > 0) {
          allSlides.push({ type: 'section', title: section.title })
          allSlides.push(...parsedSlides)
          app.log.info(`章节 "${section.title}" 生成了 ${parsedSlides.length} 页幻灯片`)
        } else {
          app.log.warn(`章节 "${section.title}" 未能生成有效幻灯片，已跳过`)
        }
      }

      // --- 4. 年度总结页（AI 提炼亮点 + 关键词） ---
      step++
      reply.raw.write(`data: ${JSON.stringify({ type: 'progress', content: `[${step}/${totalSteps}] 正在生成年度总结...` })}\n\n`)

      const summaryMessages = promptBuilder.buildSummarySlidePrompt(content)
      let summaryRaw = ''
      for await (const chunk of llm.streamChat(summaryMessages, undefined, 2048)) {
        summaryRaw += chunk
        reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
      }

      const summarySlide = parseAiJson(summaryRaw)
      if (summarySlide) {
        allSlides.push(summarySlide)
        app.log.info('成功生成 summary 幻灯片')
      }

      // --- 5. 结束页（自动生成） ---
      allSlides.push({ type: 'end', title: '感谢', subtitle: '谢谢观看' })

      // --- 返回完整幻灯片数据 ---
      const slidesData = { title: coverTitle, slides: allSlides }
      app.log.info(`PPT 生成完成，共 ${allSlides.length} 页幻灯片`)

      reply.raw.write(`data: ${JSON.stringify({ type: 'done', slidesData })}\n\n`)
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: (err as Error).message })}\n\n`)
    } finally {
      clearInterval(heartbeat)
      reply.raw.end()
    }
  })

  // AI 流式生成总结（单次调用，直接流式输出）
  app.post<{
    Body: GenerateRequest
  }>('/summary', async (request, reply) => {
    const params = request.body

    // 接管响应，阻止 Fastify 在 handler 返回后自动处理
    reply.hijack()

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    // SSE 心跳，防止长时间无数据导致连接断开
    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) }
    }, 15000)

    try {
      const promptBuilder = new PromptBuilder()
      const llm = new LLMService()

      reply.raw.write(`data: ${JSON.stringify({ type: 'progress', content: '正在生成总结...' })}\n\n`)

      const messages = promptBuilder.buildSummaryPrompt(params)
      for await (const chunk of llm.streamChat(messages)) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
      }

      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: (err as Error).message })}\n\n`)
    } finally {
      clearInterval(heartbeat)
      reply.raw.end()
    }
  })

  // 对话式修改总结
  app.post<{
    Body: { content: string; instruction: string; history?: { role: string; content: string }[] }
  }>('/refine', async (request, reply) => {
    const { content, instruction, history } = request.body

    // 接管响应，阻止 Fastify 在 handler 返回后自动处理
    reply.hijack()

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    // SSE 心跳，防止长时间无数据导致连接断开
    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) }
    }, 15000)

    try {
      const llm = new LLMService()

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
      clearInterval(heartbeat)
      reply.raw.end()
    }
  })

  // 章节级修改（只重写一个章节）
  app.post<{
    Body: { fullContent: string; sectionIndex: number; instruction: string }
  }>('/refine-section', async (request, reply) => {
    const { fullContent, sectionIndex, instruction } = request.body

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) }
    }, 15000)

    try {
      const promptBuilder = new PromptBuilder()
      const llm = new LLMService()

      // 按 ## 拆分为章节
      const sections = fullContent.split(/(?=^## )/m)
      if (sectionIndex < 0 || sectionIndex >= sections.length) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: '章节索引越界' })}\n\n`)
        return
      }

      const targetSection = sections[sectionIndex]
      const otherTitles = sections
        .filter((_, i) => i !== sectionIndex)
        .map(s => s.split('\n')[0].replace(/^##\s*/, '').trim())
        .filter(Boolean)

      const messages = promptBuilder.buildSectionRefinePrompt(targetSection, instruction, otherTitles)
      for await (const chunk of llm.streamChat(messages)) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
      }

      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: (err as Error).message })}\n\n`)
    } finally {
      clearInterval(heartbeat)
      reply.raw.end()
    }
  })

  // 生成结构化大纲（JSON）
  app.post<{
    Body: GenerateRequest
  }>('/outline', async (request, reply) => {
    const params = request.body

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) }
    }, 15000)

    try {
      const promptBuilder = new PromptBuilder()
      const llm = new LLMService()

      reply.raw.write(`data: ${JSON.stringify({ type: 'progress', content: '正在生成大纲...' })}\n\n`)

      const messages = promptBuilder.buildOutlineJsonPrompt(params)
      let raw = ''
      for await (const chunk of llm.streamChat(messages, undefined, 2048)) {
        raw += chunk
      }

      // 解析 JSON 大纲
      const outline = parseAiJson(raw)
      if (Array.isArray(outline) && outline.length > 0) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'done', outline })}\n\n`)
      } else {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: '大纲解析失败，请重试' })}\n\n`)
      }
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: (err as Error).message })}\n\n`)
    } finally {
      clearInterval(heartbeat)
      reply.raw.end()
    }
  })

  // 基于大纲生成全文
  app.post<{
    Body: GenerateRequest & { outline: { title: string; points: string[] }[] }
  }>('/from-outline', async (request, reply) => {
    const { outline, ...params } = request.body

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) }
    }, 15000)

    try {
      const promptBuilder = new PromptBuilder()
      const llm = new LLMService()

      reply.raw.write(`data: ${JSON.stringify({ type: 'progress', content: '正在基于大纲生成全文...' })}\n\n`)

      // 将 outline JSON 转为 Markdown 提纲
      const outlineMarkdown = outline.map(item =>
        `## ${item.title}\n${item.points.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
      ).join('\n\n')

      const messages = promptBuilder.buildFromOutlinePrompt(params as GenerateRequest, outlineMarkdown)
      for await (const chunk of llm.streamChat(messages)) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
      }

      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: (err as Error).message })}\n\n`)
    } finally {
      clearInterval(heartbeat)
      reply.raw.end()
    }
  })

  // 文本质量评分接口
  app.post<{
    Body: {
      text: string
      gitStats?: GitStats
    }
  }>('/quality-score', async (request, reply) => {
    const { text, gitStats } = request.body

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({ success: false, error: '文本内容不能为空' })
    }

    const result = scoreTextQuality(text, gitStats)
    const response: ApiResponse<TextQualityScore> = { success: true, data: result }
    return reply.send(response)
  })
}
