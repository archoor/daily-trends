# script — 采集与入库脚本

本目录用于存放**采集数据**和**更新数据库**的 Python 脚本。

**采集方案设计**：在动手写代码前，可先阅读 [COLLECTION_DESIGN.md](./COLLECTION_DESIGN.md)，其中给出了数据策略、脚本组织、调度方式等可选方案及推荐组合，便于你选定后再实现。

## 用途

- **采集**：从各数据源（如 Toolify、GitHub、Product Hunt、Google 趋势等）抓取趋势数据。
- **入库**：将采集结果写入本项目使用的数据库（与 Next.js 应用共用同一 `DATABASE_URL`）。

## 约定

- 脚本需按 `prisma/schema.prisma` 中的模型与表结构写入数据。
- 数据源 slug 需与 `config/sources.ts` 一致（如 `toolify`、`github`、`product-hunt`、`google-trends`）。
- 表名与字段说明见项目根目录 `README.md` 中「数据库约定（供外部爬虫使用）」一节。

## 环境

- 使用项目根目录的 `.env` 中的 `DATABASE_URL`，或在本目录下单独配置与主项目相同的数据库连接。
- 建议使用 Python 3.9+，依赖见 `pyproject.toml`（beautifulsoup4、requests）。
- **Firecrawl 采集**（Toolify、Product Hunt）：需设置环境变量 `FIRECRAWL_API_KEY`。
- **页面总结（Gemini）**：若希望在采集结束后自动生成详情页中文总结，需要在 `.env` 中配置：
  - `GEMINI_API_KEY`：Google Gemini 的 API Key；
  - （可选）`GEMINI_MODEL`：模型名称，默认 `gemini-1.5-flash`。

## 脚本一览

| 脚本 | 说明 | 运行方式 |
|------|------|----------|
| `toolify_firecrawl.py` | 使用 Firecrawl 抓取 [Toolify AI 趋势页](https://www.toolify.ai/zh/Best-trending-AI-Tools)，解析 `div.tTable` 中的工具列表（排行、名称、月访问量、增长、增长率、介绍、标签） | 仅抓取+解析，不写库；被 `toolify_trends.py` 调用 |
| `toolify_trends.py` | 采集 Toolify AI 趋势并写入 `toolify_trend_item` 表（数据源 slug: `toolify`） | 在项目根目录执行：`python script/toolify_trends.py`，需 `DATABASE_URL`、`FIRECRAWL_API_KEY` |
| `product_hunt_firecrawl.py` | 使用 Firecrawl 抓取 Product Hunt 首页今日产品列表 | 被 `product_hunt_trends.py` 调用 |
| `product_hunt_trends.py` | 采集 Product Hunt 今日产品并写入 `product_hunt_trend_item` 表 | 在项目根目录执行：`python script/product_hunt_trends.py`，需 `DATABASE_URL`、`FIRECRAWL_API_KEY` |

> 提示：若配置了 `GEMINI_API_KEY`，上述四个入库脚本在完成列表写入后，会自动按数据源读取各自的总结提示词（见 `script/prompts/*.txt`），
> 调用 Gemini 生成每条记录的中文摘要，并写入对应的 `*_trend_detail.description` 字段，供前端详情页直接使用。
