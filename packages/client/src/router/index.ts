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
  ],
})

// 首次访问且未完成身份选择时，强制进入引导页
router.beforeEach((to) => {
  if (to.meta.skipModeGuard) return true
  const appStore = useAppStore()
  if (!appStore.onboarded) {
    return { name: 'onboarding' }
  }
  return true
})

export default router
