// ============================
// 通用响应类型
// ============================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ============================
// 扫描相关类型
// ============================

export interface ProjectInfo {
  name: string
  path: string
  type: 'frontend' | 'backend' | 'fullstack' | 'other'
  techStack: string[]
  fileCount: number
  hasGit: boolean
  description?: string
  userCommitCount?: number
}

export interface DocumentContent {
  filename: string
  type: 'docx' | 'pptx' | 'pdf' | 'xlsx' | 'image' | 'md' | 'txt' | 'html'
  content: string
}

export interface ScanResult {
  projects: ProjectInfo[]
  standaloneDocuments: DocumentContent[]
  totalFiles: number
  duration: number
}

export interface ScanProgressEvent {
  phase: 'walking' | 'parsing' | 'git' | 'done' | 'error'
  progress: number
  current: string
  found: { projects: number; files: number }
  error?: string
}

// ============================
// Git 统计类型
// ============================

export interface GitStats {
  totalCommits: number
  linesAdded: number
  linesDeleted: number
  firstCommitDate: string
  lastCommitDate: string
  commitTimeline: { date: string; count: number }[]
  commitMessages: string[]
  topFiles: { file: string; changes: number }[]
}

// ============================
// 算法分析类型
// ============================

export interface ContributionScore {
  totalScore: number
  breakdown: {
    featureWork: number
    bugFix: number
    refactoring: number
    maintenance: number
  }
  topContributions: { area: string; score: number }[]
  codeChurnRate: number
}

export interface WorkPatternPhase {
  type: 'sprint' | 'steady' | 'low'
  startDate: string
  endDate: string
  totalCommits: number
  avgDailyCommits: number
  peakDate: string
  peakCount: number
}

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

export interface AlgorithmInsights {
  commitClusters: { category: string; count: number; messages: string[] }[]
  contributionScore: ContributionScore
  workPattern: WorkPattern
}

// ============================
// 亮点识别类型
// ============================

export interface Highlight {
  type: 'productivity' | 'quality' | 'optimization' | 'sprint' | 'feature' | 'domain'
  title: string
  description: string
  metric: string
  priority: 'high' | 'medium' | 'low'
}

// ============================
// 项目分析类型
// ============================

export interface ProjectAnalysis {
  project: ProjectInfo
  gitStats?: GitStats
  documents: DocumentContent[]
  codeStructure: {
    entryFiles: string[]
    modules: string[]
    dependencies: Record<string, string>
    keyFiles: { path: string; content: string }[]
  }
  algorithmInsights?: AlgorithmInsights
  highlights?: Highlight[]
}

// ============================
// 模型配置类型
// ============================

export interface ModelConfig {
  provider: 'openai-compatible' | 'anthropic'
  apiKey: string
  baseURL?: string   // OpenAI 兼容时使用
  model: string
  /**
   * OpenAI 兼容模式下的 API 类型：
   * - chat（默认）：标准 /v1/chat/completions，适用 gpt-4o / deepseek-chat 等普通模型
   * - responses：/v1/responses，适用 reasoning 模型（gpt-5 / o1 / o3 等）
   */
  apiType?: 'chat' | 'responses'
}

// ============================
// 生成请求类型
// ============================

export type SummaryStyle = 'formal' | 'semi-formal'
export type SummaryDocType = 'yearly-summary' | 'quarterly-review' | 'monthly-report' | 'promotion-report' | 'project-retro' | 'resume'
export type SummaryAudience = 'manager' | 'tech-lead' | 'cross-team' | 'self-archive'
export type SummaryTone = 'professional' | 'concise' | 'result-driven'
export type SummaryLength = 'short' | 'medium' | 'long'
export type SummaryLanguage = 'zh-CN' | 'en-US'
export type SummaryFormat = 'bullets' | 'star'

export interface GenerateRequest {
  /** 研发模式入参（保留） */
  projects?: ProjectAnalysis[]
  /** 通用模式入参（新增）：跨模式统一工作项 */
  workItems?: WorkItem[]
  /** 报告周期（通用模式必填，研发模式可选） */
  period?: ReportPeriod
  /** 模板 id（通用模式必填，研发模式可选） */
  templateId?: string
  /** 应用模式（用于服务端选择 prompt 路径） */
  mode?: AppMode
  standaloneDocuments?: DocumentContent[]
  feishuDocs?: { content: string }[]
  roles?: string[]
  businessContext?: string
  customPrompt?: string
  style?: SummaryStyle
  docType?: SummaryDocType
  audience?: SummaryAudience
  tone?: SummaryTone
  length?: SummaryLength
  language?: SummaryLanguage
  format?: SummaryFormat
  dimensions?: string[]
}

