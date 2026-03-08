import Fastify from 'fastify'
import cors from '@fastify/cors'
import { scanRoutes } from './routes/scan.routes.js'
import { analysisRoutes } from './routes/analysis.routes.js'
import { generateRoutes } from './routes/generate.routes.js'
import { exportRoutes } from './routes/export.routes.js'
import { configRoutes } from './routes/config.routes.js'
import { fsRoutes } from './routes/fs.routes.js'

export async function createApp() {
  const app = Fastify({
    logger: true,
  })

  // 跨域
  await app.register(cors, {
    origin: true,
  })

  // 注册路由
  await app.register(scanRoutes, { prefix: '/api/v1/scan' })
  await app.register(analysisRoutes, { prefix: '/api/v1/analysis' })
  await app.register(generateRoutes, { prefix: '/api/v1/generate' })
  await app.register(exportRoutes, { prefix: '/api/v1/export' })
  await app.register(configRoutes, { prefix: '/api/v1/config' })
  await app.register(fsRoutes, { prefix: '/api/v1/fs' })

  // 健康检查
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  return app
}
