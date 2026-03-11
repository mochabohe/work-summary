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
    const serverEntry = app.isPackaged
      ? path.join(process.resourcesPath, 'server', 'index.js')
      : path.join(__dirname, '..', '..', 'server', 'dist', 'index.js')

    const envPath = app.isPackaged
      ? path.join(process.resourcesPath, '.env')
      : path.join(__dirname, '..', '..', '..', '.env')

    const clientPath = app.isPackaged
      ? path.join(process.resourcesPath, 'client')
      : path.join(__dirname, '..', '..', 'client', 'dist')

    // server 需要能 resolve 自己的依赖
    const serverCwd = app.isPackaged
      ? path.join(process.resourcesPath, 'server')
      : path.join(__dirname, '..', '..', 'server')

    // 打包后 server 的 node_modules 在 resources/server/node_modules
    const serverModulesPath = app.isPackaged
      ? path.join(process.resourcesPath, 'server', 'node_modules')
      : path.join(__dirname, '..', '..', 'server', 'node_modules')

    // 使用 spawn + ELECTRON_RUN_AS_NODE=1 代替 fork
    // 这样 Electron 的内置 Node 会以纯 Node 模式运行，正确支持 ESM
    serverProcess = spawn(process.execPath, [serverEntry], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SERVER_PORT: String(port),
        DOTENV_PATH: envPath,
        CLIENT_DIST_PATH: clientPath,
        NODE_ENV: 'production',
        NODE_PATH: serverModulesPath,
      },
      cwd: serverCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let resolved = false

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString()
      console.log('[Server]', msg)
      if (!resolved && (msg.includes('服务器启动成功') || msg.includes('listening'))) {
        resolved = true
        resolve()
      }
    })

    serverProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Server Error]', data.toString())
    })

    serverProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    serverProcess.on('exit', (code) => {
      if (code !== 0 && !resolved) {
        resolved = true
        reject(new Error(`Server exited with code ${code}`))
      }
    })

    // 5 秒超时兜底
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve()
      }
    }, 5000)
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
