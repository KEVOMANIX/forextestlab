import "dotenv/config";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const REGENERABLE_TABLE_DATA = [
  "public.\"EconomicEvent\"",
  "public.\"MarketCandle\"",
  "public.\"DataImport\"",
  "public.\"ProductEvent\"",
  "public.\"OperationalCheck\"",
];
const RETAIN_BACKUPS = 4;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function run(command: string, args: string[], quiet = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", quiet ? "ignore" : "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

async function checksum(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  const databaseUrl = process.env.DIRECT_URL?.trim() || required("DATABASE_URL");
  const bucket = required("R2_BUCKET_NAME");
  const prefix = (process.env.R2_BACKUP_PREFIX?.trim() || "database_backups").replace(/^\/+|\/+$/g, "");
  const client = new S3Client({
    endpoint: required("R2_ENDPOINT").replace(/\/$/, ""),
    region: "auto",
    credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
  });
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "forextestlab-backup-"));
  const archive = path.join(temporaryDirectory, "database.dump");

  try {
    await run("pg_dump", [
      "--format=custom",
      "--compress=6",
      "--no-owner",
      "--no-acl",
      ...REGENERABLE_TABLE_DATA.map((table) => `--exclude-table-data=${table}`),
      `--file=${archive}`,
      databaseUrl,
    ]);
    const catalogue = await capture("pg_restore", ["--list", archive]);
    for (const table of REGENERABLE_TABLE_DATA) {
      const tableName = table.replace('public."', "").replace('"', "");
      if (catalogue.includes(`TABLE DATA public ${tableName} `)) {
        throw new Error(`Backup unexpectedly contains regenerable table data for ${table}.`);
      }
    }
    for (const tableName of ["UserProfile", "BacktestSession"]) {
      if (!catalogue.includes(`TABLE DATA public ${tableName} `)) {
        throw new Error(`Backup is missing critical table data for public.\"${tableName}\".`);
      }
    }
    const digest = await checksum(archive);
    const info = await stat(archive);
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const key = `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/forextestlab-critical-${stamp}.dump`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(archive),
      ContentLength: info.size,
      ContentType: "application/vnd.postgresql.custom-dump",
      Metadata: {
        sha256: digest,
        created_utc: now.toISOString(),
        verified: "pg_restore-list-and-scope",
        scope: "critical-data",
        excluded_table_data: REGENERABLE_TABLE_DATA.map((table) => table.replace('public."', "").replace('"', "")).join(","),
      },
    }));

    let continuationToken: string | undefined;
    const stored: Array<{ key: string; modified: number }> = [];
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/`, ContinuationToken: continuationToken }));
      for (const object of page.Contents ?? []) {
        if (object.Key?.endsWith(".dump")) stored.push({ key: object.Key, modified: object.LastModified?.getTime() ?? 0 });
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    const criticalBackups = stored
      .filter((object) => path.posix.basename(object.key).startsWith("forextestlab-critical-"))
      .sort((left, right) => right.modified - left.modified);
    const legacyBackups = stored.filter((object) => !path.posix.basename(object.key).startsWith("forextestlab-critical-"));
    const expired = [
      ...legacyBackups.map((object) => object.key),
      ...criticalBackups.slice(RETAIN_BACKUPS).map((object) => object.key),
    ];
    if (expired.length) {
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Quiet: true, Objects: expired.map((Key) => ({ Key })) } }));
    }
    console.log(`Uploaded verified critical-data backup ${key} (${info.size} bytes, sha256 ${digest}); retained ${RETAIN_BACKUPS} weekly backup(s) maximum and removed ${expired.length} older backup(s).`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
