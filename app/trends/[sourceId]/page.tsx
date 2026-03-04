import { notFound } from "next/navigation";
import Link from "next/link";
import { getDataSourceBySlug, getTrendListBySource } from "@/lib/api/trends";
import { getSourceBySlug } from "@/config/sources";
import type { TrendItemDto, GitHubTrendItemDto, ProductHuntTrendItemDto, GoogleTrendItemDto } from "@/lib/types/trend";
import { parseTags } from "@/lib/types/trend";
import { absoluteUrl, buildItemListJsonLd } from "@/lib/seo";

/** Format ISO date as relative time (e.g. "3 days ago") */
function formatStartedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins > 0) return `${mins} min ago`;
  return "Just now";
}

/** 排行奖牌样式：1 金 2 银 3 铜 */
function rankMedalClass(rank: number | null): string {
  if (rank == null) return "rank-medal default";
  if (rank === 1) return "rank-medal gold";
  if (rank === 2) return "rank-medal silver";
  if (rank === 3) return "rank-medal bronze";
  return "rank-medal default";
}

interface PageProps {
  params: Promise<{ sourceId: string }>;
}

/**
 * 按数据源展示趋势列表页
 * 布局：标题区 + 横向标签（数据源切换）+ 左侧边栏 + 数据表格
 */
