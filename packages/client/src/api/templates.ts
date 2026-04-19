import api from './index'
import type { ApiResponse, AppMode, ReportPeriodType, ReportTemplate } from '@work-summary/shared'

/** 列出报告模板（可按模式+周期过滤） */
export async function listTemplates(
  mode?: AppMode,
  period?: ReportPeriodType,
): Promise<ReportTemplate[]> {
  const params = new URLSearchParams()
  if (mode) params.set('mode', mode)
  if (period) params.set('period', period)
  const res = await api.get(`/workspace/templates?${params.toString()}`) as unknown as ApiResponse<ReportTemplate[]>
  return res.data ?? []
}

/** 推导周期默认日期范围 */
export async function getPeriodRange(
  type: ReportPeriodType,
  anchor?: string,
): Promise<{ start: string; end: string; label: string }> {
  const params = new URLSearchParams({ type })
  if (anchor) params.set('anchor', anchor)
  const res = await api.get(`/workspace/period-range?${params.toString()}`) as unknown as ApiResponse<{
    start: string; end: string; label: string
  }>
  if (!res.success || !res.data) throw new Error(res.error || '推导周期失败')
  return res.data
}
