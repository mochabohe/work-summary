import api from './index'
import type { ApiResponse, ProjectAnalysis } from '@work-summary/shared'

/** 分析单个项目 */
export async function analyzeProject(projectPath: string, gitAuthor: string, startDate: string, endDate: string) {
  const res = await api.post('/analysis/project', {
    projectPath,
    gitAuthor,
    startDate,
    endDate,
  }) as unknown as ApiResponse<ProjectAnalysis>
  return res.data!
}
