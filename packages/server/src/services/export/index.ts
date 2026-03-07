import fs from 'fs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import PDFDocument from 'pdfkit'
import PptxGenJSModule from 'pptxgenjs'
// ESM/CJS 互操作：tsx 运行时可能将 default export 包裹在 { default: ... } 中
const PptxGenJS = (PptxGenJSModule as any).default || PptxGenJSModule

/** 数据指标卡片 */
export interface MetricItem {
  value: string
  label: string
  description?: string
}

/** 内容卡片（用于 grid 布局） */
export interface CardItem {
  title: string
  bullets: string[]
}

/** 幻灯片类型定义 */
export interface PptSlide {
  type: 'title' | 'section' | 'content' | 'metrics' | 'two-column' | 'grid' | 'summary' | 'end'
  title: string
  subtitle?: string
  // content 类型
  bullets?: string[]
  description?: string
  // metrics 类型
  metrics?: MetricItem[]
  // two-column 类型
  left?: { title: string; bullets: string[] }
  right?: { title: string; bullets: string[] }
  // grid 类型
  cards?: CardItem[]
  // summary 类型
  tags?: string[]
}

export interface PptData {
  title: string
  slides: PptSlide[]
}

const PPT_COLORS = {
  darkBg: '1B2A4A',
  accent: '4472C4',
  accentLight: 'D6E4F0',
  teal: '2CB9C5',
  titleText: 'FFFFFF',
  bodyText: '333333',
  subtitleText: 'B0BEC5',
  lightGray: 'F3F4F6',
  cardBg: 'F8FAFC',
}
const PPT_FONT = '微软雅黑'

export class ExportService {
  /** 将 AI 生成的幻灯片结构转换为 PPTX Buffer */
  async toPptx(data: PptData): Promise<Buffer> {
    // 防御性检查
    if (!data || !Array.isArray(data.slides)) {
      throw new Error(`无效的幻灯片数据: slides 不是数组 (类型: ${typeof data?.slides})`)
    }

    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE'
    pptx.author = '年终总结生成器'
    pptx.title = data.title || '年终工作总结'

    for (const s of data.slides) {
      const slide = pptx.addSlide()
      switch (s.type) {
        case 'title': case 'end': this.renderTitleSlide(slide, s); break
        case 'section': this.renderSectionSlide(slide, s); break
        case 'content': this.renderContentSlide(slide, s); break
        case 'metrics': this.renderMetricsSlide(slide, s); break
        case 'two-column': this.renderTwoColumnSlide(slide, s); break
        case 'grid': this.renderGridSlide(slide, s); break
        case 'summary': this.renderSummarySlide(slide, s); break
      }
    }

    const output = await pptx.write({ outputType: 'nodebuffer' })
    if (Buffer.isBuffer(output)) return output
    return Buffer.from(output as ArrayBuffer)
  }

  // --- PPTX 各页面渲染 ---

  private renderTitleSlide(slide: any, s: PptSlide) {
    slide.background = { color: PPT_COLORS.darkBg }
    slide.addText(s.title, {
      x: 0.5, y: 2.0, w: 12.33, h: 1.5,
      fontSize: 36, fontFace: PPT_FONT, color: PPT_COLORS.titleText,
      bold: true, align: 'center', valign: 'middle',
    })
    if (s.subtitle) {
      slide.addText(s.subtitle, {
        x: 0.5, y: 3.8, w: 12.33, h: 1.0,
        fontSize: 20, fontFace: PPT_FONT, color: PPT_COLORS.subtitleText,
        align: 'center', valign: 'middle',
      })
    }
  }

  private renderSectionSlide(slide: any, s: PptSlide) {
    slide.background = { color: PPT_COLORS.darkBg }
    slide.addText(s.title, {
      x: 0.5, y: 2.5, w: 12.33, h: 1.5,
      fontSize: 32, fontFace: PPT_FONT, color: PPT_COLORS.titleText,
      bold: true, align: 'center', valign: 'middle',
    })
  }

  /**
   * 解析文本中的 **加粗** 片段，生成 pptxgenjs 富文本数组。
   * 每条 bullet 可能包含 "**小标题**：描述" 格式。
   */
  private parseRichTextRuns(text: string, fontSize: number, color: string): Array<{ text: string; options: Record<string, any> }> {
    const runs: Array<{ text: string; options: Record<string, any> }> = []
    const regex = /\*\*(.*?)\*\*/g
    let lastIndex = 0
    let match
    while ((match = regex.exec(text)) !== null) {
      // 加粗前的普通文字
      if (match.index > lastIndex) {
        runs.push({ text: text.substring(lastIndex, match.index), options: { fontSize, fontFace: PPT_FONT, color, bold: false } })
      }
      // 加粗部分
      runs.push({ text: match[1], options: { fontSize, fontFace: PPT_FONT, color: PPT_COLORS.darkBg, bold: true } })
      lastIndex = match.index + match[0].length
    }
    // 剩余普通文字
    if (lastIndex < text.length) {
      runs.push({ text: text.substring(lastIndex), options: { fontSize, fontFace: PPT_FONT, color, bold: false } })
    }
    if (runs.length === 0) {
      runs.push({ text, options: { fontSize, fontFace: PPT_FONT, color, bold: false } })
    }
    return runs
  }

