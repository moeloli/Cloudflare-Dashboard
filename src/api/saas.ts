/**
 * Cloudflare for SaaS —— SaaS 优选加速编排 API
 *
 * 复刻 cococ.co 的 "SaaS 优选加速部署" 能力，技术基于 Cloudflare for SaaS：
 * 在用户自己账号下的 zone（SaaS 提供方）配置 fallback origin（回退源 = 回源域名），
 * 再把访问域名作为 custom hostname 接入该 zone，访问域名 CNAME 到优选域名，
 * 由 CF 边缘代理回源。
 *
 * 两种源站模式：
 * - domain 模式：源站已有公网域名（如 CF Worker 的 xxx.workers.dev、绑了自定义域的 Worker、
 *   对象存储域名等）。不需 A 记录、不需 IP，直接以源站域名作为 custom_origin_server。
 *   fallback_origin 与 custom_hostname 都挂在访问域名所属 zone（accessZone）上。
 * - ip 模式：源站是传统服务器。在回源域名所属 zone（originZone）建 A/AAAA 记录指向源站 IP，
 *   fallback_origin 与 custom_hostname 挂在 originZone 上。
 *
 * 与 accelerate.ts（Worker 回源 + CNAME 公共优选域名）的区别：
 * - 本模块用 CF for SaaS 原生能力，回源目标在用户自己账号下管理，不依赖 cococ 公共优选基础设施
 * - 访问域名不必在用户账号下（第三方域名也可加速，靠 CNAME + custom hostname 接管）
 *
 * 凭据安全模型继承：所有 CF API 调用由浏览器发起并同源透传，不在任何服务端落盘。
 *
 * CF API 端点（路径相对 client.ts 的 BASE=/api/cf/client/v4）：
 *   PUT   /zones/{zone_id}/custom_hostnames/fallback_origin   设置回退源 {origin}
 *   GET   /zones/{zone_id}/custom_hostnames/fallback_origin
 *   POST  /zones/{zone_id}/custom_hostnames                   接入 {hostname, ssl}
 *   GET   /zones/{zone_id}/custom_hostnames                    列表
 *   DELETE /zones/{zone_id}/custom_hostnames/{id}
 */
import { http } from './client'
import { dnsApi } from './dns'
import { zonesApi } from './zones'
import type { CustomHostname, Zone } from '@/types/cloudflare'

/* ---------- 常量与类型 ---------- */

/** 优选域名候选（访问域名 CNAME 目标） */
export const PREFERRED_DOMAINS = ['cdn.cnno.de', 'cdn.ddeed.de'] as const

/** 默认优选域名 */
export const DEFAULT_PREFERRED_DOMAIN = 'cdn.cnno.de'

/** 源站模式：domain=源站已有公网域名(如 CF Worker)；ip=源站是传统服务器需配 A 记录 */
export type OriginMode = 'domain' | 'ip'

/** 部署配置 */
export interface SaasDeployConfig {
  /** 访问域名（要加速的主机名，如 www.example.com 或 example.com） */
  accessDomain: string
  /** 源站模式：domain=源站已有公网域名(如 CF Worker)；ip=源站是传统服务器需配 A 记录 */
  originMode: OriginMode
  /**
   * 回源目标域名：
   * - domain 模式=源站域名(如 cloud-mail.workers.dev)，直接作为 custom_origin_server
   * - ip 模式=账号下某 zone 子域(作为 fallback origin，其 A 记录指向 originIp)
   */
  originDomain: string
  /** 仅 ip 模式必填：源站真实 IP，回源域名 A/AAAA 记录指向它 */
  originIp?: string
  /** 优选域名（访问域名 CNAME 目标） */
  preferredDomain: string
}

/** 部署进度步骤 */
export type SaasDeployStep = 'dns' | 'fallback' | 'hostname' | 'cname' | 'done'

export interface SaasDeployProgress {
  step: SaasDeployStep
  message: string
  ok: boolean
}

/** 已部署的 SaaS 优选记录（custom hostname） */
export interface SaasDeployment {
  id: string
  /** 访问域名 */
  hostname: string
  /** custom hostname 状态：pending | active | moved */
  status: string
  /** SSL 证书状态：pending_validation | pending_deployment | active */
  sslStatus: string
  /** 回源域名（domain 模式=源站域名；ip 模式=承载 A 记录的回源子域） */
  originDomain: string
  /** 承载 fallback_origin / custom_hostname 的 zone id（domain 模式=accessZone；ip 模式=originZone） */
  originZoneId: string
  zoneName: string
  /** 是否需要手动配置访问域名 CNAME（accessDomain 不在账号内时） */
  manualCname?: boolean
  /** 优选域名（访问域名应 CNAME 到此，manualCname=true 时提示用户） */
  preferredDomain?: string
}

