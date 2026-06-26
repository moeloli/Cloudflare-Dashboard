import { http } from './client'
import { useAuthStore } from '@/stores/auth'

/* -------------------------------------------------------------------------- */
/*                                  类型                                       */
/* -------------------------------------------------------------------------- */

/** SSL 模式 */
export type SslMode = 'off' | 'flexible' | 'full' | 'strict'

/** 开关型设置返回值（on / off） */
export interface OnOffSetting {
  id: string
  value: 'on' | 'off'
  editable: boolean
  modified_on: string
}

export interface SslSetting {
  id: string
  value: SslMode
  editable: boolean
  modified_on: string
  certificate_status?: string
}

/** 证书包内的单个证书 */
export interface CertificatePackCert {
  id: string
  hosts: string[]
  issuer: string
  signature: string
  status: string
  expires_on: string
  priority: number
}

/** 证书包（Universal / Custom / Advanced），来自 /ssl/certificate_packs */
export interface CertificatePack {
  id: string
  type: string
  hosts: string[]
  status: string
  validity_days?: number
  certificate_authority?: string
  validation_method?: string
  certificates: CertificatePackCert[]
}

/** WAF 访问规则 */
export interface FirewallAccessRule {
  id: string
  mode: 'block' | 'challenge' | 'whitelist' | 'js_challenge'
  notes: string
  configuration: { target: string; value: string }
  scope?: { type: string; name?: string; id?: string }
  created_on: string
  modified_on: string
}

/** 防火墙规则（zone 维度） */
export interface FirewallRule {
  id: string
  description?: string
  action: string
  filter: { expression: string; id?: string }
  priority?: number
  paused: boolean
}

/** WAF 规则集（account 维度） */
export interface WafRuleset {
  id: string
  name: string
  description?: string
  kind: string
  phase: string
  version?: string
  last_updated?: string
}

/** Page Rule 目标 */
export interface PageRuleTarget {
  target: 'url'
  constraint: { operator: 'matches'; value: string }
}

/** Page Rule 动作 */
export interface PageRuleAction {
  id: string
  value?: string
}

export interface PageRule {
  id: string
  targets: PageRuleTarget[]
  actions: PageRuleAction[]
  priority: number
  status: 'active' | 'disabled'
  created_on: string
  modified_on: string
}

export interface CacheRule {
  id: string
  description?: string
  expression?: string
  action?: string
  enabled?: boolean
  last_updated?: string
}

/* -------------------------------------------------------------------------- */
/*                                  API                                        */
/* -------------------------------------------------------------------------- */

/** 取当前账号 ID（account 维度调用） */
function accountId(): string {
  const acc = useAuthStore().currentAccount
  if (!acc) throw new Error('未登录')
  return acc.accountId
}

