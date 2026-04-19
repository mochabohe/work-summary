import type {
  GenerateRequest,
  ProjectAnalysis,
  SummaryAudience,
  SummaryDocType,
  SummaryFormat,
  SummaryLanguage,
  SummaryLength,
  SummaryStyle,
  SummaryTone,
} from '@work-summary/shared'
import type { ChatMessage } from './index.js'

interface PipelineOptions {
  style: SummaryStyle
  docType: SummaryDocType
  audience: SummaryAudience
  tone: SummaryTone
  length: SummaryLength
  language: SummaryLanguage
  format: SummaryFormat
}

export class PromptBuilder {
  /** 构建全年概览指标提取提示词（分段生成 - 第一步） */
  buildOverviewMetricsPrompt(fullContent: string): ChatMessage[] {
    return [
      {
        role: 'system',
        content: `你是一位数据提取专家。从年终工作总结中提取 3-4 个最关键的量化成果指标，生成一个 metrics 类型幻灯片。
只输出紧凑的纯 JSON 对象（不要换行缩进，不要代码块标记，不要任何额外文字）。
格式：{"type":"metrics","title":"工作亮点","metrics":[{"value":"数值","label":"指标名","description":"简短说明"}],"bullets":["**补充**：要点"]}
要求：metrics 数组 3-4 项，bullets 2-3 条。value 使用简短有力的数字或短语（如 "15+"、"3个月"、"零故障"）。`,
      },
      {
        role: 'user',
        content: fullContent,
      },
    ]
  }

  /** 构建单个章节的幻灯片提示词（分段生成 - 逐章节） */
  buildSectionSlidesPrompt(sectionTitle: string, sectionContent: string): ChatMessage[] {
    // 检测内容是否为 STAR 格式
    const isStarFormat = /\*\*S[-\s]*(Situation|情境|背景)/i.test(sectionContent)
      && /\*\*[ATAR][-\s]*/i.test(sectionContent)

    const starParsingGuide = isStarFormat ? `
## 输入格式：STAR 法则
当前章节内容已经按 STAR 法则组织（S-Situation、T-Task、A-Action、R-Result），请务必保留这个结构。

推荐布局（按优先级选择）：
1. **grid 布局**（最推荐）：将 S/T/A/R 四段分别放入 4 张卡片，卡片标题分别为"情境 Situation"、"任务 Task"、"行动 Action"、"结果 Result"
2. **two-column 布局**：左栏放"情境 & 任务"（S+T），右栏放"行动 & 结果"（A+R）
3. **多页 content**：如果某一段内容特别长，可以拆成多页，但每页要标明属于 STAR 的哪个阶段

重要：不要丢掉 STAR 结构，不要把 S/T/A/R 的内容混在一起变成普通要点列表。` : `
## STAR 原则（重要）
当章节内容涉及具体项目交付或重要工作成果时，优先按 STAR 法则组织：
- **S 情境**：项目背景、业务痛点或技术挑战（为什么做）
- **T 任务**：你承担的具体职责、目标指标（做什么）
- **A 行动**：关键技术方案、攻坚过程、协作方式（怎么做）
- **R 结果**：量化产出、业务收益、技术沉淀（做到了什么）

推荐的 STAR 布局方式：
- 用 two-column 将 "情境与任务"(左栏) 和 "行动与结果"(右栏) 对照展示
- 或用 grid 将 S/T/A/R 四个维度分为 4 张卡片
- 如果要点较多，也可用多页 content 按 S→T→A→R 顺序叙述
注意：仅对项目/成果类内容使用 STAR，学习成长、团队协作等软性内容不必强套。`

    return [
      {
        role: 'system',
        content: `你是一位演示文稿设计师。将给定的工作总结章节转换为幻灯片，输出紧凑的 JSON 数组。

## 规则
1. 只输出纯 JSON 数组（不要换行缩进，不要代码块标记，不要任何额外文字）
2. 该章节的所有原文要点必须全部出现在幻灯片中，一条不能遗漏
3. 禁止发挥、改写或增加原文没有的内容——这是格式转换，不是内容创作
4. 如果内容较多，使用多个幻灯片展示
5. 根据内容特点选择合适的类型，尽量混合使用不同类型
${starParsingGuide}

## 可用类型（3 种）
- content: {"type":"content","title":"标题","bullets":["**小标题**：描述"]}
- two-column: {"type":"two-column","title":"标题","left":{"title":"左栏","bullets":["**要点**：描述"]},"right":{"title":"右栏","bullets":["**要点**：描述"]}}
- grid: {"type":"grid","title":"标题","cards":[{"title":"卡片标题","bullets":["简短描述"]}]}

## 格式要求
- content / two-column 的 bullets 使用 "**加粗小标题**：描述" 格式
- grid 卡片的 bullets 简短（10-20字），不用加粗
- content 每页 4-6 条 bullets
- two-column 每栏 3-4 条
- grid 2-4 张卡片，每张 2-3 条`,
      },
      {
        role: 'user',
        content: `【重要】以下是用户已写好的工作总结章节原文，你的任务是把它的每一条要点原封不动地格式化为幻灯片JSON，禁止改写、增加或删减任何内容，禁止创造原文中没有的子话题：\n\n## ${sectionTitle}\n\n${sectionContent}`,
      },
    ]
  }

