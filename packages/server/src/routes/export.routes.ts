import { FastifyPluginAsync } from 'fastify'
import { ExportService } from '../services/export/index.js'
import { exportBaiduPpt } from '../services/export/baidu-ppt.js'
import type { PptData, CustomColors } from '../services/export/index.js'
import type { BaiduPptResult } from '../services/export/baidu-ppt.js'

/** 生成安全的 Content-Disposition 头（支持中文文件名） */
function safeContentDisposition(filename: string, ext: string): string {
  // ASCII 回退文件名
  const asciiName = `work-summary.${ext}`
  // RFC 5987 编码中文文件名
  const encodedName = encodeURIComponent(`${filename}.${ext}`).replace(/'/g, '%27')
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`
}

export const exportRoutes: FastifyPluginAsync = async (app) => {
  // 导出 Markdown
  app.post<{
    Body: { content: string; filename?: string }
  }>('/markdown', async (request, reply) => {
    const { content, filename = 'work-summary' } = request.body

    const buffer = Buffer.from(content, 'utf-8')
    reply.header('Content-Type', 'text/markdown; charset=utf-8')
    reply.header('Content-Disposition', safeContentDisposition(filename, 'md'))
    return reply.send(buffer)
  })

  // 导出 Word
  app.post<{
    Body: { content: string; filename?: string }
  }>('/docx', async (request, reply) => {
    const { content, filename = 'work-summary' } = request.body

    try {
      const exportService = new ExportService()
      const buffer = await exportService.toDocx(content)

      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      reply.header('Content-Disposition', safeContentDisposition(filename, 'docx'))
      return reply.send(buffer)
    } catch (err) {
      app.log.error(err, 'DOCX 导出失败')
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // 导出 PDF
  app.post<{
    Body: { content: string; filename?: string }
  }>('/pdf', async (request, reply) => {
    const { content, filename = 'work-summary' } = request.body

    try {
      const exportService = new ExportService()
      const buffer = await exportService.toPdf(content)

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', safeContentDisposition(filename, 'pdf'))
      return reply.send(buffer)
    } catch (err) {
      app.log.error(err, 'PDF 导出失败')
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // 导出 PDF（从幻灯片 JSON 结构生成，与 PPTX 视觉一致）
  app.post<{
    Body: { slidesData: PptData; filename?: string; colors?: CustomColors }
  }>('/pdf-slides', { config: { rawBody: false }, bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    let { slidesData, filename = 'work-summary', colors } = request.body

    if (!slidesData) {
      return reply.status(400).send({ success: false, error: '缺少 slidesData 参数' })
    }
    if (Array.isArray(slidesData)) {
      slidesData = { title: '工作总结', slides: slidesData } as PptData
    }
    if (!slidesData.slides || !Array.isArray(slidesData.slides)) {
      return reply.status(400).send({ success: false, error: 'slidesData.slides 不是有效数组' })
    }

    try {
      const exportService = new ExportService()
      const buffer = await exportService.toPdfSlides(slidesData, colors)

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', safeContentDisposition(filename, 'pdf'))
      return reply.send(buffer)
    } catch (err) {
      app.log.error(err, 'PDF 幻灯片导出失败')
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // 导出 PPTX（从幻灯片 JSON 结构生成）
  app.post<{
    Body: { slidesData: PptData; filename?: string; colors?: CustomColors }
  }>('/pptx', { config: { rawBody: false }, bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    let { slidesData, filename = 'work-summary', colors } = request.body

    // 数据验证与标准化
    if (!slidesData) {
      return reply.status(400).send({ success: false, error: '缺少 slidesData 参数' })
    }
    if (Array.isArray(slidesData)) {
      slidesData = { title: '工作总结', slides: slidesData } as PptData
    }
    if (!slidesData.slides || !Array.isArray(slidesData.slides)) {
      app.log.error({ slidesData: JSON.stringify(slidesData).substring(0, 500) }, 'PPTX slidesData 结构无效')
      return reply.status(400).send({ success: false, error: 'slidesData.slides 不是有效数组' })
    }

    try {
      const exportService = new ExportService()
      const buffer = await exportService.toPptx(slidesData, colors)

      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      reply.header('Content-Disposition', safeContentDisposition(filename, 'pptx'))
      return reply.send(buffer)
    } catch (err) {
      app.log.error(err, 'PPTX 导出失败')
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ========== 百度 AI PPT 导出（SSE 流式） ==========
  app.post<{
    Body: { content: string; category?: string; tplId?: number; filename?: string }
  }>('/baidu-ppt', async (request, reply) => {
    const { content, category, tplId, filename = 'work-summary' } = request.body

    if (!content) {
      return reply.status(400).send({ success: false, error: '缺少 content 参数' })
    }

    const apiKey = process.env.BAIDU_API_KEY
    if (!apiKey) {
      return reply.status(500).send({ success: false, error: '未配置 BAIDU_API_KEY' })
    }

    // SSE 流式响应
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    try {
      const pptUrl = await exportBaiduPpt(
        content,
        apiKey,
        { category, tplId },
        (event: BaiduPptResult) => {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
        },
      )

      // 最终结果
      reply.raw.write(`data: ${JSON.stringify({
        status: '完成',
        is_end: true,
        data: { pptx_url: pptUrl },
      })}\n\n`)
    } catch (err) {
      app.log.error(err, '百度 AI PPT 导出失败')
      reply.raw.write(`data: ${JSON.stringify({
        status: '失败',
        is_end: true,
        error: (err as Error).message,
      })}\n\n`)
    }

    reply.raw.end()
  })

  // 获取百度 AI PPT 可用模板列表
  app.get('/baidu-ppt/themes', async (_request, reply) => {
    const apiKey = process.env.BAIDU_API_KEY
    if (!apiKey) {
      return reply.status(500).send({ success: false, error: '未配置 BAIDU_API_KEY' })
    }

    try {
      const res = await fetch('https://qianfan.baidubce.com/v2/tools/ai_ppt/get_ppt_theme', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      const json = await res.json() as any
      return { success: true, data: json.data?.ppt_themes || [] }
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // 检查百度 API Key 是否已配置
  app.get('/baidu-ppt/status', async () => {
    return {
      success: true,
      data: {
        configured: !!process.env.BAIDU_API_KEY,
      },
    }
  })
}
