import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { collectOperationsSnapshot, type OperationsSnapshot } from "@/lib/operations/health";

/**
 * The latest full operations snapshot, written by the monitor every 15 minutes.
 *
 * A fresh snapshot lists every object in R2 (9,000+, about ten seconds), so
 * the operations page used to take ten seconds to open. It now shows the
 * monitor's last result at once and re-checks only when asked, or when the
 * stored one is missing or stale.
 */
const SNAPSHOT_PATH = path.resolve("data/.operations-snapshot.json");
const STALE_AFTER_MS = 30 * 60_000;

export async function saveOperationsSnapshot(snapshot: OperationsSnapshot): Promise<void> {
  await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  const temporary = `${SNAPSHOT_PATH}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
  await rename(temporary, SNAPSHOT_PATH);
}

async function readOperationsSnapshot(): Promise<OperationsSnapshot | null> {
  try {
    const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as OperationsSnapshot;
    return Array.isArray(snapshot.checks) && typeof snapshot.checkedAt === "string" ? snapshot : null;
  } catch {
    return null;
  }
}

/** The stored snapshot while it is recent; otherwise a fresh one, which is then stored. */
export async function latestOperationsSnapshot(): Promise<OperationsSnapshot> {
  const stored = await readOperationsSnapshot();
  if (stored && Date.now() - Date.parse(stored.checkedAt) < STALE_AFTER_MS) return stored;
  return refreshOperationsSnapshot();
}

export async function refreshOperationsSnapshot(): Promise<OperationsSnapshot> {
  const snapshot = await collectOperationsSnapshot({ checkWebsite: true });
  await saveOperationsSnapshot(snapshot).catch((error) => console.error("Could not store the operations snapshot:", error));
  return snapshot;
}
