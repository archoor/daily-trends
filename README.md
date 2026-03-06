# 趋势聚合 | Daily Trends

从数据库读取多数据源趋势数据并展示的 Next.js 应用（App Router + TypeScript + Prisma）。**本项目仅负责读取与展示，不包含网页抓取逻辑；数据由外部 Python 爬虫程序写入同一数据库。**

## 功能概览

- **多数据源**：每个趋势站对应独立列表页与详情页，通过顶部菜单切换。
- **数据来源**：数据库（PostgreSQL，推荐 Vercel Postgres）。由你在其他项目（如 Python 爬虫）中按本项目的 Prisma schema 写入 `DataSource` 及各数据源对应的趋势表（如 Toolify 源：`toolify_trend_item`、`toolify_trend_detail`；Google 趋势源：`google_trend_item`、`google_trend_detail`）。
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
   # 编辑 .env 中的 DATABASE_URL 为 PostgreSQL 连接串（与爬虫使用同一数据库；Vercel 部署时用 Vercel Postgres 提供的连接串）
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
| 数据源按日总结存档   | `source_daily_summary`    | `SourceDailySummary`    |

- **DataSource（表 `data_source`）**：每个趋势站一条，`slug` 与 `config/sources.ts` 一致（如 `toolify`、`github`）。
- **ToolifyTrendItem（表 `toolify_trend_item`）**：`sourceId` 关联 DataSource；`externalId`、`snapshotAt` 与 `sourceId` 联合唯一；`slug` 用于详情页 URL。字段与 Toolify 列表表头对应：`rank`、`name`、`url`、`monthlyVisits`（BigInt）、`growthDisplay`、`growthRate`、`summary`、`tags`。
- **ToolifyTrendDetail（表 `toolify_trend_detail`）**：可选，`description` 存详情页长描述；`rawJson` 可存自定义字段。
- **GitHubTrendItem（表 `github_trend_item`）**：`sourceId` 关联 DataSource；`externalId` 一般为 `owner/repo`；`slug` 用于详情页 URL（如 `owner-repo`）。字段与 GitHub Trending Repositories 列表对齐：`rank`、`repoFullName`、`description`、`language`、`stars`、`forks`、`starsToday`、`dateRange`（如 today/weekly/monthly）、`builtByJson`（贡献者 JSON）、`url`（仓库链接）。**增长率**由前端按「今日新增星标 ÷ 星标数 × 100」计算并展示，不落库。
- **GitHubTrendDetail（表 `github_trend_detail`）**：可选，`description` 存详情页长描述；`rawJson` 可存自定义字段。
- **ProductHuntTrendItem（表 `product_hunt_trend_item`）**：`sourceId` 关联 DataSource；`externalId` 一般为产品 slug；`slug` 用于详情页 URL。字段与 Product Hunt 热点商品列表对齐：`rank`、`name`、`description`、`iconUrl`、`categories`（类别/标签，逗号或 "•" 分隔）、`commentCount`、`upvoteCount`、`url`（产品链接）。
- **ProductHuntTrendDetail（表 `product_hunt_trend_detail`）**：可选，`description` 存详情页长描述；`rawJson` 可存自定义字段。
- **GoogleTrendItem（表 `google_trend_item`）**：`sourceId` 关联 DataSource；`externalId` 一般为趋势词条名；`slug` 用于详情页 URL。字段与 Google 趋势页对齐：`rank`、`name`、`searchVolume`（BigInt）、`searchVolumeDisplay`（如 "500万+"）、`growthRate`（增长百分比）、`startedAt`、`endedAt`（趋势结束时间）、`isActive`、`relatedKeywords`（JSON 数组字符串）、`moreRelatedCount`。
- **GoogleTrendDetail（表 `google_trend_detail`）**：可选，`description` 存详情页长描述；`rawJson` 可存自定义字段。
- **SourceDailySummary（表 `source_daily_summary`）**：按日存档列表页总结。`sourceId` 关联 DataSource，`snapshotDate` 为日期字符串（yyyy-mm-dd），与趋势条目的采集日对齐；`description` / `descriptionZh` 为该日榜单的中英文总结。爬虫每次采集会 upsert 当天的总结；列表页切换日期时展示对应日期的总结。

