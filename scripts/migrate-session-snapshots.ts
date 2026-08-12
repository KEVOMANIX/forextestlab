/**
 * One-time/backfill migration of large PostgreSQL replay snapshots to R2.
 *
 * The object is uploaded before the row is changed. Run while the application
 * service is stopped so a live action cannot race an older backfill snapshot.
 */
import "dotenv/config";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

import { prisma } from "../src/lib/db";

const gzipAsync = promisify(gzip);
const THRESHOLD_BYTES = 128 * 1024;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const bucket = required("R2_BUCKET_NAME");
  const prefix = (process.env.R2_SNAPSHOT_PREFIX?.trim() || "backtest_snapshots")
    .replace(/^\/+|\/+$/g, "");
  const client = new S3Client({
    endpoint: required("R2_ENDPOINT").replace(/\/$/, ""),
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });

  const sessions = await prisma.backtestSession.findMany({
    where: {
      stateObjectKey: null,
      stateSizeBytes: { gte: THRESHOLD_BYTES },
    },
    orderBy: { stateSizeBytes: "desc" },
    select: { id: true, stateJson: true, stateSizeBytes: true },
  });

  let migrated = 0;
  let sourceBytes = 0;
  let compressedBytes = 0;
  for (const session of sessions) {
    const state = JSON.parse(session.stateJson) as { config?: unknown };
    if (!state.config) {
      console.warn(`Skipping ${session.id}: snapshot has no config.`);
      continue;
    }
    const key = `${prefix}/${session.id}.json.gz`;
    const compressed = await gzipAsync(Buffer.from(session.stateJson), { level: 6 });
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: compressed,
        ContentType: "application/json",
        ContentEncoding: "gzip",
        CacheControl: "private, no-store",
        Metadata: {
          session: session.id,
          uncompressedbytes: String(session.stateSizeBytes),
        },
      }),
    );
    await prisma.backtestSession.update({
      where: { id: session.id },
      data: {
        stateJson: JSON.stringify({ config: state.config }),
        stateObjectKey: key,
      },
      select: { id: true },
    });
    migrated += 1;
    sourceBytes += session.stateSizeBytes;
    compressedBytes += compressed.byteLength;
    console.log(`Migrated ${session.id} (${session.stateSizeBytes} -> ${compressed.byteLength} bytes).`);
  }

  console.log(
    JSON.stringify({ migrated, sourceBytes, compressedBytes, thresholdBytes: THRESHOLD_BYTES }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
