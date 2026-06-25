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
/*                          配置预设（zone settings 批量）                    */
/* -------------------------------------------------------------------------- */

/**
 * 配置预设：对齐 cococ.co「自动优化」，按方向批量应用一组 zone settings。
 * 取名「配置预设」——本质是预设方案 + 一键应用，并非真"自动"。
 *
 * 每项 = 一条 PATCH /zones/{zoneId}/settings/{id} body {value}。
 * 套餐差异（polish/http3/0rtt 等需 Pro）会让个别项失败，故逐项并发 + 单项容错，
 * 最终聚合成功/失败清单返回给 UI 展示。
 */

/** 预设中单个配置项 */
export interface PresetSetting {
  /** CF zone setting id，即端点 /zones/{id}/settings/{id} 的 {id} */
  id: string
  /** PATCH body 的 value（on/off 字符串、数字、ssl 枚举或 minify 对象） */
  value: unknown
  /** 展示给用户的中文标签 */
  label: string
}

/** 一个配置预设方案 */
export interface OptimizationPreset {
  key: 'speed' | 'security'
  /** 方案名 */
  name: string
  /** 一句话描述 */
  description: string
  /** 警示文案（可选，如 SSL flexible 风险提示） */
  warning?: string
  settings: PresetSetting[]
}

/** 速度优先预设（对齐 cococ speed 方向） */
export const SPEED_PRESET: OptimizationPreset = {
  key: 'speed',
  name: '速度优先',
  description: '激进缓存 + 全面压缩，最大化访问速度',
  warning:
    'SSL 设为「灵活」模式，CF→源站为明文回源，仅适合源站不支持 HTTPS 的场景；源站支持 HTTPS 建议改用「安全优先」',
  settings: [
    { id: 'security_level', value: 'low', label: '安全级别：低' },
    { id: 'ssl', value: 'flexible', label: 'SSL 模式：灵活' },
    { id: 'cache_level', value: 'aggressive', label: '缓存级别：积极' },
    { id: 'browser_cache_ttl', value: 31536000, label: '浏览器缓存：1 年' },
    { id: 'polish', value: 'lossless', label: '图片优化：无损' },
    { id: 'minify', value: { html: 'on', css: 'on', js: 'on' }, label: 'HTML/CSS/JS 压缩' },
    { id: 'brotli', value: 'on', label: 'Brotli 压缩' },
    { id: 'early_hints', value: 'on', label: 'Early Hints' },
    { id: 'http3', value: 'on', label: 'HTTP/3' },
  ],
}

/** 安全优先预设（对齐 cococ security 方向） */
export const SECURITY_PRESET: OptimizationPreset = {
  key: 'security',
  name: '安全优先',
  description: '严格 TLS + 强制 HTTPS + 防护加固，牺牲部分速度换安全',
  settings: [
    { id: 'security_level', value: 'high', label: '安全级别：高' },
    { id: 'ssl', value: 'strict', label: 'SSL 模式：严格' },
    { id: 'always_use_https', value: 'on', label: '强制 HTTPS' },
    { id: 'automatic_https_rewrites', value: 'on', label: 'HTTPS 自动重写' },
    { id: 'tls_1_3', value: 'on', label: 'TLS 1.3' },
    { id: 'opportunistic_encryption', value: 'on', label: '机会性加密' },
    { id: 'cache_level', value: 'basic', label: '缓存级别：基础' },
    { id: 'browser_cache_ttl', value: 14400, label: '浏览器缓存：4 小时' },
    { id: 'challenge_ttl', value: 1800, label: '访客验证：30 分钟' },
    { id: 'browser_check', value: 'on', label: '浏览器检查' },
    { id: 'hotlink_protection', value: 'on', label: '防盗链保护' },
  ],
}

/** 全部预设方案 */
export const OPTIMIZATION_PRESETS: OptimizationPreset[] = [SPEED_PRESET, SECURITY_PRESET]

/** 单项应用结果 */
export interface PresetItemResult {
  id: string
  label: string
  ok: boolean
  error?: string
}

/** 应用一个预设方案：并发 PATCH 全部 settings，单项失败不阻断。
 *  @param onProgress 每完成一项回调（用于 UI 实时刷新） */
export async function applyOptimizationPreset(
  zoneId: string,
  preset: OptimizationPreset,
  onProgress?: (r: PresetItemResult) => void,
): Promise<PresetItemResult[]> {
  const results = await Promise.all(
    preset.settings.map(async (s) => {
      try {
        await http.patch(`/zones/${zoneId}/settings/${s.id}`, { body: { value: s.value } })
        const r: PresetItemResult = { id: s.id, label: s.label, ok: true }
        onProgress?.(r)
        return r
      } catch (e) {
        const r: PresetItemResult = {
          id: s.id,
          label: s.label,
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

/** 暴露当前 account id（account 维度查询用） */
export function currentAccountId(): string {
  return accountId()
}
