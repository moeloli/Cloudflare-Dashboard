import { http, authHeaders } from './client'
import { useAuthStore } from '@/stores/auth'
import type { WorkerDomain, WorkerRoute, WorkersSubdomain } from '@/types/cloudflare'

const BASE = '/api/cf/client/v4'

/** 取当前账号的 Cloudflare account id（account 维度调用的前缀） */
function accountId(): string {
  const acc = useAuthStore().currentAccount
  if (!acc) throw new Error('未登录')
  return acc.accountId
}

export interface WorkerScriptMeta {
  id: string
  etag: string
  modified_on: string
  created_on: string
  usage_model: string
  handlers: string[]
}

export const workersApi = {
  /** 列出账号下所有 Worker 脚本元数据 */
  listScripts: () => http.get<WorkerScriptMeta[]>(`/accounts/${accountId()}/workers/scripts`),

  /** 读取脚本源码（返回纯文本） */
  getScriptContent: async (scriptName: string): Promise<string> => {
    const res = await fetch(
      `${BASE}/accounts/${accountId()}/workers/scripts/${scriptName}`,
      { headers: { ...authHeaders(), Accept: 'application/javascript' } },
    )
    if (!res.ok) throw new Error(`读取脚本失败（HTTP ${res.status}）`)
    return res.text()
  },

  /**
   * 上传/更新脚本（ES Module 格式）。
   *
   * CF Upload Worker Module 端点要求 multipart/form-data：
   *   - part `metadata`（application/json）：{ main_module, compatibility_date }
   *   - part 名 = main_module 的值（application/javascript+module）：脚本源码
   * 顶层 Content-Type 由 FormData 自动设为 multipart/form-data，禁止手动指定。
   */
  uploadScript: async (scriptName: string, script: string): Promise<void> => {
    const mainModule = 'worker.js'
    const form = new FormData()
    form.append(
      'metadata',
      new Blob(
        [JSON.stringify({ main_module: mainModule, compatibility_date: '2024-11-01' })],
        { type: 'application/json' },
      ),
    )
    form.append(
      mainModule,
      new Blob([script], { type: 'application/javascript+module' }),
    )
    const res = await fetch(
      `${BASE}/accounts/${accountId()}/workers/scripts/${scriptName}`,
      {
        method: 'PUT',
        headers: authHeaders(),
        body: form,
      },
    )
    if (!res.ok) {
      const d = await res.json().catch(() => null)
      throw new Error(d?.errors?.[0]?.message ?? `上传失败（HTTP ${res.status}）`)
    }
  },

  deleteScript: (scriptName: string) =>
    http.delete<void>(`/accounts/${accountId()}/workers/scripts/${scriptName}`),

  /* ---------- workers.dev 子域 ---------- */

  getSubdomain: () => http.get<WorkersSubdomain>(`/accounts/${accountId()}/workers/subdomain`),

  getSubdomainStatus: (scriptName: string) =>
    http.get<{ enabled: boolean }>(`/accounts/${accountId()}/workers/scripts/${scriptName}/subdomain`),

  setSubdomainStatus: (scriptName: string, enabled: boolean) =>
    http.post<unknown>(`/accounts/${accountId()}/workers/scripts/${scriptName}/subdomain`, {
      body: { enabled },
    }),

  /* ---------- 路由（zone 维度） ---------- */

  listRoutes: (zoneId: string) => http.get<WorkerRoute[]>(`/zones/${zoneId}/workers/routes`),

  createRoute: (zoneId: string, pattern: string, script: string) =>
    http.post<WorkerRoute>(`/zones/${zoneId}/workers/routes`, { body: { pattern, script } }),

  deleteRoute: (zoneId: string, routeId: string) =>
    http.delete<WorkerRoute>(`/zones/${zoneId}/workers/routes/${routeId}`),

  /* ---------- 自定义域（account 维度） ---------- */

  listDomains: () => http.get<WorkerDomain[]>(`/accounts/${accountId()}/workers/domains`),

  createDomain: (data: { hostname: string; service: string; environment?: string; zone_id: string }) =>
    http.post<WorkerDomain>(`/accounts/${accountId()}/workers/domains`, {
      body: { environment: 'production', ...data },
    }),

  deleteDomain: (domainId: string) =>
    http.delete<WorkerDomain>(`/accounts/${accountId()}/workers/domains/${domainId}`),
}
