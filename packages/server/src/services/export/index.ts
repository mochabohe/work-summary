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
  /** 将幻灯片 JSON 渲染为横屏 PDF（与 PPT 视觉完全一致） */
  async toPdfSlides(data: PptData): Promise<Buffer> {
    if (!data || !Array.isArray(data.slides)) {
      throw new Error('无效的幻灯片数据')
    }

    return new Promise((resolve, reject) => {
      try {
        // 16:9 横屏，与 PPTX LAYOUT_WIDE 一致 (13.33" × 7.5" = 960 × 540 pt)
        const W = 960, H = 540
        const doc = new PDFDocument({
          size: [W, H],
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          bufferPages: true,
          info: { Title: data.title || '工作总结', Author: 'WorkSummary' },
        })

        const chunks: Buffer[] = []
        doc.on('data', (chunk: Buffer) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        const fonts = this.findChineseFonts()
        if (fonts.normal) doc.registerFont('CN', fonts.normal)
        if (fonts.bold) doc.registerFont('CN-Bold', fonts.bold)
        const fn = fonts.normal ? 'CN' : 'Helvetica'
        const fb = fonts.bold ? 'CN-Bold' : 'Helvetica-Bold'

        // 配色与 PPT 完全一致
        const C = {
          dark: '#1B2A4A', darkEnd: '#0f1c36',
          accent: '#4472C4', teal: '#2CB9C5',
          white: '#FFFFFF', text: '#333333',
          subtitle: '#B0BEC5', gray55: '#555555', gray99: '#999999',
          cardBg: '#F8FAFC',
        }

        let isFirst = true
        for (const s of data.slides) {
          if (!isFirst) doc.addPage()
          isFirst = false

          switch (s.type) {
            case 'title': case 'end':
              this.pdfDarkBg(doc, W, H, C)
              doc.font(fb).fontSize(36).fillColor(C.white)
              doc.text(s.title, 36, H / 2 - 50, { width: W - 72, align: 'center' })
              if (s.subtitle) {
                doc.font(fn).fontSize(20).fillColor(C.subtitle)
                doc.text(s.subtitle, 36, H / 2 + 20, { width: W - 72, align: 'center' })
              }
              break

            case 'section':
              this.pdfDarkBg(doc, W, H, C)
              doc.font(fb).fontSize(32).fillColor(C.white)
              doc.text(s.title, 36, H / 2 - 30, { width: W - 72, align: 'center' })
              doc.rect(W / 2 - 30, H / 2 + 20, 60, 4).fill(C.accent)
              break

            case 'content':
              this.pdfHeaderBar(doc, s.title, W, fb, C)
              {
                let cy = 108
                if (s.description) {
                  doc.font(fn).fontSize(14).fillColor('#666666')
                  doc.text(s.description, 43, 94, { width: W - 86 })
                  cy = doc.y + 10
                }
                if (s.bullets?.length) {
                  this.pdfBullets(doc, s.bullets, 58, cy, W - 116, H - cy - 22, fn, fb, 16, C)
                }
              }
              break

            case 'metrics':
              this.pdfHeaderBar(doc, s.title, W, fb, C)
              {
                const metrics = s.metrics || []
                const cnt = Math.max(metrics.length, 1)
                const gap = 22, totalW = W - 72
                const cW = (totalW - gap * (cnt - 1)) / cnt
                const cH = 187, cY = 108
                metrics.forEach((m, i) => {
                  const mx = 36 + i * (cW + gap)
                  doc.roundedRect(mx, cY, cW, cH, 7).fill(C.cardBg)
                  doc.rect(mx, cY, cW, 6).fill(C.teal)
                  doc.font(fb).fontSize(36).fillColor(C.teal)
                  doc.text(m.value, mx, cY + 22, { width: cW, align: 'center' })
                  doc.font(fb).fontSize(14).fillColor(C.gray55)
                  doc.text(m.label, mx, cY + 94, { width: cW, align: 'center' })
                  if (m.description) {
                    doc.font(fn).fontSize(11).fillColor(C.gray99)
                    doc.text(m.description, mx + 11, cY + 130, { width: cW - 22, align: 'center' })
                  }
                })
                if (s.bullets?.length) {
                  this.pdfBullets(doc, s.bullets, 58, cY + cH + 29, W - 116, H - (cY + cH + 29) - 22, fn, fb, 15, C)
                }
              }
              break

            case 'two-column':
              this.pdfHeaderBar(doc, s.title, W, fb, C)
              {
                const colW = 425, colH = 410, colY = 101
                if (s.left) {
                  const lx = 36
                  doc.roundedRect(lx, colY, colW, colH, 7).fill(C.cardBg)
                  doc.rect(lx, colY, colW, 4).fill(C.accent)
                  doc.font(fb).fontSize(16).fillColor(C.accent)
                  doc.text(s.left.title, lx + 22, colY + 14, { width: colW - 44 })
                  if (s.left.bullets?.length) {
                    this.pdfBullets(doc, s.left.bullets, lx + 29, colY + 54, colW - 58, colH - 72, fn, fb, 12, C)
                  }
                }
                if (s.right) {
                  const rx = 499
                  doc.roundedRect(rx, colY, colW, colH, 7).fill(C.cardBg)
                  doc.rect(rx, colY, colW, 4).fill(C.teal)
                  doc.font(fb).fontSize(16).fillColor(C.teal)
                  doc.text(s.right.title, rx + 22, colY + 14, { width: colW - 44 })
                  if (s.right.bullets?.length) {
                    this.pdfBullets(doc, s.right.bullets, rx + 29, colY + 54, colW - 58, colH - 72, fn, fb, 12, C)
                  }
                }
              }
              break

            case 'grid':
              this.pdfHeaderBar(doc, s.title, W, fb, C)
              {
                const cards = s.cards || []
                const cols = cards.length <= 2 ? cards.length : cards.length <= 4 ? 2 : 3
                const rows = Math.ceil(cards.length / cols)
                const gap = 18, areaW = W - 72, areaH = 410
                const gW = (areaW - gap * (cols - 1)) / cols
                const gH = rows === 1 ? areaH : (areaH - gap * (rows - 1)) / rows
                const startY = 101
                const tfs = rows >= 2 ? 13 : 15, bfs = rows >= 2 ? 10 : 12
                cards.forEach((c, i) => {
                  const col = i % cols, row = Math.floor(i / cols)
                  const gx = 36 + col * (gW + gap), gy = startY + row * (gH + gap)
                  doc.roundedRect(gx, gy, gW, gH, 7).fill(C.cardBg)
                  doc.rect(gx, gy, gW, 4).fill(C.accent)
                  doc.font(fb).fontSize(tfs).fillColor(C.dark)
                  doc.text(c.title, gx + 11, gy + 11, { width: gW - 22 })
                  if (c.bullets?.length) {
                    const maxB = rows >= 2 ? 3 : 5
                    let by = gy + 43
                    for (const b of c.bullets.slice(0, maxB)) {
                      doc.circle(gx + 19, by + bfs * 0.4, 2).fill(C.accent)
                      doc.font(fn).fontSize(bfs).fillColor(C.gray55)
                      doc.text(b.replace(/\*\*/g, ''), gx + 30, by, { width: gW - 44 })
                      by = doc.y + 4
                    }
                  }
                })
              }
              break

            case 'summary':
              this.pdfHeaderBar(doc, s.title, W, fb, C)
              if (s.bullets?.length) {
                this.pdfBullets(doc, s.bullets, 58, 108, W - 116, 274, fn, fb, 16, C)
              }
              {
                const tags = s.tags || []
                if (tags.length > 0) {
                  const tagColors = [C.accent, C.teal, '#E67E22', '#8E44AD', '#E74C3C', '#27AE60']
                  const tGap = 18, maxTW = W - 72
                  const tW = Math.min(180, (maxTW - tGap * (tags.length - 1)) / tags.length)
                  const totalTW = tags.length * tW + (tags.length - 1) * tGap
                  const sx = (W - totalTW) / 2
                  const tY = s.bullets?.length ? 418 : 252
                  tags.forEach((tag, i) => {
                    const tx = sx + i * (tW + tGap)
                    doc.roundedRect(tx, tY, tW, 43, 21.5).fill(tagColors[i % tagColors.length])
                    doc.font(fb).fontSize(13).fillColor(C.white)
                    doc.text(tag, tx, tY + 12, { width: tW, align: 'center' })
                  })
                }
              }
              break
          }
        }

        // 页码
        const range = doc.bufferedPageRange()
        const total = range.count
        for (let i = 0; i < total; i++) {
          doc.switchToPage(range.start + i)
          doc.font(fn).fontSize(8).fillColor(C.gray99)
          doc.text(`${i + 1} / ${total}`, 0, H - 20, { width: W, align: 'center' })
        }

        doc.end()
      } catch (err) {
        reject(err)
      }
    })
  }

  /** PDF 幻灯片：渐变深色背景 */
  private pdfDarkBg(doc: any, W: number, H: number, C: any) {
    const grad = doc.linearGradient(0, 0, W, H)
    grad.stop(0, C.dark).stop(1, C.darkEnd)
    doc.rect(0, 0, W, H).fill(grad)
  }

  /** PDF 幻灯片：深蓝标题栏 */
  private pdfHeaderBar(doc: any, title: string, W: number, fb: string, C: any) {
    doc.rect(0, 0, W, 79).fill(C.dark)
    doc.font(fb).fontSize(24).fillColor(C.white)
    doc.text(title, 36, 25, { width: W - 72 })
  }

  /** PDF 幻灯片：渲染要点列表（支持 **加粗** 富文本） */
  private pdfBullets(
    doc: any, bullets: string[], x: number, y: number, w: number, maxH: number,
    fn: string, fb: string, fontSize: number, C: any,
  ) {
    let curY = y
    for (const b of bullets) {
      if (curY > y + maxH) break
      doc.circle(x + 5, curY + fontSize * 0.4, 3).fill(C.accent)
      doc.fillColor(C.text)
      this.renderRichText(doc, b, fn, fb, fontSize, x + 16, curY, w - 16)
      curY = doc.y + 8
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

  /** 将 Markdown 内容转换为 PDF（使用 pdfkit，专业排版，配色与 PPT 一致） */
  async toPdf(markdownContent: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 56, bottom: 56, left: 56, right: 56 },
          bufferPages: true,
          info: {
            Title: '工作总结',
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

        // 主题色（与 PPT 保持一致）
        const C = {
          dark: '#1B2A4A',
          accent: '#4472C4',
          teal: '#2CB9C5',
          text: '#333333',
          gray: '#666666',
          lightBg: '#F8FAFC',
        }

        const pw = doc.page.width
        const ml = doc.page.margins.left
        const cw = pw - ml - doc.page.margins.right

        doc.font(fontNormal).fillColor(C.text)

        const lines = markdownContent.split('\n')
        let isFirstSection = true

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) {
            doc.moveDown(0.3)
            continue
          }

          // 自动分页检测
          if (doc.y > doc.page.height - doc.page.margins.bottom - 50) {
            doc.addPage()
          }

          // ## 二级标题 → 带强调色左边栏的区块标题
          if (trimmed.startsWith('## ')) {
            const title = this.stripMarkdown(trimmed.replace(/^##\s+/, ''))
            if (!isFirstSection) {
              doc.moveDown(0.8)
            }
            isFirstSection = false

            if (doc.y > doc.page.height - doc.page.margins.bottom - 80) {
              doc.addPage()
            }

            const y = doc.y
            const h = 32
            // 左侧强调色竖条
            doc.rect(ml, y, 4, h).fill(C.accent)
            // 浅色背景
            doc.rect(ml + 4, y, cw - 4, h).fill(C.lightBg)
            doc.font(fontBold).fontSize(15).fillColor(C.dark)
            doc.text(title, ml + 16, y + 7, { width: cw - 24 })
            doc.y = y + h + 12
            doc.fillColor(C.text).font(fontNormal)
          }
          // # 一级标题
          else if (trimmed.startsWith('# ')) {
            const title = this.stripMarkdown(trimmed.replace(/^#\s+/, ''))
            doc.moveDown(0.5)
            doc.font(fontBold).fontSize(22).fillColor(C.dark)
            doc.text(title, { align: 'center' })
            // 标题下方装饰线
            const lineY = doc.y + 4
            doc.rect(pw / 2 - 30, lineY, 60, 3).fill(C.accent)
            doc.y = lineY + 12
            doc.fillColor(C.text).font(fontNormal)
            isFirstSection = false
          }
          // ### 三级标题
          else if (trimmed.startsWith('### ')) {
            doc.moveDown(0.3)
            const title = this.stripMarkdown(trimmed.replace(/^###\s+/, ''))
            doc.font(fontBold).fontSize(12).fillColor(C.accent)
            doc.text(title, ml + 10)
            doc.fillColor(C.text).font(fontNormal)
            doc.moveDown(0.15)
          }
          // 序号列表: 1. **加粗小标题**：描述
          else if (/^\d+\.\s/.test(trimmed)) {
            const text = trimmed.replace(/^\d+\.\s+/, '')
            const numMatch = trimmed.match(/^(\d+)\./)
            const num = numMatch ? numMatch[1] : '1'
            const startY = doc.y

            // 绘制序号圆形指示器
            const cx = ml + 10
            const cy = startY + 7
            doc.circle(cx, cy, 8).fill(C.accent)
            doc.font(fontBold).fontSize(9).fillColor('#FFFFFF')
            doc.text(num, cx - 5, cy - 5, { width: 10, align: 'center', lineBreak: false })

            // 内容文本（从序号右侧开始）
            doc.fillColor(C.text)
            this.renderRichText(doc, text, fontNormal, fontBold, 11, ml + 28, startY, cw - 28)
            doc.moveDown(0.25)
          }
          // 无序列表
          else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const text = trimmed.replace(/^[-*]\s+/, '')
            const bulletY = doc.y + 5
            doc.circle(ml + 14, bulletY, 2.5).fill(C.accent)
            doc.fillColor(C.text)
            this.renderRichText(doc, text, fontNormal, fontBold, 11, ml + 26, bulletY - 5, cw - 26)
            doc.moveDown(0.15)
          }
          // 普通段落
          else {
            doc.fontSize(11).fillColor(C.text)
            this.renderRichText(doc, trimmed, fontNormal, fontBold, 11)
            doc.moveDown(0.2)
          }
        }

        // 添加页码和页眉装饰线
        const range = doc.bufferedPageRange()
        const total = range.count
        for (let i = 0; i < total; i++) {
          doc.switchToPage(range.start + i)
          // 页码
          doc.font(fontNormal).fontSize(9).fillColor(C.gray)
          doc.text(`${i + 1} / ${total}`, 0, doc.page.height - 36, {
            width: pw,
            align: 'center',
          })
          // 页眉装饰线（第 2 页起）
          if (i > 0) {
            doc.rect(ml, 42, cw, 1.5).fill(C.accent)
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
    doc: any,
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
