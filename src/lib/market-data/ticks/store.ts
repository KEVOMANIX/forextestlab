import "server-only";

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { decompress as decompressZstd } from "fzstd";
import { parquetRead, type Compressors } from "hyparquet";

import { concatTicks, DAY_MS, decodeTicks, encodeTicks, EMPTY_TICKS, monthKey, monthsBetween, sliceTicks, splitByDay, tickSymbolFor, type TickSeries } from "./format";

/**
 * Server-side tick store.
 *
 * The full archive lives on the Oracle tick box (/srv/forextestlab-ticks/histdata/<SYM>/<YYYY-MM>.parquet).
 * This server reaches it with a read-only rsync key (rrsync, no shell). A month
 * is fetched the first time any feature needs it, split into UTC-day files in
 * TICK_CACHE_DIR, and the Parquet copy is discarded. Least recently used
 * months are evicted past TICK_CACHE_MAX_GB.
 *
 * With TICK_STORE_REMOTE unset (local development, tests) the store is off and
 * every feature keeps its candle-only behaviour.
 */

const run = promisify(execFile);
const COMPRESSORS: Compressors = { ZSTD: (input) => decompressZstd(input) };
const MONTH_LIST_TTL_MS = 60 * 60_000;
const MAX_DAYS_IN_MEMORY = 48;

type Config = { remote: string; sshKey: string; knownHosts: string; cacheDir: string; maxBytes: number };

function config(): Config | null {
  const remote = process.env.TICK_STORE_REMOTE?.trim();
  if (!remote) return null;
  const home = os.homedir();
  return {
    remote,
    sshKey: process.env.TICK_STORE_SSH_KEY?.trim() || path.join(home, ".ssh", "ticks_ro"),
    knownHosts: process.env.TICK_STORE_KNOWN_HOSTS?.trim() || path.join(home, ".ssh", "ticks_known_hosts"),
    cacheDir: process.env.TICK_CACHE_DIR?.trim() || path.join(home, "tick-cache"),
    maxBytes: Math.max(1, Number(process.env.TICK_CACHE_MAX_GB) || 12) * 1024 ** 3,
  };
}

export function tickStoreEnabled(): boolean {
  return config() !== null;
}

function rsyncArgs(cfg: Config): string[] {
  return ["-e", `ssh -i ${cfg.sshKey} -o UserKnownHostsFile=${cfg.knownHosts} -o BatchMode=yes -o ConnectTimeout=15`];
}

const SYMBOL_PATTERN = /^[A-Z0-9]{3,20}$/;

/** Months the archive has for a tick symbol, cached for an hour. */
const monthLists = new Map<string, { at: number; months: Set<string>; pending?: Promise<Set<string>> }>();

export async function tickMonths(symbol: string): Promise<Set<string>> {
  const cfg = config();
  const sym = tickSymbolFor(symbol);
  if (!cfg || !SYMBOL_PATTERN.test(sym)) return new Set();
  const known = monthLists.get(sym);
  if (known && Date.now() - known.at < MONTH_LIST_TTL_MS) return known.months;
  if (known?.pending) return known.pending;
  const pending = run("rsync", [...rsyncArgs(cfg), "--list-only", `${cfg.remote}:${sym}/`], { timeout: 30_000 })
    .then(({ stdout }) => new Set([...stdout.matchAll(/(\d{4}-\d{2})\.parquet\s*$/gm)].map((match) => match[1]!)))
    .catch(() => known?.months ?? new Set<string>());
  monthLists.set(sym, { at: known?.at ?? 0, months: known?.months ?? new Set(), pending });
  const months = await pending;
  monthLists.set(sym, { at: Date.now(), months });
  return months;
}

const monthDir = (cfg: Config, sym: string, month: string) => path.join(cfg.cacheDir, sym, month);
/**
 * HistData months follow New York time, so a file also holds the first hours
 * of the next UTC month. Each month's share of a day is its own file, named
 * after the source month, and readers merge them.
 */
const dayFile = (dir: string, day: number, sourceMonth: string) => path.join(dir, `${new Date(day).toISOString().slice(0, 10)}.${sourceMonth}.bin`);
/** A month file can start this long before its UTC month (EST/EDT is UTC-4/-5). */
const SOURCE_LEAD_MS = 6 * 60 * 60_000;

/** Decodes a tick Parquet month (time, bid, ask) into arrays. */
export async function decodeTickParquet(bytes: ArrayBuffer): Promise<TickSeries> {
  const file = { byteLength: bytes.byteLength, slice: (start: number, end?: number) => bytes.slice(start, end) };
  const columns: Record<string, ArrayLike<number>[]> = { time: [], bid: [], ask: [] };
  await parquetRead({
    file,
    columns: ["time", "bid", "ask"],
    compressors: COMPRESSORS,
    parsers: {
      timestampFromMilliseconds: (value: bigint) => Number(value),
      timestampFromMicroseconds: (value: bigint) => Number(value / 1000n),
      timestampFromNanoseconds: (value: bigint) => Number(value / 1_000_000n),
      dateFromDays: (days: number) => days * DAY_MS,
      stringFromBytes: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
      jsonFromBytes: (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)),
      geometryFromBytes: (bytes: Uint8Array) => bytes,
      geographyFromBytes: (bytes: Uint8Array) => bytes,
      uuidFromBytes: (bytes: Uint8Array) => bytes,
    },
    onChunk: (chunk) => { columns[chunk.columnName]?.push(chunk.columnData as ArrayLike<number>); },
  });
  const join = (parts: ArrayLike<number>[]) => {
    const out = new Float64Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { out.set(part as ArrayLike<number>, offset); offset += part.length; }
    return out;
  };
  return { time: join(columns.time!), bid: join(columns.bid!), ask: join(columns.ask!) };
}

