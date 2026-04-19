import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// 必须作为所有业务模块的第一个 import 被加载。
// ESM 静态 import 会被提升至模块顶部执行，若 dotenv.config() 写在 index.ts 主体里，
// 其他模块（如 services/llm/index.ts）的顶层常量会在 env 加载前就被初始化为空值。
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = process.env.DOTENV_PATH || path.resolve(__dirname, '../../../.env')
dotenv.config({ path: envPath })
