import { useAuthStore } from '@/stores/auth'
import type { CFResponse } from '@/types/cloudflare'

/**
 * Cloudflare API 客户端。
 *
 * 同源透传：所有请求发往 /api/cf/client/v4/...
 * - 本地开发：由 vite.config.ts 的 server.proxy 透传到 https://api.cloudflare.com
 * - 生产环境：由 Cloudflare Pages Functions（functions/api/cf）同源透传
 *
 * 认证凭据始终由浏览器持有（存 localStorage），随请求头透传，不在任何服务端落盘。
 */
const BASE = '/api/cf/client/v4'

export class CFError extends Error {
  code?: number
  status?: number
  constructor(message: string, code?: number, status?: number) {
    super(message)
    this.name = 'CFError'
    this.code = code
    this.status = status
  }
}

/** 构造认证头：Global API Key 用 X-Auth-Email/X-Auth-Key；API Token 用 Bearer */
function authHeaders(): Record<string, string> {
  const acc = useAuthStore().currentAccount
  if (!acc) throw new CFError('未登录 Cloudflare 账号', 401)
  if (acc.authType === 'token') return { Authorization: `Bearer ${acc.apiKey}` }
  return { 'X-Auth-Email': acc.email ?? '', 'X-Auth-Key': acc.apiKey }
}

export interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  /** 不带认证头（用于公开端点） */
  noAuth?: boolean
}

async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const url = new URL(BASE + path, globalThis.location.origin)
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!opts.noAuth) Object.assign(headers, authHeaders())

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch (e) {
    throw new CFError(
      `网络请求失败：${e instanceof Error ? e.message : String(e)}（请确认同源代理 /api/cf 可达）`,
    )
  }

  const text = await res.text()
  let data: CFResponse<T>
  try {
    data = JSON.parse(text) as CFResponse<T>
  } catch {
    throw new CFError(`响应解析失败（HTTP ${res.status}）`, undefined, res.status)
  }

  if (!res.ok || !data.success) {
    const msg = data.errors?.[0]?.message ?? `HTTP ${res.status}`
    throw new CFError(msg, data.errors?.[0]?.code, res.status)
  }
  return data.result as T
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, opts?: RequestOptions) => request<T>('POST', path, opts),
  put: <T>(path: string, opts?: RequestOptions) => request<T>('PUT', path, opts),
  patch: <T>(path: string, opts?: RequestOptions) => request<T>('PATCH', path, opts),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
}

/** GraphQL Analytics 端点（POST 文本 query） */
export async function graphql<T>(query: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  }
  const res = await fetch(new URL('/api/cf/client/v4/graphql', globalThis.location.origin), {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })
  const data = (await res.json()) as CFResponse<T>
  if (!res.ok || !data.success) {
    throw new CFError(data.errors?.[0]?.message ?? `HTTP ${res.status}`)
  }
  return data.result as T
}
