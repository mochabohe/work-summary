/**
 * Commit 智能分类聚类模块
 *
 * 算法流程：
 * 1. 对 commit messages 进行分词（支持中英文混合）
 * 2. 计算 TF-IDF 特征向量
 * 3. 基于余弦相似度进行凝聚聚类
 * 4. 自动为每个聚类生成分类名称
 */

export interface CommitCluster {
  /** 自动生成的分类名 */
  category: string
  /** 该分类的关键词 */
  keywords: string[]
  /** 属于该分类的 commit 消息 */
  messages: string[]
  /** 消息数量 */
  count: number
}

/** 停用词表（中英文常见无意义词） */
const STOP_WORDS = new Set([
  // 英文
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'and', 'or', 'not', 'no', 'but',
  'if', 'then', 'else', 'when', 'up', 'out', 'so', 'than', 'too',
  'very', 'just', 'about', 'into', 'over', 'after', 'before',
  'some', 'all', 'any', 'each', 'every', 'both', 'few', 'more',
  'other', 'this', 'that', 'these', 'those', 'it', 'its',
  // commit 常见前缀（作为类型标记单独处理，不参与聚类内容分析）
  'merge', 'branch', 'commit', 'update', 'change', 'changes',
  // 中文停用词
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
  '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它',
  '们', '那', '些', '什么', '为', '与', '及', '等', '以', '个',
])

/** Commit 类型前缀映射 */
const COMMIT_TYPE_MAP: Record<string, string> = {
  feat: '功能开发',
  fix: '缺陷修复',
  refactor: '代码重构',
  perf: '性能优化',
  style: '样式调整',
  docs: '文档更新',
  test: '测试相关',
  chore: '工程化',
  build: '构建相关',
  ci: 'CI/CD',
  revert: '回滚',
}

/**
 * 中英文混合分词
 * - 英文按空格和标点分割为单词
 * - 中文按单字/双字切分（bigram）
 * - 过滤停用词和过短的词
 */
function tokenize(text: string): string[] {
  const tokens: string[] = []

  // 移除 commit 类型前缀 (feat:, fix(scope):, etc.)
  const cleaned = text.replace(/^(feat|fix|refactor|perf|style|docs|test|chore|build|ci|revert)(\([^)]*\))?[:\s]*/i, '')

  // 提取英文单词（至少2个字母）
  const englishWords = cleaned.match(/[a-zA-Z]{2,}/g)
  if (englishWords) {
    for (const word of englishWords) {
      const lower = word.toLowerCase()
      if (!STOP_WORDS.has(lower)) {
        tokens.push(lower)
      }
    }
  }

  // 提取中文字符并做 bigram 切分
  const chineseChars = cleaned.match(/[\u4e00-\u9fff]+/g)
  if (chineseChars) {
    for (const segment of chineseChars) {
      // 单字（去停用词）
      for (const char of segment) {
        if (!STOP_WORDS.has(char)) {
          tokens.push(char)
        }
      }
      // bigram（两两相邻字组合）
      for (let i = 0; i < segment.length - 1; i++) {
        const bigram = segment[i] + segment[i + 1]
        if (!STOP_WORDS.has(bigram)) {
          tokens.push(bigram)
        }
      }
    }
  }

  return tokens
}

/**
 * 提取 commit 的类型前缀
 */
function extractCommitType(message: string): string | null {
  const match = message.match(/^(feat|fix|refactor|perf|style|docs|test|chore|build|ci|revert)/i)
  return match ? match[1].toLowerCase() : null
}

/**
 * 计算 TF-IDF 向量
 * @returns Map<word, tfidf_score> 的数组，每个元素对应一条 commit
 */
function computeTfIdf(documents: string[][]): Map<string, number>[] {
  const n = documents.length
  if (n === 0) return []

  // 计算 DF（文档频率）
  const df = new Map<string, number>()
  for (const doc of documents) {
    const uniqueWords = new Set(doc)
    for (const word of uniqueWords) {
      df.set(word, (df.get(word) || 0) + 1)
    }
  }

  // 计算每个文档的 TF-IDF
  return documents.map((doc) => {
    const tf = new Map<string, number>()
    for (const word of doc) {
      tf.set(word, (tf.get(word) || 0) + 1)
    }

    const tfidf = new Map<string, number>()
    for (const [word, count] of tf) {
      const tfScore = count / doc.length
      const idfScore = Math.log(n / (df.get(word) || 1))
      tfidf.set(word, tfScore * idfScore)
    }
    return tfidf
  })
}

/**
 * 计算两个 TF-IDF 向量的余弦相似度
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (const [word, scoreA] of a) {
    normA += scoreA * scoreA
    const scoreB = b.get(word)
    if (scoreB !== undefined) {
      dotProduct += scoreA * scoreB
    }
  }
  for (const [, scoreB] of b) {
    normB += scoreB * scoreB
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

/**
 * 凝聚层次聚类
 * @param similarityMatrix NxN 相似度矩阵
 * @param threshold 合并阈值（相似度 >= threshold 时合并）
 * @returns 聚类结果，每个元素是原始索引的数组
 */
