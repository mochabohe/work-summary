import api from './index'
import type { ApiResponse } from '@work-summary/shared'

export interface HistoryEntry {
  id: string
  title: string
  content?: string
  createdAt: string
  metadata: {
    docType: string
    gitAuthor: string
    dateRange: string
    projects: string[]
  }
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const res = await api.get('/history') as unknown as ApiResponse<HistoryEntry[]>
  return res.data || []
}

export async function saveHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<string> {
  const res = await api.post('/history', entry) as unknown as ApiResponse<{ id: string }>
  return res.data!.id
}

export async function getHistory(id: string): Promise<HistoryEntry> {
  const res = await api.get(`/history/${id}`) as unknown as ApiResponse<HistoryEntry>
  return res.data!
}

export async function deleteHistory(id: string): Promise<void> {
  await api.delete(`/history/${id}`)
}
