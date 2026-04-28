import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { LLMService } from '../llm/index.js'
import type { WorkItem, ReportPeriod } from '@work-summary/shared'

/** LLM 输出 schema：要求模型严格按此结构 JSON 输出 */
const LlmItemSchema = z.object({
  title: z.string().min(1),
  category: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  metrics: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  description: z.string().default(''),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
})

const LlmResponseSchema = z.object({
  items: z.array(LlmItemSchema),
})

const SYSTEM_PROMPT = `你是工作总结助手。用户会给你一段从工作文档（周报/月报/会议纪要/Excel 表格）中提取的纯文本，
你的任务是把它结构化成「工作项数组」。

如果文本中包含 [[SHEET:xxx]] ... [[/SHEET]] 标签，那是 Excel 不同 sheet 的内容；
请把每个 sheet 看作一个独立子表，识别表头层级（合并单元格已展开为重复值），
按业务主题归并同类条目，不要每行都生成一条工作项。

严格输出 JSON，格式如下（不要任何额外文字、不要 markdown 代码块）：
{
  "items": [
    {
      "title": "工作项简短标题（必填，10-30 字）",
      "category": "分类，如 项目/活动/事务/学习（可选）",
      "start_date": "YYYY-MM-DD（可选，只在文中明确提到时填）",
      "end_date": "YYYY-MM-DD（可选）",
      "metrics": [{ "label": "转化率", "value": "12%" }],
      "description": "详细说明，2-3 句话总结（必填）",
      "tags": ["标签1", "标签2"],
      "confidence": 0.85
    }
  ]
}

## 抽取规则
1. 每个工作项应是一个独立、可量化、有明确产出的事项
2. confidence 表示你对抽取质量的把握（0-1）：信息完整且明确为 0.8+；只有标题缺细节为 0.4-0.6；推测出来的为 <0.4
3. description 必须是用户原文中存在的事实，不要凭空发挥
4. 如果文档信息不足以抽取出任何有意义的工作项，返回 { "items": [] }
5. 同一段落不要拆成多条；不同主题的内容要拆开
6. 表格类内容应聚合成 1-3 条工作项，不要逐行展开`

/** 单次 LLM 调用的输入字符上限：超过则切片 */
const CHUNK_CHAR_LIMIT = 80 * 1024

/** chunk 间并发上限：gpt-5.5 代理对并发较敏感，优先保证大 Excel 稳定抽取 */
const CHUNK_CONCURRENCY = 1

export interface ExtractProgress {
  /** 在切片数组里的序号 */
  index: number
  /** 总切片数 */
  total: number
  /** 当前切片抽到的工作项；解析失败时为空数组 */
  items: WorkItem[]
  /** 当前切片是否解析失败 */
  parseFailed: boolean
}

export interface ExtractOptions {
  /** 每个 chunk 完成时回调（用于流式进度） */
  onChunkDone?: (progress: ExtractProgress) => void
  /** 切片总数确定后立刻回调（在第一个 chunk 完成前） */
  onPlanReady?: (totalChunks: number) => void
}

export class WorkItemExtractor {
  private llm = new LLMService()

  async extract(text: string, period?: ReportPeriod, opts: ExtractOptions = {}): Promise<{
    items: WorkItem[]
    parseFailed: boolean
    rawResponse: string
    warning?: string
  }> {
    const chunks = this.chunkText(text)

    opts.onPlanReady?.(chunks.length)

    if (chunks.length === 1) {
      const result = await this.runOneSafely(chunks[0], period, 0, 1, opts)
      return result
    }

    // 多 chunk：并发跑（限流），单片上游失败不拖垮整体，最后按成功片的 items 合并去重
    const results = await this.runPool(chunks, CHUNK_CONCURRENCY, async (chunk, i) => {
      const hint = `（这是文档的第 ${i + 1}/${chunks.length} 部分，整体抽取请仅基于本部分内容）\n\n`
      return this.runOneSafely(hint + chunk, period, i, chunks.length, opts)
    })

    const allItems: WorkItem[] = []
    const allRaw: string[] = []
    let parseFailedCount = 0
    let upstreamFailedCount = 0

    for (const result of results) {
      allRaw.push(result.rawResponse)
      if (result.parseFailed) {
        parseFailedCount += 1
        if (result.upstreamError) upstreamFailedCount += 1
      } else {
        allItems.push(...result.items)
      }
    }

    const warning = this.buildWarning(chunks.length, parseFailedCount, upstreamFailedCount)

    if (allItems.length > 0) {
      return {
        items: this.dedupeByTitle(allItems),
        parseFailed: false,
        rawResponse: allRaw.join('\n---\n'),
        warning,
      }
    }

    return {
      items: [],
      parseFailed: parseFailedCount > 0,
      rawResponse: allRaw.join('\n---\n'),
      warning,
    }
  }

