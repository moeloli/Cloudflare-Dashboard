/**
 * recharts 图表组件（React）。
 *
 * 本项目主体是 Vue3，但 recharts 3.x 强依赖 react/react-dom，无框架无关输出，
 * 也无维护良好的 Vue 适配（recharts-vue3 不存在、recharts-vue 长期 0.0.1）。
 * 因此这里以 .jsx 形式提供 React 组件，由外层 Vue 组件用 react-dom/client 挂载。
 * Vite 经 @vitejs/plugin-react（仅匹配 .jsx/.tsx）编译，与 Vue 插件互不干扰。
 *
 * 颜色全部走 CSS 变量（--primary / --chart-* / --muted 等），自动跟随暗色主题。
 */
import { createElement as h } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'

/* ---------------- 工具 ---------------- */

const nf = new Intl.NumberFormat('en-US')

function fmtNum(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '0'
  return nf.format(n)
}

function fmtBytes(n) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`
}

/** Y 轴紧凑格式化：1234 -> 1.2K */
function fmtAxis(n) {
  if (n === undefined || n === null) return ''
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return `${n}`
}

/* ---------------- 自定义 Tooltip ---------------- */

function TrendTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0]?.payload
  if (!p) return null
  return h(
    'div',
    {
      className:
        'rounded-md border bg-popover px-3 py-2 text-xs shadow-md text-popover-foreground',
    },
    h('div', { className: 'font-medium' }, p.label),
    h('div', { className: 'mt-1 text-muted-foreground' }, `请求 ${fmtNum(p.requests)}`),
    h('div', { className: 'text-muted-foreground' }, `流量 ${fmtBytes(p.bytes)}`),
    h('div', { className: 'text-muted-foreground' }, `威胁 ${fmtNum(p.threats)}`),
  )
}

function CountryTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0]?.payload
  if (!p) return null
  return h(
    'div',
    {
      className:
        'rounded-md border bg-popover px-3 py-2 text-xs shadow-md text-popover-foreground',
    },
    h('div', { className: 'font-medium' }, p.country || 'Unknown'),
    h('div', { className: 'mt-1 text-muted-foreground' }, `请求 ${fmtNum(p.requests)}`),
    h('div', { className: 'text-muted-foreground' }, `流量 ${fmtBytes(p.bytes)}`),
  )
}

/* ---------------- 请求趋势图 ---------------- */

export function TrendChart({ points, loading, hasData }) {
  if (loading) {
    return h('div', { className: 'flex h-64 items-end gap-1' }, renderBars(20))
  }
  if (!hasData) {
    return h(
      'div',
      {
        className:
          'flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground',
      },
      h('div', { className: 'text-2xl opacity-40' }, '⌀'),
      h('p', null, '该时间范围内没有请求数据'),
      h('p', { className: 'text-xs' }, '尝试切换其他域名或扩大时间范围'),
    )
  }
  return h(
    'div',
    { className: 'h-64 w-full' },
    h(
      ResponsiveContainer,
      { width: '100%', height: '100%' },
      h(
        AreaChart,
        { data: points, margin: { top: 8, right: 8, left: 0, bottom: 0 } },
        h(
          'defs',
          null,
          h(
            'linearGradient',
            { id: 'gradRequests', x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '5%', stopColor: 'var(--chart-1)', stopOpacity: 0.4 }),
            h('stop', { offset: '95%', stopColor: 'var(--chart-1)', stopOpacity: 0 }),
          ),
        ),
        h(CartesianGrid, {
          strokeDasharray: '3 3',
          stroke: 'var(--border)',
          vertical: false,
        }),
        h(XAxis, {
          dataKey: 'label',
          stroke: 'var(--muted-foreground)',
          tick: { fontSize: 11 },
          tickLine: false,
          axisLine: false,
          minTickGap: 24,
        }),
        h(YAxis, {
          stroke: 'var(--muted-foreground)',
          tick: { fontSize: 11 },
          tickLine: false,
          axisLine: false,
          width: 44,
          tickFormatter: fmtAxis,
        }),
        h(Tooltip, {
          content: h(TrendTooltip),
          cursor: { stroke: 'var(--border)', strokeWidth: 1 },
        }),
        h(Area, {
          type: 'monotone',
          dataKey: 'requests',
          stroke: 'var(--chart-1)',
          strokeWidth: 2,
          fill: 'url(#gradRequests)',
          isAnimationActive: false,
        }),
      ),
    ),
  )
}

/* ---------------- 国家分布图 ---------------- */

export function CountryChart({ countries, loading }) {
  if (loading) {
    return h('div', { className: 'space-y-3' }, renderBars(6, 'h-8'))
  }
  if (!countries || !countries.length) {
    return h(
      'div',
      {
        className:
          'flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground',
      },
      h('div', { className: 'text-2xl opacity-40' }, '🌍'),
      h('p', null, '暂无国家分布数据'),
    )
  }
  return h(
    'div',
    { className: 'h-72 w-full' },
    h(
      ResponsiveContainer,
      { width: '100%', height: '100%' },
      h(
        BarChart,
        {
          layout: 'vertical',
          data: countries,
          margin: { top: 0, right: 16, left: 0, bottom: 0 },
        },
        h(CartesianGrid, {
          strokeDasharray: '3 3',
          stroke: 'var(--border)',
          horizontal: false,
        }),
        h(XAxis, {
          type: 'number',
          stroke: 'var(--muted-foreground)',
          tick: { fontSize: 11 },
          tickLine: false,
          axisLine: false,
          tickFormatter: fmtAxis,
        }),
        h(YAxis, {
          type: 'category',
          dataKey: 'country',
          stroke: 'var(--muted-foreground)',
          tick: { fontSize: 12 },
          tickLine: false,
          axisLine: false,
          width: 96,
          tickFormatter: (v) => (v ? v : 'Unknown'),
        }),
        h(Tooltip, {
          content: h(CountryTooltip),
          cursor: { fill: 'var(--muted)', opacity: 0.4 },
        }),
        h(Bar, {
          dataKey: 'requests',
          fill: 'var(--chart-1)',
          radius: [0, 4, 4, 0],
          isAnimationActive: false,
        }),
      ),
    ),
  )
}

/* ---------------- 内部：骨架 ---------------- */

function renderBars(n, cls = '') {
  const arr = []
  for (let i = 0; i < n; i++) {
    const height = `${20 + Math.random() * 60}%`
    arr.push(
      h('div', {
        key: i,
        className: `flex-1 animate-pulse rounded bg-muted ${cls}`,
        style: { height },
      }),
    )
  }
  return arr
}
