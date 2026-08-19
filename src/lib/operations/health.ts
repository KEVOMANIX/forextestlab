import "server-only";

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { readFile, statfs } from "node:fs/promises";
import os from "node:os";

import { prisma } from "@/lib/db";
import { SYMBOL_DEFINITIONS } from "@/lib/market-data/symbols";

export type HealthStatus = "healthy" | "degraded" | "failed";

export interface HealthCheckResult {
  component: string;
  status: HealthStatus;
  latencyMs: number;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface OperationsSnapshot {
  status: HealthStatus;
  checkedAt: string;
  checks: HealthCheckResult[];
  usage: {
    databaseBytes: number | null;
    r2Bytes: number | null;
    r2Objects: number | null;
    backupCount: number | null;
    latestBackupAt: string | null;
    diskUsedPercent: number | null;
    memoryUsedPercent: number | null;
  };
  marketData: Array<{
    symbol: string;
    months: number;
    firstMonth: string | null;
    lastMonth: string | null;
    latestUploadAt: string | null;
    status: HealthStatus;
  }>;
}

function overall(checks: HealthCheckResult[]): HealthStatus {
  if (checks.some((check) => check.status === "failed")) return "failed";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "healthy";
}

function r2Client(): { client: S3Client; bucket: string; marketPrefix: string; backupPrefix: string } {
  const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/$/, "");
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are incomplete.");
  }
  return {
    bucket,
    marketPrefix: (process.env.R2_PREFIX?.trim() || "market_data").replace(/^\/+|\/+$/g, ""),
    backupPrefix: (process.env.R2_BACKUP_PREFIX?.trim() || "database_backups").replace(/^\/+|\/+$/g, ""),
    client: new S3Client({
      endpoint,
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function listAll(client: S3Client, bucket: string, prefix?: string) {
  const objects: Array<{ key: string; size: number; modified: Date | null }> = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents ?? []) {
      if (!object.Key) continue;
      objects.push({
        key: object.Key,
        size: object.Size ?? 0,
        modified: object.LastModified ?? null,
      });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

function expectedRecentMonth(): string {
  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function availableMemoryBytes(): Promise<number> {
  if (process.platform !== "linux") return os.freemem();
  const contents = await readFile("/proc/meminfo", "utf8").catch(() => "");
  const availableKb = Number(contents.match(/^MemAvailable:\s+(\d+)\s+kB$/m)?.[1]);
  return Number.isFinite(availableKb) && availableKb > 0 ? availableKb * 1024 : os.freemem();
}

export async function collectOperationsSnapshot(options: { checkWebsite?: boolean } = {}): Promise<OperationsSnapshot> {
  const checks: HealthCheckResult[] = [];
  let databaseBytes: number | null = null;
  let r2Bytes: number | null = null;
  let r2Objects: number | null = null;
  let backupCount: number | null = null;
  let latestBackupAt: string | null = null;
  let diskUsedPercent: number | null = null;
  let memoryUsedPercent: number | null = null;
  let marketData: OperationsSnapshot["marketData"] = [];

  if (options.checkWebsite) {
    const started = Date.now();
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://forextestlab.com"}/api/version`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      checks.push({
        component: "website",
        status: response.ok ? "healthy" : "failed",
        latencyMs: Date.now() - started,
        message: response.ok ? "Public application is responding." : `Public application returned HTTP ${response.status}.`,
      });
    } catch (error) {
      checks.push({ component: "website", status: "failed", latencyMs: Date.now() - started, message: error instanceof Error ? error.message : "Website check failed." });
    }
  }

  {
    const started = Date.now();
    try {
      const rows = await prisma.$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_database_size(current_database()) AS bytes`;
      databaseBytes = Number(rows[0]?.bytes ?? 0n);
      checks.push({ component: "database", status: "healthy", latencyMs: Date.now() - started, message: "Supabase PostgreSQL is reachable.", metadata: { bytes: databaseBytes } });
    } catch (error) {
      checks.push({ component: "database", status: "failed", latencyMs: Date.now() - started, message: error instanceof Error ? error.message : "Database check failed." });
    }
  }

  {
    const started = Date.now();
    try {
      const latest = await prisma.economicEvent.aggregate({ _max: { updatedAt: true, timestamp: true }, _count: true });
      const updatedAt = latest._max.updatedAt;
      const ageHours = updatedAt ? (Date.now() - updatedAt.getTime()) / 3_600_000 : Infinity;
      const hasFuture = Number(latest._max.timestamp ?? 0n) > Date.now() + 30 * 86_400_000;
      const status: HealthStatus = !updatedAt || ageHours > 48 || !hasFuture ? "degraded" : "healthy";
      checks.push({
        component: "economic-calendar",
        status,
        latencyMs: Date.now() - started,
        message: updatedAt ? `Calendar last imported ${ageHours.toFixed(1)} hours ago.` : "No calendar imports found.",
        metadata: { events: latest._count, lastUpdatedAt: updatedAt?.toISOString() ?? null, hasThirtyDaysForward: hasFuture },
      });
    } catch (error) {
      checks.push({ component: "economic-calendar", status: "failed", latencyMs: Date.now() - started, message: error instanceof Error ? error.message : "Calendar check failed." });
    }
  }

  {
    const started = Date.now();
    try {
      const { client, bucket, marketPrefix, backupPrefix } = r2Client();
      const objects = await listAll(client, bucket);
      r2Bytes = objects.reduce((sum, object) => sum + object.size, 0);
      r2Objects = objects.length;
      const backupObjects = objects.filter((object) => object.key.startsWith(`${backupPrefix}/`) && object.key.endsWith(".dump"));
      backupCount = backupObjects.length;
      const latestBackup = backupObjects.sort((a, b) => (b.modified?.getTime() ?? 0) - (a.modified?.getTime() ?? 0))[0];
      latestBackupAt = latestBackup?.modified?.toISOString() ?? null;

      const recentFloor = expectedRecentMonth();
      marketData = SYMBOL_DEFINITIONS.filter((item) => item.symbol !== "DXY")
        .map(({ symbol }) => {
          const expression = new RegExp(`^${marketPrefix}/${symbol}/(\\d{4})/(\\d{2})\\.parquet$`);
          const months = objects.flatMap((object) => {
            const match = object.key.match(expression);
            return match ? [{ month: `${match[1]}-${match[2]}`, modified: object.modified }] : [];
          }).sort((a, b) => a.month.localeCompare(b.month));
          const last = months.at(-1);
          return {
            symbol,
            months: months.length,
            firstMonth: months[0]?.month ?? null,
            lastMonth: last?.month ?? null,
            latestUploadAt: last?.modified?.toISOString() ?? null,
            status: (!last || last.month < recentFloor ? "failed" : months.length < 12 ? "degraded" : "healthy") as HealthStatus,
          };
        });
      const unavailable = marketData.filter((symbol) => symbol.status === "failed").length;
      checks.push({
        component: "r2-market-data",
        status: unavailable ? "degraded" : "healthy",
        latencyMs: Date.now() - started,
        message: unavailable ? `${unavailable} provider symbols have no recent monthly object.` : "All provider symbols have recent R2 data.",
        metadata: { bytes: r2Bytes, objects: r2Objects, symbols: marketData.length, unavailable },
      });
      const backupAgeHours = latestBackup?.modified ? (Date.now() - latestBackup.modified.getTime()) / 3_600_000 : Infinity;
      checks.push({
        component: "database-backup",
        status: backupAgeHours <= 8 * 24 ? "healthy" : "degraded",
        latencyMs: 0,
        message: latestBackup ? `Latest backup is ${backupAgeHours.toFixed(1)} hours old.` : "No database backup exists yet.",
        metadata: { count: backupCount, latestBackupAt },
      });
    } catch (error) {
      checks.push({ component: "r2-market-data", status: "failed", latencyMs: Date.now() - started, message: error instanceof Error ? error.message : "R2 check failed." });
      checks.push({ component: "database-backup", status: "failed", latencyMs: 0, message: "Backup inventory could not be read." });
    }
  }

  {
    const started = Date.now();
    try {
      const disk = await statfs(process.cwd());
      const total = disk.blocks * disk.bsize;
      const free = disk.bavail * disk.bsize;
      diskUsedPercent = total ? ((total - free) / total) * 100 : 0;
      memoryUsedPercent = ((os.totalmem() - await availableMemoryBytes()) / os.totalmem()) * 100;
      const status: HealthStatus = diskUsedPercent >= 90 || memoryUsedPercent >= 95 ? "failed" : diskUsedPercent >= 80 || memoryUsedPercent >= 85 ? "degraded" : "healthy";
      checks.push({
        component: "lightsail",
        status,
        latencyMs: Date.now() - started,
        message: `Disk ${diskUsedPercent.toFixed(1)}% used; memory ${memoryUsedPercent.toFixed(1)}% used.`,
        metadata: { diskUsedPercent, memoryUsedPercent, loadAverage1m: os.loadavg()[0] ?? 0 },
      });
    } catch (error) {
      checks.push({ component: "lightsail", status: "failed", latencyMs: Date.now() - started, message: error instanceof Error ? error.message : "Host check failed." });
    }
  }

  return {
    status: overall(checks),
    checkedAt: new Date().toISOString(),
    checks,
    usage: { databaseBytes, r2Bytes, r2Objects, backupCount, latestBackupAt, diskUsedPercent, memoryUsedPercent },
    marketData,
  };
}
