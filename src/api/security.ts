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

/** 暴露当前 account id（account 维度查询用） */
export function currentAccountId(): string {
  return accountId()
}
