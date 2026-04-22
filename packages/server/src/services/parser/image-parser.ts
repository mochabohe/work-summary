import fs from 'fs/promises'
import path from 'path'
import { LLMService } from '../llm/index.js'

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

const OCR_PROMPT = `请识别这张图中的所有文字内容，并输出成结构化纯文本。
要求：
1. 严格按照图中文字的顺序（从上到下、从左到右）输出。
2. 保留段落分隔（用空行）和列表项（保留项目符号或编号）。
3. 如果是表格，尽量还原为"列名：值"或 Markdown 表格。
4. 不要总结、不要改写、不要加解释。仅输出图中实际出现的文字；若某处无法识别，用 [?] 代替。
5. 图中若出现工作进度、项目名、日期、指标等与工作周报/月报相关的信息，务必完整保留。`

export class ImageParser {
  private llm = new LLMService()

  async parse(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase()
    const mime = MIME_MAP[ext] || 'image/png'
    const buffer = await fs.readFile(filePath)
    const base64 = buffer.toString('base64')
    const text = await this.llm.chatWithImage(OCR_PROMPT, base64, mime)
    return text.trim()
  }
}
