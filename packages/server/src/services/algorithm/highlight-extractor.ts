import type { GitStats, AlgorithmInsights, Highlight } from '@work-summary/shared'

/**
 * 根据 Git 统计和算法洞察，自动识别工作亮点
 */
export function extractHighlights(
  gitStats: GitStats,
  insights: AlgorithmInsights,
): Highlight[] {
  const highlights: Highlight[] = []
  const { contributionScore, workPattern, commitClusters } = insights

  // 高频提交 (productivity)
  if (gitStats.totalCommits >= 30) {
    highlights.push({
      type: 'productivity',
      title: '高频提交',
      description: '提交次数显著，开发节奏稳定',
      metric: `${gitStats.totalCommits} commits`,
      priority: gitStats.totalCommits >= 60 ? 'high' : 'medium',
    })
  } else if (gitStats.totalCommits >= 15) {
    highlights.push({
      type: 'productivity',
      title: '持续输出',
      description: '保持稳定的代码提交频率',
      metric: `${gitStats.totalCommits} commits`,
      priority: 'low',
    })
  }

  // 大规模代码贡献 (feature)
  if (gitStats.linesAdded >= 3000) {
    highlights.push({
      type: 'feature',
      title: '大规模代码贡献',
      description: '新增代码量大，核心功能开发',
      metric: `+${gitStats.linesAdded.toLocaleString()} 行`,
      priority: gitStats.linesAdded >= 8000 ? 'high' : 'medium',
    })
  }

  // 质量把关 (quality) - bugFix 占比高
  const bugFixRatio = contributionScore.breakdown.bugFix
  if (bugFixRatio >= 0.25) {
    highlights.push({
      type: 'quality',
      title: '质量把关',
      description: 'Bug 修复占比高，主动维护代码质量',
      metric: `${Math.round(bugFixRatio * 100)}% bug fix`,
      priority: bugFixRatio >= 0.4 ? 'high' : 'medium',
    })
  }

  // 技术重构优化 (optimization)
  const refactorRatio = contributionScore.breakdown.refactoring
  if (refactorRatio >= 0.2) {
    highlights.push({
      type: 'optimization',
      title: '技术重构优化',
      description: '重构/优化占比高，提升代码可维护性',
      metric: `${Math.round(refactorRatio * 100)}% refactor`,
      priority: refactorRatio >= 0.35 ? 'high' : 'medium',
    })
  }

  // 冲刺完成 (sprint) - 有 sprint 阶段
  const sprintPhases = workPattern.phases.filter(p => p.type === 'sprint')
  if (sprintPhases.length > 0) {
    const maxSprint = sprintPhases.reduce((a, b) =>
      a.avgDailyCommits > b.avgDailyCommits ? a : b,
    )
    highlights.push({
      type: 'sprint',
      title: '高强度冲刺',
      description: `在 ${maxSprint.startDate} 至 ${maxSprint.endDate} 期间保持高频输出`,
      metric: `峰值 ${maxSprint.peakCount} commits/天`,
      priority: maxSprint.avgDailyCommits >= 5 ? 'high' : 'medium',
    })
  }

  // 持续稳定输出 (productivity) - longestStreak
  const { longestStreak } = workPattern.summary
  if (longestStreak >= 7) {
    highlights.push({
      type: 'productivity',
      title: '持续稳定输出',
      description: '连续多天保持提交记录，工作状态稳定',
      metric: `连续 ${longestStreak} 天`,
      priority: longestStreak >= 14 ? 'high' : 'medium',
    })
  }

  // 深耕核心领域 (domain) - 某个 cluster 超 30% 总提交
  if (commitClusters.length > 0) {
    const topCluster = commitClusters[0]
    const clusterRatio = topCluster.count / gitStats.totalCommits
    if (clusterRatio >= 0.3 && topCluster.count >= 8) {
      highlights.push({
        type: 'domain',
        title: '深耕核心领域',
        description: `"${topCluster.category}" 方向集中度高`,
        metric: `${topCluster.count} commits (${Math.round(clusterRatio * 100)}%)`,
        priority: clusterRatio >= 0.5 ? 'high' : 'medium',
      })
    }
  }

  // 综合贡献优秀 (feature) - totalScore 高
  if (contributionScore.totalScore >= 75) {
    highlights.push({
      type: 'feature',
      title: '综合贡献突出',
      description: '在提交数量、代码量和质量上均有良好表现',
      metric: `评分 ${Math.round(contributionScore.totalScore)}/100`,
      priority: contributionScore.totalScore >= 88 ? 'high' : 'medium',
    })
  }

  // 按优先级排序：high > medium > low
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  return highlights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}
