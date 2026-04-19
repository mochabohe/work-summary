import { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'
import path from 'path'
import type { ApiResponse } from '@work-summary/shared'

export interface HistoryEntry {
  id: string
  title: string
  content: string
  createdAt: string
  metadata: {
    docType: string
    gitAuthor: string
    dateRange: string
    projects: string[]
    /** Phase 3+ 新增：生成时的模式（研发 / 通用） */
    mode?: 'developer' | 'general'
    /** Phase 3+ 新增：报告周期类型 */
    periodType?: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
    /** Phase 3+ 新增：模板 id */
    templateId?: string
  }
}

const HISTORY_FILE = path.join(process.env.APP_DATA_PATH || '.', 'history.json')
const MAX_HISTORY = 50

async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf-8')
    return JSON.parse(raw) as HistoryEntry[]
  } catch {
    return []
  }
}

async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true })
  await fs.writeFile(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf-8')
}

export const historyRoutes: FastifyPluginAsync = async (app) => {
  // 获取历史列表（不含 content）
  app.get('/', async (_request, reply) => {
    const entries = await loadHistory()
    const list = entries.map(({ id, title, createdAt, metadata }) => ({ id, title, createdAt, metadata }))
    return reply.send({ success: true, data: list } as ApiResponse<typeof list>)
  })

  // 保存新历史
  app.post<{ Body: Omit<HistoryEntry, 'id' | 'createdAt'> }>('/', async (request, reply) => {
    const { title, content, metadata } = request.body
    const entries = await loadHistory()

    const newEntry: HistoryEntry = {
      id: uuidv4(),
      title,
      content,
      createdAt: new Date().toISOString(),
      metadata,
    }

    // 最多保留 MAX_HISTORY 条，超出删最旧的
    const updated = [newEntry, ...entries].slice(0, MAX_HISTORY)
    await saveHistory(updated)

    return reply.send({ success: true, data: { id: newEntry.id } } as ApiResponse<{ id: string }>)
  })

  // 获取单条历史（含 content）
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const entries = await loadHistory()
    const entry = entries.find(e => e.id === request.params.id)
    if (!entry) return reply.status(404).send({ success: false, error: '历史记录不存在' })
    return reply.send({ success: true, data: entry } as ApiResponse<HistoryEntry>)
  })

  // 删除历史
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const entries = await loadHistory()
    const updated = entries.filter(e => e.id !== request.params.id)
    await saveHistory(updated)
    return reply.send({ success: true } as ApiResponse<null>)
  })
}
