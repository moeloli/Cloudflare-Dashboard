<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { RefreshCw, Loader2, ShieldAlert, Globe, Plus, Trash2 } from '@lucide/vue'
import { zonesApi, securityApi, currentAccountId, type FirewallAccessRule, type WafRuleset } from '@/api'
import type { Zone } from '@/types/cloudflare'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

/* ----------------------------- WAF 规则集（账号维度） ----------------------------- */

const rulesets = ref<WafRuleset[]>([])
const rulesetsLoading = ref(false)

async function loadRulesets() {
  // account 维度，无需 zone；但仅在已选区账号存在时加载
  rulesetsLoading.value = true
  try {
    const all = await securityApi.listWafRulesets(currentAccountId())
    // 只展示 WAF 相关 phase
    const phases = new Set([
      'http_request_firewall_custom',
      'http_request_firewall_managed',
      'http_request_dynamic_redirect',
      'http_request_late_transform',
      'http_request_origin',
    ])
    const filtered = all.filter((r) => phases.has(r.phase) || r.kind === 'managed')
    rulesets.value = filtered.length ? filtered : all
  } catch (e) {
    toast.error('加载 WAF 规则集失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    rulesetsLoading.value = false
  }
}

/* ----------------------------- 访问规则 ----------------------------- */

const accessRules = ref<FirewallAccessRule[]>([])
const rulesLoading = ref(false)

async function loadAccessRules() {
  if (!zoneId.value) return
  rulesLoading.value = true
  try {
    accessRules.value = await securityApi.listAccessRules(zoneId.value)
  } catch (e) {
    toast.error('加载访问规则失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    rulesLoading.value = false
  }
}

const MODE_LABEL: Record<string, string> = {
  block: '阻止',
  challenge: '质询',
  whitelist: '允许',
  js_challenge: 'JS 质询',
}

function modeClass(m: string): string {
  if (m === 'block') return 'bg-red-500/15 text-red-600'
  if (m === 'whitelist') return 'bg-emerald-500/15 text-emerald-600'
  if (m === 'challenge' || m === 'js_challenge') return 'bg-amber-500/15 text-amber-600'
  return 'bg-muted text-muted-foreground'
}

/* ----------------------------- 添加访问规则 ----------------------------- */

const addOpen = ref(false)
const creating = ref(false)
const form = ref({
  mode: 'block' as FirewallAccessRule['mode'],
  target: 'ip' as 'ip' | 'ip_range' | 'country' | 'asn',
  value: '',
  notes: '',
})

const TARGET_LABEL: Record<string, string> = {
  ip: 'IP 地址',
  ip_range: 'IP 段 (CIDR)',
  country: '国家代码',
  asn: 'ASN',
}

function openAdd() {
  form.value = { mode: 'block', target: 'ip', value: '', notes: '' }
  addOpen.value = true
}

async function submitAdd() {
  const v = form.value.value.trim()
  if (!v) {
    toast.error('请输入规则值')
    return
  }
  if (!zoneId.value) return
  creating.value = true
  try {
    await securityApi.createAccessRule(zoneId.value, {
      mode: form.value.mode,
      notes: form.value.notes.trim() || undefined,
      configuration: { target: form.value.target, value: v },
    })
    toast.success('访问规则已添加')
    addOpen.value = false
    await loadAccessRules()
  } catch (e) {
    toast.error('添加失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    creating.value = false
  }
}

/* ----------------------------- 删除 ----------------------------- */

const deleteTarget = ref<FirewallAccessRule | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!deleteTarget.value || !zoneId.value) return
  deleting.value = true
  try {
    await securityApi.deleteAccessRule(zoneId.value, deleteTarget.value.id)
    toast.success('已删除')
    deleteTarget.value = null
    await loadAccessRules()
  } catch (e) {
    toast.error('删除失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    deleting.value = false
  }
}

/* ----------------------------- 生命周期 ----------------------------- */

const refreshing = computed(() => rulesetsLoading.value || rulesLoading.value)

async function reload() {
  await Promise.all([loadRulesets(), loadAccessRules()])
}

watch(zoneId, () => { loadAccessRules() })
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
        <h1 class="text-xl font-semibold tracking-tight">WAF / 防火墙</h1>
        <p class="text-sm text-muted-foreground">管理 WAF 规则集、IP 访问规则</p>
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
        <Button variant="outline" size="sm" :disabled="refreshing" @click="reload">
          <RefreshCw class="size-4" :class="{ 'animate-spin': refreshing }" />
          刷新
        </Button>
        <Button size="sm" :disabled="!zoneId" @click="openAdd">
          <Plus class="size-4" />
          添加规则
        </Button>
      </div>
    </div>

    <!-- WAF 规则集 -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <ShieldAlert class="size-4 text-primary" />
          WAF 规则集
        </CardTitle>
        <CardDescription>账号维度的托管规则集（只读）</CardDescription>
      </CardHeader>
      <CardContent class="p-0">
        <div v-if="rulesetsLoading" class="divide-y">
          <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-4 py-3">
            <Skeleton class="h-5 flex-1" />
            <Skeleton class="h-5 w-24" />
            <Skeleton class="h-5 w-32" />
          </div>
        </div>
        <div v-else-if="!rulesets.length" class="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <div class="flex size-12 items-center justify-center rounded-full bg-muted">
            <ShieldAlert class="size-6 text-muted-foreground" />
          </div>
          <div class="text-sm text-muted-foreground">暂无规则集</div>
        </div>
        <template v-else>
          <div class="grid grid-cols-[minmax(180px,2fr)_140px_140px_120px] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>名称</span>
            <span>类型</span>
            <span>Phase</span>
            <span class="text-right">版本</span>
          </div>
          <div class="divide-y">
            <div
              v-for="r in rulesets"
              :key="r.id"
              class="grid grid-cols-[minmax(180px,2fr)_140px_140px_120px] items-center gap-2 px-4 py-3 text-sm hover:bg-accent/40"
            >
              <div class="min-w-0">
                <div class="truncate font-medium" :title="r.name">{{ r.name }}</div>
                <div v-if="r.description" class="truncate text-xs text-muted-foreground" :title="r.description">{{ r.description }}</div>
              </div>
              <span class="truncate text-muted-foreground">{{ r.kind }}</span>
              <code class="truncate text-xs text-muted-foreground" :title="r.phase">{{ r.phase }}</code>
              <span class="text-right text-xs text-muted-foreground">{{ r.version ?? '—' }}</span>
            </div>
          </div>
        </template>
      </CardContent>
    </Card>

    <!-- 访问规则 -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Globe class="size-4 text-primary" />
          IP 访问规则
        </CardTitle>
        <CardDescription>对 IP / IP 段 / 国家 / ASN 设置放行、阻止或质询</CardDescription>
      </CardHeader>
      <CardContent class="p-0">
        <div v-if="rulesLoading" class="divide-y">
          <div v-for="i in 4" :key="i" class="flex items-center gap-3 px-4 py-3">
            <Skeleton class="h-5 w-28" />
            <Skeleton class="h-5 flex-1" />
            <Skeleton class="h-5 w-40" />
            <Skeleton class="h-5 w-8" />
          </div>
        </div>
        <div v-else-if="!zoneId" class="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <Loader2 v-if="zonesLoading" class="size-6 animate-spin text-muted-foreground" />
          <template v-else>
            <div class="flex size-12 items-center justify-center rounded-full bg-muted">
              <Globe class="size-6 text-muted-foreground" />
            </div>
            <div class="text-sm text-muted-foreground">请先选择一个域名</div>
          </template>
        </div>
        <div v-else-if="!accessRules.length" class="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <div class="flex size-12 items-center justify-center rounded-full bg-muted">
            <ShieldAlert class="size-6 text-muted-foreground" />
          </div>
          <div class="text-sm text-muted-foreground">暂无访问规则</div>
          <Button size="sm" variant="outline" @click="openAdd">
            <Plus class="size-4" />
            添加规则
          </Button>
        </div>
        <template v-else>
          <div class="grid grid-cols-[120px_minmax(160px,1.5fr)_minmax(160px,2fr)_200px_60px] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>动作</span>
            <span>目标</span>
            <span>值</span>
            <span>备注</span>
            <span class="text-right">操作</span>
          </div>
          <div class="divide-y">
            <div
              v-for="r in accessRules"
              :key="r.id"
              class="group grid grid-cols-[120px_minmax(160px,1.5fr)_minmax(160px,2fr)_200px_60px] items-center gap-2 px-4 py-3 text-sm hover:bg-accent/40"
            >
              <Badge variant="secondary" :class="modeClass(r.mode)">{{ MODE_LABEL[r.mode] ?? r.mode }}</Badge>
              <span class="truncate text-muted-foreground">{{ r.configuration?.target ?? '—' }}</span>
              <code class="truncate font-mono text-xs" :title="r.configuration?.value">{{ r.configuration?.value ?? '—' }}</code>
              <span class="truncate text-xs text-muted-foreground" :title="r.notes">{{ r.notes || '—' }}</span>
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

    <!-- 添加访问规则 -->
    <Dialog v-model:open="addOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加访问规则</DialogTitle>
          <DialogDescription>针对该域名创建一条 IP 访问规则</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <Label>动作</Label>
              <Select v-model="form.mode">
                <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">阻止</SelectItem>
                  <SelectItem value="challenge">质询</SelectItem>
                  <SelectItem value="js_challenge">JS 质询</SelectItem>
                  <SelectItem value="whitelist">允许</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label>目标类型</Label>
              <Select v-model="form.target">
                <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ip">{{ TARGET_LABEL.ip }}</SelectItem>
                  <SelectItem value="ip_range">{{ TARGET_LABEL.ip_range }}</SelectItem>
                  <SelectItem value="country">{{ TARGET_LABEL.country }}</SelectItem>
                  <SelectItem value="asn">{{ TARGET_LABEL.asn }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="space-y-2">
            <Label>值</Label>
            <Input v-model="form.value" :placeholder="form.target === 'country' ? '如 CN' : form.target === 'asn' ? '如 13335' : '如 1.2.3.4 或 1.2.3.0/24'" />
          </div>
          <div class="space-y-2">
            <Label>备注（可选）</Label>
            <Input v-model="form.notes" placeholder="说明该规则用途" />
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
          <DialogTitle>删除访问规则</DialogTitle>
          <DialogDescription>
            确认删除规则
            <code class="mx-1 font-mono">{{ deleteTarget?.configuration?.value }}</code>
            （{{ deleteTarget ? MODE_LABEL[deleteTarget.mode] : '' }}）？此操作不可撤销。
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
