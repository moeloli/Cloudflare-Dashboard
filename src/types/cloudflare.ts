/**
 * Cloudflare API 资源类型定义
 * 仅包含当前已实现模块用到的类型，按需增量扩展。
 */

/** Cloudflare API 统一响应壳 */
export interface CFResponse<T> {
  result: T | null
  result_info?: unknown
  success: boolean
  errors: CFError[]
  messages: CFMessage[]
}

export interface CFError {
  code: number
  message: string
}

export interface CFMessage {
  code: number
  message: string
}

/** 分页信息 */
export interface ResultInfo {
  page: number
  per_page: number
  total_pages: number
  count: number
  total_count: number
}

export interface Paginated<T> {
  result: T[]
  result_info: ResultInfo
}

/* ---------- 账户 / Zone ---------- */

export interface CFAccount {
  id: string
  name: string
}

export interface Zone {
  id: string
  name: string
  status: string
  paused: boolean
  type: string
  development_mode: number
  name_servers: string[]
  original_name_servers: string[] | null
  original_registrar: string | null
  original_dnshost: string | null
  account: CFAccount
  permissions: string[]
  plan?: { id: string; name: string; legacy_id: number; is_subscribed: boolean; expiry: string | null }
  activated_on: string | null
  modified_on: string
}

/* ---------- DNS ---------- */

export type DNSRecordType =
  | 'A' | 'AAAA' | 'CAA' | 'CERT' | 'CNAME' | 'DNSKEY' | 'DS' | 'HTTPS'
  | 'LOC' | 'MX' | 'NAPTR' | 'NS' | 'PTR' | 'SMIMEA' | 'SRV' | 'SSHFP'
  | 'SVCB' | 'TLSA' | 'TXT' | 'URI'

export interface DNSRecord {
  id: string
  zone_id: string
  zone_name: string
  name: string
  type: DNSRecordType
  content: string
  priority?: number
  ttl: number
  proxied: boolean
  proxiable: boolean
  comment?: string
  tags?: string[]
  created_on: string
  modified_on: string
}

export interface DNSRecordPayload {
  type: DNSRecordType
  name: string
  content: string
  ttl?: number
  priority?: number
  proxied?: boolean
  comment?: string
  tags?: string[]
}

/* ---------- Workers ---------- */

export interface WorkerScript {
  id: string
  etag: string
  handlers: string[]
  modified_on: string
  created_on: string
  usage_model: string
}

export interface WorkerRoute {
  id: string
  pattern: string
  script: string
}

export interface WorkerDomain {
  id: string
  hostname: string
  service: string
  environment: string
  zone_id: string
  zone_name: string
}

export interface WorkersSubdomain {
  subdomain: string
  enabled: boolean
}

/* ---------- KV ---------- */

export interface KVNamespace {
  id: string
  title: string
  supports_url_encoding: boolean
  expires?: string
  created_on?: string
  modified_on?: string
}

export interface KVKey {
  name: string
  expiration?: number
  expiration_ttl?: number
  metadata?: unknown
}

/* ---------- R2 ---------- */

export interface R2Bucket {
  name: string
  creation_date: string
  location: 'apac' | 'eeur' | 'enam' | 'weur' | 'wnam' | 'auto'
  usage?: { payloadSize: number; uploadedBytes: string; uploadedPercent: number }
}

export interface R2Object {
  name: string
  size: number
  etag: string
  last_modified: string
  http_metadata?: Record<string, unknown>
}

/* ---------- D1 ---------- */

export interface D1Database {
  uuid: string
  name: string
  created_at: string
  file_size: number
}

export interface D1QueryResult {
  results: Record<string, unknown>[]
  success: boolean
  meta: Record<string, unknown>
}

/* ---------- Pages ---------- */

export interface PagesProject {
  name: string
  subdomain: string
  domains: string[]
  deployment_configs: Record<string, unknown>
  source?: { message: string }
  created_on: string
  modified_on: string
}

export interface PagesDeployment {
  id: string
  environment: 'production' | 'preview'
  created_on: string
  modified_on: string
  latest_stage: { name: string; status: string }
  source?: { message: string }
  deployment_trigger?: { metadata?: { commit_message?: string } }
}

/* ---------- SSL ---------- */

export interface SSLUniversal {
  enabled: boolean
  certificate_status: string
  validation_method?: string
  http_status: string
}

/* ---------- Analytics (GraphQL) ---------- */

export interface AnalyticsResponse {
  data: {
    viewer: Record<string, unknown>
  }
  errors?: CFError[]
}
