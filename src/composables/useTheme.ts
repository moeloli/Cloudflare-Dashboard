import { useColorMode } from '@vueuse/core'

/** 暗黑模式：class 策略，挂到 <html>，默认跟随系统 */
export function useTheme() {
  return useColorMode({
    attribute: 'class',
    selector: 'html',
    modes: { light: '', dark: 'dark' },
    storageKey: 'theme',
    initialValue: 'dark',
    // 默认 emitAuto=false 时，读取 ref 会把 'auto' 解析成系统当前值（dark/light），
    // 导致设置面板里"跟随系统"按钮永远无法高亮、看起来像点了没反应。
    // 开启后 ref 才会真正暴露 'auto'，按钮态与持久化值一致。
    emitAuto: true,
  })
}
