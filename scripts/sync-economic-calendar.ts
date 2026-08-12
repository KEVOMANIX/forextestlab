import "dotenv/config";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { importEconomicCalendar } from "../src/lib/economic-calendar/import";

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  const file = path.resolve(readFlag("file") || "data/forextestlab-calendar.csv");
  const stateFile = path.resolve(
    readFlag("state-file") || "data/.forextestlab-calendar.sha256",
  );
  const currentHash = await sha256(file);
  const previousHash = await readFile(stateFile, "utf8").catch(() => "");
  if (previousHash.trim() === currentHash) {
    console.log("Economic calendar export is unchanged; nothing to import.");
    return;
  }

  const report = await importEconomicCalendar({
    filePath: file,
    source: "mt5",
  });
  if (report.rowsRead === 0 || report.rowsWritten === 0) {
    throw new Error("Refusing to accept an empty economic-calendar export.");
  }

  await mkdir(path.dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${currentHash}\n`, { mode: 0o600 });
  await rename(temporary, stateFile);
  console.log(
    `Imported ${report.rowsWritten} calendar rows (${report.withActual} with actual values; ${report.rowsRejected} rejected).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
