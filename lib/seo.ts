/**
 * SEO 工具：站点 base URL、JSON-LD 结构化数据
 * 用于符合 Google 新规与 AI 检索（AI Overviews）的页面结构
 */

/** 站点根 URL，用于 canonical、OG、sitemap；可通过 NEXT_PUBLIC_SITE_URL 覆盖 */
export function getBaseUrl(): string {
  if (typeof process.env.NEXT_PUBLIC_SITE_URL === "string" && process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (typeof process.env.VERCEL_URL === "string" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://daily-trends.example.com";
}

/** 拼接绝对 URL */
export function absoluteUrl(path: string): string {
  const base = getBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

const SITE_NAME = "Daily Trends";
const SITE_DESCRIPTION = "Multi-source AI and product trends in one place. Rankings from Toolify, GitHub, Product Hunt, and Google Trends.";

/** 全站 WebSite 的 JSON-LD（可在首页或 layout 使用） */
export function buildWebSiteJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: getBaseUrl(),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${getBaseUrl()}/trends/{source}?q={search_term_string}` },
      "search-term-string": "required",
    },
  };
}

/** 列表页 ItemList 的 JSON-LD，便于搜索引擎与 AI 理解榜单结构 */
export function buildItemListJsonLd(params: {
  name: string;
  description: string;
  listUrl: string;
  items: Array<{ name: string; url: string; position: number }>;
}): object {
  const { name, description, listUrl, items } = params;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    url: listUrl,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((item, i) => ({
      "@type": "ListItem",
      position: item.position,
      name: item.name,
      url: item.url,
    })),
  };
}

/** 详情页 Article 的 JSON-LD（通用趋势条目），便于 AI 提取与引用 */
export function buildArticleJsonLd(params: {
  title: string;
  description?: string | null;
  url: string;
  datePublished?: string;
  dateModified?: string;
  sourceName?: string;
}): object {
  const { title, description, url, datePublished, dateModified, sourceName } = params;
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: description || `${title} - trend detail from ${sourceName || "Daily Trends"}.`,
    url,
  };
  if (datePublished) ld.datePublished = datePublished;
  if (dateModified) ld.dateModified = dateModified;
  if (sourceName) ld.source = { "@type": "Organization", name: sourceName };
  return ld;
}