  /** 构建总结页提示词（分段生成 - 最后一步） */
  buildSummarySlidePrompt(fullContent: string): ChatMessage[] {
    return [
      {
        role: 'system',
        content: `你是一位总结撰写专家。根据年终工作总结，生成一个 summary 类型幻灯片。
只输出紧凑的纯 JSON 对象（不要换行缩进，不要代码块标记，不要任何额外文字）。
格式：{"type":"summary","title":"年度总结","bullets":["**关键亮点**：总结描述"],"tags":["关键词"]}
要求：bullets 3-5 条，提炼最核心的工作成果。tags 4-6 个，必须是工作能力关键词（如"架构设计能力"、"独立攻坚能力"、"跨团队协作"、"全栈开发"、"项目管理"），不要写具体技术栈名称（如 Vue3、TypeScript）。`,
      },
      {
        role: 'user',
        content: fullContent,
      },
    ]
  }

  /** 单次调用生成总结（合并事实约束、写作目标、维度要求） */
  buildSummaryPrompt(request: GenerateRequest): ChatMessage[] {
    const options = this.normalizeOptions(request)
    const dimensionHint = this.buildDimensionHint(request)

    return [
      {
        role: 'system',
        content: `${this.buildDraftSystemPrompt(options)}

重要补充：
- 只写有原始数据明确支撑的内容，禁止编造具体数字或成果。
- 如果证据不足，使用保守表述（如"多个""显著提升"）而非编造精确数字。
- 不要出现"根据提供信息"等元话术。
- 再次强调：所有章节标题和内容必须是"这个人做了什么"，不能是"这个技术是什么"。遇到 vite.config、webpack.config、package.json 等配置文件内容，只用来判断项目性质，不要据此写技术介绍段落。`,
      },
      {
        role: 'user',
        content: [
          this.buildOptionsGuide(options),
          dimensionHint,
          this.buildCompactDataPacket(request),
          '\n请基于上述数据直接输出完整 Markdown 正文。',
        ].join('\n'),
      },
    ]
  }

  /** 章节级修改 prompt */
  buildSectionRefinePrompt(
    sectionContent: string,
    instruction: string,
    otherSectionTitles: string[],
  ): ChatMessage[] {
    const contextHint = otherSectionTitles.length > 0
      ? `\n\n文档中其他章节标题（仅供参考风格一致性，不要生成这些章节）：\n${otherSectionTitles.map(t => `- ${t}`).join('\n')}`
      : ''

    return [
      {
        role: 'system',
        content: `你是一位章节修改专家。用户会给你一个工作总结中的某个章节（Markdown 格式），并提出修改要求。

## 规则
1. **只输出修改后的该章节内容**，不要输出其他章节
2. 保持 Markdown 格式规范（## 二级标题 + 序号要点）
3. 序号要点格式：数字序号 + **加粗小标题** + 冒号 + 描述
4. 保持与文档整体风格一致
5. 不要输出任何解释或开场白，直接输出修改后的章节`,
      },
      {
        role: 'user',
        content: `## 修改要求\n${instruction}\n\n## 需要修改的章节\n${sectionContent}${contextHint}`,
      },
    ]
  }

