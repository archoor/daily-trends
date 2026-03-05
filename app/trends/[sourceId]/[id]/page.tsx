import { notFound } from "next/navigation";
import { getDataSourceBySlug, getTrendBySourceAndSlug } from "@/lib/api/trends";
import { getSourceBySlug } from "@/config/sources";
import { parseTags } from "@/lib/types/trend";
import type {
  GitHubTrendItemDto,
  TrendItemDto,
  ProductHuntTrendItemDto,
  GoogleTrendItemDto,
} from "@/lib/types/trend";
import { absoluteUrl, buildArticleJsonLd } from "@/lib/seo";

interface PageProps {
  params: Promise<{ sourceId: string; id: string }>;
  searchParams?: Promise<{ lang?: string }>;
}

/**
 * 趋势条目详情页
 * Toolify：排行、工具、月访问量、增长、增长率、介绍、标签
 * GitHub：排行、仓库、描述、语言、星标、Fork、今日新增星标、链接
 * Product Hunt：排行、产品名、描述、图标、类别、评论数、点赞数、链接
 * Google 趋势：趋势名称、搜索量、增长、已开始、活跃、趋势细分
 * 路由：/trends/[sourceId]/[id]，如 /trends/toolify/xxx、/trends/github/owner-repo、/trends/producthunt/xxx、/trends/google/xxx
 */
