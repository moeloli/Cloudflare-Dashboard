<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import {
  RefreshCw,
  Send,
  Sparkles,
  ImageIcon,
  Bot,
  User,
  Trash2,
  AlertCircle,
  Info,
} from '@lucide/vue'
import { aiApi, isImageModel, isTextModel, type AIRunBody } from '@/api/ai'
import type { AIModel } from '@/types/cloudflare'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/** 任务类型 → 中文标签 */
const TASK_LABELS: Record<string, string> = {
  'Text Generation': '文本生成',
  'Text-to-Image': '文生图',
  'Text-to-Text': '文本到文本',
  Summarization: '摘要',
  Translation: '翻译',
  'Text Classification': '文本分类',
  Embedding: '嵌入向量',
  'Speech Recognition': '语音识别',
  'Text-to-Speech': '语音合成',
  'Image Classification': '图像分类',
  'Object Detection': '目标检测',
}

function taskLabel(t: string): string {
  return TASK_LABELS[t] ?? t
}

/** 任务类型排序优先级（文本生成优先展示） */
const TASK_ORDER: string[] = [
  'Text Generation',
  'Text-to-Text',
  'Summarization',
  'Translation',
  'Text Classification',
  'Text-to-Image',
  'Embedding',
  'Text-to-Speech',
  'Speech Recognition',
  'Image Classification',
  'Object Detection',
]

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatSession {
  messages: ChatMessage[]
  systemPrompt: string
  temperature: number
  maxTokens: number
}

const DEFAULT_SESSION: ChatSession = {
  messages: [],
  systemPrompt: '',
  temperature: 0.6,
  maxTokens: 1024,
}

const SESSION_KEY = (id: string) => `cf-ai-session:${id}`

const models = ref<AIModel[]>([])
const loading = ref(true)
const selected = ref<AIModel | null>(null)

const keyword = ref('')

/** 按任务类型分组（保留 TASK_ORDER 顺序，未列入的追加在末尾） */
const groupedModels = computed<[string, AIModel[]][]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  const filtered = models.value.filter((m) => {
    if (!kw) return true
    return (
      m.id.toLowerCase().includes(kw) ||
      m.name.toLowerCase().includes(kw) ||
      (m.description ?? '').toLowerCase().includes(kw)
    )
  })
  const map = new Map<string, AIModel[]>()
  for (const m of filtered) {
    const t = m.task?.type ?? '其他'
    if (!map.has(t)) map.set(t, [])
    map.get(t)!.push(m)
  }
  const ordered: [string, AIModel[]][] = []
  for (const t of TASK_ORDER) {
    if (map.has(t)) {
      ordered.push([t, map.get(t)!])
      map.delete(t)
    }
  }
  for (const [t, list] of map) ordered.push([t, list])
  return ordered
})

/* ---------- 会话状态 ---------- */
const session = ref<ChatSession>({ ...DEFAULT_SESSION })
const input = ref('')
const sending = ref(false)

const imagePrompt = ref('')
const imageData = ref<string | null>(null) // base64（无 data: 前缀）
const imageSending = ref(false)

const chatScrollRef = ref<HTMLElement | null>(null)

function loadSession(id: string) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY(id))
    if (raw) {
      session.value = { ...DEFAULT_SESSION, ...JSON.parse(raw) }
      return
    }
  } catch {
    /* ignore */
  }
  session.value = { ...DEFAULT_SESSION }
}

function persistSession() {
  if (!selected.value) return
  try {
    sessionStorage.setItem(SESSION_KEY(selected.value.id), JSON.stringify(session.value))
  } catch {
    /* ignore */
  }
}

watch(selected, (m) => {
  if (!m) return
  loadSession(m.id)
  imageData.value = null
  imagePrompt.value = ''
})

watch(
  () => [session.value.systemPrompt, session.value.temperature, session.value.maxTokens],
  persistSession,
)

const canChat = computed(() => !!selected.value && isTextModel(selected.value))
const canImage = computed(() => !!selected.value && isImageModel(selected.value))

