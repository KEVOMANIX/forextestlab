/**
 * Copy journal validity from authoritative replay snapshots into the
 * relational trade projection used by dashboard and portfolio aggregates.
 * Idempotent and safe to run after every deployment of the validity column.
 */
import "dotenv/config";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

import { prisma } from "../src/lib/db";
import type { ClosedTrade, SessionState, TradeValidity } from "../src/lib/backtest/types";

const gunzipAsync = promisify(gunzip);
const VALIDITIES = ["valid", "invalid", "experimental"] as const;

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

async function readState(stateJson: string, objectKey: string | null): Promise<SessionState> {
  if (!objectKey) return JSON.parse(stateJson) as SessionState;
  const object = await client().send(
    new GetObjectCommand({ Bucket: required("R2_BUCKET_NAME"), Key: objectKey }),
  );
  if (!object.Body) throw new Error(`Snapshot ${objectKey} is empty.`);
  const compressed = Buffer.from(await object.Body.transformToByteArray());
  return JSON.parse((await gunzipAsync(compressed)).toString("utf8")) as SessionState;
}

function fingerprint(trade: Pick<ClosedTrade, "entryTime" | "exitTime" | "entryIndex" | "exitIndex" | "direction" | "lots" | "pnl">): string {
  return [
    trade.entryTime,
    trade.exitTime,
    trade.entryIndex,
    trade.exitIndex,
    trade.direction,
    trade.lots,
    trade.pnl,
  ].join("|");
}

async function main() {
  const sessions = await prisma.backtestSession.findMany({
    where: { trades: { some: {} } },
    select: {
      id: true,
      stateJson: true,
      stateObjectKey: true,
      trades: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          entryTime: true,
          exitTime: true,
          entryIndex: true,
          exitIndex: true,
          direction: true,
          lots: true,
          pnl: true,
        },
      },
    },
  });

  let updated = 0;
  let unmatched = 0;
  const staleTradeIds: string[] = [];
  const unmatchedRows: Array<{
    sessionId: string;
    tradeId: string;
    fingerprint: string;
    snapshotTradeCount: number;
    nearbySnapshotTrades: string[];
  }> = [];
  for (const session of sessions) {
    const state = await readState(session.stateJson, session.stateObjectKey);
    const snapshotByFingerprint = new Map<string, TradeValidity[]>();
    for (const trade of state.closedTrades ?? []) {
      const key = fingerprint(trade);
      const queue = snapshotByFingerprint.get(key) ?? [];
      queue.push(trade.journal?.validity ?? "valid");
      snapshotByFingerprint.set(key, queue);
    }

    const idsByValidity = new Map<TradeValidity, string[]>(
      VALIDITIES.map((validity) => [validity, []]),
    );
    for (const trade of session.trades) {
      const key = fingerprint({
        ...trade,
        entryTime: Number(trade.entryTime),
        exitTime: Number(trade.exitTime),
        direction: trade.direction as ClosedTrade["direction"],
      });
      const validity = snapshotByFingerprint.get(key)?.shift();
      if (!validity) {
        unmatched += 1;
        const nearbySnapshotTrades = (state.closedTrades ?? [])
          .filter((snapshotTrade) =>
            snapshotTrade.entryTime === Number(trade.entryTime) ||
            snapshotTrade.exitTime === Number(trade.exitTime),
          );
        // A projected row with neither timestamp in the authoritative state is
        // residue from an older engine state and must not enter aggregates.
        if (nearbySnapshotTrades.length === 0) staleTradeIds.push(trade.id);
        if (unmatchedRows.length < 20) {
          unmatchedRows.push({
            sessionId: session.id,
            tradeId: trade.id,
            fingerprint: key,
            snapshotTradeCount: state.closedTrades?.length ?? 0,
            nearbySnapshotTrades: nearbySnapshotTrades
              .slice(0, 5)
              .map((snapshotTrade) => `${fingerprint(snapshotTrade)}|${snapshotTrade.journal?.validity ?? "valid"}`),
          });
        }
        continue;
      }
      idsByValidity.get(validity)!.push(trade.id);
    }

    for (const validity of VALIDITIES) {
      const ids = idsByValidity.get(validity)!;
      for (let index = 0; index < ids.length; index += 500) {
        const batch = ids.slice(index, index + 500);
        const result = await prisma.simulatedTrade.updateMany({
          where: { id: { in: batch } },
          data: { validity },
        });
        updated += result.count;
      }
    }
  }

  const removedStale = staleTradeIds.length
    ? (await prisma.simulatedTrade.deleteMany({ where: { id: { in: staleTradeIds } } })).count
    : 0;
  console.log(JSON.stringify({
    sessions: sessions.length,
    updated,
    unmatched,
    removedStale,
    unmatchedRows,
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
