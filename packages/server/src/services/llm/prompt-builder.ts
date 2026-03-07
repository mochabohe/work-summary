import type { GenerateRequest, ProjectAnalysis } from '@work-summary/shared'
import type { ChatMessage } from './index.js'

export class PromptBuilder {
  /** 构建总结生成的提示词 */
  buildSummaryPrompt(request: GenerateRequest): ChatMessage[] {
    const systemPrompt = this.buildSystemPrompt(request.style, request.strictFactMode)
    const userPrompt = this.buildUserPrompt(request)

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  /** 构建项目摘要提示词（第一阶段） */
  buildProjectSummaryPrompt(project: ProjectAnalysis): ChatMessage[] {
    return [
      {
        role: 'system',
        content: '你是一位技术项目分析专家。请根据提供的项目数据，生成一段300字以内的项目摘要，重点描述项目的核心功能、技术特点和个人贡献。使用专业、有力度的措辞。直接输出摘要内容，不要有任何开场白或客套话。',
      },
      {
        role: 'user',
        content: this.formatProjectData(project),
      },
    ]
  }

  private buildSystemPrompt(style: string, strictFactMode?: boolean): string {
    const styleGuide: Record<string, string> = {
      'formal': `业务导向风格：
- 以业务成果和战略价值为核心叙事线索
- 弱化技术细节（如"完成架构升级"即可，不展开具体技术栈和实现方案）
- 重点突出：项目对业务目标的贡献、团队协作成果、跨部门影响力
- 多用"推动"、"赋能"、"支撑"、"保障"等业务视角词汇
- 适当提及对业务增长、用户体验提升、降本增效的直接贡献
- 措辞专业简练，适合向上级或跨部门汇报`,

      'semi-formal': `技术叙述风格：
- 兼顾业务成果和技术实现，既说做了什么，也说怎么做的
- 可以出现具体的技术术语、框架名称、工具链细节
- 允许展开技术难点攻克过程、解决方案的选型考量
- 语气专业但自然，像日常技术汇报
- 可以用更直接的表达，如"踩了XX坑"、"通过XX方案解决"
- 适合技术团队内部总结或向技术领导汇报`,

      'data-driven': `数据驱动风格：
- 目标读者是重视量化成果的技术管理者或绩效评审者
- 核心原则：**一切用数据说话**，每个要点必须有具体数字支撑
- 数据维度示例：项目完成时间线、模块覆盖范围、性能提升指标、问题解决数量等
- 多使用对比型数据表述：如"覆盖 Z 个核心模块"、"解决 N 个关键问题"
- 适当引入效率指标：如"X天内完成"、"从零到一搭建完成"
- 组织形式建议使用列表或表格来呈现数据，增强可读性
- 定性描述要简短，定量数据要突出（如加粗数字）
- **注意**：不要使用代码行数和提交数这类无意义的指标，用实际业务成果来量化`,
    }

    return `你是一位资深的年终工作总结撰写专家。你需要根据提供的项目数据、代码贡献统计、项目文档内容，生成一份专业、有力度的年终工作总结。

**重要：直接输出总结正文内容，不要有任何开场白、自我介绍、客套话。不要说"好的"、"我将为您"之类的废话。第一行必须是总结的标题或正文。**

## 信息利用策略（非常重要）
你拿到的数据包含五类关键信息，必须**深度交叉分析**后再撰写总结：
1. **项目文档（README、技术文档）**：这是理解项目背景、目标、技术方案的核心信息源。README 通常描述了项目是什么、为什么做、怎么做的。技术文档可能包含架构设计、技术选型、最佳实践等有价值的内容。**必须仔细阅读文档内容，从中提取项目定位、技术亮点、创新点**
2. **Git 提交记录**：每条 commit message 记录了具体做了什么工作。通过分析提交记录可以还原工作过程——哪些是核心功能开发、哪些是 bug 修复、哪些是重构优化、哪些是技术探索
3. **代码统计数据**：提交数、代码行数、开发周期、高频修改文件等量化指标
4. **独立文档**：工作目录中不属于任何代码项目的文档文件（如方案设计文档、技术调研报告、规划文档等）。这些文档记录了**代码之外的重要工作**，例如架构方案设计、新技术调研、业务规划等。**必须认真阅读并将核心内容融入总结**
5. **用户补充文档**：用户手动提供的额外工作资料（如飞书文档、会议纪要、项目周报、需求文档等）。这些文档往往包含**代码仓库中无法体现的重要工作内容**，例如方案设计、技术调研、跨团队协作、项目管理等非编码类贡献。**必须认真阅读补充文档，将其中的工作内容融入总结**，不能忽略

**正确的撰写流程**：先通读项目文档、独立文档和补充文档理解工作全貌 → 再分析提交记录了解具体工作 → 最后用数据佐证 → 综合写出有深度的总结
**错误的做法**：只看代码项目数据而忽略独立文档和补充文档中的工作内容

## 写作风格
${styleGuide[style as keyof typeof styleGuide] || styleGuide['semi-formal']}

## 输出要求
1. 使用"独立主导"、"独立攻克"、"系统掌握"等有力度的措辞
2. 包含具体的数据支撑（完成时间、开发周期等），但**不要在正文中提及代码行数和提交数**——这些数字对工作总结没有实际意义
3. 如果用户指定了维度方向，按维度组织内容；如果未指定维度，根据项目数据自行规划合理的内容结构
4. 突出个人贡献和技术能力
5. 每个要点控制在1-3句话，言简意赅但信息密度高
6. 不要输出任何开场白或结尾的客套话，只输出总结正文
7. **不要提及代码行数和提交数**——这些纯数字指标在工作总结中没有实质意义，应该用具体的工作内容和成果来体现贡献
8. **深度利用项目文档**：如果 README 或技术文档描述了项目是重构项目、AI 相关项目、或包含特定技术方案，必须在总结中体现这些背景和亮点，而不是泛泛而谈
9. **结合 commit 记录推断工作内容**：从提交信息中提取具体做了什么功能、修复了什么问题、完成了什么模块，用这些真实工作内容来撰写总结，避免空洞的泛化描述

## 标题个性化（非常重要）
- 用户提供的维度仅作为**内容方向的指引**，表示用户希望总结侧重哪些方面
- **严禁**直接把维度名称作为二级标题输出（如直接写"## 项目交付"、"## 技术升级"）
- 你必须根据实际项目数据和工作内容，为每个板块生成**独特、具体、有辨识度的标题**
- 好标题示例：
  - 维度"项目交付" → "## 核心业务系统全面交付落地" 或 "## 三大产品线高质量上线"
  - 维度"技术升级" → "## 前端架构体系化升级" 或 "## 从 Webpack 到 Vite 的构建全面革新"
  - 维度"质量保障" → "## 自动化测试体系从零到一" 或 "## 线上故障率下降 80% 的质量攻坚"
- 标题要**来源于实际工作内容**，让不同人即使选了相同维度，生成的标题也完全不同

## 数据准确性（非常重要）
- **只使用提供数据中明确出现的数字**，如提交数、新增代码行数、文件数、开发周期等
- **严禁编造、推测任何数据中没有直接给出的数量**，例如"XX个组件"、"XX个页面"、"XX个动画"等，除非提供的数据中有明确的数字
- 如果你不确定某个数量的具体值，使用模糊表述（如"大量"、"多个"、"丰富的"）代替具体数字
- 提交记录仅展示了部分样本，不代表全部工作内容，不要根据看到的提交条数来推测总量

## 维度取舍（非常重要）
- 如果某个维度在提供的项目数据、Git 记录、文档中**找不到任何实际事例支撑**，必须**直接跳过该维度**，不要生成对应板块
- **严禁**为了凑数而编造、夸大或牵强附会。宁可少一个板块，也不能硬往上靠
- 只保留有真实数据和事例可以佐证的维度

## 参考范例
- "**独立主导XX项目移动端H5完整重构**，1人20天完成上线，技术栈全面升级至 Vue3 + TypeScript + Vite *（📌 项目: voyah-h5, 文档: README.md, commit: "chore: 项目重构为Vue3"）*"
- "**独立攻克 XX 语音交互模块 iOS 兼容难题**，P0级BUG全部解决，双端稳定上线 *（📌 项目: mate-assist-front-pc, commit: "fix: iOS语音兼容问题"）*"
- "**借助 AI Coding 在0.5天内完成 XX 多页面可演示 Demo**，有效支撑产品需求评审 *（📌 文档: AI辅助开发实践.md）*"
- "**建立 Vitest 单元测试（189个）+ Playwright E2E 测试（28个）完整测试体系** *（📌 项目: work-summary, commit: "test: 补充单元测试"）*"

## 数据来源标注（非常重要）
每个要点的末尾必须添加数据来源标注，用斜体小字标明该要点的信息来自哪里，格式为：
*（📌 来源说明）*

来源标注规则：
- 如果要点内容来自某个项目的 Git 记录，标注项目名 + 关键 commit，如：*（📌 项目: mate-assist-front-pc, commit: "feat: 新增语音交互模块"）*
- 如果要点内容来自项目文档（README 或技术文档），标注项目名 + 文档名，如：*（📌 项目: voyah-h5, 文档: README.md）*
- 如果要点内容来自独立文档或补充文档，标注文档名，如：*（📌 文档: OA系统AI功能建设方案.md）*
- 如果要点综合了多个来源，列出主要来源，如：*（📌 项目: xxx, commit: "feat: yyy" + 文档: README.md）*
- 来源标注要**精确到具体的项目名、文件名或 commit 信息**，不要写笼统的"项目数据"或"提交记录"
- 来源标注放在要点描述文字的最后，另起一行或紧跟描述末尾均可

示例：
> **独立主导 XX 项目移动端 H5 完整重构**，1人20天完成上线，技术栈全面升级至 Vue3 + TypeScript + Vite
> *（📌 项目: voyah-h5-rebuild, 文档: README.md, commit: "feat: 整体重构为Vue3+TS"）*

## 输出格式
使用 Markdown 格式分段输出，每个板块用二级标题（##），每个要点用加粗标题 + 描述的形式。每个要点末尾附上数据来源标注。${strictFactMode ? `

## ⚠️ 严格事实模式（已启用，最高优先级）
本次生成已启用**严格事实模式**，以下规则覆盖所有其他写作指引：

1. **只允许引用已提供数据中明确存在的事实**：每一个描述、每一个数字、每一个技术细节都必须能在提供的项目数据、Git 记录、文档内容中找到直接依据
2. **绝对禁止推测和补充**：不得根据项目名称、技术栈、文件结构等推测项目用途、业务场景、用户规模、性能指标等未在数据中明确出现的信息
3. **未证实内容必须使用模糊表达**：
   - 如果不确定具体数量 → 用"多个"、"若干"、"一系列"代替具体数字
   - 如果不确定具体效果 → 用"有效提升了"、"改善了"代替"提升了 XX%"
   - 如果不确定具体时间 → 用"期间"、"过程中"代替具体日期
   - 如果不确定业务影响 → 用"支撑了业务发展"代替具体业务成果描述
4. **禁止编造场景**：不得虚构"解决了线上问题"、"提升了用户体验"、"降低了故障率"等没有数据支撑的描述
5. **数据来源标注更严格**：每个要点的来源标注必须精确到具体的 commit message 原文或文档原文片段，不允许笼统概括
6. **宁可简短也不造假**：如果某个板块只有少量可证实的信息，就只写少量要点，不要为了充实内容而添加推测性描述` : ''}`
  }

  private buildUserPrompt(request: GenerateRequest): string {
    const parts: string[] = []

    parts.push('# 以下是我今年的工作数据\n')

    // 项目数据（只包含有个人 Git 贡献的项目）
    const contributedProjects = request.projects.filter(
      (p) => p.gitStats && p.gitStats.totalCommits > 0
    )

    parts.push('## 项目列表\n')
    if (contributedProjects.length === 0) {
      parts.push('（无有效项目贡献数据）\n')
    }
    for (const project of contributedProjects) {
      parts.push(this.formatProjectData(project))
      parts.push('---')
    }

    // 独立文档（扫描目录中不属于任何项目的文档文件）
    if (request.standaloneDocuments && request.standaloneDocuments.length > 0) {
      parts.push('\n## 工作目录中的独立文档（重要！这些文档包含项目之外的工作内容）\n')
      parts.push('> 以下文档是从工作目录中扫描到的独立文件，不属于任何代码项目，通常包含方案设计、技术调研、工作规划等重要内容。**必须在总结中体现这些文档的核心内容**。\n')
      for (const doc of request.standaloneDocuments) {
        parts.push(`### [${doc.type}] ${doc.filename}`)
        parts.push(doc.content)
      }
    }

    // 补充文档内容（用户手动提供的额外工作资料）
    if (request.feishuDocs && request.feishuDocs.length > 0) {
      parts.push('\n## 用户补充的工作文档（重要！必须在总结中体现这些内容）\n')
      parts.push('> 以下是用户额外提供的工作资料，包含代码仓库中无法体现的重要工作内容。**请务必仔细阅读并将相关内容融入总结**，不要忽略。\n')
      for (let i = 0; i < request.feishuDocs.length; i++) {
        const doc = request.feishuDocs[i]
        parts.push(`### 补充文档 ${i + 1}`)
        parts.push(doc.content)
      }
    }

    // 用户自定义要求
    if (request.customPrompt) {
      parts.push(`\n## 额外说明\n${request.customPrompt}`)
    }

    // 总结维度
    if (request.dimensions.length > 0) {
      parts.push('\n## 总结应侧重的方向（注意：这些是内容方向指引，不是标题，请根据实际内容生成个性化标题）\n')
      for (const dim of request.dimensions) {
        parts.push(`- ${dim}`)
      }
    } else {
      parts.push('\n## 内容组织说明\n用户未指定具体维度，请根据项目数据的实际内容，自行规划最合理的总结结构。可以按项目分组、按工作类型分组（如核心业务开发、技术建设、工程效能等），选择最能体现工作价值的组织方式。')
    }

    parts.push('\n请根据以上数据，生成一份结构清晰、内容充实的年终工作总结。每个板块下列举2-5个要点，数据要准确，措辞要专业有力。记住：二级标题必须根据实际工作内容生成，具有辨识度和个性化，不要直接照搬维度名称。')

    return parts.join('\n')
  }

  /** 格式化单个项目的数据 */
  private formatProjectData(project: ProjectAnalysis): string {
    const parts: string[] = []

    parts.push(`### 项目: ${project.project.name}`)
    parts.push(`- 路径: ${project.project.path}`)
    parts.push(`- 类型: ${project.project.type}`)
    parts.push(`- 技术栈: ${project.project.techStack.join(', ') || '未识别'}`)
    parts.push(`- 文件数: ${project.project.fileCount}`)

    if (project.project.description) {
      parts.push(`- 描述: ${project.project.description}`)
    }

    // Git 统计
    if (project.gitStats) {
      const gs = project.gitStats
      parts.push(`\n#### Git 贡献统计`)
      parts.push(`- 总提交数: ${gs.totalCommits}`)
      parts.push(`- 新增代码行: ${gs.linesAdded}`)
      parts.push(`- 删除代码行: ${gs.linesDeleted}`)
      parts.push(`- 开发周期: ${gs.firstCommitDate} ~ ${gs.lastCommitDate}`)

      if (gs.commitMessages.length > 0) {
        parts.push(`\n#### 提交记录 (共${gs.commitMessages.length}条，去重后)`)
        for (const msg of gs.commitMessages) {
          parts.push(`- ${msg}`)
        }
      }
    }

    // 代码结构
    if (project.codeStructure) {
      const cs = project.codeStructure
      if (cs.modules.length > 0) {
        parts.push(`\n#### 项目模块: ${cs.modules.join(', ')}`)
      }
      if (Object.keys(cs.dependencies).length > 0) {
        parts.push(`#### 主要依赖: ${Object.keys(cs.dependencies).slice(0, 15).join(', ')}`)
      }
    }

    // 文档内容（README 和技术文档是理解项目背景的关键信息源）
    if (project.documents.length > 0) {
      // 分离 README 和其他文档
      const readmeDoc = project.documents.find(
        (d) => d.filename.toLowerCase().startsWith('readme')
      )
      const otherDocs = project.documents.filter(
        (d) => !d.filename.toLowerCase().startsWith('readme')
      )

      // README 作为项目说明，给予充足的展示空间
      if (readmeDoc) {
        const readmeContent = readmeDoc.content.length > 3000
          ? readmeDoc.content.substring(0, 3000) + '\n... (内容已截断)'
          : readmeDoc.content
        parts.push(`\n#### 项目说明 (${readmeDoc.filename})`)
        parts.push(readmeContent)
      }

      // 其他文档（技术文档、设计文档等）
      if (otherDocs.length > 0) {
        // 优先展示 .md 技术文档，它们通常包含最有价值的信息
        const sortedDocs = otherDocs.sort((a, b) => {
          const aIsMd = a.filename.endsWith('.md') ? 0 : 1
          const bIsMd = b.filename.endsWith('.md') ? 0 : 1
          return aIsMd - bIsMd
        })

        parts.push(`\n#### 项目文档 (${otherDocs.length}个)`)
        for (const doc of sortedDocs.slice(0, 8)) {
          // .md 技术文档给更多空间，其他格式适当截断
          const limit = doc.filename.endsWith('.md') ? 1500 : 800
          const content = doc.content.length > limit
            ? doc.content.substring(0, limit) + '\n... (内容已截断)'
            : doc.content
          parts.push(`\n##### [${doc.type}] ${doc.filename}`)
          parts.push(content)
        }
      }
    }

    return parts.join('\n')
  }
}
