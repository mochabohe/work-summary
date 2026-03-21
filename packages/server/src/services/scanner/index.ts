import { FileWalker } from './file-walker.js'
import { FileFilter } from './file-filter.js'
import { ParserService } from '../parser/index.js'
import simpleGit from 'simple-git'
import type { ScanResult, ScanProgressEvent, ProjectInfo, DocumentContent } from '@work-summary/shared'

export interface ScanOptions {
  gitAuthor?: string
  startDate?: string
  endDate?: string
}

export class ScannerService {
  private walker: FileWalker
  private filter: FileFilter

  constructor() {
    this.walker = new FileWalker()
    this.filter = new FileFilter()
  }

  /** 扫描多个文件夹路径，合并结果 */
  async scanMultiple(
    folderPaths: string[],
    options: ScanOptions,
    onProgress?: (event: ScanProgressEvent) => void,
  ): Promise<ScanResult> {
    const startTime = Date.now()
    const allProjects: ProjectInfo[] = []
    let totalFiles = 0

    // 阶段1: 遍历所有路径，识别项目
    let allRawProjects: { name: string; path: string; hasGit: boolean }[] = []

    for (let pi = 0; pi < folderPaths.length; pi++) {
      const folderPath = folderPaths[pi]
      onProgress?.({
        phase: 'walking',
        progress: Math.round((pi / folderPaths.length) * 30),
        current: folderPath,
        found: { projects: allRawProjects.length, files: 0 },
      })

      const projects = await this.walker.findProjects(folderPath, (current, found) => {
        onProgress?.({
          phase: 'walking',
          progress: Math.round((pi / folderPaths.length) * 30),
          current,
          found: { projects: allRawProjects.length + found, files: 0 },
        })
      })
      allRawProjects.push(...projects)
    }

    // 按路径去重（避免多个父文件夹包含相同子项目）
    const seen = new Set<string>()
    allRawProjects = allRawProjects.filter((p) => {
      if (seen.has(p.path)) return false
      seen.add(p.path)
      return true
    })

    // 阶段2: 分析每个项目
    for (let i = 0; i < allRawProjects.length; i++) {
      const project = allRawProjects[i]
      onProgress?.({
        phase: 'parsing',
        progress: 30 + Math.round((i / allRawProjects.length) * 50),
        current: project.name,
        found: { projects: allRawProjects.length, files: totalFiles },
      })

      const fileCount = await this.walker.countFiles(project.path)
      totalFiles += fileCount

      const techStack = await this.detectTechStack(project.path)
      const projectType = this.inferProjectType(techStack)

      // 快速检测当前用户在该项目的 Git 提交数
      let userCommitCount: number | undefined
      if (project.hasGit && options.gitAuthor) {
        userCommitCount = await this.quickCommitCount(project.path, options.gitAuthor, options.startDate, options.endDate)
      }

      allProjects.push({
        ...project,
        fileCount,
        techStack,
        type: projectType,
        userCommitCount,
      })
    }

    // 阶段3: 查找并解析独立文档文件（不属于任何项目的文档）
    onProgress?.({
      phase: 'parsing',
      progress: 80,
      current: '查找独立文档...',
      found: { projects: allProjects.length, files: totalFiles },
    })

    const projectPathSet = new Set(allProjects.map((p) => p.path))
    const standaloneDocFiles = await this.walker.findStandaloneDocuments(folderPaths, projectPathSet)
    const standaloneDocuments: DocumentContent[] = []

    if (standaloneDocFiles.length > 0) {
      const parser = new ParserService()
      for (let i = 0; i < standaloneDocFiles.length; i++) {
        const filePath = standaloneDocFiles[i]
        const fileName = filePath.split(/[\\/]/).pop() || filePath
        onProgress?.({
          phase: 'parsing',
          progress: 80 + Math.round(((i + 1) / standaloneDocFiles.length) * 20),
          current: `解析文档: ${fileName}`,
          found: { projects: allProjects.length, files: totalFiles },
        })
        try {
          // 单个文件解析超时 10 秒，避免大文件阻塞整个扫描
          let timeoutHandle: ReturnType<typeof setTimeout>
          const doc = await Promise.race([
            parser.parseFile(filePath).finally(() => clearTimeout(timeoutHandle)),
            new Promise<null>((resolve) => { timeoutHandle = setTimeout(() => resolve(null), 10000) }),
          ])
          if (doc && doc.content.trim().length > 0) {
            standaloneDocuments.push(doc)
          }
        } catch {
          // 解析失败的文件静默跳过
        }
      }
    }

    const duration = Date.now() - startTime

    onProgress?.({
      phase: 'done',
      progress: 100,
      current: '',
      found: { projects: allProjects.length, files: totalFiles },
    })

    return {
      projects: allProjects,
      standaloneDocuments,
      totalFiles,
      duration,
    }
  }