export const securityApi = {
  /* ----------------------------- SSL / 证书 ----------------------------- */

  getSslSetting: (zoneId: string) =>
    http.get<SslSetting>(`/zones/${zoneId}/settings/ssl`),

  setSslSetting: (zoneId: string, value: SslMode) =>
    http.patch<SslSetting>(`/zones/${zoneId}/settings/ssl`, { body: { value } }),

  getAlwaysUseHttps: (zoneId: string) =>
    http.get<OnOffSetting>(`/zones/${zoneId}/settings/always_use_https`),

  setAlwaysUseHttps: (zoneId: string, enabled: boolean) =>
    http.patch<OnOffSetting>(`/zones/${zoneId}/settings/always_use_https`, {
      body: { value: enabled ? 'on' : 'off' },
    }),

  getTls13: (zoneId: string) =>
    http.get<OnOffSetting>(`/zones/${zoneId}/settings/tls_1_3`),

  setTls13: (zoneId: string, enabled: boolean) =>
    http.patch<OnOffSetting>(`/zones/${zoneId}/settings/tls_1_3`, {
      body: { value: enabled ? 'on' : 'off' },
    }),

  /** 列出 zone 下所有证书包（Universal/Custom/Advanced），?status=all 返回全部状态 */
  listCerts: (zoneId: string) =>
    http.get<CertificatePack[]>(`/zones/${zoneId}/ssl/certificate_packs`, {
      params: { status: 'all' },
    }),

  /* --------------------------- WAF / 防火墙 ------------------------------ */

  listAccessRules: (zoneId: string) =>
    http.get<FirewallAccessRule[]>(`/zones/${zoneId}/firewall/access_rules/rules`),

  createAccessRule: (zoneId: string, data: {
    mode: FirewallAccessRule['mode']
    notes?: string
    configuration: { target: string; value: string }
  }) =>
    http.post<FirewallAccessRule>(`/zones/${zoneId}/firewall/access_rules/rules`, {
      body: data,
    }),

  deleteAccessRule: (zoneId: string, ruleId: string) =>
    http.delete<unknown>(`/zones/${zoneId}/firewall/access_rules/rules/${ruleId}`),

  listFirewallRules: (zoneId: string) =>
    http.get<FirewallRule[]>(`/zones/${zoneId}/firewall/rules`),

  listWafRulesets: (accountId: string) =>
    http.get<WafRuleset[]>(`/accounts/${accountId}/rulesets`, {
      params: { per_page: 50 },
    }),

  /* ------------------------------ 缓存规则 ------------------------------ */

  listPageRules: (zoneId: string) =>
    http.get<PageRule[]>(`/zones/${zoneId}/pagerules`),

  createPageRule: (zoneId: string, data: {
    targets: PageRuleTarget[]
    actions: PageRuleAction[]
    priority?: number
    status?: 'active' | 'disabled'
  }) =>
    http.post<PageRule>(`/zones/${zoneId}/pagerules`, {
      body: { targets: data.targets, actions: data.actions, priority: data.priority ?? 1, status: data.status ?? 'active' },
    }),

  deletePageRule: (zoneId: string, ruleId: string) =>
    http.delete<unknown>(`/zones/${zoneId}/pagerules/${ruleId}`),

  /** cache_rules 可能 404，做容错返回空数组 */
  listCacheRules: async (zoneId: string): Promise<CacheRule[]> => {
    try {
      return await http.get<CacheRule[]>(`/zones/${zoneId}/cache_rules`)
    } catch {
      return []
    }
  },
}

/* -------------------------------------------------------------------------- */
/*                       配置预设（zone settings 可编辑预设）                 */
/* -------------------------------------------------------------------------- */

/**
 * 配置预设：可编辑、可持久化保存的 zone settings 配置档。
 *
 * 设计要点（区别于初版只读两套固定方案）：
 * 1. SettingDef 是 CF 原生维度（代码内置不变）：每项的 id / 取值类型 / 可选值，
 *    是「单项调节」与「预设编辑」共用的元数据。
 * 2. Preset 只存 { [settingId]: value } 的值映射 + 名称，用户可自由增删改、改名、
 *    持久化到 localStorage（见 stores/presets.ts）。内置「速度优先」「安全优先」
 *    两个预设只读不可改不可删。
 * 3. 应用预设 = 并发 PATCH 该预设内全部已配置项；单项调节 = 直接 PATCH 单项。
 *    单项失败（套餐不支持等）不阻断其余，最终聚合成功/失败清单。
 *
 * CF API：PATCH /zones/{zoneId}/settings/{id} body {value}，取值经官方文档核对。
 */

/** 配置项的取值类型 */
export type SettingType = 'onoff' | 'select' | 'number' | 'minify' | 'security_level'

/** CF 原生维度：单个配置项的元数据（代码内置，不变） */
export interface SettingDef {
  /** CF zone setting id，即端点 /zones/{id}/settings/{id} 的 {id} */
  id: string
  /** 中文标签 */
  label: string
  /** 取值类型 */
  type: SettingType
  /** select / security_level 类型的可选值（CF 允许的取值） */
  options?: string[]
  /** number 类型的可选值（CF 枚举型数字，如 browser_cache_ttl/challenge_ttl）；为空表示任意整数 */
  numberOptions?: number[]
  /** 该项是否需 Pro 及以上套餐（仅 UI 提示，不阻断提交） */
  requiresPro?: boolean
  /** 分组（用于 UI 归类展示） */
  group: 'speed' | 'security' | 'ssl' | 'cache'
}

