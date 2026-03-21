<template>
  <div class="settings-view">
    <el-card>
      <template #header>
        <span>基础配置</span>
      </template>

      <el-form label-width="140px" :model="settings">
        <el-form-item label="Git 用户名" required>
          <el-input
            v-model="settings.gitAuthor"
            placeholder="用于过滤 Git 提交，如: your-name 或 your-email@example.com"
          />
          <div class="form-tip">
            填写你的 Git 用户名或邮箱，用于在多人协作项目中识别你的代码贡献
          </div>
        </el-form-item>

        <el-form-item label="总结日期">
          <div class="date-range">
            <el-date-picker
              v-model="settings.startDate"
              type="month"
              placeholder="开始月份"
              format="YYYY-MM"
              value-format="YYYY-MM"
            />
            <span class="date-separator">至</span>
            <el-date-picker
              v-model="settings.endDate"
              type="month"
              placeholder="结束月份"
              format="YYYY-MM"
              value-format="YYYY-MM"
            />
          </div>
          <div class="form-tip">
            选择总结的时间范围，用于过滤 Git 提交记录
          </div>
        </el-form-item>

        <el-form-item label="我的角色">
          <div class="role-selector">
            <el-check-tag
              v-for="role in presetRoles"
              :key="role"
              :checked="settings.roles.includes(role)"
              @change="toggleRole(role)"
            >
              {{ role }}
            </el-check-tag>
            <el-check-tag
              v-for="role in customRoles"
              :key="role"
              :checked="true"
              @change="removeCustomRole(role)"
              class="custom-role-tag"
            >
              {{ role }} ×
            </el-check-tag>
            <el-popover
              :visible="addingCustomRole"
              placement="bottom"
              :width="200"
              trigger="click"
            >
              <template #reference>
                <el-check-tag
                  :checked="false"
                  class="add-role-tag"
                  @click="addingCustomRole = true"
                >
                  + 自定义
                </el-check-tag>
              </template>
              <div class="custom-role-input">
                <el-input
                  v-model="customRoleInput"
                  size="small"
                  placeholder="输入角色名称"
                  @keyup.enter="confirmCustomRole"
                  ref="customRoleInputRef"
                />
                <div class="custom-role-btns">
                  <el-button size="small" @click="addingCustomRole = false">取消</el-button>
                  <el-button size="small" type="primary" @click="confirmCustomRole" :disabled="!customRoleInput.trim()">确定</el-button>
                </div>
              </div>
            </el-popover>
          </div>
          <div class="form-tip">
            选择你的职业角色，帮助 AI 生成更贴合岗位特点的总结（可多选）
          </div>
        </el-form-item>

        <!-- AI 模型配置 -->
        <el-form-item label="AI 模型">
          <div class="model-config">
            <div class="model-provider-row">
              <el-select v-model="modelProvider" size="small" style="width:160px;" @change="onProviderChange">
                <el-option value="deepseek" label="DeepSeek（默认）" />
                <el-option value="openai" label="OpenAI" />
                <el-option value="custom" label="自定义（OpenAI 兼容）" />
                <el-option value="anthropic" label="Claude（Anthropic）" />
              </el-select>
              <el-select v-if="modelProvider !== 'custom'" v-model="modelId" size="small" style="width:200px;">
                <el-option v-for="m in modelPresets[modelProvider]" :key="m" :value="m" :label="m" />
              </el-select>
              <el-input v-else v-model="modelId" size="small" placeholder="模型 ID，如 gpt-4o" style="width:200px;" />
            </div>
            <el-input
              v-if="modelProvider === 'custom'"
              v-model="modelBaseURL"
              size="small"
              placeholder="Base URL，如 https://api.openai.com/v1"
              style="margin-top:6px;"
            />
            <el-input
              v-model="modelApiKey"
              size="small"
              type="password"
              show-password
              placeholder="API Key"
              style="margin-top:6px;"
            />
            <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
              <el-button size="small" :loading="modelTesting" @click="testModel">测试连接</el-button>
              <el-button size="small" type="primary" @click="saveModel">保存</el-button>
              <span v-if="modelTestResult" :style="{color: modelTestResult === 'ok' ? '#67c23a' : '#f56c6c',fontSize:'12px'}">
                {{ modelTestResult === 'ok' ? '✓ 连接正常' : '✗ ' + modelTestResult }}
              </span>
            </div>
          </div>
          <div class="form-tip">切换模型后点击"测试连接"确认可用，再"保存"生效</div>
        </el-form-item>

      </el-form>
    </el-card>

    <div class="action-bar">
      <el-button type="primary" size="large" @click="goNext" :disabled="!canProceed">
        下一步：扫描文件
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import api from '@/api/index'
import type { ApiResponse } from '@work-summary/shared'

