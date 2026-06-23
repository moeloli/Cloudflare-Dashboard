import { http } from './client'
import type { DNSRecord, DNSRecordPayload } from '@/types/cloudflare'

export const dnsApi = {
  list: (zoneId: string, params: { type?: string; name?: string; content?: string; page?: number; per_page?: number } = {}) =>
    http.get<DNSRecord[]>(`/zones/${zoneId}/dns_records`, { params }),

  get: (zoneId: string, recordId: string) =>
    http.get<DNSRecord>(`/zones/${zoneId}/dns_records/${recordId}`),

  create: (zoneId: string, payload: DNSRecordPayload) =>
    http.post<DNSRecord>(`/zones/${zoneId}/dns_records`, { body: payload }),

  update: (zoneId: string, recordId: string, payload: Partial<DNSRecordPayload>) =>
    http.put<DNSRecord>(`/zones/${zoneId}/dns_records/${recordId}`, { body: payload }),

  delete: (zoneId: string, recordId: string) =>
    http.delete<DNSRecord>(`/zones/${zoneId}/dns_records/${recordId}`),

  /** 批量导入：逐条创建，返回每条结果 */
  importBatch: async (zoneId: string, records: DNSRecordPayload[]) => {
    const results: { record: DNSRecordPayload; ok: boolean; error?: string }[] = []
    for (const record of records) {
      try {
        await dnsApi.create(zoneId, record)
        results.push({ record, ok: true })
      } catch (e) {
        results.push({ record, ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return results
  },
}
