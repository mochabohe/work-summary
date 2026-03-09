/**
 * 贡献度评估模型
 *
 * 基于文件类型权重、变更类型权重和代码行数的加权评分算法。
 * 对数缩放避免大量行数变更过度影响评分。
 */

import type { GitStats } from '@work-summary/shared'

export interface ContributionScore {
  /** 总分（0-100 归一化） */
  totalScore: number
  /** 工作类型占比分解 */
  breakdown: {
    featureWork: number
    bugFix: number
    refactoring: number
    maintenance: number
  }
  /** 贡献最大的领域 */
  topContributions: { area: string; score: number }[]
  /** 代码翻转率 = deleted / (added + deleted) */
  codeChurnRate: number
}

/** 文件类型权重映射 */
const FILE_TYPE_WEIGHTS: { pattern: RegExp; weight: number; label: string }[] = [
  // 自动生成文件（最低权重）
  { pattern: /\.(lock|d\.ts)$|package-lock|yarn\.lock|pnpm-lock/i, weight: 0.05, label: '自动生成' },
  // 文档
  { pattern: /\.(md|txt|rst)$/i, weight: 0.2, label: '文档' },
  // 配置文件
  { pattern: /\.(json|yaml|yml|toml|ini|env)$|\.config\./i, weight: 0.3, label: '配置文件' },
  // 样式文件
  { pattern: /\.(css|scss|sass|less|styl)$/i, weight: 0.4, label: '样式' },
  // 测试文件
  { pattern: /\.(test|spec|e2e)\.(ts|js|tsx|jsx)$/i, weight: 0.6, label: '测试' },
  // 核心业务代码（最高权重）
  { pattern: /\.(ts|js|vue|tsx|jsx|py|go|rs|java|kt|swift|rb|php|c|cpp|h)$/i, weight: 1.0, label: '核心代码' },
]

/** Commit 类型权重 */
const COMMIT_TYPE_WEIGHTS: Record<string, { weight: number; category: keyof ContributionScore['breakdown'] }> = {
  feat: { weight: 1.0, category: 'featureWork' },
  feature: { weight: 1.0, category: 'featureWork' },
  add: { weight: 0.9, category: 'featureWork' },
  perf: { weight: 0.9, category: 'featureWork' },
  fix: { weight: 0.8, category: 'bugFix' },
  hotfix: { weight: 0.8, category: 'bugFix' },
  bugfix: { weight: 0.8, category: 'bugFix' },
  refactor: { weight: 0.7, category: 'refactoring' },
  optimize: { weight: 0.7, category: 'refactoring' },
  style: { weight: 0.3, category: 'maintenance' },
  docs: { weight: 0.3, category: 'maintenance' },
  chore: { weight: 0.3, category: 'maintenance' },
  build: { weight: 0.3, category: 'maintenance' },
  ci: { weight: 0.3, category: 'maintenance' },
  test: { weight: 0.5, category: 'maintenance' },
  revert: { weight: 0.2, category: 'maintenance' },
}

/**
 * 获取文件的类型权重
 */
function getFileWeight(filePath: string): { weight: number; label: string } {
  for (const { pattern, weight, label } of FILE_TYPE_WEIGHTS) {
    if (pattern.test(filePath)) {
      return { weight, label }
    }
  }
  return { weight: 0.5, label: '其他' }
}

/**
 * 从 commit message 提取类型和对应权重
 */
function getCommitTypeInfo(message: string): { weight: number; category: keyof ContributionScore['breakdown'] } {
  const match = message.match(/^(\w+)/)
  if (match) {
    const type = match[1].toLowerCase()
    if (COMMIT_TYPE_WEIGHTS[type]) {
      return COMMIT_TYPE_WEIGHTS[type]
    }
  }

  // 尝试中文关键词匹配
  if (/新增|添加|实现|开发/.test(message)) return { weight: 0.9, category: 'featureWork' }
  if (/修复|修正|解决|bug/i.test(message)) return { weight: 0.8, category: 'bugFix' }
  if (/重构|优化|调整|改进/.test(message)) return { weight: 0.7, category: 'refactoring' }
  if (/文档|注释|样式|格式/.test(message)) return { weight: 0.3, category: 'maintenance' }

  return { weight: 0.5, category: 'featureWork' }
}

/**
 * 评估贡献度
 *
 * @param gitStats Git 统计数据
 * @returns 贡献度评分结果
 */
export function scoreContribution(gitStats: GitStats): ContributionScore {
  const { commitMessages, topFiles, linesAdded, linesDeleted } = gitStats

  // 1. 计算代码翻转率
  const totalLines = linesAdded + linesDeleted
  const codeChurnRate = totalLines > 0 ? linesDeleted / totalLines : 0

  // 2. 按 commit 类型统计
  const categoryScores: Record<keyof ContributionScore['breakdown'], number> = {
    featureWork: 0,
    bugFix: 0,
    refactoring: 0,
    maintenance: 0,
  }
  let totalCommitWeight = 0

  for (const msg of commitMessages) {
    const { weight, category } = getCommitTypeInfo(msg)
    categoryScores[category] += weight
    totalCommitWeight += weight
  }

  // 归一化为百分比
  const breakdown: ContributionScore['breakdown'] = {
    featureWork: 0,
    bugFix: 0,
    refactoring: 0,
    maintenance: 0,
  }
  if (totalCommitWeight > 0) {
    for (const key of Object.keys(categoryScores) as (keyof typeof categoryScores)[]) {
      breakdown[key] = Math.round((categoryScores[key] / totalCommitWeight) * 100)
    }
  }

  // 3. 按文件类型计算贡献得分
  const areaScores = new Map<string, number>()
  let totalFileScore = 0

  for (const { file, changes } of topFiles) {
    const { weight, label } = getFileWeight(file)
    const lineScore = Math.log2(changes + 1) // 对数缩放
    const score = weight * lineScore
    totalFileScore += score
    areaScores.set(label, (areaScores.get(label) || 0) + score)
  }

  // 4. 计算总分（综合多个维度）
  // 提交数量分（满分30）：log缩放，50次提交约得满分
  const commitCountScore = Math.min(30, Math.log2(commitMessages.length + 1) / Math.log2(51) * 30)

  // 代码量分（满分30）：log缩放，5000行约得满分
  const codeVolumeScore = Math.min(30, Math.log2(totalLines + 1) / Math.log2(5001) * 30)

  // 代码质量分（满分20）：基于文件类型权重
  const avgFileWeight = topFiles.length > 0
    ? topFiles.reduce((sum, f) => sum + getFileWeight(f.file).weight, 0) / topFiles.length
    : 0.5
  const codeQualityScore = avgFileWeight * 20

  // 工作多样性分（满分20）：涉及的工作类型越多越好
  const activeCategories = Object.values(breakdown).filter((v) => v > 5).length
  const diversityScore = (activeCategories / 4) * 20

  const totalScore = Math.round(
    Math.min(100, commitCountScore + codeVolumeScore + codeQualityScore + diversityScore),
  )

  // 5. 构建贡献最大的领域
  const topContributions = Array.from(areaScores.entries())
    .map(([area, score]) => ({
      area,
      score: Math.round((score / Math.max(totalFileScore, 1)) * 100),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return {
    totalScore,
    breakdown,
    topContributions,
    codeChurnRate: Math.round(codeChurnRate * 100) / 100,
  }
}