新增数据源时：在 `config/sources.ts` 增加配置，在 schema 中增加该源的 `XxxTrendItem`/`XxxTrendDetail` 及 `@@map("xxx_trend_item")`，并在 `lib/api/trends.ts` 中按 `source.slug` 分发查询对应表，爬虫写入对应 `DataSource` 及该源表即可。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Prisma 用 PostgreSQL 连接串（需与爬虫使用同一库）。Vercel 上绑定 Vercel Postgres 后，在 Environment Variables 中把 Storage 提供的 `POSTGRES_PRISMA_URL` 填到 `DATABASE_URL`（或直接复制其值） |
| `FIRECRAWL_API_KEY` | Firecrawl API 密钥；采集 Toolify AI、Product Hunt 等脚本需要 |
| `NEXT_PUBLIC_SITE_URL` | 站点根 URL（可选），用于 SEO 的 canonical、Open Graph、sitemap；未设置时生产环境会使用 Vercel 的 `VERCEL_URL` |
| `SOURCE_DB_PATH` | （仅迁移脚本）SQLite 数据库文件路径，默认 `prisma/dev.db` |

## 从 SQLite (dev.db) 迁移到 Postgres

若之前本地使用过 `dev.db`，需要把数据迁到当前 Postgres（如 Vercel Postgres）：

1. 确保 `.env` 中 `DATABASE_URL` 已指向目标 Postgres。
2. 将原来的 SQLite 文件放到 `prisma/dev.db`（或设置环境变量 `SOURCE_DB_PATH` 指向该文件）。
3. 执行：`npm run db:migrate-from-sqlite`。

默认行为：迁移全部表后，会删除 slug 为 `toolify`、`github`、`producthunt` 的 DataSource 及其下所有趋势条目与详情（与种子脚本一致，视为测试数据）。**若希望迁移后各表条数与 dev.db 完全一致、不删除任何记录**，请先设置环境变量再执行：`MIGRATE_SKIP_DELETE_TEST_DATA=1 npm run db:migrate-from-sqlite`。

## 脚本说明

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` / `npm run start` | 构建与生产启动 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:push` | 推送 schema 到数据库（开发） |
| `npm run db:seed` | 执行种子脚本，插入测试趋势数据（DataSource + TrendItem + TrendDetail） |
| `npm run db:studio` | 打开 Prisma Studio 查看数据 |
| `npm run db:migrate-from-sqlite` | 将 `prisma/dev.db`（或 `SOURCE_DB_PATH`）迁移到当前 Postgres；默认会删除测试数据源（toolify/github/producthunt）。需保留全部数据时执行：`MIGRATE_SKIP_DELETE_TEST_DATA=1 npm run db:migrate-from-sqlite` |

## 界面与样式

- **界面语言**：支持中英文切换。导航、标题、表头、按钮等 UI 文案默认英文，在 URL 中加 `?lang=zh` 或通过右上角语言切换按钮可切到中文界面；榜单表格中的**数据内容**（工具名、描述、标签等来自数据库）保持爬虫写入的原文。
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

### 数据源页面总结的中英文

- 数据库表 `data_source` 中：
  - `description` 存储**英文页面总结**（由各采集脚本在写入趋势数据时调用 Gemini 生成）；
  - `descriptionZh` 存储**对应的中文页面总结**。
- 前端列表页在英文界面（默认或 `?lang=en`）下优先使用 `description`，在中文界面（`?lang=zh`）下优先使用 `descriptionZh`，找不到时回退到英文或配置文案。
- 生成中文总结的推荐流程：
  1. 先运行各采集脚本（如 `python script/toolify_trends.py`、`python script/github_trends.py`、`python script/google_trends.py`），让它们写入/更新 `data_source.description`。
  2. 再运行：
     ```bash
     python script/translate_data_source_descriptions_zh.py
     ```
     脚本会读取所有 `description` 非空且 `descriptionZh` 为空的数据源，通过 Gemini 翻译+改写为简体中文，并写回 `descriptionZh`。

## 发布到互联网

要把本站部署到公网，需要做三件事：**托管数据库**、**部署 Next.js 应用**、**配置环境变量**。推荐组合：**Vercel（应用）+ 托管 PostgreSQL（数据库）**。

### 1. 使用 Vercel Postgres（推荐）