/** 部署结果 */
export interface SaasDeployResult {
  deployment: SaasDeployment
  /** 是否需要用户手动为访问域名配 CNAME */
  manualCname: boolean
}

/* ---------- 工具函数 ---------- */

/** 规范化域名字符串用于匹配（去尾部点、转小写、trim） */
function normalizeDomain(s: string): string {
  return s.replace(/\.$/, '').toLowerCase().trim()
}

/** 判断 IP 类型 → DNS 记录类型 */
function ipRecordType(ip: string): 'A' | 'AAAA' {
  return ip.includes(':') ? 'AAAA' : 'A'
}

/** IPv4/IPv6 简单校验 */
export function isValidIp(ip: string): boolean {
  const v = ip.trim()
  if (!v) return false
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) {
    return v.split('.').every((n) => Number(n) >= 0 && Number(n) <= 255)
  }
  // IPv6（宽松：含冒号即视为 IPv6 候选，粗校验）
  return /^[0-9a-fA-F:]+$/.test(v) && v.includes(':')
}

/** 在 zones 列表中找到 domain 所属的 zone（精确匹配 zone name 或以其为父域） */
function findZoneForDomain(zones: Zone[], domain: string): Zone | undefined {
  const host = normalizeDomain(domain)
  return zones.find((z) => {
    const zname = normalizeDomain(z.name)
    return host === zname || host.endsWith('.' + zname)
  })
}

/* ---------- custom_hostnames 基础 API ---------- */

/** 列出 zone 下所有 custom hostnames */
async function listCustomHostnames(zoneId: string): Promise<CustomHostname[]> {
  // custom_hostnames 端点默认分页，per_page 拉满
  const all: CustomHostname[] = []
  let page = 1
  for (;;) {
    const res = await http.get<CustomHostname[]>(`/zones/${zoneId}/custom_hostnames`, {
      params: { per_page: 100, page },
    })
    all.push(...res)
    if (res.length < 100) break
    page += 1
    if (page > 50) break // 保险
  }
  return all
}

/** 创建 custom hostname（接入访问域名，显式绑定回源域名） */
function createCustomHostname(zoneId: string, hostname: string, originDomain: string): Promise<CustomHostname> {
  return http.post<CustomHostname>(`/zones/${zoneId}/custom_hostnames`, {
    body: {
      hostname,
      // 显式绑定该 hostname 的回源域名，不依赖 zone 级 fallback origin 单例
      // （多个 hostname 可各自回源到不同源站，删除时也能精确匹配）
      custom_origin_server: originDomain,
      ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.0' } },
    },
  })
}

/** 删除 custom hostname */
function deleteCustomHostname(zoneId: string, id: string): Promise<unknown> {
  return http.delete<unknown>(`/zones/${zoneId}/custom_hostnames/${id}`)
}

/** 设置 zone 级回退源（fallback origin） */
function setFallbackOrigin(zoneId: string, origin: string): Promise<FallbackOriginLike> {
  return http.put<FallbackOriginLike>(`/zones/${zoneId}/custom_hostnames/fallback_origin`, {
    body: { origin },
  })
}

/** 查询 zone 级回退源 */
function getFallbackOrigin(zoneId: string): Promise<FallbackOriginLike | null> {
  return http.get<FallbackOriginLike>(`/zones/${zoneId}/custom_hostnames/fallback_origin`)
}

interface FallbackOriginLike {
  origin: string
  status?: string
}

/* ---------- 已部署列表 ---------- */

/**
 * 遍历账号下所有 zone，聚合 SaaS 优选已部署记录。
 * 每个 zone：取 fallback origin（回源域名）+ custom_hostnames 列表，配对成 deployment。
 * 无 custom hostname 的 zone 跳过。
 */
export async function listSaasDeployments(): Promise<SaasDeployment[]> {
  const zones = await zonesApi.list({ per_page: 50 })
  const results: SaasDeployment[] = []

  // 并发查每个 zone 的 fallback + custom hostnames
  await Promise.all(
    zones.map(async (zone) => {
      let fallback: FallbackOriginLike | null = null
      let hosts: CustomHostname[] = []
      try {
        ;[fallback, hosts] = await Promise.all([
          getFallbackOrigin(zone.id).catch(() => null),
          listCustomHostnames(zone.id).catch(() => [] as CustomHostname[]),
        ])
      } catch {
        return
      }
      const zoneFallback = fallback?.origin ?? ''
      for (const h of hosts) {
        // 优先用 hostname 自带的 custom_origin_server,回退到 zone 级 fallback
        const originDomain = h.custom_origin_server?.trim() || zoneFallback
        results.push({
          id: h.id,
          hostname: h.hostname,
          status: h.status,
          sslStatus: h.ssl?.status ?? '—',
          originDomain,
          originZoneId: zone.id,
          zoneName: zone.name,
        })
      }
    }),
  )
  return results
}

