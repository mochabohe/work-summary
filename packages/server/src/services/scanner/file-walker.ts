import fs from 'fs/promises'
import path from 'path'
import { EXCLUDED_DIRS, PROJECT_MARKERS, DOCUMENT_EXTENSIONS } from '@work-summary/shared'
import type { ProjectInfo } from '@work-summary/shared'

export class FileWalker {
  /**
   * 在指定目录中查找所有项目
   * 通过检测项目标志文件（package.json, pom.xml 等）识别项目边界
   */
  async findProjects(
    rootPath: string,
    onFound?: (current: string, count: number) => void,
  ): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = []
    const projectPaths = new Set<string>()

    await this.walkForProjects(rootPath, rootPath, projects, projectPaths, onFound)

    return projects
  }

  /** 递归遍历查找项目 */
  private async walkForProjects(
    currentPath: string,
    rootPath: string,
    projects: ProjectInfo[],
    projectPaths: Set<string>,
    onFound?: (current: string, count: number) => void,
  ): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true })
      const dirName = path.basename(currentPath)

      // 跳过排除的目录
      if (EXCLUDED_DIRS.includes(dirName as typeof EXCLUDED_DIRS[number])) {
        return
      }

      // 检查是否是一个项目（包含项目标志文件）
      const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name)
      const isProject = PROJECT_MARKERS.some((marker) => fileNames.includes(marker))

      if (isProject && !projectPaths.has(currentPath)) {
        projectPaths.add(currentPath)

        // 尝试读取项目名称和描述
        let name = path.basename(currentPath)
        let description: string | undefined
        let hasGit = false

        // 检查是否有 .git 目录
        const hasGitDir = entries.some((e) => e.isDirectory() && e.name === '.git')
        hasGit = hasGitDir

        // 从 package.json 读取名称和描述
        if (fileNames.includes('package.json')) {
          try {
            const pkgContent = await fs.readFile(path.join(currentPath, 'package.json'), 'utf-8')
            const pkg = JSON.parse(pkgContent)
            if (pkg.name) name = pkg.name
            if (pkg.description) description = pkg.description
          } catch {}
        }

        projects.push({
          name,
          path: currentPath,
          type: 'other',
          techStack: [],
          fileCount: 0,
          hasGit,
          description,
        })

        onFound?.(currentPath, projects.length)
      }

      // 继续递归子目录（但不进入已识别项目的 node_modules 等）
      const subDirs = entries.filter((e) => e.isDirectory())
      for (const dir of subDirs) {
        const fullPath = path.join(currentPath, dir.name)

        // 跳过排除目录
        if (EXCLUDED_DIRS.includes(dir.name as typeof EXCLUDED_DIRS[number])) {
          continue
        }

        await this.walkForProjects(fullPath, rootPath, projects, projectPaths, onFound)
      }
    } catch (err) {
      // 权限问题等，静默跳过
    }
  }

  /**
   * 查找不属于任何项目的独立文档文件
   * 只查找根目录及其直接子目录（非项目目录）中的文档
   */
  async findStandaloneDocuments(
    rootPaths: string[],
    projectPaths: Set<string>,
  ): Promise<string[]> {
    const docFiles: string[] = []

    for (const rootPath of rootPaths) {
      await this.collectStandaloneDocs(rootPath, projectPaths, docFiles, 0)
    }

    return docFiles
  }

  /** 递归收集独立文档（排除项目目录内的文件） */
  private async collectStandaloneDocs(
    dirPath: string,
    projectPaths: Set<string>,
    docFiles: string[],
    depth: number,
  ): Promise<void> {
    // 限制递归深度，避免扫描太深
    if (depth > 3) return
    // 如果当前目录是一个项目目录，跳过（项目内的文档由 ParserService 处理）
    if (projectPaths.has(dirPath)) return

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const dirName = path.basename(dirPath)

      if (EXCLUDED_DIRS.includes(dirName as typeof EXCLUDED_DIRS[number])) return

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (DOCUMENT_EXTENSIONS.includes(ext as typeof DOCUMENT_EXTENSIONS[number])) {
            docFiles.push(fullPath)
          }
        } else if (entry.isDirectory()) {
          if (!EXCLUDED_DIRS.includes(entry.name as typeof EXCLUDED_DIRS[number])) {
            await this.collectStandaloneDocs(fullPath, projectPaths, docFiles, depth + 1)
          }
        }
      }
    } catch {
      // 权限问题等，静默跳过
    }
  }

  /** 统计项目中的文件数量（排除 node_modules 等） */
  async countFiles(projectPath: string): Promise<number> {
    let count = 0

    const walk = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (!EXCLUDED_DIRS.includes(entry.name as typeof EXCLUDED_DIRS[number])) {
              await walk(path.join(dir, entry.name))
            }
          } else if (entry.isFile()) {
            count++
          }
        }
      } catch {}
    }

    await walk(projectPath)
    return count
  }
}
