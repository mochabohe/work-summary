import fs from 'fs/promises'
import { Readable } from 'stream'

/**
 * PPT 解析器
 * .pptx 文件本质是 zip 包，内部包含 XML 格式的幻灯片内容
 * 使用 jszip 解压后提取文本节点
 */
export class PptxParser {
  /** 解析 .pptx 文件，提取纯文本内容 */
  async parse(filePath: string): Promise<string> {
    // 动态导入 jszip（避免顶层导入问题）
    const JSZip = (await import('jszip')).default

    const fileBuffer = await fs.readFile(filePath)
    const zip = await JSZip.loadAsync(fileBuffer)

    const texts: string[] = []

    // 遍历所有幻灯片文件
    const slideFiles = Object.keys(zip.files)
      .filter((name) => name.match(/ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0')
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0')
        return numA - numB
      })

    for (const slideName of slideFiles) {
      const content = await zip.files[slideName].async('text')
      const slideText = this.extractTextFromXml(content)
      if (slideText.trim()) {
        const slideNum = slideName.match(/slide(\d+)/)?.[1]
        texts.push(`[幻灯片${slideNum}] ${slideText}`)
      }
    }

    return texts.join('\n\n')
  }

  /** 从 XML 中提取文本内容 */
  private extractTextFromXml(xml: string): string {
    // 匹配 <a:t>文本内容</a:t> 标签
    const textRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g
    const texts: string[] = []
    let match

    while ((match = textRegex.exec(xml)) !== null) {
      const text = match[1].trim()
      if (text) {
        texts.push(text)
      }
    }

    return texts.join(' ')
  }
}