const router = useRouter()
const settings = useSettingsStore()

const canProceed = computed(() => settings.gitAuthor.length > 0)

// ─── 模型配置 ─────────────────────────────────────────────────────────────────
const modelProvider = ref<'deepseek' | 'openai' | 'custom' | 'anthropic'>('deepseek')
const modelId = ref('deepseek-chat')
const modelBaseURL = ref('')
const modelApiKey = ref('')
const modelTesting = ref(false)
const modelTestResult = ref('')

const modelPresets: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
}

const providerBaseURLMap: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: '',
}

function onProviderChange(p: string) {
  if (modelPresets[p]?.length) modelId.value = modelPresets[p][0]
  if (p !== 'custom') modelBaseURL.value = ''
  modelTestResult.value = ''
}

async function testModel() {
  if (!modelApiKey.value) { ElMessage.warning('请先填写 API Key'); return }
  modelTesting.value = true
  modelTestResult.value = ''
  try {
    const provider = modelProvider.value === 'anthropic' ? 'anthropic' : 'openai-compatible'
    const baseURL = modelProvider.value === 'custom' ? modelBaseURL.value : providerBaseURLMap[modelProvider.value]
    const res = await api.post('/config/model', {
      provider, apiKey: modelApiKey.value, baseURL, model: modelId.value,
    }) as unknown as ApiResponse<{ valid: boolean }>
    modelTestResult.value = res.data?.valid ? 'ok' : '连接失败'
  } catch (e: any) {
    modelTestResult.value = e.message || '连接失败'
  } finally {
    modelTesting.value = false
  }
}

async function saveModel() {
  if (!modelApiKey.value) { ElMessage.warning('请先填写 API Key'); return }
  const provider = modelProvider.value === 'anthropic' ? 'anthropic' : 'openai-compatible'
  const baseURL = modelProvider.value === 'custom' ? modelBaseURL.value : providerBaseURLMap[modelProvider.value]
  try {
    await api.post('/config/model', { provider, apiKey: modelApiKey.value, baseURL, model: modelId.value })
    ElMessage.success('模型配置已保存')
    modelTestResult.value = 'ok'
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败')
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function goNext() {
  settings.save()
  router.push('/scan')
}

// 角色选择
const presetRoles = [
  '前端开发', '后端开发', '全栈开发', '移动端开发',
  '算法工程师', '数据工程师', '测试工程师', 'DevOps',
  '技术负责人', '项目经理', '产品经理', '架构师',
  '销售', '运营', '市场营销', 'UI/UX 设计',
  '人力资源', '财务', '客服', '行政',
]

const customRoles = computed(() =>
  settings.roles.filter(r => !presetRoles.includes(r))
)

function toggleRole(role: string) {
  const idx = settings.roles.indexOf(role)
  if (idx >= 0) {
    settings.roles.splice(idx, 1)
  } else {
    settings.roles.push(role)
  }
}

const addingCustomRole = ref(false)
const customRoleInput = ref('')
const customRoleInputRef = ref<any>(null)

function confirmCustomRole() {
  const name = customRoleInput.value.trim()
  if (!name || settings.roles.includes(name)) return
  settings.roles.push(name)
  customRoleInput.value = ''
  addingCustomRole.value = false
}

function removeCustomRole(role: string) {
  const idx = settings.roles.indexOf(role)
  if (idx >= 0) settings.roles.splice(idx, 1)
}
</script>

<style scoped>
.settings-view {
  max-width: 700px;
  margin: 0 auto;
}

.form-tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 4px;
}

.form-tip a {
  color: #409eff;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-separator {
  color: rgba(255, 255, 255, 0.55);
  flex-shrink: 0;
}

.role-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.role-selector .el-check-tag {
  cursor: pointer;
  border-radius: 16px;
  padding: 4px 14px;
  font-size: 13px;
}

.custom-role-tag {
  background: #ecf5ff !important;
  color: #409eff !important;
}

.add-role-tag {
  border: 1px dashed #dcdfe6 !important;
  color: #909399 !important;
  background: transparent !important;
}

.custom-role-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-role-btns {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.model-config {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.model-provider-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-bar {
  margin-top: 24px;
  text-align: right;
}
</style>
