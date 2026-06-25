/**
 * 一键网站加速编排 API
 *
 * 加速编排逻辑：组合调用 zones / dns / workers 三个 API，
 * 在前端完成编排（Cloudflare API 凭据始终由浏览器持有，不在任何服务端落盘）。
 *
 * 流程：
 *   1. 上传 Worker 脚本（脚本内部回源到源站，可选 Cache API 缓存）
 *   2. 在访问域名所在 zone 创建 Worker 路由 + CNAME 指向优选回源域名
 *   3. 「已加速域名」通过对账号下所有 zone 扫描 CNAME 匹配优选回源域名 +
 *      校验对应 Worker 脚本存在来识别
 */
import { dnsApi } from './dns'
import { zonesApi } from './zones'
import { workersApi } from './workers'
import { listCustomHostnames } from './saas'
import type { DNSRecord, Zone } from '@/types/cloudflare'

/** 优选回源域名候选 */
export const PREFERRED_ORIGIN_DOMAINS = ['cdn.cnno.de', 'cdn.ddeed.de'] as const

/** 默认优选回源域名 */
export const DEFAULT_ORIGIN_DOMAIN = 'cdn.cnno.de'

/** 加速部署配置 */
export interface AccelerateConfig {
  /** 访问域名（完整主机名，如 www.example.com） */
  accessDomain: string
  /** 源站 URL（如 https://origin.example.com） */
  originUrl: string
  /** 缓存时间（秒），0 = 不缓存 */
  cacheTtl: number
  /** 优选回源域名（CNAME 目标，默认 cdn.cnno.de） */
  originDomain: string
  /** Worker 脚本名称 */
  workerName: string
}

/** 已加速域名探测结果 */
export interface AcceleratedZone {
  zone: Zone
  record: DNSRecord
  workerName: string
  /** Worker 脚本是否真实存在 */
  accelerated: boolean
}

/** 部署步骤进度回调 */
export type DeployStep = 'upload' | 'dns' | 'done'

export interface DeployProgress {
  step: DeployStep
  message: string
  ok: boolean
}

/* -------------------------------------------------------------------------- */
/*                              Worker 脚本生成                                */
/* -------------------------------------------------------------------------- */

/**
 * 根据访问域名生成 Worker 名称。
 * 规则：accel-{访问域名，点替换为连字符}，符合 CF 脚本命名规范（[a-zA-Z0-9_-]，≤63）。
 */
export function generateWorkerName(accessDomain: string): string {
  const slug = accessDomain.toLowerCase().replace(/[^a-z0-9.-]/g, '').replace(/\./g, '-')
  const name = `accel-${slug}`
  // Cloudflare 脚本名最长 63 字符，截断保留前缀
  return name.length > 63 ? name.slice(0, 63) : name
}

/**
 * 生成回源 Worker 脚本源码。
 *
 * 纯透传：把请求路径透传到源站 originUrl。
 * 不用 Cache API——子请求配额有限（50 次/请求），手搓缓存键易撞配额导致整页 500；
 * 缓存交给 CF 边缘缓存 + 源站 Cache-Control 头，更稳。
 * 语法为 ES module 形式（Cloudflare Workers 标准）。
 */
