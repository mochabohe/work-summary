import { FastifyPluginAsync } from 'fastify'
import { ExportService } from '../services/export/index.js'
import type { PptData } from '../services/export/index.js'

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

  // 导出 PPTX（从幻灯片 JSON 结构生成）
  app.post<{
    Body: { slidesData: PptData; filename?: string }
  }>('/pptx', { config: { rawBody: false }, bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    let { slidesData, filename = 'work-summary' } = request.body

    // 数据验证与标准化
    if (!slidesData) {
      return reply.status(400).send({ success: false, error: '缺少 slidesData 参数' })
    }
    if (Array.isArray(slidesData)) {
      slidesData = { title: '年终工作总结', slides: slidesData } as PptData
    }
    if (!slidesData.slides || !Array.isArray(slidesData.slides)) {
      app.log.error({ slidesData: JSON.stringify(slidesData).substring(0, 500) }, 'PPTX slidesData 结构无效')
      return reply.status(400).send({ success: false, error: 'slidesData.slides 不是有效数组' })
    }

    try {
      const exportService = new ExportService()
      const buffer = await exportService.toPptx(slidesData)

      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      reply.header('Content-Disposition', safeContentDisposition(filename, 'pptx'))
      return reply.send(buffer)
    } catch (err) {
      app.log.error(err, 'PPTX 导出失败')
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })
}
