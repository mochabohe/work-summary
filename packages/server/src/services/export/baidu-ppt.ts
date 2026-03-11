/**
 * 百度 AI PPT 导出服务
 *
 * 调用百度千帆 AI PPT API，基于专业设计模板生成高质量 PPT。
 * 流程：获取模板列表 → 生成大纲 → 根据大纲生成 PPT → 返回下载 URL
 */

const API_BASE = 'https://qianfan.baidubce.com/v2/tools/ai_ppt/'

export interface BaiduPptTheme {
  style_id: number
  tpl_id: number
  style_name_list: string[]
}

export interface BaiduPptOutline {
  chat_id: string
  query_id: string
  title: string
  outline: string
}

export interface BaiduPptResult {
  status: string
  is_end?: boolean
  data?: { pptx_url: string }
  outline?: string
}

/** 模板风格分类关键词映射 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '企业商务': ['企业', '公司', '商务', '商业', '营销', '销售', '财务', '战略', '管理', '报告', '总结', '规划'],
  '未来科技': ['科技', '技术', '人工智能', 'AI', '数据', '系统', '平台', '开发', '代码', '前端', '后端', '互联网', '数字化'],
  '年终总结': ['年终', '年度', '总结', '回顾', '汇报', '述职', '工作总结', '季度', '月度'],
  '扁平简约': ['简约', '简洁', '极简', '现代', '设计', '分析', '图表'],
  '文艺清新': ['文艺', '清新', '自然', '生态', '旅行', '生活'],
  '中国风': ['中国', '传统', '古典', '文化', '历史', '国学'],
  '卡通手绘': ['卡通', '教育', '教学', '课件', '儿童', '培训'],
  '创意趣味': ['创意', '创新', '趣味', '有趣', '娱乐'],
  '文化艺术': ['艺术', '美学', '音乐', '摄影', '电影'],
}

/**
 * 从 Markdown 工作总结直接构建百度 PPT 大纲
 *
 * 忠实解析用户的章节标题和条目，不经过 AI 生成，
 * 每个条目保留冒号前的关键标题（不超过 30 字）以适配幻灯片版式。
 */
function buildOutlineFromMarkdown(markdown: string): { title: string; query: string; outline: string } {
  const lines = markdown.split('\n')
  let mainTitle = '工作总结'
  const sections: { heading: string; items: string[] }[] = []
  let currentSection: { heading: string; items: string[] } | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    const h1 = trimmed.match(/^#\s+(.+)/)
    if (h1) {
      mainTitle = h1[1].replace(/\*\*/g, '').trim()
      continue
    }
    const h2 = trimmed.match(/^#{2,3}\s+(.+)/)
    if (h2) {
      if (currentSection) sections.push(currentSection)
      currentSection = { heading: h2[1].replace(/\*\*/g, '').trim(), items: [] }
      continue
    }
    const numbered = trimmed.match(/^\d+\.\s+(.+)/)
    if (numbered && currentSection) {
      const item = numbered[1].replace(/\*\*/g, '').trim()
      // 冒号前为关键标题，截取合理长度
      const colonIdx = item.indexOf('：')
      const shortItem = colonIdx > 0 && colonIdx <= 25 ? item.slice(0, colonIdx) : item.slice(0, 40)
      currentSection.items.push(shortItem)
      continue
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)/)
    if (bullet && currentSection) {
      const item = bullet[1].replace(/\*\*/g, '').trim()
      const colonIdx = item.indexOf('：')
      const shortItem = colonIdx > 0 && colonIdx <= 25 ? item.slice(0, colonIdx) : item.slice(0, 40)
      currentSection.items.push(shortItem)
    }
  }

  if (currentSection) sections.push(currentSection)

  // 构建百度 outline 格式：# 主标题 + * 章节 + "  * 条目"（星号缩进，非标准 Markdown）
  let outline = `# ${mainTitle}\n`
  for (const section of sections) {
    outline += `* ${section.heading}\n`
    for (const item of section.items.slice(0, 6)) {
      outline += `  * ${item}\n`
    }
  }

  // query 用于获取会话 ID，需包含章节信息以通过百度后端的内容一致性校验
  const sectionTitles = sections.map(s => s.heading).join('、')
  const query = sectionTitles
    ? `${mainTitle}，主要包含：${sectionTitles}`.slice(0, 300)
    : mainTitle

  return { title: mainTitle, query, outline }
}

/**
 * 根据内容关键词推荐模板风格
 */
function suggestCategory(query: string): string {
  const q = query.toLowerCase()
  let bestCategory = '企业商务'
  let maxScore = 0

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0
    for (const kw of keywords) {
      if (q.includes(kw.toLowerCase())) score++
    }
    if (score > maxScore) {
      maxScore = score
      bestCategory = category
    }
  }

  return bestCategory
}

/**
 * 获取可用模板列表
 */
