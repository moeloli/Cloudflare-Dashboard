<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Copy, Globe, RefreshCw, Search, Wrench } from '@lucide/vue'
import { http } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

/* ===================== 公共：复制 ===================== */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('已复制')
  } catch {
    toast.error('复制失败，请手动选择')
  }
}

/* ===================== 工具 1：CF IP 列表 ===================== */
interface CFIps {
  ipv4_cidrs: string[]
  ipv6_cidrs: string[]
}
const ips = ref<CFIps | null>(null)
const ipLoading = ref(false)

async function loadIps() {
  ipLoading.value = true
  try {
    ips.value = await http.get<CFIps>('/ips', { noAuth: true })
  } catch (e) {
    toast.error('获取 Cloudflare IP 列表失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    ipLoading.value = false
  }
}

onMounted(loadIps)

function copyAllIps() {
  if (!ips.value) return
  copy([...ips.value.ipv4_cidrs, ...ips.value.ipv6_cidrs].join('\n'))
}

/* ===================== 工具 2：DNS 查询（DoH） ===================== */
const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'] as const
const dnsName = ref('')
const dnsType = ref<(typeof DNS_TYPES)[number]>('A')
const dnsLoading = ref(false)
const dnsAnswer = ref<string | null>(null)
const dnsStatus = ref<number | null>(null)

async function doDnsQuery() {
  const name = dnsName.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!name) {
    toast.error('请输入域名')
    return
  }
  dnsLoading.value = true
  dnsAnswer.value = null
  dnsStatus.value = null
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${dnsType.value}`
    const res = await fetch(url, { headers: { accept: 'application/dns-json' } })
    dnsStatus.value = res.status
    if (!res.ok) {
      dnsAnswer.value = `请求失败：HTTP ${res.status}`
      return
    }
    const data = await res.json()
    if (!Array.isArray(data.Answer) || data.Answer.length === 0) {
      dnsAnswer.value = '无解析记录'
      return
    }
    dnsAnswer.value = data.Answer
      .map((a: { name: string; type: number; TTL: number; data: string }) => `${a.name}\t${a.type}\tIN\tTTL ${a.TTL}\t${a.data}`)
      .join('\n')
  } catch {
    dnsAnswer.value = 'DoH 请求失败：可能被浏览器 CORS 限制。请在 cloudflare-dns.com 允许跨域的环境下使用，或改用命令行 dig。'
  } finally {
    dnsLoading.value = false
  }
}

/* ===================== 工具 3：HTTP 头检测 ===================== */
const httpUrl = ref('')
const httpLoading = ref(false)
const httpHeaders = ref<[string, string][] | null>(null)
const httpError = ref<string | null>(null)

async function doHeaderCheck() {
  const url = httpUrl.value.trim()
  if (!url) {
    toast.error('请输入 URL')
    return
  }
  if (!/^https?:\/\//i.test(url)) {
    toast.error('URL 需以 http:// 或 https:// 开头')
    return
  }
  httpLoading.value = true
  httpHeaders.value = null
  httpError.value = null
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors' })
    const entries: [string, string][] = []
    res.headers.forEach((value, key) => entries.push([key, value]))
    httpHeaders.value = entries
    if (!entries.length) {
      httpError.value = '响应头为空：可能因 CORS 限制无法读取（多数浏览器只暴露部分简单响应头）。'
    }
  } catch {
    httpError.value = '请求失败：可能因 CORS 限制或目标不可达。浏览器跨域无法读取响应头时属正常现象。'
  } finally {
    httpLoading.value = false
  }
}

/* ===================== 工具 4：UUID / Base64 / 时间戳 ===================== */
// UUID
const uuidResult = ref('')

function genUuid(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
}

function genUuid5() {
  uuidResult.value = Array.from({ length: 5 }, genUuid).join('\n')
}

// Base64
const b64Input = ref('')
const b64Output = ref('')
const b64Error = ref('')

function b64Encode() {
  b64Error.value = ''
  try {
    b64Output.value = btoa(unescape(encodeURIComponent(b64Input.value)))
  } catch {
    b64Error.value = '编码失败'
    b64Output.value = ''
  }
}

function b64Decode() {
  b64Error.value = ''
  try {
    b64Output.value = decodeURIComponent(escape(atob(b64Input.value.trim())))
  } catch {
    b64Error.value = '解码失败：非合法 Base64 字符串'
    b64Output.value = ''
  }
}

// 时间戳
const tsInput = ref(String(Math.floor(Date.now() / 1000)))
const dateFromTs = ref('')
const dateInput = ref(new Date().toISOString().slice(0, 19))
const tsFromDate = ref('')

function tsToDate() {
  const n = Number(tsInput.value.trim())
  if (!Number.isFinite(n)) {
    toast.error('请输入有效数字时间戳')
    return
  }
  const ms = n < 1e12 ? n * 1000 : n
  dateFromTs.value = new Date(ms).toLocaleString('zh-CN', { hour12: false }) + '\n' + new Date(ms).toISOString()
}

function dateToTs() {
  const d = new Date(dateInput.value)
  if (Number.isNaN(d.getTime())) {
    toast.error('日期格式无法解析')
    return
  }
  tsFromDate.value = `秒：${Math.floor(d.getTime() / 1000)}\n毫秒：${d.getTime()}`
}

const nowTs = computed(() => Math.floor(Date.now() / 1000))
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">工具箱</h1>
        <p class="text-sm text-muted-foreground">常用网络与编码小工具，本地即可使用</p>
      </div>
      <Badge variant="secondary" class="gap-1">
        <Wrench class="size-3" />
        本地工具
      </Badge>
    </div>

    <Tabs default-value="ip" class="w-full">
      <TabsList class="grid w-full grid-cols-2 sm:grid-cols-4">
        <TabsTrigger value="ip">CF IP 列表</TabsTrigger>
        <TabsTrigger value="dns">DNS 查询</TabsTrigger>
        <TabsTrigger value="http">HTTP 头检测</TabsTrigger>
        <TabsTrigger value="convert">转换工具</TabsTrigger>
      </TabsList>

      <!-- CF IP 列表 -->
      <TabsContent value="ip">
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <div>
                <CardTitle class="flex items-center gap-2">
                  <Globe class="size-4" /> Cloudflare IP 段
                </CardTitle>
                <CardDescription>公开端点，列出 Cloudflare 边缘网络 IP 段（IPv4 / IPv6）</CardDescription>
              </div>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" :disabled="ipLoading" @click="loadIps">
                  <RefreshCw class="size-4" :class="{ 'animate-spin': ipLoading }" />
                  刷新
                </Button>
                <Button v-if="ips" variant="outline" size="sm" @click="copyAllIps">
                  <Copy class="size-4" />
                  复制全部
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent v-if="ips" class="grid gap-4 md:grid-cols-2">
            <div>
              <h3 class="mb-2 text-sm font-medium">IPv4 ({{ ips.ipv4_cidrs.length }})</h3>
              <ScrollArea class="h-72 rounded-md border p-2">
                <div class="space-y-1 font-mono text-xs">
                  <div
                    v-for="ip in ips.ipv4_cidrs"
                    :key="ip"
                    class="flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-muted"
                    @click="copy(ip)"
                  >
                    <span>{{ ip }}</span>
                    <Copy class="size-3 text-muted-foreground" />
                  </div>
                </div>
              </ScrollArea>
            </div>
            <div>
              <h3 class="mb-2 text-sm font-medium">IPv6 ({{ ips.ipv6_cidrs.length }})</h3>
              <ScrollArea class="h-72 rounded-md border p-2">
                <div class="space-y-1 font-mono text-xs">
                  <div
                    v-for="ip in ips.ipv6_cidrs"
                    :key="ip"
                    class="flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-muted"
                    @click="copy(ip)"
                  >
                    <span>{{ ip }}</span>
                    <Copy class="size-3 text-muted-foreground" />
                  </div>
                </div>
              </ScrollArea>
            </div>
          </CardContent>
          <CardContent v-else class="py-10 text-center text-sm text-muted-foreground">
            正在加载…
          </CardContent>
        </Card>
      </TabsContent>

      <!-- DNS 查询 -->
      <TabsContent value="dns">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Search class="size-4" /> DNS 查询（Cloudflare DoH）
            </CardTitle>
            <CardDescription>通过 Cloudflare DNS over HTTPS 解析域名记录</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row">
              <Input
                v-model="dnsName"
                placeholder="example.com"
                class="font-mono"
                autocomplete="off"
                @keyup.enter="doDnsQuery"
              />
              <Select v-model="dnsType">
                <SelectTrigger class="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="t in DNS_TYPES" :key="t" :value="t">{{ t }}</SelectItem>
                </SelectContent>
              </Select>
              <Button :disabled="dnsLoading" @click="doDnsQuery">
                <Search class="size-4" />
                {{ dnsLoading ? '查询中…' : '查询' }}
              </Button>
            </div>
            <div v-if="dnsStatus" class="text-xs text-muted-foreground">响应状态：HTTP {{ dnsStatus }}</div>
            <Textarea
              v-if="dnsAnswer"
              :model-value="dnsAnswer"
              readonly
              class="font-mono text-xs"
              :rows="8"
            />
            <p class="text-xs text-muted-foreground">
              注：DoH 直连 cloudflare-dns.com，若浏览器 CORS 拦截将无法返回结果。
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- HTTP 头检测 -->
      <TabsContent value="http">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Globe class="size-4" /> HTTP 响应头检测
            </CardTitle>
            <CardDescription>请求目标 URL 并展示响应头（受浏览器 CORS 限制）</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row">
              <Input
                v-model="httpUrl"
                placeholder="https://example.com"
                class="font-mono"
                autocomplete="off"
                @keyup.enter="doHeaderCheck"
              />
              <Button :disabled="httpLoading" @click="doHeaderCheck">
                <Search class="size-4" />
                {{ httpLoading ? '检测中…' : '检测' }}
              </Button>
            </div>
            <div v-if="httpError" class="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              {{ httpError }}
            </div>
            <ScrollArea v-if="httpHeaders && httpHeaders.length" class="h-72 rounded-md border">
              <table class="w-full text-xs">
                <tbody>
                  <tr
                    v-for="([k, v], i) in httpHeaders"
                    :key="k + i"
                    class="border-b last:border-0 hover:bg-muted/40"
                  >
                    <td class="whitespace-nowrap px-3 py-2 align-top font-mono font-medium">{{ k }}</td>
                    <td class="break-all px-3 py-2 font-mono text-muted-foreground">{{ v }}</td>
                  </tr>
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- 转换工具 -->
      <TabsContent value="convert">
        <div class="grid gap-4 lg:grid-cols-3">
          <!-- UUID -->
          <Card>
            <CardHeader>
              <CardTitle class="text-base">UUID 生成</CardTitle>
              <CardDescription>生成符合 RFC 4122 v4 的随机 UUID</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <Button size="sm" class="w-full" @click="genUuid5">
                生成 5 个 UUID
              </Button>
              <Textarea
                v-if="uuidResult"
                :model-value="uuidResult"
                readonly
                class="font-mono text-xs"
                :rows="6"
              />
            </CardContent>
          </Card>

          <!-- Base64 -->
          <Card>
            <CardHeader>
              <CardTitle class="text-base">Base64 编解码</CardTitle>
              <CardDescription>支持 UTF-8 文本的安全编解码</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <Textarea
                v-model="b64Input"
                placeholder="输入文本…"
                class="font-mono text-xs"
                :rows="3"
              />
              <div class="flex gap-2">
                <Button size="sm" variant="outline" class="flex-1" @click="b64Encode">编码</Button>
                <Button size="sm" variant="outline" class="flex-1" @click="b64Decode">解码</Button>
              </div>
              <Textarea
                v-if="b64Output"
                :model-value="b64Output"
                readonly
                class="font-mono text-xs"
                :rows="3"
              />
              <p v-if="b64Error" class="text-xs text-destructive">{{ b64Error }}</p>
            </CardContent>
          </Card>

          <!-- 时间戳 -->
          <Card>
            <CardHeader>
              <CardTitle class="text-base">Unix 时间戳转换</CardTitle>
              <CardDescription>当前时间戳：{{ nowTs }}</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="space-y-2">
                <Label>时间戳 → 日期</Label>
                <Input v-model="tsInput" class="font-mono text-xs" />
                <Button size="sm" variant="outline" class="w-full" @click="tsToDate">转换</Button>
                <Textarea
                  v-if="dateFromTs"
                  :model-value="dateFromTs"
                  readonly
                  class="font-mono text-xs"
                  :rows="2"
                />
              </div>
              <div class="space-y-2">
                <Label>日期 → 时间戳</Label>
                <Input v-model="dateInput" type="datetime-local" class="font-mono text-xs" />
                <Button size="sm" variant="outline" class="w-full" @click="dateToTs">转换</Button>
                <Textarea
                  v-if="tsFromDate"
                  :model-value="tsFromDate"
                  readonly
                  class="font-mono text-xs"
                  :rows="2"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
