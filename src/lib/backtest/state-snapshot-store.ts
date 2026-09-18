import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";

import type { SessionState } from "./types";
import type { Candle } from "@/lib/market-data/types";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** Small snapshots cost less as one PostgreSQL row and consume no R2 operation. */
export const R2_SNAPSHOT_THRESHOLD_BYTES = 128 * 1024;
const DEFAULT_PREFIX = "backtest_snapshots";

interface SnapshotConfig {
  bucket: string;
  prefix: string;
  client: S3Client;
}

let cachedConfig: SnapshotConfig | null | undefined;

function snapshotConfig(): SnapshotConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/$/, "");
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    cachedConfig = null;
    return null;
  }
  cachedConfig = {
    bucket,
    prefix: (process.env.R2_SNAPSHOT_PREFIX?.trim() || DEFAULT_PREFIX).replace(
      /^\/+|\/+$/g,
      "",
    ),
    client: new S3Client({
      endpoint,
      region: "auto",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return cachedConfig;
}

function objectKey(sessionId: string, prefix: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    throw new Error("Invalid session id for snapshot storage.");
  }
  return `${prefix}/${sessionId}.json.gz`;
}

function candleObjectKey(sessionId: string, prefix: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    throw new Error("Invalid session id for candle snapshot storage.");
  }
  return `${prefix}/candles/${sessionId}.json.gz`;
}

/** Metadata list pages need without downloading the full object. */
function compactStateJson(state: SessionState): string {
  return JSON.stringify({ config: state.config });
}

export interface PersistedSnapshot {
  stateJson: string;
  stateObjectKey: string | null;
  stateSizeBytes: number;
}

/** Upload first, then let PostgreSQL point at the complete private object. */
export async function prepareSessionSnapshot(
  sessionId: string,
  state: SessionState,
  existingObjectKey: string | null,
): Promise<PersistedSnapshot> {
  const json = JSON.stringify(state);
  const stateSizeBytes = Buffer.byteLength(json);
  const config = snapshotConfig();
  const shouldUseR2 =
    existingObjectKey != null || stateSizeBytes >= R2_SNAPSHOT_THRESHOLD_BYTES;

  if (!shouldUseR2 || !config) {
    return { stateJson: json, stateObjectKey: null, stateSizeBytes };
  }

  const key = existingObjectKey ?? objectKey(sessionId, config.prefix);
  const compressed = await gzipAsync(Buffer.from(json), { level: 6 });
  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: compressed,
      ContentType: "application/json",
      ContentEncoding: "gzip",
      CacheControl: "private, no-store",
      Metadata: {
        session: sessionId,
        uncompressedbytes: String(stateSizeBytes),
      },
    }),
  );
  return {
    stateJson: compactStateJson(state),
    stateObjectKey: key,
    stateSizeBytes,
  };
}

export async function readSessionSnapshot(
  stateJson: string,
  stateObjectKey: string | null,
): Promise<string> {
  if (!stateObjectKey) return stateJson;
  const config = snapshotConfig();
  if (!config) throw new Error("R2 session snapshot storage is not configured.");

  try {
    const object = await config.client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: stateObjectKey }),
    );
    if (!object.Body) throw new Error("The saved session snapshot is empty.");
    const compressed = Buffer.from(await object.Body.transformToByteArray());
    return (await gunzipAsync(compressed)).toString("utf8");
  } catch (error) {
    if (
      error instanceof NoSuchKey ||
      (error as { name?: string } | null)?.name === "NoSuchKey"
    ) {
      throw new Error("The saved session snapshot is missing from R2.");
    }
    throw error;
  }
}

/**
 * Read the immutable candle prefix already assembled for a long-running
 * session. One compressed object is substantially faster than reopening and
 * decoding every monthly Parquet object whenever the app process restarts.
 */
export async function readSessionCandleSnapshot(
  sessionId: string,
  minimumCandles: number,
): Promise<Candle[] | null> {
  const config = snapshotConfig();
  if (!config) return null;
  try {
    const object = await config.client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: candleObjectKey(sessionId, config.prefix),
      }),
    );
    if (!object.Body) return null;
    const compressed = Buffer.from(await object.Body.transformToByteArray());
    const parsed = JSON.parse((await gunzipAsync(compressed)).toString("utf8")) as {
      version?: number;
      candles?: Candle[];
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.candles)) return null;
    return parsed.candles.length >= minimumCandles ? parsed.candles : null;
  } catch (error) {
    if (
      error instanceof NoSuchKey ||
      (error as { name?: string } | null)?.name === "NoSuchKey"
    ) {
      return null;
    }
    throw error;
  }
}

export async function writeSessionCandleSnapshot(
  sessionId: string,
  candles: Candle[],
): Promise<void> {
  const config = snapshotConfig();
  if (!config || candles.length === 0) return;
  const json = JSON.stringify({ version: 1, candles });
  const compressed = await gzipAsync(Buffer.from(json), { level: 4 });
  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: candleObjectKey(sessionId, config.prefix),
      Body: compressed,
      ContentType: "application/json",
      ContentEncoding: "gzip",
      CacheControl: "private, no-store",
      Metadata: {
        session: sessionId,
        candles: String(candles.length),
      },
    }),
  );
}

/** Database deletion is authoritative; failure here leaves only an orphan. */
export async function deleteSessionSnapshot(
  stateObjectKey: string | null,
  sessionId?: string,
): Promise<void> {
  const config = snapshotConfig();
  if (!config) return;
  const keys = [
    stateObjectKey,
    sessionId ? candleObjectKey(sessionId, config.prefix) : null,
  ].filter((key): key is string => Boolean(key));
  await Promise.all(
    keys.map((Key) =>
      config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key })),
    ),
  );
}
