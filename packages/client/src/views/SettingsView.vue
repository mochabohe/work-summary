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
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()
const settings = useSettingsStore()

const canProceed = computed(() => {
  return settings.gitAuthor.length > 0
})

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
  '人力资源', '财务', '客户成功', '技术支持',
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
  color: #909399;
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
  color: #909399;
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

.action-bar {
  margin-top: 24px;
  text-align: right;
}
</style>
