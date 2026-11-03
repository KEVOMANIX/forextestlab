/** Import extracted HistData Generic ASCII M1 CSV files into an isolated R2 prefix.
 * Usage: npm run data:import-histdata -- --symbol EURUSD --file path/to/file.csv
 * Add --upload --rights-confirmed only after verifying permission to serve the data.
 */
import "dotenv/config";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { decompress } from "fzstd";

import { parseCliFlags } from "../src/lib/cli-flags";
import { histDataMonthKey, parseHistDataMinute } from "../src/lib/market-data/histdata";
import { encodeParquet, mergeCandles, rowsToCandles } from "../src/lib/market-data/r2-sync";
import { getSymbolDefinition } from "../src/lib/market-data/symbols";
import type { Candle } from "../src/lib/market-data/types";

async function main() {
  const flags = parseCliFlags(process.argv.slice(2));
  const symbol = flags.symbol?.toUpperCase();
  const file = flags.file;
  if (!file || !symbol || !getSymbolDefinition(symbol)) throw new Error("Pass --file <extracted M1 CSV> and a supported --symbol.");
  const prefix = (process.env.HISTDATA_R2_PREFIX?.trim() || "histdata_market_data").replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix === (process.env.R2_PREFIX?.trim() || "market_data")) throw new Error("HistData and Dukascopy R2 prefixes must differ.");
  const months = new Map<string, Candle[]>();
  let lines = 0;
  let invalid = 0;
  for await (const line of createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    lines += 1;
    const candle = parseHistDataMinute(line);
    if (!candle) { invalid += 1; continue; }
    const key = histDataMonthKey(prefix, symbol, candle.timestamp);
    const group = months.get(key) ?? [];
    group.push(candle);
    months.set(key, group);
  }
  if (!lines || invalid || !months.size) throw new Error(`Input rejected: ${lines} rows, ${invalid} invalid. Verify Generic ASCII M1 format.`);
  const count = [...months.values()].reduce((sum, candles) => sum + candles.length, 0);
  console.log(`Validated ${count.toLocaleString()} ${symbol} M1 candles in ${months.size} UTC month(s).`);
  for (const [key, candles] of months) console.log(`${key}: ${candles.length.toLocaleString()} rows`);
  if (flags.upload !== "true") { console.log("Dry run only. Add --upload --rights-confirmed after obtaining permission to serve HistData."); return; }
  if (flags["rights-confirmed"] !== "true") throw new Error("Upload requires --rights-confirmed after verifying your right to serve HistData in this product.");
  const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/$/, "");
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("R2 credentials are incomplete.");
  const client = new S3Client({ endpoint, region: "auto", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  for (const [key, incoming] of months) {
    let existing: Candle[] = [];
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await response.Body?.transformToByteArray();
      if (bytes) {
        const { parquetReadObjects } = await import("hyparquet");
        const rows = await parquetReadObjects({ file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, compressors: { ZSTD: (input: Uint8Array) => decompress(input) } });
        existing = rowsToCandles(rows, "histdata-r2");
      }
    } catch (error) {
      if (!error || typeof error !== "object" || !("name" in error) || error.name !== "NoSuchKey") throw error;
    }
    const merged = mergeCandles(existing, incoming);
    const parquet = await encodeParquet(merged, "1m", "histdata");
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(parquet), ContentType: "application/vnd.apache.parquet" }));
    console.log(`Uploaded ${key}: ${merged.length.toLocaleString()} candles`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
