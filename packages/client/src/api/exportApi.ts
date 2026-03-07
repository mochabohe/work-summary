/** 导出为 Markdown 文件下载 */
export function exportMarkdown(content: string, filename = 'work-summary') {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(blob, `${filename}.md`)
}

/** 导出为 Word 文档 */
export async function exportDocx(content: string, filename = 'work-summary') {
  const response = await fetch('/api/v1/export/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, filename }),
  })

  if (!response.ok) {
    throw new Error('导出 Word 失败')
  }

  const blob = await response.blob()
  downloadBlob(blob, `${filename}.docx`)
}

/** 导出为 PDF */
export async function exportPdf(content: string, filename = 'work-summary') {
  const response = await fetch('/api/v1/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, filename }),
  })

  if (!response.ok) {
    throw new Error('导出 PDF 失败')
  }

  const blob = await response.blob()
  downloadBlob(blob, `${filename}.pdf`)
}

/** 触发浏览器下载 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
