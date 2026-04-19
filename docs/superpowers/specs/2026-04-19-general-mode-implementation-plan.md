# 实施计划：通用模式 + 多周期模板

**关联设计稿**：[2026-04-19-general-mode-design.md](./2026-04-19-general-mode-design.md)
**预计工作量**：5-7 个工作日
**进度跟踪**：[../../progress.md](../../progress.md)（待创建）

---

## 总体策略

- **小步提交**：每完成一个文件粒度的子任务即提交一次，便于 review 和回滚
- **类型先行**：每个 Phase 先改 `shared` 类型，再改 server，再改 client
- **零回归保证**：研发模式所有现有路径任何改动后必须能跑通原 Git scan 流程
- **依赖关系**：Phase 1 → 2 → 3 → 4 → 5 严格串行，因下游依赖上游产出的类型/接口

---

## Phase 1 · 地基（1.5 d）

**目标**：用户能选择身份并切换模式，状态能持久化。

### 1.1 新增 shared 类型 [packages/shared/src/index.ts](../../../packages/shared/src/index.ts)
- [ ] 新增 `AppMode = 'developer' | 'general'`
- [ ] 新增 `WorkItem` 接口（含 `id` / `source` / `title` / `category` / `date` / `metrics` / `description` / `tags` / `raw`）
- [ ] 新增 `ReportPeriod` 接口
- [ ] 新增 `ReportTemplate` / `TemplateSection` 接口
- [ ] 扩展 `GenerateRequest`：可选 `workItems` / `period` / `templateId`
- [ ] 扩展 `HistoryRecord`：可选 `mode` / `period`
- [ ] `pnpm --filter @work-summary/shared build` 通过

### 1.2 新增 useAppStore [packages/client/src/stores/app.ts](../../../packages/client/src/stores/app.ts)（新建）
- [ ] `mode: Ref<AppMode>`，从 localStorage 恢复
- [ ] `setMode(m)` 持久化
- [ ] `firstVisit: Ref<boolean>` 标记是否需要引导

### 1.3 OnboardingView [packages/client/src/views/OnboardingView.vue](../../../packages/client/src/views/OnboardingView.vue)（新建）
- [ ] 两张大卡片：「研发岗位（需 Git 配置）」 / 「通用岗位（手动/文档）」
- [ ] 选择后调 `appStore.setMode` 并跳转
- [ ] 简洁说明每种模式的输入要求

### 1.4 路由调整 [packages/client/src/router/index.ts](../../../packages/client/src/router/index.ts)
- [ ] 新增 `/onboarding` 路由
- [ ] 全局 beforeEach：`firstVisit && !mode` 时跳 `/onboarding`
- [ ] 新增 `/workspace`（占位组件）

### 1.5 Home/Settings 模式切换 UI
- [ ] [HomeView.vue](../../../packages/client/src/views/HomeView.vue) 顶栏显示当前模式 + "切换"按钮
- [ ] [SettingsView.vue](../../../packages/client/src/views/SettingsView.vue) 新增「模式」分组

### 验收
- [ ] 清 localStorage 后启动跳转到 onboarding
- [ ] 选择研发模式 → 进入原 Home/Scan 流程
- [ ] 选择通用模式 → 跳转 `/workspace`（占位页）
- [ ] Settings 切换模式后立即生效

---

## Phase 2 · 通用模式数据采集（2 d）

**目标**：用户能通过手输/Word/PDF/Excel 产出 WorkItem[] 并管理。

### 2.1 server: workspace 服务模块
- [ ] [packages/server/src/services/workspace/extractor.ts](../../../packages/server/src/services/workspace/extractor.ts)（新建）
  - 输入文档纯文本，调 LLM (DeepSeek JSON mode)，输出 WorkItem[]
  - few-shot 示例 + zod schema 校验
  - 失败返回错误码，前端降级到手动
- [ ] [packages/server/src/services/workspace/adapter.ts](../../../packages/server/src/services/workspace/adapter.ts)（新建）
  - `projectAnalysisToWorkItems(p: ProjectAnalysis): WorkItem[]`
- [ ] [packages/server/src/services/parser/excel-parser.ts](../../../packages/server/src/services/parser/excel-parser.ts)（新建）
  - SheetJS（xlsx 包）解析；固定列模板：标题/分类/开始日期/结束日期/数据成果/详细说明/标签
