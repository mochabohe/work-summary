export class PdfParser {
  /** 解析 .pdf 文件，提取纯文本内容 */
  async parse(filePath: string): Promise<string> {
    const fs = await import('fs/promises')
    const pdfParse = (await import('pdf-parse')).default

    const buffer = await fs.readFile(filePath)
    const data = await pdfParse(buffer)
    return data.text
  }
}
