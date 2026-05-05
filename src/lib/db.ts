import { PrismaClient, Prisma } from "../generated/prisma";

type DbQueryLog = {
  timestamp: string;
  query: string;
  params: string;
  durationMs: number;
  target: string;
};

const QUERY_LOG_LIMIT = 200;
const globalForQueryLog = globalThis as unknown as { recentDbQueries?: DbQueryLog[] };

function pushDbQuery(event: Prisma.QueryEvent) {
  if (!globalForQueryLog.recentDbQueries) {
    globalForQueryLog.recentDbQueries = [];
  }

  globalForQueryLog.recentDbQueries.push({
    timestamp: new Date().toISOString(),
    query: event.query,
    params: event.params,
    durationMs: event.duration,
    target: event.target,
  });

  if (globalForQueryLog.recentDbQueries.length > QUERY_LOG_LIMIT) {
    globalForQueryLog.recentDbQueries.splice(0, globalForQueryLog.recentDbQueries.length - QUERY_LOG_LIMIT);
  }
}

export function getRecentDbQueries(limit = 30) {
  const buffer = globalForQueryLog.recentDbQueries ?? [];
  const size = Math.max(1, Math.min(limit, QUERY_LOG_LIMIT));
  return buffer.slice(-size).reverse();
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [{ emit: "event", level: "query" }, "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (event) => {
    pushDbQuery(event);
  });
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
