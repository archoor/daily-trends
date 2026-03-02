/**
 * 动态 sitemap，供搜索引擎与 AI 爬虫发现所有列表页与详情页
 * 符合 Google 新规，便于索引与 AI Overview 引用
 */
import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/seo";
import { getAllDataSources } from "@/lib/api/trends";
import { getTrendListBySource } from "@/lib/api/trends";
import { getAllSourceSlugs } from "@/config/sources";

const baseUrl = getBaseUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  ];

  const sources = await getAllDataSources();
  const sourceSlugs = getAllSourceSlugs();

  for (const slug of sourceSlugs) {
    entries.push({
      url: `${baseUrl}/trends/${slug}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    });
  }

  for (const source of sources) {
    try {
      const list = await getTrendListBySource(source.id, { limit: 500 });
      const slug = source.slug;
      for (const item of list) {
        const itemSlug = "slug" in item ? item.slug : "";
        if (!itemSlug) continue;
        entries.push({
          url: `${baseUrl}/trends/${slug}/${itemSlug}`,
          lastModified: "snapshotAt" in item ? new Date(item.snapshotAt) : new Date(),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    } catch (e) {
      console.warn("[sitemap] skip source", source.slug, e);
    }
  }

  return entries;
}
