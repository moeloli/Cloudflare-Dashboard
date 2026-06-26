import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { type OptimizationPreset } from '@/api'

/**
 * 配置预设持久化 store。
 *
 * 用户预设明文存 localStorage（非敏感数据，不套加密，KISS）。
 * 对外暴露 allPresets：仅用户预设（视图层按需注入「当前」等虚拟只读项）。
 *
 * localStorage key：cf_optimization_presets（仅存用户预设数组）。
 */

const STORAGE_KEY = 'cf_optimization_presets'

function genId(): string {
  return `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function loadUserPresets(): OptimizationPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as OptimizationPreset[]
    if (!Array.isArray(arr)) return []
    // 兜底：确保用户预设 builtin 字段为 false
    return arr
      .filter((p) => p && p.id && p.name && p.settings)
      .map((p) => ({ ...p, builtin: false }))
  } catch {
    return []
  }
}

export const usePresetsStore = defineStore('presets', () => {
  const userPresets = ref<OptimizationPreset[]>(loadUserPresets())

  /** 全部用户预设（可改可删） */
  const allPresets = computed<OptimizationPreset[]>(() => [...userPresets.value])

  // 用户预设变更即持久化
  watch(
    userPresets,
    (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
      } catch {
        /* 存储满或禁用时静默 */
      }
    },
    { deep: true },
  )

  /** 新建用户预设（可基于某预设拷贝） */
  function createPreset(name: string, settings: Record<string, unknown> = {}, description?: string): OptimizationPreset {
    const preset: OptimizationPreset = {
      id: genId(),
      name,
      builtin: false,
      description,
      settings: settings as OptimizationPreset['settings'],
    }
    userPresets.value = [...userPresets.value, preset]
    return preset
  }

  /** 拷贝某预设为新用户预设（用于「另存为」） */
  function duplicatePreset(src: OptimizationPreset, newName?: string): OptimizationPreset {
    return createPreset(
      newName ?? `${src.name} 副本`,
      { ...structuredClone(src.settings) },
      src.description,
    )
  }

  /** 更新用户预设（改名 / 改值 / 改描述） */
  function updatePreset(id: string, patch: Partial<Omit<OptimizationPreset, 'id' | 'builtin'>>) {
    const idx = userPresets.value.findIndex((p) => p.id === id)
    if (idx === -1) return
    const target = userPresets.value[idx]
    userPresets.value[idx] = { ...target, ...patch }
  }

  /** 删除用户预设（内置不可删） */
  function deletePreset(id: string) {
    userPresets.value = userPresets.value.filter((p) => p.id !== id)
  }

  /** 按 id 查预设（内置或用户） */
  function getPreset(id: string): OptimizationPreset | undefined {
    return allPresets.value.find((p) => p.id === id)
  }

  return { allPresets, userPresets, createPreset, duplicatePreset, updatePreset, deletePreset, getPreset }
})
