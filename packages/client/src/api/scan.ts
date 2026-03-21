import api from './index'
import type { ApiResponse, ScanResult } from '@work-summary/shared'

/** 启动文件夹扫描 */
export async function startScan(
  folderPaths: string[],
  gitAuthor?: string,
  startDate?: string,
  endDate?: string,
  forceRescan = false,
) {
  const res = await api.post('/scan/start', { folderPaths, gitAuthor, startDate, endDate, forceRescan }) as unknown as ApiResponse<{ taskId: string; fromCache: boolean; savedAt?: number }>
  return res.data!
}

/** 监听扫描进度 (SSE + 轮询兜底) */
export function listenScanProgress(
  taskId: string,
  onProgress: (event: any) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  let finished = false
  const eventSource = new EventSource(`/api/v1/scan/progress/${taskId}`)

  const finish = (callback: () => void) => {
    if (finished) return
    finished = true
    eventSource.close()
    clearInterval(pollTimer)
    callback()
  }

  // SSE 事件监听
  eventSource.onmessage = (event) => {
    if (finished) return
    try {
      const data = JSON.parse(event.data)
      if (data.phase === 'done') {
        finish(onDone)
      } else if (data.phase === 'error') {
        finish(() => onError(data.error || '扫描出错'))
      } else {
        onProgress(data)
      }
    } catch {}
  }

  eventSource.onerror = () => {
    // SSE 断开时不立即报错，等轮询兜底判断
    // 如果扫描已完成，轮询会发现并触发 onDone
    if (finished) return
  }

  // 轮询兜底：每 2 秒检查扫描结果，防止 SSE done 事件丢失
  const pollTimer = setInterval(async () => {
    if (finished) return
    try {
      const res = await api.get(`/scan/result/${taskId}`) as unknown as ApiResponse<ScanResult>
      if (res.data) {
        // 扫描已完成，轮询发现结果
        finish(onDone)
      }
    } catch {
      // 轮询失败静默忽略，继续等待
    }
  }, 2000)

  // 返回关闭函数
  return () => finish(() => {})
}

/** 获取扫描结果 */
export async function getScanResult(taskId: string) {
  const res = await api.get(`/scan/result/${taskId}`) as unknown as ApiResponse<ScanResult>
  return res.data!
}
