import weeklyGeneral from './builtin/weekly-general.json' with { type: 'json' }
import weeklyDeveloper from './builtin/weekly-developer.json' with { type: 'json' }
import monthlyGeneral from './builtin/monthly-general.json' with { type: 'json' }
import monthlyDeveloper from './builtin/monthly-developer.json' with { type: 'json' }
import quarterlyGeneral from './builtin/quarterly-general.json' with { type: 'json' }
import quarterlyDeveloper from './builtin/quarterly-developer.json' with { type: 'json' }
import yearlyGeneral from './builtin/yearly-general.json' with { type: 'json' }
import yearlyDeveloper from './builtin/yearly-developer.json' with { type: 'json' }
import type { AppMode, ReportPeriodType, ReportTemplate } from '@work-summary/shared'

/**
 * 内置模板注册表。
 *
 * 使用 import assertion 将 JSON 内联到 bundle，esbuild 打包时会把它们
 * 打进单文件，避免 Electron NSIS 安装后 node_modules 丢失问题
 * （见 skill electron-pnpm-server-bundle）。
 */
const BUILTIN: ReportTemplate[] = [
  weeklyGeneral,
  weeklyDeveloper,
  monthlyGeneral,
  monthlyDeveloper,
  quarterlyGeneral,
  quarterlyDeveloper,
  yearlyGeneral,
  yearlyDeveloper,
] as unknown as ReportTemplate[]

export class TemplateRegistry {
  /** 返回全部内置模板 */
  list(): ReportTemplate[] {
    return BUILTIN
  }

  /** 按 id 获取单个模板 */
  get(id: string): ReportTemplate | undefined {
    return BUILTIN.find(t => t.id === id)
  }

  /** 按模式+周期过滤 */
  listByMatch(mode?: AppMode, period?: ReportPeriodType): ReportTemplate[] {
    return BUILTIN.filter(t => {
      if (mode && !t.appliesTo.includes(mode)) return false
      if (period && t.period !== period) return false
      return true
    })
  }

  /** 为指定模式+周期推荐一个默认模板 id */
  getDefaultTemplateId(mode: AppMode, period: ReportPeriodType): string | undefined {
    const matched = this.listByMatch(mode, period)
    return matched[0]?.id
  }
}

export const templateRegistry = new TemplateRegistry()
