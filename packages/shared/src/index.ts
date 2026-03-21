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
  type: 'docx' | 'pptx' | 'pdf' | 'md' | 'txt' | 'html'
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
  projects: ProjectAnalysis[]
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
