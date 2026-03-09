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

/**
 * 基于内容的分类规则（按优先级排列）
 * 核心思路：不信任 commit 前缀，分析消息实际内容来判断工作类型
 * 规则按优先级从高到低排列，先匹配到的优先
 */
const CONTENT_RULES: { patterns: RegExp[]; category: keyof ContributionScore['breakdown']; weight: number }[] = [
  // bugFix：修复类关键词（优先级最高，避免 "feat: 修复xxx" 被误判为功能开发）
  {
    patterns: [
      /修复|修正|解决|fix|bug|缺陷|故障|异常|崩溃|闪退|白屏|报错|错误处理/i,
      /问题|兼容性|适配|回退|降级|hotfix|patch/i,
    ],
    category: 'bugFix',
    weight: 0.8,
  },
  // refactoring：重构/优化类
  {
    patterns: [
      /重构|refactor|优化|性能|提升|改进|迁移|升级|改造|拆分|抽取|封装/i,
      /perf|调整架构|代码整理|简化|精简|统一|规范化/i,
    ],
    category: 'refactoring',
    weight: 0.7,
  },
  // maintenance：维护类
  {
    patterns: [
      /文档|注释|doc|readme|changelog|样式调整|格式化|lint|eslint/i,
      /配置|config|依赖|升级版本|更新版本|merge|合并|chore|ci|cd|部署|发布|release/i,
      /测试|test|spec|删除|移除|清理|revert|回滚/i,
    ],
    category: 'maintenance',
    weight: 0.3,
  },
  // featureWork：新功能（放最后，作为默认分类）
  {
    patterns: [
      /新增|添加|实现|开发|新建|创建|接入|集成|支持|完成|搭建|引入/i,
      /功能|模块|页面|组件|接口|feature|add|implement|support/i,
    ],
    category: 'featureWork',
    weight: 1.0,
  },
]

/** 可信的 commit 前缀（只有这些非 feat 前缀才参考） */
const TRUSTED_PREFIXES: Record<string, { weight: number; category: keyof ContributionScore['breakdown'] }> = {
  fix: { weight: 0.8, category: 'bugFix' },
  hotfix: { weight: 0.8, category: 'bugFix' },
  bugfix: { weight: 0.8, category: 'bugFix' },
  refactor: { weight: 0.7, category: 'refactoring' },
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
 * 从 commit message 分析实际工作类型
 *
 * 策略：优先分析消息内容关键词，不信任 feat 前缀
 * 例如 "feat: 修复登录白屏" → bugFix（而非 featureWork）
 * 例如 "feat: 重构用户模块" → refactoring（而非 featureWork）
 */
function getCommitTypeInfo(message: string): { weight: number; category: keyof ContributionScore['breakdown'] } {
  // 去掉前缀部分，提取实际描述内容
  const body = message.replace(/^(\w+)(\(.+?\))?[!:]?\s*/, '')

  // 1. 优先用内容关键词匹配（遍历规则，先匹配到的优先级高）
  for (const rule of CONTENT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(body)) {
        return { weight: rule.weight, category: rule.category }
      }
    }
  }

  // 2. 内容无法判断时，参考非 feat 的可信前缀
  const prefixMatch = message.match(/^(\w+)/)
  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase()
    if (TRUSTED_PREFIXES[prefix]) {
      return TRUSTED_PREFIXES[prefix]
    }
  }

  // 3. 兜底：无法判断类型时归为功能开发
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
