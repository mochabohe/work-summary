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

  /** 深色页通用装饰元素 */
  private addDarkDecorations(slide: any, full = true) {
    slide.background = { color: '0a1628' }
    // 渐变覆盖层
    slide.addShape('rect' as any, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: PPT_COLORS.darkBg, transparency: 30 } })
    // 左上角装饰圆环
    slide.addShape('ellipse' as any, {
      x: -1.2, y: -1.2, w: 4.0, h: 4.0,
      line: { color: PPT_COLORS.accent, width: 1.5, transparency: 80 },
      fill: { type: 'none' },
    })
    if (full) {
      slide.addShape('ellipse' as any, {
        x: -0.5, y: -0.5, w: 2.6, h: 2.6,
        line: { color: PPT_COLORS.teal, width: 1, transparency: 85 },
        fill: { type: 'none' },
      })
    }
    // 右下角装饰圆环
    slide.addShape('ellipse' as any, {
      x: 10.8, y: 5.5, w: 3.2, h: 3.2,
      line: { color: PPT_COLORS.teal, width: 1.5, transparency: 82 },
      fill: { type: 'none' },
    })
  }

  private renderTitleSlide(slide: any, s: PptSlide) {
    this.addDarkDecorations(slide, true)
    // 上方装饰线
    slide.addShape('rect' as any, { x: 5.9, y: 2.2, w: 1.5, h: 0.04, fill: { color: PPT_COLORS.accent } })
    slide.addText(s.title, {
      x: 0.5, y: 2.5, w: 12.33, h: 1.5,
      fontSize: 36, fontFace: PPT_FONT, color: PPT_COLORS.titleText,
      bold: true, align: 'center', valign: 'middle',
    })
    if (s.subtitle) {
      slide.addText(s.subtitle, {
        x: 0.5, y: 4.2, w: 12.33, h: 1.0,
        fontSize: 20, fontFace: PPT_FONT, color: PPT_COLORS.subtitleText,
        align: 'center', valign: 'middle',
      })
    }
    // 下方装饰线
    slide.addShape('rect' as any, { x: 6.1, y: 5.5, w: 1.0, h: 0.03, fill: { color: PPT_COLORS.teal, transparency: 40 } })
  }

  private renderSectionSlide(slide: any, s: PptSlide) {
    this.addDarkDecorations(slide, false)
    slide.addText(s.title, {
      x: 0.5, y: 2.5, w: 12.33, h: 1.5,
      fontSize: 32, fontFace: PPT_FONT, color: PPT_COLORS.titleText,
      bold: true, align: 'center', valign: 'middle',
    })
    // 渐变强调条
    slide.addShape('rect' as any, { x: 5.7, y: 4.3, w: 2.0, h: 0.06, fill: { color: PPT_COLORS.accent } })
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

  /** 绘制左侧暗色侧栏 + 图标 + 标题（现代 PPT 版式） */
  private renderSidebar(slide: any, title: string) {
    const sideW = 3.7
    // 侧栏背景（深蓝渐变）
    slide.addShape('rect' as any, { x: 0, y: 0, w: sideW, h: 7.5, fill: { color: '0a1628' } })
    slide.addShape('rect' as any, { x: 0, y: 0, w: sideW, h: 7.5, fill: { color: PPT_COLORS.darkBg, transparency: 30 } })
    // 装饰圆环
    slide.addShape('ellipse' as any, {
      x: sideW - 1.5, y: -0.8, w: 2.2, h: 2.2,
      line: { color: PPT_COLORS.accent, width: 1, transparency: 80 }, fill: { type: 'none' },
    })
    slide.addShape('ellipse' as any, {
      x: -0.6, y: 5.5, w: 1.6, h: 1.6,
      line: { color: PPT_COLORS.teal, width: 1, transparency: 85 }, fill: { type: 'none' },
    })
    // 图标圆
    const iconX = sideW / 2 - 0.5
    slide.addShape('ellipse' as any, { x: iconX, y: 2.0, w: 1.0, h: 1.0, fill: { color: PPT_COLORS.accent } })
    // 图标字符（标题首字）
    slide.addText(title[0] || '', {
      x: iconX, y: 2.0, w: 1.0, h: 1.0,
      fontSize: 26, fontFace: PPT_FONT, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true,
    })
    // 标题
    slide.addText(title, {
      x: 0.2, y: 3.3, w: sideW - 0.4, h: 2.2,
      fontSize: 18, fontFace: PPT_FONT, color: 'FFFFFF', bold: true,
      align: 'center', valign: 'top', lineSpacingMultiple: 1.4,
    })
    // 装饰线
    slide.addShape('rect' as any, {
      x: sideW / 2 - 0.5, y: 5.6, w: 1.0, h: 0.04,
      fill: { color: PPT_COLORS.accent },
    })
    // 白色内容区背景
    slide.addShape('rect' as any, {
      x: sideW, y: 0, w: 13.33 - sideW, h: 7.5,
      fill: { color: 'FFFFFF' },
    })
  }

  private renderContentSlide(slide: any, s: PptSlide) {
    this.renderSidebar(slide, s.title)
    const cx = 4.2, cw = 8.6
    let cy = 0.5
    if (s.description) {
      slide.addText(s.description, {
        x: cx, y: cy, w: cw, h: 0.6,
        fontSize: 13, fontFace: PPT_FONT, color: '777777', italic: true,
      })
      cy += 0.7
    }
    if (s.bullets && s.bullets.length > 0) {
      this.renderBulletCards(slide, s.bullets, cx, cy, cw)
    }
  }

  /** 解析 **标题**：描述 格式 */
  private parseBulletParts(text: string): { title: string; desc: string } | null {
    const m = text.match(/^\*\*(.*?)\*\*[：:]\s*(.+)$/s)
    return m ? { title: m[1], desc: m[2] } : null
  }

  /** 渲染卡片式要点列表（左侧强调条 + 小标题独立展示） */
  private renderBulletCards(slide: any, bullets: string[], cx: number, startY: number, cw: number) {
    const maxItems = Math.min(bullets.length, 8)
    const gap = 0.12
    const cardH = Math.min(0.78, (7.0 - startY) / maxItems - gap)
    for (let i = 0; i < maxItems; i++) {
      const y = startY + i * (cardH + gap)
      if (y + cardH > 7.3) break
      // 卡片背景
      slide.addShape('rect' as any, { x: cx + 0.06, y, w: cw - 0.06, h: cardH, fill: { color: 'F0F4F9' }, rectRadius: 0.05 })
      // 左侧强调条
      slide.addShape('rect' as any, { x: cx, y, w: 0.06, h: cardH, fill: { color: PPT_COLORS.accent } })

      const parts = this.parseBulletParts(bullets[i])
      if (parts) {
        // 小标题行（带圆点指示器）
        const titleH = cardH * 0.45
        slide.addShape('ellipse' as any, {
          x: cx + 0.18, y: y + titleH / 2 - 0.05, w: 0.1, h: 0.1,
          fill: { color: PPT_COLORS.accent },
        })
        slide.addText(parts.title, {
          x: cx + 0.35, y, w: cw - 0.5, h: titleH,
          fontSize: 14, fontFace: PPT_FONT, color: PPT_COLORS.darkBg, bold: true, valign: 'middle',
        })
        // 分隔线
        slide.addShape('rect' as any, {
          x: cx + 0.22, y: y + titleH, w: 1.2, h: 0.015,
          fill: { color: PPT_COLORS.accentLight },
        })
        // 描述行
        const descRuns = this.parseRichTextRuns(parts.desc, 12, '555555')
        slide.addText(descRuns as any, {
          x: cx + 0.22, y: y + titleH + 0.02, w: cw - 0.35, h: cardH - titleH - 0.02,
          valign: 'middle',
        })
      } else {
        // 无标题格式：整行渲染
        const runs = this.parseRichTextRuns(bullets[i], 14, PPT_COLORS.bodyText)
        slide.addText(runs as any, { x: cx + 0.22, y, w: cw - 0.35, h: cardH, valign: 'middle' })
      }
    }
  }

  private renderMetricsSlide(slide: any, s: PptSlide) {
    this.renderSidebar(slide, s.title)
    const cx = 4.2, cw = 8.6
    // 指标卡片
    const metrics = s.metrics || []
    const count = Math.max(metrics.length, 1)
    const gap = 0.2
    const cardW = (cw - gap * (count - 1)) / count
    const cardH = 2.4, cardY = 0.5
    metrics.forEach((m, i) => {
      const x = cx + i * (cardW + gap)
      slide.addShape('rect' as any, { x, y: cardY, w: cardW, h: cardH, fill: { color: PPT_COLORS.cardBg }, rectRadius: 0.1 })
      slide.addShape('rect' as any, { x, y: cardY, w: cardW, h: 0.06, fill: { color: '3A8EF5' } })
      slide.addText(m.value, { x, y: cardY + 0.2, w: cardW, h: 0.9, fontSize: 34, fontFace: PPT_FONT, color: '3A8EF5', bold: true, align: 'center', valign: 'middle' })
      slide.addText(m.label, { x, y: cardY + 1.1, w: cardW, h: 0.5, fontSize: 13, fontFace: PPT_FONT, color: '555555', bold: true, align: 'center', valign: 'middle' })
      if (m.description) {
        slide.addText(m.description, { x: x + 0.1, y: cardY + 1.6, w: cardW - 0.2, h: 0.5, fontSize: 10, fontFace: PPT_FONT, color: '999999', align: 'center' })
      }
    })
    // 下方补充要点
    if (s.bullets && s.bullets.length > 0) {
      const bulletsY = cardY + cardH + 0.3
      const items = this.makeBulletItems(s.bullets, 13, PPT_COLORS.bodyText, 10)
      slide.addText(items as any, { x: cx + 0.2, y: bulletsY, w: cw - 0.4, h: 7.0 - bulletsY, valign: 'top' })
    }
  }

  private renderTwoColumnSlide(slide: any, s: PptSlide) {
    this.renderSidebar(slide, s.title)
    const cx = 4.2, cw = 8.6
    const colW = (cw - 0.3) / 2
    const colH = 6.5, colY = 0.5
    // 左栏
    if (s.left) {
      slide.addShape('rect' as any, { x: cx, y: colY, w: colW, h: colH, fill: { color: PPT_COLORS.cardBg }, rectRadius: 0.1 })
      // 栏头
      slide.addShape('rect' as any, { x: cx, y: colY, w: colW, h: 0.6, fill: { color: PPT_COLORS.accent }, rectRadius: 0.1 })
      slide.addShape('rect' as any, { x: cx, y: colY + 0.5, w: colW, h: 0.15, fill: { color: PPT_COLORS.cardBg } })
      slide.addText(s.left.title, { x: cx + 0.15, y: colY, w: colW - 0.3, h: 0.6, fontSize: 14, fontFace: PPT_FONT, color: 'FFFFFF', bold: true, valign: 'middle' })
      if (s.left.bullets && s.left.bullets.length > 0) {
        const items = this.makeBulletItems(s.left.bullets, 11, PPT_COLORS.bodyText, 6)
        slide.addText(items as any, { x: cx + 0.2, y: colY + 0.75, w: colW - 0.4, h: colH - 1.0, valign: 'top' })
      }
    }
    // 右栏
    if (s.right) {
      const rx = cx + colW + 0.3
      slide.addShape('rect' as any, { x: rx, y: colY, w: colW, h: colH, fill: { color: PPT_COLORS.cardBg }, rectRadius: 0.1 })
      slide.addShape('rect' as any, { x: rx, y: colY, w: colW, h: 0.6, fill: { color: PPT_COLORS.teal }, rectRadius: 0.1 })
      slide.addShape('rect' as any, { x: rx, y: colY + 0.5, w: colW, h: 0.15, fill: { color: PPT_COLORS.cardBg } })
      slide.addText(s.right.title, { x: rx + 0.15, y: colY, w: colW - 0.3, h: 0.6, fontSize: 14, fontFace: PPT_FONT, color: 'FFFFFF', bold: true, valign: 'middle' })
      if (s.right.bullets && s.right.bullets.length > 0) {
        const items = this.makeBulletItems(s.right.bullets, 11, PPT_COLORS.bodyText, 6)
        slide.addText(items as any, { x: rx + 0.2, y: colY + 0.75, w: colW - 0.4, h: colH - 1.0, valign: 'top' })
      }
    }
  }

  private renderGridSlide(slide: any, s: PptSlide) {
    this.renderSidebar(slide, s.title)
    const cx = 4.2, cw = 8.6
    const cards = s.cards || []
    const cols = cards.length <= 2 ? cards.length : cards.length <= 4 ? 2 : 3
    const rows = Math.ceil(cards.length / cols)
    const gap = 0.2
    const cardW = (cw - gap * (cols - 1)) / cols
    const areaH = 6.5
    const cardH = rows === 1 ? areaH : (areaH - gap * (rows - 1)) / rows
    const startY = 0.5
    const titleFs = rows >= 2 ? 12 : 14
    const bulletFs = rows >= 2 ? 9 : 11
    const bulletSp = rows >= 2 ? 3 : 5
    cards.forEach((c, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = cx + col * (cardW + gap)
      const y = startY + row * (cardH + gap)
      slide.addShape('rect' as any, { x, y, w: cardW, h: cardH, fill: { color: PPT_COLORS.cardBg }, rectRadius: 0.1 })
      slide.addShape('rect' as any, { x, y, w: cardW, h: 0.05, fill: { color: PPT_COLORS.accent } })
      slide.addText(c.title, { x: x + 0.12, y: y + 0.12, w: cardW - 0.24, h: 0.35, fontSize: titleFs, fontFace: PPT_FONT, color: PPT_COLORS.darkBg, bold: true })
      if (c.bullets && c.bullets.length > 0) {
        const plainItems = c.bullets.slice(0, rows >= 2 ? 3 : 5).map((b) => ({
          text: b.replace(/\*\*/g, ''),
          options: {
            bullet: { code: '2022' },
            fontSize: bulletFs,
            fontFace: PPT_FONT,
            color: '555555',
            breakLine: true as const,
            paraSpaceAfter: bulletSp,
          },
        }))
        slide.addText(plainItems as any, { x: x + 0.15, y: y + 0.5, w: cardW - 0.3, h: cardH - 0.65, valign: 'top' })
      }
    })
  }

  private renderSummarySlide(slide: any, s: PptSlide) {
    this.renderSidebar(slide, s.title)
    const cx = 4.2, cw = 8.6
    // 要点
    const hasBullets = s.bullets && s.bullets.length > 0
    if (hasBullets) {
      this.renderBulletCards(slide, s.bullets!, cx, 0.5, cw)
    }
    // 标签
    const tags = s.tags || []
    if (tags.length > 0) {
      const tagColors = [PPT_COLORS.accent, PPT_COLORS.teal, 'E67E22', '8E44AD', 'E74C3C', '27AE60']
      const gap = 0.2
      const tagW = Math.min(2.2, (cw - gap * (tags.length - 1)) / tags.length)
      const totalTW = tags.length * tagW + (tags.length - 1) * gap
      const startX = cx + (cw - totalTW) / 2
      const tagY = hasBullets ? 5.8 : 3.0
      tags.forEach((tag, i) => {
        const x = startX + i * (tagW + gap)
        const color = tagColors[i % tagColors.length]
        slide.addShape('rect' as any, { x, y: tagY, w: tagW, h: 0.55, fill: { color }, rectRadius: 0.28 })
        slide.addText(tag, { x, y: tagY, w: tagW, h: 0.55, fontSize: 12, fontFace: PPT_FONT, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true })
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
              this.pdfDarkBg(doc, W, H, C, true)
              // 上方装饰线
              { const lG = doc.linearGradient(W/2 - 55, 0, W/2 + 55, 0); lG.stop(0, C.accent).stop(1, C.teal); doc.rect(W/2 - 55, H/2 - 65, 110, 3).fill(lG) }
              doc.font(fb).fontSize(36).fillColor(C.white)
              doc.text(s.title, 36, H / 2 - 50, { width: W - 72, align: 'center' })
              if (s.subtitle) {
                doc.font(fn).fontSize(20).fillColor(C.subtitle)
                doc.text(s.subtitle, 36, H / 2 + 30, { width: W - 72, align: 'center' })
              }
              // 下方装饰线
              doc.rect(W/2 - 30, H/2 + 70, 60, 2).fillOpacity(0.4).fill(C.teal)
              doc.fillOpacity(1)
              break

            case 'section':
              this.pdfDarkBg(doc, W, H, C, false)
              doc.font(fb).fontSize(32).fillColor(C.white)
              doc.text(s.title, 36, H / 2 - 30, { width: W - 72, align: 'center' })
              { const sG = doc.linearGradient(W/2 - 50, 0, W/2 + 50, 0); sG.stop(0, C.accent).stop(1, C.teal); doc.rect(W/2 - 50, H/2 + 20, 100, 4).fill(sG) }
              break

            case 'content':
              {
                const sideW = this.pdfSidebar(doc, s.title, W, H, fn, fb, C)
                const cx = sideW + 18, cw = W - sideW - 36
                let cy = 18
                if (s.description) {
                  doc.font(fn).fontSize(12).fillColor('#777777')
                  doc.text(s.description, cx, cy, { width: cw })
                  cy = doc.y + 8
                }
                if (s.bullets?.length) {
                  this.pdfBulletCards(doc, s.bullets, cx, cy, cw, H - cy - 22, fn, fb, 14, C)
                }
              }
              break

            case 'metrics':
              {
                const sideW = this.pdfSidebar(doc, s.title, W, H, fn, fb, C)
                const cx = sideW + 18, cw = W - sideW - 36
                const metrics = s.metrics || []
                const cnt = Math.max(metrics.length, 1)
                const mGap = 14
                const mW = (cw - mGap * (cnt - 1)) / cnt
                const mH = 170, mY = 18
                metrics.forEach((m, i) => {
                  const mx = cx + i * (mW + mGap)
                  doc.roundedRect(mx, mY, mW, mH, 7).fill(C.cardBg)
                  const mBarG = doc.linearGradient(mx, 0, mx + mW, 0)
                  mBarG.stop(0, '#3A8EF5').stop(1, C.accent)
                  doc.rect(mx, mY, mW, 4).fill(mBarG)
                  doc.font(fb).fontSize(32).fillColor('#3A8EF5')
                  doc.text(m.value, mx, mY + 18, { width: mW, align: 'center' })
                  doc.font(fb).fontSize(12).fillColor(C.gray55)
                  doc.text(m.label, mx, mY + 82, { width: mW, align: 'center' })
                  if (m.description) {
                    doc.font(fn).fontSize(10).fillColor(C.gray99)
                    doc.text(m.description, mx + 8, mY + 118, { width: mW - 16, align: 'center' })
                  }
                })
                if (s.bullets?.length) {
                  this.pdfBulletCards(doc, s.bullets, cx, mY + mH + 20, cw, H - (mY + mH + 20) - 22, fn, fb, 13, C)
                }
              }
              break

            case 'two-column':
              {
                const sideW = this.pdfSidebar(doc, s.title, W, H, fn, fb, C)
                const cx = sideW + 18, cw = W - sideW - 36
                const colW = (cw - 14) / 2
                const colH = H - 36, colY = 18
                if (s.left) {
                  doc.roundedRect(cx, colY, colW, colH, 7).fill(C.cardBg)
                  // 栏头
                  const lhG = doc.linearGradient(cx, colY, cx + colW, colY)
                  lhG.stop(0, C.accent).stop(1, '#5b8bd6')
                  doc.roundedRect(cx, colY, colW, 36, 7).fill(lhG)
                  doc.rect(cx, colY + 28, colW, 12).fill(C.cardBg)
                  doc.font(fb).fontSize(13).fillColor(C.white)
                  doc.text(s.left.title, cx + 14, colY + 10, { width: colW - 28 })
                  if (s.left.bullets?.length) {
                    this.pdfBullets(doc, s.left.bullets, cx + 18, colY + 50, colW - 36, colH - 65, fn, fb, 11, C)
                  }
                }
                if (s.right) {
                  const rx = cx + colW + 14
                  doc.roundedRect(rx, colY, colW, colH, 7).fill(C.cardBg)
                  const rhG = doc.linearGradient(rx, colY, rx + colW, colY)
                  rhG.stop(0, C.teal).stop(1, '#3dd4e0')
                  doc.roundedRect(rx, colY, colW, 36, 7).fill(rhG)
                  doc.rect(rx, colY + 28, colW, 12).fill(C.cardBg)
                  doc.font(fb).fontSize(13).fillColor(C.white)
                  doc.text(s.right.title, rx + 14, colY + 10, { width: colW - 28 })
                  if (s.right.bullets?.length) {
                    this.pdfBullets(doc, s.right.bullets, rx + 18, colY + 50, colW - 36, colH - 65, fn, fb, 11, C)
                  }
                }
              }
              break

            case 'grid':
              {
                const sideW = this.pdfSidebar(doc, s.title, W, H, fn, fb, C)
                const cx = sideW + 18, cw = W - sideW - 36
                const cards = s.cards || []
                const cols = cards.length <= 2 ? cards.length : cards.length <= 4 ? 2 : 3
                const rows = Math.ceil(cards.length / cols)
                const gGap = 14, gAreaH = H - 36
                const gW = (cw - gGap * (cols - 1)) / cols
                const gH = rows === 1 ? gAreaH : (gAreaH - gGap * (rows - 1)) / rows
                const gStartY = 18
                const tfs = rows >= 2 ? 12 : 14, bfs = rows >= 2 ? 9 : 11
                cards.forEach((c, i) => {
                  const col = i % cols, row = Math.floor(i / cols)
                  const gx = cx + col * (gW + gGap), gy = gStartY + row * (gH + gGap)
                  doc.roundedRect(gx, gy, gW, gH, 7).fill(C.cardBg)
                  const gcG = doc.linearGradient(gx, 0, gx + gW, 0)
                  gcG.stop(0, C.accent).stop(1, C.teal)
                  doc.rect(gx, gy, gW, 4).fill(gcG)
                  doc.font(fb).fontSize(tfs).fillColor(C.dark)
                  doc.text(c.title, gx + 11, gy + 11, { width: gW - 22 })
                  if (c.bullets?.length) {
                    const maxB = rows >= 2 ? 3 : 5
                    let by = gy + 38
                    for (const b of c.bullets.slice(0, maxB)) {
                      doc.circle(gx + 19, by + bfs * 0.4, 2).fill(C.accent)
                      doc.font(fn).fontSize(bfs).fillColor(C.gray55)
                      doc.text(b.replace(/\*\*/g, ''), gx + 30, by, { width: gW - 44 })
                      by = doc.y + 3
                    }
                  }
                })
              }
              break

            case 'summary':
              {
                const sideW = this.pdfSidebar(doc, s.title, W, H, fn, fb, C)
                const cx = sideW + 18, cw = W - sideW - 36
                if (s.bullets?.length) {
                  this.pdfBulletCards(doc, s.bullets, cx, 18, cw, 340, fn, fb, 14, C)
                }
                const tags = s.tags || []
                if (tags.length > 0) {
                  const tagColors = [C.accent, C.teal, '#E67E22', '#8E44AD', '#E74C3C', '#27AE60']
                  const tagColorsEnd = ['#5b8bd6', '#3dd4e0', '#f0993c', '#a35bc4', '#f06b5e', '#3cc975']
                  const tGap = 14
                  const tW = Math.min(150, (cw - tGap * (tags.length - 1)) / tags.length)
                  const totalTW = tags.length * tW + (tags.length - 1) * tGap
                  const sx = cx + (cw - totalTW) / 2
                  const tY = s.bullets?.length ? 390 : 200
                  tags.forEach((tag, i) => {
                    const tx = sx + i * (tW + tGap)
                    const tgG = doc.linearGradient(tx, tY, tx + tW, tY + 38)
                    tgG.stop(0, tagColors[i % tagColors.length]).stop(1, tagColorsEnd[i % tagColorsEnd.length])
                    doc.roundedRect(tx, tY, tW, 38, 19).fill(tgG)
                    doc.font(fb).fontSize(12).fillColor(C.white)
                    doc.text(tag, tx, tY + 10, { width: tW, align: 'center' })
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

  /** PDF 幻灯片：绘制左侧暗色侧栏，返回内容区起始 x */
  private pdfSidebar(doc: any, title: string, W: number, H: number, fn: string, fb: string, C: any): number {
    const sideW = Math.round(W * 0.28)
    // 侧栏渐变背景
    const sideGrad = doc.linearGradient(0, 0, 0, H)
    sideGrad.stop(0, '#0a1628').stop(0.5, C.dark).stop(1, '#243b6a')
    doc.rect(0, 0, sideW, H).fill(sideGrad)
    // 装饰圆环
    doc.circle(sideW + 10, -20, 80).lineWidth(1.5).strokeOpacity(0.1).stroke(C.accent)
    doc.circle(-15, H + 10, 55).lineWidth(1).strokeOpacity(0.08).stroke(C.teal)
    doc.strokeOpacity(1)
    // 图标圆
    const iconR = 30
    const iconCx = sideW / 2
    const iconCy = H * 0.32
    const iconGrad = doc.linearGradient(iconCx - iconR, iconCy - iconR, iconCx + iconR, iconCy + iconR)
    iconGrad.stop(0, C.accent).stop(1, '#5b8bd6')
    doc.circle(iconCx, iconCy, iconR).fill(iconGrad)
    // 图标字符（标题首字）
    doc.font(fb).fontSize(22).fillColor(C.white)
    doc.text(title[0] || '', iconCx - iconR, iconCy - 11, { width: iconR * 2, align: 'center' })
    // 标题
    doc.font(fb).fontSize(15).fillColor(C.white)
    doc.text(title, 12, iconCy + iconR + 20, { width: sideW - 24, align: 'center', lineGap: 5 })
    // 装饰线
    const lineY = Math.min(doc.y + 14, H * 0.72)
    const lineGrad = doc.linearGradient(iconCx - 22, lineY, iconCx + 22, lineY)
    lineGrad.stop(0, C.accent).stop(1, C.teal)
    doc.rect(iconCx - 22, lineY, 44, 3).fill(lineGrad)
    // 白色内容区域
    doc.rect(sideW, 0, W - sideW, H).fill('#FFFFFF')
    return sideW
  }

  /** PDF 幻灯片：渲染卡片式要点列表（左侧强调条 + 小标题独立展示） */
  private pdfBulletCards(
    doc: any, bullets: string[], x: number, y: number, w: number, maxH: number,
    fn: string, fb: string, fontSize: number, C: any,
  ) {
    let curY = y
    const pad = 7
    const gap = 5
    const barW = 4
    const textX = x + barW + pad + 2
    const textW = w - barW - pad * 2 - 2

    for (const b of bullets) {
      if (curY > y + maxH - 20) break

      const parts = this.parseBulletParts(b)

      if (parts) {
        // 有小标题格式：拆分为标题行 + 分隔线 + 描述行
        const titleFontSize = fontSize
        const descFontSize = fontSize - 2
        doc.font(fb).fontSize(titleFontSize)
        const titleH = doc.heightOfString(parts.title, { width: textW - 14, lineGap: 2 })
        doc.font(fn).fontSize(descFontSize)
        const descH = doc.heightOfString(parts.desc.replace(/\*\*/g, ''), { width: textW, lineGap: 3 })
        const sepH = 6 // 分隔线区域高度
        const cardH = Math.max(pad + titleH + sepH + descH + pad, 36)

        // 卡片背景
        doc.roundedRect(x + barW, curY, w - barW, cardH, 4).fill('#F0F4F9')
        // 左侧渐变强调条
        const barG = doc.linearGradient(x, curY, x, curY + cardH)
        barG.stop(0, C.accent).stop(1, C.teal)
        doc.rect(x, curY, barW, cardH).fill(barG)

        // 小标题行（带圆点指示器）
        const titleY = curY + pad
        const dotGrad = doc.linearGradient(textX - 2, titleY + titleFontSize * 0.3, textX + 6, titleY + titleFontSize * 0.3 + 4)
        dotGrad.stop(0, C.accent).stop(1, C.teal)
        doc.circle(textX + 2, titleY + titleFontSize * 0.4, 3).fill(dotGrad)
        doc.font(fb).fontSize(titleFontSize).fillColor(C.dark)
        doc.text(parts.title, textX + 12, titleY, { width: textW - 14, lineGap: 2 })

        // 分隔线
        const sepY = titleY + titleH + 2
        const sepGrad = doc.linearGradient(textX, sepY, textX + 70, sepY)
        sepGrad.stop(0, C.accent).stop(0.6, C.teal).stop(1, '#F0F4F9')
        doc.rect(textX, sepY, 70, 1.2).fill(sepGrad)

        // 描述行
        const descY = sepY + sepH
        doc.fillColor(C.gray55 || '#555555')
        this.renderRichText(doc, parts.desc, fn, fb, descFontSize, textX, descY, textW)

        curY += cardH + gap
      } else {
        // 无标题格式：整行渲染
        const plainText = b.replace(/\*\*/g, '')
        doc.font(fn).fontSize(fontSize)
        const textH = doc.heightOfString(plainText, { width: textW, lineGap: 3 })
        const cardH = Math.max(textH + pad * 2, 24)
        // 卡片背景
        doc.roundedRect(x + barW, curY, w - barW, cardH, 4).fill('#F0F4F9')
        // 左侧渐变强调条
        const barG = doc.linearGradient(x, curY, x, curY + cardH)
        barG.stop(0, C.accent).stop(1, C.teal)
        doc.rect(x, curY, barW, cardH).fill(barG)
        // 渲染文本
        doc.fillColor(C.text)
        this.renderRichText(doc, b, fn, fb, fontSize, textX, curY + pad, textW)
        curY += cardH + gap
      }
    }
  }

  /** PDF 幻灯片：渐变深色背景（含装饰元素） */
  private pdfDarkBg(doc: any, W: number, H: number, C: any, full = true) {
    const grad = doc.linearGradient(0, 0, W, H)
    grad.stop(0, '#0a1628').stop(0.4, C.dark).stop(1, '#243b6a')
    doc.rect(0, 0, W, H).fill(grad)
    // 左上角装饰圆环
    doc.circle(-60, -60, 200).lineWidth(1.5).strokeOpacity(0.12).stroke(C.accent)
    if (full) {
      doc.circle(20, 20, 130).lineWidth(1).strokeOpacity(0.08).stroke(C.teal)
    }
    // 右下角装饰圆环
    doc.circle(W + 40, H + 40, 160).lineWidth(1.5).strokeOpacity(0.1).stroke(C.teal)
    doc.strokeOpacity(1) // 恢复默认
  }

  /** PDF 幻灯片：深蓝标题栏（含底部渐变装饰条） */
  private pdfHeaderBar(doc: any, title: string, W: number, fb: string, C: any) {
    doc.rect(0, 0, W, 79).fill(C.dark)
    // 底部渐变装饰条
    const barGrad = doc.linearGradient(36, 76, 126, 76)
    barGrad.stop(0, C.accent).stop(1, C.teal)
    doc.rect(36, 76, 90, 3).fill(barGrad)
    doc.font(fb).fontSize(24).fillColor(C.white)
    doc.text(title, 36, 25, { width: W - 72 })
  }

  /** PDF 幻灯片：渲染要点列表（渐变圆点 + 支持 **加粗** 富文本） */
  private pdfBullets(
    doc: any, bullets: string[], x: number, y: number, w: number, maxH: number,
    fn: string, fb: string, fontSize: number, C: any,
  ) {
    let curY = y
    for (const b of bullets) {
      if (curY > y + maxH) break
      // 渐变圆点
      const dotR = 3.5
      const dotGrad = doc.linearGradient(x + 5 - dotR, curY + fontSize * 0.4 - dotR, x + 5 + dotR, curY + fontSize * 0.4 + dotR)
      dotGrad.stop(0, C.accent).stop(1, C.teal)
      doc.circle(x + 5, curY + fontSize * 0.4, dotR).fill(dotGrad)
      doc.fillColor(C.text)
      this.renderRichText(doc, b, fn, fb, fontSize, x + 16, curY, w - 16)
      curY = doc.y + 9
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
