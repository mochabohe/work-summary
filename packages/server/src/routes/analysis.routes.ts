import { FastifyPluginAsync } from 'fastify'
import { GitAnalyzer } from '../services/git/log-analyzer.js'
import { ParserService } from '../services/parser/index.js'
import { classifyCommits, scoreContribution, analyzeWorkPattern, extractHighlights } from '../services/algorithm/index.js'
import type { ApiResponse, ProjectAnalysis, AlgorithmInsights, Highlight } from '@work-summary/shared'

export const analysisRoutes: FastifyPluginAsync = async (app) => {
  // 分析单个项目
  app.post<{
    Body: { projectPath: string; gitAuthor?: string; startDate?: string; endDate?: string }
  }>('/project', async (request, reply) => {
    const { projectPath } = request.body
    const gitAuthor = request.body.gitAuthor || process.env.GIT_AUTHOR || ''
    const now = new Date()
    const since = request.body.startDate || `${now.getFullYear()}-01-01`
    const until = request.body.endDate || `${now.getFullYear() + 1}-01-01`

    try {
      const gitAnalyzer = new GitAnalyzer()
      const parser = new ParserService()

      // 并行执行 Git 分析和文档解析
      const [gitStats, documents, codeStructure] = await Promise.all([
        gitAnalyzer.analyze(projectPath, gitAuthor, since, until).catch(() => undefined),
        parser.parseDocuments(projectPath),
        parser.analyzeCodeStructure(projectPath),
      ])

      // 如果有 Git 数据，运行算法分析
      let algorithmInsights: AlgorithmInsights | undefined
      let highlights: Highlight[] | undefined
      if (gitStats) {
        const commitClusters = classifyCommits(gitStats.commitMessages)
        const contributionScore = scoreContribution(gitStats)
        const workPattern = analyzeWorkPattern(gitStats.commitTimeline)
        algorithmInsights = { commitClusters, contributionScore, workPattern }
        highlights = extractHighlights(gitStats, algorithmInsights)
      }

      const analysis: ProjectAnalysis = {
        project: {
          name: projectPath.split(/[\\/]/).pop() || 'unknown',
          path: projectPath,
          type: 'other',
          techStack: codeStructure.dependencies ? Object.keys(codeStructure.dependencies).slice(0, 10) : [],
          fileCount: 0,
          hasGit: !!gitStats,
        },
        gitStats,
        documents,
        codeStructure,
        algorithmInsights,
        highlights,
      }

      const response: ApiResponse<ProjectAnalysis> = { success: true, data: analysis }
      return reply.send(response)
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // 获取 Git 统计数据
  app.get<{
    Querystring: { path: string; author: string; since?: string; until?: string }
  }>('/git-stats', async (request, reply) => {
    const { path: repoPath, author, since, until } = request.query

    try {
      const gitAnalyzer = new GitAnalyzer()
      const sinceDate = since || `${new Date().getFullYear()}-01-01`
      const untilDate = until || `${new Date().getFullYear() + 1}-01-01`
      const stats = await gitAnalyzer.analyze(repoPath, author, sinceDate, untilDate)

      const response: ApiResponse = { success: true, data: stats }
      return reply.send(response)
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })
}
