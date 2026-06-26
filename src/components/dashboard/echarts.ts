/**
 * ECharts 按需注册：只引入面板实际用到的图表与组件，控制 bundle 体积。
 *
 * 在使用 vue-echarts 的 VChart 组件前，于入口或组件内调用一次 use([...])。
 * theme 由调用方自行 setOption 内联配色（走 CSS 变量取色），不依赖预置主题文件。
 */
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'

let registered = false

/** 注册一次（幂等）。多处调用安全。 */
export function setupECharts(): void {
  if (registered) return
  use([
    CanvasRenderer,
    BarChart,
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
  ])
  registered = true
}
