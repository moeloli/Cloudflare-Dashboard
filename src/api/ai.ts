import { http } from './client'
import { useAuthStore } from '@/stores/auth'
import type { AIModel } from '@/types/cloudflare'

function accountId(): string {
  const acc = useAuthStore().currentAccount
  if (!acc) throw new Error('未登录')
  return acc.accountId
}

/** 文本类推理响应：Workers AI 非流式返回 { result: { response: string } } */
export interface AIChatResult {
  response: string
}

/** 图像类推理响应：Accept: application/json 时返回 { result: { image: base64 } } */
export interface AIImageResult {
  image: string
}

/** 嵌入向量响应 */
export interface AIEmbeddingResult {
  data: number[][]
  shape: number[]
}

/** 推理请求体：根据模型任务类型选用 messages 或 prompt */
export type AIRunBody =
  | { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; temperature?: number; max_tokens?: number; stream?: false }
  | { prompt: string; temperature?: number; max_tokens?: number; stream?: false }

/** 文本类模型任务类型集合 */
const TEXT_TASKS = new Set(['Text Generation', 'Summarization', 'Translation', 'Text Classification', 'Text-to-Text'])

/** 判断是否文本类模型 */
export function isTextModel(m: AIModel): boolean {
  return TEXT_TASKS.has(m.task?.type)
}

/** 判断是否图像生成模型 */
export function isImageModel(m: AIModel): boolean {
  return m.task?.type === 'Text-to-Image'
}

export const aiApi = {
  /** 列出账号可用 Workers AI 模型 */
  listModels: () =>
    http.get<AIModel[]>(`/accounts/${accountId()}/ai/models/search`, {
      params: { per_page: 200 },
    }),

  /** 运行模型（非流式）。文本类返回 AIChatResult，图像类返回 AIImageResult。 */
  runModel: <T = unknown>(model: string, body: AIRunBody, accept?: string): Promise<T> =>
    http.post<T>(`/accounts/${accountId()}/ai/run/${model}`, { body, accept }),
}
