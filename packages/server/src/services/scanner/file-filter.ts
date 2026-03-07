import path from 'path'
import { EXCLUDED_DIRS, DOCUMENT_EXTENSIONS, CODE_EXTENSIONS } from '@work-summary/shared'

export class FileFilter {
  /** 判断是否应该排除该目录 */
  isExcludedDir(dirName: string): boolean {
    return EXCLUDED_DIRS.includes(dirName as typeof EXCLUDED_DIRS[number])
  }

  /** 判断是否是文档文件 */
  isDocumentFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase()
    return DOCUMENT_EXTENSIONS.includes(ext as typeof DOCUMENT_EXTENSIONS[number])
  }

  /** 判断是否是代码文件 */
  isCodeFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase()
    return CODE_EXTENSIONS.includes(ext as typeof CODE_EXTENSIONS[number])
  }

  /** 获取文件类型 */
  getFileType(filename: string): 'document' | 'code' | 'config' | 'other' {
    if (this.isDocumentFile(filename)) return 'document'
    if (this.isCodeFile(filename)) return 'code'

    const configFiles = ['package.json', 'tsconfig.json', '.eslintrc', '.prettierrc', 'vite.config', 'webpack.config']
    const name = path.basename(filename).toLowerCase()
    if (configFiles.some((c) => name.includes(c))) return 'config'

    return 'other'
  }
}
