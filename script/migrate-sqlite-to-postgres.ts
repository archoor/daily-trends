/**
 * 将 dev.db (SQLite) 数据迁移到当前 DATABASE_URL (PostgreSQL)。
 *
 * 用法：
 *   1. 确保 .env 中 DATABASE_URL 指向目标 Postgres（Vercel Postgres 等）
 *   2. 将 dev.db 放在 prisma/dev.db（或通过 SOURCE_DB_PATH 指定）
 *   3. npm run db:migrate-from-sqlite
 *
 * 默认会删除“测试数据”：slug 为 toolify / github / producthunt 的 DataSource 及其下所有趋势条目与详情。
 * 若希望迁移后数据与 dev.db 完全一致（不删除任何记录），请设置环境变量后再执行：
 *   MIGRATE_SKIP_DELETE_TEST_DATA=1 npm run db:migrate-from-sqlite
 */

import * as path from "path";
import * as fs from "fs";
import { PrismaClient } from "@prisma/client";

// 使用 require 避免 TS 环境下 better-sqlite3 类型问题；运行时需已安装 better-sqlite3
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require("better-sqlite3");

const SOURCE_DB_PATH =
  process.env.SOURCE_DB_PATH ||
  path.join(process.cwd(), "prisma", "dev.db");

/** 种子脚本创建的数据源 slug，迁移后会从 Postgres 中删除 */
const SEED_SOURCE_SLUGS = ["toolify", "github", "producthunt"];

type Row = Record<string, unknown>;

function readSqliteTable(db: ReturnType<typeof Database>, tableName: string): Row[] {
  const stmt = db.prepare(`SELECT * FROM ${tableName}`);
  return (stmt.all() as Row[]) || [];
}

