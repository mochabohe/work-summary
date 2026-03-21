import { app, BrowserWindow, dialog } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as net from 'net'

let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null

function getResourcePath(...segments: string[]): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments)
  }
  // 开发模式：从 packages/electron/dist 出发
  return path.join(__dirname, '..', '..', ...segments)
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

async function startServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // 打包模式：server.cjs bundle（单文件，无 node_modules 依赖）
    // 开发模式：使用 server/dist/index.js + 本地 node_modules
    const serverEntry = app.isPackaged
      ? path.join(process.resourcesPath, 'server.cjs')
      : path.join(__dirname, '..', '..', 'server', 'server.cjs')

    const envPath = app.isPackaged
      ? path.join(process.resourcesPath, '.env')
      : path.join(__dirname, '..', '..', '..', '.env')

    const clientPath = app.isPackaged
      ? path.join(process.resourcesPath, 'client')
      : path.join(__dirname, '..', '..', 'client', 'dist')

    serverProcess = spawn(process.execPath, [serverEntry], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SERVER_PORT: String(port),
        DOTENV_PATH: envPath,
        CLIENT_DIST_PATH: clientPath,
        NODE_ENV: 'production',
        APP_DATA_PATH: app.getPath('userData'),
      },
      cwd: path.dirname(serverEntry),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let resolved = false
    let stderrOutput = ''
    let fallbackTimer: ReturnType<typeof setTimeout>

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString()
      console.log('[Server]', msg)
      if (!resolved && (msg.includes('服务器启动成功') || msg.includes('listening'))) {
        resolved = true
        clearTimeout(fallbackTimer)
        resolve()
      }
    })

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      console.error('[Server Error]', msg)
      stderrOutput += msg
    })

    serverProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(fallbackTimer)
        reject(err)
      }
    })

    serverProcess.on('exit', (code) => {
      if (code !== 0 && !resolved) {
        resolved = true
        clearTimeout(fallbackTimer)
        const detail = stderrOutput ? `\n\n${stderrOutput.slice(0, 800)}` : ''
        reject(new Error(`Server exited with code ${code}${detail}`))
      }
    })

    // 超时兜底：若 15 秒内未收到 listening 输出，主动探测端口是否就绪
    // 避免慢机器上 "5秒超时就假成功" 导致 window 打开时 server 还未监听
    const fallbackTimer = setTimeout(() => {
      if (resolved) return
      const socket = net.createConnection({ port, host: '127.0.0.1' })
      socket.on('connect', () => {
        socket.destroy()
        if (!resolved) { resolved = true; resolve() }
      })
      socket.on('error', () => {
        socket.destroy()
        if (!resolved) {
          resolved = true
          const detail = stderrOutput ? `\n\n${stderrOutput.slice(0, 800)}` : ''
          reject(new Error(`服务器启动超时，无法连接端口 ${port}${detail}`))
        }
      })
    }, 15000)
  })
}

function createWindow(port: number): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '智能工作总结',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  })

  mainWindow.loadURL(`http://127.0.0.1:${port}`)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 生产环境隐藏菜单栏
  if (app.isPackaged) {
    mainWindow.setMenuBarVisibility(false)
  }
}

function killServer(): void {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
}

app.whenReady().then(async () => {
  try {
    const port = await findFreePort()
    console.log(`[Electron] Starting server on port ${port}...`)
    await startServer(port)
    console.log('[Electron] Server started, creating window...')
    createWindow(port)
  } catch (err) {
    dialog.showErrorBox('启动失败', `服务器启动失败: ${(err as Error).message}`)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  killServer()
  app.quit()
})

app.on('before-quit', () => {
  killServer()
})