export default async function TrendListPage({ params }: PageProps) {
  const { sourceId } = await params;
  const config = getSourceBySlug(sourceId);
  if (!config) notFound();

  const source = await getDataSourceBySlug(sourceId);
  const list = source
    ? await getTrendListBySource(source.id, { limit: 100 })
    : [];

  const isGitHub = sourceId === "github";
  const isProductHunt = sourceId === "producthunt";
  const isGoogle = sourceId === "google";

  const listUrl = absoluteUrl(`/trends/${sourceId}`);
  const itemListJsonLd = buildItemListJsonLd({
    name: `Top ${config.name} Rankings`,
    description: config.description ?? `${config.name} trend list`,
    listUrl,
    items: list.slice(0, 50).map((item, i) => {
      const name = "name" in item ? item.name : (item as GitHubTrendItemDto).repoFullName;
      const slug = "slug" in item ? item.slug : "";
      return {
        name,
        url: absoluteUrl(`/trends/${sourceId}/${slug}`),
        position: (item as { rank?: number | null }).rank ?? i + 1,
      };
    }),
  });

  return (
    <article aria-label={`${config.name} trends`}>
      {/* 页面标题区 */}
      <section className="page-title-section" aria-labelledby="list-title">
        <p className="subtitle" id="list-subtitle">Daily Trends Rankings</p>
        <h1 id="list-title" className="title">
          Top {config.name} Rankings
        </h1>
        <p className="description">
          {config.description ?? "Trend list. Data is written by external crawlers; this page only displays it."}
        </p>
      </section>

      {list.length === 0 ? (
        <div className="empty-state">
          No data yet. Data is written to the database by an external crawler (e.g. Python).
        </div>
      ) : (
        <div className="table-wrap">
            {isGoogle ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-rank">Rank</th>
                    <th>Trend name</th>
                    <th>Search volume</th>
                    <th>Started</th>
                    <th>Ended</th>
                    <th>Related</th>
                  </tr>
                </thead>
                <tbody>
                  {(list as GoogleTrendItemDto[]).map((item) => {
                    const keywords = (() => {
                      try {
                        const arr = item.relatedKeywords ? JSON.parse(item.relatedKeywords) : [];
                        return Array.isArray(arr) ? arr.slice(0, 3) : [];
                      } catch {
                        return [];
                      }
                    })();
                    const startedLabel = item.startedAt != null ? formatStartedAt(item.startedAt) : "—";
                    const endedLabel = item.endedAt != null ? formatStartedAt(item.endedAt) : "—";
                    return (
                      <tr key={item.id}>
                        <td className="col-rank">
                          <span className={rankMedalClass(item.rank)}>{item.rank ?? "—"}</span>
                        </td>
                        <td className="col-name">
                          <Link href={`/trends/${sourceId}/${item.slug}`}>{item.name}</Link>
                        </td>
                        <td>
                          {item.searchVolumeDisplay ?? (item.searchVolume != null ? item.searchVolume.toLocaleString() + "+" : "—")}
                          {item.growthRate != null && (
                            <span className="growth-up"> ↑{item.growthRate}%</span>
                          )}
                        </td>
                        <td>
                          {startedLabel}
                          {item.isActive && <span className="growth-up"> Active</span>}
                        </td>
                        <td>{endedLabel}</td>
                        <td className="col-desc">
                          {keywords.length > 0 ? keywords.join(" · ") : "—"}
                          {item.moreRelatedCount != null && item.moreRelatedCount > 0 && (
                            <span style={{ display: "block", marginTop: "0.125rem" }}>
                              and {item.moreRelatedCount} more
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : isProductHunt ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-rank">Rank</th>
                    <th>Icon</th>
                    <th>Product</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Comments</th>
                    <th>Upvotes</th>
                  </tr>
                </thead>
                <tbody>
                  {(list as ProductHuntTrendItemDto[]).map((item) => (
                    <tr key={item.id}>
                      <td className="col-rank">
                        <span className={rankMedalClass(item.rank)}>{item.rank ?? "—"}</span>
                      </td>
                      <td>
                        {item.iconUrl ? (
                          <img src={item.iconUrl} alt="" width={40} height={40} style={{ borderRadius: "6px", objectFit: "cover" }} />
                        ) : (
                          <span style={{ color: "var(--color-text-light)" }}>—</span>
                        )}
                      </td>
                      <td className="col-name">
                        <Link href={`/trends/${sourceId}/${item.slug}`}>{item.name}</Link>
                      </td>
                      <td className="col-desc">{item.description ?? "—"}</td>
                      <td className="col-tags">{item.categories ?? "—"}</td>
                      <td>{item.commentCount.toLocaleString()}</td>
                      <td>{item.upvoteCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : isGitHub ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-rank">Rank</th>
                    <th>Repo</th>
                    <th>Description</th>
                    <th>Language</th>
                    <th>Stars</th>
                    <th>Fork</th>
                    <th>Stars today</th>
                    <th>Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {(list as GitHubTrendItemDto[]).map((item) => {
                    const rate = item.stars > 0 && item.starsToday >= 0
                      ? ((item.starsToday / item.stars) * 100).toFixed(2)
                      : null;
                    return (
                      <tr key={item.id}>
                        <td className="col-rank">
                          <span className={rankMedalClass(item.rank)}>{item.rank ?? "—"}</span>
                        </td>
                        <td className="col-name">
                          <Link href={`/trends/${sourceId}/${item.slug}`}>{item.repoFullName}</Link>
                        </td>
                        <td className="col-desc">{item.description ?? "—"}</td>
                        <td>{item.language ?? "—"}</td>
                        <td>{item.stars.toLocaleString()}</td>
                        <td>{item.forks.toLocaleString()}</td>
                        <td>{item.starsToday > 0 ? `${item.starsToday} stars today` : "—"}</td>
                        <td>
                          {rate != null ? <span className="growth-up">{rate}%</span> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-rank">Rank</th>
                    <th>Tool</th>
                    <th>Monthly visits</th>
                    <th>Growth</th>
                    <th>Growth rate</th>
                    <th>Intro</th>
                    <th>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {(list as TrendItemDto[]).map((item) => {
                    const tagsList = parseTags(item.tags ?? null).slice(0, 6);
                    return (
                      <tr key={item.id}>
                        <td className="col-rank">
                          <span className={rankMedalClass(item.rank)}>{item.rank ?? "—"}</span>
                        </td>
                        <td className="col-name">
                          <Link href={`/trends/${sourceId}/${item.slug}`}>{item.name}</Link>
                        </td>
                        <td>{item.monthlyVisits != null ? item.monthlyVisits.toLocaleString() : "—"}</td>
                        <td>
                          {item.growthDisplay ? <span className="growth-up">↑{item.growthDisplay}</span> : "—"}
                        </td>
                        <td>
                          {item.growthRate != null ? <span className="growth-up">↑{item.growthRate}%</span> : "—"}
                        </td>
                        <td className="col-desc">{item.summary ?? "—"}</td>
                        <td className="col-tags">
                          {tagsList.length > 0 ? (
                            <div className="tag-pills">
                              {tagsList.map((t) => (
                                <span key={t} className="tag-pill">{t}</span>
                              ))}
                            </div>
                          ) : (
                            item.tags ?? "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
    </article>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { sourceId } = await params;
  const config = getSourceBySlug(sourceId);
  if (!config) return { title: "Not found" };
  const listUrl = absoluteUrl(`/trends/${sourceId}`);
  const title = `Top ${config.name} Rankings`;
  const description = config.description ?? `${config.name} trend list. View rankings and details.`;
  return {
    title: config.name,
    description,
    openGraph: {
      title,
      description,
      url: listUrl,
    },
    alternates: { canonical: listUrl },
  };
}
