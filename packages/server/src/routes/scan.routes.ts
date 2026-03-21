import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'
import path from 'path'
import { ScannerService } from '../services/scanner/index.js'
import type { ApiResponse, ScanResult } from '@work-summary/shared'

// 存储扫描任务
const scanTasks = new Map<string, {
  status: 'running' | 'done' | 'error'
  result?: ScanResult
  error?: string
  listeners: Set<(data: string) => void>
}>()

// ─── 扫描缓存 ─────────────────────────────────────────────────────────────────

interface ScanCacheEntry {
  mtimes: Record<string, number>  // folderPath -> mtime ms
  result: ScanResult
  savedAt: number
}

type ScanCache = Record<string, ScanCacheEntry>  // key = folderPaths.sort().join('|')

const CACHE_FILE = path.join(process.env.APP_DATA_PATH || '.', 'scan-cache.json')

async function loadCache(): Promise<ScanCache> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8')
    return JSON.parse(raw) as ScanCache
  } catch {
    return {}
  }
}

async function saveCache(cache: ScanCache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true })
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8')
  } catch {
    // 写入失败静默忽略
  }
}

async function getMtimes(folderPaths: string[]): Promise<Record<string, number>> {
  const mtimes: Record<string, number> = {}
  await Promise.all(
    folderPaths.map(async (p) => {
      try {
        const stat = await fs.stat(p)
        mtimes[p] = stat.mtimeMs
      } catch {
        mtimes[p] = 0
      }
    }),
  )
  return mtimes
}

function cacheKey(folderPaths: string[]): string {
  return [...folderPaths].sort().join('|')
}

async function checkCache(folderPaths: string[]): Promise<ScanCacheEntry | null> {
  const cache = await loadCache()
  const key = cacheKey(folderPaths)
  const entry = cache[key]
  if (!entry) return null

  const currentMtimes = await getMtimes(folderPaths)
  for (const p of folderPaths) {
    if (currentMtimes[p] !== entry.mtimes[p]) return null
  }
  return entry
}

// ─────────────────────────────────────────────────────────────────────────────

export const scanRoutes: FastifyPluginAsync = async (app) => {
  // 启动扫描
  app.post<{
    Body: { folderPaths: string[]; gitAuthor?: string; startDate?: string; endDate?: string; forceRescan?: boolean }
  }>('/start', async (request, reply) => {
    const { folderPaths, gitAuthor, startDate, endDate, forceRescan } = request.body

    if (!folderPaths || folderPaths.length === 0) {
      return reply.status(400).send({ success: false, error: '请提供至少一个文件夹路径' })
    }

    // 检查缓存（非强制刷新时）
    if (!forceRescan) {
      const cached = await checkCache(folderPaths)
      if (cached) {
        const taskId = uuidv4()
        scanTasks.set(taskId, { status: 'done', result: cached.result, listeners: new Set() })
        setTimeout(() => scanTasks.delete(taskId), 5 * 60 * 1000)
        return reply.send({
          success: true,
          data: { taskId, fromCache: true, savedAt: cached.savedAt },
        })
      }
    }

    const taskId = uuidv4()
    const listeners = new Set<(data: string) => void>()
    scanTasks.set(taskId, { status: 'running', listeners })

    // 异步执行扫描（支持多路径）
    const scanner = new ScannerService()
    scanner.scanMultiple(folderPaths, { gitAuthor, startDate, endDate }, (event) => {
      const data = JSON.stringify(event)
      listeners.forEach((fn) => fn(data))
    }).then(async (result) => {
      const task = scanTasks.get(taskId)
      if (task) {
        task.status = 'done'
        task.result = result
        listeners.forEach((fn) => fn(JSON.stringify({ phase: 'done', progress: 100, current: '', found: { projects: result.projects.length, files: result.totalFiles } })))
      }
      // 异步写入缓存（不阻塞响应）
      const cache = await loadCache()
      const mtimes = await getMtimes(folderPaths)
      cache[cacheKey(folderPaths)] = { mtimes, result, savedAt: Date.now() }
      saveCache(cache)
    }).catch((err) => {
      const task = scanTasks.get(taskId)
      if (task) {
        task.status = 'error'
        task.error = (err as Error).message
        listeners.forEach((fn) => fn(JSON.stringify({ phase: 'error', error: (err as Error).message })))
      }
    })

    return reply.send({ success: true, data: { taskId, fromCache: false } })
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

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const listener = (data: string) => {
      try {
        reply.raw.write(`data: ${data}\n\n`)
      } catch {
        // 连接已关闭，忽略写入错误
      }
    }

    task.listeners.add(listener)

    if (task.status === 'done') {
      reply.raw.write(`data: ${JSON.stringify({ phase: 'done', progress: 100 })}\n\n`)
      reply.raw.end()
      return
    }

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': heartbeat\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 15000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
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

    const response: ApiResponse<ScanResult> = { success: true, data: task.result }
    setTimeout(() => scanTasks.delete(taskId), 5 * 60 * 1000)
    return reply.send(response)
  })
}