export default async function TrendDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { sourceId, id } = await params;
  const sp = (await searchParams) ?? {};
  const lang = sp.lang === "zh" ? "zh" : "en";
  const isZh = lang === "zh";
  const config = getSourceBySlug(sourceId);
  if (!config) notFound();

  const source = await getDataSourceBySlug(sourceId);
  if (!source) notFound();

  const trend = await getTrendBySourceAndSlug(source.id, id);
  if (!trend) notFound();

  const isGitHub = sourceId === "github";
  const isProductHunt = sourceId === "producthunt";
  const isGoogle = sourceId === "google";

  const pageUrl = absoluteUrl(
    `/trends/${sourceId}/${id}${isZh ? "?lang=zh" : ""}`,
  );
  const desc =
    (trend as { detail?: { description?: string | null } }).detail?.description ??
    ("description" in trend ? (trend as { description?: string | null }).description : null) ??
    ("summary" in trend ? (trend as { summary?: string | null }).summary : null);
  const articleJsonLd = buildArticleJsonLd({
    title: isGitHub ? (trend as GitHubTrendItemDto).repoFullName : (trend as { name: string }).name,
    description: desc ?? undefined,
    url: pageUrl,
    datePublished: trend.snapshotAt,
    dateModified: trend.snapshotAt,
    sourceName: config.name,
  });

  if (isGoogle) {
    const t = trend as GoogleTrendItemDto & { detail?: { description: string | null; rawJson: string | null; fetchedAt: Date } };
    const keywords = (() => {
      try {
        const arr = t.relatedKeywords ? JSON.parse(t.relatedKeywords) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    })();
    const startedLabel =
      t.startedAt != null
        ? new Date(t.startedAt).toLocaleString("en-US")
        : "—";
    const summaryText = isZh
      ? `"${t.name}" 是一个 Google 搜索趋势${
          t.rank != null ? `，当前排名第 ${t.rank} 名` : ""
        }。搜索量：${
          t.searchVolumeDisplay ??
          (t.searchVolume != null
            ? t.searchVolume.toLocaleString() + "+"
            : "N/A")
        }${
          t.growthRate != null ? `，增长率 ${t.growthRate}%` : ""
        }。数据来自 Daily Trends。`
      : `"${t.name}" is a Google search trend${
          t.rank != null ? ` ranked #${t.rank}` : ""
        }. Search volume: ${
          t.searchVolumeDisplay ??
          (t.searchVolume != null
            ? t.searchVolume.toLocaleString() + "+"
            : "N/A")
        }${
          t.growthRate != null ? `, growth ${t.growthRate}%` : ""
        }. Data from Daily Trends.`;
    return (
      <article aria-labelledby="detail-title">
        <p className="detail-back">
          <a href={`/trends/${sourceId}${isZh ? "?lang=zh" : ""}`}>
            ← {config.name}
          </a>
        </p>
        <p className="detail-summary" data-nosnippet={false}>
          {summaryText}
        </p>
        <h1 id="detail-title" className="detail-title">{t.name}</h1>

        <dl className="detail-dl">
          {t.rank != null && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "排行" : "Rank"}
              </dt>
              <dd>{t.rank}</dd>
            </>
          )}
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "搜索量" : "Search volume"}
          </dt>
          <dd>
            {t.searchVolumeDisplay ??
              (t.searchVolume != null
                ? t.searchVolume.toLocaleString() + "+"
                : "—")}
            {t.growthRate != null && (
              <span style={{ marginLeft: "0.5rem", color: "#059669" }}>
                ↑{t.growthRate}%
              </span>
            )}
          </dd>
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "开始时间" : "Started"}
          </dt>
          <dd>
            {startedLabel}
            {t.isActive && (
              <span style={{ marginLeft: "0.5rem", color: "#059669" }}>
                {isZh ? "活跃中" : "Active"}
              </span>
            )}
          </dd>
          {t.endedAt != null && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "结束时间" : "Ended"}
              </dt>
              <dd>{new Date(t.endedAt).toLocaleString("en-US")}</dd>
            </>
          )}
          {t.moreRelatedCount != null && t.moreRelatedCount > 0 && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "相关词条总数" : "Related count"}
              </dt>
              <dd>
                {isZh
                  ? `共 ${keywords.length + t.moreRelatedCount} 个（当前展示 ${keywords.length} 个，另有 ${t.moreRelatedCount} 个未展示）`
                  : `${keywords.length + t.moreRelatedCount} total (showing ${keywords.length}, and ${t.moreRelatedCount} more)`}
              </dd>
            </>
          )}
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "快照时间" : "Snapshot time"}
          </dt>
          <dd>{new Date(t.snapshotAt).toLocaleString("en-US")}</dd>
        </dl>

        {keywords.length > 0 && (
          <section className="detail-section">
            <h2>{isZh ? "相关搜索词" : "Related keywords"}</h2>
            <div className="detail-tags">
              {keywords.map((k) => (
                <span key={k} className="tag-pill">{k}</span>
              ))}
            </div>
          </section>
        )}

        {t.detail?.description && (
          <section className="detail-section">
            <h2>{isZh ? "描述" : "Description"}</h2>
            <p>{t.detail.description}</p>
          </section>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      </article>
    );
  }

  if (isProductHunt) {
    const t = trend as ProductHuntTrendItemDto & { detail?: { description: string | null; rawJson: string | null; fetchedAt: Date } };
    const summaryText = isZh
      ? `${t.name} 是 Product Hunt 上的产品${
          t.rank != null ? `，当前排名第 ${t.rank} 名` : ""
        }，拥有 ${t.upvoteCount.toLocaleString()} 个点赞和 ${t.commentCount.toLocaleString()} 条评论。${
          t.description
            ? t.description.slice(0, 100) +
              (t.description.length > 100 ? "…" : "")
            : ""
        } 数据来自 Daily Trends。`
      : `${t.name} is a Product Hunt product${
          t.rank != null ? ` ranked #${t.rank}` : ""
        } with ${t.upvoteCount.toLocaleString()} upvotes and ${t.commentCount.toLocaleString()} comments. ${
          t.description
            ? t.description.slice(0, 100) +
              (t.description.length > 100 ? "…" : "")
            : ""
        } Data from Daily Trends.`;
    return (
      <article aria-labelledby="detail-title">
        <p className="detail-back">
          <a href={`/trends/${sourceId}${isZh ? "?lang=zh" : ""}`}>
            ← {config.name}
          </a>
        </p>
        <p className="detail-summary" data-nosnippet={false}>
          {summaryText}
        </p>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1rem" }}>
          {t.iconUrl && (
            <img
              src={t.iconUrl}
              alt=""
              width={64}
              height={64}
              style={{ borderRadius: "8px", objectFit: "cover" }}
            />
          )}
          <div>
            <h1 id="detail-title" className="detail-title">{t.name}</h1>
            {t.description && (
              <p
                style={{
                  color: "var(--color-text-muted)",
                  marginTop: "0.25rem",
                }}
              >
                {t.description}
              </p>
            )}
          </div>
        </div>

        <dl className="detail-dl">
          {t.rank != null && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "排行" : "Rank"}
              </dt>
              <dd>{t.rank}</dd>
            </>
          )}
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "点赞数" : "Upvotes"}
          </dt>
          <dd>{t.upvoteCount.toLocaleString()}</dd>
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "评论数" : "Comments"}
          </dt>
          <dd>{t.commentCount.toLocaleString()}</dd>
          {t.categories && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "类别" : "Category"}
              </dt>
              <dd>{t.categories}</dd>
            </>
          )}
          {t.url && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "产品链接" : "Product link"}
              </dt>
              <dd>
                <a href={t.url} target="_blank" rel="noopener noreferrer">
                  {t.url}
                </a>
              </dd>
            </>
          )}
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "快照日期" : "Snapshot date"}
          </dt>
          <dd>{new Date(t.snapshotAt).toLocaleDateString("en-US")}</dd>
        </dl>

        {(t.description || t.detail?.description) && (
          <section className="detail-section">
            <h2>{isZh ? "描述" : "Description"}</h2>
            <p>{t.detail?.description ?? t.description ?? "—"}</p>
          </section>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      </article>
    );
  }

  if (isGitHub) {
    const t = trend as GitHubTrendItemDto & { detail?: { description: string | null; rawJson: string | null; fetchedAt: Date } };
    const summaryText = isZh
      ? `${t.repoFullName} 是 GitHub Trending 上的仓库${
          t.rank != null ? `，当前排名第 ${t.rank} 名` : ""
        }，拥有 ${t.stars.toLocaleString()} 个 star 和 ${t.forks.toLocaleString()} 个 fork。${
          t.description
            ? t.description.slice(0, 120) +
              (t.description.length > 120 ? "…" : "")
            : ""
        } 数据来自 Daily Trends。`
      : `${t.repoFullName} is a GitHub trending repository${
          t.rank != null ? ` ranked #${t.rank}` : ""
        } with ${t.stars.toLocaleString()} stars and ${t.forks.toLocaleString()} forks. ${
          t.description
            ? t.description.slice(0, 120) +
              (t.description.length > 120 ? "…" : "")
            : ""
        } Data from Daily Trends.`;
    return (
      <article aria-labelledby="detail-title">
        <p className="detail-back">
          <a href={`/trends/${sourceId}${isZh ? "?lang=zh" : ""}`}>
            ← {config.name}
          </a>
        </p>
        <p className="detail-summary" data-nosnippet={false}>
          {summaryText}
        </p>
        <h1 id="detail-title" className="detail-title">{t.repoFullName}</h1>

        <dl className="detail-dl">
          {t.rank != null && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "排行" : "Rank"}
              </dt>
              <dd>{t.rank}</dd>
            </>
          )}
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "语言" : "Language"}
          </dt>
          <dd>{t.language ?? "—"}</dd>
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "星标数" : "Stars"}
          </dt>
          <dd>{t.stars.toLocaleString()}</dd>
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "Fork 数" : "Fork"}
          </dt>
          <dd>{t.forks.toLocaleString()}</dd>
          {t.starsToday > 0 && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "今日新增星标" : "Stars today"}
              </dt>
              <dd>{t.starsToday}</dd>
            </>
          )}
          {t.stars > 0 && t.starsToday >= 0 && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "增长率" : "Growth rate"}
              </dt>
              <dd>
                {((t.starsToday / t.stars) * 100).toFixed(2)}%
              </dd>
            </>
          )}
          {t.dateRange && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "统计周期" : "Date range"}
              </dt>
              <dd>{t.dateRange}</dd>
            </>
          )}
          {t.url && (
            <>
              <dt style={{ fontWeight: 600 }}>
                {isZh ? "仓库链接" : "Repo link"}
              </dt>
              <dd>
                <a href={t.url} target="_blank" rel="noopener noreferrer">
                  {t.url}
                </a>
              </dd>
            </>
          )}
          <dt style={{ fontWeight: 600 }}>
            {isZh ? "快照日期" : "Snapshot date"}
          </dt>
          <dd>{new Date(t.snapshotAt).toLocaleDateString("en-US")}</dd>
        </dl>

        {(t.description || t.detail?.description) && (
          <section className="detail-section">
            <h2>{isZh ? "描述" : "Description"}</h2>
            <p>{t.detail?.description ?? t.description ?? "—"}</p>
          </section>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      </article>
    );
  }

  const t = trend as TrendItemDto & {
    detail?: { description: string | null; rawJson: string | null; fetchedAt: Date };
  };
  const tagsList = parseTags(t.tags ?? null);
  const summaryText = isZh
    ? `${t.name} 是 Toolify 榜单上的 AI 工具${
        t.rank != null ? `，当前排名第 ${t.rank} 名` : ""
      }${
        t.monthlyVisits != null
          ? `，月访问量约为 ${t.monthlyVisits.toLocaleString()}`
          : ""
      }${t.growthRate != null ? `，增长率 ${t.growthRate}%` : ""}。${
        t.summary
          ? t.summary.slice(0, 100) +
            (t.summary.length > 100 ? "…" : "")
          : ""
      } 数据来自 Daily Trends。`
    : `${t.name} is an AI tool${
        t.rank != null ? ` ranked #${t.rank}` : ""
      } on Toolify trends${
        t.monthlyVisits != null
          ? ` with ${t.monthlyVisits.toLocaleString()} monthly visits`
          : ""
      }${t.growthRate != null ? `, growth ${t.growthRate}%` : ""}. ${
        t.summary
          ? t.summary.slice(0, 100) +
            (t.summary.length > 100 ? "…" : "")
          : ""
      } Data from Daily Trends.`;

  return (
    <article aria-labelledby="detail-title">
      <p className="detail-back">
        <a href={`/trends/${sourceId}${isZh ? "?lang=zh" : ""}`}>
          ← {config.name}
        </a>
      </p>
      <p className="detail-summary" data-nosnippet={false}>
        {summaryText}
      </p>
      <h1 id="detail-title" className="detail-title">{t.name}</h1>

      <dl className="detail-dl">
        {t.rank != null && (
          <>
            <dt style={{ fontWeight: 600 }}>
              {isZh ? "排行" : "Rank"}
            </dt>
            <dd>{t.rank}</dd>
          </>
        )}
        {t.monthlyVisits != null && (
          <>
            <dt style={{ fontWeight: 600 }}>
              {isZh ? "月访问量" : "Monthly visits"}
            </dt>
            <dd>{t.monthlyVisits.toLocaleString()}</dd>
          </>
        )}
        {t.growthDisplay && (
          <>
            <dt style={{ fontWeight: 600 }}>
              {isZh ? "增长" : "Growth"}
            </dt>
            <dd>{t.growthDisplay}</dd>
          </>
        )}
        {t.growthRate != null && (
          <>
            <dt style={{ fontWeight: 600 }}>
              {isZh ? "增长率" : "Growth rate"}
            </dt>
            <dd>{t.growthRate}%</dd>
          </>
        )}
        {t.url && (
          <>
            <dt style={{ fontWeight: 600 }}>
              {isZh ? "链接" : "Link"}
            </dt>
            <dd>
              <a href={t.url} target="_blank" rel="noopener noreferrer">
                {t.url}
              </a>
            </dd>
          </>
        )}
        <dt style={{ fontWeight: 600 }}>
          {isZh ? "快照日期" : "Snapshot date"}
        </dt>
        <dd>{new Date(trend.snapshotAt).toLocaleDateString("en-US")}</dd>
      </dl>

      {(t.summary || trend.detail?.description) && (
        <section className="detail-section">
          <h2>{isZh ? "介绍" : "Introduction"}</h2>
          <p>{trend.detail?.description ?? t.summary ?? "—"}</p>
        </section>
      )}

      {tagsList.length > 0 && (
        <section className="detail-section">
          <h2>{isZh ? "标签" : "Tags"}</h2>
          <div className="detail-tags">
            {tagsList.map((tag) => (
              <span key={tag} className="tag-pill">
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
    </article>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { sourceId, id } = await params;
  const config = getSourceBySlug(sourceId);
  if (!config) return { title: "Not found" };
  const source = await getDataSourceBySlug(sourceId);
  if (!source) return { title: config.name };
  const trend = await getTrendBySourceAndSlug(source.id, id);
  if (!trend) return { title: config.name };
  const title =
    sourceId === "github"
      ? (trend as { repoFullName: string }).repoFullName
      : (trend as { name: string }).name;
  const summary =
    sourceId === "github"
      ? (trend as { description?: string | null }).description
      : sourceId === "producthunt" || sourceId === "google"
        ? (trend as { description?: string | null }).description
        : (trend as { summary?: string | null }).summary;
  const description = trend.detail?.description ?? summary ?? `${title} - ${config.name} trend detail`;
  const pageUrl = absoluteUrl(`/trends/${sourceId}/${id}`);
  return {
    title,
    description: description.slice(0, 160),
    openGraph: {
      title: `${title} | ${config.name} | Daily Trends`,
      description: description.slice(0, 160),
      url: pageUrl,
    },
    alternates: { canonical: pageUrl },
  };
}
