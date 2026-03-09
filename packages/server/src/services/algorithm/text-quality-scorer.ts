/**
 * 文本质量评分模块
 *
 * 对 AI 生成的工作总结进行多维度质量评估：
 * 1. 信息密度（30分）：具体数据/技术术语占比
 * 2. 套话检测（25分）：空洞表述的比例
 * 3. 结构合理性（20分）：标题层次、段落均衡度
 * 4. 数据一致性（25分）：提到的数字是否有数据源佐证
 */

import type { GitStats } from '@work-summary/shared'

export interface TextQualityScore {
  /** 总分 0-100 */
  totalScore: number
  /** 各维度评分 */
  dimensions: {
    infoDensity: { score: number; detail: string }
    clicheRate: { score: number; detail: string; found: string[] }
    structure: { score: number; detail: string }
    dataConsistency: { score: number; detail: string }
  }
  /** 改进建议 */
  suggestions: string[]
}

/** 套话/空洞表述模式 */
const CLICHE_PATTERNS: { pattern: RegExp; label: string }[] = [
  // 时间套话
  { pattern: /时光飞逝/g, label: '时光飞逝' },
  { pattern: /转眼间/g, label: '转眼间' },
  { pattern: /不知不觉/g, label: '不知不觉' },
  { pattern: /弹指一挥间/g, label: '弹指一挥间' },
  { pattern: /岁月如梭/g, label: '岁月如梭' },
  { pattern: /日月如梭/g, label: '日月如梭' },
  // 展望套话
  { pattern: /展望未来/g, label: '展望未来' },
  { pattern: /砥砺前行/g, label: '砥砺前行' },
  { pattern: /再接再厉/g, label: '再接再厉' },
  { pattern: /百尺竿头/g, label: '百尺竿头' },
  { pattern: /更上一层楼/g, label: '更上一层楼' },
  { pattern: /继续努力/g, label: '继续努力' },
  // 自我评价套话
  { pattern: /受益匪浅/g, label: '受益匪浅' },
  { pattern: /收获颇丰/g, label: '收获颇丰' },
  { pattern: /感触良多/g, label: '感触良多' },
  { pattern: /深感荣幸/g, label: '深感荣幸' },
  { pattern: /倍感压力/g, label: '倍感压力' },
  // 空洞动词
  { pattern: /积极推进/g, label: '积极推进' },
  { pattern: /大力发展/g, label: '大力发展' },
  { pattern: /全面提升/g, label: '全面提升' },
  { pattern: /深入推进/g, label: '深入推进' },
  { pattern: /不断完善/g, label: '不断完善' },
  { pattern: /持续优化/g, label: '持续优化' },
  { pattern: /高度重视/g, label: '高度重视' },
  // 无意义修饰
  { pattern: /极大地/g, label: '极大地' },
  { pattern: /显著地/g, label: '显著地' },
  { pattern: /充分地/g, label: '充分地' },
  { pattern: /有效地/g, label: '有效地' },
  // 万能句式
  { pattern: /在.{2,6}方面取得了.{2,6}成绩/g, label: '万能句式' },
  { pattern: /为.{2,8}奠定了.{2,6}基础/g, label: '万能句式' },
  { pattern: /为.{2,8}做出了.{2,6}贡献/g, label: '万能句式' },
]

/** 技术术语（出现越多说明信息密度越高） */
const TECH_TERM_PATTERN = /\b(API|SDK|CI\/CD|Docker|K8s|Redis|MySQL|MongoDB|Webpack|Vite|Vue|React|Node\.js|TypeScript|GraphQL|REST|gRPC|WebSocket|SSR|SSG|JWT|OAuth|RBAC|CDN|Nginx|Git|Jenkins|GitHub|GitLab)\b/gi

/** 具体数字/百分比/时间模式 */
const SPECIFIC_DATA_PATTERN = /(\d+(\.\d+)?%|\d+(\.\d+)?\s*(ms|s|秒|分钟|小时|天|个|条|次|行|页|张|项|人|版本)|\d{4}[-/]\d{1,2}([-/]\d{1,2})?)/g

/**
 * 评估信息密度（满分30）
 */
