import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * 创建 Prisma 客户端（Vercel Postgres / 任意 PostgreSQL）
 * - 在 Vercel 上绑定 Vercel Postgres 后会自动注入 POSTGRES_PRISMA_URL（带连接池，推荐）
 * - 本地或自建环境使用 DATABASE_URL（postgresql://...）
 */
function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