  /** 生成带圆点的要点列表项（支持 **加粗** 富文本） */
  private makeBulletItems(bullets: string[], fontSize: number, color: string, spacing = 14) {
    const items: Array<{ text: string | Array<{ text: string; options: Record<string, any> }>; options: Record<string, any> }> = []
    for (const b of bullets) {
      if (b.includes('**')) {
        // 富文本：第一个 run 带 bullet 属性
        const runs = this.parseRichTextRuns(b, fontSize, color)
        if (runs.length > 0) {
          runs[0].options.bullet = { code: '2022' }
        }
        // 最后一个 run 标记段落结束
        runs[runs.length - 1].options.breakLine = true
        runs[runs.length - 1].options.paraSpaceAfter = spacing
        items.push(...runs as any)
      } else {
        // 纯文本
        items.push({
          text: b,
          options: {
            bullet: { code: '2022' },
            fontSize,
            fontFace: PPT_FONT,
            color,
            breakLine: true as const,
            paraSpaceAfter: spacing,
            lineSpacingMultiple: 1.2,
          },
        })
      }
    }
    return items
  }

  /** 绘制通用标题栏 */
  private renderHeaderBar(slide: any, title: string) {
    slide.addShape('rect' as any, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: PPT_COLORS.darkBg } })
    slide.addText(title, {
      x: 0.5, y: 0.1, w: 12, h: 0.9,
      fontSize: 24, fontFace: PPT_FONT, color: PPT_COLORS.titleText, bold: true, valign: 'middle',
    })
  }

  private renderContentSlide(slide: any, s: PptSlide) {
    this.renderHeaderBar(slide, s.title)
    // 描述文字
    let bulletY = 1.5
    if (s.description) {
      slide.addText(s.description, {
        x: 0.6, y: 1.3, w: 12, h: 0.7,
        fontSize: 14, fontFace: PPT_FONT, color: '666666', lineSpacingMultiple: 1.3,
      })
      bulletY = 2.1
    }
    // 要点列表
    if (s.bullets && s.bullets.length > 0) {
      const items = this.makeBulletItems(s.bullets, 16, PPT_COLORS.bodyText, 16)
      slide.addText(items as any, { x: 0.8, y: bulletY, w: 11.5, h: 7.5 - bulletY - 0.3, valign: 'top' })
    }
  }

  private renderMetricsSlide(slide: any, s: PptSlide) {
    this.renderHeaderBar(slide, s.title)
    // 指标卡片 — 占据中间大面积
    const metrics = s.metrics || []
    const count = Math.max(metrics.length, 1)
    const gap = 0.3
    const totalW = 12.33
    const cardW = (totalW - gap * (count - 1)) / count
    const cardH = 2.6
    const cardY = 1.5
    metrics.forEach((m, i) => {
      const x = 0.5 + i * (cardW + gap)
      slide.addShape('rect' as any, { x, y: cardY, w: cardW, h: cardH, fill: { color: PPT_COLORS.cardBg }, rectRadius: 0.1 })
      slide.addShape('rect' as any, { x, y: cardY, w: cardW, h: 0.08, fill: { color: PPT_COLORS.teal } })
      slide.addText(m.value, { x, y: cardY + 0.3, w: cardW, h: 1.0, fontSize: 36, fontFace: PPT_FONT, color: PPT_COLORS.teal, bold: true, align: 'center', valign: 'middle' })
      slide.addText(m.label, { x, y: cardY + 1.3, w: cardW, h: 0.5, fontSize: 14, fontFace: PPT_FONT, color: '555555', bold: true, align: 'center', valign: 'middle' })
      if (m.description) {
        slide.addText(m.description, { x: x + 0.15, y: cardY + 1.8, w: cardW - 0.3, h: 0.5, fontSize: 11, fontFace: PPT_FONT, color: '999999', align: 'center' })
      }
    })
    // 下方补充要点
    if (s.bullets && s.bullets.length > 0) {
      const bulletsY = cardY + cardH + 0.4
      const items = this.makeBulletItems(s.bullets, 15, PPT_COLORS.bodyText, 12)
      slide.addText(items as any, { x: 0.8, y: bulletsY, w: 11.5, h: 7.5 - bulletsY - 0.3, valign: 'top' })
    }
  }

  private renderTwoColumnSlide(slide: any, s: PptSlide) {
    this.renderHeaderBar(slide, s.title)
    const colW = 5.9
    const colH = 5.7
    const colY = 1.4
    // 左栏
    if (s.left) {
      slide.addShape('rect' as any, { x: 0.5, y: colY, w: colW, h: colH, fill: { color: PPT_COLORS.cardBg }, rectRadius: 0.1 })
      slide.addShape('rect' as any, { x: 0.5, y: colY, w: colW, h: 0.06, fill: { color: PPT_COLORS.accent } })
      slide.addText(s.left.title, { x: 0.8, y: colY + 0.15, w: colW - 0.6, h: 0.5, fontSize: 16, fontFace: PPT_FONT, color: PPT_COLORS.accent, bold: true })
      if (s.left.bullets && s.left.bullets.length > 0) {
        const items = this.makeBulletItems(s.left.bullets, 12, PPT_COLORS.bodyText, 8)
        slide.addText(items as any, { x: 0.9, y: colY + 0.75, w: colW - 0.8, h: colH - 1.0, valign: 'top' })
      }
    }
    // 右栏
    if (s.right) {
      const rightX = 6.93
      slide.addShape('rect' as any, { x: rightX, y: colY, w: colW, h: colH, fill: { color: PPT_COLORS.cardBg }, rectRadius: 0.1 })
      slide.addShape('rect' as any, { x: rightX, y: colY, w: colW, h: 0.06, fill: { color: PPT_COLORS.teal } })
      slide.addText(s.right.title, { x: rightX + 0.3, y: colY + 0.15, w: colW - 0.6, h: 0.5, fontSize: 16, fontFace: PPT_FONT, color: PPT_COLORS.teal, bold: true })
      if (s.right.bullets && s.right.bullets.length > 0) {
        const items = this.makeBulletItems(s.right.bullets, 12, PPT_COLORS.bodyText, 8)
        slide.addText(items as any, { x: rightX + 0.4, y: colY + 0.75, w: colW - 0.8, h: colH - 1.0, valign: 'top' })
      }
    }
  }

  private renderGridSlide(slide: any, s: PptSlide) {
    this.renderHeaderBar(slide, s.title)
    const cards = s.cards || []
    const cols = cards.length <= 2 ? cards.length : cards.length <= 4 ? 2 : 3
    const rows = Math.ceil(cards.length / cols)
    const gap = 0.25
    const areaW = 12.33
    const areaH = 5.7
    const cardW = (areaW - gap * (cols - 1)) / cols
    const cardH = rows === 1 ? areaH : (areaH - gap * (rows - 1)) / rows
    const startY = 1.4
    // grid 内字号根据行数动态调整，防止溢出
    const titleFontSize = rows >= 2 ? 13 : 15
    const bulletFontSize = rows >= 2 ? 10 : 12
    const bulletSpacing = rows >= 2 ? 4 : 6
    cards.forEach((c, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = 0.5 + col * (cardW + gap)
      const y = startY + row * (cardH + gap)
      slide.addShape('rect' as any, { x, y, w: cardW, h: cardH, fill: { color: PPT_COLORS.cardBg }, rectRadius: 0.1 })
      slide.addShape('rect' as any, { x, y, w: cardW, h: 0.06, fill: { color: PPT_COLORS.accent } })
      slide.addText(c.title, { x: x + 0.15, y: y + 0.15, w: cardW - 0.3, h: 0.4, fontSize: titleFontSize, fontFace: PPT_FONT, color: PPT_COLORS.darkBg, bold: true })
      if (c.bullets && c.bullets.length > 0) {
        // grid 内 bullets 用纯文本（不解析加粗），保持紧凑
        const plainItems = c.bullets.slice(0, rows >= 2 ? 3 : 5).map((b) => ({
          text: b.replace(/\*\*/g, ''),
          options: {
            bullet: { code: '2022' },
            fontSize: bulletFontSize,
            fontFace: PPT_FONT,
            color: '555555',
            breakLine: true as const,
            paraSpaceAfter: bulletSpacing,
          },
        }))
        slide.addText(plainItems as any, { x: x + 0.2, y: y + 0.6, w: cardW - 0.4, h: cardH - 0.8, valign: 'top' })
      }
    })
  }

  private renderSummarySlide(slide: any, s: PptSlide) {
    this.renderHeaderBar(slide, s.title)
    // 要点
    const hasBullets = s.bullets && s.bullets.length > 0
    if (hasBullets) {
      const items = this.makeBulletItems(s.bullets!, 16, PPT_COLORS.bodyText, 16)
      slide.addText(items as any, { x: 0.8, y: 1.5, w: 11.5, h: 3.8, valign: 'top' })
    }
    // 标签 — 自适应宽度，防止溢出
    const tags = s.tags || []
    if (tags.length > 0) {
      const tagColors = [PPT_COLORS.accent, PPT_COLORS.teal, 'E67E22', '8E44AD', 'E74C3C', '27AE60']
      const gap = 0.25
      const maxTotalW = 12.33
      // 根据标签数量动态计算宽度
      const tagW = Math.min(2.5, (maxTotalW - gap * (tags.length - 1)) / tags.length)
      const totalTagW = tags.length * tagW + (tags.length - 1) * gap
      const startX = (13.33 - totalTagW) / 2
      const tagY = hasBullets ? 5.8 : 3.5
      tags.forEach((tag, i) => {
        const x = startX + i * (tagW + gap)
        const color = tagColors[i % tagColors.length]
        slide.addShape('rect' as any, { x, y: tagY, w: tagW, h: 0.6, fill: { color }, rectRadius: 0.3 })
        slide.addText(tag, { x, y: tagY, w: tagW, h: 0.6, fontSize: 13, fontFace: PPT_FONT, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true })
      })
    }
  }
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
