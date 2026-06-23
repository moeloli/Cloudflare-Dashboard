<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Cloud, Loader2, KeyRound, Mail } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { verifyCredentials } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const authType = ref<'global' | 'token'>('global')
const email = ref('')
const apiKey = ref('')
const loading = ref(false)

async function handleLogin() {
  if (authType.value === 'global' && !email.value) return toast.error('请输入 Cloudflare 账号邮箱')
  if (!apiKey.value) return toast.error('请输入 API Key / Token')
  loading.value = true
  try {
    const res = await verifyCredentials({
      authType: authType.value,
      email: email.value,
      apiKey: apiKey.value,
    })
    if (!res.ok || !res.accounts?.length) {
      toast.error('凭据验证失败', { description: res.error })
      return
    }
    const acc = res.accounts[0]
    auth.addAccount({
      accountId: acc.id,
      accountName: acc.name,
      nickname: acc.name,
      authType: authType.value,
      email: authType.value === 'global' ? email.value : undefined,
      apiKey: apiKey.value,
    })
    toast.success('登录成功，欢迎！')
    router.push((route.query.redirect as string) || '/')
  } catch (e) {
    toast.error('登录异常', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-svh items-center justify-center bg-muted/30 p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <div class="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Cloud class="size-6" />
        </div>
        <CardTitle class="text-2xl">CF Dashboard</CardTitle>
        <CardDescription>开源 · 自托管 · 凭据零上链的 Cloudflare 管理面板</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <Tabs v-model="authType" class="w-full">
          <TabsList class="grid w-full grid-cols-2">
            <TabsTrigger value="global">Global API Key</TabsTrigger>
            <TabsTrigger value="token">API Token</TabsTrigger>
          </TabsList>
        </Tabs>

        <div v-if="authType === 'global'" class="space-y-2">
          <Label for="email">Cloudflare 账号邮箱</Label>
          <div class="relative">
            <Mail class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="email" v-model="email" type="email" placeholder="your@email.com" class="pl-9" />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="key">{{ authType === 'global' ? 'Global API Key' : 'API Token' }}</Label>
          <div class="relative">
            <KeyRound class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="key" v-model="apiKey" type="password" placeholder="••••••••••••" class="pl-9" @keyup.enter="handleLogin" />
          </div>
          <p class="text-xs text-muted-foreground">
            凭据仅存浏览器本地，永不上传任何服务器。Token 建议用最小权限。
          </p>
        </div>

        <Button class="w-full" :disabled="loading" @click="handleLogin">
          <Loader2 v-if="loading" class="size-4 animate-spin" />
          验证并进入
        </Button>

        <p class="text-center text-xs text-muted-foreground">
          还没有账号？
          <a href="https://dash.cloudflare.com/sign-up" target="_blank" class="text-primary hover:underline">立即注册</a>
        </p>
      </CardContent>
    </Card>
  </div>
</template>
