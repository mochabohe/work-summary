import simpleGit, { SimpleGit, DefaultLogFields, LogResult, ListLogLine } from 'simple-git'
import type { GitStats } from '@work-summary/shared'

type LogEntry = DefaultLogFields & ListLogLine

export class GitAnalyzer {
  /**
   * 分析指定项目的 Git 贡献
   * @param repoPath 仓库路径
   * @param author Git 用户名（用于过滤个人贡献）
   * @param since 开始日期（YYYY-MM-DD）
   * @param until 结束日期（YYYY-MM-DD）
   */
  async analyze(repoPath: string, author: string, since: string, until: string): Promise<GitStats> {
    const git: SimpleGit = simpleGit(repoPath)

    // 检查是否是 git 仓库
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      throw new Error(`${repoPath} 不是一个 Git 仓库`)
    }

    // 构建 author 过滤参数（如果为空则不过滤）
    const authorArgs: Record<string, string | null> = {}
    if (author) {
      authorArgs['--author'] = author
    }

    // 获取提交日志
    const log = await git.log({
      ...authorArgs,
      '--since': since,
      '--until': until,
      '--all': null,
    })

    // 精确过滤：git --author 是子字符串匹配，可能误匹配其他作者
    // 这里对结果做二次校验，只保留 author_name 或 author_email 精确匹配的提交
    if (author && log.total > 0) {
      const exactAuthor = this.findExactAuthor(log, author)
      if (exactAuthor) {
        const filtered = log.all.filter(
          (c) => c.author_name === exactAuthor || c.author_email === exactAuthor
        )
        if (filtered.length !== log.all.length) {
          // 有误匹配的提交被过滤掉了，用精确匹配的作者名重新构建统计
          return this.buildStatsFromFiltered(git, filtered, exactAuthor, since, until)
        }
        // 全部匹配，正常流程
        return this.buildStats(git, log, exactAuthor, since, until)
      } else {
        // 没有精确匹配的作者 —— 所有提交都是 git --author 子字符串误匹配到的其他人
        // 返回空统计
        return this.buildStatsFromFiltered(git, [], '', since, until)
      }
    }

    // 如果指定 author 没有结果，尝试用邮箱模糊匹配
    if (log.total === 0 && author) {
      try {
        const allAuthors = await git.raw(['log', '--all', '--format=%an|%ae', '--since', since, '--until', until])
        const authorLines = [...new Set(allAuthors.split('\n').filter(l => l.trim()))]
        const matched = authorLines.find(line =>
          line.toLowerCase().includes(author.toLowerCase())
        )
        if (matched) {
          const matchedName = matched.split('|')[0]
          const retryLog = await git.log({
            '--author': matchedName,
            '--since': since,
            '--until': until,
            '--all': null,
          })
          if (retryLog.total > 0) {
            return this.buildStats(git, retryLog, matchedName, since, until)
          }
        }
      } catch {}
    }

