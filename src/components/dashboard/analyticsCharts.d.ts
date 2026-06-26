/**
 * recharts React 组件的类型声明。
 *
 * 真实实现位于 analyticsCharts.jsx（由 @vitejs/plugin-react 编译）。
 * 此处仅提供 TS 类型供 .vue 文件 import 校验，避免 vue-tsc 进入 JSX 类型检查。
 */
import type { ComponentType } from 'react'
import type { CountryRow, TimePoint } from '@/api/analytics'

export interface TrendChartProps {
  points: TimePoint[]
  loading: boolean
  hasData: boolean
}

export interface CountryChartProps {
  countries: CountryRow[]
  loading: boolean
}

export const TrendChart: ComponentType<TrendChartProps>
export const CountryChart: ComponentType<CountryChartProps>
