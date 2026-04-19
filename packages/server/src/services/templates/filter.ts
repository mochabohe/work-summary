import type { ReportPeriod, ReportPeriodType, WorkItem } from '@work-summary/shared'

/**
 * 按日期窗筛选 WorkItem：只要工作项时间与周期有交集即入选
 */
export function filterWorkItemsByPeriod(
  items: WorkItem[],
  period: ReportPeriod,
): WorkItem[] {
  const start = toMs(period.start)
  const end = toMs(period.end)
  return items.filter(item => {
    const s = toMs(item.date.start)
    const e = item.date.end ? toMs(item.date.end) : s
    return e >= start && s <= end
  })
}

/**
 * 根据周期类型推导出默认日期范围（以 anchorDate 为基准）。
 *
 * - weekly: 以 anchor 所在周的周一~周日
 * - monthly: 以 anchor 所在月的 1 日~月末
 * - quarterly: 以 anchor 所在季度的首日~末日
 * - yearly: 以 anchor 所在自然年
 * - custom: anchor 当日作为 start+end
 */
export function derivePeriodRange(
  type: ReportPeriodType,
  anchorDate: Date = new Date(),
): { start: string; end: string; label: string } {
  const y = anchorDate.getFullYear()
  const m = anchorDate.getMonth()

  if (type === 'weekly') {
    const day = anchorDate.getDay() || 7 // 周日当 7
    const monday = new Date(anchorDate)
    monday.setHours(0, 0, 0, 0)
    monday.setDate(anchorDate.getDate() - (day - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const weekNum = getWeekNumber(anchorDate)
    return {
      start: toIso(monday),
      end: toIso(sunday),
      label: `${y}-W${String(weekNum).padStart(2, '0')}`,
    }
  }

  if (type === 'monthly') {
    const first = new Date(y, m, 1)
    const last = new Date(y, m + 1, 0)
    return {
      start: toIso(first),
      end: toIso(last),
      label: `${y}-${String(m + 1).padStart(2, '0')}`,
    }
  }

  if (type === 'quarterly') {
    const qIdx = Math.floor(m / 3)
    const first = new Date(y, qIdx * 3, 1)
    const last = new Date(y, qIdx * 3 + 3, 0)
    return {
      start: toIso(first),
      end: toIso(last),
      label: `${y}-Q${qIdx + 1}`,
    }
  }

  if (type === 'yearly') {
    return {
      start: `${y}-01-01`,
      end: `${y}-12-31`,
      label: String(y),
    }
  }

  // custom: 默认 anchor 单日
  return { start: toIso(anchorDate), end: toIso(anchorDate), label: '自定义' }
}

function toMs(iso: string): number {
  return new Date(iso).getTime()
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO 8601 周序号 */
function getWeekNumber(d: Date): number {
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  // 调到本周四（ISO 周以周四判归属年）
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
}
