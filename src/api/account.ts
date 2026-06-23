import type { CFAccount, CFResponse } from '@/types/cloudflare'
import type { AuthType } from '@/stores/auth'

const BASE = '/api/cf/client/v4'

function credHeaders(cred: { authType: AuthType; email?: string; apiKey: string }): Record<string, string> {
  return cred.authType === 'token'
    ? { Authorization: `Bearer ${cred.apiKey}` }
    : { 'X-Auth-Email': cred.email ?? '', 'X-Auth-Key': cred.apiKey }
}

export interface VerifyResult {
  ok: boolean
  error?: string
  accounts?: CFAccount[]
}

/**
 * 验证凭据有效性。登录前调用，绕过 auth store（此时还未登录）。
 * - token 模式：先 POST /user/tokens/verify 校验 token 本身
 * - 两种模式都尝试 GET /accounts 拉取账户列表，供后续 account 维度调用
 */
export async function verifyCredentials(cred: {
  authType: AuthType
  email?: string
  apiKey: string
}): Promise<VerifyResult> {
  const headers = credHeaders(cred)

  if (cred.authType === 'token') {
    const r = await fetch(`${BASE}/user/tokens/verify`, { headers })
    const d = (await r.json()) as CFResponse<unknown>
    if (!d.success) {
      return { ok: false, error: d.errors?.[0]?.message ?? 'API Token 无效' }
    }
  }

  const r = await fetch(`${BASE}/accounts`, { headers })
  const d = (await r.json()) as CFResponse<CFAccount[]>
  if (!r.ok || !d.success) {
    return { ok: false, error: d.errors?.[0]?.message ?? `凭据验证失败（HTTP ${r.status}）` }
  }
  return { ok: true, accounts: d.result ?? [] }
}