function agglomerativeClustering(
  similarityMatrix: number[][],
  threshold: number,
): number[][] {
  const n = similarityMatrix.length
  // 初始化：每个元素自成一个簇
  let clusters: number[][] = Array.from({ length: n }, (_, i) => [i])
  // 标记哪些簇是活跃的
  const active = new Set<number>(Array.from({ length: n }, (_, i) => i))

  while (active.size > 1) {
    // 找到最相似的两个簇
    let maxSim = -1
    let mergeA = -1
    let mergeB = -1

    const activeArr = Array.from(active)
    for (let i = 0; i < activeArr.length; i++) {
      for (let j = i + 1; j < activeArr.length; j++) {
        const ci = activeArr[i]
        const cj = activeArr[j]
        // 平均链接法：簇间相似度 = 所有元素对的平均相似度
        let sumSim = 0
        let count = 0
        for (const a of clusters[ci]) {
          for (const b of clusters[cj]) {
            sumSim += similarityMatrix[a][b]
            count++
          }
        }
        const avgSim = sumSim / count
        if (avgSim > maxSim) {
          maxSim = avgSim
          mergeA = ci
          mergeB = cj
        }
      }
    }

    // 如果最大相似度低于阈值，停止合并
    if (maxSim < threshold) break

    // 合并两个簇
    clusters[mergeA] = [...clusters[mergeA], ...clusters[mergeB]]
    clusters[mergeB] = []
    active.delete(mergeB)
  }

  // 返回非空簇
  return clusters.filter((c) => c.length > 0)
}

/**
 * 从 TF-IDF 向量中提取簇的关键词
 */
function extractClusterKeywords(
  indices: number[],
  tfidfVectors: Map<string, number>[],
  topK: number = 3,
): string[] {
  // 汇总该簇所有文档的 TF-IDF 分数
  const wordScores = new Map<string, number>()
  for (const idx of indices) {
    for (const [word, score] of tfidfVectors[idx]) {
      wordScores.set(word, (wordScores.get(word) || 0) + score)
    }
  }

  // 按分数降序取 topK
  return Array.from(wordScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([word]) => word)
}

/**
 * 为聚类自动生成分类名称
 * 优先使用中文关键词，辅以 commit 类型
 */
function generateCategoryName(
  keywords: string[],
  messages: string[],
): string {
  // 统计该簇中最常见的 commit 类型
  const typeCounts = new Map<string, number>()
  for (const msg of messages) {
    const type = extractCommitType(msg)
    if (type) {
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
    }
  }

  // 找出主要类型
  let mainType = ''
  let maxCount = 0
  for (const [type, count] of typeCounts) {
    if (count > maxCount) {
      maxCount = count
      mainType = type
    }
  }

  // 过滤掉单字符关键词，优先使用多字符关键词
  const meaningfulKeywords = keywords.filter((k) => k.length >= 2)
  const keywordPart = meaningfulKeywords.length > 0
    ? meaningfulKeywords.slice(0, 2).join('/')
    : keywords.slice(0, 2).join('/')

  const typePart = mainType && COMMIT_TYPE_MAP[mainType]
    ? COMMIT_TYPE_MAP[mainType]
    : ''

  if (typePart && keywordPart) {
    return `${keywordPart} - ${typePart}`
  }
  return keywordPart || typePart || '其他'
}

/**
 * Commit 智能分类聚类
 *
 * @param commitMessages 去重后的 commit 消息列表
 * @param similarityThreshold 聚类相似度阈值，默认 0.3
 * @returns 聚类结果
 */
export function classifyCommits(
  commitMessages: string[],
  similarityThreshold: number = 0.3,
): CommitCluster[] {
  if (commitMessages.length === 0) return []

  // 少于 3 条直接归为一类
  if (commitMessages.length < 3) {
    const type = extractCommitType(commitMessages[0])
    return [{
      category: type ? (COMMIT_TYPE_MAP[type] || '其他') : '其他',
      keywords: [],
      messages: commitMessages,
      count: commitMessages.length,
    }]
  }

  // 1. 分词
  const tokenizedDocs = commitMessages.map(tokenize)

  // 2. 计算 TF-IDF
  const tfidfVectors = computeTfIdf(tokenizedDocs)

  // 3. 计算相似度矩阵
  const n = commitMessages.length
  const similarityMatrix: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0),
  )
  for (let i = 0; i < n; i++) {
    similarityMatrix[i][i] = 1
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(tfidfVectors[i], tfidfVectors[j])
      similarityMatrix[i][j] = sim
      similarityMatrix[j][i] = sim
    }
  }

  // 4. 凝聚聚类
  const clusterIndices = agglomerativeClustering(similarityMatrix, similarityThreshold)

  // 5. 构建聚类结果
  const clusters: CommitCluster[] = clusterIndices.map((indices) => {
    const messages = indices.map((i) => commitMessages[i])
    const keywords = extractClusterKeywords(indices, tfidfVectors)
    const category = generateCategoryName(keywords, messages)

    return {
      category,
      keywords,
      messages,
      count: messages.length,
    }
  })

  // 按消息数量降序排序
  clusters.sort((a, b) => b.count - a.count)

  return clusters
}
