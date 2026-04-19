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

const SYSTEM_PROMPT = `你是工作总结助手。用户会给你一段从工作文档（周报/月报/会议纪要）中提取的纯文本，
你的任务是把它结构化成「工作项数组」。

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
5. 同一段落不要拆成多条；不同主题的内容要拆开`

export class WorkItemExtractor {
  private llm = new LLMService()

  async extract(text: string, period?: ReportPeriod): Promise<{
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

    const cleaned = this.cleanJson(raw)

    try {
      const parsed = JSON.parse(cleaned)
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

  /** 清理 markdown 代码块包裹 */
  private cleanJson(raw: string): string {
    let s = raw.trim()
    if (s.startsWith('```json')) s = s.slice(7)
    else if (s.startsWith('```')) s = s.slice(3)
    if (s.endsWith('```')) s = s.slice(0, -3)
    return s.trim()
  }
}