function scoreInfoDensity(text: string): { score: number; detail: string } {
  const totalChars = text.replace(/\s/g, '').length
  if (totalChars === 0) return { score: 0, detail: '文本为空' }

  // 统计技术术语数量
  const techTerms = text.match(TECH_TERM_PATTERN) || []
  const techTermCount = new Set(techTerms.map((t) => t.toLowerCase())).size

  // 统计具体数据点数量
  const dataPoints = text.match(SPECIFIC_DATA_PATTERN) || []
  const dataPointCount = dataPoints.length

  // 每100字应有至少1个数据点和1个技术术语
  const per100 = totalChars / 100
  const techDensity = techTermCount / per100
  const dataDensity = dataPointCount / per100

  // 评分：技术术语密度（15分）+ 数据密度（15分）
  const techScore = Math.min(15, techDensity * 15)
  const dataScore = Math.min(15, dataDensity * 10)
  const score = Math.round(techScore + dataScore)

  const detail = `技术术语: ${techTermCount}个, 数据点: ${dataPointCount}个, 信息密度: ${(techDensity + dataDensity).toFixed(2)}/百字`
  return { score, detail }
}

/**
 * 评估套话比例（满分25）
 */
function scoreClicheRate(text: string): { score: number; detail: string; found: string[] } {
  const found: string[] = []
  let totalClicheChars = 0

  for (const { pattern, label } of CLICHE_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      if (!found.includes(label)) {
        found.push(label)
      }
      totalClicheChars += matches.reduce((sum, m) => sum + m.length, 0)
    }
  }

  const totalChars = text.replace(/\s/g, '').length
  if (totalChars === 0) return { score: 25, detail: '文本为空', found: [] }

  const clicheRatio = totalClicheChars / totalChars

  // 套话比例越低分越高
  // 0% → 25分, 5% → 15分, 10%+ → 0分
  const score = Math.max(0, Math.round(25 * (1 - clicheRatio / 0.1)))

  const detail = found.length > 0
    ? `发现 ${found.length} 种套话表述, 套话占比: ${(clicheRatio * 100).toFixed(1)}%`
    : '未发现套话表述'

  return { score, detail, found }
}

/**
 * 评估结构合理性（满分20）
 */
