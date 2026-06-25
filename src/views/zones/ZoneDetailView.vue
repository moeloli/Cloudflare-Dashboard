<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import {
  ArrowLeft,
  RefreshCw,
  Copy,
  ExternalLink,
  Trash2,
  Loader2,
  Cloud,
  Globe,
  ShieldCheck,
  Zap,
  Rocket,
  CheckCircle2,
  XCircle,
  Circle,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { zonesApi, OPTIMIZATION_PRESETS, applyOptimizationPreset } from '@/api'
import type { OptimizationPreset, PresetItemResult } from '@/api'
import DNSRecordManager from '@/components/dns/DNSRecordManager.vue'
import type { Zone } from '@/types/cloudflare'

const route = useRoute()
const router = useRouter()
const zoneId = computed(() => String(route.params.zoneId))

const zone = ref<Zone | null>(null)
const loading = ref(true)
const activeTab = ref('dns')

async function load() {
  loading.value = true
  try {
    zone.value = await zonesApi.get(zoneId.value)
  } catch (e) {
    toast.error('加载域名信息失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    loading.value = false
  }
}

onMounted(load)

/* ---------------- 缓存管理 ---------------- */

const purging = ref(false)
const devModeLoading = ref(false)

async function purgeAll() {
  if (!confirm('确认清除该域名下的全部缓存？')) return
  purging.value = true
  try {
    await zonesApi.purgeCache(zoneId.value)
    toast.success('缓存已清除')
  } catch (e) {
    toast.error('清除缓存失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    purging.value = false
  }
}

async function toggleDevMode(on: boolean) {
  devModeLoading.value = true
  try {
    await zonesApi.setDevelopmentMode(zoneId.value, on)
    if (zone.value) zone.value.development_mode = on ? 1 : 0
    toast.success(on ? '开发模式已开启（跳过缓存）' : '开发模式已关闭')
  } catch (e) {
    toast.error('切换开发模式失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    devModeLoading.value = false
  }
}

/* ---------------- 配置预设 ---------------- */

const presetResults = ref<Record<string, PresetItemResult>>({})
const applyingPreset = ref<string | null>(null)

function itemStatus(id: string): PresetItemResult | undefined {
  return presetResults.value[id]
}

async function applyPreset(preset: OptimizationPreset) {
  if (
    !confirm(
      `确认应用「${preset.name}」方案？\n\n将批量覆盖该域名下 ${preset.settings.length} 项配置，此操作不可撤销。\n如源站不支持 HTTPS，请勿使用「速度优先」（其 SSL 为灵活模式，明文回源）。`,
    )
  )
    return
  applyingPreset.value = preset.key
  // 重置该项结果，避免上次结果残留
  const fresh: Record<string, PresetItemResult> = {}
  for (const s of preset.settings) fresh[s.id] = { id: s.id, label: s.label, ok: false }
  presetResults.value = fresh
  try {
    const results = await applyOptimizationPreset(zoneId.value, preset, (r) => {
      presetResults.value = { ...presetResults.value, [r.id]: r }
    })
    const okCount = results.filter((r) => r.ok).length
    const failCount = results.length - okCount
    if (failCount === 0) {
      toast.success(`「${preset.name}」已应用`, { description: `全部 ${okCount} 项配置成功` })
    } else {
      toast.warning(`「${preset.name}」部分应用`, {
        description: `成功 ${okCount} 项，失败 ${failCount} 项（失败项多为当前套餐不支持该功能）`,
      })
    }
  } catch (e) {
    toast.error('应用失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    applyingPreset.value = null
  }
}

/* ---------------- 复制 ---------------- */

async function copy(text: string, label = '内容') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label}已复制`)
  } catch {
    toast.error('复制失败')
  }
}

/* ---------------- 删除域名 ---------------- */

const deleteOpen = ref(false)
const deleting = ref(false)

async function confirmDelete() {
  deleting.value = true
  try {
    await zonesApi.delete(zoneId.value)
    toast.success('域名已删除')
    deleteOpen.value = false
    router.push('/zones')
  } catch (e) {
    toast.error('删除失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    deleting.value = false
  }
}

/* ---------------- 展示 ---------------- */

const statusText = computed(() => zone.value?.status ?? '')
const isActive = computed(() => zone.value?.status === 'active')
const devModeOn = computed(() => (zone.value?.development_mode ?? 0) > 0)

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return s
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 面包屑 + 返回 -->
    <div class="flex items-center justify-between gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink as-child>
              <RouterLink to="/zones">域名管理</RouterLink>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{{ zone?.name ?? zoneId }}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Button variant="ghost" size="sm" @click="router.push('/zones')">
        <ArrowLeft class="size-4" />
        返回列表
      </Button>
    </div>

    <!-- 域名信息卡片 -->
    <Card>
      <CardHeader>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe class="size-5" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <CardTitle class="text-lg">{{ zone?.name ?? '加载中…' }}</CardTitle>
                <Badge
                  v-if="zone"
                  :class="isActive ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'"
                  variant="secondary"
                >
                  {{ statusText }}
                </Badge>
              </div>
              <CardDescription>
                <template v-if="zone">{{ zone.plan?.name ?? '未知套餐' }} · {{ zone.account?.name ?? zone.account?.id }}</template>
                <template v-else>正在加载域名信息</template>
              </CardDescription>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" :disabled="loading" @click="load">
              <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
              刷新
            </Button>
            <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" @click="deleteOpen = true">
              <Trash2 class="size-4" />
              删除域名
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent v-if="loading && !zone">
        <div class="space-y-2">
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-3/4" />
        </div>
      </CardContent>
      <CardContent v-else-if="zone">
        <div class="grid gap-4 md:grid-cols-2">
          <!-- Cloudflare 名称服务器 -->
          <div class="space-y-2 rounded-lg border p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Cloud class="size-4 text-primary" />
              Cloudflare 名称服务器
            </div>
            <ul class="space-y-1.5">
              <li v-for="ns in zone.name_servers" :key="ns" class="flex items-center justify-between gap-2 text-sm">
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{{ ns }}</code>
                <Button variant="ghost" size="icon-sm" @click="copy(ns, 'NS')">
                  <Copy class="size-3" />
                </Button>
              </li>
            </ul>
            <p class="text-xs text-muted-foreground">
              请到域名注册商将 NS 改为上述名称服务器
            </p>
          </div>

          <!-- 原始名称服务器 -->
          <div class="space-y-2 rounded-lg border p-4">
            <div class="flex items-center gap-2 text-sm font-medium">
              <ExternalLink class="size-4 text-muted-foreground" />
              原始名称服务器
            </div>
            <ul v-if="zone.original_name_servers?.length" class="space-y-1.5">
              <li v-for="ns in zone.original_name_servers" :key="ns" class="text-sm">
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{{ ns }}</code>
              </li>
            </ul>
            <p v-else class="text-sm text-muted-foreground">无（可能已完全迁移）</p>
            <p v-if="zone.original_registrar" class="text-xs text-muted-foreground">
              原注册商：{{ zone.original_registrar }}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Tabs -->
    <Tabs v-model="activeTab" class="w-full">
      <TabsList>
        <TabsTrigger value="dns">DNS 记录</TabsTrigger>
        <TabsTrigger value="cache">缓存</TabsTrigger>
        <TabsTrigger value="preset">配置预设</TabsTrigger>
        <TabsTrigger value="overview">概览</TabsTrigger>
      </TabsList>

      <!-- DNS 记录 -->
      <TabsContent value="dns" class="mt-4">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <Cloud class="size-4 text-primary" />
              DNS 记录管理
            </CardTitle>
            <CardDescription>管理该域名的所有 DNS 记录</CardDescription>
          </CardHeader>
          <CardContent>
            <DNSRecordManager :zone-id="zoneId" :zone-name="zone?.name" />
          </CardContent>
        </Card>
      </TabsContent>

      <!-- 缓存 -->
      <TabsContent value="cache" class="mt-4">
        <div class="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle class="flex items-center gap-2 text-base">
                <Zap class="size-4 text-amber-500" />
                清除缓存
              </CardTitle>
              <CardDescription>一键清除该域名下的所有缓存资源</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" :disabled="purging" @click="purgeAll">
                <Loader2 v-if="purging" class="size-4 animate-spin" />
                清除全部缓存
              </Button>
              <p class="mt-2 text-xs text-muted-foreground">
                清除后访问者将回源重新拉取最新内容
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="flex items-center gap-2 text-base">
                <ShieldCheck class="size-4 text-primary" />
                开发模式
              </CardTitle>
              <CardDescription>开启后绕过缓存，直接回源（3 小时后自动关闭）</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div class="text-sm font-medium">
                    当前状态：
                    <span :class="devModeOn ? 'text-amber-600' : 'text-muted-foreground'">
                      {{ devModeOn ? '已开启' : '已关闭' }}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground">用于调试源站内容</p>
                </div>
                <Switch
                  :model-value="devModeOn"
                  :disabled="devModeLoading"
                  @update:model-value="(v: boolean) => toggleDevMode(v)"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <!-- 配置预设 -->
      <TabsContent value="preset" class="mt-4">
        <div class="space-y-3">
          <p class="text-sm text-muted-foreground">
            选择方向一键批量应用一组 zone 配置；单项失败（如套餐不支持该功能）不阻断其余项，结束后会汇总成功/失败数。
          </p>
          <div class="grid gap-4 md:grid-cols-2">
            <Card v-for="preset in OPTIMIZATION_PRESETS" :key="preset.key">
              <CardHeader>
                <CardTitle class="flex items-center gap-2 text-base">
                  <component
                    :is="preset.key === 'speed' ? Rocket : ShieldCheck"
                    class="size-4"
                    :class="preset.key === 'speed' ? 'text-amber-500' : 'text-primary'"
                  />
                  {{ preset.name }}
                </CardTitle>
                <CardDescription>{{ preset.description }}</CardDescription>
              </CardHeader>
              <CardContent class="space-y-3">
                <Alert v-if="preset.warning" variant="destructive" class="py-2">
                  <AlertDescription class="text-xs">{{ preset.warning }}</AlertDescription>
                </Alert>
                <ul class="space-y-1.5">
                  <li v-for="s in preset.settings" :key="s.id" class="flex items-start gap-2 text-xs">
                    <component
                      :is="itemStatus(s.id)?.ok ? CheckCircle2 : itemStatus(s.id) ? XCircle : Circle"
                      class="mt-0.5 size-3.5 shrink-0"
                      :class="itemStatus(s.id)?.ok ? 'text-emerald-500' : itemStatus(s.id) ? 'text-destructive' : 'text-muted-foreground'"
                    />
                    <span class="flex-1">
                      {{ s.label }}
                      <span
                        v-if="itemStatus(s.id)?.error"
                        :title="itemStatus(s.id)?.error"
                        class="ml-1 text-destructive/70"
                      >（失败）</span>
                    </span>
                  </li>
                </ul>
                <Button class="w-full" :disabled="!!applyingPreset" @click="applyPreset(preset)">
                  <Loader2 v-if="applyingPreset === preset.key" class="size-4 animate-spin" />
                  <component
                    :is="preset.key === 'speed' ? Rocket : ShieldCheck"
                    v-else
                    class="size-4"
                  />
                  应用此方案
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      <!-- 概览 -->
      <TabsContent value="overview" class="mt-4">
        <Card v-if="zone">
          <CardHeader>
            <CardTitle class="text-base">域名概览</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-lg border p-3">
                <div class="text-xs text-muted-foreground">域名 ID</div>
                <code class="text-xs">{{ zone.id }}</code>
              </div>
              <div class="rounded-lg border p-3">
                <div class="text-xs text-muted-foreground">状态</div>
                <div class="text-sm">{{ zone.status }}</div>
              </div>
              <div class="rounded-lg border p-3">
                <div class="text-xs text-muted-foreground">类型</div>
                <div class="text-sm">{{ zone.type }}</div>
              </div>
              <div class="rounded-lg border p-3">
                <div class="text-xs text-muted-foreground">套餐</div>
                <div class="text-sm">{{ zone.plan?.name ?? '—' }}</div>
              </div>
              <div class="rounded-lg border p-3">
                <div class="text-xs text-muted-foreground">激活时间</div>
                <div class="text-sm">{{ fmtDate(zone.activated_on) }}</div>
              </div>
              <div class="rounded-lg border p-3">
                <div class="text-xs text-muted-foreground">修改时间</div>
                <div class="text-sm">{{ fmtDate(zone.modified_on) }}</div>
              </div>
            </div>

            <Separator />

            <div>
              <div class="mb-2 text-sm font-medium">权限</div>
              <div class="flex flex-wrap gap-1.5">
                <Badge v-for="p in zone.permissions" :key="p" variant="outline" class="font-mono text-xs">
                  {{ p }}
                </Badge>
              </div>
            </div>

            <Separator />

            <div>
              <div class="mb-2 text-sm font-medium">Cloudflare 名称服务器</div>
              <div class="flex flex-wrap gap-1.5">
                <code v-for="ns in zone.name_servers" :key="ns" class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {{ ns }}
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
        <div v-else class="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          正在加载域名信息
        </div>
      </TabsContent>
    </Tabs>

    <!-- 删除域名确认 -->
    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除域名</DialogTitle>
          <DialogDescription>
            确认删除域名 <span class="font-medium text-foreground">{{ zone?.name }}</span>？
            删除后该域名将从 Cloudflare 移除，DNS 记录与相关配置将丢失，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteOpen = false">取消</Button>
          <Button variant="destructive" :disabled="deleting" @click="confirmDelete">
            <Loader2 v-if="deleting" class="size-4 animate-spin" />
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
