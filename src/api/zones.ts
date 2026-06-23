import { http } from './client'
import type { Zone } from '@/types/cloudflare'

export interface ListZonesParams {
  page?: number
  per_page?: number
  name?: string
  status?: string
  account_id?: string
}

export const zonesApi = {
  list: (params: ListZonesParams = {}) =>
    http.get<Zone[]>('/zones', { params: { page: params.page ?? 1, per_page: params.per_page ?? 50, ...params } }),

  get: (zoneId: string) => http.get<Zone>(`/zones/${zoneId}`),

  create: (name: string, account: { id: string }) =>
    http.post<Zone>('/zones', { body: { name, account } }),

  delete: (zoneId: string) => http.delete<Zone>(`/zones/${zoneId}`),

  /** 清除整个 zone 的缓存（或指定文件） */
  purgeCache: (zoneId: string, files?: string[]) =>
    http.post<{ id: string }>(`/zones/${zoneId}/purge_cache`, {
      body: files ? { files } : { purge_everything: true },
    }),

  /** 开发模式开关（true 开发模式跳过缓存） */
  setDevelopmentMode: (zoneId: string, enabled: boolean) =>
    http.patch<{ id: string; value: string }>(`/zones/${zoneId}/development_mode`, {
      body: { value: enabled ? 'on' : 'off' },
    }),
}
