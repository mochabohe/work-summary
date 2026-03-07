import mammoth from 'mammoth'

export class DocxParser {
  /** 解析 .docx 文件，提取纯文本内容 */
  async parse(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  }
}
