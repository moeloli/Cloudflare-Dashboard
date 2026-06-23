import { useColorMode } from '@vueuse/core'

/** 暗黑模式：class 策略，挂到 <html>，默认跟随系统 */
export function useTheme() {
  return useColorMode({
    attribute: 'class',
    selector: 'html',
    modes: { light: '', dark: 'dark' },
    storageKey: 'theme',
    initialValue: 'dark',
  })
}
