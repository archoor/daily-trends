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

export default function HomePage() {
  const webSiteJsonLd = buildWebSiteJsonLd();

  return (
    <article aria-label="Home">
      <section className="home-hero" aria-labelledby="hero-heading">
        <h1 id="hero-heading">Daily Trends</h1>
        <p>
          Aggregated trends from multiple sources. Pick a source below to view rankings.
        </p>
      </section>
      <section className="source-cards" aria-label="Trend sources">
        {SOURCE_CONFIGS.map((s) => (
          <Link
            key={s.slug}
            href={`/trends/${s.slug}`}
            className="source-card"
            aria-label={`View ${s.name} trends`}
          >
            <div className="name">{s.name}</div>
            <div className="desc">{s.description ?? "Trend list"}</div>
          </Link>
        ))}
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
      />
    </article>
  );
}
