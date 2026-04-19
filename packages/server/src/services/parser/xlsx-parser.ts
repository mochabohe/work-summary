import * as XLSX from 'xlsx'
import fs from 'fs/promises'

/**
 * 把 xlsx / xls 工作簿转成纯文本：
 * - 多 sheet：用 "=== sheet 名 ===" 分隔
 * - 每行 cell 用制表符连接
 * - 空行自动去除
 *
 * 输出的文本直接交给 LLM 做工作项抽取，不要求固定列结构。
 */
export class XlsxParser {
  async parse(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath)
    // cellDates: true 让日期类 cell 读成 JS Date 对象，便于统一格式化为 YYYY-MM-DD，
    // 避免 LLM 拿到 45946 这种 Excel 序列号。
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    const chunks: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue

      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      })

      if (rows.length === 0) continue

      const rowTexts = rows
        .map(row =>
          row
            .map(cell => this.formatCell(cell))
            .join('\t')
            .trim(),
        )
        .filter(line => line.length > 0)

      if (rowTexts.length === 0) continue

      chunks.push(`=== ${sheetName} ===`)
      chunks.push(rowTexts.join('\n'))
    }

    return chunks.join('\n\n')
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
