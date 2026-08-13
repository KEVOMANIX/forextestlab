import "dotenv/config";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
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
  const retentionDays = Math.max(2, Number(process.env.BACKUP_RETENTION_DAYS || "7"));
  const client = new S3Client({
    endpoint: required("R2_ENDPOINT").replace(/\/$/, ""),
    region: "auto",
    credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
  });
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "forextestlab-backup-"));
  const archive = path.join(temporaryDirectory, "database.dump");

  try {
    await run("pg_dump", ["--format=custom", "--compress=6", "--no-owner", "--no-acl", `--file=${archive}`, databaseUrl]);
    await run("pg_restore", ["--list", archive]);
    const digest = await checksum(archive);
    const info = await stat(archive);
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const key = `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/forextestlab-${stamp}.dump`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(archive),
      ContentLength: info.size,
      ContentType: "application/vnd.postgresql.custom-dump",
      Metadata: { sha256: digest, created_utc: now.toISOString(), verified: "pg_restore-list" },
    }));

    const cutoff = Date.now() - retentionDays * 86_400_000;
    let continuationToken: string | undefined;
    const expired: string[] = [];
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/`, ContinuationToken: continuationToken }));
      for (const object of page.Contents ?? []) {
        if (object.Key && object.LastModified && object.LastModified.getTime() < cutoff) expired.push(object.Key);
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    for (let index = 0; index < expired.length; index += 1000) {
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Quiet: true, Objects: expired.slice(index, index + 1000).map((Key) => ({ Key })) } }));
    }
    console.log(`Uploaded verified backup ${key} (${info.size} bytes, sha256 ${digest}); removed ${expired.length} expired backup(s).`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
