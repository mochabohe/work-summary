import api from './index'
import type { ApiResponse, ScanResult } from '@work-summary/shared'

/** 启动文件夹扫描 */
export async function startScan(folderPaths: string[], gitAuthor?: string, startDate?: string, endDate?: string) {
  const res = await api.post('/scan/start', { folderPaths, gitAuthor, startDate, endDate }) as unknown as ApiResponse<{ taskId: string }>
  return res.data!
}

/** 监听扫描进度 (SSE) */
export function listenScanProgress(
  taskId: string,
  onProgress: (event: any) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const eventSource = new EventSource(`/api/v1/scan/progress/${taskId}`)

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.phase === 'done') {
        onDone()
        eventSource.close()
      } else if (data.phase === 'error') {
        onError(data.error || '扫描出错')
        eventSource.close()
      } else {
        onProgress(data)
      }
    } catch {}
  }

  eventSource.onerror = () => {
    onError('连接断开')
    eventSource.close()
  }

  // 返回关闭函数
  return () => eventSource.close()
}

/** 获取扫描结果 */
export async function getScanResult(taskId: string) {
  const res = await api.get(`/scan/result/${taskId}`) as unknown as ApiResponse<ScanResult>
  return res.data!
}
