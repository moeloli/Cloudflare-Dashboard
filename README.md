# CF Dashboard

> 开源、自托管、**凭据零上链**的 Cloudflare 全功能管理面板。

这是一个**开源、自托管**的 Cloudflare 全功能管理面板。市面上某些闭源第三方面板会把用户 Cloudflare 凭据发往它自己的服务器、明文存本地、还设授权码门槛——本项目从根上解决这些信任问题。

## 功能模块（16 个）

| 分组 | 模块 | 能力 |
|---|---|---|
| 概览 | 概览 | 账号信息、域名数、快捷入口 |
| 域名与加速 | 域名管理 | Zone 列表、添加域名（含 NS 提示）、删除 |
| | 域名详情 | NS/plan、缓存清除、开发模式、概览 |
| | DNS 记录 | CRUD、A/AAAA/CNAME/TXT/MX/NS 等、多 IP 拆分、小黄云代理、批量 JSON 导入 |
| | **一键加速** | 向导式部署 Worker + CNAME、已加速域名识别与管理 |
| Workers 与计算 | Workers | 脚本列表/编辑/部署、路由、自定义域、workers.dev 子域开关 |
| | KV 存储 | Namespace/Key 增删改查、值查看（text/json） |
| | D1 数据库 | **SQL 控制台**、表结构、多语句结果 |
| 存储 | R2 存储 | Bucket 管理、对象上传/下载/删除 |
| 部署 | Pages | 项目列表、部署记录 |
| 网络 | Tunnel | 列表、创建（含 token）、连接/配置查看 |
| 安全 | SSL/证书 | SSL 模式、Always HTTPS、TLS 1.3、边缘证书 |
| | WAF/防火墙 | WAF 规则集、IP 访问规则 |
| | 缓存规则 | 清缓存、开发模式、Page Rules |
| 分析 | 分析统计 | GraphQL Analytics、请求趋势、Top 国家（纯 Tailwind 柱状图，无图表库） |
| 工具 | 工具箱 | CF IP 列表、DNS 查询、HTTP 头检测、UUID/Base64/时间戳转换 |
| | 设置 | 多账号管理、凭据安全说明、主题、关于 |

## 技术栈

- **前端**：Vue 3.5 + `<script setup>` + TypeScript + Vite 8
- **UI**：shadcn-vue（Radix/reka-ui 原语 + Tailwind CSS v4 + cva + tailwind-merge）+ lucide-vue-next 图标
- **状态**：Pinia + VueUse
- **路由**：Vue Router 4
- **后端**：Cloudflare Pages Functions（同源透传代理，零存储）
- **部署**：Cloudflare Pages 静态托管

## 安全模型

```
浏览器 ──(凭据随请求头)──> 同源 /api/cf/* ──> Pages Function(纯透传) ──> api.cloudflare.com
   ↑                                                                                  
   └── 凭据只存 localStorage，永不上链、永不落盘
```

- 认证支持两种：**Global API Key**（邮箱 + Key）与 **API Token**（Bearer，推荐用最小权限）。
- Pages Function 不解析、不存储、不记录任何凭据或响应体，仅做请求/响应转发。
- 代码全开源，你可以自行审计、自行部署到自己 Cloudflare 账号。

> 推荐使用 **API Token** 而非 Global API Key，并赋予最小所需权限，进一步降低风险。

## 快速开始（本地开发）

```bash
pnpm install
pnpm dev
```

打开 http://localhost:5173，输入 Cloudflare 邮箱 + Global API Key（或 API Token）即可。

本地开发时 `/api/cf/*` 由 Vite dev server 代理透传到 `api.cloudflare.com`（见 `vite.config.ts`），无需部署 Functions。

## 部署到 Cloudflare Pages

1. Fork 本仓库到你的 GitHub。
2. 进入 Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git，选择你的 fork。
3. 构建配置：
   - **Framework preset**：None（或 Vite）
   - **Build command**：`pnpm build`
   - **Build output directory**：`dist`
   - **Root directory**：`/`
4. 环境变量：`NODE_VERSION` = `20`（或更高）
5. Deploy。`functions/api/cf/[[catchall]].ts` 会自动作为 Pages Functions 生效，提供同源透传。
6. 部署完成后用 `https://<你的项目>.pages.dev` 访问，输入你自己的 CF 凭据。

> 也可用 `wrangler pages deploy dist` 命令行部署。

## 本地预览 Pages Functions

```bash
pnpm build
npx wrangler pages dev dist
```

## 项目结构

```
├── functions/api/cf/[[catchall]].ts   # Pages Functions 同源透传代理（生产）
├── src/
│   ├── api/          # CF API client + 各模块 API 封装
│   ├── components/ui/  # shadcn-vue 组件
│   ├── components/dns/ # 业务组件
│   ├── composables/    # useTheme 等
│   ├── layouts/        # DashboardLayout 侧边栏布局
│   ├── router/         # 路由 + 菜单元数据
│   ├── stores/         # Pinia auth store（多账号 + 凭据）
│   ├── styles/         # Tailwind v4 + 主题变量
│   ├── types/          # Cloudflare API 类型
│   └── views/          # 16 个功能模块视图
└── vite.config.ts     # 含本地 /api/cf 代理
```

## 路线图

- [ ] 凭据本地 AES-GCM 加密（主密码派生密钥）
- [ ] Workers 脚本 CodeMirror 编辑器（语法高亮）
- [ ] D1 表数据浏览（分页/筛选）
- [ ] Analytics 图表库化（recharts）
- [ ] i18n 国际化
- [ ] PWA 离线支持

## 开发

```bash
pnpm dev      # 启动开发服务器
pnpm build    # 类型检查 + 生产构建
pnpm preview  # 预览构建产物
```

## License

[AGPL-3.0-Later](LICENSE)
