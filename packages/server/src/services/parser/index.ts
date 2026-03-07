import fs from 'fs/promises'
import path from 'path'
import { EXCLUDED_DIRS, DOCUMENT_EXTENSIONS } from '@work-summary/shared'
import type { DocumentContent } from '@work-summary/shared'
import { DocxParser } from './docx-parser.js'
import { PptxParser } from './pptx-parser.js'
import { PdfParser } from './pdf-parser.js'

export class ParserService {
  private docxParser = new DocxParser()
  private pptxParser = new PptxParser()
  private pdfParser = new PdfParser()

  /** 解析项目中的所有文档文件 */
  async parseDocuments(projectPath: string): Promise<DocumentContent[]> {
    const docFiles = await this.findDocumentFiles(projectPath)
    const documents: DocumentContent[] = []

    for (const filePath of docFiles) {
      try {
        const doc = await this.parseFile(filePath)
        if (doc && doc.content.trim().length > 0) {
          documents.push(doc)
        }
      } catch {
        // 解析失败的文件静默跳过
      }
    }

    return documents
  }

  /** 解析单个文件 */
  async parseFile(filePath: string): Promise<DocumentContent | null> {
    const ext = path.extname(filePath).toLowerCase()
    const filename = path.basename(filePath)

    switch (ext) {
      case '.docx':
        return {
          filename,
          type: 'docx',
          content: await this.docxParser.parse(filePath),
        }
      case '.pptx':
        return {
          filename,
          type: 'pptx',
          content: await this.pptxParser.parse(filePath),
        }
      case '.pdf':
        return {
          filename,
          type: 'pdf',
          content: await this.pdfParser.parse(filePath),
        }
      case '.md':
        return {
          filename,
          type: 'md',
          content: await fs.readFile(filePath, 'utf-8'),
        }
      case '.txt':
        return {
          filename,
          type: 'txt',
          content: await fs.readFile(filePath, 'utf-8'),
        }
      default:
        return null
    }
  }

  /** 分析代码项目结构 */
  async analyzeCodeStructure(projectPath: string): Promise<{
    entryFiles: string[]
    modules: string[]
    dependencies: Record<string, string>
  }> {
    const entryFiles: string[] = []
    const modules: string[] = []
    let dependencies: Record<string, string> = {}

    try {
      // 读取 package.json 获取依赖
      const pkgPath = path.join(projectPath, 'package.json')
      try {
        const pkgContent = await fs.readFile(pkgPath, 'utf-8')
        const pkg = JSON.parse(pkgContent)
        dependencies = { ...pkg.dependencies }

        // 查找入口文件
        if (pkg.main) entryFiles.push(pkg.main)
        if (pkg.module) entryFiles.push(pkg.module)
      } catch {}

      // 查找常见入口文件
      const commonEntries = [
        'src/main.ts', 'src/main.js', 'src/index.ts', 'src/index.js',
        'src/App.vue', 'src/App.tsx', 'index.ts', 'index.js',
      ]
      for (const entry of commonEntries) {
        try {
          await fs.access(path.join(projectPath, entry))
          if (!entryFiles.includes(entry)) {
            entryFiles.push(entry)
          }
        } catch {}
      }

      // 查找 src 下的目录作为模块
      try {
        const srcPath = path.join(projectPath, 'src')
        const entries = await fs.readdir(srcPath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name as any)) {
            modules.push(entry.name)
          }
        }
      } catch {}
    } catch {}

    return { entryFiles, modules, dependencies }
  }

  /** 递归查找项目中的文档文件 */
  private async findDocumentFiles(dirPath: string, maxDepth = 3, depth = 0): Promise<string[]> {
    if (depth > maxDepth) return []

    const files: string[] = []

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          if (!EXCLUDED_DIRS.includes(entry.name as any)) {
            const subFiles = await this.findDocumentFiles(fullPath, maxDepth, depth + 1)
            files.push(...subFiles)
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (DOCUMENT_EXTENSIONS.includes(ext as any)) {
            files.push(fullPath)
          }
        }
      }
    } catch {}

    return files
  }
}