/* ---------- 部署 ---------- */

/**
 * 部署 SaaS 优选加速。
 *
 * 两种源站模式（对齐 cococ.co：两种模式都设 zone 级 fallback_origin）：
 * - domain 模式：源站已有公网域名（如 CF Worker 的 xxx.workers.dev）。
 *   不需建 A 记录、不需 IP。fallback_origin 与 custom_hostname 都挂在 accessZone 上
 *   （源站域名通常不在用户账号下，无法挂在源站所属 zone）。
 * - ip 模式：源站是传统服务器。在 originZone（回源域名所属 zone）建 A 记录指向源站 IP，
 *   fallback_origin 与 custom_hostname 挂在 originZone 上。
 *
 * 步骤：
 *   ① 确定配置 zone（targetZone）：domain=accessZone；ip=originZone
 *   ② ip 模式：在 originZone 为 originDomain 建/更新 A(AAAA) 记录 → originIp
 *   ③ PUT fallback_origin = originDomain（挂 targetZone）
 *   ④ POST custom_hostname = accessDomain（custom_origin_server=originDomain，挂 targetZone）
 *   ⑤ 访问域名 CNAME：若 accessDomain 在账号某 zone 下，建 CNAME → preferredDomain；否则标记需手动
 *
 * @param config 部署配置
 * @param onProgress 进度回调
 */
