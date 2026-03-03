/**
 * 趋势条目与详情的领域类型
 * Toolify：排行 | 工具 | 月访问量 | 增长 | 增长率 | 介绍 | 标签
 * GitHub：排行 | 仓库(owner/repo) | 描述 | 语言 | 星标 | Fork | 今日新增星标 | Built by
 */

export interface TrendItemDto {
  id: string;
  sourceId: string;
  sourceSlug: string;
  externalId: string;
  slug: string;
  rank: number | null;
  name: string;
  url: string | null;
  monthlyVisits: number | null;
  growthDisplay: string | null;
  growthRate: number | null;
  summary: string | null;
  tags: string | null;
  snapshotAt: string;
  createdAt: string;
}

export interface TrendDetailDto extends TrendItemDto {
  description: string | null;
  rawJson: string | null;
  fetchedAt: string;
}

/** GitHub 趋势仓库条目 DTO（与 GitHub Trending Repositories 列表字段对齐） */
export interface GitHubTrendItemDto {
  id: string;
  sourceId: string;
  sourceSlug: string;
  externalId: string;
  slug: string;
  rank: number | null;
  repoFullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  starsToday: number;
  dateRange: string | null;
  builtByJson: string | null;
  url: string | null;
  snapshotAt: string;
  createdAt: string;
}

export interface GitHubTrendDetailDto extends GitHubTrendItemDto {
  description: string | null; // 详情页长描述
  rawJson: string | null;
  fetchedAt: string;
}

/** Product Hunt 热点商品条目 DTO（与 Product Hunt 列表字段对齐：排行、图标、产品名、描述、类别、评论数、点赞数） */
export interface ProductHuntTrendItemDto {
  id: string;
  sourceId: string;
  sourceSlug: string;
  externalId: string;
  slug: string;
  rank: number | null;
  name: string;
  description: string | null;
  iconUrl: string | null;
  categories: string | null;
  commentCount: number;
  upvoteCount: number;
  url: string | null;
  snapshotAt: string;
  createdAt: string;
}

export interface ProductHuntTrendDetailDto extends ProductHuntTrendItemDto {
  description: string | null; // 详情页长描述（可覆盖列表短描述）
  rawJson: string | null;
  fetchedAt: string;
}

/** Google 趋势条目 DTO（与 Google 趋势列表字段对齐：趋势名称、搜索量、增长、已开始、趋势细分） */
export interface GoogleTrendItemDto {
  id: string;
  sourceId: string;
  sourceSlug: string;
  externalId: string;
  slug: string;
  rank: number | null;
  name: string;
  searchVolume: number | null;
  searchVolumeDisplay: string | null;
  growthRate: number | null;
  startedAt: string | null;
  endedAt: string | null; // 趋势结束时间
  isActive: boolean;
  relatedKeywords: string | null; // JSON 数组字符串
  moreRelatedCount: number | null;
  snapshotAt: string;
  createdAt: string;
}

export interface GoogleTrendDetailDto extends GoogleTrendItemDto {
  description: string | null;
  rawJson: string | null;
  fetchedAt: string;
}

export interface DataSourceDto {
  id: string;
  slug: string;
  name: string;
  baseUrl: string | null;
  isActive: boolean;
}

/** 解析 tags 字符串为数组（逗号分隔） */
export function parseTags(tags: string | null): string[] {
  if (!tags?.trim()) return [];
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}