  /** 单片安全抽取：异常不抛出，降级为 parseFailed；onChunkDone 总会被调用推进进度 */
  private async runOneSafely(
    text: string,
    period: ReportPeriod | undefined,
    index: number,
    total: number,
    opts: ExtractOptions,
  ): Promise<{ items: WorkItem[]; parseFailed: boolean; rawResponse: string; upstreamError?: boolean }> {
    let result: { items: WorkItem[]; parseFailed: boolean; rawResponse: string; upstreamError?: boolean }
    try {
      result = await this.extractOne(text, period)
    } catch (err) {
      const message = (err as Error).message ?? String(err)
      result = {
        items: [],
        parseFailed: true,
        rawResponse: `[Chunk ${index + 1}/${total} upstream error] ${message}`,
        upstreamError: true,
      }
    }
    opts.onChunkDone?.({
      index,
      total,
      items: result.items,
      parseFailed: result.parseFailed,
    })
    return result
  }

  private buildWarning(total: number, parseFailed: number, upstream: number): string | undefined {
    if (parseFailed === 0) return undefined
    const parts: string[] = []
    if (upstream > 0) parts.push(`${upstream} 片上游返回错误`)
    const formatFailed = parseFailed - upstream
    if (formatFailed > 0) parts.push(`${formatFailed} 片 AI 返回格式异常`)
    return `共 ${total} 片，${parts.join('、')}（部分内容可能缺失）`
  }

