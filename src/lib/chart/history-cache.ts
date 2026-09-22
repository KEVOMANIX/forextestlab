import type { Candle, Timeframe } from "@/lib/market-data/types";

export interface ChartHistorySnapshot {
  candles: Candle[];
  hasMore: boolean;
}

type Listener = (snapshot: ChartHistorySnapshot) => void;

const DB_NAME = "forextestlab-chart-history";
const STORE_NAME = "pages";
const DB_VERSION = 1;
const MAX_PERSISTED_CANDLES = 100_000;
const memory = new Map<string, ChartHistorySnapshot>();
const listeners = new Map<string, Set<Listener>>();
const hydration = new Map<string, Promise<ChartHistorySnapshot | null>>();

export function chartHistoryKey(
  storageKey: string,
  timeframe: Timeframe,
): string {
  return `${storageKey}:${timeframe}`;
}

function mergeCandles(...groups: Candle[][]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const group of groups) {
    for (const candle of group) byTime.set(candle.timestamp, candle);
  }
  return [...byTime.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_PERSISTED_CANDLES);
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readPersisted(key: string): Promise<ChartHistorySnapshot | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      const value = request.result as ChartHistorySnapshot | undefined;
      resolve(value && Array.isArray(value.candles) ? value : null);
    };
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
  });
}

async function persist(key: string, snapshot: ChartHistorySnapshot): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(snapshot, key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); resolve(); };
  });
}

function emit(key: string, snapshot: ChartHistorySnapshot): void {
  for (const listener of listeners.get(key) ?? []) listener(snapshot);
}

async function hydrate(key: string): Promise<ChartHistorySnapshot | null> {
  const cached = memory.get(key);
  if (cached) return cached;
  const pending = hydration.get(key);
  if (pending) return pending;
  const request = readPersisted(key).then((snapshot) => {
    hydration.delete(key);
    if (snapshot) {
      memory.set(key, snapshot);
      emit(key, snapshot);
    }
    return snapshot;
  });
  hydration.set(key, request);
  return request;
}

/**
 * Share a loaded history page with every matching chart pane and retain it in
 * IndexedDB so a browser refresh does not discard work the user requested.
 */
export async function publishChartHistory(
  key: string,
  candles: Candle[],
  hasMore: boolean,
): Promise<ChartHistorySnapshot> {
  const existing = await hydrate(key);
  const snapshot = {
    candles: mergeCandles(existing?.candles ?? [], candles),
    hasMore,
  };
  memory.set(key, snapshot);
  emit(key, snapshot);
  void persist(key, snapshot);
  return snapshot;
}

export function subscribeChartHistory(key: string, listener: Listener): () => void {
  const group = listeners.get(key) ?? new Set<Listener>();
  group.add(listener);
  listeners.set(key, group);
  const cached = memory.get(key);
  if (cached) listener(cached);
  else void hydrate(key);
  return () => {
    group.delete(listener);
    if (group.size === 0) listeners.delete(key);
  };
}