async function load() {
  loading.value = true
  try {
    models.value = await aiApi.listModels()
    if (models.value.length && !selected.value) {
      const firstText = models.value.find(isTextModel) ?? models.value[0]
      selected.value = firstText
    }
  } catch (e) {
    toast.error('加载 AI 模型失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    loading.value = false
  }
}

onMounted(load)

function scrollToBottom() {
  nextTick(() => {
    const el = chatScrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function send() {
  if (!selected.value || !canChat.value) return
  const text = input.value.trim()
  if (!text || sending.value) return

  session.value.messages.push({ role: 'user', content: text })
  input.value = ''
  sending.value = true
  await scrollToBottom()

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
  if (session.value.systemPrompt.trim()) {
    messages.push({ role: 'system', content: session.value.systemPrompt.trim() })
  }
  for (const m of session.value.messages) {
    messages.push({ role: m.role, content: m.content })
  }

  const body: AIRunBody = {
    messages,
    temperature: session.value.temperature,
    max_tokens: session.value.maxTokens,
    stream: false,
  }

  try {
    const res = await aiApi.runModel<{ response: string }>(selected.value.id, body)
    session.value.messages.push({ role: 'assistant', content: res.response ?? '' })
    persistSession()
    await scrollToBottom()
  } catch (e) {
    toast.error('推理失败', { description: e instanceof Error ? e.message : String(e) })
    session.value.messages.pop()
  } finally {
    sending.value = false
  }
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (canImage.value) generateImage()
    else send()
  }
}

async function generateImage() {
  if (!selected.value || !canImage.value) return
  const p = imagePrompt.value.trim()
  if (!p || imageSending.value) return
  imageSending.value = true
  imageData.value = null
  try {
    const res = await aiApi.runModel<{ image: string }>(
      selected.value.id,
      { prompt: p },
      'application/json',
    )
    if (!res?.image) throw new Error('模型未返回图像数据')
    imageData.value = res.image
  } catch (e) {
    toast.error('图像生成失败', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    imageSending.value = false
  }
}

function clearChat() {
  session.value.messages = []
  persistSession()
}

function clearImage() {
  imageData.value = null
}
</script>

<template>
  <div class="flex h-[calc(100vh-7rem)] flex-col gap-4">
    <!-- 顶部 -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Sparkles class="size-5 text-primary" />
          AI Playground
        </h1>
        <p class="text-sm text-muted-foreground">
          调用 Cloudflare Workers AI，在边缘运行大模型推理
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="loading" @click="load">
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
        刷新
      </Button>
    </div>

    <!-- 计费提示 -->
    <div class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      <Info class="mt-0.5 size-4 shrink-0" />
      <span>
        Workers AI 按神经元使用量计费（文本类 10⁶ 单位 / 图像类每张）。免费额度内不产生费用，
        超出部分从账户余额扣费，请按需控制 max_tokens 与调用频率。
      </span>
    </div>

    <!-- 主体 -->
    <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
      <!-- 左侧模型列表 -->
      <Card class="flex min-h-0 flex-col">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm">模型</CardTitle>
          <Input v-model="keyword" placeholder="搜索模型…" class="h-8 text-xs" />
        </CardHeader>
        <CardContent class="min-h-0 flex-1 p-0">
          <ScrollArea class="h-full px-3 pb-3">
            <div v-if="loading" class="space-y-2">
              <Skeleton v-for="i in 8" :key="i" class="h-12 w-full" />
            </div>
            <div v-else-if="!groupedModels.length" class="px-2 py-8 text-center text-xs text-muted-foreground">
              未找到模型
            </div>
            <div v-else class="space-y-4">
              <div v-for="[task, list] in groupedModels" :key="task">
                <div class="sticky top-0 z-10 bg-background/80 px-1 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                  {{ taskLabel(task) }}
                  <span class="ml-1 text-muted-foreground/60">({{ list.length }})</span>
                </div>
                <div class="space-y-1">
                  <button
                    v-for="m in list"
                    :key="m.id"
                    type="button"
                    class="w-full rounded-md border px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-accent"
                    :class="selected?.id === m.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent'"
                    @click="selected = m"
                  >
                    <div class="truncate font-mono text-xs font-medium">{{ m.id }}</div>
                    <div class="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {{ m.description || '无描述' }}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <!-- 右侧交互区 -->
      <Card class="flex min-h-0 flex-col">
        <template v-if="!selected">
          <CardContent class="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div class="flex size-12 items-center justify-center rounded-full bg-muted">
              <Bot class="size-6" />
            </div>
            <div class="font-medium">选择左侧模型开始</div>
            <p class="text-sm">支持文本对话与文生图，模型按任务类型分组</p>
          </CardContent>
        </template>

        <template v-else>
          <!-- 模型头 -->
          <CardHeader class="border-b pb-3">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <CardTitle class="truncate font-mono text-base">{{ selected.id }}</CardTitle>
                <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{{ selected.description }}</p>
              </div>
              <Badge variant="secondary">{{ taskLabel(selected.task?.type ?? '其他') }}</Badge>
            </div>
          </CardHeader>

          <!-- 文本对话 -->
          <template v-if="canChat">
            <div class="flex min-h-0 flex-1 flex-col">
              <div ref="chatScrollRef" class="min-h-0 flex-1 overflow-y-auto p-4">
                <div v-if="!session.messages.length" class="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <div class="text-center">
                    <Bot class="mx-auto mb-2 size-8 text-muted-foreground/50" />
                    输入消息开始对话
                  </div>
                </div>
                <div v-else class="space-y-4">
                  <div
                    v-for="(msg, i) in session.messages"
                    :key="i"
                    class="flex gap-3"
                    :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'"
                  >
                    <div class="flex size-7 shrink-0 items-center justify-center rounded-full"
                      :class="msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'"
                    >
                      <User v-if="msg.role === 'user'" class="size-4" />
                      <Bot v-else class="size-4" />
                    </div>
                    <div class="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm"
                      :class="msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'"
                    >{{ msg.content }}</div>
                  </div>
                  <div v-if="sending" class="flex gap-3">
                    <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Bot class="size-4" />
                    </div>
                    <div class="rounded-2xl bg-muted px-3.5 py-2 text-sm text-muted-foreground">思考中…</div>
                  </div>
                </div>
              </div>

              <!-- 参数区 -->
              <div class="grid gap-2 border-t px-4 py-3 sm:grid-cols-3">
                <div class="space-y-1">
                  <Label class="text-xs">System Prompt</Label>
                  <Input v-model="session.systemPrompt" placeholder="（可选）" class="h-8 text-xs" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Temperature</Label>
                  <Input v-model.number="session.temperature" type="number" min="0" max="5" step="0.1" class="h-8 text-xs" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Max Tokens</Label>
                  <Input v-model.number="session.maxTokens" type="number" min="1" step="64" class="h-8 text-xs" />
                </div>
              </div>

              <!-- 输入区 -->
              <div class="flex items-end gap-2 border-t p-3">
                <Button variant="ghost" size="icon" title="清空对话" :disabled="!session.messages.length" @click="clearChat">
                  <Trash2 class="size-4" />
                </Button>
                <Textarea
                  v-model="input"
                  placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                  class="min-h-9 max-h-32 resize-none text-sm"
                  :disabled="sending"
                  @keydown="onInputKeydown"
                />
                <Button :disabled="!input.trim() || sending" @click="send">
                  <Send class="size-4" />
                </Button>
              </div>
            </div>
          </template>

          <!-- 图像生成 -->
          <template v-else-if="canImage">
            <div class="flex min-h-0 flex-1 flex-col">
              <div class="flex-1 overflow-y-auto p-4">
                <div v-if="!imageData" class="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <div class="text-center">
                    <ImageIcon class="mx-auto mb-2 size-8 text-muted-foreground/50" />
                    输入 Prompt 生成图像
                  </div>
                </div>
                <div v-else class="flex flex-col items-center gap-3">
                  <img :src="`data:image/png;base64,${imageData}`" alt="生成结果" class="max-h-[60vh] rounded-lg border" />
                  <Button variant="outline" size="sm" @click="clearImage">清除</Button>
                </div>
              </div>
              <div class="flex items-end gap-2 border-t p-3">
                <Textarea
                  v-model="imagePrompt"
                  placeholder="描述要生成的图像…"
                  class="min-h-9 max-h-32 resize-none text-sm"
                  :disabled="imageSending"
                  @keydown="onInputKeydown"
                />
                <Button :disabled="!imagePrompt.trim() || imageSending" @click="generateImage">
                  <ImageIcon class="size-4" />
                  {{ imageSending ? '生成中…' : '生成' }}
                </Button>
              </div>
            </div>
          </template>

          <!-- 暂不支持 -->
          <template v-else>
            <CardContent class="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <AlertCircle class="size-8" />
              <div class="font-medium">该模型类型暂不支持可视化交互</div>
              <p class="text-sm">嵌入向量、语音等模型请通过 Workers API 调用</p>
            </CardContent>
          </template>
        </template>
      </Card>
    </div>
  </div>
</template>
