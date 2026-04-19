# 通用模式设计：非研发岗位支持 + 多周期模板

**日期**：2026-04-19
**作者**：dengchan + Claude
**状态**：待评审

---

## 背景与目标

当前 work-summary 仅支持研发岗位：必须配置 Git 用户名，通过扫描代码仓库统计个人贡献，再用 LLM 生成总结。非研发岗位（产品、运营、设计、行政等）没有 Git 账号，完全无法使用该工具。

本次优化的两个目标：

1. **扩展用户群**：让非研发岗位也能用，数据来源改为「手动输入 + 文档导入」
2. **扩展产出能力**：从单一总结升级为周报/月报/季报/年报多周期模板

约束：研发模式现有工作流必须**零感知、零中断**。

---

## 关键决策

| 决策点 | 选择 | 备选 | 理由 |
|---|---|---|---|
| 数据来源 | 手动输入 + 文档导入 | 飞书/日历对接 | 飞书企业内部接入复杂，首版避开外部依赖 |
| 入口设计 | 模式切换（研发/通用） | 统一首页多入口 | 切换更聚焦，避免界面混乱 |
| 文档处理深度 | 结构化提取 + 人工校准 | 纯文本喂 LLM | 准确性更高，用户能感知抽取质量 |
| 周期范围 | 周/月/季/年多模板 | 仅个人单次总结 | 复用价值更高，研发岗也受益 |

---

## 总体架构

### 数据抽象：`WorkItem`

两种模式最终汇聚到同一数据结构，下游 Generate/Export **无需感知数据来源**：

```ts
interface WorkItem {
  id: string
  source: 'git' | 'document' | 'manual'
  title: string                                  // 工作项名称
  category?: string                              // 分类: 项目/活动/事务/学习
  date: { start: string; end?: string }
  metrics?: { label: string; value: string }[]  // 数据成果
  description: string                            // 详细说明
  tags?: string[]
  raw?: unknown                                  // 原始数据（可选，便于追溯）
}
```

- **研发模式**：现有 `ProjectAnalysis` → adapter 转 `WorkItem[]`
- **通用模式**：手动输入 / 文档解析 → 直接产出 `WorkItem[]`

### 报告周期：`ReportPeriod`

```ts
interface ReportPeriod {
  type: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
  start: string   // ISO date
  end: string
  label: string   // "2026-W16" / "2026-04" / "2026-Q2" / "2026"
}
```

### 报告模板：`ReportTemplate`

```ts
interface ReportTemplate {
  id: string
  name: string
  period: ReportPeriod['type']
  appliesTo: ('developer' | 'general')[]
  sections: TemplateSection[]
  promptHints: string             // 注入 LLM 的周期专属提示
  pptTemplate?: string            // 对应 PPT 模板 id
}

interface TemplateSection {
  key: string
  title: string
  required: boolean
  hint: string
}
```

### `GenerateRequest` 改造（向后兼容）

```ts
interface GenerateRequest {
  workItems?: WorkItem[]            // 新增，通用入口
  projects?: ProjectAnalysis[]      // 保留
  period?: ReportPeriod             // 新增
  templateId?: string               // 新增
  // ...其他字段不变
}
```

后端检测 `workItems` 存在则走新 prompt path，否则走原 `projects` path —— 研发模式现有 generate 路径**零修改**。

---

## 客户端结构

### 新增/调整路由

```
/onboarding              身份选择（首次进入）
/scan                    研发模式（保留）
/workspace               通用模式主入口
  ├─ /workspace/import   文档导入子页
  └─ /workspace/manual   手动录入子页
/generate                生成页（增加周期选择器）
/preview                 预览（不变）
/settings                设置（增加模式切换 + 模板管理 tab）
```

Home 页根据 `appStore.mode` 跳到 `/workspace` 或 `/scan`。

### 新增 Store

- `useAppStore`：`mode: 'developer' | 'general'`，持久化
- `useWorkspaceStore`：`workItems: WorkItem[]`，持久化，支持按时间窗/分类筛选
- `useTemplateStore`：内置模板 + 用户自定义模板（复制改）

### 视图清单

| 视图 | 状态 | 说明 |
|---|---|---|
| OnboardingView | 新增 | 首次进入选择身份 |
| WorkspaceView | 新增 | 通用模式主页（工作项列表 + 操作） |
| WorkspaceImportView | 新增 | 文件上传 + 抽取结果校准 |
| WorkspaceManualView | 新增 | 表格式录入 |
| GenerateView | 改造 | 增加 ReportPeriod 选择器 |
| SettingsView | 改造 | 模式切换 + 模板管理 tab |
| 其余 | 不变 | |

---

## 服务端结构

```
packages/server/src/
├── routes/
│   ├── workspace.routes.ts         【新增】
│   │   ├─ POST /api/workspace/parse-document     文件→纯文本
│   │   ├─ POST /api/workspace/extract-items      文本→WorkItem[] 草稿
│   │   ├─ POST /api/workspace/import-excel       Excel 批量导入
│   │   └─ GET  /api/workspace/templates          列出模板
│   ├── generate.routes.ts          【改造】支持 workItems 入参
│   ├── history.routes.ts           【改造】记录增加 mode + period 字段
│   └── ...其余不变
├── services/
│   ├── parser/
│   │   ├─ excel-parser.ts          【新增】SheetJS 解析 xlsx
│   │   └─ ...复用现有 docx/pdf/pptx
│   ├── workspace/                  【新增】
│   │   ├─ extractor.ts             文档→WorkItem 抽取（调 LLM）
│   │   └─ adapter.ts               ProjectAnalysis→WorkItem 适配
│   ├── templates/                  【新增】
│   │   ├─ builtin/                 4 周期 × 2 模式 JSON
│   │   ├─ registry.ts              加载/合并用户模板
│   │   └─ filter.ts                按周期+时间窗筛 WorkItem
│   └── llm/
│       └─ prompt-builder.ts        【改造】根据 template + workItems 构造 prompt
```

