/**
 * 数据源配置：所有 trends 站点的展示配置（名称、链接等）
 * 扩展新站：在此添加一项，并确保外部爬虫向 DB 写入对应 DataSource 及该源趋势表（如 toolify → toolify_trend_item / toolify_trend_detail）
 */
export interface SourceConfig {
  slug: string;
  name: string;
  baseUrl: string;
  description?: string;
}

export const SOURCE_CONFIGS: SourceConfig[] = [
  {
    slug: "toolify",
    name: "AI Tools",
    baseUrl: "https://www.toolify.ai",
    description: "AI tools trends (Toolify Best Trending)",
  },
  {
    slug: "github",
    name: "GitHub",
    baseUrl: "https://github.com/trending",
    description: "GitHub trending repositories and developers",
  },
  {
    slug: "producthunt",
    name: "Product",
    baseUrl: "https://www.producthunt.com",
    description: "Product Hunt top products (rank, upvotes, comments, categories)",
  },
  {
    slug: "google",
    name: "Google",
    baseUrl: "https://trends.google.com",
    description: "Google search trends (name, volume, growth, related keywords)",
  },
];

export function getSourceBySlug(slug: string): SourceConfig | undefined {
  return SOURCE_CONFIGS.find((s) => s.slug === slug);
}

export function getAllSourceSlugs(): string[] {
  return SOURCE_CONFIGS.map((s) => s.slug);
}