  /** 生成 JSON 格式大纲 */
  buildOutlineJsonPrompt(request: GenerateRequest): ChatMessage[] {
    const options = this.normalizeOptions(request)
    const dimensionHint = this.buildDimensionHint(request)

    return [
      {
        role: 'system',
        content: `你是一名写作架构师。基于工作数据生成工作总结大纲。

输出格式：严格 JSON 数组，不要代码块标记，不要任何额外文字。
[{"title":"章节标题","points":["要点1","要点2","要点3"]},...]

规则：
1. 生成 3-6 个章节，每个章节 2-5 条要点
2. 标题要具体，不要使用泛泛的"项目交付/技术升级"原词
3. 要点是短句，描述该章节要写的核心内容
4. 只规划有数据支撑的章节
5. 章节顺序按重要性排列`,
      },
      {
        role: 'user',
        content: [
          this.buildOptionsGuide(options),
          dimensionHint,
          this.buildCompactDataPacket(request),
        ].join('\n'),
      },
    ]
  }

  /** 基于用户确认的大纲生成正文 */
  buildFromOutlinePrompt(request: GenerateRequest, outlineMarkdown: string): ChatMessage[] {
    const options = this.normalizeOptions(request)

    return [
      {
        role: 'system',
        content: `${this.buildDraftSystemPrompt(options)}

重要补充：
- 严格按照给定的提纲结构和顺序生成，不要增减章节。
- 只写有原始数据明确支撑的内容，禁止编造具体数字。
- 如果证据不足，使用保守表述。
- 不要出现"根据提供信息"等元话术。
- 所有内容必须是"这个人做了什么"，禁止出现关于技术工具本身特点的介绍性段落。`,
      },
      {
        role: 'user',
        content: [
          this.buildOptionsGuide(options),
          '\n## 确认的提纲（必须严格遵循）',
          outlineMarkdown,
          '\n## 原始工作数据',
          this.buildCompactDataPacket(request),
          '\n请严格按照上述提纲生成完整 Markdown 正文。',
        ].join('\n'),
      },
    ]
  }

  /** 构建项目摘要提示词 */
  buildProjectSummaryPrompt(project: ProjectAnalysis): ChatMessage[] {
    return [
      {
        role: 'system',
        content: '你是一位技术项目分析专家。请根据提供的项目数据，生成一段300字以内的项目摘要，重点描述项目的核心功能、技术特点和个人贡献。使用专业、有力度的措辞。直接输出摘要内容，不要有任何开场白或客套话。',
      },
      {
        role: 'user',
        content: this.formatProjectData(project, false),
      },
    ]
  }

  private normalizeOptions(request: GenerateRequest): PipelineOptions {
    return {
      style: request.style || 'semi-formal',
      docType: request.docType || 'yearly-summary',
      audience: request.audience || 'manager',
      tone: request.tone || 'professional',
      length: request.length || 'medium',
      language: request.language || 'zh-CN',
      format: request.format || 'bullets',
    }
  }

