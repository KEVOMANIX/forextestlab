/** Upload converted HistData monthly Parquet files to a private R2 bucket.
 *
 * FOREXTESTLAB_ENV_FILE=E:/desktop/forextestlab/.env npx tsx scripts/upload-histdata-parquet-r2.ts E:/desktop/histdata-market-data
 * Re-running is safe: matching-size objects are skipped. The web replay gate is
 * independent and must remain disabled until serving rights are confirmed.
 */
import { config } from "dotenv";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

config({ path: process.env.FOREXTESTLAB_ENV_FILE || ".env" });

const root: string = process.argv[2] || "";
if (!root) throw new Error("Pass the HistData download root.");
const bucket = process.env.R2_BUCKET_NAME;
const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) throw new Error("R2 credentials are incomplete.");

const client = new S3Client({ endpoint, region: "auto", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
const manifest = readFileSync(process.env.HISTDATA_MANIFEST_FILE || join(root, "parquet_manifest.csv"), "utf8").trim().split(/\r?\n/);
if (manifest.shift() !== "Symbol,Key,Candles,Bytes,FirstUtc,LastUtc") throw new Error("Unexpected Parquet manifest format.");
const entries = manifest.map((line) => {
  const [symbol = "", key = "", candles = "", bytes = ""] = line.split(",");
  if (!/^histdata_market_data\/[A-Z0-9]+\/\d{4}\/\d{2}\.parquet$/.test(key)) throw new Error(`Invalid key: ${key}`);
  const path = join(root, "parquet", ...key.split("/"));
  if (statSync(path).size !== Number(bytes)) throw new Error(`Parquet size mismatch: ${key}`);
  return { symbol, key, candles: Number(candles), bytes: Number(bytes), path };
});

let cursor = 0;
let uploaded = 0;
let skipped = 0;
let verifiedBytes = 0;
async function worker() {
  while (cursor < entries.length) {
    const entry = entries[cursor++];
    if (!entry) break;
    for (let attempt = 0; ; attempt++) {
      try {
        let exists = false;
        try {
          const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: entry.key }));
          exists = head.ContentLength === entry.bytes;
        } catch (error) {
          if ((error as { name?: string }).name !== "NotFound" && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
        }
        if (!exists) {
          await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: entry.key,
            Body: readFileSync(entry.path),
            ContentLength: entry.bytes,
            ContentType: "application/vnd.apache.parquet",
            Metadata: { source: "histdata", timeframe: "1m", candles: String(entry.candles) },
          }));
          const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: entry.key }));
          if (head.ContentLength !== entry.bytes) throw new Error(`Remote size mismatch: ${entry.key}`);
          uploaded++;
        } else skipped++;
        break;
      } catch (error) {
        if (attempt >= 7) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 15000)));
      }
    }
    verifiedBytes += entry.bytes;
    if ((uploaded + skipped) % 100 === 0) console.log(`${uploaded + skipped}/${entries.length} verified; ${uploaded} uploaded; ${skipped} already present`);
  }
}
async function main() {
  await Promise.all(Array.from({ length: 24 }, () => worker()));
  console.log(`Complete: ${entries.length} objects, ${verifiedBytes} bytes verified; ${uploaded} uploaded, ${skipped} already present.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