本项目已配置为使用 **PostgreSQL**（`prisma/schema.prisma` 中 `provider = "postgresql"`），推荐直接使用 [Vercel Postgres](https://vercel.com/storage/postgres) 与 Vercel 部署集成。

1. **在 Vercel 项目中创建 Postgres 存储**  
   - 打开 Vercel 项目 → Storage → Create Database → 选择 **Postgres**。  
   - 创建完成后，Vercel 会自动注入环境变量（如 `POSTGRES_PRISMA_URL`、`POSTGRES_URL` 等）。

2. **配置 `DATABASE_URL`**  
   - 在 Vercel 项目 → Settings → Environment Variables 中新增：  
     - **Name**: `DATABASE_URL`  
     - **Value**: 复制 Storage 页中 **Prisma** 对应的连接串（即 `POSTGRES_PRISMA_URL` 的值）。  
   - 本地开发：在 `.env` 中同样设置 `DATABASE_URL` 为同一连接串（或本地/其他 Postgres 地址），便于本地跑应用和迁移。

3. **在生产库执行迁移**  
   在**本地**将 `.env` 的 `DATABASE_URL` 指向 Vercel Postgres（或生产用 Postgres），执行：

   ```bash
   npx prisma generate
   npx prisma db push
   ```

   若已有数据需迁移，可用 `prisma migrate` 做正式迁移。

4. **其他托管 PostgreSQL**  
   若使用 [Supabase](https://supabase.com)、[Neon](https://neon.tech)、[Railway](https://railway.app) 等，只需将各自的 **PostgreSQL 连接 URL** 配置到 `DATABASE_URL` 即可，无需改代码。

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
   | `DATABASE_URL` | 生产 PostgreSQL 连接串（必填）。若已绑定 Vercel Postgres，填 Storage 中的 `POSTGRES_PRISMA_URL` 的值 | `postgresql://...?sslmode=require` |
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

- [ ] 已创建生产用 PostgreSQL（如 Vercel Postgres）并拿到连接串  
- [ ] 已在部署平台配置 `DATABASE_URL`（Vercel Postgres 则填 `POSTGRES_PRISMA_URL` 的值）和（建议）`NEXT_PUBLIC_SITE_URL`  
- [ ] 已执行 `prisma db push` 或 `prisma migrate` 初始化生产表结构  
- [ ] 已通过爬虫或 seed 写入至少一个数据源和若干趋势数据，便于上线后验证  

完成以上步骤后，你的趋势站即可通过 Vercel 提供的 URL 或自定义域名在互联网访问。

---

## 按天采集 + 日期选择（改造方案）

若要将系统改为**每天趋势采集并保存**，并在列表页/详情页支持**选择日期查看对应日期的趋势**，需做以下修改。

### 目标行为

- **采集**：爬虫每天跑一次（或多次），以「当天日期」为快照日写入；同一天同一条目只保留一条（upsert），历史多天数据都保留。
- **列表页**：默认展示「最新有数据的那天」的榜单；提供日期选择（如下拉或日期控件），选某天后展示该天的榜单。
- **详情页**：进入某条趋势（如某 repo、某产品）后，默认展示该条「最新一天」的数据；提供日期选择，切换后展示该条在所选日期的数据（若该日无此条可 404 或提示）。

### 1. 数据库（Prisma）

- **无需改 schema**。当前各趋势表已有 `snapshotAt` 和 `@@unique([sourceId, externalId, snapshotAt])`，已支持按天多版本存储。
- 确保爬虫写入时 `snapshotAt` 使用**当天 0 点**（或统一时区的一日），便于「按天」筛选和去重。

### 2. 采集脚本（Python）

涉及：`script/github_trends.py`、`script/toolify_trends.py`、`script/product_hunt_trends.py`、`script/google_trends.py`。

**当前已实现**（仅覆盖采集当天、保留历史）：

- **snapshotAt 取值**：使用「当天 0 点 UTC」`datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)`，同一天多次跑视为同一天快照。
- **写入方式**：先 **DELETE 仅当天**（`WHERE "sourceId" = %s AND DATE("snapshotAt") = %s`），再 **INSERT** 本次结果；其他日期的数据不删，历史保留。
- 有详情表的源（Toolify、Product Hunt、Google）：先删「当天」的 detail（通过 trendId 关联），再删当天的 item，再插入。

### 3. 后端 API（`lib/api/trends.ts`）

- **`getTrendListBySource(sourceId, options?)`**
  - 当**不传** `snapshotAt` 时：先查该数据源下**最大 snapshotAt 的「日期」**（按天），再用该日期的 0 点～24 点过滤列表，使默认列表只展示「最新一天」的数据，避免多天混合、同一 slug 重复。
  - 当**传入** `snapshotAt`（某天 0 点）时：仅返回该日期的列表（现有逻辑已支持，保持即可）。
- **新增 `getAvailableSnapshotDates(sourceId, limit?)`**  
  返回该数据源在库中有数据的**日期列表**（如 `Date[]` 或 ISO 日期字符串），用于列表页/详情页的日期选择器（如最近 30 天）。
- **`getTrendBySourceAndSlug(sourceId, slug, options?)`**
  - 增加可选参数 `options?.snapshotAt?: Date`。若传入，则查询 `sourceId + slug + 该 snapshotAt 所在天` 的那一条；不传则保持现有逻辑（按 `slug` + `orderBy: snapshotAt desc` 取最新一条）。
- **可选：`getAvailableDatesForSlug(sourceId, slug)`**  
  返回某条趋势（slug）在库中有数据的日期列表，用于详情页「仅可选该条有数据的日期」；若实现复杂，可先用「数据源可用日期」列表，选到某天无该条时再 404 或提示。

### 4. 列表页（`app/trends/[sourceId]/page.tsx`）

- 从 `searchParams` 读取 `date`（如 `yyyy-mm-dd`），可选。
- 若有 `date`：转成 `Date`（当天 0 点）传给 `getTrendListBySource(source.id, { snapshotAt, limit: 100 })`。
- 若无 `date`：不传 `snapshotAt`，由 API 内部用「最新有数据日期」过滤（见上）。
- 在页面上增加**日期选择**组件（下拉或 `<input type="date">`）：
  - 选项来自 `getAvailableSnapshotDates(source.id)`（或前端请求一个返回日期列表的 API）。
  - 选择后跳转到当前列表页并带上 `?date=yyyy-mm-dd`（保留现有 `lang` 等参数）。
- 列表表格旁可展示当前查看的日期（如「2025-03-06 的榜单」）。

### 5. 详情页（`app/trends/[sourceId]/[id]/page.tsx`）

- 从 `searchParams` 读取 `date`（如 `yyyy-mm-dd`），可选。
- 调用 `getTrendBySourceAndSlug(source.id, id, { snapshotAt: date ? 当天 0 点 : undefined })`，若有 `date` 则查该日期的该条，否则查最新一条。
- 在页面上增加**日期选择**控件（下拉或按钮组）：
  - 选项可为「该数据源可用日期」或「该 slug 可用日期」；默认选中当前展示数据对应的日期。
  - 点击某日期后跳转到当前详情页并带上 `?date=yyyy-mm-dd`（保留 `lang`），重新拉取该日期的详情。
- 若所选日期在该 slug 下无数据：返回 404 或展示「该日无此条」的提示。

### 6. 路由与 URL

- 列表页：`/trends/[sourceId]?date=yyyy-mm-dd`、`?lang=zh` 等保持兼容。
- 详情页：`/trends/[sourceId]/[id]?date=yyyy-mm-dd`、`?lang=zh` 等保持兼容。
- SEO：canonical 可继续用「无 date 的 URL」表示默认（最新）；带 `date` 的 URL 视为同一页面的参数化视图，按需在 sitemap 中只包含默认 URL 或也包含近期日期（视需求而定）。

### 7. 小结表

| 模块 | 修改内容 |
|------|----------|
| Prisma schema | 无需修改 |
| 各采集脚本 | snapshotAt 用当天 0 点；写入改为 upsert，保留历史 |
| `lib/api/trends.ts` | 列表默认「最新一天」；新增可用日期 API；详情支持按 snapshotAt 查询 |
| 列表页 | 读 `date` 参数；调 API 时传 snapshotAt；增加日期选择组件 |
| 详情页 | 读 `date` 参数；调 API 时传 snapshotAt；增加日期选择组件 |

按上述顺序实施即可实现「每天趋势采集并保存」和「列表/详情页按日期查看」。

---

## 后续可做

- 列表筛选与排序（按分类、增长率、日期）。
