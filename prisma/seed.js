/**
 * 种子脚本：插入 Toolify、GitHub、Product Hunt 趋势示例数据
 * 运行：npx prisma db seed 或 npm run db:seed
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function parseVisits(value) {
  const s = String(value).trim().toUpperCase().replace(/,/g, "");
  if (s.endsWith("B")) return BigInt(Math.round(parseFloat(s) * 1e9));
  if (s.endsWith("M")) return BigInt(Math.round(parseFloat(s) * 1e6));
  if (s.endsWith("K")) return BigInt(Math.round(parseFloat(s) * 1e3));
  return BigInt(parseInt(s, 10) || 0);
}

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[&\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function repoToSlug(repoFullName) {
  return repoFullName.replace(/\//g, "-").toLowerCase();
}

const TEST_TRENDS = [
  { rank: 1, name: "Gemini & Gemini Advanced", url: "https://gemini.google.com", monthlyVisits: "2.1B", growthDisplay: "333.3M", growthRate: 19.21, summary: "谷歌的个人、主动而强大的AI助手。", tags: "AI助手, 对话AI, 谷歌AI, 生产力工具, 写作助手, 研究工具, 内容创作, 个人助手" },
  { rank: 2, name: "ChatGPT", url: "https://chat.openai.com", monthlyVisits: "5.7B", growthDisplay: "1.2B", growthRate: 26.67, summary: "OpenAI 的对话式 AI，支持写作、编程与多模态交互。", tags: "AI助手, 对话AI, 写作助手, 编程助手, 生产力工具" },
  { rank: 3, name: "Claude", url: "https://claude.ai", monthlyVisits: "1.8B", growthDisplay: "420M", growthRate: 30.43, summary: "Anthropic 的 AI 助手，擅长长文本分析与安全对话。", tags: "AI助手, 对话AI, 写作助手, 研究工具, 内容创作" },
  { rank: 4, name: "Perplexity", url: "https://perplexity.ai", monthlyVisits: "890M", growthDisplay: "180M", growthRate: 25.35, summary: "AI 驱动的搜索引擎，直接给出答案与引用。", tags: "搜索, 研究工具, AI助手, 生产力工具" },
  { rank: 5, name: "Character.AI", url: "https://character.ai", monthlyVisits: "520M", growthDisplay: "85M", growthRate: 19.54, summary: "与虚拟角色对话的 AI 平台。", tags: "对话AI, 娱乐, 角色扮演" },
  { rank: 6, name: "Google AI (Bard/Duo)", url: "https://bard.google.com", monthlyVisits: "410M", growthDisplay: "92M", growthRate: 28.94, summary: "谷歌多模态 AI，集成搜索与创作。", tags: "AI助手, 对话AI, 谷歌AI, 生产力工具" },
  { rank: 7, name: "QuillBot", url: "https://quillbot.com", monthlyVisits: "380M", growthDisplay: "45M", growthRate: 13.43, summary: "AI 改写与语法检查工具。", tags: "写作助手, 语法检查, 内容创作" },
  { rank: 8, name: "Midjourney", url: "https://midjourney.com", monthlyVisits: "295M", growthDisplay: "62M", growthRate: 26.61, summary: "通过文字描述生成高质量图像的 AI。", tags: "图像生成, 创意工具, 内容创作" },
  { rank: 9, name: "Grammarly", url: "https://grammarly.com", monthlyVisits: "270M", growthDisplay: "28M", growthRate: 11.57, summary: "英文写作与语法纠正助手。", tags: "写作助手, 语法检查, 生产力工具" },
  { rank: 10, name: "Poe", url: "https://poe.com", monthlyVisits: "185M", growthDisplay: "38M", growthRate: 25.85, summary: "多模型 AI 聊天平台，可切换不同机器人。", tags: "对话AI, AI助手, 多模型" },
];

const GITHUB_TRENDS = [
  { rank: 1, repoFullName: "ruvnet/wifi-densepose", description: "Production-ready implementation of InvisPose - a revolutionary WiFi-based dense human pose estimation system that enables real-time full-body tracking through walls using commodity mesh routers", language: "Python", stars: 9034, forks: 843, starsToday: 362, url: "https://github.com/ruvnet/wifi-densepose" },
  { rank: 2, repoFullName: "bytedance/deer-flow", description: "An open-source SuperAgent harness that researches, codes, and creates. With the help of sandboxes, memories, tools, skills and subagents, it handles different levels of tasks that could take minutes to hours.", language: "TypeScript", stars: 21801, forks: 2665, starsToday: 692, url: "https://github.com/bytedance/deer-flow" },
  { rank: 3, repoFullName: "moonshine-ai/moonshine", description: "Fast and accurate automatic speech recognition (ASR) for edge devices", language: "C", stars: 5801, forks: 273, starsToday: 587, url: "https://github.com/moonshine-ai/moonshine" },
  { rank: 4, repoFullName: "muratcankoylan/Agent-Skills-for-Context-Engineering", description: "A comprehensive collection of Agent Skills for context engineering, multi-agent architectures, and production agent systems. Use when building, optimizing, or debugging agent systems that require effective context management.", language: "Python", stars: 12347, forks: 958, starsToday: 836, url: "https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering" },
];

// 根据图片中的 Product Hunt 列表：排行、名称、描述、类别、评论数、点赞数
const PH_TRENDS = [
  { rank: 1, name: "Superset", description: "在你的机器上运行Claude Code、Codex等大语言模型。", categories: "Productivity • Developer Tools • Artificial Intelligence", commentCount: 54, upvoteCount: 401, url: "https://www.producthunt.com/posts/superset" },
  { rank: 2, name: "Claude Code Remote Control", description: "通过远程控制从任何设备继续本地会话。", categories: "Android • Developer Tools • Artificial Intelligence", commentCount: 10, upvoteCount: 351, url: "https://www.producthunt.com/posts/claude-code-remote-control" },
  { rank: 3, name: "Perplexity Computer", description: "人工智能能做的一切，Perplexity Computer都能为你做到。", categories: "Artificial Intelligence", commentCount: 8, upvoteCount: 301, url: "https://www.producthunt.com/posts/perplexity-computer" },
  { rank: 4, name: "Nano Banana 2", description: "谷歌最新的AI图像生成模型。", categories: "Artificial Intelligence • Graphics & Design • Design", commentCount: 5, upvoteCount: 287, url: "https://www.producthunt.com/posts/nano-banana-2" },
];

// Google 趋势示例（趋势名称、搜索量、增长、已开始、趋势细分）
const GOOGLE_TRENDS = [
  { rank: 1, name: "iran", searchVolumeDisplay: "500万+", searchVolume: 5000000, growthRate: 1000, startedAtHoursAgo: 16, relatedKeywords: ["iran news", "khamenei", "ayatollah khomeini"], moreRelatedCount: 351 },
  { rank: 2, name: "dubai", searchVolumeDisplay: "50万+", searchVolume: 500000, growthRate: 500, startedAtHoursAgo: 14, relatedKeywords: ["dubai weather", "dubai mall", "visit dubai"], moreRelatedCount: 34 },
  { rank: 3, name: "novak", searchVolumeDisplay: "10万+", searchVolume: 100000, growthRate: 350, startedAtHoursAgo: 17, relatedKeywords: ["novak djokovic", "novak tennis"], moreRelatedCount: 12 },
  { rank: 4, name: "barcelona - villarreal", searchVolumeDisplay: "20万+", searchVolume: 200000, growthRate: 800, startedAtHoursAgo: 8, relatedKeywords: ["barcelona vs villarreal", "laliga"], moreRelatedCount: 28 },
  { rank: 5, name: "elimination chamber 2026", searchVolumeDisplay: "5万+", searchVolume: 50000, growthRate: 1200, startedAtHoursAgo: 23, relatedKeywords: ["wwe elimination chamber", "elimination chamber results"], moreRelatedCount: 15 },
  { rank: 6, name: "real oviedo - atlético madrid", searchVolumeDisplay: "5万+", searchVolume: 50000, growthRate: 600, startedAtHoursAgo: 3, relatedKeywords: ["real oviedo", "atletico madrid"], moreRelatedCount: 22 },
];

// SerpAPI Google 趋势样例数据（query、start/end_timestamp、active、search_volume、increase_percentage、categories、trend_breakdown、链接等）
const SERPAPI_GOOGLE_TRENDS = [
  {
    query: "iihf world juniors",
    start_timestamp: 1767394800,
    end_timestamp: 1767411000,
    active: false,
    search_volume: 10000,
    increase_percentage: 100,
    categories: [{ id: 17, name: "Sports" }],
    trend_breakdown: [
      "usa world juniors", "world juniors", "usa vs finland world juniors", "iihf", "usa vs finland",
      "world junior ice hockey championships", "usa junior hockey", "usa vs finland score",
      "usa world juniors score", "world juniors 2026 scores",
    ],
    serpapi_google_trends_link: "https://serpapi.com/search.json?data_type=TIMESERIES&date=now+1-d&engine=google_trends&geo=US&hl=en&q=iihf+world+juniors&tz=420",
    news_page_token: "jQ-LJHica1xTlFpYmlpcEp-SWJJ4h0Fk8nkGBgZGliUXnBal5i0KDYby16t5o_APfNRG5jM9Z5ZGke85vgeFv88wB4Uvn_0Ghd8mK4_C1ykwQOGbb-RB4S-e64zC56vKROGv4j6LwveZEYTCL5Y7h8LfKsKMwg_eOx-FrymphcLfUymCGh6aayF8AJEsc4A",
    serpapi_news_link: "https://serpapi.com/search.json?engine=google_trends_news&page_token=jQ-LJHica1xTlFpYmlpcEp-SWJJ4h0Fk8nkGBgZGliUXnBal5i0KDYby16t5o_APfNRG5jM9Z5ZGke85vgeFv88wB4Uvn_0Ghd8mK4_C1ykwQOGbb-RB4S-e64zC56vKROGv4j6LwveZEYTCL5Y7h8LfKsKMwg_eOx-FrymphcLfUymCGh6aayF8AJEsc4A",
  },
  {
    query: "wayne gretzky",
    start_timestamp: 1767399600,
    end_timestamp: 1767418800,
    active: false,
    search_volume: 5000,
    increase_percentage: 300,
    categories: [{ id: 17, name: "Sports" }, { id: 4, name: "Entertainment" }],
    trend_breakdown: [],
    serpapi_google_trends_link: "https://serpapi.com/search.json?data_type=TIMESERIES&date=now+1-d&engine=google_trends&geo=US&hl=en&q=wayne+gretzky&tz=420",
    news_page_token: "LODoO3ica1xTlFpYmlpcEp-SWJI4Y_J5BgYGRpZVtfKLUvMWhQbD-InrUPiKb96j8Hef8Ubhu-c-QOHvtHJH4S9yvYbCX7EPqh4AIMk1lg",
    serpapi_news_link: "https://serpapi.com/search.json?engine=google_trends_news&page_token=LODoO3ica1xTlFpYmlpcEp-SWJI4Y_J5BgYGRpZVtfKLUvMWhQbD-InrUPiKb96j8Hef8Ubhu-c-QOHvtHJH4S9yvYbCX7EPqh4AIMk1lg",
  },
  {
    query: "alex honnold",
    start_timestamp: 1767404400,
    end_timestamp: 1767424200,
    active: false,
    search_volume: 5000,
    increase_percentage: 100,
    categories: [{ id: 4, name: "Entertainment" }],
    trend_breakdown: [],
    serpapi_google_trends_link: "https://serpapi.com/search.json?data_type=TIMESERIES&date=now+1-d&engine=google_trends&geo=US&hl=en&q=alex+honnold&tz=420",
    news_page_token: "7eb6aHica1xTlFpYmlpcEp-SWJI4cfJ5BgYGRpb6MJ1FqXmLQoMBy_oL6A",
    serpapi_news_link: "https://serpapi.com/search.json?engine=google_trends_news&page_token=7eb6aHica1xTlFpYmlpcEp-SWJI4cfJ5BgYGRpb6MJ1FqXmLQoMBy_oL6A",
  },
];

const SOURCE_SLUG = "toolify";
const SNAPSHOT_DATE = new Date();
SNAPSHOT_DATE.setHours(0, 0, 0, 0);

async function main() {
  console.log("[seed] 开始插入测试数据...");

  let source = await prisma.dataSource.findUnique({ where: { slug: SOURCE_SLUG } });
  if (!source) {
    source = await prisma.dataSource.create({
      data: { slug: SOURCE_SLUG, name: "AI Tools", baseUrl: "https://www.toolify.ai", isActive: true },
    });
    console.log("[seed] 已创建数据源:", source.slug);
  } else {
    console.log("[seed] 使用已有数据源:", source.slug);
  }

  let created = 0;
  let skipped = 0;

  for (const row of TEST_TRENDS) {
    const externalId = toSlug(row.name) || "tool-" + row.rank;
    const slug = externalId;
    try {
      await prisma.toolifyTrendItem.upsert({
        where: {
          sourceId_externalId_snapshotAt: {
            sourceId: source.id,
            externalId,
            snapshotAt: SNAPSHOT_DATE,
          },
        },
        create: {
          sourceId: source.id,
          externalId,
          slug,
          rank: row.rank,
          name: row.name,
          url: row.url,
          monthlyVisits: parseVisits(row.monthlyVisits),
          growthDisplay: row.growthDisplay,
          growthRate: row.growthRate,
          summary: row.summary,
          tags: row.tags,
          snapshotAt: SNAPSHOT_DATE,
        },
        update: {
          rank: row.rank,
          name: row.name,
          url: row.url,
          monthlyVisits: parseVisits(row.monthlyVisits),
          growthDisplay: row.growthDisplay,
          growthRate: row.growthRate,
          summary: row.summary,
          tags: row.tags,
        },
      });
      created++;
    } catch (e) {
      console.warn("[seed] 跳过或更新失败:", row.name, e);
      skipped++;
    }
  }

  const items = await prisma.toolifyTrendItem.findMany({
    where: { sourceId: source.id, snapshotAt: SNAPSHOT_DATE },
    orderBy: { rank: "asc" },
    take: 3,
  });

  for (const item of items) {
    const row = TEST_TRENDS.find((r) => r.rank === item.rank);
    if (!row) continue;
    await prisma.toolifyTrendDetail.upsert({
      where: { trendId: item.id },
      create: {
        trendId: item.id,
        description: row.summary + "\n\n本条目为种子数据，用于测试列表与详情页展示。实际数据由外部爬虫写入。",
        rawJson: JSON.stringify({ source: "seed", rank: row.rank }),
      },
      update: {
        description: row.summary + "\n\n本条目为种子数据，用于测试列表与详情页展示。",
      },
    });
  }

  console.log("[seed] 完成. 写入/更新:", created, "条趋势, 跳过:", skipped);
  console.log("[seed] 已为前 3 条创建 ToolifyTrendDetail。");

  // ---------- GitHub 趋势示例数据 -----------
  const GITHUB_SLUG = "github";
  let githubSource = await prisma.dataSource.findUnique({ where: { slug: GITHUB_SLUG } });
  if (!githubSource) {
    githubSource = await prisma.dataSource.create({
      data: { slug: GITHUB_SLUG, name: "GitHub", baseUrl: "https://github.com/trending", isActive: true },
    });
    console.log("[seed] 已创建数据源:", githubSource.slug);
  } else {
    console.log("[seed] 使用已有数据源:", githubSource.slug);
  }

  let githubCreated = 0;
  for (const row of GITHUB_TRENDS) {
    const externalId = row.repoFullName;
    const slug = repoToSlug(externalId);
    try {
      await prisma.gitHubTrendItem.upsert({
        where: {
          sourceId_externalId_snapshotAt: {
            sourceId: githubSource.id,
            externalId,
            snapshotAt: SNAPSHOT_DATE,
          },
        },
        create: {
          sourceId: githubSource.id,
          externalId,
          slug,
          rank: row.rank,
          repoFullName: row.repoFullName,
          description: row.description,
          language: row.language,
          stars: row.stars,
          forks: row.forks,
          starsToday: row.starsToday,
          dateRange: "today",
          url: row.url,
          snapshotAt: SNAPSHOT_DATE,
        },
        update: {
          rank: row.rank,
          repoFullName: row.repoFullName,
          description: row.description,
          language: row.language,
          stars: row.stars,
          forks: row.forks,
          starsToday: row.starsToday,
          url: row.url,
        },
      });
      githubCreated++;
    } catch (e) {
      console.warn("[seed] GitHub 跳过或更新失败:", row.repoFullName, e);
    }
  }
  console.log("[seed] GitHub 趋势写入/更新:", githubCreated, "条。");

  // ---------- Product Hunt 热点商品示例数据（根据图片）----------
  const PH_SLUG = "producthunt";
  let phSource = await prisma.dataSource.findUnique({ where: { slug: PH_SLUG } });
  if (!phSource) {
    phSource = await prisma.dataSource.create({
      data: { slug: PH_SLUG, name: "Product", baseUrl: "https://www.producthunt.com", isActive: true },
    });
    console.log("[seed] 已创建数据源:", phSource.slug);
  } else {
    console.log("[seed] 使用已有数据源:", phSource.slug);
  }

  let phCreated = 0;
  for (const row of PH_TRENDS) {
    const externalId = toSlug(row.name) || "ph-" + row.rank;
    const slug = externalId;
    try {
      await prisma.productHuntTrendItem.upsert({
        where: {
          sourceId_externalId_snapshotAt: {
            sourceId: phSource.id,
            externalId,
            snapshotAt: SNAPSHOT_DATE,
          },
        },
        create: {
          sourceId: phSource.id,
          externalId,
          slug,
          rank: row.rank,
          name: row.name,
          description: row.description,
          iconUrl: null,
          categories: row.categories,
          commentCount: row.commentCount,
          upvoteCount: row.upvoteCount,
          url: row.url,
          snapshotAt: SNAPSHOT_DATE,
        },
        update: {
          rank: row.rank,
          name: row.name,
          description: row.description,
          categories: row.categories,
          commentCount: row.commentCount,
          upvoteCount: row.upvoteCount,
          url: row.url,
        },
      });
      phCreated++;
    } catch (e) {
      console.warn("[seed] Product Hunt 跳过或更新失败:", row.name, e);
    }
  }
  console.log("[seed] Product Hunt 热点商品写入/更新:", phCreated, "条。");

  // ---------- Google 趋势示例数据 ----------
  const GOOGLE_SLUG = "google";
  let googleSource = await prisma.dataSource.findUnique({ where: { slug: GOOGLE_SLUG } });
  if (!googleSource) {
    googleSource = await prisma.dataSource.create({
      data: { slug: GOOGLE_SLUG, name: "Google", baseUrl: "https://trends.google.com", isActive: true },
    });
    console.log("[seed] 已创建数据源:", googleSource.slug);
  } else {
    console.log("[seed] 使用已有数据源:", googleSource.slug);
  }

  let googleCreated = 0;
  for (const row of GOOGLE_TRENDS) {
    const externalId = toSlug(row.name) || "google-" + row.rank;
    const slug = externalId;
    const startedAt = new Date(Date.now() - row.startedAtHoursAgo * 60 * 60 * 1000);
    try {
      await prisma.googleTrendItem.upsert({
        where: {
          sourceId_externalId_snapshotAt: {
            sourceId: googleSource.id,
            externalId,
            snapshotAt: SNAPSHOT_DATE,
          },
        },
        create: {
          sourceId: googleSource.id,
          externalId,
          slug,
          rank: row.rank,
          name: row.name,
          searchVolume: BigInt(row.searchVolume),
          searchVolumeDisplay: row.searchVolumeDisplay,
          growthRate: row.growthRate,
          startedAt,
          isActive: true,
          relatedKeywords: JSON.stringify(row.relatedKeywords),
          moreRelatedCount: row.moreRelatedCount,
          snapshotAt: SNAPSHOT_DATE,
        },
        update: {
          rank: row.rank,
          name: row.name,
          searchVolume: BigInt(row.searchVolume),
          searchVolumeDisplay: row.searchVolumeDisplay,
          growthRate: row.growthRate,
          startedAt,
          relatedKeywords: JSON.stringify(row.relatedKeywords),
          moreRelatedCount: row.moreRelatedCount,
        },
      });
      googleCreated++;
    } catch (e) {
      console.warn("[seed] Google 趋势跳过或更新失败:", row.name, e);
    }
  }
  console.log("[seed] Google 趋势写入/更新:", googleCreated, "条。");

  // ---------- SerpAPI 样例测试数据（3 条）----------
  function searchVolumeDisplay(n) {
    if (n >= 10000) return (n / 10000) + "万+";
    if (n >= 1000) return (n / 1000) + "千+";
    return n + "+";
  }
  let serpapiCreated = 0;
  for (let i = 0; i < SERPAPI_GOOGLE_TRENDS.length; i++) {
    const row = SERPAPI_GOOGLE_TRENDS[i];
    const externalId = toSlug(row.query) || "serpapi-" + (i + 1);
    const slug = externalId;
    const startedAt = new Date(row.start_timestamp * 1000);
    const endedAt = new Date(row.end_timestamp * 1000);
    const relatedList = Array.isArray(row.trend_breakdown) ? row.trend_breakdown : [];
    try {
      const item = await prisma.googleTrendItem.upsert({
        where: {
          sourceId_externalId_snapshotAt: {
            sourceId: googleSource.id,
            externalId,
            snapshotAt: SNAPSHOT_DATE,
          },
        },
        create: {
          sourceId: googleSource.id,
          externalId,
          slug,
          rank: googleCreated + i + 1,
          name: row.query,
          searchVolume: BigInt(row.search_volume),
          searchVolumeDisplay: searchVolumeDisplay(row.search_volume),
          growthRate: row.increase_percentage,
          startedAt,
          endedAt,
          isActive: row.active,
          relatedKeywords: JSON.stringify(relatedList),
          moreRelatedCount: 0,
          snapshotAt: SNAPSHOT_DATE,
        },
        update: {
          rank: googleCreated + i + 1,
          name: row.query,
          searchVolume: BigInt(row.search_volume),
          searchVolumeDisplay: searchVolumeDisplay(row.search_volume),
          growthRate: row.increase_percentage,
          startedAt,
          endedAt,
          isActive: row.active,
          relatedKeywords: JSON.stringify(relatedList),
          moreRelatedCount: 0,
        },
      });
      await prisma.googleTrendDetail.upsert({
        where: { trendId: item.id },
        create: {
          trendId: item.id,
          rawJson: JSON.stringify({
            categories: row.categories,
            serpapi_google_trends_link: row.serpapi_google_trends_link,
            news_page_token: row.news_page_token,
            serpapi_news_link: row.serpapi_news_link,
          }),
        },
        update: {
          rawJson: JSON.stringify({
            categories: row.categories,
            serpapi_google_trends_link: row.serpapi_google_trends_link,
            news_page_token: row.news_page_token,
            serpapi_news_link: row.serpapi_news_link,
          }),
        },
      });
      serpapiCreated++;
    } catch (e) {
      console.warn("[seed] SerpAPI Google 趋势跳过或更新失败:", row.query, e);
    }
  }
  console.log("[seed] SerpAPI Google 趋势测试数据写入/更新:", serpapiCreated, "条。");
}

main()
  .catch((e) => {
    console.error("[seed] 错误:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