- [ ] `pnpm add xlsx` 在 server 包

### 2.2 server: workspace 路由 [packages/server/src/routes/workspace.routes.ts](../../../packages/server/src/routes/workspace.routes.ts)（新建）
- [ ] `POST /api/workspace/parse-document`：multer 接收文件，调用对应 parser
- [ ] `POST /api/workspace/extract-items`：text → WorkItem[]
- [ ] `POST /api/workspace/import-excel`：xlsx → WorkItem[]
- [ ] `GET /api/workspace/excel-template`：下载固定列模板 xlsx
- [ ] 在 [app.ts](../../../packages/server/src/app.ts) 注册

### 2.3 client: useWorkspaceStore [packages/client/src/stores/workspace.ts](../../../packages/client/src/stores/workspace.ts)（新建）
- [ ] `workItems: Ref<WorkItem[]>`，持久化
- [ ] CRUD 方法：add / update / remove / clear
- [ ] 筛选 getter：byPeriod / byCategory
- [ ] importDraft：暂存抽取草稿（待用户确认）

### 2.4 client: API 封装 [packages/client/src/api/workspace.ts](../../../packages/client/src/api/workspace.ts)（新建）
- [ ] parseDocument(file) / extractItems(text) / importExcel(file) / downloadTemplate()

### 2.5 client: WorkspaceView 主页
- [ ] [WorkspaceView.vue](../../../packages/client/src/views/WorkspaceView.vue) 列表展示 + 新增按钮 + 时间窗筛选 + 进入 Generate 按钮
- [ ] 卡片：title / 时间 / 分类 / 数据成果摘要 / 编辑+删除

### 2.6 client: WorkspaceImportView 导入子页
- [ ] [WorkspaceImportView.vue](../../../packages/client/src/views/WorkspaceImportView.vue)
- [ ] 三种入口：上传 Word/PDF/PPT/MD/TXT、上传 Excel、模板下载
- [ ] 抽取后显示「待确认卡片列表」，每张可编辑/删除/合并
- [ ] confidence < 0.6 高亮黄色并提示
- [ ] 「确认导入」按钮 → 写入 workspaceStore

### 2.7 client: WorkspaceManualView 录入子页
- [ ] [WorkspaceManualView.vue](../../../packages/client/src/views/WorkspaceManualView.vue)
- [ ] 表单：标题/分类（下拉+自定义）/开始结束日期/metrics 多行/详细说明/标签
- [ ] "复制上一条"快捷按钮
- [ ] 预置 3 条示例（首次进入）

### 验收
- [ ] 上传一份示例 Word 周报，能抽取出 ≥ 3 条 WorkItem
- [ ] 上传 Excel 模板（5 行），全部成功导入
- [ ] 手动录入一条，刷新后仍存在
- [ ] LLM 抽取失败时弹「请改用手动录入」，不崩溃

---

## Phase 3 · 模板与周期（1.5 d）

**目标**：4 周期 × 2 模式共 8 个内置模板，能按周期生成不同结构的报告。

### 3.1 内置模板 JSON [packages/server/src/services/templates/builtin/](../../../packages/server/src/services/templates/builtin/)（新建目录）
- [ ] `weekly-developer.json` / `weekly-general.json`
- [ ] `monthly-developer.json` / `monthly-general.json`
- [ ] `quarterly-developer.json` / `quarterly-general.json`
- [ ] `yearly-developer.json` / `yearly-general.json`
- 字段：见设计稿章节骨架表
- 注意 esbuild 内联（避免 electron 打包丢失）

### 3.2 templates registry [packages/server/src/services/templates/registry.ts](../../../packages/server/src/services/templates/registry.ts)（新建）
- [ ] 启动时加载所有 builtin JSON
- [ ] `getTemplate(id)` / `listTemplates(mode, period)`

### 3.3 templates filter [packages/server/src/services/templates/filter.ts](../../../packages/server/src/services/templates/filter.ts)（新建）
- [ ] `filterWorkItems(items, period): WorkItem[]` 按时间窗筛
- [ ] `derivePeriodRange(type, anchorDate): { start, end }`

