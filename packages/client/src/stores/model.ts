import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api from '@/api/index'

export interface QuickModelOption {
  id: string
  ownedBy?: string
  /** env 预设 vs 用户手动添加；决定下拉展示名 */
  source?: 'env' | 'user'
}

type ApiType = 'chat' | 'responses'

interface CurrentModelState {
  provider: 'openai-compatible' | 'anthropic' | ''
  baseURL?: string
  model: string
  apiType?: ApiType
  configured: boolean
  quickSwitchReady: boolean
}

export const useModelStore = defineStore('model', () => {
  const availableModels = ref<QuickModelOption[]>([])
  const current = ref<CurrentModelState>({
    provider: '',
    baseURL: '',
    model: '',
    apiType: 'chat',
    configured: false,
    quickSwitchReady: false,
  })

  const initialized = ref(false)

  const hasQuickSwitch = computed(() => current.value.quickSwitchReady && availableModels.value.length > 0)
  const currentModel = computed(() => current.value.model)

  function mergeOptions(models: QuickModelOption[]) {
    const merged = new Map<string, QuickModelOption>()
    for (const item of models) {
      if (!item?.id) continue
      const prev = merged.get(item.id)
      merged.set(item.id, {
        id: item.id,
        ownedBy: item.ownedBy ?? prev?.ownedBy ?? '',
        source: prev?.source === 'env' ? 'env' : (item.source ?? prev?.source),
      })
    }
    return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  function ensureCurrentModelVisible() {
    const model = current.value.model
    if (!model) return
    if (!availableModels.value.some(item => item.id === model)) {
      availableModels.value = mergeOptions([
        ...availableModels.value,
        { id: model, ownedBy: current.value.provider || 'current' },
      ])
    }
  }

  function setAvailableModels(models: QuickModelOption[]) {
    availableModels.value = mergeOptions(models)
    ensureCurrentModelVisible()
  }

  function setCurrentFromServer(data: any) {
    current.value = {
      provider: data?.provider ?? '',
      baseURL: data?.baseURL ?? '',
      model: data?.model ?? '',
      apiType: data?.apiType ?? 'chat',
      configured: Boolean(data?.model && data?.apiKey === '***'),
      quickSwitchReady: Boolean(data?.quickSwitchReady),
    }

    if (Array.isArray(data?.availableModels)) {
      setAvailableModels(data.availableModels)
    } else {
      ensureCurrentModelVisible()
    }
  }

  async function refreshCurrentConfig() {
    const res = await api.get('/config/model') as any
    if (res?.success) {
      setCurrentFromServer(res.data)
    }
    initialized.value = true
  }

  return {
    availableModels,
    current,
    currentModel,
    hasQuickSwitch,
    initialized,
    setAvailableModels,
    refreshCurrentConfig,
    setCurrentFromServer,
  }
})
