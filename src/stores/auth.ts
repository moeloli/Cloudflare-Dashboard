import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/** 认证方式 */
export type AuthType = 'global' | 'token'

/** 一个 Cloudflare 账号凭据 */
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

const STORAGE_KEY = 'cf_accounts'
const CURRENT_KEY = 'cf_current_account_id'

function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Account[]) : []
  } catch {
    return []
  }
}

function loadCurrent(): string | null {
  return localStorage.getItem(CURRENT_KEY)
}

function genId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const useAuthStore = defineStore('auth', () => {
  const accounts = ref<Account[]>(loadAccounts())
  const currentAccountId = ref<string | null>(loadCurrent())

  const currentAccount = computed<Account | null>(
    () => accounts.value.find((a) => a.id === currentAccountId.value) ?? null,
  )

  const isAuthed = computed(() => currentAccount.value !== null)

  // 持久化
  watch(accounts, (v) => localStorage.setItem(STORAGE_KEY, JSON.stringify(v)), { deep: true })
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

  return {
    accounts,
    currentAccountId,
    currentAccount,
    isAuthed,
    addAccount,
    removeAccount,
    switchAccount,
    updateAccount,
    logout,
  }
})
