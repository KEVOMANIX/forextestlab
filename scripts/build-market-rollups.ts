import "dotenv/config";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { decompress as decompressZstd } from "fzstd";

import { aggregateCandles } from "../src/lib/market-data/aggregation";
import { encodeParquet, mergeCandles, rowsToCandles } from "../src/lib/market-data/r2-sync";

const COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"];
const DEFAULT_SOURCE = "E:\\desktop\\dukascopy-market-data\\market_data";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function parquetFiles(folder: string): Promise<string[]> {
  const years = (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const files: string[] = [];
  for (const year of years) {
    const yearFolder = path.join(folder, year);
    for (const file of (await readdir(yearFolder)).filter((name) => name.endsWith(".parquet")).sort()) {
      files.push(path.join(yearFolder, file));
    }
  }
  return files;
}

async function main() {
  const { parquetReadObjects } = await import("hyparquet");
  const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/$/, "");
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("R2 credentials are incomplete.");
  const source = path.resolve(argument("source") ?? DEFAULT_SOURCE);
  const available = (await readdir(source, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const requested = argument("symbols")?.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  const symbols = requested?.length ? requested : available;
  const client = new S3Client({ endpoint, region: "auto", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  const prefix = (process.env.R2_PREFIX?.trim() || "market_data").replace(/^\/+|\/+$/g, "");

  for (const symbol of symbols) {
    if (!available.includes(symbol)) {
      console.warn(`${symbol}: local source folder is unavailable; skipped.`);
      continue;
    }
    let daily = [] as ReturnType<typeof rowsToCandles>;
    const files = await parquetFiles(path.join(source, symbol));
    for (const file of files) {
      const bytes = await readFile(file);
      const rows = await parquetReadObjects({
        file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        compressors: { ZSTD: (input) => decompressZstd(input) },
        columns: COLUMNS,
      });
      daily = mergeCandles(daily, aggregateCandles(rowsToCandles(rows), "1m", "1d"));
    }
    if (!daily.length) {
      console.warn(`${symbol}: no valid candles; skipped.`);
      continue;
    }
    const parquet = await encodeParquet(daily, "1d");
    const key = `${prefix}_rollups/1d/${symbol}.parquet`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(parquet),
      ContentType: "application/vnd.apache.parquet",
      Metadata: { timeframe: "1d", rows: String(daily.length), updated: new Date().toISOString() },
    }));
    console.log(`${symbol}: uploaded ${daily.length.toLocaleString()} daily candles.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
