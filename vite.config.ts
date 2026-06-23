import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
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
