import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { isEncryptedPayload, open, seal } from '@/composables/useCryptoVault'

/** 认证方式 */
export type AuthType = 'global' | 'token'

/** 一个 Cloudflare 账号凭据（内存态：明文，便于 API 调用直接读取） */
export interface Account {
  /** 本地账号记录 id */
  id: string
  /** Cloudflare 账户 ID（account 维度 API 调用前缀，如 Workers/KV/R2/D1） */
  accountId: string
  /** Cloudflare 账户名称（展示用） */
  accountName: string
  nickname: string
  authType: AuthType
  /** global 模式必填邮箱；token 模式不需要 */
  email?: string
  /** global 模式为 Global API Key；token 模式为 API Token */
  apiKey: string
  addedAt: number
}

/**
 * 持久化形态：敏感字段（apiKey / email）为 AES-GCM 密文（'enc:' 前缀），
 * 其余字段明文。迁移期兼容旧明文数据（无 'enc:' 前缀按明文读取后重新加密）。
 */
interface StoredAccount
  extends Omit<Account, 'apiKey' | 'email'> {
  apiKey: string
  email?: string
}

const STORAGE_KEY = 'cf_accounts'
const CURRENT_KEY = 'cf_current_account_id'

function genId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 从 localStorage 读取密文形态账号并解密为内存态明文 */
async function loadAccounts(): Promise<Account[]> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  let stored: StoredAccount[]
  try {
    stored = JSON.parse(raw) as StoredAccount[]
  } catch {
    return []
  }
  const accounts: Account[] = []
  let needReMigrate = false
  for (const s of stored) {
    const apiKey = await open<string>(s.apiKey)
    const email = s.email != null ? await open<string>(s.email) : undefined
    // 旧明文数据：open 返回原值但非 'enc:' 前缀，标记需重新加密持久化
    if (s.apiKey && !isEncryptedPayload(s.apiKey)) needReMigrate = true
    if (s.email && !isEncryptedPayload(s.email)) needReMigrate = true
    accounts.push({
      ...s,
      apiKey: apiKey ?? '',
      email: email ?? undefined,
    })
  }
  // 旧明文数据：触发一次重新加密持久化
  if (needReMigrate && accounts.length) {
    // 标记，由 store 初始化后的 watch 接管写入；这里直接写一次更稳
    void persistAccounts(accounts)
  }
  return accounts
}

/** 把内存态明文账号加密后写回 localStorage */
async function persistAccounts(accounts: Account[]): Promise<void> {
  const stored: StoredAccount[] = []
  for (const a of accounts) {
    stored.push({
      ...a,
      apiKey: await seal(a.apiKey),
      email: a.email != null ? await seal(a.email) : undefined,
    })
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

export const useAuthStore = defineStore('auth', () => {
  const accounts = ref<Account[]>([])
  const currentAccountId = ref<string | null>(localStorage.getItem(CURRENT_KEY))

  // 异步初始化：从 localStorage 解密加载
  const ready = ref(false)
  loadAccounts().then((loaded) => {
    accounts.value = loaded
    // 若当前账号 id 失效，回退到首个
    if (currentAccountId.value && !loaded.some((a) => a.id === currentAccountId.value)) {
      currentAccountId.value = loaded[0]?.id ?? null
    } else if (!currentAccountId.value && loaded.length) {
      currentAccountId.value = loaded[0]?.id ?? null
    }
    ready.value = true
  })

  const currentAccount = computed<Account | null>(
    () => accounts.value.find((a) => a.id === currentAccountId.value) ?? null,
  )

  const isAuthed = computed(() => currentAccount.value !== null)

  // 持久化：加密后写回（deep watch，跳过初始化未就绪阶段避免覆盖）
  watch(
    accounts,
    (v) => {
      if (ready.value) void persistAccounts(v)
    },
    { deep: true },
  )

  watch(currentAccountId, (v) => {
    if (v) localStorage.setItem(CURRENT_KEY, v)
    else localStorage.removeItem(CURRENT_KEY)
  })

  function addAccount(payload: Omit<Account, 'id' | 'addedAt'>): Account {
    const acc: Account = { ...payload, id: genId(), addedAt: Date.now() }
    accounts.value.push(acc)
    currentAccountId.value = acc.id
    return acc
  }

  function removeAccount(id: string) {
    accounts.value = accounts.value.filter((a) => a.id !== id)
    if (currentAccountId.value === id) {
      currentAccountId.value = accounts.value[0]?.id ?? null
    }
  }

  function switchAccount(id: string) {
    if (accounts.value.some((a) => a.id === id)) currentAccountId.value = id
  }

  function updateAccount(id: string, patch: Partial<Account>) {
    const idx = accounts.value.findIndex((a) => a.id === id)
    if (idx !== -1) accounts.value[idx] = { ...accounts.value[idx], ...patch }
  }

  function logout() {
    currentAccountId.value = null
  }

  /** 清除所有账号（凭据全清） */
  function clearAll() {
    accounts.value = []
    currentAccountId.value = null
  }

  return {
    accounts,
    currentAccountId,
    currentAccount,
    isAuthed,
    ready,
    addAccount,
    removeAccount,
    switchAccount,
    updateAccount,
    logout,
    clearAll,
  }
})
