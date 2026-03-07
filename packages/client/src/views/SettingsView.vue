<template>
  <div class="settings-view">
    <el-card>
      <template #header>
        <span>基础配置</span>
      </template>

      <el-form label-width="140px" :model="settings">
        <el-form-item label="DeepSeek API Key">
          <el-input
            v-model="settings.apiKey"
            type="password"
            show-password
            placeholder="请输入 DeepSeek API Key"
          />
          <div class="form-tip">
            获取地址: <a href="https://platform.deepseek.com/" target="_blank">platform.deepseek.com</a>
          </div>
        </el-form-item>

        <el-divider />

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
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import api from '@/api/index'

const router = useRouter()
const settings = useSettingsStore()

const validating = ref(false)
const keyValid = ref<boolean | null>(null)

const canProceed = computed(() => {
  return settings.gitAuthor.length > 0
})

async function validateKey() {
  validating.value = true
  keyValid.value = null
  try {
    const res: any = await api.post('/config/validate-llm', { apiKey: settings.apiKey })
    keyValid.value = res.data?.valid ?? false
  } catch {
    keyValid.value = false
  } finally {
    validating.value = false
  }
}

function goNext() {
  settings.save()
  router.push('/scan')
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

.action-bar {
  margin-top: 24px;
  text-align: right;
}
</style>
