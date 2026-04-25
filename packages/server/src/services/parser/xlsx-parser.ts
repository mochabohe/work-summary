import * as XLSX from 'xlsx'
import fs from 'fs/promises'

/**
 * 把 xlsx / xls 工作簿转成给 LLM 用的纯文本。
 *
 * 关键点：
 * - 还原合并单元格：把合并区域左上角的值复制到整个区域，避免「车系/车型」这类
 *   多级表头被压成一行 tab 串后丢掉层级信息。
 * - 按 sheet 切片输出，每个 sheet 用 [[SHEET:name]] / [[/SHEET]] 包裹，
 *   方便上层 extractor 在文本超长时按 sheet 切分多次喂给 LLM。
 * - 单 sheet 字符上限：超长尾部截断 + 留可读的截断标记，避免一个超大表把整段
 *   投喂吞光 token。
 * - 整本工作簿字符上限：超长跳过后续 sheet 并标记，外层可据此触发分批策略。
 *
 * 输出格式示例：
 *   [[SHEET:总表]]
 *   车系\t车型\t选装包\t真实值
 *   X1\t标准版\tA\t100
 *   ...
 *   [[/SHEET]]
 */

const SHEET_TEXT_LIMIT = 200 * 1024   // 单 sheet 上限 200KB（约 6-8 万 token）
const TOTAL_TEXT_LIMIT = 600 * 1024   // 整本上限 600KB

export class XlsxParser {
  async parse(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    const chunks: string[] = []
    let totalLen = 0
    const skippedSheets: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet || !sheet['!ref']) continue

      if (totalLen >= TOTAL_TEXT_LIMIT) {
        skippedSheets.push(sheetName)
        continue
      }

      const sheetText = this.sheetToText(sheet)
      if (!sheetText) continue

      const remaining = TOTAL_TEXT_LIMIT - totalLen
      const block = this.wrapSheetBlock(sheetName, sheetText, remaining)
      chunks.push(block)
      totalLen += block.length
    }

    if (skippedSheets.length > 0) {
      chunks.push(`[[NOTE]] 文件过大，已跳过 ${skippedSheets.length} 个 sheet：${skippedSheets.join('、')}（建议拆分文件后重新上传）[[/NOTE]]`)
    }

    return chunks.join('\n\n')
  }

  /** 把单个 sheet 转文本：还原合并单元格 + 行制表符拼接 */
  private sheetToText(sheet: XLSX.WorkSheet): string {
    const ref = sheet['!ref']
    if (!ref) return ''
    const range = XLSX.utils.decode_range(ref)
    const merges = sheet['!merges'] ?? []

    const numRows = range.e.r - range.s.r + 1
    const numCols = range.e.c - range.s.c + 1
    if (numRows <= 0 || numCols <= 0) return ''

    // 防御：超大稀疏表（如几百万行的 !ref），直接退化按行扫描
    if (numRows > 50000 || numCols > 500) {
      return this.fallbackRowsToText(sheet)
    }

    // 1. 把表读成二维数组（含空 cell）
    const grid: string[][] = []
    for (let r = 0; r < numRows; r++) {
      const row: string[] = []
      for (let c = 0; c < numCols; c++) {
        const addr = XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c })
        row.push(this.formatCell(sheet[addr]?.v))
      }
      grid.push(row)
    }

    // 2. 展开合并单元格：把左上角值填进整个合并区域
    for (const merge of merges) {
      const tlAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })
      const tlValue = this.formatCell(sheet[tlAddr]?.v)
      if (!tlValue) continue
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          const gr = r - range.s.r
          const gc = c - range.s.c
          if (gr < 0 || gr >= numRows || gc < 0 || gc >= numCols) continue
          if (!grid[gr][gc]) grid[gr][gc] = tlValue
        }
      }
    }

    // 3. 拼成文本，去整行空白
    const lines = grid
      .map(row => row.map(c => c ?? '').join('\t').replace(/\s+$/, ''))
      .filter(line => line.length > 0)

    return lines.join('\n')
  }

  /** 退化方案：!ref 异常时按 sheet_to_json 走，至少不卡死 */
  private fallbackRowsToText(sheet: XLSX.WorkSheet): string {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    })
    return rows
      .map(row => row.map(cell => this.formatCell(cell)).join('\t').replace(/\s+$/, ''))
      .filter(line => line.length > 0)
      .join('\n')
  }

  /** 包裹 sheet 块；超长时按字符截断并写明丢失行数 */
  private wrapSheetBlock(sheetName: string, body: string, remainingBudget: number): string {
    const headerTag = `[[SHEET:${sheetName}]]`
    const footerTag = `[[/SHEET]]`
    const overhead = headerTag.length + footerTag.length + 4 // 含换行

    const limit = Math.min(SHEET_TEXT_LIMIT, Math.max(remainingBudget - overhead, 0))

    if (body.length <= limit) {
      return `${headerTag}\n${body}\n${footerTag}`
    }

    // 按字符截断，尽量按行边界
    const truncated = body.slice(0, limit)
    const lastNewline = truncated.lastIndexOf('\n')
    const safeBody = lastNewline > limit * 0.8 ? truncated.slice(0, lastNewline) : truncated

    const totalLines = body.split('\n').length
    const keptLines = safeBody.split('\n').length
    const droppedLines = totalLines - keptLines

    return `${headerTag}\n${safeBody}\n--- 表过长，已截断后 ${droppedLines} 行（共 ${totalLines} 行）---\n${footerTag}`
  }

  /** 单元格 → 字符串；日期统一成 YYYY-MM-DD */
  private formatCell(cell: unknown): string {
    if (cell == null) return ''
    if (cell instanceof Date) {
      if (Number.isNaN(cell.getTime())) return ''
      const y = cell.getFullYear()
      const m = String(cell.getMonth() + 1).padStart(2, '0')
      const d = String(cell.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    return String(cell).trim()
  }
}
