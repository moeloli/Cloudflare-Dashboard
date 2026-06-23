<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { RefreshCw, Loader2, ShieldCheck, Globe, Lock, KeyRound } from '@lucide/vue'
import { zonesApi, securityApi, type SslMode, type CertificatePack, type CertificatePackCert } from '@/api'
import type { Zone } from '@/types/cloudflare'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/* ----------------------------- zone 选择 ----------------------------- */

const zones = ref<Zone[]>([])
const zonesLoading = ref(false)
const zoneId = ref<string>('')

async function loadZones() {
  zonesLoading.value = true
  try {
    zones.value = await zonesApi.list({ per_page: 50 })
    if (!zoneId.value && zones.value.length) zoneId.value = zones.value[0].id
  } catch (e) {
    toast.error('加载域名列表失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    zonesLoading.value = false
  }
}

/* ----------------------------- SSL 设置 ----------------------------- */

const SSL_MODES: { value: SslMode; label: string; desc: string }[] = [
  { value: 'off', label: '关闭', desc: '不加密，所有流量走 HTTP' },
  { value: 'flexible', label: 'Flexible', desc: '浏览器→CF 加密，CF→源站不加密' },
  { value: 'full', label: 'Full', desc: '端到端加密，源站证书可不受信' },
  { value: 'strict', label: 'Full (Strict)', desc: '端到端加密且校验源站证书' },
]

const sslMode = ref<SslMode>('off')
const alwaysHttps = ref(false)
const tls13 = ref(false)
const settingLoading = ref(false)

async function loadSettings() {
  if (!zoneId.value) return
  settingLoading.value = true
  try {
    const [ssl, auh, tls] = await Promise.all([
      securityApi.getSslSetting(zoneId.value),
      securityApi.getAlwaysUseHttps(zoneId.value),
      securityApi.getTls13(zoneId.value),
    ])
    sslMode.value = ssl.value
    alwaysHttps.value = auh.value === 'on'
    tls13.value = tls.value === 'on'
  } catch (e) {
    toast.error('加载 SSL 设置失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    settingLoading.value = false
  }
}

async function setSslMode(mode: SslMode) {
  if (!zoneId.value || mode === sslMode.value) return
  settingLoading.value = true
  try {
    const r = await securityApi.setSslSetting(zoneId.value, mode)
    sslMode.value = r.value
    toast.success(`SSL 模式已切换为 ${mode}`)
  } catch (e) {
    toast.error('切换 SSL 模式失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    settingLoading.value = false
  }
}

async function toggleAlwaysHttps(v: boolean) {
  if (!zoneId.value) return
  try {
    const r = await securityApi.setAlwaysUseHttps(zoneId.value, v)
    alwaysHttps.value = r.value === 'on'
    toast.success(v ? '已开启 Always Use HTTPS' : '已关闭 Always Use HTTPS')
  } catch (e) {
    alwaysHttps.value = !v
    toast.error('切换失败', { description: e instanceof Error ? e.message : String(e) })
  }
}

async function toggleTls13(v: boolean) {
  if (!zoneId.value) return
  try {
    const r = await securityApi.setTls13(zoneId.value, v)
    tls13.value = r.value === 'on'
    toast.success(v ? '已开启 TLS 1.3' : '已关闭 TLS 1.3')
  } catch (e) {
    tls13.value = !v
    toast.error('切换失败', { description: e instanceof Error ? e.message : String(e) })
  }
}

/* ----------------------------- 边缘证书 ----------------------------- */

const packs = ref<CertificatePack[]>([])
const certsLoading = ref(false)

/** 扁平化证书行：pack + pack 内每个 cert */
interface CertRow {
  packId: string
  packType: string
  packStatus: string
  cert: CertificatePackCert
}
const certRows = computed<CertRow[]>(() =>
  packs.value.flatMap((p) =>
    (p.certificates ?? []).map((cert) => ({
      packId: p.id,
      packType: p.type,
      packStatus: p.status,
      cert,
    })),
  ),
)

async function loadCerts() {
  if (!zoneId.value) return
  certsLoading.value = true
  try {
    packs.value = await securityApi.listCerts(zoneId.value)
  } catch (e) {
    toast.error('加载证书列表失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    certsLoading.value = false
  }
}

async function reloadAll() {
  await Promise.all([loadSettings(), loadCerts()])
}

watch(zoneId, () => { reloadAll() })
onMounted(async () => {
  await loadZones()
  await reloadAll()
})

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return s
  }
}

function certStatusClass(s: string): string {
  if (s === 'active' || s === 'ready') return 'bg-emerald-500/15 text-emerald-600'
  if (s === 'pending') return 'bg-amber-500/15 text-amber-600'
  return 'bg-muted text-muted-foreground'
}
</script>

<template>
  <div class="space-y-6">
    <!-- 标题 -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">SSL / 证书</h1>
        <p class="text-sm text-muted-foreground">管理域名加密模式与边缘证书</p>
      </div>
      <div class="flex items-center gap-2">
        <Select v-model="zoneId">
          <SelectTrigger class="w-56">
            <SelectValue placeholder="选择域名" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="z in zones" :key="z.id" :value="z.id">
              {{ z.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" :disabled="settingLoading || certsLoading" @click="reloadAll">
          <RefreshCw class="size-4" :class="{ 'animate-spin': settingLoading || certsLoading }" />
          刷新
        </Button>
      </div>
    </div>

    <div v-if="zonesLoading" class="grid gap-4 md:grid-cols-2">
      <Skeleton class="h-40" />
      <Skeleton class="h-40" />
    </div>

    <template v-else-if="zoneId">
      <!-- SSL 模式 -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <ShieldCheck class="size-4 text-primary" />
            SSL 加密模式
          </CardTitle>
          <CardDescription>选择浏览器到 Cloudflare、Cloudflare 到源站的加密策略</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              v-for="m in SSL_MODES"
              :key="m.value"
              type="button"
              :disabled="settingLoading"
              class="rounded-lg border p-4 text-left transition hover:border-primary/60 hover:bg-accent/40"
              :class="sslMode === m.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''"
              @click="setSslMode(m.value)"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium">{{ m.label }}</span>
                <Badge v-if="sslMode === m.value" variant="secondary" class="bg-primary/15 text-primary">当前</Badge>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">{{ m.desc }}</p>
            </button>
          </div>
        </CardContent>
      </Card>

      <!-- 开关设置 -->
      <div class="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <Lock class="size-4 text-primary" />
              Always Use HTTPS
            </CardTitle>
            <CardDescription>将所有 HTTP 请求 301 重定向到 HTTPS</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center justify-between">
              <span class="text-sm">{{ alwaysHttps ? '已开启' : '已关闭' }}</span>
              <Switch
                :model-value="alwaysHttps"
                :disabled="settingLoading"
                @update:model-value="(v: boolean) => toggleAlwaysHttps(v)"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <KeyRound class="size-4 text-primary" />
              TLS 1.3
            </CardTitle>
            <CardDescription>启用最新 TLS 版本以提升安全与性能</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center justify-between">
              <span class="text-sm">{{ tls13 ? '已开启' : '已关闭' }}</span>
              <Switch
                :model-value="tls13"
                :disabled="settingLoading"
                @update:model-value="(v: boolean) => toggleTls13(v)"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- 边缘证书 -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <Globe class="size-4 text-primary" />
            边缘证书
          </CardTitle>
          <CardDescription>Cloudflare 为该域名签发的通用 SSL 证书</CardDescription>
        </CardHeader>
        <CardContent class="p-0">
          <!-- loading -->
          <div v-if="certsLoading" class="divide-y">
            <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-4 py-3">
              <Skeleton class="h-5 flex-1" />
              <Skeleton class="h-5 w-24" />
              <Skeleton class="h-5 w-20" />
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else-if="!certRows.length" class="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <div class="flex size-12 items-center justify-center rounded-full bg-muted">
              <Globe class="size-6 text-muted-foreground" />
            </div>
            <div class="text-sm text-muted-foreground">暂无边缘证书</div>
          </div>

          <!-- 列表 -->
          <template v-else>
            <div class="grid grid-cols-[minmax(180px,2fr)_140px_180px_120px_90px] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>主机</span>
              <span>签发者</span>
              <span>过期时间</span>
              <span>类型</span>
              <span>状态</span>
            </div>
            <div class="divide-y">
              <div
                v-for="row in certRows"
                :key="row.cert.id"
                class="grid grid-cols-[minmax(180px,2fr)_140px_180px_120px_90px] items-center gap-2 px-4 py-3 text-sm hover:bg-accent/40"
              >
                <span class="truncate font-medium" :title="row.cert.hosts?.join(', ')">{{ row.cert.hosts?.join(', ') || '—' }}</span>
                <span class="truncate text-muted-foreground" :title="row.cert.issuer">{{ row.cert.issuer || '—' }}</span>
                <span class="truncate text-xs text-muted-foreground" :title="fmtDate(row.cert.expires_on)">{{ fmtDate(row.cert.expires_on) }}</span>
                <span class="truncate text-xs text-muted-foreground">{{ row.packType || '—' }}</span>
                <Badge variant="secondary" :class="certStatusClass(row.cert.status)">{{ row.cert.status }}</Badge>
              </div>
            </div>
          </template>
        </CardContent>
      </Card>
    </template>

    <!-- 未选 zone -->
    <Card v-else>
      <CardContent class="flex flex-col items-center gap-3 py-16 text-center">
        <Loader2 v-if="zonesLoading" class="size-6 animate-spin text-muted-foreground" />
        <template v-else>
          <div class="flex size-12 items-center justify-center rounded-full bg-muted">
            <Globe class="size-6 text-muted-foreground" />
          </div>
          <div class="text-sm text-muted-foreground">请先选择一个域名</div>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