async function main() {
  if (!fs.existsSync(SOURCE_DB_PATH)) {
    console.error(
      `[migrate] 未找到 SQLite 数据库: ${SOURCE_DB_PATH}\n  可通过环境变量 SOURCE_DB_PATH 指定路径。`
    );
    process.exit(1);
  }

  console.log("[migrate] 正在从 SQLite 读取:", SOURCE_DB_PATH);
  const sqlite = new Database(SOURCE_DB_PATH, { readonly: true });

  const tables = [
    "data_source",
    "toolify_trend_item",
    "toolify_trend_detail",
    "github_trend_item",
    "github_trend_detail",
    "product_hunt_trend_item",
    "product_hunt_trend_detail",
    "google_trend_item",
    "google_trend_detail",
  ];

  const data: Record<string, Row[]> = {};
  for (const table of tables) {
    try {
      data[table] = readSqliteTable(sqlite, table);
      console.log(`[migrate]   ${table}: ${data[table].length} 行`);
    } catch (e) {
      console.warn(`[migrate]   ${table}: 跳过 (表不存在或为空)`, e);
      data[table] = [];
    }
  }
  sqlite.close();

  const prisma = new PrismaClient();

  console.log("[migrate] 正在写入 Postgres...");

  // 1. DataSource（按 slug 做 upsert，避免与已有记录冲突；并建立 SQLite id -> Postgres id 映射）
  const dataSourceIdMap: Record<string, string> = {};
  for (const row of data["data_source"] as Row[]) {
    const slug = row.slug as string;
    const created = await prisma.dataSource.upsert({
      where: { slug },
      create: {
        id: row.id as string,
        slug,
        name: row.name as string,
        baseUrl: (row.baseUrl as string) ?? null,
        isActive: row.isActive === 1,
        createdAt: new Date(row.createdAt as string | number),
        updatedAt: new Date(row.updatedAt as string | number),
      },
      update: {
        name: row.name as string,
        baseUrl: (row.baseUrl as string) ?? null,
        isActive: row.isActive === 1,
        updatedAt: new Date(row.updatedAt as string | number),
      },
    });
    dataSourceIdMap[row.id as string] = created.id;
  }
  console.log("[migrate]   data_source 已写入");

  const resolveSourceId = (sqliteSourceId: string) =>
    dataSourceIdMap[sqliteSourceId] ?? sqliteSourceId;

  // 2. 各数据源 trend_item（依赖 data_source，sourceId 使用映射后的 Postgres id）
  const writeToolify = async () => {
    for (const row of data["toolify_trend_item"] as Row[]) {
      await prisma.toolifyTrendItem.upsert({
        where: { id: row.id as string },
        create: {
          id: row.id as string,
          sourceId: resolveSourceId(row.sourceId as string),
          externalId: row.externalId as string,
          slug: row.slug as string,
          rank: row.rank as number | null,
          name: row.name as string,
          url: (row.url as string) ?? null,
          monthlyVisits: row.monthlyVisits != null ? BigInt(Number(row.monthlyVisits)) : null,
          growthDisplay: (row.growthDisplay as string) ?? null,
          growthRate: row.growthRate as number | null,
          summary: (row.summary as string) ?? null,
          tags: (row.tags as string) ?? null,
          snapshotAt: new Date(row.snapshotAt as string | number),
          createdAt: new Date(row.createdAt as string | number),
          updatedAt: new Date(row.updatedAt as string | number),
        },
        update: {
          rank: row.rank as number | null,
          name: row.name as string,
          url: (row.url as string) ?? null,
          monthlyVisits: row.monthlyVisits != null ? BigInt(Number(row.monthlyVisits)) : null,
          growthDisplay: (row.growthDisplay as string) ?? null,
          growthRate: row.growthRate as number | null,
          summary: (row.summary as string) ?? null,
          tags: (row.tags as string) ?? null,
          updatedAt: new Date(row.updatedAt as string | number),
        },
      });
    }
  };
  const writeGitHub = async () => {
    for (const row of data["github_trend_item"] as Row[]) {
      await prisma.gitHubTrendItem.upsert({
        where: { id: row.id as string },
        create: {
          id: row.id as string,
          sourceId: resolveSourceId(row.sourceId as string),
          externalId: row.externalId as string,
          slug: row.slug as string,
          rank: row.rank as number | null,
          repoFullName: row.repoFullName as string,
          description: (row.description as string) ?? null,
          language: (row.language as string) ?? null,
          stars: Number(row.stars) || 0,
          forks: Number(row.forks) || 0,
          starsToday: Number(row.starsToday) || 0,
          dateRange: (row.dateRange as string) ?? null,
          builtByJson: (row.builtByJson as string) ?? null,
          url: (row.url as string) ?? null,
          snapshotAt: new Date(row.snapshotAt as string | number),
          createdAt: new Date(row.createdAt as string | number),
          updatedAt: new Date(row.updatedAt as string | number),
        },
        update: {
          rank: row.rank as number | null,
          repoFullName: row.repoFullName as string,
          description: (row.description as string) ?? null,
          language: (row.language as string) ?? null,
          stars: Number(row.stars) || 0,
          forks: Number(row.forks) || 0,
          starsToday: Number(row.starsToday) || 0,
          dateRange: (row.dateRange as string) ?? null,
          builtByJson: (row.builtByJson as string) ?? null,
          url: (row.url as string) ?? null,
          updatedAt: new Date(row.updatedAt as string | number),
        },
      });
    }
  };
  const writeProductHunt = async () => {
    for (const row of data["product_hunt_trend_item"] as Row[]) {
      await prisma.productHuntTrendItem.upsert({
        where: { id: row.id as string },
        create: {
          id: row.id as string,
          sourceId: resolveSourceId(row.sourceId as string),
          externalId: row.externalId as string,
          slug: row.slug as string,
          rank: row.rank as number | null,
          name: row.name as string,
          description: (row.description as string) ?? null,
          iconUrl: (row.iconUrl as string) ?? null,
          categories: (row.categories as string) ?? null,
          commentCount: Number(row.commentCount) || 0,
          upvoteCount: Number(row.upvoteCount) || 0,
          url: (row.url as string) ?? null,
          snapshotAt: new Date(row.snapshotAt as string | number),
          createdAt: new Date(row.createdAt as string | number),
          updatedAt: new Date(row.updatedAt as string | number),
        },
        update: {
          rank: row.rank as number | null,
          name: row.name as string,
          description: (row.description as string) ?? null,
          iconUrl: (row.iconUrl as string) ?? null,
          categories: (row.categories as string) ?? null,
          commentCount: Number(row.commentCount) || 0,
          upvoteCount: Number(row.upvoteCount) || 0,
          url: (row.url as string) ?? null,
          updatedAt: new Date(row.updatedAt as string | number),
        },
      });
    }
  };
  const writeGoogle = async () => {
    for (const row of data["google_trend_item"] as Row[]) {
      await prisma.googleTrendItem.upsert({
        where: { id: row.id as string },
        create: {
          id: row.id as string,
          sourceId: resolveSourceId(row.sourceId as string),
          externalId: row.externalId as string,
          slug: row.slug as string,
          rank: row.rank as number | null,
          name: row.name as string,
          searchVolume: row.searchVolume != null ? BigInt(Number(row.searchVolume)) : null,
          searchVolumeDisplay: (row.searchVolumeDisplay as string) ?? null,
          growthRate: row.growthRate as number | null,
          startedAt: row.startedAt != null ? new Date(row.startedAt as string | number) : null,
          endedAt: row.endedAt != null ? new Date(row.endedAt as string | number) : null,
          isActive: row.isActive === 1,
          relatedKeywords: (row.relatedKeywords as string) ?? null,
          moreRelatedCount: row.moreRelatedCount as number | null,
          snapshotAt: new Date(row.snapshotAt as string | number),
          createdAt: new Date(row.createdAt as string | number),
          updatedAt: new Date(row.updatedAt as string | number),
        },
        update: {
          rank: row.rank as number | null,
          name: row.name as string,
          searchVolume: row.searchVolume != null ? BigInt(Number(row.searchVolume)) : null,
          searchVolumeDisplay: (row.searchVolumeDisplay as string) ?? null,
          growthRate: row.growthRate as number | null,
          startedAt: row.startedAt != null ? new Date(row.startedAt as string | number) : null,
          endedAt: row.endedAt != null ? new Date(row.endedAt as string | number) : null,
          isActive: row.isActive === 1,
          relatedKeywords: (row.relatedKeywords as string) ?? null,
          moreRelatedCount: row.moreRelatedCount as number | null,
          updatedAt: new Date(row.updatedAt as string | number),
        },
      });
    }
  };

  await writeToolify();
  console.log("[migrate]   toolify_trend_item 已写入");
  await writeGitHub();
  console.log("[migrate]   github_trend_item 已写入");
  await writeProductHunt();
  console.log("[migrate]   product_hunt_trend_item 已写入");
  await writeGoogle();
  console.log("[migrate]   google_trend_item 已写入");

  // 3. 各 trend_detail（依赖 trend_item）
  const detailRowToCreate = (row: Row) => ({
    id: row.id as string,
    trendId: row.trendId as string,
    description: (row.description as string) ?? null,
    rawJson: (row.rawJson as string) ?? null,
    fetchedAt: new Date(row.fetchedAt as string | number),
    updatedAt: new Date(row.updatedAt as string | number),
  });
  const detailRowToUpdate = (row: Row) => ({
    description: (row.description as string) ?? null,
    rawJson: (row.rawJson as string) ?? null,
    updatedAt: new Date(row.updatedAt as string | number),
  });

  for (const row of data["toolify_trend_detail"] as Row[]) {
    await prisma.toolifyTrendDetail.upsert({
      where: { id: row.id as string },
      create: detailRowToCreate(row),
      update: detailRowToUpdate(row),
    });
  }
  console.log("[migrate]   toolify_trend_detail 已写入");
  for (const row of data["github_trend_detail"] as Row[]) {
    await prisma.gitHubTrendDetail.upsert({
      where: { id: row.id as string },
      create: detailRowToCreate(row),
      update: detailRowToUpdate(row),
    });
  }
  console.log("[migrate]   github_trend_detail 已写入");
  for (const row of data["product_hunt_trend_detail"] as Row[]) {
    await prisma.productHuntTrendDetail.upsert({
      where: { id: row.id as string },
      create: detailRowToCreate(row),
      update: detailRowToUpdate(row),
    });
  }
  console.log("[migrate]   product_hunt_trend_detail 已写入");
  for (const row of data["google_trend_detail"] as Row[]) {
    await prisma.googleTrendDetail.upsert({
      where: { id: row.id as string },
      create: detailRowToCreate(row),
      update: detailRowToUpdate(row),
    });
  }
  console.log("[migrate]   google_trend_detail 已写入");

  // 4. 可选：删除种子脚本写入的测试数据（toolify / github / producthunt 及其下所有条目）
  const skipDelete = process.env.MIGRATE_SKIP_DELETE_TEST_DATA === "1";
  if (skipDelete) {
    console.log("[migrate] 已跳过删除测试数据（MIGRATE_SKIP_DELETE_TEST_DATA=1），迁移数据与 dev.db 一致。");
  } else {
    const sourcesToDelete = await prisma.dataSource.findMany({
      where: { slug: { in: SEED_SOURCE_SLUGS } },
      select: { id: true, slug: true },
    });
    for (const source of sourcesToDelete) {
      await prisma.dataSource.delete({ where: { id: source.id } });
      console.log(`[migrate] 已删除测试数据源及其关联数据: ${source.slug}`);
    }
    if (sourcesToDelete.length === 0) {
      console.log("[migrate] 未发现需删除的测试数据源（toolify / github / producthunt）");
    }
  }

  console.log("[migrate] 迁移完成。");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[migrate] 错误:", e);
  process.exit(1);
});
