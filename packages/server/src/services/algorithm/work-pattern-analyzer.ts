/**
 * 工作模式识别模块
 *
 * 基于 commitTimeline 的滑动窗口时间序列分析：
 * 1. 填充缺失日期，构建完整时间序列
 * 2. 计算7天移动平均
 * 3. 基于阈值识别冲刺期/稳定期/低谷期
 * 4. 合并相邻同类阶段，避免碎片化
 * 5. 计算连续提交天数等统计特征
 */

export interface WorkPatternPhase {
  /** 阶段类型 */
  type: 'sprint' | 'steady' | 'low'
  /** 阶段开始日期 */
  startDate: string
  /** 阶段结束日期 */
  endDate: string
  /** 该阶段总提交数 */
  totalCommits: number
  /** 日均提交数 */
  avgDailyCommits: number
  /** 峰值日期 */
  peakDate: string
  /** 峰值提交数 */
  peakCount: number
}

export interface WorkPattern {
  /** 工作阶段列表 */
  phases: WorkPatternPhase[]
  /** 整体统计摘要 */
  summary: {
    /** 总天数（首次提交到最后提交的跨度） */
    totalDays: number
    /** 有提交的天数 */
    activeDays: number
    /** 整体日均提交数 */
    avgDailyCommits: number
    /** 提交最多的日期 */
    mostProductiveDay: string
    /** 最长连续提交天数 */
    longestStreak: number
  }
}

/**
 * 解析日期字符串为时间戳（毫秒）
 */
function parseDate(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getTime()
}

/**
 * 时间戳转日期字符串 YYYY-MM-DD
 */
function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 填充缺失日期，构建完整的日提交时间序列
 */
function buildDailySeries(
  timeline: { date: string; count: number }[],
): { date: string; count: number }[] {
  if (timeline.length === 0) return []

  const sorted = [...timeline].sort((a, b) => a.date.localeCompare(b.date))
  const countMap = new Map<string, number>()
  for (const { date, count } of sorted) {
    countMap.set(date, (countMap.get(date) || 0) + count)
  }

  const startTs = parseDate(sorted[0].date)
  const endTs = parseDate(sorted[sorted.length - 1].date)
  const oneDay = 24 * 60 * 60 * 1000

  const series: { date: string; count: number }[] = []
  for (let ts = startTs; ts <= endTs; ts += oneDay) {
    const dateStr = formatDate(ts)
    series.push({ date: dateStr, count: countMap.get(dateStr) || 0 })
  }

  return series
}

/**
 * 计算7天滑动窗口移动平均
 */
function movingAverage(
  series: { date: string; count: number }[],
  windowSize: number = 7,
): { date: string; avg: number; count: number }[] {
  const result: { date: string; avg: number; count: number }[] = []

  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2))
    const end = Math.min(series.length, i + Math.ceil(windowSize / 2))
    let sum = 0
    for (let j = start; j < end; j++) {
      sum += series[j].count
    }
    result.push({
      date: series[i].date,
      avg: sum / (end - start),
      count: series[i].count,
    })
  }

  return result
}

/**
 * 基于移动平均和阈值分类每天的工作模式
 */
function classifyDays(
  maData: { date: string; avg: number; count: number }[],
  overallAvg: number,
): { date: string; type: WorkPatternPhase['type']; count: number }[] {
  const sprintThreshold = overallAvg * 1.5
  const lowThreshold = overallAvg * 0.5

  return maData.map(({ date, avg, count }) => {
    let type: WorkPatternPhase['type']
    if (avg >= sprintThreshold) {
      type = 'sprint'
    } else if (avg <= lowThreshold) {
      type = 'low'
    } else {
      type = 'steady'
    }
    return { date, type, count }
  })
}

/**
 * 合并相邻同类阶段
 */
