import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { ScannerService } from '../services/scanner/index.js'
import type { ApiResponse, ScanResult } from '@work-summary/shared'

// 存储扫描任务
const scanTasks = new Map<string, {
  status: 'running' | 'done' | 'error'
  result?: ScanResult
  error?: string
  listeners: Set<(data: string) => void>
}>()

export const scanRoutes: FastifyPluginAsync = async (app) => {
  // 启动扫描
  app.post<{
    Body: { folderPaths: string[]; gitAuthor?: string; startDate?: string; endDate?: string }
  }>('/start', async (request, reply) => {
    const { folderPaths, gitAuthor, startDate, endDate } = request.body

    if (!folderPaths || folderPaths.length === 0) {
      return reply.status(400).send({ success: false, error: '请提供至少一个文件夹路径' })
    }

    const taskId = uuidv4()
    const listeners = new Set<(data: string) => void>()

    scanTasks.set(taskId, { status: 'running', listeners })

    // 异步执行扫描（支持多路径）
    const scanner = new ScannerService()
    scanner.scanMultiple(folderPaths, { gitAuthor, startDate, endDate }, (event) => {
      // 通知所有 SSE 监听者
      const data = JSON.stringify(event)
      listeners.forEach((fn) => fn(data))
    }).then((result) => {
      const task = scanTasks.get(taskId)
      if (task) {
        task.status = 'done'
        task.result = result
        // 通知完成
        listeners.forEach((fn) => fn(JSON.stringify({ phase: 'done', progress: 100, current: '', found: { projects: result.projects.length, files: result.totalFiles } })))
      }
    }).catch((err) => {
      const task = scanTasks.get(taskId)
      if (task) {
        task.status = 'error'
        task.error = (err as Error).message
        listeners.forEach((fn) => fn(JSON.stringify({ phase: 'error', error: (err as Error).message })))
      }
    })

    const response: ApiResponse<{ taskId: string }> = {
      success: true,
      data: { taskId },
    }
    return reply.send(response)
  })

  // SSE 进度推送
  app.get<{
    Params: { taskId: string }
  }>('/progress/:taskId', async (request, reply) => {
    const { taskId } = request.params
    const task = scanTasks.get(taskId)

    if (!task) {
      return reply.status(404).send({ success: false, error: '任务不存在' })
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    const listener = (data: string) => {
      reply.raw.write(`data: ${data}\n\n`)
    }

    task.listeners.add(listener)

    // 如果任务已完成，立即发送结果
    if (task.status === 'done') {
      reply.raw.write(`data: ${JSON.stringify({ phase: 'done', progress: 100 })}\n\n`)
      reply.raw.end()
      return
    }

    // 连接关闭时清理
    request.raw.on('close', () => {
      task.listeners.delete(listener)
    })
  })

  // 获取扫描结果
  app.get<{
    Params: { taskId: string }
  }>('/result/:taskId', async (request, reply) => {
    const { taskId } = request.params
    const task = scanTasks.get(taskId)

    if (!task) {
      return reply.status(404).send({ success: false, error: '任务不存在' })
    }

    if (task.status === 'running') {
      return reply.send({ success: true, data: null, message: '扫描进行中' })
    }

    if (task.status === 'error') {
      return reply.status(500).send({ success: false, error: task.error })
    }

    const response: ApiResponse<ScanResult> = {
      success: true,
      data: task.result,
    }
    return reply.send(response)
  })
}