async function getThemes(apiKey: string): Promise<BaiduPptTheme[]> {
  const res = await fetch(API_BASE + 'get_ppt_theme', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  const json = await res.json() as any
  if (json.errno && json.errno !== 0) {
    throw new Error(`获取模板失败: ${json.errmsg || JSON.stringify(json)}`)
  }
  return json.data?.ppt_themes || []
}

/**
 * 从模板列表中选择匹配风格的模板
 */
function selectTheme(themes: BaiduPptTheme[], category: string): BaiduPptTheme {
  // 优先找匹配分类的
  const matched = themes.filter(t =>
    t.style_name_list?.some(name => name === category)
  )
  if (matched.length > 0) {
    return matched[Math.floor(Math.random() * matched.length)]
  }
  // 回退：随机选非默认的
  const nonDefault = themes.filter(t =>
    t.style_name_list?.some(name => name !== '默认')
  )
  if (nonDefault.length > 0) {
    return nonDefault[Math.floor(Math.random() * nonDefault.length)]
  }
  // 最终回退
  return themes[Math.floor(Math.random() * themes.length)]
}

/**
 * 生成 PPT 大纲（SSE 流式）
 */
async function generateOutline(apiKey: string, query: string, onChunk?: (chunk: string) => void): Promise<BaiduPptOutline> {
  const res = await fetch(API_BASE + 'generate_outline', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`生成大纲失败: HTTP ${res.status}`)
  }

  let title = ''
  let outline = ''
  let chat_id = ''
  let query_id = ''

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.slice(5).trim())
          if (!title && data.title) {
            title = data.title
            chat_id = data.chat_id
            query_id = data.query_id
          }
          if (data.outline) {
            outline += data.outline
            onChunk?.(data.outline)
          }
        } catch {}
      }
    }
  }

  if (!title || !chat_id) {
    throw new Error('大纲生成失败: 未获取到有效数据')
  }

  return { chat_id, query_id, title, outline }
}

/**
 * 根据大纲生成 PPT（SSE 流式）
 *
 * @param onProgress 进度回调
 * @returns PPT 下载 URL
 */
async function generatePptByOutline(
  apiKey: string,
  outline: BaiduPptOutline,
  query: string,
  styleId: number,
  tplId: number,
  onProgress?: (status: string) => void,
): Promise<string> {
  const res = await fetch(API_BASE + 'generate_ppt_by_outline', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      query_id: Number(outline.query_id),
      chat_id: Number(outline.chat_id),
      query,
      outline: outline.outline,
      title: outline.title,
      style_id: styleId,
      tpl_id: tplId,
    }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`PPT生成请求失败: HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let pptUrl = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.slice(5).trim())
          if (data.status) {
            onProgress?.(data.status)
          }
          if (data.is_end && data.data?.pptx_url) {
            pptUrl = data.data.pptx_url
          }
        } catch {}
      }
    }
  }

  if (!pptUrl) {
    throw new Error('PPT生成失败: 未获取到下载链接')
  }

  return pptUrl
}

/**
 * 百度 AI PPT 导出主函数
 *
 * @param query PPT 主题/内容文本
 * @param apiKey 百度千帆 API Key
 * @param options 可选配置
 * @param onProgress SSE 进度回调（用于流式推送给前端）
 * @returns PPT 下载 URL
 */
export async function exportBaiduPpt(
  query: string,
  apiKey: string,
  options?: {
    category?: string   // 指定模板风格分类
    tplId?: number      // 直接指定模板 ID
    styleId?: number    // 模板风格 ID
  },
  onProgress?: (event: BaiduPptResult) => void,
): Promise<string> {
  let styleId = options?.styleId ?? 0
  let tplId = options?.tplId

  // 直接从 Markdown 解析大纲，忠实还原用户工作总结内容
  const { title: pptTitle, query: pptQuery, outline: customOutline } = buildOutlineFromMarkdown(query)

  // 如果没有指定模板，自动选择
  if (!tplId) {
    onProgress?.({ status: '正在获取模板列表...' })
    const themes = await getThemes(apiKey)
    if (themes.length === 0) {
      throw new Error('无可用模板')
    }

    const category = options?.category || suggestCategory(pptTitle)
    const theme = selectTheme(themes, category)
    styleId = theme.style_id
    tplId = theme.tpl_id

    onProgress?.({ status: `已选择模板风格: ${theme.style_name_list?.[0] || '默认'} (ID: ${tplId})` })
  }

  // 获取会话 ID（只用 title 作为 query，不让 AI 生成大纲内容）
  onProgress?.({ status: '正在初始化 PPT 会话...' })
  const session = await generateOutline(apiKey, pptQuery)

  // 打印 AI 返回的大纲格式，用于调试
  console.log('[BaiduPPT] AI outline format (first 500 chars):', session.outline?.slice(0, 500))
  console.log('[BaiduPPT] AI outline type:', typeof session.outline)

  // 用我们自己解析的大纲替换 AI 生成的大纲
  const outline: BaiduPptOutline = {
    chat_id: session.chat_id,
    query_id: session.query_id,
    title: pptTitle,
    outline: customOutline,
  }
  onProgress?.({ status: '大纲构建完成', outline: customOutline })

  // 生成 PPT
  onProgress?.({ status: 'PPT 生成中...' })
  const pptUrl = await generatePptByOutline(
    apiKey,
    outline,
    pptQuery,
    styleId,
    tplId!,
    (status) => onProgress?.({ status }),
  )

  onProgress?.({ status: 'PPT 导出完成', is_end: true, data: { pptx_url: pptUrl } })

  return pptUrl
}
