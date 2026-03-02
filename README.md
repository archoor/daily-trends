# 趋势聚合 | Daily Trends

从数据库读取多数据源趋势数据并展示的 Next.js 应用（App Router + TypeScript + Prisma）。**本项目仅负责读取与展示，不包含网页抓取逻辑；数据由外部 Python 爬虫程序写入同一数据库。**

## 功能概览

- **多数据源**：每个趋势站对应独立列表页与详情页，通过顶部菜单切换。
- **数据来源**：数据库（SQLite/PostgreSQL）。由你在其他项目（如 Python 爬虫）中按本项目的 Prisma schema 写入 `DataSource` 及各数据源对应的趋势表（如 Toolify 源：`toolify_trend_item`、`toolify_trend_detail`；Google 趋势源：`google_trend_item`、`google_trend_detail`）。
- **展示内容**：Toolify 列表表头为 排行 | 工具 | 月访问量 | 增长 | 增长率 | 介绍 | 标签；GitHub 列表表头为 排行 | 仓库 | 描述 | 语言 | 星标 | Fork | 今日新增星标；Product Hunt 列表表头为 排行 | 图标 | 产品名 | 描述 | 类别 | 评论数 | 点赞数；**Google 趋势**列表表头为 排行 | 趋势名称 | 搜索量 | 已开始 | 结束时间 | 趋势细分；详情页按数据源展示完整信息与描述。
- **扩展性**：新增数据源需在 `config/sources.ts` 增加配置，在 Prisma 中增加该源的趋势表（如 `XxxTrendItem`/`XxxTrendDetail` 并 `@@map("xxx_trend_item")`），并确保爬虫写入对应 `DataSource` 及该源表数据。

## 项目结构

```
├── app/                    # Next.js App Router
│   ├── layout.tsx          # 根布局 + 导航
│   ├── page.tsx            # 首页（数据源入口）
│   └── trends/
│       └── [sourceId]/     # 按数据源动态路由
│           ├── page.tsx    # 列表页
│           └── [id]/       # 条目 slug
│               └── page.tsx # 详情页
├── components/
│   └── Nav.tsx             # 多数据源菜单
├── config/
│   └── sources.ts          # 数据源配置（slug、name、baseUrl），与 DB 中 DataSource.slug 对应
├── lib/
│   ├── db/client.ts        # Prisma 单例
│   ├── api/trends.ts       # 趋势查询（仅读 DB）
│   └── types/trend.ts      # DTO 类型
├── script/                 # 采集与更新数据库的 Python 脚本（见 script/README.md）
└── prisma/
    └── schema.prisma      # 数据库模型（供本应用与外部爬虫共用）
```

## 如何运行

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置环境**
   ```bash
   cp .env.example .env
   # 编辑 .env 中的 DATABASE_URL（与爬虫使用同一数据库）
   ```

3. **初始化数据库**
   ```bash
   npx prisma generate
   npx prisma db push
   ```
   若之前已存在旧表（`DataSource`、`TrendItem`、`TrendDetail`），改为带前缀的新表（`data_source`、`toolify_trend_item`、`toolify_trend_detail`）时，push 会提示可能丢数据。可备份后执行 `npx prisma db push --accept-data-loss`，再执行 `npm run db:seed` 重新写入数据。

