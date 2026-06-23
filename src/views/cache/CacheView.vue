<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { RefreshCw, Loader2, Flame, Globe, Trash2, Plus, Trash, Zap } from '@lucide/vue'
import { zonesApi, securityApi, type PageRule, type PageRuleAction } from '@/api'
import type { Zone } from '@/types/cloudflare'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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

/* ----------------------------- 缓存操作 ----------------------------- */

const purgeLoading = ref(false)
const purgeFiles = ref('')

async function purgeAll() {
  if (!zoneId.value) return
  purgeLoading.value = true
  try {
    await zonesApi.purgeCache(zoneId.value)
    toast.success('已清除全部缓存')
  } catch (e) {
    toast.error('清除缓存失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    purgeLoading.value = false
  }
}

async function purgeSelected() {
  if (!zoneId.value) return
  const files = purgeFiles.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!files.length) {
    toast.error('请输入要清除的 URL')
    return
  }
  purgeLoading.value = true
  try {
    await zonesApi.purgeCache(zoneId.value, files)
    toast.success(`已清除 ${files.length} 个 URL 的缓存`)
    purgeFiles.value = ''
  } catch (e) {
    toast.error('清除缓存失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    purgeLoading.value = false
  }
}

/* ----------------------------- 开发模式 ----------------------------- */

const devMode = ref(false)
const devModeLoading = ref(false)

async function loadDevMode() {
  if (!zoneId.value) return
  try {
    const z = await zonesApi.get(zoneId.value)
    devMode.value = z.development_mode > 0
  } catch {
    /* 静默 */
  }
}

async function toggleDevMode(v: boolean) {
  if (!zoneId.value) return
  devModeLoading.value = true
  try {
    await zonesApi.setDevelopmentMode(zoneId.value, v)
    devMode.value = v
    toast.success(v ? '已开启开发模式' : '已关闭开发模式')
  } catch (e) {
    devMode.value = !v
    toast.error('切换失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    devModeLoading.value = false
  }
}

/* ----------------------------- Page Rules ----------------------------- */

const pageRules = ref<PageRule[]>([])
const rulesLoading = ref(false)

async function loadPageRules() {
  if (!zoneId.value) return
  rulesLoading.value = true
  try {
    pageRules.value = await securityApi.listPageRules(zoneId.value)
  } catch (e) {
    toast.error('加载 Page Rules 失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    rulesLoading.value = false
  }
}

const ACTION_OPTIONS: { id: string; label: string; needsValue: boolean }[] = [
  { id: 'ssl', label: 'SSL', needsValue: false },
  { id: 'always_use_https', label: 'Always Use HTTPS', needsValue: false },
  { id: 'cache_level', label: '缓存级别', needsValue: true },
  { id: 'browser_cache_ttl', label: '浏览器缓存 TTL', needsValue: true },
  { id: 'edge_cache_ttl', label: '边缘缓存 TTL', needsValue: true },
  { id: 'forwarding_url', label: '转发 URL', needsValue: true },
  { id: 'minify', label: '压缩', needsValue: true },
]

function actionLabel(id: string): string {
  return ACTION_OPTIONS.find((a) => a.id === id)?.label ?? id
}

function summarizeActions(actions: PageRuleAction[]): string {
  return actions.map((a) => `${actionLabel(a.id)}${a.value ? `=${a.value}` : ''}`).join(', ')
}

/* ----------------------------- 新建 Page Rule ----------------------------- */

const addOpen = ref(false)
const creating = ref(false)
const form = ref({
  url: '',
  action: 'cache_level',
  value: 'cache_everything',
  priority: 1,
  status: 'active' as 'active' | 'disabled',
})

function openAdd() {
  form.value = { url: '', action: 'cache_level', value: 'cache_everything', priority: 1, status: 'active' }
  addOpen.value = true
}

const currentActionNeedsValue = computed(
  () => ACTION_OPTIONS.find((a) => a.id === form.value.action)?.needsValue ?? false,
)

async function submitAdd() {
  if (!zoneId.value) return
  const url = form.value.url.trim()
  if (!url) {
    toast.error('请输入 URL 匹配模式')
    return
  }
  const action: PageRuleAction = currentActionNeedsValue.value
    ? { id: form.value.action, value: form.value.value }
    : { id: form.value.action }
  creating.value = true
  try {
    await securityApi.createPageRule(zoneId.value, {
      targets: [{ target: 'url', constraint: { operator: 'matches', value: url } }],
      actions: [action],
      priority: form.value.priority,
      status: form.value.status,
    })
    toast.success('Page Rule 已创建')
    addOpen.value = false
    await loadPageRules()
  } catch (e) {
    toast.error('创建失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    creating.value = false
  }
}

/* ----------------------------- 删除 Page Rule ----------------------------- */

const deleteTarget = ref<PageRule | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!deleteTarget.value || !zoneId.value) return
  deleting.value = true
  try {
    await securityApi.deletePageRule(zoneId.value, deleteTarget.value.id)
    toast.success('已删除')
    deleteTarget.value = null
    await loadPageRules()
  } catch (e) {
    toast.error('删除失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    deleting.value = false
  }
}

/* ----------------------------- 生命周期 ----------------------------- */

const refreshing = computed(() => rulesLoading.value)

async function reload() {
  await Promise.all([loadDevMode(), loadPageRules()])
}

watch(zoneId, () => { reload() })
onMounted(async () => {
  await loadZones()
  await reload()
})
</script>

<template>
  <div class="space-y-6">
    <!-- 标题 -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">缓存规则</h1>
        <p class="text-sm text-muted-foreground">清除缓存、开发模式与 Page Rules</p>
      </div>
      <div class="flex items-center gap-2">
        <Select v-model="zoneId">
          <SelectTrigger class="w-56">
            <SelectValue placeholder="选择域名" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="z in zones" :key="z.id" :value="z.id">{{ z.name }}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" :disabled="refreshing || !zoneId" @click="reload">
          <RefreshCw class="size-4" :class="{ 'animate-spin': refreshing }" />
          刷新
        </Button>
      </div>
    </div>

    <template v-if="zoneId">
      <!-- 缓存清除 -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <Trash class="size-4 text-primary" />
            清除缓存
          </CardTitle>
          <CardDescription>清除整个 zone 或指定 URL 的缓存</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="destructive" :disabled="purgeLoading" @click="purgeAll">
              <Loader2 v-if="purgeLoading" class="size-4 animate-spin" />
              清除全部缓存
            </Button>
          </div>
          <div class="space-y-2">
            <Label>按 URL 清除（每行一个）</Label>
            <textarea
              v-model="purgeFiles"
              rows="3"
              placeholder="https://example.com/path&#10;https://example.com/path2"
              class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button variant="outline" size="sm" :disabled="purgeLoading" @click="purgeSelected">
              清除指定 URL
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- 开发模式 -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <Zap class="size-4 text-primary" />
            开发模式
          </CardTitle>
          <CardDescription>开启后绕过缓存，直接回源（适合调试，3 小时后自动关闭）</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex items-center justify-between">
            <span class="text-sm">{{ devMode ? '已开启' : '已关闭' }}</span>
            <Switch
              :model-value="devMode"
              :disabled="devModeLoading"
              @update:model-value="(v: boolean) => toggleDevMode(v)"
            />
          </div>
        </CardContent>
      </Card>

      <!-- Page Rules -->
      <Card>
        <CardHeader class="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle class="flex items-center gap-2 text-base">
              <Flame class="size-4 text-primary" />
              Page Rules
            </CardTitle>
            <CardDescription>基于 URL 模式的缓存与行为规则</CardDescription>
          </div>
          <Button size="sm" @click="openAdd">
            <Plus class="size-4" />
            新建规则
          </Button>
        </CardHeader>
        <CardContent class="p-0">
          <div v-if="rulesLoading" class="divide-y">
            <div v-for="i in 4" :key="i" class="flex items-center gap-3 px-4 py-3">
              <Skeleton class="h-5 flex-1" />
              <Skeleton class="h-5 w-48" />
              <Skeleton class="h-5 w-16" />
            </div>
          </div>
          <div v-else-if="!pageRules.length" class="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <div class="flex size-12 items-center justify-center rounded-full bg-muted">
              <Flame class="size-6 text-muted-foreground" />
            </div>
            <div class="text-sm text-muted-foreground">暂无 Page Rules</div>
            <Button size="sm" variant="outline" @click="openAdd">
              <Plus class="size-4" />
              新建规则
            </Button>
          </div>
          <template v-else>
            <div class="grid grid-cols-[minmax(200px,2fr)_minmax(220px,2fr)_70px_90px_60px] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>URL 匹配</span>
              <span>动作</span>
              <span>优先级</span>
              <span>状态</span>
              <span class="text-right">操作</span>
            </div>
            <div class="divide-y">
              <div
                v-for="r in pageRules"
                :key="r.id"
                class="group grid grid-cols-[minmax(200px,2fr)_minmax(220px,2fr)_70px_90px_60px] items-center gap-2 px-4 py-3 text-sm hover:bg-accent/40"
              >
                <span class="truncate font-mono text-xs" :title="r.targets?.[0]?.constraint?.value">
                  {{ r.targets?.[0]?.constraint?.value ?? '—' }}
                </span>
                <span class="truncate text-xs text-muted-foreground" :title="summarizeActions(r.actions)">
                  {{ summarizeActions(r.actions) }}
                </span>
                <span class="text-muted-foreground">{{ r.priority }}</span>
                <Badge
                  variant="secondary"
                  :class="r.status === 'active' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'"
                >
                  {{ r.status === 'active' ? '启用' : '禁用' }}
                </Badge>
                <div class="flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-destructive hover:text-destructive opacity-60 group-hover:opacity-100"
                    title="删除"
                    @click="deleteTarget = r"
                  >
                    <Trash2 class="size-3.5" />
                  </Button>
                </div>
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

    <!-- 新建 Page Rule -->
    <Dialog v-model:open="addOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建 Page Rule</DialogTitle>
          <DialogDescription>匹配 URL 模式并应用缓存动作</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label>URL 匹配模式</Label>
            <Input v-model="form.url" placeholder="如 example.com/*" />
            <p class="text-xs text-muted-foreground">支持 * 通配符</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <Label>动作</Label>
              <Select v-model="form.action">
                <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="a in ACTION_OPTIONS" :key="a.id" :value="a.id">{{ a.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label>值</Label>
              <Input v-model="form.value" :disabled="!currentActionNeedsValue" :placeholder="currentActionNeedsValue ? '动作值' : '无需值'" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <Label>优先级</Label>
              <Input v-model.number="form.priority" type="number" min="1" />
            </div>
            <div class="space-y-2">
              <Label>状态</Label>
              <Select v-model="form.status">
                <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="disabled">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="addOpen = false">取消</Button>
          <Button :disabled="creating" @click="submitAdd">
            <Loader2 v-if="creating" class="size-4 animate-spin" />
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 删除确认 -->
    <Dialog :open="!!deleteTarget" @update:open="(v) => { if (!v) deleteTarget = null }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除 Page Rule</DialogTitle>
          <DialogDescription>
            确认删除规则
            <code class="mx-1 font-mono">{{ deleteTarget?.targets?.[0]?.constraint?.value }}</code>
            ？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" :disabled="deleting" @click="confirmDelete">
            <Loader2 v-if="deleting" class="size-4 animate-spin" />
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
