<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import {
  BarChart3,
  Globe,
  Eye,
  Users,
  ShieldAlert,
  Gauge,
  RefreshCw,
  Activity,
} from '@lucide/vue'
import { zonesApi, zoneTraffic, zoneTopCountries } from '@/api'
import type { Zone } from '@/types/cloudflare'
import type { CountryRow, TimePoint, ZoneSummary } from '@/api/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/* ---------- 控件状态 ---------- */

type RangeKey = '24h' | '7d' | '30d'

const ranges: { key: RangeKey; label: string }[] = [
  { key: '24h', label: '最近 24 小时' },
  { key: '7d', label: '最近 7 天' },
  { key: '30d', label: '最近 30 天' },
]

const zones = ref<Zone[]>([])
const zonesLoading = ref(true)
const selectedZoneId = ref<string>('')
const range = ref<RangeKey>('7d')

function computeRange(key: RangeKey): { since: string; until: string } {
  const until = new Date()
  const since = new Date()
  if (key === '24h') since.setHours(since.getHours() - 24)
  else if (key === '7d') since.setDate(since.getDate() - 7)
  else since.setDate(since.getDate() - 30)
  return { since: since.toISOString(), until: until.toISOString() }
}

/* ---------- 数据状态 ---------- */

const points = ref<TimePoint[]>([])
const summary = ref<ZoneSummary | null>(null)
const countries = ref<CountryRow[]>([])
const loading = ref(false)
const errorMsg = ref('')

const hasData = computed(() => points.value.length > 0)

const maxRequest = computed(() =>
  points.value.reduce((m, p) => Math.max(m, p.requests), 0),
)

const totalRequestsTrend = computed(() =>
  points.value.reduce((s, p) => s + p.requests, 0),
)

/* ---------- 加载 ---------- */

async function loadZones() {
  zonesLoading.value = true
  try {
    const list = await zonesApi.list({ per_page: 50 })
    zones.value = list
    if (!selectedZoneId.value && list.length) selectedZoneId.value = list[0].id
  } catch (e) {
    toast.error('加载域名列表失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    zonesLoading.value = false
  }
}

async function loadAnalytics() {
  if (!selectedZoneId.value) return
  loading.value = true
  errorMsg.value = ''
  points.value = []
  summary.value = null
  countries.value = []
  const { since, until } = computeRange(range.value)
  try {
    const [traffic, topCountries] = await Promise.all([
      zoneTraffic(selectedZoneId.value, since, until),
      zoneTopCountries(selectedZoneId.value, since, until, 8).catch(() => null),
    ])
    points.value = traffic.points
    summary.value = traffic.summary
    if (topCountries) countries.value = topCountries.rows
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
    toast.error('加载分析数据失败', { description: errorMsg.value })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadZones()
  if (selectedZoneId.value) await loadAnalytics()
})

watch([selectedZoneId, range], () => {
  if (selectedZoneId.value) loadAnalytics()
})

/* ---------- 渲染辅助 ---------- */

const nf = new Intl.NumberFormat('en-US')
function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '0'
  return nf.format(n)
}

function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function barHeight(p: TimePoint): string {
  if (maxRequest.value <= 0) return '0%'
  return `${Math.max(2, (p.requests / maxRequest.value) * 100)}%`
}

const summaryCards = computed(() => {
  const s = summary.value
  return [
    { label: '总请求数', value: s ? fmtNum(s.requests) : '0', icon: Activity, hint: '区间累计' },
    { label: '页面浏览', value: s ? fmtNum(s.pageViews) : '0', icon: Eye, hint: 'PageViews' },
    { label: '唯一访客', value: s ? fmtNum(s.uniqueVisitors) : '0', icon: Users, hint: 'Uniques' },
    { label: '威胁拦截', value: s ? fmtNum(s.threats) : '0', icon: ShieldAlert, hint: 'Threats' },
    { label: '缓存命中率', value: s ? pct(s.cacheHitRate) : '0%', icon: Gauge, hint: fmtBytes(s?.cachedBytes ?? 0) },
  ]
})

const countryTotal = computed(() =>
  countries.value.reduce((m, c) => m + c.requests, 0),
)
function countryPct(c: CountryRow): number {
  if (countryTotal.value <= 0) return 0
  return (c.requests / countryTotal.value) * 100
}
</script>