  /** 扫描单个文件夹路径 */
  async scan(
    folderPath: string,
    options: ScanOptions,
    onProgress?: (event: ScanProgressEvent) => void,
  ): Promise<ScanResult> {
    return this.scanMultiple([folderPath], options, onProgress)
  }

  /** 检测项目技术栈 */
  private async detectTechStack(projectPath: string): Promise<string[]> {
    const techStack: string[] = []

    try {
      const fs = await import('fs/promises')
      const path = await import('path')

      // 检查 package.json
      const pkgPath = path.join(projectPath, 'package.json')
      try {
        const pkgContent = await fs.readFile(pkgPath, 'utf-8')
        const pkg = JSON.parse(pkgContent)
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

        // 检测常见框架和库
        const techMap: Record<string, string> = {
          'vue': 'Vue',
          'react': 'React',
          'angular': 'Angular',
          'svelte': 'Svelte',
          'next': 'Next.js',
          'nuxt': 'Nuxt',
          'typescript': 'TypeScript',
          'vite': 'Vite',
          'webpack': 'Webpack',
          'tailwindcss': 'Tailwind CSS',
          'element-plus': 'Element Plus',
          'ant-design-vue': 'Ant Design Vue',
          'express': 'Express',
          'fastify': 'Fastify',
          'koa': 'Koa',
          'nestjs': 'NestJS',
          'pinia': 'Pinia',
          'vuex': 'Vuex',
          'redux': 'Redux',
          'vitest': 'Vitest',
          'jest': 'Jest',
          'playwright': 'Playwright',
          'electron': 'Electron',
        }

        for (const [dep, name] of Object.entries(techMap)) {
          if (allDeps[dep] || allDeps[`@${dep}/core`]) {
            techStack.push(name)
          }
        }
      } catch {
        // 没有 package.json
      }

      // 检查 Python 项目
      const requirementsPath = path.join(projectPath, 'requirements.txt')
      try {
        await fs.access(requirementsPath)
        techStack.push('Python')
      } catch {}

      // 检查 Go 项目
      const goModPath = path.join(projectPath, 'go.mod')
      try {
        await fs.access(goModPath)
        techStack.push('Go')
      } catch {}

      // 检查 Java 项目
      const pomPath = path.join(projectPath, 'pom.xml')
      try {
        await fs.access(pomPath)
        techStack.push('Java', 'Maven')
      } catch {}
    } catch {
      // 忽略错误
    }

    return techStack
  }

  /** 快速检测指定用户在项目中的 Git 提交数 */
  private async quickCommitCount(
    repoPath: string,
    author: string,
    startDate?: string,
    endDate?: string,
  ): Promise<number> {
    try {
      const git = simpleGit(repoPath)
      const args = ['log', '--oneline', '--author', author, '--all']
      if (startDate) args.push('--since', startDate)
      if (endDate) args.push('--until', endDate)
      const output = await git.raw(args)
      // 每行一条提交，统计非空行数
      return output.trim() ? output.trim().split('\n').length : 0
    } catch {
      return 0
    }
  }

  /** 推断项目类型 */
  private inferProjectType(techStack: string[]): ProjectInfo['type'] {
    const frontendTech = ['Vue', 'React', 'Angular', 'Svelte', 'Next.js', 'Nuxt']
    const backendTech = ['Express', 'Fastify', 'Koa', 'NestJS', 'Spring', 'Django']

    const hasFrontend = techStack.some((t) => frontendTech.includes(t))
    const hasBackend = techStack.some((t) => backendTech.includes(t))

    if (hasFrontend && hasBackend) return 'fullstack'
    if (hasFrontend) return 'frontend'
    if (hasBackend) return 'backend'
    return 'other'
  }
}