function scoreStructure(text: string): { score: number; detail: string } {
  const lines = text.split('\n').filter((l) => l.trim())

  // 统计二级标题数量
  const h2Count = lines.filter((l) => /^##\s+/.test(l) && !/^###/.test(l)).length
  // 统计三级标题数量
  const h3Count = lines.filter((l) => /^###\s+/.test(l)).length
  // 统计要点数量（有序/无序列表）
  const bulletCount = lines.filter((l) => /^\s*[-*]\s+|^\s*\d+\.\s+/.test(l)).length
  // 统计段落数量（非标题、非列表的文本行）
  const paraLines = lines.filter((l) =>
    l.trim().length > 10 && !/^#/.test(l) && !/^\s*[-*]\s+|^\s*\d+\.\s+/.test(l),
  ).length

  let score = 0
  const issues: string[] = []

  // 标题数量评分（8分）
  if (h2Count >= 3 && h2Count <= 8) {
    score += 8
  } else if (h2Count >= 2 && h2Count <= 10) {
    score += 5
  } else {
    issues.push(`二级标题数量(${h2Count})不在合理范围(3-8)`)
    score += 2
  }

  // 要点数量评分（6分）
  const avgBulletsPerSection = h2Count > 0 ? bulletCount / h2Count : 0
  if (avgBulletsPerSection >= 2 && avgBulletsPerSection <= 5) {
    score += 6
  } else if (avgBulletsPerSection >= 1) {
    score += 3
    issues.push(`平均每节要点数(${avgBulletsPerSection.toFixed(1)})偏少或偏多`)
  } else {
    issues.push('缺少要点列表')
  }

  // 内容均衡度评分（6分）
  if (h2Count > 1) {
    // 将文本按二级标题拆分，检查各段长度是否均衡
    const sections = text.split(/^##\s+/m).filter((s) => s.trim())
    if (sections.length > 1) {
      const sectionLengths = sections.map((s) => s.replace(/\s/g, '').length)
      const avg = sectionLengths.reduce((a, b) => a + b, 0) / sectionLengths.length
      const maxDeviation = Math.max(...sectionLengths.map((l) => Math.abs(l - avg) / avg))
      if (maxDeviation < 0.5) {
        score += 6
      } else if (maxDeviation < 1.0) {
        score += 4
      } else {
        score += 2
        issues.push('各章节长度不均衡')
      }
    } else {
      score += 4
    }
  } else {
    score += 2
  }

  const detail = issues.length > 0
    ? `${h2Count}个二级标题, ${bulletCount}个要点. 问题: ${issues.join('; ')}`
    : `${h2Count}个二级标题, ${bulletCount}个要点, 结构良好`

  return { score, detail }
}

/**
 * 评估数据一致性（满分25）
 * 检查总结中出现的数字是否能在原始 GitStats 中找到依据
 */
function scoreDataConsistency(
  text: string,
  gitStats?: GitStats,
): { score: number; detail: string } {
  if (!gitStats) {
    return { score: 15, detail: '无 Git 数据可用于一致性校验' }
  }

  // 从 GitStats 中提取可参考的数字
  const referenceNumbers = new Set<number>([
    gitStats.totalCommits,
    gitStats.linesAdded,
    gitStats.linesDeleted,
    gitStats.linesAdded + gitStats.linesDeleted,
  ])

  // 从文本中提取所有出现的数字
  const numbersInText = text.match(/\d+/g) || []
  const significantNumbers = numbersInText
    .map(Number)
    .filter((n) => n > 10) // 只关注大于10的数字（排除序号等）

  if (significantNumbers.length === 0) {
    return { score: 18, detail: '文本中未引用具体数字' }
  }

  // 检查文本中的数字有多少在参考数据中有依据
  let verifiable = 0
  let unverifiable = 0
  const suspiciousNumbers: number[] = []

  for (const num of significantNumbers) {
    // 检查是否与参考数据匹配（允许10%误差）
    let matched = false
    for (const ref of referenceNumbers) {
      if (ref > 0 && Math.abs(num - ref) / ref < 0.1) {
        matched = true
        break
      }
    }
    if (matched) {
      verifiable++
    } else {
      unverifiable++
      if (num > 100 && !suspiciousNumbers.includes(num)) {
        suspiciousNumbers.push(num)
      }
    }
  }

  const total = verifiable + unverifiable
  const verifiableRatio = total > 0 ? verifiable / total : 0

  // 评分：可验证数字占比越高越好
  let score = Math.round(25 * Math.min(1, verifiableRatio + 0.3))

  // 如果有可疑的大数字且完全不可验证，扣分
  if (suspiciousNumbers.length > 0 && verifiable === 0) {
    score = Math.max(0, score - 10)
  }

  const detail = `可验证数字: ${verifiable}/${total}` +
    (suspiciousNumbers.length > 0 ? `, 可疑数字: ${suspiciousNumbers.slice(0, 3).join(', ')}` : '')

  return { score, detail }
}

/**
 * 综合评估文本质量
 *
 * @param text AI 生成的总结文本（Markdown格式）
 * @param gitStats 原始 Git 统计数据（用于数据一致性校验）
 * @returns 质量评分结果
 */
export function scoreTextQuality(text: string, gitStats?: GitStats): TextQualityScore {
  const infoDensity = scoreInfoDensity(text)
  const clicheRate = scoreClicheRate(text)
  const structure = scoreStructure(text)
  const dataConsistency = scoreDataConsistency(text, gitStats)

  const totalScore = infoDensity.score + clicheRate.score + structure.score + dataConsistency.score

  // 生成改进建议
  const suggestions: string[] = []

  if (infoDensity.score < 15) {
    suggestions.push('建议增加更多具体的数据和技术术语，避免空泛描述')
  }
  if (clicheRate.found.length > 0) {
    suggestions.push(`建议替换套话表述：${clicheRate.found.slice(0, 3).join('、')}`)
  }
  if (structure.score < 12) {
    suggestions.push('建议优化文章结构，确保3-8个二级标题，每节2-4个要点')
  }
  if (dataConsistency.score < 15) {
    suggestions.push('建议引用可验证的数据（如提交次数、代码行数等），增强说服力')
  }

  return {
    totalScore,
    dimensions: {
      infoDensity,
      clicheRate,
      structure,
      dataConsistency,
    },
    suggestions,
  }
}
