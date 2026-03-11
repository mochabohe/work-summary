import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 支持自定义 .env 路径（Electron 打包时通过环境变量传入）
const envPath = process.env.DOTENV_PATH || path.resolve(__dirname, '../../../.env')
dotenv.config({ path: envPath })

import { createApp } from './app.js'

const PORT = Number(process.env.SERVER_PORT) || 3000

async function main() {
  const app = await createApp()

  // Electron 模式：serve 前端静态文件
  const clientDistPath = process.env.CLIENT_DIST_PATH
  if (clientDistPath) {
    const fastifyStatic = (await import('@fastify/static')).default
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      decorateReply: false,
    })

    // SPA fallback：非 /api 路由返回 index.html
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' })
      }
      return reply.sendFile('index.html', clientDistPath)
    })
  }

  try {
    await app.listen({ port: PORT, host: '127.0.0.1' })
    console.log(`🚀 服务器启动成功: http://127.0.0.1:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
