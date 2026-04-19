import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/OnboardingView.vue'),
      meta: { skipModeGuard: true, fullscreen: true },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/scan',
      name: 'scan',
      component: () => import('@/views/ScanView.vue'),
    },
    {
      path: '/analysis',
      name: 'analysis',
      component: () => import('@/views/AnalysisView.vue'),
    },
    {
      path: '/feishu',
      name: 'feishu',
      component: () => import('@/views/FeishuView.vue'),
    },
    {
      path: '/generate',
      name: 'generate',
      component: () => import('@/views/GenerateView.vue'),
    },
    {
      path: '/preview',
      name: 'preview',
      component: () => import('@/views/PreviewView.vue'),
    },
    {
      path: '/workspace',
      name: 'workspace',
      component: () => import('@/views/WorkspaceView.vue'),
    },
    {
      path: '/workspace/import',
      name: 'workspace-import',
      component: () => import('@/views/WorkspaceImportView.vue'),
    },
    {
      path: '/workspace/manual',
      name: 'workspace-manual',
      component: () => import('@/views/WorkspaceManualView.vue'),
    },
    {
      path: '/workspace/generate',
      name: 'workspace-generate',
      component: () => import('@/views/WorkspaceGenerateView.vue'),
    },
  ],
})

// 路由守卫：首次引导 + 模式专属页面防呆
router.beforeEach((to) => {
  if (to.meta.skipModeGuard) return true
  const appStore = useAppStore()
  if (!appStore.onboarded) {
    return { name: 'onboarding' }
  }
  // 通用模式禁止访问研发专属页
  if (appStore.isGeneral && ['/scan', '/analysis'].includes(to.path)) {
    return '/workspace'
  }
  // 研发模式禁止访问通用专属页
  if (!appStore.isGeneral && to.path.startsWith('/workspace')) {
    return '/'
  }
  return true
})

export default router