  private buildOptionsGuide(options: PipelineOptions): string {
    const docTypeMap: Record<SummaryDocType, string> = {
      'yearly-summary': '年终总结：强调年度价值沉淀、阶段性成果和成长',
      'quarterly-review': '季度复盘：强调阶段目标达成、问题与改进动作',
      'monthly-report': '月度汇报：强调本月进展、风险与下月计划',
      'promotion-report': '晋升述职：强调职责范围、能力跃迁、影响力',
      'project-retro': '项目复盘：强调背景目标、关键决策、结果与经验',
      'resume': '求职简历项目经验：按项目分组，每个项目突出技术栈、你的职责、核心贡献和量化成果，用简洁的 bullet point 描述，语言精炼有力，适合写入简历',
    }

    // 每种文档类型的推荐章节结构
    const docTypeStructureMap: Record<SummaryDocType, string> = {
      'yearly-summary': '推荐结构：① 年度核心成果（量化指标） ② 重点项目回顾 ③ 技术成长与积累 ④ 协作与影响力 ⑤ 明年规划方向',
      'quarterly-review': '推荐结构：① 季度目标与达成情况（对比） ② 关键项目进展 ③ 遇到的问题与解决方案 ④ 下季度重点计划',
      'monthly-report': '推荐结构：① 本月完成事项（可度量） ② 进行中的工作 ③ 风险与阻塞 ④ 下月计划',
      'promotion-report': '推荐结构：① 职责范围与核心贡献（STAR法则） ② 超出岗位要求的典型事例 ③ 能力成长的证明 ④ 对团队/业务的影响力',
      'project-retro': '推荐结构：① 项目背景与目标 ② 我的职责与技术方案 ③ 关键挑战与解决过程 ④ 最终成果与量化收益 ⑤ 沉淀的经验',
      'resume': '推荐结构：每个项目独立成节，包含：技术栈标签 / 项目简介（1句话） / 我的贡献（3-5条bullet） / 量化成果',
    }

    const audienceMap: Record<SummaryAudience, string> = {
      'manager': '直属上级：关注业务价值、风险控制、可交付结果',
      'tech-lead': '技术负责人：关注技术方案、复杂问题处理、工程质量',
      'cross-team': '跨团队评审：关注上下游协作、共识推进、可复用经验',
      'self-archive': '个人归档：关注完整性、可追溯性、经验沉淀',
    }

    const toneMap: Record<SummaryTone, string> = {
      'professional': '专业稳健：措辞克制、逻辑清晰',
      'concise': '简洁直达：短句优先、减少背景铺垫',
      'result-driven': '结果导向：优先写结果、影响和量化收益',
    }

    const lengthMap: Record<SummaryLength, string> = {
      'short': '精简版：3-4 个二级标题，每个 2-3 条要点',
      'medium': '标准版：4-6 个二级标题，每个 2-4 条要点',
      'long': '详细版：5-8 个二级标题，每个 3-5 条要点',
    }

    const languageMap: Record<SummaryLanguage, string> = {
      'zh-CN': '全文使用简体中文',
      'en-US': '全文使用英文',
    }

    const formatGuide = options.format === 'star'
      ? '- 输出格式：STAR 法则（每个项目/关键事件按 Situation-Task-Action-Result 四段描述）'
      : '- 输出格式：序号要点（## 标题 + 编号要点列表）'

    return [
      '## 写作目标',
      `- 文档类型：${docTypeMap[options.docType]}`,
      `- 结构建议：${docTypeStructureMap[options.docType]}`,
      `- 目标读者：${audienceMap[options.audience]}`,
      `- 风格：${options.style === 'formal' ? '业务导向（弱化技术细节，标题从业务价值角度命名）' : '技术叙述（业务与技术并重，标题可包含技术方向和技术栈）'}`,
      `- 语气：${toneMap[options.tone]}`,
      `- 长度：${lengthMap[options.length]}`,
      `- 语言：${languageMap[options.language]}`,
      formatGuide,
    ].join('\n')
  }