  /** 简单的并发池：保留顺序，失败直接抛（调用侧内部已做 parseFailed 包裹，不会真的 throw） */
  private async runPool<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let cursor = 0
    const runners = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (true) {
          const i = cursor++
          if (i >= items.length) return
          results[i] = await worker(items[i], i)
        }
      },
    )
    await Promise.all(runners)
    return results
  }

  /** 单次 LLM 抽取 */
  private async extractOne(text: string, period?: ReportPeriod): Promise<{
    items: WorkItem[]
    parseFailed: boolean
    rawResponse: string
  }> {
    const userMsg = period
      ? `周期：${period.label}（${period.start} 到 ${period.end}）\n\n文档内容：\n${text}`
      : `文档内容：\n${text}`

    const raw = await this.llm.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ])

    const parsed = this.tryParseJson(raw)
    if (!parsed) {
      return { items: [], parseFailed: true, rawResponse: raw }
    }

    try {
      const validated = LlmResponseSchema.parse(parsed)
      const items: WorkItem[] = validated.items.map(item => ({
        id: uuidv4(),
        source: 'document',
        title: item.title,
        category: item.category,
        date: {
          start: item.start_date ?? period?.start ?? new Date().toISOString().slice(0, 10),
          end: item.end_date ?? period?.end,
        },
        metrics: item.metrics,
        description: item.description,
        tags: item.tags,
        confidence: item.confidence ?? 0.6,
      }))
      return { items, parseFailed: false, rawResponse: raw }
    } catch {
      return { items: [], parseFailed: true, rawResponse: raw }
    }
  }

  /**
   * 把超长文本按 [[SHEET:xxx]] 边界切片；
   * 单 sheet 仍超阈值时按字符强制截断，多 sheet 累计装填。
   */
  private chunkText(text: string): string[] {
    if (text.length <= CHUNK_CHAR_LIMIT) return [text]

    const blocks = this.splitBySheet(text)
    if (blocks.length <= 1) {
      return this.splitByChars(text, CHUNK_CHAR_LIMIT)
    }

    const chunks: string[] = []
    let buffer = ''

    for (const block of blocks) {
      if (block.length > CHUNK_CHAR_LIMIT) {
        if (buffer) {
          chunks.push(buffer)
          buffer = ''
        }
        chunks.push(...this.splitByChars(block, CHUNK_CHAR_LIMIT))
        continue
      }

      if ((buffer + '\n\n' + block).length > CHUNK_CHAR_LIMIT && buffer) {
        chunks.push(buffer)
        buffer = block
      } else {
        buffer = buffer ? buffer + '\n\n' + block : block
      }
    }

    if (buffer) chunks.push(buffer)
    return chunks
  }

  /** 按 [[SHEET:xxx]] ... [[/SHEET]] 边界切分；保留每段完整边界 */
  private splitBySheet(text: string): string[] {
    const re = /\[\[SHEET:[^\]]+\]\][\s\S]*?\[\[\/SHEET\]\]/g
    const matches = [...text.matchAll(re)]
    if (matches.length === 0) return [text]

    const parts: string[] = []
    let cursor = 0
    for (const m of matches) {
      const start = m.index ?? 0
      if (start > cursor) {
        const before = text.slice(cursor, start).trim()
        if (before) parts.push(before)
      }
      parts.push(m[0])
      cursor = start + m[0].length
    }
    if (cursor < text.length) {
      const tail = text.slice(cursor).trim()
      if (tail) parts.push(tail)
    }
    return parts
  }

  /** 字符硬切（按 \n 边界靠近） */
  private splitByChars(text: string, limit: number): string[] {
    const out: string[] = []
    let cursor = 0
    while (cursor < text.length) {
      const end = Math.min(cursor + limit, text.length)
      let cut = end
      if (end < text.length) {
        const lastNl = text.lastIndexOf('\n', end)
        if (lastNl > cursor + limit * 0.6) cut = lastNl
      }
      out.push(text.slice(cursor, cut))
      cursor = cut
    }
    return out
  }

  /** 按 title 去重，保留 confidence 最高的那一条 */
  private dedupeByTitle(items: WorkItem[]): WorkItem[] {
    const map = new Map<string, WorkItem>()
    for (const item of items) {
      const key = item.title.trim()
      const existing = map.get(key)
      if (!existing || (item.confidence ?? 0) > (existing.confidence ?? 0)) {
        map.set(key, item)
      }
    }
    return [...map.values()]
  }

  /**
   * 尝试解析 LLM 返回为 JSON：
   * 1. 去 markdown fence
   * 2. 直接 JSON.parse
   * 3. 失败则截取最外层 {...} 后再尝试
   */
  private tryParseJson(raw: string): unknown | null {
    const cleaned = this.stripFence(raw)

    try {
      return JSON.parse(cleaned)
    } catch { /* fall through */ }

    const sliced = this.extractFirstObject(cleaned)
    if (sliced) {
      try {
        return JSON.parse(sliced)
      } catch { /* fall through */ }
    }

    return null
  }

  private stripFence(raw: string): string {
    let s = raw.trim()
    if (s.startsWith('```json')) s = s.slice(7)
    else if (s.startsWith('```')) s = s.slice(3)
    if (s.endsWith('```')) s = s.slice(0, -3)
    return s.trim()
  }

  /** 从字符串中截取第一个完整的最外层 {...}（用栈匹配花括号，跳过字符串内部） */
  private extractFirstObject(s: string): string | null {
    const start = s.indexOf('{')
    if (start < 0) return null

    let depth = 0
    let inStr = false
    let escape = false

    for (let i = start; i < s.length; i++) {
      const ch = s[i]
      if (inStr) {
        if (escape) { escape = false; continue }
        if (ch === '\\') { escape = true; continue }
        if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') { inStr = true; continue }
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) return s.slice(start, i + 1)
      }
    }
    return null
  }
}
