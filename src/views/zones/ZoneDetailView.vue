<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
  Plus,
  Pencil,
  SlidersHorizontal,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  zonesApi,
  applyOptimizationPreset,
  applySingleSetting,
  listZoneSettings,
  SETTING_DEFS,
  getSettingDef,
  optionLabel,
  onoffLabel,
  type OptimizationPreset,
  type ZoneSettingItem,
  type SettingDef,
  type SettingValue,
  type MinifyValue,
} from '@/api'
import { usePresetsStore } from '@/stores/presets'
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

// 切到「配置预设」tab 时懒加载当前 zone settings（单项调节读当前值用）
watch(activeTab, (t) => {
  if (t === 'preset' && Object.keys(zoneSettings.value).length === 0) loadZoneSettings()
})

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

const presetsStore = usePresetsStore()
const allPresets = computed(() => presetsStore.allPresets)
const selectedPresetId = ref<string>(allPresets.value[0]?.id ?? '')
const selectedPreset = computed(() => allPresets.value.find((p) => p.id === selectedPresetId.value))

const applyingPresetId = ref<string | null>(null)

/** 单项调节：当前 zone 各 setting 实际值 */
const zoneSettings = ref<Record<string, ZoneSettingItem>>({})
const settingsLoading = ref(false)
const singleApplying = ref<string | null>(null)

async function loadZoneSettings() {
  if (!zoneId.value) return
  settingsLoading.value = true
  try {
    const list = await listZoneSettings(zoneId.value)
    const map: Record<string, ZoneSettingItem> = {}
    for (const s of list) map[s.id] = s
    zoneSettings.value = map
  } catch {
    // 旧套餐可能不支持该列表端点，降级为空（单项调节仍可写，但读不到当前值）
    zoneSettings.value = {}
  } finally {
    settingsLoading.value = false
  }
}

/** 取某 setting 当前值 */
function currentValue(id: string): SettingValue | undefined {
  return zoneSettings.value[id]?.value
}