    return this.buildStats(git, log, author, since, until)
  }

  /** 从 git log 结果构建统计数据 */
  private async buildStats(
    git: SimpleGit,
    log: LogResult<DefaultLogFields>,
    author: string,
    since: string,
    until: string,
  ): Promise<GitStats> {
    // 统计新增/删除行数
    let linesAdded = 0
    let linesDeleted = 0

    try {
      const args = ['log', '--since', since, '--until', until, '--pretty=tformat:', '--numstat', '--all']
      if (author) {
        args.splice(1, 0, `--author=${author}`)
      }
      const diffStat = await git.raw(args)

      const lines = diffStat.split('\n').filter((line) => line.trim())
      for (const line of lines) {
        const parts = line.split('\t')
        if (parts.length >= 2) {
          const added = parseInt(parts[0], 10)
          const deleted = parseInt(parts[1], 10)
          if (!isNaN(added)) linesAdded += added
          if (!isNaN(deleted)) linesDeleted += deleted
        }
      }
    } catch {
      // numstat 失败时忽略
    }

    // 构建提交时间线
    const timelineMap = new Map<string, number>()
    for (const commit of log.all) {
      const date = commit.date.split(' ')[0]
      timelineMap.set(date, (timelineMap.get(date) || 0) + 1)
    }
    const commitTimeline = Array.from(timelineMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // 获取贡献最多的文件
    let topFiles: { file: string; changes: number }[] = []
    try {
      const args = ['log', '--since', since, '--until', until, '--pretty=format:', '--name-only', '--all']
      if (author) {
        args.splice(1, 0, `--author=${author}`)
      }
      const fileStats = await git.raw(args)

      const fileCountMap = new Map<string, number>()
      const fileLines = fileStats.split('\n').filter((line) => line.trim())
      for (const file of fileLines) {
        fileCountMap.set(file, (fileCountMap.get(file) || 0) + 1)
      }

      topFiles = Array.from(fileCountMap.entries())
        .map(([file, changes]) => ({ file, changes }))
        .sort((a, b) => b.changes - a.changes)
        .slice(0, 20)
    } catch {}

    // 提取 commit 信息（去重，保留时间段内所有记录）
    const commitMessages = [...new Set(log.all.map((c) => c.message.split('\n')[0]))]
    const dates = log.all.map((c) => c.date).sort()

    return {
      totalCommits: log.total,
      linesAdded,
      linesDeleted,
      firstCommitDate: dates[0] || '',
      lastCommitDate: dates[dates.length - 1] || '',
      commitTimeline,
      commitMessages,
      topFiles,
    }
  }

  /**
   * 从 git log 结果中找到精确匹配的作者名
   * git --author 是子字符串匹配，可能返回多个不同作者的提交
   * 这里找出与输入 author 精确匹配（忽略大小写）的 author_name 或 author_email
   */
  private findExactAuthor(
    log: LogResult<DefaultLogFields>,
    author: string,
  ): string | null {
    const authorLower = author.toLowerCase()

    // 收集所有不同的作者
    const authorNames = new Set<string>()
    const authorEmails = new Set<string>()
    for (const commit of log.all) {
      authorNames.add(commit.author_name)
      authorEmails.add(commit.author_email)
    }

    // 先精确匹配 author_name（忽略大小写）
    for (const name of authorNames) {
      if (name.toLowerCase() === authorLower) {
        return name
      }
    }

    // 再精确匹配 author_email 的用户名部分（@ 之前）
    for (const email of authorEmails) {
      const emailUser = email.split('@')[0]
      if (emailUser.toLowerCase() === authorLower) {
        return email
      }
    }

    // 没有精确匹配，返回 null（说明 git 的子字符串匹配到了别人的提交）
    return null
  }

  /**
   * 从已过滤的 commit 列表构建统计数据
   * 用于精确过滤后的场景，通过逐个 commit 计算 numstat 避免 --author 子字符串匹配问题
   */
  private async buildStatsFromFiltered(
    git: SimpleGit,
    commits: ReadonlyArray<LogEntry>,
    author: string,
    since: string,
    until: string,
  ): Promise<GitStats> {
    // 如果过滤后没有提交，返回空统计
    if (commits.length === 0) {
      return {
        totalCommits: 0,
        linesAdded: 0,
        linesDeleted: 0,
        firstCommitDate: '',
        lastCommitDate: '',
        commitTimeline: [],
        commitMessages: [],
        topFiles: [],
      }
    }

    // 用精确的 author_name 重新查询 numstat（比逐 commit 查询更高效）
    let linesAdded = 0
    let linesDeleted = 0

    try {
      // 用精确作者名查 numstat，加上 ^...$ 锚定避免子字符串匹配
      const exactPattern = `^${author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
      const args = ['log', `--author=${exactPattern}`, '--since', since, '--until', until, '--pretty=tformat:', '--numstat', '--all']
      const diffStat = await git.raw(args)

      const lines = diffStat.split('\n').filter((line) => line.trim())
      for (const line of lines) {
        const parts = line.split('\t')
        if (parts.length >= 2) {
          const added = parseInt(parts[0], 10)
          const deleted = parseInt(parts[1], 10)
          if (!isNaN(added)) linesAdded += added
          if (!isNaN(deleted)) linesDeleted += deleted
        }
      }
    } catch {
      // numstat 失败时忽略
    }

    // 构建提交时间线
    const timelineMap = new Map<string, number>()
    for (const commit of commits) {
      const date = commit.date.split(' ')[0]
      timelineMap.set(date, (timelineMap.get(date) || 0) + 1)
    }
    const commitTimeline = Array.from(timelineMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // 获取贡献最多的文件
    let topFiles: { file: string; changes: number }[] = []
    try {
      const exactPattern = `^${author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
      const args = ['log', `--author=${exactPattern}`, '--since', since, '--until', until, '--pretty=format:', '--name-only', '--all']
      const fileStats = await git.raw(args)

      const fileCountMap = new Map<string, number>()
      const fileLines = fileStats.split('\n').filter((line) => line.trim())
      for (const file of fileLines) {
        fileCountMap.set(file, (fileCountMap.get(file) || 0) + 1)
      }

      topFiles = Array.from(fileCountMap.entries())
        .map(([file, changes]) => ({ file, changes }))
        .sort((a, b) => b.changes - a.changes)
        .slice(0, 20)
    } catch {}

    // 提取 commit 信息（去重，保留时间段内所有记录）
    const commitMessages = [...new Set(commits.map((c) => c.message.split('\n')[0]))]
    const dates = commits.map((c) => c.date).sort()

    return {
      totalCommits: commits.length,
      linesAdded,
      linesDeleted,
      firstCommitDate: dates[0] || '',
      lastCommitDate: dates[dates.length - 1] || '',
      commitTimeline,
      commitMessages,
      topFiles,
    }
  }
}