export function generateWorkerScript(originUrl: string, cacheTtl: number): string {
  const ttl = Math.max(0, Math.floor(cacheTtl || 0))
  return `/**
 * 一键加速 Worker（由 Cloudflare-Dashboard 生成）
 * 源站：${originUrl}
 * 缓存 TTL：${ttl} 秒（0 = 不缓存，>0 时按 s-maxage 提示边缘缓存）
 */
const ORIGIN_URL = ${JSON.stringify(originUrl)};
const CACHE_TTL = ${ttl};

// 回源请求头白名单：只透传这些，避免带 hop-by-hop / CF 内部头干扰源站
const REQ_HEADERS = [
  'accept', 'accept-encoding', 'accept-language', 'authorization',
  'content-type', 'content-length', 'user-agent', 'cache-control',
  'pragma', 'origin', 'referer', 'cookie', 'x-requested-with', 'range',
];
// 回源响应头白名单：不透传 location(避免暴露源站)、content-length/content-encoding
// (resp.body 是流,CF 用 chunked 传输,透传这俩会头体不符导致连接被掐 ERR_CONNECTION_CLOSED)
const RESP_HEADERS = [
  'content-type', 'content-disposition',
  'cache-control', 'etag', 'last-modified', 'expires', 'vary', 'set-cookie',
];

function buildProxyHeaders(src, targetHost) {
  const h = new Headers();
  for (const [k, v] of src.entries()) {
    if (REQ_HEADERS.includes(k.toLowerCase())) h.set(k, v);
  }
  h.set('Host', targetHost);
  if (!h.has('User-Agent')) {
    h.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }
  return h;
}

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    const target = new URL(reqUrl.pathname + reqUrl.search, ORIGIN_URL);

    // 构造回源请求：白名单请求头 + 修正 Host，GET/HEAD 不得带 body
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body != null;
    const originReq = new Request(target, {
      method: request.method,
      headers: buildProxyHeaders(request.headers, target.host),
      body: hasBody ? request.body : undefined,
      redirect: 'follow',
    });

    let resp;
    try {
      resp = await fetch(originReq);
    } catch (err) {
      return new Response('Origin unreachable: ' + (err && err.message ? err.message : String(err)), {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // 响应头白名单透传（不含 location），重写为可变头方便加 s-maxage
    const outHeaders = new Headers();
    for (const [k, v] of resp.headers.entries()) {
      if (RESP_HEADERS.includes(k.toLowerCase())) outHeaders.set(k, v);
    }
    // 缓存仅靠 s-maxage 头提示 CF 边缘缓存，不在 Worker 内动 Cache API（省 subrequest 配额）
    if (CACHE_TTL > 0 && resp.ok && (request.method === 'GET' || request.method === 'HEAD')) {
      outHeaders.set('Cache-Control', 's-maxage=' + CACHE_TTL + ', max-age=0');
    }
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
  }
}
`
}

/* -------------------------------------------------------------------------- */
/*                                编排 API                                     */
/* -------------------------------------------------------------------------- */

/** 列出账号下所有 zone */
export async function listAcceleratedZones(): Promise<Zone[]> {
  return zonesApi.list({ per_page: 50 })
}

/** 规范化域名字符串用于匹配（去尾部点、转小写） */
function normalizeDomain(s: string): string {
  return s.replace(/\.$/, '').toLowerCase().trim()
}

/**
 * 探测账号下已加速的域名。
 *
 * 对每个 zone 列出 CNAME 记录，匹配 content 指向优选回源域名的记录；
 * 再校验按命名约定推导出的 Worker 脚本是否存在。
 *
 * @param zones zone 列表
 * @param originDomains 优选回源域名集合，默认 PREFERRED_ORIGIN_DOMAINS
 */
export async function detectAccelerated(
  zones: Zone[],
  originDomains: readonly string[] = PREFERRED_ORIGIN_DOMAINS,
): Promise<AcceleratedZone[]> {
  const domains = originDomains.map(normalizeDomain)
  if (!domains.length) return []

  // 预取脚本清单，避免每条记录一次调用
  let scripts = new Set<string>()
  try {
    const list = await workersApi.listScripts()
    scripts = new Set(list.map((s) => s.id))
  } catch {
    // 取不到脚本清单时降级：仅基于 CNAME 匹配，accelerated 置 false
    scripts = new Set()
  }

  const results: AcceleratedZone[] = []
  for (const zone of zones) {
    let records: DNSRecord[] = []
    try {
      records = await dnsApi.list(zone.id, { type: 'CNAME' })
    } catch {
      continue
    }
    // 预取该 zone 的 custom hostnames，命中 hostname 的记录归 SaaS 优选管，排除避免误判为加速记录
    let saasHostnames = new Set<string>()
    try {
      const hosts = await listCustomHostnames(zone.id)
      saasHostnames = new Set(hosts.map((h) => normalizeDomain(h.hostname)))
    } catch {
      // 取不到 custom hostnames 时降级：不排除（保持旧行为）
    }
    for (const record of records) {
      const content = normalizeDomain(record.content)
      const hit = domains.some((d) => content === d || content.endsWith('.' + d))
      if (!hit) continue
      // 已是 SaaS 优选 custom hostname 的访问域名，跳过（避免误判为 Worker 缺失的加速记录）
      if (saasHostnames.has(normalizeDomain(record.name))) continue
      const workerName = generateWorkerName(record.name)
      results.push({
        zone,
        record,
        workerName,
        accelerated: scripts.has(workerName),
      })
    }
  }
  return results
}

