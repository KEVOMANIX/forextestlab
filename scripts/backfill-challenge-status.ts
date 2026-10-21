/**
 * Mirror prop-firm challenge state onto session rows whose snapshot lives in R2.
 *
 * The 202610210001_challenge_columns migration fills these columns from inline
 * snapshots and marks every challenge from its compact config, but an R2-backed
 * snapshot is out of SQL's reach. Idempotent: run once after that migration.
 */
import "dotenv/config";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

import { challengeColumns } from "../src/lib/backtest/challenge-record";
import { prisma } from "../src/lib/db";
import type { SessionState } from "../src/lib/backtest/types";

const gunzipAsync = promisify(gunzip);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to read R2 session snapshots.`);
  return value;
}

let r2Client: S3Client | null = null;

function client(): S3Client {
  if (r2Client) return r2Client;
  r2Client = new S3Client({
    endpoint: required("R2_ENDPOINT").replace(/\/$/, ""),
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  return r2Client;
}

async function readState(objectKey: string): Promise<SessionState> {
  const object = await client().send(
    new GetObjectCommand({ Bucket: required("R2_BUCKET_NAME"), Key: objectKey }),
  );
  if (!object.Body) throw new Error(`Snapshot ${objectKey} is empty.`);
  const compressed = Buffer.from(await object.Body.transformToByteArray());
  return JSON.parse((await gunzipAsync(compressed)).toString("utf8")) as SessionState;
}

async function main() {
  const sessions = await prisma.$queryRaw<Array<{ id: string; stateObjectKey: string }>>`
    SELECT "id", "stateObjectKey"
    FROM "BacktestSession"
    WHERE "stateObjectKey" IS NOT NULL
      AND jsonb_typeof("stateJson"::jsonb #> '{config,propFirm}') = 'object'
  `;

  let updated = 0;
  const failed: Array<{ sessionId: string; error: string }> = [];
  for (const session of sessions) {
    try {
      const state = await readState(session.stateObjectKey);
      await prisma.backtestSession.update({
        where: { id: session.id },
        data: challengeColumns(state),
        select: { id: true },
      });
      updated += 1;
    } catch (error) {
      failed.push({ sessionId: session.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(JSON.stringify({ sessions: sessions.length, updated, failed }));
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