### 3.4 改造 Prompt Builder [packages/server/src/services/llm/prompt-builder.ts](../../../packages/server/src/services/llm/prompt-builder.ts)
- [ ] 新增 `buildFromTemplate(template, workItems, period, options)` 函数
- [ ] 现有 `build(...)` 保留不动（研发模式 generate 仍调用）

### 3.5 改造 generate 路由 [packages/server/src/routes/generate.routes.ts](../../../packages/server/src/routes/generate.routes.ts)
- [ ] `if (req.workItems) → buildFromTemplate path`
- [ ] `else → 原 path`
- [ ] 单元测试：两条路径分别能跑通

### 3.6 client: GenerateView 增加周期/模板选择
- [ ] [GenerateView.vue](../../../packages/client/src/views/GenerateView.vue) 顶部加入：
  - 周期选择器（周/月/季/年/自定义）
  - 自动推导日期范围（可手动覆盖）
  - 模板选择下拉（按 mode + period 过滤）
- [ ] 通用模式时：自动从 workspaceStore 取 WorkItem，按周期筛选后传入 generate

### 3.7 client: api/templates.ts [packages/client/src/api/templates.ts](../../../packages/client/src/api/templates.ts)（新建）
- [ ] `listTemplates(mode, period)` / `getTemplate(id)`

### 验收
- [ ] 通用模式下，选周报模板 → 生成的报告含「本周完成/遇到问题/下周计划」三章
- [ ] 同一份 WorkItem 数据切换月/季模板，章节结构正确变化
- [ ] 研发模式 generate 测试用例仍通过（无回归）

---

## Phase 4 · PPT 模板 + 历史兼容（1 d）

### 4.1 PPT 模板 [packages/server/src/services/export/ppt/](../../../packages/server/src/services/export/ppt/)
- [ ] 4 套模板（weekly/monthly/quarterly/yearly），不同封面色 + 章节布局
- [ ] 接收 `template.sections` 动态生成幻灯片
- [ ] 复用现有 PPT 生成基础设施

### 4.2 history 改造 [packages/server/src/routes/history.routes.ts](../../../packages/server/src/routes/history.routes.ts)
- [ ] 写入时记录 `mode` + `period`
- [ ] 读取时 migration：缺字段补默认 `mode='developer', period={type:'custom'...}`

### 4.3 client: 历史列表展示
- [ ] [history 视图] 显示 mode 标签 + period label

### 验收
- [ ] 4 种周期都能成功导出 PPT
- [ ] 老历史记录能正常打开（不崩溃，显示默认 mode）

---

## Phase 5 · 打磨（1 d）

### 5.1 模板管理 tab
- [ ] [SettingsView.vue](../../../packages/client/src/views/SettingsView.vue) 新增「模板」tab
- [ ] 列出内置模板 + 用户模板
- [ ] 「复制并编辑」按钮：弹窗编辑器（章节标题/hint/promptHints）
- [ ] 用户模板存 localStorage（不上传 server）

### 5.2 低置信度引导
- [ ] WorkspaceImportView 抽取后，confidence<0.6 的卡片自动展开编辑表单
- [ ] 顶部提示「N 条工作项需要您确认细节」

### 5.3 WorkItem 示例与 tooltip
- [ ] WorkspaceView 空态：「示例工作项预览」+「立即创建」CTA
- [ ] 字段 tooltip：title/category/metrics 含义说明

### 5.4 端到端测试
- [ ] 通用模式全流程：onboarding → 导入 Word → 校准 → 选月报模板 → 生成 → 预览 → 导出 PPT
- [ ] 研发模式全流程：onboarding → scan → analysis → generate → preview → 导出 PPT
- [ ] 模式切换：通用 → 研发 → 回到通用，状态各自独立保留

### 验收
- [ ] 设计稿「成功标准」全部达标

---

## 检查清单（合并前）

- [ ] 所有 Phase 验收点完成
- [ ] `pnpm build` 全包通过
- [ ] Electron 打包后启动正常（注意 templates JSON 内联）
- [ ] 老用户的历史记录不丢失、可正常打开
- [ ] README 更新两种模式的使用说明

---

## 风险记录

| 时间 | 风险/问题 | 应对 | 状态 |
|---|---|---|---|
| - | - | - | - |

（实施过程中遇到的问题、踩坑、决策变更记录在此表，便于复盘）
