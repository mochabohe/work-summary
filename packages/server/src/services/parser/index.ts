import fs from 'fs/promises'
import path from 'path'
import { Worker } from 'worker_threads'
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

  /** 文件大小限制 */
  private static MAX_TEXT_SIZE = 1 * 1024 * 1024   // md/txt: 1MB
  private static MAX_HTML_SIZE = 200 * 1024         // html: 200KB（大 HTML 通常是构建产物，正则解析会阻塞）

  /** 解析单个文件 */
  async parseFile(filePath: string): Promise<DocumentContent | null> {
    const ext = path.extname(filePath).toLowerCase()
    const filename = path.basename(filePath)

    // 检查文件大小，跳过过大的文件
    if (['.md', '.txt', '.html', '.htm'].includes(ext)) {
      const stat = await fs.stat(filePath)
      const limit = ['.html', '.htm'].includes(ext)
        ? ParserService.MAX_HTML_SIZE
        : ParserService.MAX_TEXT_SIZE
      if (stat.size > limit) {
        return null
      }
    }

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
      case '.html':
      case '.htm':
        return {
          filename,
          type: 'html',
          content: await this.extractTextFromHtmlAsync(await fs.readFile(filePath, 'utf-8')),
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
    keyFiles: { path: string; content: string }[]
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

    // 提取关键代码文件摘要
    const keyFiles = await this.findKeyFiles(projectPath)

    return { entryFiles, modules, dependencies, keyFiles }
  }

  /** 关键文件探测列表：路径候选 + 描述 */
  private static KEY_FILE_CANDIDATES = [
    // 路由文件 — 揭示页面/功能结构
    'src/router/index.ts', 'src/router/index.js',
    'src/router.ts', 'src/router.js',
    'src/routes/index.ts', 'src/routes/index.js',
    'src/routes.ts', 'src/routes.js',
    'app/router.ts', 'app/routes.ts',
    // API 定义文件 — 揭示后端接口和业务领域
    'src/api/index.ts', 'src/api/index.js',
    'src/services/api.ts', 'src/services/api.js',
    'src/api.ts',
    // 状态管理 — 揭示数据模型
    'src/store/index.ts', 'src/store/index.js',
    'src/stores/index.ts', 'src/stores/index.js',
    // 数据库模型（后端项目）
    'src/models/index.ts', 'src/models/index.js',
    'prisma/schema.prisma',
    // 配置文件 — 揭示项目类型和构建方式
    'nuxt.config.ts', 'nuxt.config.js',
    'next.config.ts', 'next.config.js', 'next.config.mjs',
  ]

  /** 页面/视图目录候选（只提取文件名列表） */
  private static PAGE_DIR_CANDIDATES = [
    'src/pages', 'src/views', 'src/screens',
    'app/pages', 'pages',
  ]

  /** 每个文件最多读取的行数 */
  private static KEY_FILE_MAX_LINES = 150

  /** 最多提取的关键文件数（不含页面目录列表） */
  private static KEY_FILE_MAX_COUNT = 6

  /** 提取关键代码文件内容摘要 */
  private async findKeyFiles(projectPath: string): Promise<{ path: string; content: string }[]> {
    const result: { path: string; content: string }[] = []

    // 1. 探测关键文件并读取内容
    for (const relPath of ParserService.KEY_FILE_CANDIDATES) {
      if (result.length >= ParserService.KEY_FILE_MAX_COUNT) break

      try {
        const fullPath = path.join(projectPath, relPath)
        const stat = await fs.stat(fullPath)
        // 跳过超过 50KB 的文件
        if (stat.size > 50 * 1024) continue

        const content = await fs.readFile(fullPath, 'utf-8')
        const lines = content.split('\n')
        const truncated = lines.slice(0, ParserService.KEY_FILE_MAX_LINES).join('\n')

        if (truncated.trim().length > 0) {
          result.push({ path: relPath, content: truncated })
        }
      } catch {
        // 文件不存在，跳过
      }
    }

    // 2. 提取页面/视图目录的文件名列表
    for (const dirRel of ParserService.PAGE_DIR_CANDIDATES) {
      try {
        const dirPath = path.join(projectPath, dirRel)
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        const fileNames = entries
          .filter(e => !EXCLUDED_DIRS.includes(e.name as any) && !e.name.startsWith('.'))
          .map(e => e.isDirectory() ? `${e.name}/` : e.name)
          .sort()

        if (fileNames.length > 0) {
          result.push({
            path: `${dirRel}/ (文件列表)`,
            content: fileNames.join(', '),
          })
          break // 只取第一个存在的页面目录
        }
      } catch {
        // 目录不存在，跳过
      }
    }

    // 3. 探测 API 目录下的所有文件列表（补充了解接口模块划分）
    const apiDirs = ['src/api', 'src/services']
    for (const dirRel of apiDirs) {
      try {
        const dirPath = path.join(projectPath, dirRel)
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        const fileNames = entries
          .filter(e => e.isFile() && !e.name.startsWith('.'))
          .map(e => e.name)
          .sort()

        if (fileNames.length > 1) {
          // 只有多个文件时才有价值列出（单文件已在上面读取内容了）
          const existing = result.find(r => r.path === `${dirRel}/ (文件列表)`)
          if (!existing) {
            result.push({
              path: `${dirRel}/ (文件列表)`,
              content: fileNames.join(', '),
            })
          }
        }
      } catch {}
    }

    return result
  }

  /**
   * 在 Worker 线程中解析 HTML，避免正则阻塞主线程事件循环
   * 超时后返回空字符串（跳过该文件）
   */
  private extractTextFromHtmlAsync(html: string, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve) => {
      // Worker 代码：在独立线程中执行正则替换
      const workerCode = `
        const { workerData, parentPort } = require('worker_threads');
        try {
          const result = workerData
            .replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, '')
            .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, '')
            .replace(/<\\/(p|div|h[1-6]|li|tr|br\\s*\\/?)>/gi, '\\n')
            .replace(/<br\\s*\\/?>/gi, '\\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/\\n{3,}/g, '\\n\\n')
            .trim();
          parentPort.postMessage(result);
        } catch {
          parentPort.postMessage('');
        }
      `;

      try {
        const worker = new Worker(workerCode, { eval: true, workerData: html });

        const timer = setTimeout(() => {
          worker.terminate();
          resolve('');
        }, timeoutMs);

        worker.on('message', (result: string) => {
          clearTimeout(timer);
          worker.terminate();
          resolve(result);
        });

        worker.on('error', () => {
          clearTimeout(timer);
          worker.terminate();
          resolve('');
        });
      } catch {
        // Worker 创建失败，回退到空字符串
        resolve('');
      }
    });
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