/** 找到 accessDomain 所属的 zone */
function findZoneForAccessDomain(zones: Zone[], accessDomain: string): Zone | undefined {
  const host = normalizeDomain(accessDomain)
  // 精确匹配 zone name 或访问域名以 .{zone.name} 结尾
  return zones.find((z) => {
    const zname = normalizeDomain(z.name)
    return host === zname || host.endsWith('.' + zname)
  })
}

/**
 * 部署一键加速。
 *
 * 步骤：
 *   ① 找到 accessDomain 对应的 zone
 *   ② 上传 Worker 脚本
 *   ③ 创建 Worker 路由（accessDomain/* → workerName）
 *   ④ 创建 CNAME 记录指向优选回源域名（作为加速标记 + 兜底解析）
 *
 * @param config 部署配置
 * @param onProgress 步骤进度回调
 */
export async function deployAccelerate(
  config: AccelerateConfig,
  onProgress?: (p: DeployProgress) => void,
): Promise<{ zone: Zone; record: DNSRecord; workerName: string }> {
  const { accessDomain, originUrl, originDomain, workerName } = config

  const zones = await zonesApi.list({ per_page: 50 })
  const zone = findZoneForAccessDomain(zones, accessDomain)
  if (!zone) {
    throw new Error(`未找到访问域名 ${accessDomain} 所属的 zone，请先在 Cloudflare 添加该域名`)
  }

  // ① 上传 Worker 脚本
  onProgress?.({ step: 'upload', message: '正在上传 Worker 脚本…', ok: true })
  const script = generateWorkerScript(originUrl, config.cacheTtl)
  await workersApi.uploadScript(workerName, script)

  // ② 创建 Worker 路由
  onProgress?.({ step: 'dns', message: '正在配置 Worker 路由…', ok: true })
  try {
    await workersApi.createRoute(zone.id, `${accessDomain}/*`, workerName)
  } catch (e) {
    // 路由可能已存在，忽略错误继续尝试
    onProgress?.({
      step: 'dns',
      message: `Worker 路由创建跳过：${e instanceof Error ? e.message : String(e)}`,
      ok: false,
    })
  }

  // ③ 创建/更新 CNAME 指向优选回源域名
  let record: DNSRecord
  try {
    const existing = await dnsApi.list(zone.id, { type: 'CNAME', name: accessDomain })
    if (existing.length > 0) {
      record = await dnsApi.update(zone.id, existing[0].id, {
        type: 'CNAME',
        name: accessDomain,
        content: originDomain,
        proxied: true,
        comment: '一键加速 CNAME',
      })
    } else {
      record = await dnsApi.create(zone.id, {
        type: 'CNAME',
        name: accessDomain,
        content: originDomain,
        proxied: true,
        comment: '一键加速 CNAME',
      })
    }
  } catch (e) {
    // CNAME 失败不阻断（脚本与路由已就位），但向上抛出明确提示
    throw new Error(`CNAME 配置失败：${e instanceof Error ? e.message : String(e)}（Worker 脚本与路由已创建）`)
  }

  onProgress?.({ step: 'done', message: '部署完成', ok: true })
  return { zone, record, workerName }
}

/**
 * 移除加速：删 CNAME 记录 + 删 Worker 脚本 + 删 Worker 路由。
 * 单步失败不阻断其它步骤，最终聚合错误信息。
 */
export async function removeAccelerate(
  zoneId: string,
  recordId: string,
  workerName: string,
): Promise<void> {
  const errors: string[] = []

  // 删 CNAME
  try {
    await dnsApi.delete(zoneId, recordId)
  } catch (e) {
    errors.push(`CNAME 删除失败：${e instanceof Error ? e.message : String(e)}`)
  }

  // 删 Worker 路由
  try {
    const routes = await workersApi.listRoutes(zoneId)
    const matched = routes.filter((r) => r.script === workerName)
    await Promise.all(matched.map((r) => workersApi.deleteRoute(zoneId, r.id)))
  } catch (e) {
    errors.push(`Worker 路由删除失败：${e instanceof Error ? e.message : String(e)}`)
  }

  // 删 Worker 脚本
  try {
    await workersApi.deleteScript(workerName)
  } catch (e) {
    errors.push(`Worker 脚本删除失败：${e instanceof Error ? e.message : String(e)}`)
  }

  if (errors.length) {
    throw new Error(errors.join('；'))
  }
}
