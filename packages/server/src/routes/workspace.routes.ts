import { FastifyPluginAsync } from 'fastify'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import type { ApiResponse, WorkItem, ReportPeriod, ReportPeriodType, AppMode, ReportTemplate } from '@work-summary/shared'
import { ParserService } from '../services/parser/index.js'
import { WorkItemExtractor } from '../services/workspace/extractor.js'
import { templateRegistry } from '../services/templates/registry.js'
import { derivePeriodRange } from '../services/templates/filter.js'

const SUPPORTED_TEXT_EXTS = ['.docx', '.pptx', '.pdf', '.md', '.txt', '.html', '.htm', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  const parser = new ParserService()
  const extractor = new WorkItemExtractor()

  /**
   * 上传文档 → 落到临时文件 → 调 parser → 返回纯文本
   * Multipart：字段名 file
   */
  app.post('/parse-document', async (request, reply) => {
    const file = await request.file()
    if (!file) {
      return reply.status(400).send({ success: false, error: '未收到文件' } as ApiResponse)
    }

    const ext = path.extname(file.filename).toLowerCase()
    if (!SUPPORTED_TEXT_EXTS.includes(ext)) {
      return reply.status(400).send({
        success: false,
        error: `不支持的文件类型 ${ext}，仅支持 ${SUPPORTED_TEXT_EXTS.join(', ')}`,
      } as ApiResponse)
    }

    const tempPath = path.join(os.tmpdir(), `ws-upload-${uuidv4()}${ext}`)
    try {
      const buffer = await file.toBuffer()
      await fs.writeFile(tempPath, buffer)

      const doc = await parser.parseFile(tempPath)
      if (!doc || !doc.content.trim()) {
        return reply.status(422).send({
          success: false,
          error: '文件解析后内容为空',
        } as ApiResponse)
      }

      const response: ApiResponse<{ filename: string; type: string; text: string }> = {
        success: true,
        data: { filename: file.filename, type: doc.type, text: doc.content },
      }
      return reply.send(response)
    } catch (err) {
      app.log.error(err, 'workspace parse-document failed')
      return reply.status(500).send({
        success: false,
        error: (err as Error).message,
      } as ApiResponse)
    } finally {
      await fs.unlink(tempPath).catch(() => undefined)
    }
  })

  /**
   * 文本 → LLM 抽取 WorkItem[]
   */
  app.post<{
    Body: { text: string; period?: ReportPeriod }
  }>('/extract-items', async (request, reply) => {
    const { text, period } = request.body
    if (!text || text.trim().length < 10) {
      return reply.status(400).send({
        success: false,
        error: '文本内容过短，无法抽取',
      } as ApiResponse)
    }

    try {
      const result = await extractor.extract(text, period)
      if (result.parseFailed) {
        return reply.status(200).send({
          success: false,
          error: 'AI 抽取结果格式错误，建议改用手动录入',
          data: { items: [], rawResponse: result.rawResponse.slice(0, 500) },
        } as ApiResponse<{ items: WorkItem[]; rawResponse: string }>)
      }
      const response: ApiResponse<{ items: WorkItem[] }> = {
        success: true,
        data: { items: result.items },
      }
      return reply.send(response)
    } catch (err) {
      app.log.error(err, 'workspace extract-items failed')
      return reply.status(500).send({
        success: false,
        error: (err as Error).message,
      } as ApiResponse)
    }
  })

  /**
   * 列出报告模板（按模式 + 周期过滤）
   */
  app.get<{
    Querystring: { mode?: AppMode; period?: ReportPeriodType }
  }>('/templates', async (request, reply) => {
    const { mode, period } = request.query
    const list = templateRegistry.listByMatch(mode, period)
    const response: ApiResponse<ReportTemplate[]> = { success: true, data: list }
    return reply.send(response)
  })

  /**
   * 推导周期默认日期范围
   */
  app.get<{
    Querystring: { type: ReportPeriodType; anchor?: string }
  }>('/period-range', async (request, reply) => {
    const { type, anchor } = request.query
    const anchorDate = anchor ? new Date(anchor) : new Date()
    const range = derivePeriodRange(type, anchorDate)
    const response: ApiResponse<{ type: ReportPeriodType } & typeof range> = {
      success: true,
      data: { type, ...range },
    }
    return reply.send(response)
  })
}