4. **写入数据**  
   - **方式一（本地测试）**：运行种子脚本插入示例数据：
     ```bash
     npm run db:seed
     ```
     脚本会创建/更新数据源 `toolify` 及 10 条趋势条目（排行、工具、月访问量、增长、增长率、介绍、标签），并为前 3 条写入 `TrendDetail`。数据定义见 `prisma/seed.js`（或 `prisma/seed.ts`）。
   - **方式二**：使用你的 Python 爬虫（或其他程序）向同一数据库写入 `DataSource` 及对应数据源表（如 Toolify 源写 `toolify_trend_item`、`toolify_trend_detail`）。可将采集与入库脚本放在项目根目录下的 **`script/`** 文件夹中，表结构见 `prisma/schema.prisma`。例如采集 Toolify AI 趋势：在项目根目录执行 `python script/toolify_trends.py`（需设置 `DATABASE_URL` 与 `FIRECRAWL_API_KEY`），会将 [Toolify AI 趋势页](https://www.toolify.ai/zh/Best-trending-AI-Tools) 的工具列表写入 `toolify_trend_item`。

5. **启动开发服务器**
   ```bash
   npm run dev
   ```

访问 `http://localhost:3000`，通过顶部菜单进入各数据源列表与详情页。

## 数据库约定（供外部爬虫使用）

多数据源数据存于**不同表**，表名与模型名带数据源前缀，便于识别与扩展：

| 逻辑含义         | 表名（SQL）             | Prisma 模型            |
|------------------|------------------------|------------------------|
| 数据源注册表     | `data_source`          | `DataSource`           |
| Toolify 趋势列表 | `toolify_trend_item`   | `ToolifyTrendItem`     |
| Toolify 趋势详情 | `toolify_trend_detail` | `ToolifyTrendDetail`   |
| GitHub 趋势列表  | `github_trend_item`    | `GitHubTrendItem`      |
| GitHub 趋势详情  | `github_trend_detail`  | `GitHubTrendDetail`    |
| Product Hunt 趋势列表 | `product_hunt_trend_item` | `ProductHuntTrendItem` |
| Product Hunt 趋势详情 | `product_hunt_trend_detail` | `ProductHuntTrendDetail` |
| Google 趋势列表       | `google_trend_item`       | `GoogleTrendItem`       |
| Google 趋势详情       | `google_trend_detail`     | `GoogleTrendDetail`     |

- **DataSource（表 `data_source`）**：每个趋势站一条，`slug` 与 `config/sources.ts` 一致（如 `toolify`、`github`）。
- **ToolifyTrendItem（表 `toolify_trend_item`）**：`sourceId` 关联 DataSource；`externalId`、`snapshotAt` 与 `sourceId` 联合唯一；`slug` 用于详情页 URL。字段与 Toolify 列表表头对应：`rank`、`name`、`url`、`monthlyVisits`（BigInt）、`growthDisplay`、`growthRate`、`summary`、`tags`。
- **ToolifyTrendDetail（表 `toolify_trend_detail`）**：可选，`description` 存详情页长描述；`rawJson` 可存自定义字段。
- **GitHubTrendItem（表 `github_trend_item`）**：`sourceId` 关联 DataSource；`externalId` 一般为 `owner/repo`；`slug` 用于详情页 URL（如 `owner-repo`）。字段与 GitHub Trending Repositories 列表对齐：`rank`、`repoFullName`、`description`、`language`、`stars`、`forks`、`starsToday`、`dateRange`（如 today/weekly/monthly）、`builtByJson`（贡献者 JSON）、`url`（仓库链接）。**增长率**由前端按「今日新增星标 ÷ 星标数 × 100」计算并展示，不落库。
- **GitHubTrendDetail（表 `github_trend_detail`）**：可选，`description` 存详情页长描述；`rawJson` 可存自定义字段。
- **ProductHuntTrendItem（表 `product_hunt_trend_item`）**：`sourceId` 关联 DataSource；`externalId` 一般为产品 slug；`slug` 用于详情页 URL。字段与 Product Hunt 热点商品列表对齐：`rank`、`name`、`description`、`iconUrl`、`categories`（类别/标签，逗号或 "•" 分隔）、`commentCount`、`upvoteCount`、`url`（产品链接）。
- **ProductHuntTrendDetail（表 `product_hunt_trend_detail`）**：可选，`description` 存详情页长描述；`rawJson` 可存自定义字段。
- **GoogleTrendItem（表 `google_trend_item`）**：`sourceId` 关联 DataSource；`externalId` 一般为趋势词条名；`slug` 用于详情页 URL。字段与 Google 趋势页对齐：`rank`、`name`、`searchVolume`（BigInt）、`searchVolumeDisplay`（如 "500万+"）、`growthRate`（增长百分比）、`startedAt`、`endedAt`（趋势结束时间）、`isActive`、`relatedKeywords`（JSON 数组字符串）、`moreRelatedCount`。
- **GoogleTrendDetail（表 `google_trend_detail`）**：可选，`description` 存详情页长描述；`rawJson` 可存自定义字段。

新增数据源时：在 `config/sources.ts` 增加配置，在 schema 中增加该源的 `XxxTrendItem`/`XxxTrendDetail` 及 `@@map("xxx_trend_item")`，并在 `lib/api/trends.ts` 中按 `source.slug` 分发查询对应表，爬虫写入对应 `DataSource` 及该源表即可。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Prisma 数据库连接（需与爬虫使用同一库，示例：`file:./dev.db`） |
| `FIRECRAWL_API_KEY` | Firecrawl API 密钥；采集 Toolify AI、Product Hunt 等脚本需要 |
| `NEXT_PUBLIC_SITE_URL` | 站点根 URL（可选），用于 SEO 的 canonical、Open Graph、sitemap；未设置时生产环境会使用 Vercel 的 `VERCEL_URL` |

## 脚本说明

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` / `npm run start` | 构建与生产启动 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:push` | 推送 schema 到数据库（开发） |
| `npm run db:seed` | 执行种子脚本，插入测试趋势数据（DataSource + TrendItem + TrendDetail） |
| `npm run db:studio` | 打开 Prisma Studio 查看数据 |

## 界面与样式

- **界面语言**：所有界面文案（导航、标题、表头、按钮、说明等）为英文；榜单表格中的**数据内容**（工具名、描述、标签等来自数据库）保持爬虫写入的原文，不强制英文化。
- **设计风格**：参考 Toolify 类榜单站，白底、紫色强调色、清晰层次。全局样式与设计变量见 `app/globals.css`。
- **导航**：顶部 Logo「Daily Trends」、Home、各数据源、右侧 Dashboard；当前页紫色高亮。
- **首页**：标题区 + 数据源卡片网格，悬停有边框与阴影反馈。
- **列表页**：标题区 + 数据表格；排行前三名金/银/铜奖牌，增长数据绿色高亮。（数据源切换仅通过顶部导航）
- **详情页**：返回链接、标题、描述列表与标签 pill 样式统一。

## SEO 与 Google AI 检索

页面已按 Google 新规与 AI Overviews 优化，便于搜索引擎与 AI 快速检索和理解：

- **结构化数据（JSON-LD）**：首页输出 `WebSite`；列表页输出 `ItemList`（榜单条目）；详情页输出 `Article`（标题、描述、日期、来源）。
- **语义化结构**：`<main>`、`<article>`、`<section>`、`aria-label` / `aria-labelledby`、单页单 `h1`，便于爬虫理解层级。
- **自包含摘要**：详情页首段为约 150 字内的独立摘要（`detail-summary`），满足「前 150 字可独立理解」的 AI 提取建议。
- **元数据**：各页 `generateMetadata` 提供 `title`、`description`、`openGraph`、`alternates.canonical`；根 layout 设置 `metadataBase`、`robots`。
- **sitemap 与 robots**：`/sitemap.xml` 动态生成（首页、各数据源列表、各条目详情）；`/robots.txt` 允许抓取并指向 sitemap。

**配置**：通过环境变量 `NEXT_PUBLIC_SITE_URL` 设置站点根 URL（用于 canonical、OG、sitemap）。未设置时在 Vercel 上会使用 `VERCEL_URL`。

## 发布到互联网

要把本站部署到公网，需要做三件事：**托管数据库**、**部署 Next.js 应用**、**配置环境变量**。推荐组合：**Vercel（应用）+ 托管 PostgreSQL（数据库）**。

### 1. 生产环境使用 PostgreSQL（必做）

当前本地使用 SQLite（`file:./dev.db`），Vercel 等无状态平台没有持久化磁盘，**生产环境必须使用托管数据库**。本项目的 Prisma 模型与 SQLite/PostgreSQL 兼容，只需改连接方式。

1. **选一个托管 PostgreSQL 服务**（任选其一即可）  
   - [Vercel Postgres](https://vercel.com/storage/postgres)（与 Vercel 集成最好）  
   - [Supabase](https://supabase.com)（免费额度大）  
   - [Neon](https://neon.tech)（按量、免费层可用）  
   - [Railway](https://railway.app)（可同时部署应用+数据库）

2. **创建数据库并拿到连接串**  
   在对应控制台创建项目/数据库，复制 **PostgreSQL 连接 URL**，格式类似：  
   `postgresql://用户:密码@主机:5432/数据库名?sslmode=require`

3. **修改 Prisma 使用 PostgreSQL**  
   在 `prisma/schema.prisma` 中，把：

   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

   改为：

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

4. **本地开发保留 SQLite（可选）**  
   若希望本地继续用 SQLite、仅生产用 PostgreSQL，可以：  
   - 本地 `.env` 保持 `DATABASE_URL="file:./dev.db"`，且 schema 里 `provider = "sqlite"`；  
   - 部署前改为 `provider = "postgresql"` 并在 Vercel 等平台配置生产用 `DATABASE_URL`；  
   或使用多环境 schema（如 `schema.pg.prisma`）在 CI/部署时切换。

5. **在生产库执行迁移**  
   在**本地**把 `DATABASE_URL` 指向生产 PostgreSQL（可新建 `.env.production` 仅用于跑迁移），执行：

   ```bash
   npx prisma generate
   npx prisma db push
   ```

   若已有数据需迁移，可用 `prisma migrate` 做正式迁移。

### 2. 部署 Next.js 到 Vercel（推荐）

1. **把代码推到 GitHub**  
   若尚未使用 Git，在项目根目录执行：

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

   在 [GitHub](https://github.com) 新建仓库，按页面提示关联并 push。

2. **在 Vercel 导入项目**  
   - 打开 [vercel.com](https://vercel.com)，用 GitHub 登录。  
   - 点击 “Add New…” → “Project”，选择你的 `trends-aggregator` 仓库。  
   - Framework 选 **Next.js**，保持默认构建命令与输出目录即可。

3. **配置环境变量**  
   在 Vercel 项目 → Settings → Environment Variables 中新增：

   | 变量名 | 说明 | 示例 |
   |--------|------|------|
   | `DATABASE_URL` | 生产 PostgreSQL 连接串（必填） | `postgresql://...?sslmode=require` |
   | `NEXT_PUBLIC_SITE_URL` | 站点根 URL（用于 SEO、sitemap） | `https://你的域名.vercel.app` 或自定义域名 |

   保存后触发一次重新部署（Deployments → 最新部署 → Redeploy）。

4. **首次部署后初始化数据**  
   - 若使用种子数据：在**本地**用生产 `DATABASE_URL` 执行一次 `npm run db:seed`。  
   - 若用 Python 爬虫写库：确保爬虫连接同一生产 `DATABASE_URL`，先跑一遍写入数据源和趋势数据。

5. **（可选）绑定自定义域名**  
   在 Vercel 项目 → Settings → Domains 中添加你的域名，按提示在域名服务商处添加 CNAME 或 A 记录。

### 3. 其他部署方式简述

- **Railway / Render**  
  可在一个项目里同时部署 Next.js 和 PostgreSQL，适合希望“应用+数据库”同平台管理。  
  步骤：新建项目 → 添加 PostgreSQL 服务 → 添加 Web 服务并连接本仓库 → 配置 `DATABASE_URL` 和 `NEXT_PUBLIC_SITE_URL` → 构建命令 `npm run build`，启动命令 `npm run start`。

- **自建 VPS（如 Linux + Nginx + PM2）**  
  在服务器安装 Node.js、PostgreSQL，克隆仓库后 `npm run build && npm run start`，用 Nginx 反代 3000 端口；数据库用服务器本机 PostgreSQL 或远程托管均可。适合对运维有要求的场景。

### 4. 爬虫与生产数据

- **Python 爬虫**：在本地或任意能访问公网的机器上运行即可。把该环境的 `DATABASE_URL` 设为与 Vercel 使用的**同一生产 PostgreSQL 连接串**，爬虫写入的数据会直接出现在已部署的网站上。  
- **定时更新**：可用本机 cron、GitHub Actions 或云函数定时执行爬虫脚本，保证榜单定期更新。

### 5. 发布前检查清单

- [ ] 已创建生产用 PostgreSQL 并拿到连接串  
- [ ] `prisma/schema.prisma` 中 `provider` 已改为 `postgresql`（若生产用 PG）  
- [ ] 已在部署平台配置 `DATABASE_URL` 和（建议）`NEXT_PUBLIC_SITE_URL`  
- [ ] 已执行 `prisma db push` 或 `prisma migrate` 初始化生产表结构  
- [ ] 已通过爬虫或 seed 写入至少一个数据源和若干趋势数据，便于上线后验证  

完成以上步骤后，你的趋势站即可通过 Vercel 提供的 URL 或自定义域名在互联网访问。

---

## 后续可做

- 列表筛选与排序（按分类、增长率、日期）。