/** Fetches and splits one month into day files; resolves false when the archive has no such month. */
const monthJobs = new Map<string, Promise<boolean>>();

async function ensureMonth(cfg: Config, sym: string, month: string): Promise<boolean> {
  const dir = monthDir(cfg, sym, month);
  const marker = path.join(dir, ".complete");
  try { await stat(marker); void touch(marker); return true; } catch { /* not cached yet */ }
  const key = `${sym}/${month}`;
  const running = monthJobs.get(key);
  if (running) return running;
  const job = (async () => {
    if (!(await tickMonths(sym)).has(month)) return false;
    await mkdir(dir, { recursive: true });
    const download = path.join(dir, `${month}.parquet.part`);
    await run("rsync", [...rsyncArgs(cfg), "--timeout=60", `${cfg.remote}:${sym}/${month}.parquet`, download], { timeout: 180_000 });
    const bytes = await readFile(download);
    const ticks = await decodeTickParquet(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    for (const [day, part] of splitByDay(ticks)) {
      const target = dayFile(dir, day, month);
      await writeFile(`${target}.part`, Buffer.from(encodeTicks(part, day)));
      await rename(`${target}.part`, target);
    }
    await rm(download, { force: true });
    await writeFile(marker, String(Date.now()));
    void evictOldMonths(cfg);
    return true;
  })().finally(() => monthJobs.delete(key));
  monthJobs.set(key, job);
  return job;
}

async function touch(file: string) {
  try { await writeFile(file, String(Date.now())); } catch { /* best effort */ }
}

/** Keeps the cache under its size cap by removing the least recently used months. */
let evicting = false;
async function evictOldMonths(cfg: Config) {
  if (evicting) return;
  evicting = true;
  try {
    const months: { dir: string; used: number; bytes: number }[] = [];
    for (const sym of await readdir(cfg.cacheDir).catch(() => [] as string[])) {
      for (const month of await readdir(path.join(cfg.cacheDir, sym)).catch(() => [] as string[])) {
        const dir = path.join(cfg.cacheDir, sym, month);
        let used = 0, bytes = 0;
        try { used = Number(await readFile(path.join(dir, ".complete"), "utf8")) || 0; } catch { continue; }
        for (const file of await readdir(dir)) bytes += (await stat(path.join(dir, file))).size;
        months.push({ dir, used, bytes });
      }
    }
    let total = months.reduce((sum, month) => sum + month.bytes, 0);
    for (const month of months.sort((a, b) => a.used - b.used)) {
      if (total <= cfg.maxBytes) break;
      await rm(month.dir, { recursive: true, force: true });
      total -= month.bytes;
    }
  } finally { evicting = false; }
}

/** Recently read days, decoded. */
const dayCache = new Map<string, TickSeries>();

async function readDay(cfg: Config, sym: string, day: number): Promise<TickSeries> {
  const key = `${sym}:${day}`;
  const hit = dayCache.get(key);
  if (hit) { dayCache.delete(key); dayCache.set(key, hit); return hit; }
  const parts: TickSeries[] = [];
  for (const source of new Set([monthKey(day - SOURCE_LEAD_MS), monthKey(day)])) {
    try { parts.push(decodeTicks(await readFile(dayFile(monthDir(cfg, sym, source), day, source)))); } catch { /* none from that month (weekend, holiday) */ }
  }
  parts.sort((a, b) => (a.time[0] ?? 0) - (b.time[0] ?? 0));
  const ticks = parts.length === 0 ? EMPTY_TICKS : parts.length === 1 ? parts[0]! : concatTicks(parts);
  dayCache.set(key, ticks);
  while (dayCache.size > MAX_DAYS_IN_MEMORY) dayCache.delete(dayCache.keys().next().value!);
  return ticks;
}

/**
 * Ticks for an app symbol in [from, to). Resolves null when the tick store is
 * off or the archive has no month covering the span, so callers keep their
 * candle-only behaviour.
 */
export async function readTicks(symbol: string, from: number, to: number): Promise<TickSeries | null> {
  const cfg = config();
  const sym = tickSymbolFor(symbol);
  if (!cfg || !SYMBOL_PATTERN.test(sym) || !(to > from)) return null;
  let any = false;
  for (const month of monthsBetween(from - SOURCE_LEAD_MS, to)) {
    try { if (await ensureMonth(cfg, sym, month)) any = true; } catch { /* unreachable month: candle fallback */ }
  }
  if (!any) return null;
  const parts: TickSeries[] = [];
  for (let day = Math.floor(from / DAY_MS) * DAY_MS; day < to; day += DAY_MS) parts.push(sliceTicks(await readDay(cfg, sym, day), from, to));
  return parts.length === 1 ? parts[0]! : concatTicks(parts);
}
