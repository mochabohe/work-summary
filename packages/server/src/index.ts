import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// 从项目根目录加载 .env
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { createApp } from './app.js'

const PORT = Number(process.env.SERVER_PORT) || 3000

async function main() {
  const app = await createApp()

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`🚀 服务器启动成功: http://localhost:${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
