import api from './index'
import type { ApiResponse } from '@work-summary/shared'

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  /** 是否是快捷方式解析出的目录 */
  isShortcut?: boolean
}

export interface BrowseResult {
  current: string
  parent: string
  entries: DirEntry[]
}

export interface Shortcut {
  name: string
  path: string
}

/** 浏览目录内容 */
export async function browseDir(path?: string) {
  const params = path ? { path } : {}
  const res = await api.get('/fs/browse', { params }) as unknown as ApiResponse<BrowseResult>
  return res.data!
}

/** 获取常用快捷路径 */
export async function getShortcuts() {
  const res = await api.get('/fs/shortcuts') as unknown as ApiResponse<Shortcut[]>
  return res.data!
}