  private buildDraftSystemPrompt(options: PipelineOptions): string {
    const styleGuide: Record<SummaryStyle, string> = {
      'formal': `业务导向：强调业务价值、协同影响、风险收敛；弱化实现细节。
章节标题应从业务视角命名，体现业务价值和成果（如"智能座舱体验升级与交付"、"数据驱动的用户洞察体系建设"），不要出现具体技术栈名称。`,
      'semi-formal': `技术叙述：业务结果与技术过程并重，可提及方案选型与攻坚细节。
章节标题应体现技术方向和工程实践（如"基于 Vue3 的移动端聊天架构设计"、"React + ECharts 数据可视化平台搭建"），可包含技术栈关键词。`,
    }

    const toneGuide: Record<SummaryTone, string> = {
      'professional': '保持专业稳健，避免口语化和夸张表达。',
      'concise': '句子短、段落短，优先结论。',
      'result-driven': '每条优先说明结果和影响，再补充过程。',
    }

    const languageGuide = options.language === 'en-US'
      ? 'Use fluent English for the whole output.'
      : '全文使用简体中文。'

    return `你是一位务实的高级工程师，擅长写出让主管和评委认可的工作总结。

核心要求：
1. 只输出最终正文，不要开场白、解释或免责声明。
2. 只写有证据支撑的内容，无法证实的数字不要出现。
3. 严禁介绍技术工具本身的特点或功能（如"Vite 极速启动"、"Vue3 的响应式系统"、"TypeScript 类型安全"）——这是技术文档，不是工作总结。
   只写"用这些技术**做成了什么**"，绝不写"这些技术**有什么特点**"。
4. 代码文件和依赖列表仅用于理解项目性质，不得将其作为写作素材来介绍技术。
   判断原则：如果一段内容去掉开发者名字也适用于所有人，那就不是工作总结，不要写。
${options.format === 'star' ? `3. 每个项目/关键事件使用 STAR 法则描述，结构如下：
   ## 项目/事件标题
   **S-Situation（背景）**：介绍项目背景、业务痛点或面临的挑战。
   **T-Task（任务）**：需要完成的目标和个人承担的职责。
   **A-Action（行动）**：个人采取的关键行动，包括思考过程、技术方案和具体实施。
   **R-Result（结果）**：最终成果，包括完成情况、业务影响和量化收益。
4. 每个 STAR 段落要有实质内容（2-4句话），不要只写一句话敷衍。
5. A-Action 部分要突出"个人"的思考和行动，不要写成团队流水账。` : `3. 结构采用"## 二级标题 + 1. 2. 3. 序号要点"。
4. 序号要点格式："1. **小标题**：具体描述"。`}
5. 不使用"我"作为主语，优先使用"主导/负责/推进/完成"等客观表述。
6. 标题必须具体，不要直接复用抽象维度词。

禁用词汇（出现即为不合格）：
时光飞逝、转眼间、展望未来、不懈努力、硕果累累、总而言之、在这充满挑战的一年里、砥砺前行、不忘初心、持续赋能、深耕细作。
${options.format === 'star' ? `
句式规范：
- 不要像写日记一样记流水账，也不要罗列琐碎的 bug 修复
- 将零散的提交记录归纳为有意义的项目/事件
- 每个项目的 S-T-A-R 四段要逻辑连贯，形成完整叙事
- 可以将多个小项目合并为一个 STAR 叙事，也可以一个大项目拆分为多个关键事件` : `
句式规范：
- 推荐句式：**[动词短语] + [模块/场景]：[具体方案] + [产出结果]**
  示例："主导订单列表查询优化：引入 Redis 缓存热点数据，核心接口响应时间从 500ms 降至 50ms"
- 不要像写日记一样记流水账，也不要罗列琐碎的 bug 修复
- 将零散的提交记录抽象为"业务价值"或"技术难点"，多个相关修复可归纳为一条`}

写作偏好：
- ${styleGuide[options.style]}
- ${toneGuide[options.tone]}
- ${languageGuide}`
  }

  private buildDimensionHint(request: GenerateRequest): string {
    if (!request.dimensions || request.dimensions.length === 0) {
      return '## 维度要求\n- 未指定维度，请基于证据自行组织最有价值的结构。'
    }

    const lines = request.dimensions.map((dim) => `- ${dim}`)
    return [
      '## 维度要求',
      '- 以下维度只是方向提示，不可直接照搬为标题：',
      ...lines,
    ].join('\n')
  }

  /** 紧凑数据包：用于事实提取和正文生成，控制上下文大小 */
  private buildCompactDataPacket(request: GenerateRequest): string {
    const parts: string[] = []

    parts.push('# 工作数据')

    const contributedProjects = (request.projects ?? []).filter(
      (p) => p.gitStats && p.gitStats.totalCommits > 0,
    )

    parts.push('\n## 项目列表')
    if (contributedProjects.length === 0) {
      parts.push('（无有效项目贡献数据）')
    }

    for (const project of contributedProjects) {
      parts.push(this.formatProjectData(project, true))
      parts.push('---')
    }

    if (request.standaloneDocuments && request.standaloneDocuments.length > 0) {
      parts.push('\n## 独立文档')
      for (const doc of request.standaloneDocuments.slice(0, 10)) {
        parts.push(`### [${doc.type}] ${doc.filename}`)
        parts.push(this.limitText(doc.content, 1200))
      }
    }

    if (request.feishuDocs && request.feishuDocs.length > 0) {
      parts.push('\n## 用户补充文档')
      for (let i = 0; i < request.feishuDocs.length; i++) {
        parts.push(`### 补充文档 ${i + 1}`)
        parts.push(this.limitText(request.feishuDocs[i].content, 1500))
      }
    }

    if (request.roles && request.roles.length > 0) {
      parts.push('\n## 作者角色')
      parts.push(`该员工的岗位角色：${request.roles.join('、')}`)
      parts.push('请根据该角色的岗位特点和专业视角来组织总结内容，突出与角色职责相关的工作成果和技术贡献。')
    }

    if (request.businessContext) {
      parts.push('\n## 补充说明')
      parts.push('该员工提供的补充信息：')
      parts.push(request.businessContext)
      parts.push('在整理项目和提交记录时，请建立它们与上述业务背景的关联，解释这些工作如何支撑业务目标。')
    }

    if (request.customPrompt) {
      parts.push('\n## 额外说明')
      parts.push(request.customPrompt)
    }

    return parts.join('\n')
  }

