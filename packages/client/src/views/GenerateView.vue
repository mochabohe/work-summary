<template>
  <div class="generate-view" :class="{ 'compare-active': compareActive }">
    <!-- 对比模式：两栏布局 -->
    <template v-if="compareActive">
      <div class="compare-header-bar">
        <div class="compare-title-area">
          <span class="compare-title">双版本对比</span>
          <span class="compare-subtitle">同一份数据，两种风格同时生成，可直接编辑后选择</span>
        </div>
        <div class="compare-actions">
          <el-button v-if="anyCompareGenerating" @click="abortAllCompare" type="danger" plain>
            停止生成
          </el-button>
          <el-button @click="exitCompare">返回配置</el-button>
        </div>
      </div>

      <el-row :gutter="12">
        <el-col :span="12" v-for="s in styleOptions" :key="s.key">
          <el-card class="compare-card">
            <template #header>
              <div class="compare-card-header">
                <div>
                  <span class="compare-style-name">{{ s.label }}</span>
                  <div class="compare-style-desc">{{ s.desc }}</div>
                  <span v-if="compareContents[s.key] && !compareGenerating[s.key]" class="compare-stats">
                    {{ getCompareStats(s.key).chars }} 字 · {{ getCompareStats(s.key).sections }} 个板块
                  </span>
                </div>
                <div class="compare-card-btns">
                  <el-button
                    v-if="compareContents[s.key] && !compareGenerating[s.key]"
                    size="small"
                    :type="compareEditMode[s.key] ? 'info' : ''"
                    @click="compareEditMode[s.key] = !compareEditMode[s.key]"
                  >
                    {{ compareEditMode[s.key] ? '预览' : '编辑' }}
                  </el-button>
                  <el-button
                    v-if="compareContents[s.key] && !compareGenerating[s.key]"
                    size="small"
                    @click="copyCompareContent(s.key)"
                  >
                    复制
                  </el-button>
                  <el-button
                    v-if="compareContents[s.key] && !compareGenerating[s.key]"
                    type="primary"
                    size="small"
                    @click="selectVersion(s.key)"
                  >
                    选择此版本
                  </el-button>
                </div>
              </div>
            </template>

            <div class="compare-card-body">
              <template v-if="compareGenerating[s.key]">
                <div
                  v-if="compareContents[s.key]"
                  class="markdown-preview"
                  v-html="renderMarkdown(compareContents[s.key])"
                ></div>
                <div class="compare-loading-tip">
                  <span class="loading-dots">
                    <span></span><span></span><span></span>
                  </span>
                  <span v-if="compareProgress[s.key]">{{ compareProgress[s.key] }}</span>
                  <span v-else>正在连接...</span>
                </div>
              </template>

              <template v-else-if="compareContents[s.key]">
                <!-- 编辑模式 -->
                <div v-if="compareEditMode[s.key]" class="compare-edit-area">
                  <div class="compare-edit-tip">直接修改 Markdown 内容，点击"选择此版本"应用</div>
                  <textarea
                    class="compare-textarea"
                    v-model="compareContents[s.key]"
                  ></textarea>
                </div>
                <!-- 预览模式 -->
                <div
                  v-else
                  class="markdown-preview"
                  v-html="renderMarkdown(compareContents[s.key])"
                ></div>
              </template>

              <div v-else class="compare-empty">
                <el-empty description="等待生成" :image-size="60" />
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </template>

    <!-- 普通模式：原有布局 -->
    <template v-else>
      <el-row :gutter="20">
        <!-- 左侧: 配置面板 -->
        <el-col :span="10">
          <el-card>
            <template #header>
              <div class="config-header">
                <span>生成配置</span>
                <el-button
                  v-if="summaryStore.content && !summaryStore.generating"
                  text
                  size="small"
                  @click="configCollapsed = !configCollapsed"
                >
                  {{ configCollapsed ? '展开配置' : '收起配置' }}
                </el-button>
              </div>
            </template>

            <!-- 折叠状态 -->
            <template v-if="configCollapsed && summaryStore.content && !summaryStore.generating">
              <div class="collapsed-config">
                <div class="collapsed-item">
                  <span class="collapsed-label">维度：</span>
                  <template v-if="summaryStore.dimensions.length > 0">
                    <el-tag v-for="dim in summaryStore.dimensions" :key="dim" size="small" class="collapsed-tag">{{ dim }}</el-tag>
                  </template>
                  <span v-else class="collapsed-auto">AI 自动组织</span>
                </div>
                <div class="collapsed-item">
                  <span class="collapsed-label">风格：</span>
                  <span>{{ styleLabel }}</span>
                </div>
                <div class="collapsed-item">
                  <span class="collapsed-label">类型：</span>
                  <span>{{ docTypeLabel }}</span>
                </div>
                <div class="collapsed-item">
                  <span class="collapsed-label">读者：</span>
                  <span>{{ audienceLabel }}</span>
                </div>
                <div class="collapsed-item">
                  <span class="collapsed-label">输出：</span>
                  <span>{{ writingSummaryLabel }}</span>
                </div>
                <div class="collapsed-item">
                  <span class="collapsed-label">格式：</span>
                  <span>{{ formatLabel }}</span>
                </div>
                <div v-if="summaryStore.businessContext" class="collapsed-item">
                  <span class="collapsed-label">补充说明：</span>
                  <span class="collapsed-prompt">{{ summaryStore.businessContext }}</span>
                </div>
                <el-button
                  type="primary"
                  plain
                  style="width: 100%; margin-top: 12px;"
                  @click="configCollapsed = false"
                >
                  修改配置并重新生成
                </el-button>
              </div>
            </template>

            <!-- 展开状态 -->
            <template v-else>
              <!-- 总结维度 -->
              <div class="section">
                <h4>总结维度</h4>
                <div class="selected-dims" v-if="summaryStore.dimensions.length > 0">
                  <el-tag
                    v-for="(dim, index) in summaryStore.dimensions"
                    :key="dim"
                    closable
                    @close="removeDimension(index)"
                    class="dim-tag"
                  >
                    {{ dim }}
                  </el-tag>
                </div>
                <div v-else class="empty-dims">可选：不选维度时 AI 将根据项目数据自动组织内容结构</div>

                <div class="dim-input">
                  <el-input
                    v-model="customDim"
                    placeholder="输入自定义维度，按回车添加"
                    @keyup.enter="addCustomDimension"
                    size="small"
                  />
                  <el-button size="small" @click="addCustomDimension" :disabled="!customDim.trim()">添加</el-button>
                </div>

                <div class="dim-suggestions">
                  <span class="suggestion-label">建议：</span>
                  <el-tag
                    v-for="s in availableSuggestions"
                    :key="s"
                    class="suggestion-tag"
                    effect="plain"
                    @click="addDimension(s)"
                  >
                    + {{ s }}
                  </el-tag>
                </div>
              </div>

              <!-- 总结风格 -->
              <div class="section">
                <h4>总结风格</h4>
                <el-radio-group v-model="summaryStore.style" class="style-radio-group">
                  <el-radio value="formal">业务导向</el-radio>
                  <span class="style-desc">突出业务价值和战略意义，弱化技术细节，适合向上汇报</span>
                  <el-radio value="semi-formal">技术叙述</el-radio>
                  <span class="style-desc">兼顾业务成果和技术实现，可展开技术方案和攻坚过程</span>
                </el-radio-group>
              </div>

              <!-- 写作控制 -->
              <div class="section">
                <h4>写作控制</h4>
                <div class="writing-grid">
                  <div class="writing-item">
                    <span class="writing-label">文档类型</span>
                    <el-select v-model="summaryStore.docType" size="small">
                      <el-option v-for="item in docTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                  <div class="writing-item">
                    <span class="writing-label">目标读者</span>
                    <el-select v-model="summaryStore.audience" size="small">
                      <el-option v-for="item in audienceOptions" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                  <div class="writing-item">
                    <span class="writing-label">语气偏好</span>
                    <el-select v-model="summaryStore.tone" size="small">
                      <el-option v-for="item in toneOptions" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                  <div class="writing-item">
                    <span class="writing-label">输出长度</span>
                    <el-select v-model="summaryStore.length" size="small">
                      <el-option v-for="item in lengthOptions" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                  <div class="writing-item">
                    <span class="writing-label">输出语言</span>
                    <el-select v-model="summaryStore.language" size="small">
                      <el-option v-for="item in languageOptions" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                  <div class="writing-item">
                    <span class="writing-label">输出格式</span>
                    <el-select v-model="summaryStore.format" size="small">
                      <el-option v-for="item in formatOptions" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </div>
                </div>
              </div>

              <!-- 补充说明 -->
              <div class="section">
                <h4>补充说明 (可选)</h4>
                <el-input
                  v-model="summaryStore.businessContext"
                  type="textarea"
                  :rows="4"
                  placeholder="业务背景、额外要求等，如：&#10;· 负责电商交易链路重构，支撑双十一峰值流量&#10;· 侧重前端技术方面的总结&#10;· 我是团队技术负责人"
                />
                <div class="form-tip">帮助 AI 理解业务背景和你的侧重点，生成更有针对性的总结</div>
              </div>

              <!-- 生成按钮组 -->
              <div class="generate-buttons">
                <el-button
                  type="primary"
                  size="large"
                  @click="generate"
                  :loading="summaryStore.generating"
                  :disabled="!canGenerate"
                  class="generate-btn"
                >
                  {{ summaryStore.generating ? '生成中...' : (summaryStore.content ? '重新生成总结' : 'AI 生成总结') }}
                </el-button>
                <el-button
                  size="large"
                  @click="generateOutline"
                  :loading="outlineGenerating"
                  :disabled="!canGenerate || summaryStore.generating"
                  class="generate-btn"
                >
                  先生成大纲
                </el-button>
                <el-button
                  size="large"
                  @click="generateCompare"
                  :disabled="!canGenerate || summaryStore.generating || outlineGenerating"
                  class="generate-btn"
                >
                  对比生成 (2种风格)
                </el-button>
              </div>
            </template>
          </el-card>
        </el-col>

        <!-- 右侧: 生成结果预览 / 大纲编辑 -->
        <el-col :span="14">
          <!-- 大纲编辑视图 -->
          <el-card v-if="outline.length > 0 && !summaryStore.generating" class="preview-card outline-card">
            <template #header>
              <div class="preview-header">
                <div class="preview-header-left">
                  <span>大纲编辑</span>
                  <span class="content-stats">可调整章节顺序、编辑标题和要点</span>
                </div>
              </div>
            </template>

            <div class="outline-editor">
              <div v-for="(item, i) in outline" :key="i" class="outline-item">
                <div class="outline-item-header">
                  <span class="outline-index">{{ i + 1 }}</span>
                  <el-input v-model="item.title" size="small" class="outline-title-input" placeholder="章节标题" />
                  <el-button size="small" :disabled="i === 0" @click="moveOutline(i, -1)" title="上移">↑</el-button>
                  <el-button size="small" :disabled="i === outline.length - 1" @click="moveOutline(i, 1)" title="下移">↓</el-button>
                  <el-button size="small" type="danger" plain @click="outline.splice(i, 1)" title="删除">✕</el-button>
                </div>
                <div class="outline-points">
                  <div v-for="(_, j) in item.points" :key="j" class="outline-point">
                    <el-input v-model="item.points[j]" size="small" placeholder="要点描述" />
                    <el-button size="small" text @click="item.points.splice(j, 1)" title="删除要点">✕</el-button>
                  </div>
                  <el-button size="small" text @click="item.points.push('')" class="add-point-btn">+ 添加要点</el-button>
                </div>
              </div>
              <el-button size="small" text @click="outline.push({ title: '', points: [''] })" class="add-section-btn">+ 添加章节</el-button>
            </div>

            <div class="outline-actions">
              <el-button @click="outline = []">放弃大纲</el-button>
              <el-button @click="compareFromOutline" :disabled="summaryStore.generating">
                对比生成 (2种风格)
              </el-button>
              <el-button type="primary" @click="generateFromOutline" :loading="summaryStore.generating">
                基于大纲生成全文
              </el-button>
            </div>
          </el-card>

          <!-- 大纲生成中 -->
          <el-card v-else-if="outlineGenerating" class="preview-card">
            <template #header>
              <div class="preview-header">
                <span>生成预览</span>
              </div>
            </template>
            <div class="generating-progress">
              <div class="generating-spinner">
                <span class="loading-dots"><span></span><span></span><span></span></span>
              </div>
              <p class="generating-phase">{{ generateProgress || '正在生成大纲...' }}</p>
              <p class="generating-hint">AI 正在分析数据并生成结构化大纲</p>
            </div>
          </el-card>

          <!-- 正常预览卡片 -->
          <el-card v-else class="preview-card">
            <template #header>
              <div class="preview-header">
                <div class="preview-header-left">
                  <span>生成预览</span>
                  <span v-if="summaryStore.content && !summaryStore.generating" class="content-stats">
                    {{ contentStats.chars }} 字 · {{ contentStats.paragraphs }} 段 · {{ contentStats.sections }} 个板块
                  </span>
                </div>
                <div class="preview-header-btns">
                  <el-button
                    v-if="summaryStore.content && !summaryStore.generating"
                    size="small"
                    :type="refining ? 'warning' : 'primary'"
                    :plain="!refining"
                    :loading="refining"
                    :class="{ 'refine-btn-active': refining }"
                    @click="!refining && (refineDialogVisible = true)"
                  >
                    {{ refining ? 'AI 修改中...' : '继续修改' }}
                  </el-button>
                  <el-button
                    v-if="summaryStore.content"
                    size="small"
                    @click="copyContent"
                  >
                    复制内容
                  </el-button>
                </div>
              </div>
            </template>

            <div v-if="!summaryStore.content && !summaryStore.generating" class="empty-preview">
              <el-empty description="配置完成后点击生成按钮" />
            </div>

            <!-- 生成中且尚无内容时显示加载提示 -->
            <div v-else-if="summaryStore.generating && !summaryStore.content" class="generating-progress">
              <div class="generating-spinner">
                <span class="loading-dots"><span></span><span></span><span></span></span>
              </div>
              <p class="generating-phase">{{ generateProgress || '正在连接...' }}</p>
              <p class="generating-hint">AI 正在分析数据并生成总结，内容将实时显示</p>
            </div>

            <!-- 分段渲染：每个 ## 章节独立显示，悬浮显示操作栏 -->
            <div v-else class="sections-preview">
              <div
                v-for="(section, i) in sections"
                :key="i"
                class="section-block"
                @mouseenter="hoverSection = i"
                @mouseleave="hoverSection = -1"
              >
                <div
                  v-if="section.isSection && hoverSection === i && !summaryStore.generating && refiningSection === -1"
                  class="section-toolbar"
                >
                  <el-button size="small" @click="refineSection(i, '让这段表述更专业、更有力度')">润色</el-button>
                  <el-button size="small" @click="refineSection(i, '补充量化数据和具体成果')">补数据</el-button>
                  <el-button size="small" @click="refineSection(i, '缩写为原来的一半篇幅')">缩写</el-button>
                  <el-button size="small" @click="refineSection(i, '扩写为原来的两倍篇幅，补充更多细节')">扩写</el-button>
                  <el-button size="small" @click="openCustomRefine(i)">自定义</el-button>
                </div>
                <!-- 修改中的加载遮罩 -->
                <div v-if="refiningSection === i" class="section-loading-overlay">
                  <span class="loading-dots"><span></span><span></span><span></span></span>
                  <span class="section-loading-text">AI 正在修改该章节...</span>
                </div>
                <div
                  class="section-content markdown-preview"
                  :class="{ 'section-refining': refiningSection === i }"
                  v-html="section.html"
                ></div>
              </div>
            </div>
          </el-card>

          <!-- 版本历史 -->
          <el-card
            v-if="summaryStore.versions.length > 0 && !summaryStore.generating"
            class="version-card"
          >
            <template #header>
              <div class="version-header">
                <span>版本历史 ({{ summaryStore.versions.length }})</span>
                <span class="version-tip">每次修改自动保存快照，可随时回退</span>
              </div>
            </template>

            <div class="version-list">
              <div
                v-for="(ver, idx) in summaryStore.versions"
                :key="idx"
                class="version-item"
                :class="{ 'is-current': idx === summaryStore.versions.length - 1 }"
              >
                <div class="version-info">
                  <span class="version-badge">V{{ idx + 1 }}</span>
                  <span class="version-label">{{ ver.label }}</span>
                  <el-tag
                    v-if="idx === summaryStore.versions.length - 1"
                    size="small"
                    type="success"
                    class="version-current-tag"
                  >
                    当前
                  </el-tag>
                  <span class="version-time">{{ formatTime(ver.timestamp) }}</span>
                </div>
                <div class="version-actions">
                  <el-button
                    v-if="idx > 0"
                    text
                    size="small"
                    @click="openDiff(idx)"
                  >
                    对比
                  </el-button>
                  <el-button
                    v-if="idx < summaryStore.versions.length - 1"
                    text
                    size="small"
                    type="warning"
                    @click="handleRollback(idx)"
                  >
                    回退
                  </el-button>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 操作栏 -->
      <div class="action-bar" v-if="summaryStore.content && !summaryStore.generating">
        <el-button @click="router.push('/feishu')">上一步</el-button>
        <el-button type="primary" size="large" @click="router.push('/preview')">
          下一步：预览导出
        </el-button>
      </div>
    </template>

    <!-- 对话修改弹窗 -->
    <el-dialog
      v-model="refineDialogVisible"
      title="对话修改"
      width="560px"
      top="10vh"
      :close-on-click-modal="!refining"
      :close-on-press-escape="!refining"
    >
      <div class="refine-dialog-body">
        <!-- 对话历史 -->
        <div v-if="summaryStore.chatMessages.length > 0" class="refine-chat-history" ref="chatHistoryRef">
          <div
            v-for="(msg, index) in summaryStore.chatMessages"
            :key="index"
            class="chat-msg"
            :class="msg.role"
          >
            <div class="chat-role">{{ msg.role === 'user' ? '修改意见' : 'AI 回应' }}</div>
            <div class="chat-text">{{ msg.role === 'user' ? msg.content : '已应用修改' }}</div>
          </div>
          <div v-if="refining" class="chat-msg assistant">
            <div class="chat-role">AI 回应</div>
            <div class="chat-text refine-loading">
              <span class="loading-dots"><span></span><span></span><span></span></span>
              修改中...
            </div>
          </div>
        </div>
        <div v-else class="refine-empty-hint">
          输入自然语言修改意见，AI 将基于当前总结进行调整。支持多轮对话。
        </div>

        <!-- 输入区域 -->
        <div class="refine-input-area">
          <el-input
            v-model="refineInput"
            type="textarea"
            :rows="3"
            placeholder="如：第二部分的数据不对，改成 xxx；把技术升级那段删掉；加一段关于团队管理的内容..."
            :disabled="refining"
            @keyup.ctrl.enter="submitRefine"
          />
          <div class="refine-input-footer">
            <span class="refine-shortcut-tip">Ctrl+Enter 快捷提交</span>
            <el-button
              type="primary"
              @click="submitRefine"
              :loading="refining"
              :disabled="!refineInput.trim() || refining"
            >
              {{ refining ? '修改中...' : '提交修改' }}
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 自定义章节修改弹窗 -->
    <el-dialog
      v-model="customRefineDialog"
      title="自定义修改"
      width="480px"
      :close-on-click-modal="true"
    >
      <div class="custom-refine-body">
        <p class="custom-refine-hint">输入对该章节的修改要求：</p>
        <el-input
          v-model="customRefineInput"
          type="textarea"
          :rows="3"
          placeholder="如：改成第一人称、添加项目成果数据、语气更加正式..."
          @keyup.ctrl.enter="submitCustomRefine"
        />
      </div>
      <template #footer>
        <el-button @click="customRefineDialog = false">取消</el-button>
        <el-button type="primary" @click="submitCustomRefine" :disabled="!customRefineInput.trim()">开始修改</el-button>
      </template>
    </el-dialog>

    <!-- Diff 对比弹窗 -->
    <el-dialog
      v-model="diffDialogVisible"
      title="版本对比"
      width="80%"
      top="5vh"
      destroy-on-close
    >
      <template v-if="diffData">
        <div class="diff-header">
          <span class="diff-label diff-old">V{{ diffData.oldIndex + 1 }}: {{ diffData.oldLabel }}</span>
          <span class="diff-arrow">-></span>
          <span class="diff-label diff-new">V{{ diffData.newIndex + 1 }}: {{ diffData.newLabel }}</span>
        </div>
        <div class="diff-content">
          <div
            v-for="(part, idx) in diffData.changes"
            :key="idx"
            class="diff-line"
            :class="{
              'diff-added': part.added,
              'diff-removed': part.removed,
            }"
          >
            <span class="diff-indicator">{{ part.added ? '+' : part.removed ? '-' : ' ' }}</span>
            <span class="diff-text">{{ part.value }}</span>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="diffDialogVisible = false">关闭</el-button>
        <el-button
          v-if="diffData && diffData.oldIndex < summaryStore.versions.length - 1"
          type="warning"
          @click="handleRollback(diffData!.oldIndex); diffDialogVisible = false"
        >
          回退到 V{{ diffData!.oldIndex + 1 }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MarkdownIt from 'markdown-it'
import { diffLines, type Change } from 'diff'
import { DIMENSION_SUGGESTIONS } from '@work-summary/shared'
import { useProjectStore } from '@/stores/project'
import { useSummaryStore } from '@/stores/summary'
import { useSettingsStore } from '@/stores/settings'
import { streamGenerate, streamRefine, streamRefineSection, streamGenerateOutline, streamFromOutline } from '@/api/generate'

const router = useRouter()
const projectStore = useProjectStore()
const summaryStore = useSummaryStore()
const settingsStore = useSettingsStore()

const md = new MarkdownIt()
const customDim = ref('')
const refineInput = ref('')
const refining = ref(false)
const generateProgress = ref('')
const refineDialogVisible = ref(false)
const configCollapsed = ref(false)
const chatHistoryRef = ref<HTMLElement | null>(null)

// ===== 章节级修改状态 =====
const hoverSection = ref(-1)
const refiningSection = ref(-1)
const customRefineDialog = ref(false)
const customRefineInput = ref('')
const customRefineTarget = ref(-1)

// ===== 大纲模式状态 =====
const outline = ref<{ title: string; points: string[] }[]>([])
const outlineGenerating = ref(false)

// 按 ## 拆分的章节列表（用于分段渲染和悬浮操作）
const sections = computed(() => {
  const text = summaryStore.content
  if (!text) return []
  const parts = text.split(/(?=^## )/m)
  return parts.map((part, index) => ({
    index,
    raw: part,
    html: md.render(part),
    isSection: part.trimStart().startsWith('## '),
  }))
})

// 内容统计
const contentStats = computed(() => {
  const text = summaryStore.content
  if (!text) return { chars: 0, paragraphs: 0, sections: 0 }
  // 中文字数：去除 Markdown 标记和空白后的纯文本字符数
  const plain = text.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/[*_~`>-]/g, '').trim()
  const chars = plain.replace(/\s+/g, '').length
  // 段落数：非空行中以数字序号开头的要点行数
  const paragraphs = text.split('\n').filter(l => /^\d+\.\s/.test(l.trim())).length
  // 板块数：二级标题数
  const sections = text.split('\n').filter(l => /^##\s/.test(l.trim())).length
  return { chars, paragraphs, sections }
})

// 对话消息变化时自动滚动到底部
watch([() => summaryStore.chatMessages, refining], () => {
  nextTick(() => {
    if (chatHistoryRef.value) {
      chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
    }
  })
}, { deep: true })

// ===== 对比模式状态 =====
const compareActive = ref(false)
const compareContents = reactive<Record<string, string>>({
  'formal': '',
  'semi-formal': '',
})
const compareGenerating = reactive<Record<string, boolean>>({
  'formal': false,
  'semi-formal': false,
})
const compareProgress = reactive<Record<string, string>>({
  'formal': '',
  'semi-formal': '',
})
const compareEditMode = reactive<Record<string, boolean>>({
  'formal': false,
  'semi-formal': false,
})
const compareAborts: (() => void)[] = []

const styleOptions = [
  { key: 'formal', label: '业务导向', desc: '突出业务价值，适合向上汇报' },
  { key: 'semi-formal', label: '技术叙述', desc: '兼顾业务和技术，适合团队内' },
]

const docTypeOptions = [
  { value: 'yearly-summary', label: '年终总结' },
  { value: 'quarterly-review', label: '季度复盘' },
  { value: 'monthly-report', label: '月度汇报' },
  { value: 'promotion-report', label: '晋升述职' },
  { value: 'project-retro', label: '项目复盘' },
  { value: 'resume', label: '求职简历' },
] as const

const audienceOptions = [
  { value: 'manager', label: '直属上级' },
  { value: 'tech-lead', label: '技术负责人' },
  { value: 'cross-team', label: '跨团队评审' },
  { value: 'self-archive', label: '个人归档' },
] as const

const toneOptions = [
  { value: 'professional', label: '专业稳健' },
  { value: 'concise', label: '简洁直达' },
  { value: 'result-driven', label: '结果导向' },
] as const

const lengthOptions = [
  { value: 'short', label: '精简版' },
  { value: 'medium', label: '标准版' },
  { value: 'long', label: '详细版' },
] as const

const languageOptions = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
] as const

const formatOptions = [
  { value: 'bullets', label: '序号要点' },
  { value: 'star', label: 'STAR 法则' },
] as const

const anyCompareGenerating = computed(() => {
  return compareGenerating['formal'] || compareGenerating['semi-formal']
})

// ===== 版本历史 Diff 状态 =====
const diffDialogVisible = ref(false)
const diffData = ref<{
  oldIndex: number
  newIndex: number
  oldLabel: string
  newLabel: string
  changes: Change[]
} | null>(null)

// ===== 原有逻辑 =====
const styleLabel = computed(() => {
  const map: Record<string, string> = {
    'formal': '业务导向',
    'semi-formal': '技术叙述',
  }
  return map[summaryStore.style] || summaryStore.style
})

const availableSuggestions = computed(() => {
  return DIMENSION_SUGGESTIONS.filter(s => !summaryStore.dimensions.includes(s))
})

function findOptionLabel(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((item) => item.value === value)?.label || value
}

const docTypeLabel = computed(() => findOptionLabel(docTypeOptions, summaryStore.docType))
const audienceLabel = computed(() => findOptionLabel(audienceOptions, summaryStore.audience))
const toneLabel = computed(() => findOptionLabel(toneOptions, summaryStore.tone))
const lengthLabel = computed(() => findOptionLabel(lengthOptions, summaryStore.length))
const languageLabel = computed(() => findOptionLabel(languageOptions, summaryStore.language))
const formatLabel = computed(() => findOptionLabel(formatOptions, summaryStore.format))
const writingSummaryLabel = computed(() => `${toneLabel.value} / ${lengthLabel.value} / ${languageLabel.value}`)

const canGenerate = computed(() => {
  return projectStore.analyses.size > 0
    || (projectStore.scanResult?.standaloneDocuments?.length ?? 0) > 0
    || summaryStore.feishuDocs.length > 0
})

function addDimension(dim: string) {
  if (!summaryStore.dimensions.includes(dim)) {
    summaryStore.dimensions.push(dim)
  }
}

function removeDimension(index: number) {
  summaryStore.dimensions.splice(index, 1)
}

function addCustomDimension() {
  const dim = customDim.value.trim()
  if (!dim) return
  if (summaryStore.dimensions.includes(dim)) {
    ElMessage.warning('该维度已添加')
    return
  }
  summaryStore.dimensions.push(dim)
  customDim.value = ''
}

const renderedContent = computed(() => {
  return md.render(summaryStore.content || '')
})

function renderMarkdown(content: string): string {
  return md.render(content || '')
}

/** 清理 AI 开场白废话 */
function cleanAIOutput(text: string): string {
  return text.replace(
    /^(好的[，,]?|作为[一位]*.*?[，,。]|我将[根据]?.*?[，,。]|以下是.*?[：:。\n]|根据.*?修改.*?[：:。\n])+/s,
    ''
  ).trimStart()
}

/** 格式化时间戳 */
function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// ===== 单版本生成 =====
function generate() {
  summaryStore.generating = true
  summaryStore.setContent('')
  summaryStore.clearVersions()
  summaryStore.chatMessages = []
  generateProgress.value = ''
  outline.value = []

  streamGenerate(
    buildGenerateRequest(),
    (chunk) => {
      summaryStore.appendContent(chunk)
    },
    () => {
      const cleaned = cleanAIOutput(summaryStore.content)
      if (cleaned !== summaryStore.content) {
        summaryStore.setContent(cleaned)
      }
      summaryStore.generating = false
      generateProgress.value = ''
      summaryStore.saveVersion('初始生成')
      configCollapsed.value = true
      ElMessage.success('总结生成完成!')
    },
    (err) => {
      summaryStore.generating = false
      generateProgress.value = ''
      ElMessage.error(`生成失败: ${err}`)
    },
    (progress) => {
      generateProgress.value = progress
    },
  )
}

// ===== 对比生成（两种风格并行） =====
function generateCompare() {
  compareActive.value = true
  for (const s of styleOptions) {
    compareContents[s.key] = ''
    compareGenerating[s.key] = true
    compareProgress[s.key] = ''
    compareEditMode[s.key] = false
  }
  compareAborts.length = 0

  for (const s of styleOptions) {
    const abort = streamGenerate(
      {
        ...buildGenerateRequest(),
        style: s.key as 'formal' | 'semi-formal',
      },
      (chunk) => {
        compareContents[s.key] += chunk
      },
      () => {
        compareContents[s.key] = cleanAIOutput(compareContents[s.key])
        compareGenerating[s.key] = false

        if (!compareGenerating['formal'] && !compareGenerating['semi-formal']) {
          ElMessage.success('两个版本全部生成完成，请选择满意的版本')
        }
      },
      (err) => {
        compareGenerating[s.key] = false
        ElMessage.error(`「${s.label}」生成失败: ${err}`)
      },
      (progress) => {
        compareProgress[s.key] = progress
      },
    )
    compareAborts.push(abort)
  }
}

/** 基于大纲对比生成两种风格 */
function compareFromOutline() {
  const validOutline = outline.value
    .filter(item => item.title.trim())
    .map(item => ({ ...item, points: item.points.filter(p => p.trim()) }))

  if (validOutline.length === 0) {
    ElMessage.warning('大纲为空，请至少添加一个章节')
    return
  }

  compareActive.value = true
  for (const s of styleOptions) {
    compareContents[s.key] = ''
    compareGenerating[s.key] = true
    compareProgress[s.key] = ''
    compareEditMode[s.key] = false
  }
  compareAborts.length = 0

  for (const s of styleOptions) {
    const abort = streamFromOutline(
      {
        ...buildGenerateRequest(),
        style: s.key as 'formal' | 'semi-formal',
        outline: validOutline,
      },
      (chunk) => {
        compareContents[s.key] += chunk
      },
      () => {
        compareContents[s.key] = cleanAIOutput(compareContents[s.key])
        compareGenerating[s.key] = false

        if (!compareGenerating['formal'] && !compareGenerating['semi-formal']) {
          outline.value = []
          ElMessage.success('两个版本全部生成完成，请选择满意的版本')
        }
      },
      (err) => {
        compareGenerating[s.key] = false
        ElMessage.error(`「${s.label}」生成失败: ${err}`)
      },
      (progress) => {
        compareProgress[s.key] = progress
      },
    )
    compareAborts.push(abort)
  }
}

function selectVersion(styleKey: string) {
  summaryStore.setContent(compareContents[styleKey])
  summaryStore.style = styleKey as 'formal' | 'semi-formal'
  summaryStore.clearVersions()
  summaryStore.saveVersion('初始生成')
  compareActive.value = false
  summaryStore.chatMessages = []
  configCollapsed.value = true
  const label = styleOptions.find(s => s.key === styleKey)?.label || styleKey
  ElMessage.success(`已选择「${label}」版本，可继续使用对话修改`)
}

function abortAllCompare() {
  for (const abort of compareAborts) {
    abort()
  }
  compareAborts.length = 0
  for (const s of styleOptions) {
    compareGenerating[s.key] = false
  }
}

function exitCompare() {
  abortAllCompare()
  compareActive.value = false
}

function getCompareStats(styleKey: string) {
  const text = compareContents[styleKey]
  if (!text) return { chars: 0, sections: 0 }
  const plain = text.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/[*_~`>-]/g, '').trim()
  const chars = plain.replace(/\s+/g, '').length
  const sections = text.split('\n').filter(l => /^##\s/.test(l.trim())).length
  return { chars, sections }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '- ')
}

function copyCompareContent(styleKey: string) {
  navigator.clipboard.writeText(stripMarkdown(compareContents[styleKey]))
  ElMessage.success('已复制到剪贴板')
}

// ===== 对话式修改 =====
function submitRefine() {
  const instruction = refineInput.value.trim()
  if (!instruction || refining.value) return

  refining.value = true
  refineDialogVisible.value = false

  summaryStore.chatMessages.push({ role: 'user', content: instruction })

  const history = summaryStore.chatMessages.length <= 1
    ? undefined
    : buildChatHistory()

  const previousContent = summaryStore.content
  summaryStore.setContent('')

  streamRefine(
    {
      content: previousContent,
      instruction,
      history,
    },
    (chunk) => {
      summaryStore.appendContent(chunk)
    },
    () => {
      const cleaned = cleanAIOutput(summaryStore.content)
      if (cleaned !== summaryStore.content) {
        summaryStore.setContent(cleaned)
      }

      summaryStore.chatMessages.push({ role: 'assistant', content: summaryStore.content })

      // 保存版本快照
      summaryStore.saveVersion(instruction)

      refining.value = false
      refineInput.value = ''
      ElMessage.success('修改完成!')
    },
    (err) => {
      summaryStore.setContent(previousContent)
      summaryStore.chatMessages.pop()
      refining.value = false
      // 失败时保持弹窗打开，方便用户重新提交
      ElMessage.error(`修改失败: ${err}`)
    },
  )
}

function buildChatHistory(): { role: string; content: string }[] {
  return summaryStore.chatMessages.slice(0, -1)
}

// ===== 版本历史操作 =====

/** 打开 diff 对比弹窗：对比选中版本与其前一个版本 */
function openDiff(index: number) {
  if (index <= 0 || index >= summaryStore.versions.length) return

  const oldVer = summaryStore.versions[index - 1]
  const newVer = summaryStore.versions[index]
  const changes = diffLines(oldVer.content, newVer.content)

  diffData.value = {
    oldIndex: index - 1,
    newIndex: index,
    oldLabel: oldVer.label,
    newLabel: newVer.label,
    changes,
  }
  diffDialogVisible.value = true
}

/** 回退到指定版本 */
async function handleRollback(index: number) {
  const ver = summaryStore.versions[index]
  if (!ver) return

  try {
    await ElMessageBox.confirm(
      `确定回退到 V${index + 1}（${ver.label}）？当前内容将被替换。`,
      '回退确认',
      { confirmButtonText: '确定回退', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 用户取消
  }

  summaryStore.rollbackToVersion(index)
  // 保存回退操作本身作为新版本
  summaryStore.saveVersion(`回退到 V${index + 1}`)
  ElMessage.success(`已回退到 V${index + 1}`)
}

function copyContent() {
  navigator.clipboard.writeText(stripMarkdown(summaryStore.content))
  ElMessage.success('已复制到剪贴板')
}

// ===== 章节级修改 =====
function refineSection(sectionIndex: number, instruction: string) {
  if (refiningSection.value !== -1) return
  refiningSection.value = sectionIndex

  // 获取章节标题用于版本标签
  const sectionParts = summaryStore.content.split(/(?=^## )/m)
  const sectionTitle = sectionParts[sectionIndex]?.split('\n')[0]?.replace(/^##\s*/, '').trim() || `章节${sectionIndex}`

  let newContent = ''

  streamRefineSection(
    {
      fullContent: summaryStore.content,
      sectionIndex,
      instruction,
    },
    (chunk) => {
      newContent += chunk
    },
    () => {
      const cleaned = cleanAIOutput(newContent)
      summaryStore.replaceSection(sectionIndex, cleaned.endsWith('\n') ? cleaned : cleaned + '\n')
      summaryStore.saveVersion(`修改：${sectionTitle}`)
      refiningSection.value = -1
      ElMessage.success(`「${sectionTitle}」修改完成`)
    },
    (err) => {
      refiningSection.value = -1
      ElMessage.error(`章节修改失败: ${err}`)
    },
  )
}

function openCustomRefine(sectionIndex: number) {
  customRefineTarget.value = sectionIndex
  customRefineInput.value = ''
  customRefineDialog.value = true
}

function submitCustomRefine() {
  const instruction = customRefineInput.value.trim()
  if (!instruction) return
  customRefineDialog.value = false
  refineSection(customRefineTarget.value, instruction)
}

// ===== 大纲模式 =====
function buildGenerateRequest() {
  const analyses = projectStore.getSelectedAnalyses()
  return {
    projects: analyses,
    feishuDocs: summaryStore.feishuDocs,
    standaloneDocuments: projectStore.scanResult?.standaloneDocuments || [],
    dimensions: summaryStore.dimensions,
    style: summaryStore.style,
    docType: summaryStore.docType,
    audience: summaryStore.audience,
    tone: summaryStore.tone,
    length: summaryStore.length,
    language: summaryStore.language,
    format: summaryStore.format,
    businessContext: summaryStore.businessContext || undefined,
    roles: settingsStore.roles.length > 0 ? settingsStore.roles : undefined,
  }
}

function generateOutline() {
  outlineGenerating.value = true
  outline.value = []
  generateProgress.value = ''
  // 清除旧正文，切换到大纲模式
  summaryStore.content = ''

  streamGenerateOutline(
    buildGenerateRequest(),
    (result) => {
      outline.value = result
      outlineGenerating.value = false
      generateProgress.value = ''
      ElMessage.success('大纲生成完成，可编辑后生成全文')
    },
    (err) => {
      outlineGenerating.value = false
      generateProgress.value = ''
      ElMessage.error(`大纲生成失败: ${err}`)
    },
    (progress) => {
      generateProgress.value = progress
    },
  )
}

function generateFromOutline() {
  // 过滤掉空标题和空要点
  const validOutline = outline.value
    .filter(item => item.title.trim())
    .map(item => ({ ...item, points: item.points.filter(p => p.trim()) }))

  if (validOutline.length === 0) {
    ElMessage.warning('大纲为空，请至少添加一个章节')
    return
  }

  summaryStore.generating = true
  summaryStore.setContent('')
  summaryStore.clearVersions()
  summaryStore.chatMessages = []
  generateProgress.value = ''

  streamFromOutline(
    { ...buildGenerateRequest(), outline: validOutline },
    (chunk) => {
      summaryStore.appendContent(chunk)
    },
    () => {
      const cleaned = cleanAIOutput(summaryStore.content)
      if (cleaned !== summaryStore.content) {
        summaryStore.setContent(cleaned)
      }
      summaryStore.generating = false
      generateProgress.value = ''
      summaryStore.saveVersion('基于大纲生成')
      outline.value = []
      configCollapsed.value = true
      ElMessage.success('总结生成完成!')
    },
    (err) => {
      summaryStore.generating = false
      generateProgress.value = ''
      ElMessage.error(`生成失败: ${err}`)
    },
    (progress) => {
      generateProgress.value = progress
    },
  )
}

function moveOutline(index: number, direction: number) {
  const target = index + direction
  if (target < 0 || target >= outline.value.length) return
  const temp = outline.value[index]
  outline.value[index] = outline.value[target]
  outline.value[target] = temp
}
</script>

<style scoped>
.generate-view {
  max-width: 1200px;
  margin: 0 auto;
}

.generate-view.compare-active {
  max-width: 1600px;
}

/* ===== 对比模式样式 ===== */
.compare-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.compare-title-area {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.compare-title {
  font-size: 18px;
  font-weight: 600;
  color: #e2e8f0;
}

.compare-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.compare-actions {
  display: flex;
  gap: 8px;
}

.compare-card {
  height: calc(100vh - 160px);
  display: flex;
  flex-direction: column;
}

.compare-card :deep(.el-card__body) {
  flex: 1;
  overflow: hidden;
  padding: 12px;
}

.compare-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.compare-style-name {
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
}

.compare-style-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 2px;
}

.compare-stats {
  display: inline-block;
  font-size: 12px;
  color: #409eff;
  margin-top: 4px;
}

.compare-card-btns {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.compare-card-body {
  height: 100%;
  overflow-y: auto;
}

.compare-loading-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.loading-dots {
  display: inline-flex;
  gap: 3px;
}

.loading-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #667eea;
  animation: dotPulse 1.2s ease-in-out infinite;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.compare-edit-area {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.compare-edit-tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  padding: 4px 0 8px;
  flex-shrink: 0;
}

.compare-textarea {
  flex: 1;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 10px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
  color: #e2e8f0;
  box-sizing: border-box;
}

.compare-textarea:focus {
  border-color: #409eff;
}

.compare-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
}

/* ===== 普通模式样式 ===== */
.section {
  margin-bottom: 20px;
}

.section h4 {
  font-size: 14px;
  color: #e2e8f0;
  margin-bottom: 10px;
}

.style-radio-group {
  display: grid !important;
  grid-template-columns: auto 1fr;
  gap: 8px 12px;
  align-items: baseline;
}

.style-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.writing-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.writing-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.writing-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.selected-dims {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.dim-tag {
  font-size: 13px;
}

.empty-dims {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 10px;
}

.dim-input {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.dim-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.suggestion-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  flex-shrink: 0;
}

.suggestion-tag {
  cursor: pointer;
  font-size: 12px;
}

.suggestion-tag:hover {
  color: #409eff;
  border-color: #409eff;
}

.generate-buttons {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.generate-btn {
  flex: 1;
}

.preview-card {
  min-height: 600px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.empty-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.generating-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: 12px;
}

.generating-spinner {
  transform: scale(1.5);
  margin-bottom: 8px;
}

.generating-phase {
  font-size: 15px;
  color: #e2e8f0;
  font-weight: 500;
}

.generating-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.markdown-preview {
  line-height: 1.8;
  font-size: 14px;
}

.markdown-preview :deep(h1) {
  font-size: 24px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.12);
  padding-bottom: 8px;
  margin: 20px 0 12px;
}

.markdown-preview :deep(h2) {
  font-size: 20px;
  color: #e2e8f0;
  margin: 20px 0 10px;
}

.markdown-preview :deep(h3) {
  font-size: 16px;
  color: #cbd5e1;
  margin: 16px 0 8px;
}

.markdown-preview :deep(strong) {
  color: #e2e8f0;
}

.markdown-preview :deep(ul) {
  padding-left: 20px;
}

.markdown-preview :deep(li) {
  margin: 6px 0;
}

/* ===== 对话修改弹窗样式 ===== */
.refine-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.refine-chat-history {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
}

.chat-msg {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.chat-msg:last-child {
  margin-bottom: 0;
}

.chat-msg.user {
  background: rgba(64, 158, 255, 0.1);
  border-left: 3px solid #409eff;
}

.chat-msg.assistant {
  background: rgba(102, 126, 234, 0.12);
  border-left: 3px solid #67c23a;
}

.chat-role {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 2px;
}

.chat-text {
  color: #e2e8f0;
  line-height: 1.5;
}

.refine-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.55);
}

.refine-empty-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.6;
  padding: 12px 0;
}

.refine-input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.refine-input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.refine-shortcut-tip {
  font-size: 12px;
  color: #c0c4cc;
}

/* ===== 继续修改按钮动画 ===== */
.refine-btn-active {
  animation: refine-pulse 2s ease-in-out infinite;
  cursor: default !important;
}

@keyframes refine-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.preview-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.content-stats {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  font-weight: normal;
}

.preview-header-btns {
  display: flex;
  gap: 8px;
  align-items: center;
}

.form-tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 4px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.collapsed-config {
  font-size: 13px;
}

.collapsed-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.collapsed-label {
  color: rgba(255, 255, 255, 0.55);
  flex-shrink: 0;
}

.collapsed-tag {
  margin: 2px 0;
}

.collapsed-auto {
  color: rgba(255, 255, 255, 0.55);
  font-style: italic;
}

.collapsed-prompt {
  color: #cbd5e1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.action-bar {
  margin-top: 24px;
  display: flex;
  justify-content: space-between;
}

/* ===== 版本历史样式 ===== */
.version-card {
  margin-top: 16px;
}

.version-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.version-tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  font-weight: normal;
}

.version-list {
  max-height: 240px;
  overflow-y: auto;
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.version-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.version-item.is-current {
  background: rgba(102, 126, 234, 0.12);
}

.version-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.version-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 20px;
  border-radius: 10px;
  background: #409eff;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.version-item.is-current .version-badge {
  background: #67c23a;
}

.version-label {
  font-size: 13px;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-current-tag {
  flex-shrink: 0;
}

.version-time {
  font-size: 12px;
  color: #c0c4cc;
  flex-shrink: 0;
}

.version-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* ===== Diff 对比弹窗样式 ===== */
.diff-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  font-size: 13px;
}

.diff-label {
  font-weight: 600;
}

.diff-old {
  color: #f56c6c;
}

.diff-new {
  color: #67c23a;
}

.diff-arrow {
  color: rgba(255, 255, 255, 0.55);
}

.diff-content {
  max-height: 60vh;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.diff-line {
  display: flex;
  padding: 2px 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-added {
  background: rgba(103, 194, 58, 0.12);
}

.diff-removed {
  background: rgba(234, 84, 85, 0.15);
  text-decoration: line-through;
  opacity: 0.7;
}

.diff-indicator {
  width: 16px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 600;
  user-select: none;
}

.diff-added .diff-indicator {
  color: #67c23a;
}

.diff-removed .diff-indicator {
  color: #f56c6c;
}

.diff-text {
  flex: 1;
}

/* ===== 章节分段渲染 + 悬浮操作栏 ===== */
.sections-preview {
  line-height: 1.8;
  font-size: 14px;
}

.section-block {
  position: relative;
  border-radius: 6px;
  transition: background 0.15s;
}

.section-block:hover {
  background: rgba(255, 255, 255, 0.05);
}

.section-toolbar {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 10;
}

.section-content {
  transition: opacity 0.3s;
}

.section-refining {
  opacity: 0.3;
  pointer-events: none;
}

.section-loading-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  background: rgba(102, 126, 234, 0.1);
  border: 1px dashed #409eff;
  border-radius: 6px;
  margin-bottom: 4px;
}

.section-loading-text {
  font-size: 13px;
  color: #409eff;
  font-weight: 500;
}

/* ===== 大纲编辑视图 ===== */
.outline-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
}

.outline-editor {
  flex: 1;
  overflow-y: auto;
}

.outline-item {
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.outline-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.outline-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  border-radius: 12px;
  background: #409eff;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.outline-title-input {
  flex: 1;
}

.outline-points {
  padding-left: 32px;
}

.outline-point {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.outline-point .el-input {
  flex: 1;
}

.add-point-btn {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.add-section-btn {
  width: 100%;
  margin-top: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.outline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin-top: 16px;
}

/* ===== 自定义修改弹窗 ===== */
.custom-refine-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.custom-refine-hint {
  font-size: 13px;
  color: #cbd5e1;
  margin: 0;
}
</style>

