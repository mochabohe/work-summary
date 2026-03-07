/** 项目标志文件 - 用于识别项目边界 */
export const PROJECT_MARKERS = [
  'package.json',
  'pom.xml',
  'build.gradle',
  'requirements.txt',
  'setup.py',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  'CMakeLists.txt',
  'composer.json',
] as const

/** 扫描时排除的目录 */
export const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  '.idea',
  '.vscode',
  'coverage',
  '.turbo',
  '.cache',
] as const

/** 支持解析的文档扩展名 */
export const DOCUMENT_EXTENSIONS = [
  '.docx',
  '.pptx',
  '.pdf',
  '.md',
  '.txt',
] as const

/** 代码文件扩展名 */
export const CODE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.vue', '.svelte',
  '.py',
  '.java', '.kt',
  '.go',
  '.rs',
  '.c', '.cpp', '.h',
  '.cs',
  '.php',
  '.rb',
  '.swift',
  '.dart',
] as const

/** 总结维度建议（用户可自定义，这里只是预设建议） */
export const DIMENSION_SUGGESTIONS = [
  '项目交付',
  '功能攻坚',
  '快速交付',
  '自驱创新',
  '质量保障',
  '技术升级',
  '深度钻研',
  'AI 工程化',
  '知识沉淀',
  '团队协作',
  '业务理解',
  '部门分享',
] as const

/** DeepSeek API 配置 */
export const DEEPSEEK_CONFIG = {
  baseURL: 'https://api.deepseek.com',
  defaultModel: 'deepseek-chat',
} as const
