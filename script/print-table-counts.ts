import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[count] 当前数据库表记录数：");

  const [
    dataSource,
    toolifyTrendItem,
    toolifyTrendDetail,
    gitHubTrendItem,
    gitHubTrendDetail,
    productHuntTrendItem,
    productHuntTrendDetail,
    googleTrendItem,
    googleTrendDetail,
  ] = await Promise.all([
    prisma.dataSource.count(),
    prisma.toolifyTrendItem.count(),
    prisma.toolifyTrendDetail.count(),
    prisma.gitHubTrendItem.count(),
    prisma.gitHubTrendDetail.count(),
    prisma.productHuntTrendItem.count(),
    prisma.productHuntTrendDetail.count(),
    prisma.googleTrendItem.count(),
    prisma.googleTrendDetail.count(),
  ]);

  const rows = [
    { table: "data_source (DataSource)", count: dataSource },
    { table: "toolify_trend_item (ToolifyTrendItem)", count: toolifyTrendItem },
    { table: "toolify_trend_detail (ToolifyTrendDetail)", count: toolifyTrendDetail },
    { table: "github_trend_item (GitHubTrendItem)", count: gitHubTrendItem },
    { table: "github_trend_detail (GitHubTrendDetail)", count: gitHubTrendDetail },
    { table: "product_hunt_trend_item (ProductHuntTrendItem)", count: productHuntTrendItem },
    { table: "product_hunt_trend_detail (ProductHuntTrendDetail)", count: productHuntTrendDetail },
    { table: "google_trend_item (GoogleTrendItem)", count: googleTrendItem },
    { table: "google_trend_detail (GoogleTrendDetail)", count: googleTrendDetail },
  ];

  console.table(rows);
}

main()
  .catch((e) => {
    console.error("[count] 错误:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

