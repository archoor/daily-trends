/**
 * 列出各数据源在库中覆盖的 snapshotAt 日期
 * 运行：npx ts-node --project tsconfig.script.json script/list-snapshot-dates.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = { d: Date; cnt: string };

const TABLE_BY_SLUG: Record<string, string> = {
  toolify: "toolify_trend_item",
  github: "github_trend_item",
  producthunt: "product_hunt_trend_item",
  google: "google_trend_item",
};

async function main() {
  const sources = await prisma.dataSource.findMany({
    where: { isActive: true },
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, name: true },
  });

  if (sources.length === 0) {
    console.log("当前没有启用的数据源。");
    return;
  }

  console.log("各数据源在库中覆盖的 snapshotAt 日期：\n");

  for (const source of sources) {
    const table = TABLE_BY_SLUG[source.slug];
    if (!table) {
      console.log(`  [${source.slug}] 未配置表名，跳过`);
      continue;
    }

    if (source.slug === "google" && typeof (prisma as any).googleTrendItem === "undefined") {
      console.log(`  [${source.slug}] ${source.name}: Prisma 未生成该模型，跳过`);
      continue;
    }

    try {
      const rows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT DATE("snapshotAt") as d, COUNT(*)::text as cnt FROM ${table} WHERE "sourceId" = $1 GROUP BY DATE("snapshotAt") ORDER BY d DESC LIMIT 100`,
        source.id
      );

      if (rows.length === 0) {
        console.log(`  [${source.slug}] ${source.name}: 无数据`);
        continue;
      }

      const lines = rows.map((r) => {
        const dateStr = r.d.toISOString().slice(0, 10);
        return `    ${dateStr}  (${r.cnt} 条)`;
      });
      console.log(`  [${source.slug}] ${source.name}: 共 ${rows.length} 个日期`);
      console.log(lines.join("\n"));
      console.log("");
    } catch (e) {
      console.log(`  [${source.slug}] ${source.name}: 查询失败`, e);
      console.log("");
    }
  }
}

main()
  .catch((e) => {
    console.error("错误:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
