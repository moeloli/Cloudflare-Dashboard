<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Palette,
  Info,
  ExternalLink,
  Sun,
  Moon,
  Monitor,
  Loader2,
} from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import AddAccountDialog from './AddAccountDialog.vue'

const auth = useAuthStore()
const router = useRouter()
const theme = useTheme()

const themeOptions = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'auto', label: '跟随系统', icon: Monitor },
] as const

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

/* ---------- 账号管理 ---------- */

const addOpen = ref(false)

const editing = ref<{ id: string; nickname: string } | null>(null)
const editOpen = ref(false)

function startEdit(id: string, nickname: string) {
  editing.value = { id, nickname }
  editOpen.value = true
}

function saveEdit() {
  if (!editing.value) return
  const nickname = editing.value.nickname.trim()
  if (!nickname) return toast.error('昵称不能为空')
  auth.updateAccount(editing.value.id, { nickname })
  toast.success('昵称已更新')
  editOpen.value = false
  editing.value = null
}

const deletingId = ref<string | null>(null)
const deleteOpen = computed({
  get: () => deletingId.value !== null,
  set: (v) => {
    if (!v) deletingId.value = null
  },
})

function confirmDelete() {
  if (!deletingId.value) return
  auth.removeAccount(deletingId.value)
  toast.success('账号已删除')
  deletingId.value = null
}

function handleSwitch(id: string) {
  auth.switchAccount(id)
  toast.success('已切换当前账号')
}

/* ---------- 凭据安全 ---------- */

const clearing = ref(false)

function clearAllCredentials() {
  clearing.value = true
  try {
    auth.logout()
    localStorage.removeItem('cf_accounts')
    localStorage.removeItem('cf_current_account_id')
    toast.success('已清除所有本地凭据')
    router.push('/login')
  } finally {
    clearing.value = false
  }
}

/* ---------- 关于 ---------- */
const stack = ['Vue 3', 'TypeScript', 'Vite', 'shadcn-vue', 'Tailwind CSS v4', 'Pinia', 'Vue Router']
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <!-- 账号管理 -->
    <Card>
      <CardHeader class="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle class="flex items-center gap-2">
            <CheckCircle2 class="size-5" /> 账号管理
          </CardTitle>
          <CardDescription>管理本地存储的 Cloudflare 账号凭据。</CardDescription>
        </div>
        <Button size="sm" @click="addOpen = true">
          <Plus class="size-4" /> 添加账号
        </Button>
      </CardHeader>
      <CardContent class="space-y-3">
        <div
          v-for="acc in auth.accounts"
          :key="acc.id"
          class="rounded-lg border p-4 transition"
          :class="acc.id === auth.currentAccountId ? 'border-primary bg-primary/5' : 'bg-card'"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold">{{ acc.nickname || acc.accountName }}</span>
                <Badge :variant="acc.authType === 'token' ? 'default' : 'secondary'">
                  {{ acc.authType === 'token' ? 'API Token' : 'Global API Key' }}
                </Badge>
                <Badge v-if="acc.id === auth.currentAccountId" variant="outline" class="text-primary">
                  当前
                </Badge>
              </div>
              <div class="text-sm text-muted-foreground">{{ acc.accountName }} · {{ acc.accountId }}</div>
              <div class="text-xs text-muted-foreground">
                <template v-if="acc.email">{{ acc.email }} · </template>添加于 {{ formatDate(acc.addedAt) }}
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <Button
                v-if="acc.id !== auth.currentAccountId"
                size="sm"
                variant="outline"
                @click="handleSwitch(acc.id)"
              >
                设为当前
              </Button>
              <Button size="icon" variant="ghost" class="size-8" @click="startEdit(acc.id, acc.nickname)">
                <Pencil class="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-8 text-destructive hover:text-destructive"
                :disabled="auth.accounts.length <= 1"
                @click="deletingId = acc.id"
              >
                <Trash2 class="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 凭据安全说明 -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <ShieldCheck class="size-5" /> 凭据安全说明
        </CardTitle>
        <CardDescription>了解凭据的存储方式与安全建议。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <ul class="space-y-2 text-sm text-muted-foreground">
          <li>· 凭据仅保存在浏览器 <code class="rounded bg-muted px-1 py-0.5 text-xs">localStorage</code> 中，不上传任何服务器。</li>
          <li>· 当前为明文存储，请勿在公共设备上保存凭据。</li>
          <li>· 建议使用最小权限的 API Token，而非 Global API Key。</li>
          <li>· 清除浏览器数据或点击下方按钮即可清除所有凭据。</li>
        </ul>
        <Separator />
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm">
            <div class="font-medium">清除所有本地凭据</div>
            <div class="text-muted-foreground">登出并移除全部已保存的账号，无法恢复。</div>
          </div>
          <Button variant="destructive" :disabled="clearing" @click="clearAllCredentials">
            <Loader2 v-if="clearing" class="size-4 animate-spin" />
            清除凭据
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 外观 -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Palette class="size-5" /> 外观
        </CardTitle>
        <CardDescription>切换界面主题，跟随系统会自动适配浏览器偏好。</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-2">
          <Button
            v-for="opt in themeOptions"
            :key="opt.value"
            :variant="theme === opt.value ? 'default' : 'outline'"
            class="flex-col h-auto py-3"
            @click="theme = opt.value"
          >
            <component :is="opt.icon" class="size-4" />
            {{ opt.label }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 关于 -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Info class="size-5" /> 关于
        </CardTitle>
        <CardDescription>开源 Cloudflare 管理面板。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">项目</span>
            <span class="font-medium">CF Dashboard</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">版本</span>
            <span class="font-medium">v0.1.0</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">定位</span>
            <span class="text-right">自托管 · 凭据零上链 · 同源透传代理</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">开源声明</span>
            <span>MIT License</span>
          </div>
        </div>
        <Separator />
        <div>
          <div class="mb-2 text-sm text-muted-foreground">技术栈</div>
          <div class="flex flex-wrap gap-1.5">
            <Badge v-for="s in stack" :key="s" variant="secondary">{{ s }}</Badge>
          </div>
        </div>
        <Separator />
        <a href="#" class="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ExternalLink class="size-4" /> GitHub 仓库
        </a>
      </CardContent>
    </Card>

    <!-- 添加账号对话框 -->
    <AddAccountDialog v-model:open="addOpen" />

    <!-- 编辑昵称对话框 -->
    <Dialog v-model:open="editOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>编辑昵称</DialogTitle>
          <DialogDescription>为该账号设置一个便于识别的本地昵称。</DialogDescription>
        </DialogHeader>
        <div class="space-y-2 py-2">
          <Label for="nickname">昵称</Label>
          <Input
            id="nickname"
            v-model="editing!.nickname"
            placeholder="输入昵称"
            @keyup.enter="saveEdit"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editOpen = false">取消</Button>
          <Button @click="saveEdit">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 删除确认对话框 -->
    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>删除账号</DialogTitle>
          <DialogDescription>确认删除该账号凭据？此操作无法撤销。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteOpen = false">取消</Button>
          <Button variant="destructive" @click="confirmDelete">删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
