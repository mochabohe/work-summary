import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import type { WorkItem } from '@work-summary/shared'

/**
 * Excel 工作项导入
 *
 * 固定列结构（首行为表头）：
 *   标题 | 分类 | 开始日期 | 结束日期 | 数据成果 | 详细说明 | 标签
 *
 * - 「数据成果」格式：`label1=value1; label2=value2`，按 `;` 分隔
 * - 「标签」格式：用 `,` 或 `、` 分隔
 * - 「日期」支持 Excel 日期序列号或文本（YYYY-MM-DD / YYYY/MM/DD）
 */
export class ExcelParser {
  /** 列别名映射（用户可能用同义词作为表头） */
  private static COLUMN_ALIASES: Record<string, keyof RawRow> = {
    '标题': 'title', '工作项': 'title', '事项': 'title', '名称': 'title',
    '分类': 'category', '类型': 'category', '类别': 'category',
    '开始日期': 'startDate', '开始时间': 'startDate', '起始日期': 'startDate', '开始': 'startDate',
    '结束日期': 'endDate', '结束时间': 'endDate', '截止日期': 'endDate', '结束': 'endDate',
    '日期': 'startDate',
    '数据成果': 'metrics', '指标': 'metrics', '成果': 'metrics', '量化': 'metrics',
    '详细说明': 'description', '说明': 'description', '描述': 'description', '详情': 'description', '内容': 'description',
    '标签': 'tags', 'tags': 'tags',
  }

  parseBuffer(buffer: Buffer): { items: WorkItem[]; skipped: number; errors: string[] } {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const firstSheetName = wb.SheetNames[0]
    if (!firstSheetName) {
      return { items: [], skipped: 0, errors: ['Excel 文件不包含任何工作表'] }
    }
    const sheet = wb.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    })

    const items: WorkItem[] = []
    const errors: string[] = []
    let skipped = 0

    rows.forEach((row, idx) => {
      const normalized = this.normalizeRow(row)
      if (!normalized.title?.trim()) {
        skipped++
        return
      }
      try {
        items.push(this.toWorkItem(normalized))
      } catch (err) {
        errors.push(`第 ${idx + 2} 行：${(err as Error).message}`)
        skipped++
      }
    })

    return { items, skipped, errors }
  }

  /** 把任意列名映射到标准 key */
  private normalizeRow(row: Record<string, unknown>): RawRow {
    const out: RawRow = {}
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.trim().toLowerCase()
      const standardKey = ExcelParser.COLUMN_ALIASES[key.trim()]
        ?? ExcelParser.COLUMN_ALIASES[normalizedKey]
      if (standardKey) {
        out[standardKey] = String(value ?? '').trim()
      }
    }
    return out
  }

  private toWorkItem(row: RawRow): WorkItem {
    const start = this.parseDate(row.startDate) ?? new Date().toISOString().slice(0, 10)
    const end = this.parseDate(row.endDate)

    const metrics = (row.metrics ?? '')
      .split(/[;；]/)
      .map(seg => seg.trim())
      .filter(Boolean)
      .map(seg => {
        const eq = seg.indexOf('=')
        const colon = seg.indexOf(':')
        const cn = seg.indexOf('：')
        const sep = [eq, colon, cn].filter(i => i > 0).sort((a, b) => a - b)[0]
        if (sep != null) {
          return { label: seg.slice(0, sep).trim(), value: seg.slice(sep + 1).trim() }
        }
        return { label: '指标', value: seg }
      })

    const tags = (row.tags ?? '')
      .split(/[,，、]/)
      .map(t => t.trim())
      .filter(Boolean)

    return {
      id: uuidv4(),
      source: 'manual',
      title: row.title!,
      category: row.category || undefined,
      date: { start, end },
      metrics: metrics.length > 0 ? metrics : undefined,
      description: row.description ?? '',
      tags: tags.length > 0 ? tags : undefined,
    }
  }

  /** 兼容多种日期格式：YYYY-MM-DD / YYYY/MM/DD / Excel cellDate(已被 cellDates:true 转字符串) */
  private parseDate(input?: string): string | undefined {
    if (!input) return undefined
    const s = input.trim()
    if (!s) return undefined
    // ISO 形式直接用
    const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (isoMatch) {
      const [, y, m, d] = isoMatch
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    const parsed = new Date(s)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
    return undefined
  }

  /** 生成 Excel 模板（含表头 + 一条示例行） */
  generateTemplate(): Buffer {
    const headers = ['标题', '分类', '开始日期', '结束日期', '数据成果', '详细说明', '标签']
    const example = [
      'Q2 渠道运营复盘',
      '运营',
      '2026-04-01',
      '2026-04-30',
      '转化率=12%; GMV=320万',
      '完成华南区 5 个新渠道接入，对接 3 家品牌方，转化率较 Q1 提升 3 个百分点',
      '渠道,运营,复盘',
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    // 设置列宽
    ws['!cols'] = [
      { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 30 }, { wch: 50 }, { wch: 16 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '工作项')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  }
}

interface RawRow {
  title?: string
  category?: string
  startDate?: string
  endDate?: string
  metrics?: string
  description?: string
  tags?: string
}
