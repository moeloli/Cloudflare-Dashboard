import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  // 同时挂载 Vue 与 React 插件：React 仅处理 .jsx/.tsx 文件（用于 recharts 图表），
  // 其余 .vue 仍由 Vue 插件处理。两者通过文件扩展名天然隔离，互不影响。
  plugins: [
    vue(),
    react({ include: /\.(jsx|tsx)$/ }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 本地开发：/api/cf/* 经 Vite 代理透传到 Cloudflare API，绕过浏览器 CORS 限制。
  // 生产环境由 Cloudflare Pages Functions（functions/api/cf/[[catchall]].ts）承担同源透传。
  server: {
    proxy: {
      '/api/cf': {
        target: 'https://api.cloudflare.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/cf/, ''),
      },
    },
  },
})
