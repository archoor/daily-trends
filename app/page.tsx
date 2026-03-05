import Link from "next/link";
import { SOURCE_CONFIGS } from "@/config/sources";
import type { Metadata } from "next";
import { getBaseUrl, buildWebSiteJsonLd } from "@/lib/seo";

const baseUrl = getBaseUrl();
const title = "Daily Trends";
const description =
  "Aggregated AI and product trends from Toolify, GitHub, Product Hunt, and Google Trends. View rankings and trend details in one place.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: baseUrl,
  },
  alternates: { canonical: baseUrl },
};

interface HomePageProps {
  searchParams?: Promise<{ lang?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const sp = (await searchParams) ?? {};
  const lang = sp.lang === "zh" ? "zh" : "en";
  const webSiteJsonLd = buildWebSiteJsonLd();

  const isZh = lang === "zh";

  const texts = {
    heroTitle: isZh ? "每日趋势榜" : "Daily Trends",
    heroDesc: isZh
      ? "聚合多个站点的 AI 与产品趋势。选择下方数据源查看排行榜。"
      : "Aggregated trends from multiple sources. Pick a source below to view rankings.",
    sourcesLabel: isZh ? "趋势数据源" : "Trend sources",
    viewTrendsAria: (name: string) =>
      isZh ? `查看 ${name} 趋势` : `View ${name} trends`,
    defaultDesc: isZh ? "趋势列表" : "Trend list",
  };

  return (
    <article aria-label={isZh ? "首页" : "Home"}>
      <section className="home-hero" aria-labelledby="hero-heading">
        <h1 id="hero-heading">{texts.heroTitle}</h1>
        <p>{texts.heroDesc}</p>
      </section>
      <section
        className="source-cards"
        aria-label={texts.sourcesLabel}
      >
        {SOURCE_CONFIGS.map((s) => {
          const href = `/trends/${s.slug}${isZh ? "?lang=zh" : ""}`;
          return (
            <Link
              key={s.slug}
              href={href}
              className="source-card"
              aria-label={texts.viewTrendsAria(s.name)}
            >
              <div className="name">{s.name}</div>
              <div className="desc">
                {s.description ?? texts.defaultDesc}
              </div>
            </Link>
          );
        })}
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
      />
    </article>
  );
}