<template>
  <div class="space-y-6">
    <!-- 标题 + 控件 -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 class="size-5" />
        </div>
        <div>
          <h1 class="text-xl font-semibold tracking-tight">分析统计</h1>
          <p class="text-sm text-muted-foreground">
            Cloudflare GraphQL Analytics · 基于 zone 维度的 HTTP 请求分析
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="selectedZoneId">
          <SelectTrigger class="w-[220px]">
            <SelectValue placeholder="选择域名" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="z in zones" :key="z.id" :value="z.id">
              {{ z.name }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="range">
          <SelectTrigger class="w-[160px]">
            <SelectValue placeholder="时间范围" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="r in ranges" :key="r.key" :value="r.key">
              {{ r.label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <button
          class="inline-flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground transition hover:bg-muted disabled:opacity-50"
          :disabled="loading || !selectedZoneId"
          title="刷新"
          @click="loadAnalytics"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
        </button>
      </div>
    </div>

    <!-- 域名加载 -->
    <div v-if="zonesLoading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Skeleton v-for="i in 5" :key="i" class="h-24 rounded-xl" />
    </div>

    <!-- 无域名 -->
    <Card v-else-if="!zones.length">
      <CardContent class="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Globe class="size-8 text-muted-foreground" />
        <p class="text-sm text-muted-foreground">
          还没有域名，无法查看分析数据。请先到
          <RouterLink to="/zones" class="text-primary hover:underline">域名管理</RouterLink>
          添加。
        </p>
      </CardContent>
    </Card>

    <template v-else-if="selectedZoneId">
      <!-- 汇总卡片 -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <template v-if="loading && !summary">
          <Skeleton v-for="i in 5" :key="i" class="h-24 rounded-xl" />
        </template>
        <template v-else>
          <div
            v-for="card in summaryCards"
            :key="card.label"
            class="rounded-xl border bg-card p-5 shadow-sm transition hover:border-primary/40"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">{{ card.label }}</span>
              <component :is="card.icon" class="size-4 text-muted-foreground" />
            </div>
            <div class="mt-2 text-2xl font-semibold">{{ card.value }}</div>
            <div class="mt-1 text-xs text-muted-foreground">{{ card.hint }}</div>
          </div>
        </template>
      </div>

      <!-- 错误 -->
      <Card v-if="errorMsg">
        <CardContent class="flex items-start gap-3 py-4 text-sm text-destructive">
          <ShieldAlert class="size-4 mt-0.5 shrink-0" />
          <div>
            <p class="font-medium">GraphQL 查询失败</p>
            <p class="mt-1 text-muted-foreground">{{ errorMsg }}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              提示：API Token 需包含 <code class="rounded bg-muted px-1">Zone.Analytics</code> 读权限。
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- 请求趋势柱状图 -->
      <Card>
        <CardHeader class="pb-2">
          <div class="flex items-center justify-between">
            <CardTitle class="text-base">请求趋势</CardTitle>
            <Badge variant="secondary">
              {{ points.length }} 个数据点 · 共 {{ fmtNum(totalRequestsTrend) }} 请求
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <!-- 加载骨架 -->
          <div v-if="loading" class="flex h-48 items-end gap-1">
            <Skeleton
              v-for="i in 20"
              :key="i"
              class="flex-1"
              :style="{ height: `${20 + Math.random() * 60}%` }"
            />
          </div>

          <!-- 空状态 -->
          <div
            v-else-if="!hasData"
            class="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <BarChart3 class="size-8 opacity-40" />
            <p>该时间范围内没有请求数据</p>
            <p class="text-xs">尝试切换其他域名或扩大时间范围</p>
          </div>

          <!-- 柱状图 -->
          <ScrollArea v-else class="w-full">
            <div class="flex h-48 min-w-full items-end gap-px pb-2">
              <div
                v-for="p in points"
                :key="p.ts"
                class="group relative flex-1"
                style="min-width: 3px"
              >
                <div
                  class="w-full rounded-t-sm bg-primary/70 transition group-hover:bg-primary"
                  :style="{ height: barHeight(p) }"
                />
                <!-- tooltip -->
                <div
                  class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-md group-hover:block"
                >
                  <div class="font-medium">{{ p.label }}</div>
                  <div class="text-muted-foreground">请求 {{ fmtNum(p.requests) }}</div>
                  <div class="text-muted-foreground">流量 {{ fmtBytes(p.bytes) }}</div>
                  <div class="text-muted-foreground">威胁 {{ fmtNum(p.threats) }}</div>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>{{ points[0]?.label }}</span>
              <span>{{ points[points.length - 1]?.label }}</span>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <!-- 流量来源 / 国家 -->
      <Card>
        <CardHeader class="pb-2">
          <div class="flex items-center justify-between">
            <CardTitle class="text-base">流量来源 · Top 国家</CardTitle>
            <Badge v-if="countries.length" variant="secondary">
              {{ countries.length }} 个国家
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div v-if="loading" class="space-y-3">
            <Skeleton v-for="i in 5" :key="i" class="h-8 rounded" />
          </div>
          <div
            v-else-if="!countries.length"
            class="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Globe class="size-8 opacity-40" />
            <p>暂无国家分布数据</p>
          </div>
          <ul v-else class="space-y-2">
            <li
              v-for="c in countries"
              :key="c.country"
              class="flex items-center gap-3"
            >
              <span class="w-28 shrink-0 truncate text-sm" :title="c.country">
                {{ c.country || 'Unknown' }}
              </span>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary/70"
                  :style="{ width: `${Math.max(2, countryPct(c))}%` }"
                />
              </div>
              <span class="w-20 shrink-0 text-right text-xs text-muted-foreground">
                {{ fmtNum(c.requests) }}
              </span>
              <span class="w-12 shrink-0 text-right text-xs text-muted-foreground">
                {{ countryPct(c).toFixed(1) }}%
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
