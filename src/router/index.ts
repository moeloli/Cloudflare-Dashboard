import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import {
  LayoutDashboard,
  Globe,
  Zap,
  Server,
  Database,
  Boxes,
  HardDrive,
  Rocket,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Flame,
  BarChart3,
  Network,
  Wrench,
  Settings,
} from '@lucide/vue'
import type { Component } from 'vue'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: Component
    group?: string
    order?: number
    public?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/DashboardLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '概览', icon: LayoutDashboard, group: '概览', order: 1 } },
      { path: 'zones', name: 'zones', component: () => import('@/views/zones/ZonesView.vue'), meta: { title: '域名管理', icon: Globe, group: '域名与加速', order: 1 } },
      { path: 'zones/:zoneId', name: 'zone-detail', component: () => import('@/views/zones/ZoneDetailView.vue'), meta: { title: '域名详情', icon: Globe, group: '域名与加速', order: 2 } },
      { path: 'accelerate', name: 'accelerate', component: () => import('@/views/accelerate/AccelerateView.vue'), meta: { title: '一键加速', icon: Zap, group: '域名与加速', order: 3 } },
      { path: 'workers', name: 'workers', component: () => import('@/views/workers/WorkersView.vue'), meta: { title: 'Workers', icon: Server, group: 'Workers 与计算', order: 1 } },
      { path: 'kv', name: 'kv', component: () => import('@/views/kv/KvView.vue'), meta: { title: 'KV 存储', icon: Boxes, group: 'Workers 与计算', order: 2 } },
      { path: 'd1', name: 'd1', component: () => import('@/views/d1/D1View.vue'), meta: { title: 'D1 数据库', icon: Database, group: 'Workers 与计算', order: 3 } },
      { path: 'r2', name: 'r2', component: () => import('@/views/r2/R2View.vue'), meta: { title: 'R2 存储', icon: HardDrive, group: '存储', order: 1 } },
      { path: 'pages', name: 'pages', component: () => import('@/views/pages/PagesView.vue'), meta: { title: 'Pages', icon: Rocket, group: '部署', order: 1 } },
      { path: 'ai', name: 'ai', component: () => import('@/views/ai/AiView.vue'), meta: { title: 'AI Playground', icon: Sparkles, group: '部署', order: 2 } },
      { path: 'ssl', name: 'ssl', component: () => import('@/views/ssl/SslView.vue'), meta: { title: 'SSL/证书', icon: ShieldCheck, group: '安全', order: 1 } },
      { path: 'firewall', name: 'firewall', component: () => import('@/views/firewall/FirewallView.vue'), meta: { title: 'WAF/防火墙', icon: ShieldAlert, group: '安全', order: 2 } },
      { path: 'cache', name: 'cache', component: () => import('@/views/cache/CacheView.vue'), meta: { title: '缓存规则', icon: Flame, group: '安全', order: 3 } },
      { path: 'analytics', name: 'analytics', component: () => import('@/views/analytics/AnalyticsView.vue'), meta: { title: '分析统计', icon: BarChart3, group: '分析', order: 1 } },
      { path: 'tunnel', name: 'tunnel', component: () => import('@/views/tunnel/TunnelView.vue'), meta: { title: 'Tunnel', icon: Network, group: '分析', order: 2 } },
      { path: 'tools', name: 'tools', component: () => import('@/views/tools/ToolsView.vue'), meta: { title: '工具箱', icon: Wrench, group: '工具', order: 1 } },
      { path: 'settings', name: 'settings', component: () => import('@/views/settings/SettingsView.vue'), meta: { title: '设置', icon: Settings, group: '工具', order: 2 } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isAuthed) {
    return { name: 'login', query: { redirect: (to.fullPath === '/login' ? '/' : to.fullPath) } }
  }
  if (to.name === 'login' && auth.isAuthed) {
    return { name: 'dashboard' }
  }
})

export default router
