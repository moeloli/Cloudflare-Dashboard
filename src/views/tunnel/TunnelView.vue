<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import {
  Activity,
  Copy,
  Network,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from '@lucide/vue'
import { tunnelApi, type Tunnel, type TunnelConnection, type TunnelConfig } from '@/api/tunnel'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

/* ---------- 列表 ---------- */
const tunnels = ref<Tunnel[]>([])
const loading = ref(true)

/* ---------- 创建 ---------- */
const createOpen = ref(false)
const createName = ref('')
const creating = ref(false)
const createdToken = ref<string | null>(null)
const createdName = ref<string>('')

/* ---------- 详情对话框 ---------- */
const connTarget = ref<Tunnel | null>(null)
const connList = ref<TunnelConnection[]>([])
const connLoading = ref(false)

const cfgTarget = ref<Tunnel | null>(null)
const cfgData = ref<TunnelConfig | null>(null)
const cfgLoading = ref(false)

/* ---------- 删除 ---------- */
const deleteTarget = ref<Tunnel | null>(null)
const deleting = ref(false)

async function load() {
  loading.value = true
  try {
    tunnels.value = await tunnelApi.listTunnels()
  } catch (e) {
    toast.error('加载 Tunnel 列表失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  createName.value = ''
  createdToken.value = null
  createdName.value = ''
  createOpen.value = true
}

async function submitCreate() {
  if (!createName.value.trim()) {
    toast.error('请填写 Tunnel 名称')
    return
  }
  creating.value = true
  try {
    const t = await tunnelApi.createTunnel(createName.value.trim())
    createdToken.value = t.token
    createdName.value = t.name
    toast.success('Tunnel 已创建，请复制 token 配置 cloudflared')
    await load()
  } catch (e) {
    toast.error('创建 Tunnel 失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    creating.value = false
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  } catch {
    toast.error('复制失败，请手动选择复制')
  }
}

async function viewConnections(t: Tunnel) {
  connTarget.value = t
  connList.value = []
  connLoading.value = true
  try {
    connList.value = await tunnelApi.getConnections(t.id)
  } catch (e) {
    toast.error('获取连接信息失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    connLoading.value = false
  }
}

async function viewConfig(t: Tunnel) {
  cfgTarget.value = t
  cfgData.value = null
  cfgLoading.value = true
  try {
    cfgData.value = await tunnelApi.getConfig(t.id)
  } catch (e) {
    toast.error('获取配置失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    cfgLoading.value = false
  }
}

async function doDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await tunnelApi.deleteTunnel(deleteTarget.value.id)
    toast.success('已删除 Tunnel')
    deleteTarget.value = null
    await load()
  } catch (e) {
    toast.error('删除失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    deleting.value = false
  }
}

function statusVariant(status: string) {
  if (status === 'healthy') return 'default' as const
  if (status === 'down') return 'destructive' as const
  return 'secondary' as const
}

function fmtDate(s: string | undefined): string {
  if (!s) return '-'
  try {
    return new Date(s).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return s
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 顶部 -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Tunnel 隧道</h1>
        <p class="text-sm text-muted-foreground">管理 Cloudflare Tunnel，安全地将内网服务暴露到公网</p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" :disabled="loading" @click="load">
          <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
          刷新
        </Button>
        <Button size="sm" @click="openCreate">
          <Plus class="size-4" />
          新建 Tunnel
        </Button>
      </div>
    </div>

    <!-- 列表 -->
    <div v-if="loading" class="space-y-2">
      <Skeleton v-for="i in 4" :key="i" class="h-16 w-full" />
    </div>

    <Card v-else-if="!tunnels.length" class="border-dashed">
      <CardContent class="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div class="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Network class="size-6" />
        </div>
        <div class="font-medium">还没有 Tunnel</div>
        <p class="text-sm text-muted-foreground">新建一个 Tunnel，使用 cloudflared 连接内网服务</p>
        <Button size="sm" @click="openCreate">
          <Plus class="size-4" />
          新建 Tunnel
        </Button>
      </CardContent>
    </Card>

    <Card v-else>
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th class="px-4 py-3 font-medium">名称</th>
                <th class="px-4 py-3 font-medium">Tunnel ID</th>
                <th class="px-4 py-3 font-medium">状态</th>
                <th class="px-4 py-3 font-medium">创建时间</th>
                <th class="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in tunnels"
                :key="t.id"
                class="border-b last:border-0 hover:bg-muted/40"
              >
                <td class="px-4 py-3 font-medium">{{ t.name }}</td>
                <td class="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-muted-foreground">{{ t.id }}</td>
                <td class="px-4 py-3">
                  <Badge :variant="statusVariant(t.status)">{{ t.status }}</Badge>
                </td>
                <td class="px-4 py-3 text-muted-foreground">{{ fmtDate(t.created_at) }}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" title="查看连接" @click="viewConnections(t)">
                      <Activity class="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" title="查看配置" @click="viewConfig(t)">
                      <Settings2 class="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      class="text-muted-foreground hover:text-destructive"
                      title="删除"
                      @click="deleteTarget = t"
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <!-- 创建 / 展示 token -->
    <Dialog v-model:open="createOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建 Tunnel</DialogTitle>
          <DialogDescription>
            Cloudflare 会自动生成 tunnel secret。创建后请立即复制 token，<strong>该 token 仅显示一次</strong>。
          </DialogDescription>
        </DialogHeader>

        <template v-if="!createdToken">
          <div class="space-y-1.5">
            <Label for="tunnel-name">Tunnel 名称</Label>
            <Input
              id="tunnel-name"
              v-model="createName"
              placeholder="my-tunnel"
              class="font-mono"
              autocomplete="off"
            />
            <p class="text-xs text-muted-foreground">用于标识该 Tunnel，建议与用途相关</p>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="createOpen = false">取消</Button>
            <Button :disabled="creating || !createName.trim()" @click="submitCreate">
              {{ creating ? '创建中…' : '创建' }}
            </Button>
          </DialogFooter>
        </template>

        <template v-else>
          <div class="space-y-4">
            <div class="space-y-1.5">
              <Label>Tunnel 名称</Label>
              <div class="font-mono text-sm">{{ createdName }}</div>
            </div>
            <div class="space-y-1.5">
              <Label>Tunnel Token</Label>
              <div class="flex items-center gap-2">
                <Input :model-value="createdToken" readonly class="font-mono text-xs" />
                <Button size="icon" variant="outline" @click="copy(createdToken!)">
                  <Copy class="size-4" />
                </Button>
              </div>
            </div>
            <div class="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              在运行 cloudflared 的机器上执行：
              <code class="mt-1 block rounded bg-background px-2 py-1 font-mono">cloudflared tunnel run --token {{ createdToken?.slice(0, 24) }}…</code>
              或写入配置文件 credentials 引用。详细文档参见 Cloudflare 官方指引。
            </div>
          </div>
          <DialogFooter>
            <Button @click="createOpen = false">完成</Button>
          </DialogFooter>
        </template>
      </DialogContent>
    </Dialog>

    <!-- 连接信息 -->
    <Dialog :open="!!connTarget" @update:open="(v) => !v && (connTarget = null)">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>连接信息 · {{ connTarget?.name }}</DialogTitle>
          <DialogDescription>当前活跃的 cloudflared 连接</DialogDescription>
        </DialogHeader>
        <div v-if="connLoading" class="space-y-2">
          <Skeleton v-for="i in 2" :key="i" class="h-10 w-full" />
        </div>
        <div v-else-if="!connList.length" class="py-8 text-center text-sm text-muted-foreground">
          暂无活跃连接。请确认 cloudflared 已用 token 启动。
        </div>
        <ScrollArea v-else class="max-h-72">
          <div class="space-y-2 pr-2">
            <div
              v-for="c in connList"
              :key="c.id"
              class="rounded-md border p-3 text-xs"
            >
              <div class="flex items-center justify-between">
                <span class="font-mono text-muted-foreground">{{ c.id }}</span>
                <Badge variant="secondary">{{ c.colo_name }}</Badge>
              </div>
              <div class="mt-2 grid grid-cols-2 gap-1 text-muted-foreground">
                <div>来源 IP：{{ c.origin_ip }}</div>
                <div>连接时间：{{ fmtDate(c.opened_at) }}</div>
              </div>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" @click="connTarget = null">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 配置（只读） -->
    <Dialog :open="!!cfgTarget" @update:open="(v) => !v && (cfgTarget = null)">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>配置 · {{ cfgTarget?.name }}</DialogTitle>
          <DialogDescription>cloudflared ingress 配置（只读展示）</DialogDescription>
        </DialogHeader>
        <div v-if="cfgLoading" class="space-y-2">
          <Skeleton v-for="i in 3" :key="i" class="h-10 w-full" />
        </div>
        <ScrollArea v-else class="max-h-96">
          <pre class="rounded-md border bg-muted/40 p-3 font-mono text-xs">{{ cfgData ? JSON.stringify(cfgData, null, 2) : '无配置' }}</pre>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" @click="cfgTarget = null">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 删除确认 -->
    <Dialog :open="!!deleteTarget" @update:open="(v) => !v && (deleteTarget = null)">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除 Tunnel</DialogTitle>
          <DialogDescription>
            确定删除 Tunnel <code class="rounded bg-muted px-1 font-mono">{{ deleteTarget?.name }}</code>？
            删除前请先停止所有 cloudflared 连接，该操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" :disabled="deleting" @click="doDelete">
            {{ deleting ? '删除中…' : '确认删除' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
