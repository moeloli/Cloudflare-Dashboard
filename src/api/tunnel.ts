import { http } from './client'
import { useAuthStore } from '@/stores/auth'

/** 取当前账号的 Cloudflare account id（account 维度调用的前缀） */
function accountId(): string {
  const acc = useAuthStore().currentAccount
  if (!acc) throw new Error('未登录')
  return acc.accountId
}

/** Tunnel 连接信息 */
export interface TunnelConnection {
  id: string
  colo_name: string
  is_pending_reconnect: boolean
  origin_ip: string
  opened_at: string
}

/** Tunnel 配置项（简化只读展示） */
export interface TunnelConfig {
  config: unknown
  tunnel_id: string
  version: string
}

/** Tunnel 资源 */
export interface Tunnel {
  id: string
  account_tag: string
  name: string
  created_at: string
  connections: TunnelConnection[] | null
  remote_id: string | null
  status: string
  remote_address: string | null
  tun_type: string | null
}

/** 创建 Tunnel 返回（含 token，仅创建时返回一次） */
export interface TunnelCreated extends Tunnel {
  /** 创建时一次性返回的连接 token（base64 编码，cloudflared 使用） */
  token: string
}

export const tunnelApi = {
  /** 列出账号下所有 Tunnel */
  listTunnels: () => http.get<Tunnel[]>(`/accounts/${accountId()}/cfd_tunnel`),

  /** 创建 Tunnel（CF 自动生成 secret，返回 token 供 cloudflared 连接） */
  createTunnel: (name: string) =>
    http.post<TunnelCreated>(`/accounts/${accountId()}/cfd_tunnel`, {
      body: { name, tunnel_secret: null },
    }),

  /** 删除 Tunnel（需先断开所有 cloudflared 连接） */
  deleteTunnel: (id: string) => http.delete<void>(`/accounts/${accountId()}/cfd_tunnel/${id}`),

  /** 查看 Tunnel 当前活跃连接 */
  getConnections: (id: string) =>
    http.get<TunnelConnection[]>(`/accounts/${accountId()}/cfd_tunnel/${id}/connections`),

  /** 查看 Tunnel 配置（只读） */
  getConfig: (id: string) =>
    http.get<TunnelConfig>(`/accounts/${accountId()}/cfd_tunnel/${id}/configurations`),
}
