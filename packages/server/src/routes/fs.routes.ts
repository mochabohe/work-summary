import { FastifyPluginAsync } from 'fastify'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  /** 是否是快捷方式解析出的目录 */
  isShortcut?: boolean
}

/** 解析 Windows .lnk 快捷方式的目标路径 */
async function resolveLnkTarget(lnkPath: string): Promise<string | null> {
  // 在 WSL 环境下也支持解析 .lnk（通过 powershell.exe）
  try {
    const winPath = lnkPath.replace(/^\/mnt\/([a-z])\//, (_, d: string) => `${d.toUpperCase()}:\\`).replace(/\//g, '\\')
    const script = `(New-Object -ComObject WScript.Shell).CreateShortcut('${winPath.replace(/'/g, "''")}').TargetPath`

    let cmd: string
    let args: string[]
    if (process.platform === 'win32') {
      cmd = 'powershell'
      args = ['-NoProfile', '-Command', script]
    } else {
      // WSL: 调用 Windows 的 powershell.exe
      cmd = 'powershell.exe'
      args = ['-NoProfile', '-Command', script]
    }

    const { stdout } = await execFileAsync(cmd, args, { timeout: 5000 })
    const target = stdout.trim()
    if (!target) return null

    // 如果在 WSL 下，把 Windows 路径转成 WSL 路径
    if (process.platform !== 'win32' && /^[A-Z]:\\/.test(target)) {
      const drive = target[0].toLowerCase()
      return `/mnt/${drive}/${target.substring(3).replace(/\\/g, '/')}`
    }
    return target
  } catch {
    return null
  }
}

export const fsRoutes: FastifyPluginAsync = async (app) => {
  // 浏览目录内容
  app.get<{
    Querystring: { path?: string }
  }>('/browse', async (request, reply) => {
    const targetPath = request.query.path || os.homedir()

    try {
      const stat = await fs.stat(targetPath)
      if (!stat.isDirectory()) {
        return reply.status(400).send({ success: false, error: '指定路径不是文件夹' })
      }

      const entries = await fs.readdir(targetPath, { withFileTypes: true })
      const dirs: DirEntry[] = []
      const lnkFiles: string[] = []

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        if (entry.name === 'node_modules' || entry.name === '__pycache__') continue

        if (entry.isDirectory()) {
          dirs.push({
            name: entry.name,
            path: path.join(targetPath, entry.name),
            isDirectory: true,
          })
        } else if (entry.name.endsWith('.lnk')) {
          // 收集 .lnk 快捷方式，稍后批量解析
          lnkFiles.push(entry.name)
        }
      }

      // 解析 .lnk 快捷方式，找出指向目录的快捷方式
      if (lnkFiles.length > 0) {
        const resolveResults = await Promise.allSettled(
          lnkFiles.map(async (lnkName) => {
            const lnkPath = path.join(targetPath, lnkName)
            const target = await resolveLnkTarget(lnkPath)
            if (!target) return null
            try {
              const targetStat = await fs.stat(target)
              if (targetStat.isDirectory()) {
                return {
                  name: lnkName.replace(/\.lnk$/i, ''),
                  path: target,
                  isDirectory: true,
                  isShortcut: true,
                } as DirEntry
              }
            } catch {}
            return null
          })
        )
        for (const result of resolveResults) {
          if (result.status === 'fulfilled' && result.value) {
            // 避免与已有的真实目录重名
            if (!dirs.some(d => d.path === result.value!.path)) {
              dirs.push(result.value)
            }
          }
        }
      }

      // 按名称排序
      dirs.sort((a, b) => a.name.localeCompare(b.name))

      return reply.send({
        success: true,
        data: {
          current: targetPath,
          parent: path.dirname(targetPath),
          entries: dirs,
        },
      })
    } catch (err) {
      return reply.status(400).send({
        success: false,
        error: `无法访问路径: ${(err as Error).message}`,
      })
    }
  })

  // 获取常用快捷路径
  app.get('/shortcuts', async (_request, reply) => {
    const home = os.homedir()
    const shortcuts: { name: string; path: string }[] = [
      { name: '用户主目录', path: home },
      { name: '桌面', path: path.join(home, 'Desktop') },
      { name: '文档', path: path.join(home, 'Documents') },
    ]

    // Windows 盘符
    if (process.platform === 'win32') {
      const drives = ['C:', 'D:', 'E:', 'F:']
      for (const drive of drives) {
        try {
          await fs.access(drive + '\\')
          shortcuts.push({ name: `${drive} 盘`, path: drive + '\\' })
        } catch {
          // 盘符不存在，跳过
        }
      }
    } else {
      shortcuts.push({ name: '根目录', path: '/' })
    }

    return reply.send({ success: true, data: shortcuts })
  })
}