/** 全部可配置项清单（按 CF 官方文档取值范围核对） */
export const SETTING_DEFS: SettingDef[] = [
  /* SSL */
  {
    id: 'ssl',
    label: 'SSL 模式',
    type: 'select',
    options: ['off', 'flexible', 'full', 'strict'],
    group: 'ssl',
  },
  { id: 'always_use_https', label: '强制 HTTPS', type: 'onoff', group: 'ssl' },
  { id: 'automatic_https_rewrites', label: 'HTTPS 自动重写', type: 'onoff', group: 'ssl' },
  { id: 'tls_1_3', label: 'TLS 1.3', type: 'select', options: ['on', 'off', 'zrt'], group: 'ssl' },
  { id: 'opportunistic_encryption', label: '机会性加密', type: 'onoff', group: 'ssl' },
  { id: 'min_tls_version', label: '最低 TLS 版本', type: 'select', options: ['1.0', '1.1', '1.2', '1.3'], group: 'ssl' },

  /* 安全 */
  {
    id: 'security_level',
    label: '安全级别',
    type: 'security_level',
    options: ['off', 'essentially_off', 'low', 'medium', 'high', 'under_attack'],
    group: 'security',
  },
  {
    id: 'challenge_ttl',
    label: '访客验证 TTL',
    type: 'number',
    numberOptions: [300, 900, 1800, 2700, 3600, 7200, 10800, 14400, 28800, 57600, 86400, 604800, 2592000, 31536000],
    group: 'security',
  },
  { id: 'browser_check', label: '浏览器完整性检查', type: 'onoff', group: 'security' },
  { id: 'hotlink_protection', label: '防盗链保护', type: 'onoff', group: 'security' },

  /* 缓存 */
  {
    id: 'cache_level',
    label: '缓存级别',
    type: 'select',
    options: ['off', 'simplified', 'aggressive', 'basic'],
    group: 'cache',
  },
  {
    id: 'browser_cache_ttl',
    label: '浏览器缓存 TTL',
    type: 'number',
    numberOptions: [0, 30, 60, 300, 1200, 1800, 3600, 7200, 10800, 14400, 28800, 57600, 86400, 259200, 604800, 2592000, 31536000],
    group: 'cache',
  },
  {
    id: 'polish',
    label: '图片优化',
    type: 'select',
    options: ['off', 'lossless', 'lossy'],
    requiresPro: true,
    group: 'cache',
  },

  /* 速度 */
  { id: 'minify', label: '资源压缩', type: 'minify', group: 'speed' },
  { id: 'brotli', label: 'Brotli 压缩', type: 'onoff', group: 'speed' },
  { id: 'early_hints', label: 'Early Hints', type: 'onoff', group: 'speed' },
  { id: 'http3', label: 'HTTP/3 (QUIC)', type: 'onoff', requiresPro: true, group: 'speed' },
  { id: '0rtt', label: '0-RTT 连接恢复', type: 'onoff', group: 'speed' },
]

/** minify 类型值的形状 */
export interface MinifyValue {
  html: 'on' | 'off'
  css: 'on' | 'off'
  js: 'on' | 'off'
}

/** 单个配置项的值（on/off 字符串、枚举、数字或 minify 对象） */
export type SettingValue = string | number | MinifyValue | boolean

/** 按 id 查 SettingDef */
const SETTING_DEF_MAP: Record<string, SettingDef> = Object.fromEntries(
  SETTING_DEFS.map((d) => [d.id, d]),
)

export function getSettingDef(id: string): SettingDef | undefined {
  return SETTING_DEF_MAP[id]
}