async function applyPreset(preset: OptimizationPreset) {
  const count = Object.keys(preset.settings).length
  if (!confirm(`确认应用「${preset.name}」？\n\n将批量覆盖该域名 ${count} 项配置，此操作不可撤销。`))
    return
  applyingPresetId.value = preset.id
  try {
    const results = await applyOptimizationPreset(zoneId.value, preset)
    const okCount = results.filter((r) => r.ok).length
    const failCount = results.length - okCount
    if (failCount === 0) {
      toast.success(`「${preset.name}」已应用`, { description: `全部 ${okCount} 项配置成功` })
    } else {
      toast.warning(`「${preset.name}」部分应用`, {
        description: `成功 ${okCount} 项，失败 ${failCount} 项（失败项多为当前套餐不支持该功能）`,
      })
    }
    // 应用后刷新当前值
    await loadZoneSettings()
  } catch (e) {
    toast.error('应用失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    applyingPresetId.value = null
  }
}

/** 单项调节：实时写一项 */
async function applySingle(defId: string, value: SettingValue) {
  singleApplying.value = defId
  try {
    await applySingleSetting(zoneId.value, defId, value)
    // 本地乐观更新
    zoneSettings.value = {
      ...zoneSettings.value,
      [defId]: { ...(zoneSettings.value[defId] ?? { id: defId, editable: true, modified_on: null }), value },
    }
    toast.success(`${getSettingDef(defId)?.label ?? defId} 已更新`)
  } catch (e) {
    toast.error('更新失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    singleApplying.value = null
  }
}

/* ---------------- 预设编辑器 ---------------- */

const editorOpen = ref(false)
const editingPreset = ref<OptimizationPreset | null>(null)
/** 编辑中的工作副本（深拷贝，取消不影响原预设） */
const editorDraft = ref<OptimizationPreset | null>(null)

function openEditor(preset: OptimizationPreset) {
  editingPreset.value = preset
  editorDraft.value = structuredClone(preset)
  editorOpen.value = true
}

function openNewPreset() {
  const draft: OptimizationPreset = {
    id: '', // 创建时由 store 生成
    name: '我的预设',
    builtin: false,
    description: '',
    settings: {},
  }
  editingPreset.value = null
  editorDraft.value = draft
  editorOpen.value = true
}

/** 切换某项是否纳入预设（勾选 = 纳入，并初始化为当前 zone 值或默认） */
function toggleDraftSetting(defId: string, on: boolean) {
  if (!editorDraft.value) return
  const next = { ...editorDraft.value.settings }
  if (on) {
    if (!(defId in next)) {
      const cur = currentValue(defId)
      next[defId] = cur ?? defaultForSetting(defId)
    }
  } else {
    delete next[defId]
  }
  editorDraft.value = { ...editorDraft.value, settings: next }
}

function setDraftValue(defId: string, value: SettingValue) {
  if (!editorDraft.value) return
  editorDraft.value = { ...editorDraft.value, settings: { ...editorDraft.value.settings, [defId]: value } }
}

function saveDraft() {
  if (!editorDraft.value) return
  const name = editorDraft.value.name.trim()
  if (!name) {
    toast.error('请填写预设名称')
    return
  }
  if (editingPreset.value) {
    // 编辑已有用户预设
    presetsStore.updatePreset(editingPreset.value.id, {
      name,
      description: editorDraft.value.description,
      settings: editorDraft.value.settings,
    })
    toast.success('预设已更新')
  } else {
    // 新建
    presetsStore.createPreset(name, editorDraft.value.settings, editorDraft.value.description)
    toast.success('预设已创建')
  }
  editorOpen.value = false
  editorDraft.value = null
  editingPreset.value = null
}

function duplicatePreset(src: OptimizationPreset) {
  presetsStore.duplicatePreset(src)
  toast.success(`已复制「${src.name}」为新预设`)
}

function deletePreset(preset: OptimizationPreset) {
  if (!confirm(`确认删除自定义预设「${preset.name}」？此操作不可撤销。`)) return
  presetsStore.deletePreset(preset.id)
  toast.success('预设已删除')
}

/* ---------------- 展示辅助 ---------------- */

/** 设置项的展示值（中文文案，对齐 CF 仪表板） */
function displayValue(def: SettingDef, value: SettingValue | undefined): string {
  if (value === undefined) return '—'
  if (def.type === 'onoff') return onoffLabel(value)
  if (def.type === 'minify' && typeof value === 'object' && value) {
    const m = value as MinifyValue
    const on: string[] = []
    if (m.html === 'on') on.push('HTML')
    if (m.css === 'on') on.push('CSS')
    if (m.js === 'on') on.push('JS')
    return on.length ? on.join('+') : '关闭'
  }
  if (def.type === 'number') return fmtSeconds(Number(value))
  if (def.type === 'select' || def.type === 'security_level') {
    return optionLabel(def.id, String(value))
  }
  return String(value)
}

function defaultForSetting(defId: string): SettingValue {
  const def = getSettingDef(defId)
  if (!def) return 'off'
  if (def.type === 'onoff') return 'off'
  if (def.type === 'minify') return { html: 'off', css: 'off', js: 'off' } as MinifyValue
  if (def.type === 'number') return def.numberOptions?.[0] ?? 0
  return def.options?.[0] ?? ''
}

function fmtSeconds(sec: number): string {
  if (sec <= 0) return '不缓存'
  if (sec < 60) return `${sec} 秒`
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟`
  if (sec < 86400) return `${Math.round(sec / 3600)} 小时`
  if (sec < 2592000) return `${Math.round(sec / 86400)} 天`
  if (sec < 31536000) return `${Math.round(sec / 2592000)} 个月`
  return `${Math.round(sec / 31536000)} 年`
}

const SETTING_GROUPS: { key: SettingDef['group']; label: string }[] = [
  { key: 'ssl', label: 'SSL / HTTPS' },
  { key: 'security', label: '安全防护' },
  { key: 'cache', label: '缓存' },
  { key: 'speed', label: '速度优化' },
]

/** 单项调节：minify 子项切换（html/css/js 各自 on/off） */
function toggleMinify(defId: string, key: 'html' | 'css' | 'js') {
  const cur = currentValue(defId) as MinifyValue | undefined
  const next: MinifyValue = {
    html: cur?.html ?? 'off',
    css: cur?.css ?? 'off',
    js: cur?.js ?? 'off',
  }
  next[key] = next[key] === 'on' ? 'off' : 'on'
  applySingle(defId, next)
}

/** 编辑器草稿：minify 子项切换 */
function toggleDraftMinify(defId: string, key: 'html' | 'css' | 'js') {
  if (!editorDraft.value) return
  const cur = editorDraft.value.settings[defId] as MinifyValue | undefined
  const next: MinifyValue = {
    html: cur?.html ?? 'off',
    css: cur?.css ?? 'off',
    js: cur?.js ?? 'off',
  }
  next[key] = next[key] === 'on' ? 'off' : 'on'
  setDraftValue(defId, next)
}



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
        <div class="space-y-6">
          <!-- 单项调节（含预设快速应用） -->
          <Card>
            <CardHeader class="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle class="flex items-center gap-2 text-base">
                  <SlidersHorizontal class="size-4 text-primary" />
                  配置预设与单项调节
                </CardTitle>
                <CardDescription>选择预设一键批量应用，或在下方逐项实时调节；自定义预设可改名、增删、全局保存</CardDescription>
              </div>
              <Button variant="outline" size="sm" :disabled="settingsLoading" @click="loadZoneSettings">
                <RefreshCw class="size-4" :class="{ 'animate-spin': settingsLoading }" />
                刷新当前值
              </Button>
            </CardHeader>
            <CardContent class="space-y-5">
              <!-- 快速应用预设 -->
              <div class="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
                <div class="flex items-center gap-1.5 text-sm font-medium">
                  <component :is="Rocket" class="size-4 text-amber-500" />
                  应用预设
                </div>
                <Select v-model="selectedPresetId">
                  <SelectTrigger class="h-9 w-56">
                    <SelectValue placeholder="选择预设方案" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="p in allPresets" :key="p.id" :value="p.id">
                      {{ p.name }}{{ p.builtin ? '（内置）' : '' }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button :disabled="!selectedPreset || !!applyingPresetId" @click="selectedPreset && applyPreset(selectedPreset)">
                  <Loader2 v-if="applyingPresetId === selectedPresetId" class="size-4 animate-spin" />
                  <component :is="ShieldCheck" v-else class="size-4" />
                  应用
                </Button>
                <Button variant="outline" size="sm" :disabled="!selectedPreset" title="另存为新预设" @click="selectedPreset && duplicatePreset(selectedPreset)">
                  <Copy class="size-3.5" />
                  另存为
                </Button>
                <Button v-if="selectedPreset && !selectedPreset.builtin" variant="outline" size="sm" title="编辑预设" @click="selectedPreset && openEditor(selectedPreset)">
                  <Pencil class="size-3.5" />
                </Button>
                <Button v-if="selectedPreset && !selectedPreset.builtin" variant="ghost" size="sm" class="text-destructive hover:text-destructive" title="删除预设" @click="selectedPreset && deletePreset(selectedPreset)">
                  <Trash2 class="size-3.5" />
                </Button>
                <Button variant="ghost" size="sm" class="ml-auto" @click="openNewPreset">
                  <Plus class="size-3.5" />
                  新建
                </Button>
              </div>

              <!-- 当前预设警告 + 逐项结果 -->
              <Alert v-if="selectedPreset?.warning" variant="destructive" class="py-2">
                <AlertDescription class="text-xs">{{ selectedPreset.warning }}</AlertDescription>
              </Alert>

              <div v-for="g in SETTING_GROUPS" :key="g.key">
                <div class="mb-2 text-xs font-medium text-muted-foreground">{{ g.label }}</div>
                <div class="grid gap-2 sm:grid-cols-2">
                  <div
                    v-for="def in SETTING_DEFS.filter((d) => d.group === g.key)"
                    :key="def.id"
                    class="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5 text-sm">
                        {{ def.label }}
                        <Badge v-if="def.requiresPro" variant="outline" class="text-[10px]">Pro</Badge>
                      </div>
                      <div class="truncate text-xs text-muted-foreground">
                        当前：{{ displayValue(def, currentValue(def.id)) }}
                      </div>
                    </div>
                    <!-- onoff -->
                    <Switch
                      v-if="def.type === 'onoff'"
                      :model-value="currentValue(def.id) === 'on'"
                      :disabled="singleApplying === def.id"
                      @update:model-value="(v) => applySingle(def.id, v ? 'on' : 'off')"
                    />
                    <!-- select / security_level -->
                    <Select
                      v-else-if="def.type === 'select' || def.type === 'security_level'"
                      :model-value="String(currentValue(def.id) ?? '')"
                      :disabled="singleApplying === def.id"
                      @update:model-value="(v) => applySingle(def.id, String(v))"
                    >
                      <SelectTrigger class="w-36">
                        <SelectValue placeholder="选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="o in def.options" :key="o" :value="o">{{ optionLabel(def.id, o) }}</SelectItem>
                      </SelectContent>
                    </Select>
                    <!-- number（枚举秒数） -->
                    <Select
                      v-else-if="def.type === 'number'"
                      :model-value="String(currentValue(def.id) ?? '')"
                      :disabled="singleApplying === def.id"
                      @update:model-value="(v) => applySingle(def.id, Number(v))"
                    >
                      <SelectTrigger class="w-36">
                        <SelectValue placeholder="选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="o in def.numberOptions" :key="o" :value="String(o)">
                          {{ fmtSeconds(o) }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <!-- minify -->
                    <div v-else-if="def.type === 'minify'" class="flex gap-1">
                      <Button
                        v-for="k in (['html', 'css', 'js'] as const)"
                        :key="k"
                        :variant="(currentValue(def.id) as MinifyValue | undefined)?.[k] === 'on' ? 'default' : 'outline'"
                        size="sm"
                        class="h-7 px-2 text-xs"
                        :disabled="singleApplying === def.id"
                        @click="toggleMinify(def.id, k)"
                      >
                        {{ k.toUpperCase() }}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <!-- 预设编辑器 -->
      <Dialog v-model:open="editorOpen">
        <DialogContent class="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{{ editingPreset ? '编辑预设' : '新建预设' }}</DialogTitle>
            <DialogDescription>勾选要纳入预设的配置项并设置目标值，保存后全局可用</DialogDescription>
          </DialogHeader>
          <div v-if="editorDraft" class="space-y-4">
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-1.5">
                <Label>预设名称</Label>
                <Input v-model="editorDraft.name" placeholder="如 我的站点加速" />
              </div>
              <div class="space-y-1.5">
                <Label>描述（可选）</Label>
                <Input v-model="editorDraft.description" placeholder="一句话说明" />
              </div>
            </div>
            <div class="max-h-[50vh] space-y-4 overflow-y-auto rounded-lg border p-3">
              <div v-for="g in SETTING_GROUPS" :key="g.key">
                <div class="mb-2 text-xs font-medium text-muted-foreground">{{ g.label }}</div>
                <div class="space-y-2">
                  <div
                    v-for="def in SETTING_DEFS.filter((d) => d.group === g.key)"
                    :key="def.id"
                    class="flex items-center justify-between gap-3 rounded-md border p-2"
                  >
                    <div class="flex items-center gap-2">
                      <Checkbox
                        :model-value="def.id in editorDraft.settings"
                        @update:model-value="(v) => toggleDraftSetting(def.id, v === true)"
                      />
                      <span class="text-sm">{{ def.label }}</span>
                      <Badge v-if="def.requiresPro" variant="outline" class="text-[10px]">Pro</Badge>
                    </div>
                    <div v-if="def.id in editorDraft.settings" class="flex items-center gap-2">
                      <Switch
                        v-if="def.type === 'onoff'"
                        :model-value="editorDraft.settings[def.id] === 'on'"
                        @update:model-value="(v) => setDraftValue(def.id, v ? 'on' : 'off')"
                      />
                      <Select
                        v-else-if="def.type === 'select' || def.type === 'security_level'"
                        :model-value="String(editorDraft.settings[def.id] ?? '')"
                        @update:model-value="(v) => setDraftValue(def.id, String(v))"
                      >
                        <SelectTrigger class="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem v-for="o in def.options" :key="o" :value="o">{{ optionLabel(def.id, o) }}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        v-else-if="def.type === 'number'"
                        :model-value="String(editorDraft.settings[def.id] ?? '')"
                        @update:model-value="(v) => setDraftValue(def.id, Number(v))"
                      >
                        <SelectTrigger class="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem v-for="o in def.numberOptions" :key="o" :value="String(o)">
                            {{ fmtSeconds(o) }}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <div v-else-if="def.type === 'minify'" class="flex gap-1">
                        <Button
                          v-for="k in (['html', 'css', 'js'] as const)"
                          :key="k"
                          :variant="(editorDraft.settings[def.id] as MinifyValue)?.[k] === 'on' ? 'default' : 'outline'"
                          size="sm"
                          class="h-7 px-2 text-xs"
                          @click="toggleDraftMinify(def.id, k)"
                        >
                          {{ k.toUpperCase() }}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="editorOpen = false">取消</Button>
            <Button @click="saveDraft">保存预设</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