  /** 格式化单个项目的数据 */
  private formatProjectData(project: ProjectAnalysis, compact: boolean): string {
    const parts: string[] = []

    parts.push(`### 项目: ${project.project.name}`)
    parts.push(`- 路径: ${project.project.path}`)
    parts.push(`- 类型: ${project.project.type}`)
    parts.push(`- 技术栈: ${project.project.techStack.join(', ') || '未识别'}`)
    parts.push(`- 文件数: ${project.project.fileCount}`)

    if (project.project.description) {
      parts.push(`- 描述: ${project.project.description}`)
    }

    if (project.gitStats) {
      const gs = project.gitStats
      parts.push('\n#### Git 贡献统计')
      parts.push(`- 总提交数: ${gs.totalCommits}`)
      parts.push(`- 新增代码行: ${gs.linesAdded}`)
      parts.push(`- 删除代码行: ${gs.linesDeleted}`)
      parts.push(`- 开发周期: ${gs.firstCommitDate} ~ ${gs.lastCommitDate}`)

      // 优先使用算法聚类结果展示提交记录
      const ai = project.algorithmInsights
      if (ai?.commitClusters && ai.commitClusters.length > 0) {
        parts.push(`\n#### 提交分析（算法聚类结果，共${gs.commitMessages.length}条）`)
        const maxClusters = compact ? 6 : 12
        for (const cluster of ai.commitClusters.slice(0, maxClusters)) {
          parts.push(`\n##### ${cluster.category} (${cluster.count}条)`)
          const maxMsgs = compact ? 5 : 10
          for (const msg of cluster.messages.slice(0, maxMsgs)) {
            parts.push(`- ${msg}`)
          }
          if (cluster.messages.length > maxMsgs) {
            parts.push(`- ... 还有${cluster.messages.length - maxMsgs}条`)
          }
        }
      } else if (gs.commitMessages.length > 0) {
        // 无聚类结果时回退到原始列表
        parts.push(`\n#### 提交记录 (共${gs.commitMessages.length}条，去重后)`)
        for (const msg of gs.commitMessages.slice(0, compact ? 40 : 120)) {
          parts.push(`- ${msg}`)
        }
      }

      // 贡献度分析（转化为自然语言描述，AI可直接引用）
      if (ai?.contributionScore) {
        const cs = ai.contributionScore
        const bd = cs.breakdown
        parts.push(`\n#### 工作特征分析`)

        // 找出占比最大的工作类型
        const workTypes = [
          { name: '功能开发', pct: bd.featureWork },
          { name: '缺陷修复', pct: bd.bugFix },
          { name: '重构优化', pct: bd.refactoring },
          { name: '维护性工作', pct: bd.maintenance },
        ].filter((w) => w.pct > 0).sort((a, b) => b.pct - a.pct)

        if (workTypes.length > 0) {
          const primary = workTypes[0]
          const secondary = workTypes.length > 1 ? workTypes[1] : null
          let desc = `- 该员工的工作以${primary.name}为主(${primary.pct}%)`
          if (secondary && secondary.pct >= 15) {
            desc += `，同时承担了较多${secondary.name}(${secondary.pct}%)`
          }
          parts.push(desc)
        }

        // 代码翻转率的自然语言解读
        if (cs.codeChurnRate > 0.4) {
          parts.push(`- 代码翻转率较高(${cs.codeChurnRate})，说明有大量重构或迭代优化工作`)
        } else if (cs.codeChurnRate < 0.15) {
          parts.push(`- 代码翻转率较低(${cs.codeChurnRate})，以新增功能为主，代码稳定性好`)
        }

        // 贡献领域描述
        if (cs.topContributions.length > 0) {
          const areas = cs.topContributions.filter((c) => c.score >= 10).slice(0, 3)
          if (areas.length > 0) {
            parts.push(`- 代码贡献集中在: ${areas.map((c) => c.area).join('、')}`)
          }
        }
      }

      // 工作节奏分析（转化为自然语言描述）
      if (ai?.workPattern && ai.workPattern.phases.length > 0) {
        const wp = ai.workPattern
        parts.push(`\n#### 工作节奏特征`)

        const typeLabels = { sprint: '高强度开发期', steady: '稳定迭代期', low: '低频维护期' }
        const sprintPhases = wp.phases.filter((p) => p.type === 'sprint')
        const steadyPhases = wp.phases.filter((p) => p.type === 'steady')

        // 描述主要的高强度阶段
        if (sprintPhases.length > 0) {
          const topSprint = sprintPhases.sort((a, b) => b.totalCommits - a.totalCommits)[0]
          parts.push(`- ${topSprint.startDate} ~ ${topSprint.endDate} 为${typeLabels.sprint}，日均提交${topSprint.avgDailyCommits}次，期间完成了密集的功能开发`)
        }

        // 描述稳定期
        if (steadyPhases.length > 0) {
          const totalSteadyDays = steadyPhases.reduce((sum, p) => {
            const days = (new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / (86400000) + 1
            return sum + days
          }, 0)
          if (totalSteadyDays > 30) {
            parts.push(`- 共有约${Math.round(totalSteadyDays)}天处于${typeLabels.steady}，保持了持续稳定的产出`)
          }
        }

        // 整体统计描述
        const s = wp.summary
        parts.push(`- 全周期${s.totalDays}天中有${s.activeDays}天有代码提交，最长连续工作${s.longestStreak}天`)
        if (s.avgDailyCommits >= 2) {
          parts.push(`- 日均提交${s.avgDailyCommits}次，开发节奏较快`)
        } else if (s.avgDailyCommits >= 1) {
          parts.push(`- 日均提交${s.avgDailyCommits}次，开发节奏稳定`)
        }
      }
    }

    if (project.codeStructure) {
      const cs = project.codeStructure
      if (cs.modules.length > 0) {
        parts.push(`\n#### 项目模块: ${cs.modules.slice(0, compact ? 25 : 60).join(', ')}`)
      }
      if (Object.keys(cs.dependencies).length > 0) {
        parts.push(`#### 主要依赖: ${Object.keys(cs.dependencies).slice(0, compact ? 20 : 30).join(', ')}`)
      }

      // 关键代码文件摘要（帮助AI理解项目业务）
      if (cs.keyFiles && cs.keyFiles.length > 0) {
        const maxFiles = compact ? 5 : 8
        const maxContentLen = compact ? 800 : 1500
        const filesToShow = cs.keyFiles.slice(0, maxFiles)
        parts.push(`\n#### 关键代码文件（用于理解项目业务）`)
        for (const kf of filesToShow) {
          parts.push(`\n##### ${kf.path}`)
          if (kf.path.includes('文件列表')) {
            // 目录文件列表，直接展示
            parts.push(this.limitText(kf.content, maxContentLen))
          } else {
            // 代码文件，用代码块包裹
            parts.push('```')
            parts.push(this.limitText(kf.content, maxContentLen))
            parts.push('```')
          }
        }
      }
    }

    if (project.documents.length > 0) {
      const readmeDoc = project.documents.find((d) => d.filename.toLowerCase().startsWith('readme'))
      const otherDocs = project.documents.filter((d) => !d.filename.toLowerCase().startsWith('readme'))

      if (readmeDoc) {
        parts.push(`\n#### 项目说明 (${readmeDoc.filename})`)
        parts.push(this.limitText(readmeDoc.content, compact ? 1600 : 3000))
      }

      if (otherDocs.length > 0) {
        const sortedDocs = otherDocs.sort((a, b) => {
          const aIsMd = a.filename.endsWith('.md') ? 0 : 1
          const bIsMd = b.filename.endsWith('.md') ? 0 : 1
          return aIsMd - bIsMd
        })

        parts.push(`\n#### 项目文档 (${otherDocs.length}个)`)
        for (const doc of sortedDocs.slice(0, compact ? 5 : 8)) {
          const limit = doc.filename.endsWith('.md')
            ? (compact ? 900 : 1500)
            : (compact ? 500 : 800)
          parts.push(`\n##### [${doc.type}] ${doc.filename}`)
          parts.push(this.limitText(doc.content, limit))
        }
      }
    }

    return parts.join('\n')
  }

  private limitText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength)}\n... (内容已截断)`
  }
}
