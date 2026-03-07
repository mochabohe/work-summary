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
  }
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
  style: 'formal' | 'semi-formal'
  /** 用户自定义要求 */
  customPrompt?: string
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
