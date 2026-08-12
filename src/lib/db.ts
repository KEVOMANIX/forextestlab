/**
 * Lazily constructed Prisma singleton for the long-running Lightsail process.
 * Reusing one pg adapter prevents a new Supabase connection pool per request.
 */

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return url;
}

export function createPrismaClient(
  url: string = connectionString(),
): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

let cached: PrismaClient | undefined;

function client(): PrismaClient {
  if (cached) return cached;
  cached = globalForPrisma.prisma ?? createPrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = cached;
  return cached;
}

/**
 * Build the adapter on first use rather than on import. Next.js evaluates route
 * modules during a build, when DATABASE_URL may intentionally be unavailable.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const current = client();
    const value = Reflect.get(current, property) as unknown;
    return typeof value === "function" ? value.bind(current) : value;
  },
});