// ============================
// 文本质量评分类型
// ============================

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

// ============================
// 常量
// ============================

/** DeepSeek API 配置 */
export const DEEPSEEK_CONFIG = {
  baseURL: 'https://api.deepseek.com',
  defaultModel: 'deepseek-chat',
} as const

/** 需要排除的目录名称 */
export const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.cache',
  '.turbo',
  '.svelte-kit',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  'target',
  'vendor',
  '.idea',
  '.vscode',
  'logs',
  'tmp',
  'temp',
] as const

/** 文档文件扩展名 */
export const DOCUMENT_EXTENSIONS = [
  '.md',
  '.docx',
  '.pdf',
  '.pptx',
  '.xlsx',
  '.xls',
  '.txt',
  '.html',
  '.htm',
] as const

/** 代码文件扩展名 */
export const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte',
  '.py', '.pyw',
  '.java', '.kt', '.kts',
  '.go',
  '.rs',
  '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.dart',
  '.scala',
  '.sh', '.bash', '.zsh',
  '.sql',
  '.r', '.R',
  '.lua',
  '.yaml', '.yml',
  '.json',
  '.toml',
  '.xml',
  '.css', '.scss', '.sass', '.less',
] as const

/** 项目标识文件（用于识别项目根目录） */
export const PROJECT_MARKERS = [
  'package.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
  'Gemfile',
  'composer.json',
  'CMakeLists.txt',
  'Makefile',
  '.git',
] as const

// ============================
// 通用模式类型（Phase 1+ 新增）
// ============================

/** 应用模式：研发模式（Git 扫描）/ 通用模式（手动+文档） */
export type AppMode = 'developer' | 'general'

/** 工作项 - 两种模式统一的数据抽象 */
export interface WorkItem {
  id: string
  /** 数据来源 */
  source: 'git' | 'document' | 'manual'
  /** 工作项标题 */
  title: string
  /** 分类（项目/活动/事务/学习等，可自定义） */
  category?: string
  /** 时间范围 */
  date: { start: string; end?: string }
  /** 数据成果（如：转化率提升 12%） */
  metrics?: { label: string; value: string }[]
  /** 详细说明 */
  description: string
  /** 标签 */
  tags?: string[]
  /** LLM 抽取置信度 0-1（仅 source=document 时有值） */
  confidence?: number
  /** 原始数据快照（便于追溯） */
  raw?: unknown
}

/** 报告周期类型 */
export type ReportPeriodType = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

/** 报告周期 */
export interface ReportPeriod {
  type: ReportPeriodType
  /** ISO 日期 yyyy-MM-dd */
  start: string
  end: string
  /** 展示标签：2026-W16 / 2026-04 / 2026-Q2 / 2026 / 自定义 */
  label: string
}

/** 模板章节定义 */
export interface TemplateSection {
  key: string
  title: string
  required: boolean
  /** 写作提示，注入 LLM prompt */
  hint: string
}

/** 报告模板 */
export interface ReportTemplate {
  id: string
  name: string
  period: ReportPeriodType
  /** 适用的模式 */
  appliesTo: AppMode[]
  sections: TemplateSection[]
  /** 周期/模式专属的额外 prompt 提示 */
  promptHints: string
  /** 对应的 PPT 模板 id（可选） */
  pptTemplate?: string
  /** 是否内置（用户自定义模板为 false） */
  builtin?: boolean
}

/** 总结维度建议列表 */
export const DIMENSION_SUGGESTIONS = [
  '技术突破与创新',
  '性能优化成果',
  '代码质量提升',
  '团队协作贡献',
  '业务价值交付',
  '问题解决能力',
  '学习与成长',
  '流程改进',
  '跨部门协作',
  '架构设计',
  '安全与稳定性',
  '用户体验改善',
  '数据分析洞察',
  '项目管理能力',
  '文档与知识沉淀',
] as const
