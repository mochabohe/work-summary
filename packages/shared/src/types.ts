/** 项目类型 */
export type ProjectType = 'frontend' | 'backend' | 'fullstack' | 'library' | 'other'

/** 扫描到的项目信息 */
export interface ProjectInfo {
  /** 项目名称 */
  name: string
  /** 项目路径 */
  path: string
  /** 项目类型 */
  type: ProjectType
  /** 技术栈标签 */
  techStack: string[]
  /** 文件总数 */
  fileCount: number
  /** 是否有 Git 仓库 */
  hasGit: boolean
  /** 当前用户在该项目的 Git 提交数（扫描阶段快速检测） */
  userCommitCount?: number
  /** 项目描述 (来自 package.json 等) */
  description?: string
}

/** Git 统计数据 */
export interface GitStats {
  /** 总提交数 */
  totalCommits: number
  /** 新增行数 */
  linesAdded: number
  /** 删除行数 */
  linesDeleted: number
  /** 首次提交日期 */
  firstCommitDate: string
  /** 最近提交日期 */
  lastCommitDate: string
  /** 提交时间线 */
  commitTimeline: { date: string; count: number }[]
  /** 关键 commit 信息 */
  commitMessages: string[]
  /** 贡献最多的文件 */
  topFiles: { file: string; changes: number }[]
}

/** 文档内容 */
export interface DocumentContent {
  /** 文件名 */
  filename: string
  /** 文件类型 */
  type: 'pptx' | 'docx' | 'pdf' | 'md' | 'txt' | 'html'
  /** 提取的文本内容 */
  content: string
}

/** Commit 聚类结果 */
export interface CommitCluster {
  /** 自动生成的分类名 */
  category: string
  /** 该分类的关键词 */
  keywords: string[]
  /** 属于该分类的 commit 消息 */
  messages: string[]
  /** 消息数量 */
  count: number
}

/** 贡献度评分 */
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
  /** 代码翻转率 */
  codeChurnRate: number
}

/** 工作模式阶段 */
export interface WorkPatternPhase {
  type: 'sprint' | 'steady' | 'low'
  startDate: string
  endDate: string
  totalCommits: number
  avgDailyCommits: number
  peakDate: string
  peakCount: number
}

/** 工作模式分析结果 */
export interface WorkPattern {
  phases: WorkPatternPhase[]
  summary: {
    totalDays: number
    activeDays: number
    avgDailyCommits: number
    mostProductiveDay: string
    longestStreak: number
  }
}

/** 文本质量评分 */
export interface TextQualityScore {
  totalScore: number
  dimensions: {
    infoDensity: { score: number; detail: string }
    clicheRate: { score: number; detail: string; found: string[] }
    structure: { score: number; detail: string }
    dataConsistency: { score: number; detail: string }
  }
  suggestions: string[]
}

/** 算法分析洞察 */
export interface AlgorithmInsights {
  /** Commit 智能分类聚类结果 */
  commitClusters?: CommitCluster[]
  /** 贡献度评分 */
  contributionScore?: ContributionScore
  /** 工作模式分析 */
  workPattern?: WorkPattern
}

/** 项目分析结果 */
export interface ProjectAnalysis {
  /** 项目信息 */
  project: ProjectInfo
  /** Git 统计数据 */
  gitStats?: GitStats
  /** 文档内容 */
  documents: DocumentContent[]
  /** 代码结构 */
  codeStructure: {
    entryFiles: string[]
    modules: string[]
    dependencies: Record<string, string>
    /** 关键代码文件摘要（路由、API、页面列表等，用于理解项目业务） */
    keyFiles: { path: string; content: string }[]
  }
  /** 算法分析洞察 */
  algorithmInsights?: AlgorithmInsights
}

/** 扫描进度事件 */
export interface ScanProgressEvent {
  /** 当前阶段 */
  phase: 'walking' | 'parsing' | 'git' | 'done'
  /** 进度百分比 0-100 */
  progress: number
  /** 当前处理的文件/项目 */
  current: string
  /** 已发现的数量 */
  found: {
    projects: number
    files: number
  }
}

/** 扫描结果 */
export interface ScanResult {
  /** 扫描到的项目列表 */
  projects: ProjectInfo[]
  /** 独立文档文件（不属于任何项目的文档） */
  standaloneDocuments: DocumentContent[]
  /** 总文件数 */
  totalFiles: number
  /** 扫描耗时(ms) */
  duration: number
}

/** 总结维度 */
export interface SummaryDimension {
  id: string
  name: string
  description: string
}

/** 总结文档类型 */
export type SummaryDocType =
  | 'yearly-summary'
  | 'quarterly-review'
  | 'monthly-report'
  | 'promotion-report'
  | 'project-retro'
  | 'resume'

/** 总结风格 */
export type SummaryStyle = 'formal' | 'semi-formal'

/** 目标读者 */
export type SummaryAudience = 'manager' | 'tech-lead' | 'cross-team' | 'self-archive'

/** 语气偏好 */
export type SummaryTone = 'professional' | 'concise' | 'result-driven'

/** 输出长度 */
export type SummaryLength = 'short' | 'medium' | 'long'

/** 输出语言 */
export type SummaryLanguage = 'zh-CN' | 'en-US'

/** 生成请求参数 */
export interface GenerateRequest {
  /** 选中的项目分析数据 */
  projects: ProjectAnalysis[]
  /** 补充文档内容（用户手动粘贴） */
  feishuDocs: { content: string }[]
  /** 扫描到的独立文档（自动识别的非项目文档） */
  standaloneDocuments?: DocumentContent[]
  /** 选中的总结维度 */
  dimensions: string[]
  /** 总结风格 */
  style: SummaryStyle
  /** 文档类型 */
  docType?: SummaryDocType
  /** 目标读者 */
  audience?: SummaryAudience
  /** 语气偏好 */
  tone?: SummaryTone
  /** 输出长度 */
  length?: SummaryLength
  /** 输出语言 */
  language?: SummaryLanguage
  /** 用户自定义要求 */
  customPrompt?: string
  /** 业务背景（描述核心业务目标或面临的挑战） */
  businessContext?: string
  /** 用户角色（如：前端开发、技术负责人） */
  roles?: string[]
}

/** 生成的总结 */
export interface GeneratedSummary {
  /** 总结ID */
  id: string
  /** Markdown 格式内容 */
  content: string
  /** 使用的维度 */
  dimensions: string[]
  /** 生成时间 */
  generatedAt: string
  /** 项目数量 */
  projectCount: number
}

/** API 统一响应格式 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
