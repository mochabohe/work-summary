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
   *
   * 走 SSE 流式：
   *   data: {"type":"plan","totalChunks":N}
   *   data: {"type":"chunk_done","index":i,"total":N,"count":k,"parseFailed":false}
   *   data: {"type":"done","items":[...],"parseFailed":false}
   *   data: {"type":"error","message":"..."}
   *
   * 客户端按 \n\n 切事件，每条事件取 data: 后的 JSON 解析。
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

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'identity',
    })
    reply.hijack()
    // 立刻发一条 SSE 注释强制 flush 响应头 + 首块，避免被浏览器 / 代理 buffer 住首 256 字节
    reply.raw.write(': stream-open\n\n')

    const send = (payload: unknown) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
      } catch (err) {
        app.log.warn(err, 'workspace extract-items SSE write failed')
      }
    }

    try {
      const result = await extractor.extract(text, period, {
        onPlanReady: (totalChunks) => {
          send({ type: 'plan', totalChunks })
        },
        onChunkDone: (progress) => {
          send({
            type: 'chunk_done',
            index: progress.index,
            total: progress.total,
            count: progress.items.length,
            items: progress.items,
            parseFailed: progress.parseFailed,
          })
        },
      })

      if (result.parseFailed) {
        send({
          type: 'done',
          items: [],
          parseFailed: true,
          rawResponse: result.rawResponse.slice(0, 500),
          warning: result.warning,
        })
      } else {
        send({
          type: 'done',
          items: result.items,
          parseFailed: false,
          warning: result.warning,
        })
      }
    } catch (err) {
      app.log.error(err, 'workspace extract-items failed')
      send({ type: 'error', message: (err as Error).message })
    } finally {
      try {
        reply.raw.end()
      } catch { /* noop */ }
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