function mergePhases(
  classified: { date: string; type: WorkPatternPhase['type']; count: number }[],
): WorkPatternPhase[] {
  if (classified.length === 0) return []

  const phases: WorkPatternPhase[] = []
  let currentType = classified[0].type
  let startDate = classified[0].date
  let totalCommits = classified[0].count
  let peakDate = classified[0].date
  let peakCount = classified[0].count
  let dayCount = 1

  for (let i = 1; i < classified.length; i++) {
    const item = classified[i]

    if (item.type === currentType) {
      // 同类阶段，继续合并
      totalCommits += item.count
      dayCount++
      if (item.count > peakCount) {
        peakCount = item.count
        peakDate = item.date
      }
    } else {
      // 类型变化，保存当前阶段
      phases.push({
        type: currentType,
        startDate,
        endDate: classified[i - 1].date,
        totalCommits,
        avgDailyCommits: Math.round((totalCommits / dayCount) * 100) / 100,
        peakDate,
        peakCount,
      })
      // 开始新阶段
      currentType = item.type
      startDate = item.date
      totalCommits = item.count
      peakDate = item.date
      peakCount = item.count
      dayCount = 1
    }
  }

  // 保存最后一个阶段
  phases.push({
    type: currentType,
    startDate,
    endDate: classified[classified.length - 1].date,
    totalCommits,
    avgDailyCommits: Math.round((totalCommits / dayCount) * 100) / 100,
    peakDate,
    peakCount,
  })

  return phases
}

/**
 * 合并过短的阶段（少于3天的阶段合并到相邻阶段）
 */
function mergeShortPhases(phases: WorkPatternPhase[]): WorkPatternPhase[] {
  if (phases.length <= 1) return phases

  const result: WorkPatternPhase[] = [phases[0]]

  for (let i = 1; i < phases.length; i++) {
    const current = phases[i]
    const prev = result[result.length - 1]
    const days = (parseDate(current.endDate) - parseDate(current.startDate)) / (24 * 60 * 60 * 1000) + 1

    if (days < 3) {
      // 短阶段合并到前一个阶段
      prev.endDate = current.endDate
      prev.totalCommits += current.totalCommits
      const totalDays = (parseDate(prev.endDate) - parseDate(prev.startDate)) / (24 * 60 * 60 * 1000) + 1
      prev.avgDailyCommits = Math.round((prev.totalCommits / totalDays) * 100) / 100
      if (current.peakCount > prev.peakCount) {
        prev.peakCount = current.peakCount
        prev.peakDate = current.peakDate
      }
    } else {
      result.push(current)
    }
  }

  return result
}

/**
 * 计算最长连续提交天数
 */
function calculateLongestStreak(series: { date: string; count: number }[]): number {
  let maxStreak = 0
  let currentStreak = 0

  for (const { count } of series) {
    if (count > 0) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  return maxStreak
}

/**
 * 分析工作模式
 *
 * @param commitTimeline 提交时间线（日期 + 提交数）
 * @returns 工作模式分析结果
 */
export function analyzeWorkPattern(
  commitTimeline: { date: string; count: number }[],
): WorkPattern {
  if (commitTimeline.length === 0) {
    return {
      phases: [],
      summary: {
        totalDays: 0,
        activeDays: 0,
        avgDailyCommits: 0,
        mostProductiveDay: '',
        longestStreak: 0,
      },
    }
  }

  // 1. 构建完整的日提交序列
  const dailySeries = buildDailySeries(commitTimeline)

  // 2. 计算基本统计量
  const activeDays = dailySeries.filter((d) => d.count > 0).length
  const totalCommits = dailySeries.reduce((sum, d) => sum + d.count, 0)
  const totalDays = dailySeries.length
  const overallAvg = totalDays > 0 ? totalCommits / totalDays : 0

  // 找到提交最多的日期
  let mostProductiveDay = dailySeries[0]?.date || ''
  let maxDayCount = 0
  for (const { date, count } of dailySeries) {
    if (count > maxDayCount) {
      maxDayCount = count
      mostProductiveDay = date
    }
  }

  // 3. 计算移动平均
  const maData = movingAverage(dailySeries)

  // 4. 分类每天的工作模式
  const classified = classifyDays(maData, overallAvg)

  // 5. 合并同类阶段
  let phases = mergePhases(classified)

  // 6. 合并过短的阶段
  phases = mergeShortPhases(phases)

  // 7. 计算最长连续提交天数
  const longestStreak = calculateLongestStreak(dailySeries)

  return {
    phases,
    summary: {
      totalDays,
      activeDays,
      avgDailyCommits: Math.round(overallAvg * 100) / 100,
      mostProductiveDay,
      longestStreak,
    },
  }
}
