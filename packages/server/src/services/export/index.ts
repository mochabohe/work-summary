import fs from 'fs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import PDFDocument from 'pdfkit'

export class ExportService {
  /** 将 Markdown 内容转换为 Word 文档 */
  async toDocx(markdownContent: string): Promise<Buffer> {
    const paragraphs = this.markdownToParagraphs(markdownContent)

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs,
        },
      ],
    })

    const result = await Packer.toBuffer(doc)
    // docx v9 可能返回 Uint8Array/ArrayBuffer，确保转为 Node.js Buffer
    if (Buffer.isBuffer(result)) {
      return result
    }
    return Buffer.from(result as ArrayBuffer)
  }

  /** 将 Markdown 内容转换为 PDF（使用 pdfkit，纯 JS 无需浏览器） */
  async toPdf(markdownContent: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 60, bottom: 60, left: 50, right: 50 },
          info: {
            Title: '年终工作总结',
            Author: 'WorkSummary',
          },
        })

        const chunks: Buffer[] = []
        doc.on('data', (chunk: Buffer) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        // 注册中文字体：普通（仿宋）+ 加粗（黑体）
        const fonts = this.findChineseFonts()
        if (fonts.normal) doc.registerFont('CN', fonts.normal)
        if (fonts.bold) doc.registerFont('CN-Bold', fonts.bold)

        const fontNormal = fonts.normal ? 'CN' : 'Helvetica'
        const fontBold = fonts.bold ? 'CN-Bold' : 'Helvetica-Bold'

        doc.font(fontNormal)

        const lines = markdownContent.split('\n')

        for (const line of lines) {
          const trimmed = line.trim()

          if (!trimmed) {
            doc.moveDown(0.3)
            continue
          }

          // 一级标题
          if (trimmed.startsWith('# ')) {
            doc.moveDown(0.5)
            const title = this.stripMarkdown(trimmed.replace(/^#\s+/, ''))
            doc.font(fontBold).fontSize(22).text(title, { underline: true })
            doc.font(fontNormal)
            doc.moveDown(0.3)
          }
          // 二级标题
          else if (trimmed.startsWith('## ')) {
            doc.moveDown(0.5)
            const title = this.stripMarkdown(trimmed.replace(/^##\s+/, ''))
            doc.font(fontBold).fontSize(18).text(title)
            doc.font(fontNormal)
            doc.moveDown(0.2)
          }
          // 三级标题
          else if (trimmed.startsWith('### ')) {
            doc.moveDown(0.3)
            const title = this.stripMarkdown(trimmed.replace(/^###\s+/, ''))
            doc.font(fontBold).fontSize(15).text(title)
            doc.font(fontNormal)
            doc.moveDown(0.1)
          }
          // 列表项
          else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const text = trimmed.replace(/^[-*]\s+/, '')
            doc.fontSize(12)
            // 用绘图 API 画实心圆点（避免字体缺字符显示方框）
            const bulletX = doc.page.margins.left + 8
            const bulletY = doc.y + 5
            doc.save()
            doc.circle(bulletX, bulletY, 2.5).fill('#333333')
            doc.restore()
            // 文本从圆点右侧开始
            const textX = doc.page.margins.left + 20
            const textWidth = doc.page.width - doc.page.margins.right - textX
            this.renderRichText(doc, text, fontNormal, fontBold, 12, textX, bulletY - 5, textWidth)
          }
          // 普通段落
          else {
            doc.fontSize(12)
            this.renderRichText(doc, trimmed, fontNormal, fontBold, 12)
          }
        }

        doc.end()
      } catch (err) {
        reject(err)
      }
    })
  }

  /** 去掉所有 Markdown 标记 */
  private stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
  }

  /** 渲染富文本（支持 **加粗** 通过字体切换实现） */
  private renderRichText(
    doc: PDFKit.PDFDocument,
    text: string,
    fontNormal: string,
    fontBold: string,
    fontSize: number,
    x?: number,
    y?: number,
    width?: number,
  ) {
    const parts = this.parseTextParts(text)

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      doc.font(part.bold ? fontBold : fontNormal).fontSize(fontSize)
      const isLast = i === parts.length - 1
      const opts: Record<string, any> = { continued: !isLast, lineGap: 4 }

      if (i === 0 && x !== undefined) {
        if (width) opts.width = width
        doc.text(part.text, x, y, opts)
      } else {
        doc.text(part.text, opts)
      }
    }

    // 渲染完一段后恢复普通字体
    doc.font(fontNormal)
  }

  /** 将文本解析为 普通/加粗 片段数组 */
  private parseTextParts(text: string): Array<{ text: string; bold: boolean }> {
    const parts: Array<{ text: string; bold: boolean }> = []
    const regex = /\*\*(.*?)\*\*/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: text.substring(lastIndex, match.index), bold: false })
      }
      parts.push({ text: match[1], bold: true })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      parts.push({ text: text.substring(lastIndex), bold: false })
    }

    if (parts.length === 0) {
      parts.push({ text, bold: false })
    }

    return parts
  }

  /** 查找系统中文字体对：普通 + 加粗（仅 .ttf，pdfkit 不支持 .ttc） */
  private findChineseFonts(): { normal: string | null; bold: string | null } {
    // 普通字体候选（细线条字体）
    const normalCandidates = [
      'C:\\Windows\\Fonts\\simfang.ttf',     // 仿宋
      'C:\\Windows\\Fonts\\simkai.ttf',      // 楷体
      'C:\\Windows\\Fonts\\simsunb.ttf',     // 宋体
      'C:\\Windows\\Fonts\\SIMYOU.TTF',      // 幼圆
    ]
    // 加粗字体候选（粗线条字体）
    const boldCandidates = [
      'C:\\Windows\\Fonts\\simhei.ttf',      // 黑体
    ]
    // macOS / Linux 通用候选
    const fallbackPaths = [
      '/System/Library/Fonts/Hiragino Sans GB.ttc',
      '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    ]

    let normal: string | null = null
    let bold: string | null = null

    for (const p of normalCandidates) {
      try { fs.accessSync(p); normal = p; break } catch {}
    }
    for (const p of boldCandidates) {
      try { fs.accessSync(p); bold = p; break } catch {}
    }

    // 如果只找到一种，两者共用
    if (!normal && bold) normal = bold
    if (!bold && normal) bold = normal

    // 都没找到，尝试 fallback
    if (!normal && !bold) {
      for (const p of fallbackPaths) {
        try { fs.accessSync(p); normal = p; bold = p; break } catch {}
      }
    }

    return { normal, bold }
  }

  /** 将 Markdown 转换为 docx 段落 */
  private markdownToParagraphs(markdown: string): Paragraph[] {
    const lines = markdown.split('\n')
    const paragraphs: Paragraph[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        paragraphs.push(new Paragraph({ text: '' }))
        continue
      }

      if (trimmed.startsWith('# ')) {
        paragraphs.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: this.stripMarkdown(trimmed.replace(/^#\s+/, '')), bold: true, size: 48 })],
        }))
      } else if (trimmed.startsWith('## ')) {
        paragraphs.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: this.stripMarkdown(trimmed.replace(/^##\s+/, '')), bold: true, size: 36 })],
        }))
      } else if (trimmed.startsWith('### ')) {
        paragraphs.push(new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: this.stripMarkdown(trimmed.replace(/^###\s+/, '')), bold: true, size: 28 })],
        }))
      }
      else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const text = trimmed.replace(/^[-*]\s+/, '')
        const runs = this.parseInlineFormatting(text)
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: '• ' }), ...runs],
          spacing: { before: 60, after: 60 },
        }))
      }
      else {
        const runs = this.parseInlineFormatting(trimmed)
        paragraphs.push(new Paragraph({
          children: runs,
          spacing: { before: 60, after: 60 },
        }))
      }
    }

    return paragraphs
  }

  /** 解析行内 Markdown 格式（加粗等） */
  private parseInlineFormatting(text: string): TextRun[] {
    const runs: TextRun[] = []
    const regex = /\*\*(.*?)\*\*/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        runs.push(new TextRun({ text: text.substring(lastIndex, match.index) }))
      }
      runs.push(new TextRun({ text: match[1], bold: true }))
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      runs.push(new TextRun({ text: text.substring(lastIndex) }))
    }

    if (runs.length === 0) {
      runs.push(new TextRun({ text }))
    }

    return runs
  }
}