/** 一个配置预设方案（用户可编辑、可持久化） */
export interface OptimizationPreset {
  /** 预设唯一 id：内置用 'builtin:speed'/'builtin:security'；用户预设用 'user_xxx' */
  id: string
  /** 方案名（用户预设可改名） */
  name: string
  /** 是否内置（内置只读不可改不可删） */
  builtin: boolean
  /** 一句话描述（内置有；用户可选） */
  description?: string
  /** 警示文案（可选） */
  warning?: string
  /** 配置项值映射：仅记录已配置的项；未列出的 id 表示该预设不动它 */
  settings: Record<string, SettingValue>
}

/** 内置「速度优先」预设（只读种子） */
export const SPEED_PRESET: OptimizationPreset = {
  id: 'builtin:speed',
  name: '速度优先',
  builtin: true,
  description: '激进缓存 + 全面压缩，最大化访问速度',
  warning:
    'SSL 设为「灵活」模式时 CF→源站为明文回源，仅适合源站不支持 HTTPS 的场景；源站支持 HTTPS 建议改用「完全」或「完全(严格)」',
  settings: {
    security_level: 'low',
    ssl: 'flexible',
    cache_level: 'aggressive',
    browser_cache_ttl: 31536000,
    polish: 'lossless',
    minify: { html: 'on', css: 'on', js: 'on' },
    brotli: 'on',
    early_hints: 'on',
    http3: 'on',
  },
}

/** 内置「安全优先」预设（只读种子） */
export const SECURITY_PRESET: OptimizationPreset = {
  id: 'builtin:security',
  name: '安全优先',
  builtin: true,
  description: '严格 TLS + 强制 HTTPS + 防护加固，牺牲部分速度换安全',
  settings: {
    security_level: 'high',
    ssl: 'strict',
    always_use_https: 'on',
    automatic_https_rewrites: 'on',
    tls_1_3: 'on',
    opportunistic_encryption: 'on',
    min_tls_version: '1.2',
    cache_level: 'basic',
    browser_cache_ttl: 14400,
    challenge_ttl: 1800,
    browser_check: 'on',
    hotlink_protection: 'on',
  },
}

/** 全部内置预设（用户预设由 stores/presets.ts 持久化合并） */
export const BUILTIN_PRESETS: OptimizationPreset[] = [SPEED_PRESET, SECURITY_PRESET]

/** 单项应用结果 */
export interface PresetItemResult {
  id: string
  ok: boolean
  error?: string
}

/** 应用一个预设方案：并发 PATCH 该预设全部已配置项，单项失败不阻断。
 *  @param onProgress 每完成一项回调（用于 UI 实时刷新） */
export async function applyOptimizationPreset(
  zoneId: string,
  preset: OptimizationPreset,
  onProgress?: (r: PresetItemResult) => void,
): Promise<PresetItemResult[]> {
  const entries = Object.entries(preset.settings)
  const results = await Promise.all(
    entries.map(async ([id, value]) => {
      try {
        await http.patch(`/zones/${zoneId}/settings/${id}`, { body: { value } })
        const r: PresetItemResult = { id, ok: true }
        onProgress?.(r)
        return r
      } catch (e) {
        const r: PresetItemResult = {
          id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }
        onProgress?.(r)
        return r
      }
    }),
  )
  return results
}

/** 读取某 zone 的全部 zone settings 当前值（GET /zones/{id}/settings 列表端点） */
export interface ZoneSettingItem {
  id: string
  value: SettingValue
  editable: boolean
  modified_on: string | null
}

export async function listZoneSettings(zoneId: string): Promise<ZoneSettingItem[]> {
  return http.get<ZoneSettingItem[]>(`/zones/${zoneId}/settings`)
}

/** 单项应用：直接 PATCH 单个 setting（用于「单项调节」实时保存） */
export async function applySingleSetting(
  zoneId: string,
  id: string,
  value: SettingValue,
): Promise<void> {
  await http.patch(`/zones/${zoneId}/settings/${id}`, { body: { value } })
}

/** 暴露当前 account id（account 维度查询用） */
export function currentAccountId(): string {
  return accountId()
}