export async function deploySaas(
  config: SaasDeployConfig,
  onProgress?: (p: SaasDeployProgress) => void,
): Promise<SaasDeployResult> {
  const { accessDomain, originMode, originDomain, originIp, preferredDomain } = config

  const zones = await zonesApi.list({ per_page: 50 })

  // 访问域名所属 zone（用于 CNAME，及 domain 模式下承载 fallback/hostname）
  const accessZone = findZoneForDomain(zones, accessDomain)

  // ① 确定配置 zone 与 originZone
  let originZone: Zone | undefined
  let targetZone: Zone
  if (originMode === 'ip') {
    // ip 模式：回源域名必须在账号下（要在其所属 zone 建 A 记录）
    originZone = findZoneForDomain(zones, originDomain)
    if (!originZone) {
      throw new Error(`未找到回源域名 ${originDomain} 所属的 zone，请确认该域名在当前 Cloudflare 账号下`)
    }
    targetZone = originZone
  } else {
    // domain 模式：源站域名通常不在账号下，挂在 accessZone 上
    if (!accessZone) {
      throw new Error('访问域名需在账号下，或用 IP 模式')
    }
    targetZone = accessZone
  }

  // 校验：回源域名不能与访问域名相同
  if (normalizeDomain(accessDomain) === normalizeDomain(originDomain)) {
    throw new Error('回源域名不能与访问域名相同')
  }

  // ② ip 模式：建/更新回源域名 A(AAAA) 记录 → originIp；domain 模式跳过
  if (originMode === 'ip') {
    if (!originZone) {
      // 类型收窄保护，理论上不会走到
      throw new Error('ip 模式缺少回源域名所属 zone')
    }
    if (!originIp) {
      throw new Error('ip 模式必须提供源站 IP')
    }
    onProgress?.({ step: 'dns', message: '正在为回源域名配置 A 记录…', ok: true })
    const type = ipRecordType(originIp)
    try {
      const existing = await dnsApi.list(originZone.id, { name: originDomain, type })
      if (existing.length > 0) {
        await dnsApi.update(originZone.id, existing[0].id, {
          type,
          name: originDomain,
          content: originIp,
          proxied: true,
          comment: 'SaaS 优选回源 A 记录',
        })
      } else {
        await dnsApi.create(originZone.id, {
          type,
          name: originDomain,
          content: originIp,
          proxied: true,
          comment: 'SaaS 优选回源 A 记录',
        })
      }
    } catch (e) {
      // A 记录失败不阻断（可能已存在或用户自行管理），降级继续
      onProgress?.({
        step: 'dns',
        message: `回源 A 记录配置跳过：${e instanceof Error ? e.message : String(e)}`,
        ok: false,
      })
    }
  } else {
    // domain 模式无需 A 记录，发一个跳过提示保持步骤连续
    onProgress?.({ step: 'dns', message: '源站域名模式，跳过 A 记录配置', ok: true })
  }

  // ③ 设置 fallback origin = 回源域名（挂 targetZone）
  onProgress?.({ step: 'fallback', message: '正在配置回退源（fallback origin）…', ok: true })
  try {
    await setFallbackOrigin(targetZone.id, originDomain)
  } catch (e) {
    throw new Error(`配置回退源失败：${e instanceof Error ? e.message : String(e)}`)
  }

  // ④ 接入访问域名 custom hostname（挂 targetZone，custom_origin_server=originDomain）
  onProgress?.({ step: 'hostname', message: '正在接入访问域名（custom hostname）…', ok: true })
  let hostname: CustomHostname
  try {
    hostname = await createCustomHostname(targetZone.id, accessDomain, originDomain)
  } catch (e) {
    throw new Error(`接入访问域名失败：${e instanceof Error ? e.message : String(e)}（回退源已配置）`)
  }

  // ⑤ 访问域名 CNAME → 优选域名
  let manualCname = false
  onProgress?.({ step: 'cname', message: '正在配置访问域名 CNAME…', ok: true })
  if (accessZone) {
    try {
      const existingCname = await dnsApi.list(accessZone.id, { type: 'CNAME', name: accessDomain })
      if (existingCname.length > 0) {
        await dnsApi.update(accessZone.id, existingCname[0].id, {
          type: 'CNAME',
          name: accessDomain,
          content: preferredDomain,
          proxied: true,
          comment: 'SaaS 优选 CNAME',
        })
      } else {
        await dnsApi.create(accessZone.id, {
          type: 'CNAME',
          name: accessDomain,
          content: preferredDomain,
          proxied: true,
          comment: 'SaaS 优选 CNAME',
        })
      }
    } catch (e) {
      // CNAME 失败降级为手动提示
      manualCname = true
      onProgress?.({
        step: 'cname',
        message: `CNAME 自动配置失败，需手动配置：${e instanceof Error ? e.message : String(e)}`,
        ok: false,
      })
    }
  } else {
    // 访问域名不在账号内，需用户自行到其 DNS 服务商配 CNAME
    manualCname = true
  }

  onProgress?.({ step: 'done', message: '部署完成，等待 1-5 分钟 DCV 证书签发生效', ok: true })

  const deployment: SaasDeployment = {
    id: hostname.id,
    hostname: hostname.hostname,
    status: hostname.status,
    sslStatus: hostname.ssl?.status ?? 'pending',
    originDomain,
    originZoneId: targetZone.id,
    zoneName: targetZone.name,
    manualCname,
    preferredDomain,
  }
  return { deployment, manualCname }
}

/* ---------- 移除 ---------- */

/**
 * 移除 SaaS 优选配置：删除该回源域名所属 zone 下的 custom hostname + 回源 A 记录。
 * fallback origin 为 zone 级单例，可能被其他主机名共用，故保留不删（保守，避免误伤）。
 * 单步失败不阻断，最终聚合错误。
 */
export async function removeSaas(originDomain: string, originZoneId: string): Promise<void> {
  const errors: string[] = []

  // ① 仅删除 custom_origin_server == originDomain 的 custom hostname
  //    （接入时已显式绑定回源域名，精确匹配避免误删同 zone 下其他 SaaS 接入）
  try {
    const hosts = await listCustomHostnames(originZoneId)
    const matched = hosts.filter((h) => normalizeDomain(h.custom_origin_server ?? '') === normalizeDomain(originDomain))
    await Promise.all(matched.map((h) => deleteCustomHostname(originZoneId, h.id)))
  } catch (e) {
    errors.push(`自定义主机名删除失败：${e instanceof Error ? e.message : String(e)}`)
  }

  // ② 删除回源域名的 A/AAAA 记录
  try {
    const records = await dnsApi.list(originZoneId, { name: originDomain })
    const matched = records.filter((r) => (r.type === 'A' || r.type === 'AAAA') && r.comment === 'SaaS 优选回源 A 记录')
    if (matched.length > 0) {
      await Promise.all(matched.map((r) => dnsApi.delete(originZoneId, r.id)))
    }
  } catch (e) {
    errors.push(`回源 A 记录删除失败：${e instanceof Error ? e.message : String(e)}`)
  }

  if (errors.length) {
    throw new Error(errors.join('；'))
  }
}
