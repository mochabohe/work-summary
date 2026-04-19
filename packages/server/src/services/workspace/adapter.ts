import { v4 as uuidv4 } from 'uuid'
import type { ProjectAnalysis, WorkItem } from '@work-summary/shared'

/**
 * 把研发模式的 ProjectAnalysis 转换成统一的 WorkItem 列表
 *
 * Phase 3 才会真正在 generate 路径里使用；当前 Phase 2 提供 API 但不强制切换。
 */
export function projectAnalysisToWorkItems(p: ProjectAnalysis): WorkItem[] {
  const items: WorkItem[] = []

  // 把每个项目作为一条 WorkItem
  const startDate = p.gitStats?.firstCommitDate
    ?? new Date().toISOString().slice(0, 10)
  const endDate = p.gitStats?.lastCommitDate
    ?? new Date().toISOString().slice(0, 10)

  const metrics: { label: string; value: string }[] = []
  if (p.gitStats) {
    metrics.push({ label: '提交数', value: String(p.gitStats.totalCommits) })
    metrics.push({ label: '新增行', value: String(p.gitStats.linesAdded) })
    metrics.push({ label: '删除行', value: String(p.gitStats.linesDeleted) })
  }

  // 把高优先级 highlight 提到 description 里
  const highlightLines = (p.highlights ?? [])
    .filter(h => h.priority === 'high')
    .slice(0, 3)
    .map(h => `- ${h.title}：${h.description}`)
    .join('\n')

  const description = [
    p.project.description ?? `${p.project.type} 项目，技术栈：${p.project.techStack.join(', ')}`,
    highlightLines,
  ].filter(Boolean).join('\n\n')

  items.push({
    id: uuidv4(),
    source: 'git',
    title: p.project.name,
    category: '研发项目',
    date: { start: startDate, end: endDate },
    metrics: metrics.length > 0 ? metrics : undefined,
    description,
    tags: p.project.techStack.slice(0, 5),
    raw: { project: p.project.name },
  })

  return items
}
