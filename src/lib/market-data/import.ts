/**
 * Batch CSV import into the ForexTestLab database.
 *
 * Streams the file (never loads it whole into memory), validates and
 * normalises every row, converts timestamps to UTC, deduplicates, imports in
 * batches, records an audit row, and returns a detailed report.
 */

import { createReadStream } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";

import { prisma } from "@/lib/db";
import { streamCsv } from "./csv-parser";
import { normalizeRow, type HeaderMapping } from "./normalizer";
import { validateCandle } from "./validators";
import { getSymbolDefinition } from "./symbols";
import { TIMEFRAME_MS, type Candle, type Timeframe } from "./types";

export interface ImportOptions {
  /** Absolute or project-relative path to a CSV file (CLI use). */
  filePath?: string;
  /** Pre-opened stream (programmatic use). Takes precedence over filePath. */
  stream?: Readable;
  symbol: string;
  timeframe: Timeframe;
  timezone?: string;
  source: string;
  mapping?: Partial<HeaderMapping>;
  batchSize?: number;
  fileName?: string;
}

export interface ImportReport {
  symbol: string;
  timeframe: Timeframe;
  source: string;
  rowsRead: number;
  rowsImported: number;
  rowsRejected: number;
  duplicates: number;
  gapsDetected: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  errors: Array<{ line: number; error: string }>;
}

const MAX_ERRORS_LOGGED = 100;

/** Guard against path traversal: only allow CSV files inside the project. */
export function resolveSafeCsvPath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  const root = process.cwd();
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Refusing to read a file outside the project directory.");
  }
  if (path.extname(resolved).toLowerCase() !== ".csv") {
    throw new Error("Only .csv files may be imported.");
  }
  return resolved;
}

export async function importMarketData(
  options: ImportOptions,
): Promise<ImportReport> {
  const def = getSymbolDefinition(options.symbol);
  if (!def) {
    throw new Error(`Unknown symbol "${options.symbol}".`);
  }

  const instrument = await prisma.marketInstrument.upsert({
    where: { symbol: def.symbol },
    update: {},
    create: {
      symbol: def.symbol,
      displayName: def.displayName,
      baseCurrency: def.baseCurrency,
      quoteCurrency: def.quoteCurrency,
      pipSize: def.pipSize,
      pricePrecision: def.pricePrecision,
      enabled: true,
    },
  });

  const batchSize = options.batchSize ?? 1000;
  const report: ImportReport = {
    symbol: def.symbol,
    timeframe: options.timeframe,
    source: options.source,
    rowsRead: 0,
    rowsImported: 0,
    rowsRejected: 0,
    duplicates: 0,
    gapsDetected: 0,
    minTimestamp: null,
    maxTimestamp: null,
    errors: [],
  };

  const stream =
    options.stream ??
    createReadStream(resolveSafeCsvPath(options.filePath ?? ""), "utf8");

  // Track seen timestamps to drop duplicates cheaply without buffering candles.
  const seen = new Set<number>();
  let batch: Candle[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    await prisma.marketCandle.createMany({
      data: batch.map((c) => ({
        instrumentId: instrument.id,
        timeframe: options.timeframe,
        timestamp: BigInt(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? null,
        bidOpen: c.bidOpen ?? null,
        bidHigh: c.bidHigh ?? null,
        bidLow: c.bidLow ?? null,
        bidClose: c.bidClose ?? null,
        askOpen: c.askOpen ?? null,
        askHigh: c.askHigh ?? null,
        askLow: c.askLow ?? null,
        askClose: c.askClose ?? null,
        source: options.source,
      })),
    });
    report.rowsImported += batch.length;
    batch = [];
  };

  for await (const row of streamCsv(stream)) {
    report.rowsRead += 1;
    const result = normalizeRow(row.record, {
      mapping: options.mapping,
      timezone: options.timezone ?? "UTC",
      source: options.source,
    });
    if (!result.candle) {
      report.rowsRejected += 1;
      if (report.errors.length < MAX_ERRORS_LOGGED) {
        report.errors.push({
          line: row.lineNumber,
          error: result.error ?? "Unknown normalisation error.",
        });
      }
      continue;
    }

    const validation = validateCandle(result.candle);
    if (!validation.valid) {
      report.rowsRejected += 1;
      if (report.errors.length < MAX_ERRORS_LOGGED) {
        report.errors.push({
          line: row.lineNumber,
          error: validation.errors.join("; "),
        });
      }
      continue;
    }

    const ts = result.candle.timestamp;
    if (seen.has(ts)) {
      report.duplicates += 1;
      continue;
    }
    seen.add(ts);

    report.minTimestamp =
      report.minTimestamp === null ? ts : Math.min(report.minTimestamp, ts);
    report.maxTimestamp =
      report.maxTimestamp === null ? ts : Math.max(report.maxTimestamp, ts);

    batch.push(result.candle);
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  // Estimate missing expected intervals from the observed span.
  if (report.minTimestamp !== null && report.maxTimestamp !== null) {
    const step = TIMEFRAME_MS[options.timeframe];
    const expected =
      Math.floor((report.maxTimestamp - report.minTimestamp) / step) + 1;
    report.gapsDetected = Math.max(0, expected - report.rowsImported);
  }

  await prisma.dataImport.create({
    data: {
      instrumentId: instrument.id,
      symbol: def.symbol,
      timeframe: options.timeframe,
      source: options.source,
      fileName: options.fileName ?? options.filePath ?? null,
      rowsRead: report.rowsRead,
      rowsImported: report.rowsImported,
      rowsRejected: report.rowsRejected,
      gapsDetected: report.gapsDetected,
      report: JSON.stringify(report),
      status: "completed",
    },
  });

  return report;
}
