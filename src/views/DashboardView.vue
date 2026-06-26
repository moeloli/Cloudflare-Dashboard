<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { Globe, Zap, Server, Activity, ArrowRight, Cloud } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { zonesApi } from '@/api'
import type { Zone } from '@/types/cloudflare'
import AnalyticsPanel from '@/components/dashboard/AnalyticsPanel.vue'

const auth = useAuthStore()
const zones = ref<Zone[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    zones.value = await zonesApi.list({ per_page: 50 })
  } catch (e) {
    toast.error('加载域名列表失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    loading.value = false
  }
})

const stats = [
  { label: '域名总数', value: () => zones.value.length, icon: Globe, to: '/zones' },
  { label: '一键加速', value: () => '→', icon: Zap, to: '/accelerate' },
  { label: 'Workers', value: () => '→', icon: Server, to: '/workers' },
  { label: '账号状态', value: () => '已连接', icon: Activity, to: '/settings' },
]
</script>

<template>
  <div class="space-y-6">
    <!-- 欢迎卡片 -->
    <div class="rounded-xl border bg-card p-6 shadow-sm">
      <div class="flex items-center gap-3">
        <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cloud class="size-5" />
        </div>
        <div>
          <h1 class="text-xl font-semibold tracking-tight">欢迎回来，{{ auth.currentAccount?.accountName ?? '笨蛋' }}</h1>
          <p class="text-sm text-muted-foreground">
            {{ auth.currentAccount?.authType === 'token' ? 'API Token 模式' : 'Global API Key 模式' }}
            · 账号 ID {{ auth.currentAccount?.accountId }}
          </p>
        </div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <RouterLink
        v-for="s in stats"
        :key="s.label"
        :to="s.to"
        class="group rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-md hover:border-primary/40"
      >
        <div class="flex items-center justify-between">
          <span class="text-sm text-muted-foreground">{{ s.label }}</span>
          <component :is="s.icon" class="size-4 text-muted-foreground group-hover:text-primary" />
        </div>
        <div class="mt-2 flex items-center gap-1 text-2xl font-semibold">
          {{ s.value() }}
          <ArrowRight class="size-4 opacity-0 transition group-hover:opacity-100" />
        </div>
      </RouterLink>
    </div>

    <!-- 域名列表 -->
    <div class="rounded-xl border bg-card shadow-sm">
      <div class="flex items-center justify-between border-b px-5 py-4">
        <h2 class="font-semibold">域名</h2>
        <RouterLink to="/zones" class="text-sm text-primary hover:underline">查看全部</RouterLink>
      </div>
      <div v-if="loading" class="px-5 py-10 text-center text-sm text-muted-foreground">加载中…</div>
      <div v-else-if="!zones.length" class="px-5 py-10 text-center text-sm text-muted-foreground">
        还没有域名，去 <RouterLink to="/zones" class="text-primary hover:underline">添加</RouterLink> 一个吧
      </div>
      <ul v-else class="divide-y">
        <li v-for="z in zones.slice(0, 8)" :key="z.id" class="flex items-center justify-between px-5 py-3">
          <div>
            <div class="font-medium">{{ z.name }}</div>
            <div class="text-xs text-muted-foreground">{{ z.status }}</div>
          </div>
          <span
            class="rounded-full px-2 py-0.5 text-xs"
            :class="z.status === 'active' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'"
          >{{ z.status }}</span>
        </li>
      </ul>
    </div>

    <!-- 分析统计（合并自原独立分析页，recharts 图表） -->
    <AnalyticsPanel />
  </div>
</template>
