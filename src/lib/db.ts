/**
 * Prisma client singleton. Server-only. Reused across hot reloads in dev so we
 * don't exhaust database connections.
 *
 * Goes through the `pg` driver adapter rather than Prisma's default engine.
 * That default is a native binary (`libquery_engine`) which dynamically links
 * OpenSSL and opens its own TCP socket, and a Cloudflare Worker is a V8 isolate
 * with neither — which is exactly what the deployed Worker kept reporting:
 *
 *     prisma:warn Prisma failed to detect the libssl/openssl version to use
 *     at Object.loadLibrary → _r.loadEngine → _r.instantiateLibrary
 *
 * Handing Prisma an adapter switches it to the WebAssembly engine and lets the
 * driver own the connection, so one client serves Node (Vercel, local, the
 * import scripts) and Workers alike.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * On Workers this has to be Hyperdrive's connection string rather than
 * Supabase's own — Hyperdrive is what terminates and pools the TCP connection
 * the isolate cannot open itself, and its string is only readable from the
 * binding at request time, which is why {@link createPrismaClient} takes one.
 * Everywhere else it is the ordinary `DATABASE_URL`.
 */
function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return url;
}

export function createPrismaClient(url: string = connectionString()): PrismaClient {
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
 * Built on first use, not on import.
 *
 * `next build` evaluates every route module to collect page data, and the build
 * environment has no database — it does not need one. Constructing the client
 * at import time therefore failed the whole build on the first route that
 * imports this file ("Failed to collect page data for /api/account"), because
 * resolving the connection string throws when `DATABASE_URL` is unset. Prisma's
 * own constructor is lazy about connecting for the same reason; the adapter
 * needs its connection string up front, so the laziness moves out here.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const value = Reflect.get(client(), property) as unknown;
    // Model delegates (`prisma.session`) are plain objects; the client's own
    // methods (`$transaction`, `$queryRaw`) need their `this` back.
    return typeof value === "function" ? value.bind(client()) : value;
  },
});