### 关键接口契约

**`POST /api/workspace/parse-document`**
```ts
// req: multipart/form-data, file
// res
{ filename: string; text: string; type: string }
```

**`POST /api/workspace/extract-items`**
```ts
// req
{ text: string; period?: ReportPeriod; hint?: string }
// res
{ items: WorkItem[]; tokensUsed: number }
```
LLM 用 JSON mode（DeepSeek 支持），prompt 要求严格按 schema 输出，前端做 zod 校验。校验失败提示「自动抽取失败，请手动录入」。每条 item 携带 `confidence` 字段，前端低置信度高亮。

**`POST /api/workspace/import-excel`**
```ts
// req: multipart/form-data
// res
{ items: WorkItem[]; skipped: number }
```
首版固定列模板（标题/分类/开始日期/结束日期/数据成果/详细说明/标签），可下载。

---

## 模板系统

### 内置模板（首版 8 个）

| 周期 | 章节骨架 | developer 变体侧重 | general 变体侧重 |
|---|---|---|---|
| 周报 | 本周完成 / 遇到问题 / 下周计划 | 代码贡献量、技术难点 | 完成事项数量、协作方 |
| 月报 | 核心成果 / 数据亮点 / 问题反思 / 下月目标 | 上线功能、性能优化 | 业务指标、项目里程碑 |
| 季报 | 目标回顾 / 关键产出 / 数据成果 / Q+1 规划 | 架构演进、技术沉淀 | OKR 完成度、对外影响 |
| 年报 | 年度总览 / 重点项目 / 个人成长 / 来年规划 | 技术栈拓展、影响力 | 业务结果、能力跃迁 |

### PPT 模板映射

`template.sections` → PPT 章节，一个模板对应一套 PPT 样式（封面、配色随周期）。首版 4 套（周/月/季/年），不分 dev/general。

### 用户自定义

- 内置模板存 `server/services/templates/builtin/*.json`，打包内联
- 用户模板：复制内置模板后修改，存 localStorage
- 首版**不支持**从零创建（YAGNI）

---

## 历史记录兼容

`HistoryRecord` 增加 `mode: 'developer' | 'general'` 和 `period?: ReportPeriod` 字段。启动时 migration：检测无 `mode` 字段的老记录，补 `mode='developer', period={type:'custom', ...}`。

---

## Electron 打包

新增的 templates JSON 通过 esbuild 内联打包（沿用 `electron-pnpm-server-bundle` skill 经验，避免 node_modules junction 问题）。无新增 native 依赖；SheetJS 是纯 JS。

---

## 分阶段交付（5-7 个工作日）

| Phase | 工作量 | 内容 | 验收标准 |
|---|---|---|---|
| 1 | 1.5d | shared 类型 + appStore + onboarding + 模式切换 | 两种模式能切换、持久化生效 |
| 2 | 2d | workspace.routes + extractor + Excel parser + 通用模式 3 个视图 | 能通过手输/Word/PDF/Excel 产出 WorkItem[] |
| 3 | 1.5d | 8 个内置模板 + Prompt Builder 改造 + 周期选择 | 能按周/月/季/年生成不同结构的报告 |
| 4 | 1d | 4 套 PPT 模板 + history 兼容 migration | 4 种周期都能导出对应 PPT，老记录可读 |
| 5 | 1d | 模板管理 tab + 低置信度引导 + E2E 测试 | 两种模式全流程跑通 |

---

## 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| LLM 抽取 WorkItem JSON 格式不稳定 | zod 校验 + 失败降级到手动录入 + few-shot 示例 |
| Excel 导入列名不统一 | 首版固定列模板下载；后续再加列映射 |
| 用户不理解「工作项」概念 | 录入页预置 3-5 条示例；首次进入 tooltip 解说 |
| 老用户升级后历史记录不兼容 | 启动时 migration 补默认字段 |
| 改动 generate.routes 引入研发模式回归 | 保守策略：检测 `workItems` 字段决定走新/旧 path，旧 path 完全不动 |

---

## YAGNI（明确不做）

- ❌ 从零创建自定义模板（仅支持复制内置改）
- ❌ 团队协作 / 多人共享工作项
- ❌ 飞书日历 / OA 系统对接
- ❌ SQLite 本地数据库（localStorage 足够）
- ❌ WorkItem 的全文搜索（首版按时间+分类筛足够）

---

## 成功标准

1. 非研发岗位用户**无需任何配置**（不需要 Git），5 分钟内产出第一份周报
2. 研发岗位用户升级后，**原工作流零感知、零中断**
3. 同一份 WorkItem 数据，切换周/月/季模板可生成 4 种不同结构的报告
4. 通用模式下，文档自动抽取的 WorkItem 准确率 ≥ 70%（剩余由用户校准）
