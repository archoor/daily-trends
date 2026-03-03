/**
 * 趋势数据查询：按数据源、日期等获取列表与详情
 * 仅读 DB，数据由外部爬虫写入；按数据源 slug 分发到 Toolify / GitHub 等表
 */
import { prisma } from "@/lib/db/client";
import type { TrendItemDto, GitHubTrendItemDto, ProductHuntTrendItemDto, GoogleTrendItemDto } from "@/lib/types/trend";

/** 将 Prisma 返回的趋势条目中的 BigInt 转为 number，便于 RSC 序列化与前端展示 */
function serializeToolifyItem(row: {
  id: string;
  sourceId: string;
  externalId: string;
  slug: string;
  rank: number | null;
  name: string;
  url: string | null;
  monthlyVisits: bigint | null;
  growthDisplay: string | null;
  growthRate: number | null;
  summary: string | null;
  tags: string | null;
  snapshotAt: Date;
  createdAt: Date;
  source: { slug: string; name: string };
}): TrendItemDto {
  const { source, ...rest } = row;
  return {
    ...rest,
    sourceSlug: source.slug,
    monthlyVisits: row.monthlyVisits != null ? Number(row.monthlyVisits) : null,
    snapshotAt: row.snapshotAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeGitHubItem(row: {
  id: string;
  sourceId: string;
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
  snapshotAt: Date;
  createdAt: Date;
  source: { slug: string; name: string };
}): GitHubTrendItemDto {
  const { source, ...rest } = row;
  return {
    ...rest,
    sourceSlug: source.slug,
    snapshotAt: row.snapshotAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeProductHuntItem(row: {
  id: string;
  sourceId: string;
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
  snapshotAt: Date;
  createdAt: Date;
  source: { slug: string; name: string };
}): ProductHuntTrendItemDto {
  const { source, ...rest } = row;
  return {
    ...rest,
    sourceSlug: source.slug,
    snapshotAt: row.snapshotAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeGoogleItem(row: {
  id: string;
  sourceId: string;
  externalId: string;
  slug: string;
  rank: number | null;
  name: string;
  searchVolume: bigint | null;
  searchVolumeDisplay: string | null;
  growthRate: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  isActive: boolean;
  relatedKeywords: string | null;
  moreRelatedCount: number | null;
  snapshotAt: Date;
  createdAt: Date;
  source: { slug: string; name: string };
}): GoogleTrendItemDto {
  const { source, ...rest } = row;
  return {
    ...rest,
    sourceSlug: source.slug,
    searchVolume: row.searchVolume != null ? Number(row.searchVolume) : null,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    snapshotAt: row.snapshotAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getDataSourceBySlug(slug: string) {
  return prisma.dataSource.findUnique({
    where: { slug, isActive: true },
  });
}

export async function getAllDataSources() {
  return prisma.dataSource.findMany({
    where: { isActive: true },
    orderBy: { slug: "asc" },
  });
}

/** 按数据源返回趋势列表：Toolify / GitHub / Product Hunt / Google 分别查对应表 */
export async function getTrendListBySource(
  sourceId: string,
  options?: { snapshotAt?: Date; limit?: number }
): Promise<(TrendItemDto | GitHubTrendItemDto | ProductHuntTrendItemDto | GoogleTrendItemDto)[]> {
  const source = await prisma.dataSource.findUnique({
    where: { id: sourceId },
    select: { slug: true },
  });
  if (!source) return [];

  const snapshotAt = options?.snapshotAt;
  const startOfDay = snapshotAt ? new Date(snapshotAt) : null;
  if (startOfDay) startOfDay.setHours(0, 0, 0, 0);
  const dateFilter =
    startOfDay
      ? {
          gte: startOfDay,
          lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
        }
      : undefined;

  if (source.slug === "google") {
    if (typeof prisma.googleTrendItem === "undefined") {
      console.warn("[trends] prisma.googleTrendItem 未就绪，请停止 dev 服务器后执行 npx prisma generate，删除 .next 再重新 npm run dev");
      return [];
    }
    const list = await prisma.googleTrendItem.findMany({
      where: { sourceId, ...(dateFilter && { snapshotAt: dateFilter }) },
      include: { source: { select: { slug: true, name: true } } },
      orderBy: [{ snapshotAt: "desc" }, { rank: "asc" }],
      take: options?.limit ?? 100,
    });
    return list.map(serializeGoogleItem);
  }

  if (source.slug === "github") {
    const list = await prisma.gitHubTrendItem.findMany({
      where: { sourceId, ...(dateFilter && { snapshotAt: dateFilter }) },
      include: { source: { select: { slug: true, name: true } } },
      orderBy: [{ snapshotAt: "desc" }, { rank: "asc" }],
      take: options?.limit ?? 100,
    });
    return list.map(serializeGitHubItem);
  }

  if (source.slug === "producthunt") {
    const list = await prisma.productHuntTrendItem.findMany({
      where: { sourceId, ...(dateFilter && { snapshotAt: dateFilter }) },
      include: { source: { select: { slug: true, name: true } } },
      orderBy: [{ snapshotAt: "desc" }, { rank: "asc" }],
      take: options?.limit ?? 100,
    });
    return list.map(serializeProductHuntItem);
  }

  const list = await prisma.toolifyTrendItem.findMany({
    where: { sourceId, ...(dateFilter && { snapshotAt: dateFilter }) },
    include: { source: { select: { slug: true, name: true } } },
    orderBy: [{ snapshotAt: "desc" }, { rank: "asc" }],
    take: options?.limit ?? 100,
  });
  return list.map(serializeToolifyItem);
}

/** 按数据源与 slug 获取单条趋势（含详情）；按 source.slug 分发到对应表 */
export async function getTrendBySourceAndSlug(
  sourceId: string,
  slug: string
): Promise<
  | (TrendItemDto & { detail?: { description: string | null; rawJson: string | null; fetchedAt: Date } })
  | (GitHubTrendItemDto & { detail?: { description: string | null; rawJson: string | null; fetchedAt: Date } })
  | (ProductHuntTrendItemDto & { detail?: { description: string | null; rawJson: string | null; fetchedAt: Date } })
  | (GoogleTrendItemDto & { detail?: { description: string | null; rawJson: string | null; fetchedAt: Date } })
  | null
> {
  const source = await prisma.dataSource.findUnique({
    where: { id: sourceId },
    select: { slug: true },
  });
  if (!source) return null;

  if (source.slug === "google") {
    if (typeof prisma.googleTrendItem === "undefined") {
      console.warn("[trends] prisma.googleTrendItem 未就绪，请停止 dev 后执行 npx prisma generate，删除 .next 再重新 npm run dev");
      return null;
    }
    const row = await prisma.googleTrendItem.findFirst({
      where: { sourceId, slug },
      include: {
        source: { select: { slug: true, name: true, baseUrl: true } },
        googleDetail: true,
      },
      orderBy: { snapshotAt: "desc" },
    });
    if (!row) return null;
    const { googleDetail, ...rest } = row;
    return {
      ...serializeGoogleItem(rest as Parameters<typeof serializeGoogleItem>[0]),
      detail: googleDetail ?? undefined,
    };
  }

  if (source.slug === "github") {
    const row = await prisma.gitHubTrendItem.findFirst({
      where: { sourceId, slug },
      include: {
        source: { select: { slug: true, name: true, baseUrl: true } },
        githubDetail: true,
      },
      orderBy: { snapshotAt: "desc" },
    });
    if (!row) return null;
    const { githubDetail, ...rest } = row;
    return {
      ...serializeGitHubItem(rest as Parameters<typeof serializeGitHubItem>[0]),
      detail: githubDetail ?? undefined,
    };
  }

  if (source.slug === "producthunt") {
    const row = await prisma.productHuntTrendItem.findFirst({
      where: { sourceId, slug },
      include: {
        source: { select: { slug: true, name: true, baseUrl: true } },
        productHuntDetail: true,
      },
      orderBy: { snapshotAt: "desc" },
    });
    if (!row) return null;
    const { productHuntDetail, ...rest } = row;
    return {
      ...serializeProductHuntItem(rest as Parameters<typeof serializeProductHuntItem>[0]),
      detail: productHuntDetail ?? undefined,
    };
  }

  const row = await prisma.toolifyTrendItem.findFirst({
    where: { sourceId, slug },
    include: {
      source: { select: { slug: true, name: true, baseUrl: true } },
      toolifyDetail: true,
    },
    orderBy: { snapshotAt: "desc" },
  });
  if (!row) return null;
  const { toolifyDetail, ...rest } = row;
  return {
    ...serializeToolifyItem(rest as Parameters<typeof serializeToolifyItem>[0]),
    detail: toolifyDetail ?? undefined,
  };
}

export async function getTrendById(id: string) {
  const googleQuery =
    typeof prisma.googleTrendItem !== "undefined"
      ? prisma.googleTrendItem.findUnique({
          where: { id },
          include: {
            source: { select: { slug: true, name: true, baseUrl: true } },
            googleDetail: true,
          },
        })
      : Promise.resolve(null);
  const [toolifyRow, githubRow, productHuntRow, googleRow] = await Promise.all([
    prisma.toolifyTrendItem.findUnique({
      where: { id },
      include: {
        source: { select: { slug: true, name: true, baseUrl: true } },
        toolifyDetail: true,
      },
    }),
    prisma.gitHubTrendItem.findUnique({
      where: { id },
      include: {
        source: { select: { slug: true, name: true, baseUrl: true } },
        githubDetail: true,
      },
    }),
    prisma.productHuntTrendItem.findUnique({
      where: { id },
      include: {
        source: { select: { slug: true, name: true, baseUrl: true } },
        productHuntDetail: true,
      },
    }),
    googleQuery,
  ]);
  const row = toolifyRow ?? githubRow ?? productHuntRow ?? googleRow;
  if (!row) return null;
  if ("toolifyDetail" in row) {
    const { toolifyDetail, ...rest } = row;
    return serializeToolifyItem(rest as Parameters<typeof serializeToolifyItem>[0]) as TrendItemDto & {
      detail?: { description: string | null; rawJson: string | null; fetchedAt: Date };
    };
  }
  if ("githubDetail" in row) {
    const { githubDetail, ...rest } = row;
    return serializeGitHubItem(rest as Parameters<typeof serializeGitHubItem>[0]) as GitHubTrendItemDto & {
      detail?: { description: string | null; rawJson: string | null; fetchedAt: Date };
    };
  }
  if ("googleDetail" in row) {
    const { googleDetail, ...rest } = row;
    return serializeGoogleItem(rest as Parameters<typeof serializeGoogleItem>[0]) as GoogleTrendItemDto & {
      detail?: { description: string | null; rawJson: string | null; fetchedAt: Date };
    };
  }
  const { productHuntDetail, ...rest } = row;
  return serializeProductHuntItem(rest as Parameters<typeof serializeProductHuntItem>[0]) as ProductHuntTrendItemDto & {
    detail?: { description: string | null; rawJson: string | null; fetchedAt: Date };
  };
}
