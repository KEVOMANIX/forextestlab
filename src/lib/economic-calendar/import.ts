/**
 * Imports an MT5 calendar export into the database.
 *
 * Streams the CSV, converts each row to UTC, and writes in batches with an
 * upsert keyed on (source, externalId). The upsert matters more here than it
 * does for candles: a release exported last month carried a forecast and no
 * actual, and the whole point of re-running the export is to fill that actual
 * in. `createMany({ skipDuplicates })` would keep the stale row forever.
 */

import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { streamCsv } from "@/lib/market-data/csv-parser";
import { resolveSafeCsvPath } from "@/lib/market-data/import";
import {
  MT5_CSV_COMMENT_PREFIX,
  normalizeMt5Row,
  parseExportHeader,
} from "./mt5-csv";
import { parseZoneSpec, zoneOffsetMinutesAt, type ZoneSpec } from "./timezone";
import type { EconomicEventRecord } from "./types";

export interface CalendarImportOptions {
  filePath?: string;
  stream?: Readable;
  /** Broker server zone: an IANA name, or a fixed offset like "+02:00". */
  timezone?: string;
  source?: string;
  batchSize?: number;
  /** Skip the database write; used to check a file before committing to it. */
  dryRun?: boolean;
}

export interface CalendarImportReport {
  source: string;
  timezone: string;
  rowsRead: number;
  rowsWritten: number;
  rowsRejected: number;
  duplicates: number;
  withActual: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  currencies: string[];
  warnings: string[];
  errors: Array<{ line: number; error: string }>;
}

const MAX_ERRORS_LOGGED = 100;
/** Twenty columns per row; Postgres allows 65535 bind parameters per statement. */
const DEFAULT_BATCH_SIZE = 500;

function upsertBatch(rows: EconomicEventRecord[]): Prisma.Sql {
  const values = rows.map(
    (row) => Prisma.sql`(
      ${randomUUID()}, ${row.source}, ${row.externalId}, ${row.seriesId},
      ${row.eventCode}, ${row.name}, ${row.currency}, ${row.country},
      ${row.importance}, ${BigInt(row.timestamp)}, ${row.timeMode},
      ${row.period == null ? null : BigInt(row.period)},
      ${row.actual}, ${row.forecast}, ${row.previous}, ${row.revisedPrevious},
      ${row.unit}, ${row.multiplier}, ${row.digits}, ${row.revision}, NOW()
    )`,
  );
  return Prisma.sql`
    INSERT INTO "EconomicEvent" (
      "id", "source", "externalId", "seriesId", "eventCode", "name", "currency",
      "country", "importance", "timestamp", "timeMode", "period", "actual",
      "forecast", "previous", "revisedPrevious", "unit", "multiplier", "digits",
      "revision", "updatedAt"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("source", "externalId") DO UPDATE SET
      "seriesId"        = EXCLUDED."seriesId",
      "eventCode"       = EXCLUDED."eventCode",
      "name"            = EXCLUDED."name",
      "currency"        = EXCLUDED."currency",
      "country"         = EXCLUDED."country",
      "importance"      = EXCLUDED."importance",
      "timestamp"       = EXCLUDED."timestamp",
      "timeMode"        = EXCLUDED."timeMode",
      "period"          = EXCLUDED."period",
      "actual"          = EXCLUDED."actual",
      "forecast"        = EXCLUDED."forecast",
      "previous"        = EXCLUDED."previous",
      "revisedPrevious" = EXCLUDED."revisedPrevious",
      "unit"            = EXCLUDED."unit",
      "multiplier"      = EXCLUDED."multiplier",
      "digits"          = EXCLUDED."digits",
      "revision"        = EXCLUDED."revision",
      "updatedAt"       = NOW()
  `;
}

/**
 * Warns when the zone the caller named was not on the offset the exporting
 * terminal reported. A silent hour of error is the single most likely way for
 * this import to go wrong, and it is invisible afterwards.
 */
function checkZoneAgainstExport(
  header: { server: string | null; offsetMinutes: number | null },
  zone: ZoneSpec,
  timezone: string,
): string | null {
  if (header.offsetMinutes == null) return null;
  const at = Date.now();
  const claimed =
    zone.kind === "offset" ? zone.minutes : zoneOffsetMinutesAt(at, zone.timeZone);
  if (claimed === header.offsetMinutes) return null;
  const asHours = (minutes: number) =>
    `${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
  return (
    `The export came from a server on ${asHours(header.offsetMinutes)}` +
    `${header.server ? ` (${header.server})` : ""}, but --timezone ${timezone} is ` +
    `on ${asHours(claimed)} right now. Every imported time will be ` +
    `${Math.abs(claimed - header.offsetMinutes)} minutes out if that is not deliberate.`
  );
}

export async function importEconomicCalendar(
  options: CalendarImportOptions,
): Promise<CalendarImportReport> {
  const timezone = options.timezone ?? "UTC";
  const zone = parseZoneSpec(timezone);
  if (!zone) {
    throw new Error(
      `Unrecognised --timezone "${timezone}". Use an IANA zone name such as Europe/Kyiv, or a fixed offset such as +02:00.`,
    );
  }
  const source = options.source ?? "mt5";
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const report: CalendarImportReport = {
    source,
    timezone,
    rowsRead: 0,
    rowsWritten: 0,
    rowsRejected: 0,
    duplicates: 0,
    withActual: 0,
    minTimestamp: null,
    maxTimestamp: null,
    currencies: [],
    warnings: [],
    errors: [],
  };

  const stream =
    options.stream ??
    createReadStream(resolveSafeCsvPath(options.filePath ?? ""), "utf8");

  // The provenance line is a comment, so the parser skips it. Read it off the
  // head of the file separately, before the stream is consumed.
  if (options.filePath) {
    const header = await readFirstLine(resolveSafeCsvPath(options.filePath));
    const parsed = header ? parseExportHeader(header) : null;
    if (parsed) {
      const warning = checkZoneAgainstExport(parsed, zone, timezone);
      if (warning) report.warnings.push(warning);
    }
  }

  const currencies = new Set<string>();
  // The same release can appear twice when a file is exported per currency and
  // an event is filed under two of them.
  const seen = new Set<string>();
  let batch: EconomicEventRecord[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    if (!options.dryRun) await prisma.$executeRaw(upsertBatch(batch));
    report.rowsWritten += batch.length;
    batch = [];
  };

  for await (const row of streamCsv(stream, {
    commentPrefix: MT5_CSV_COMMENT_PREFIX,
  })) {
    report.rowsRead += 1;
    const result = normalizeMt5Row(row.record, { zone, source });
    if (!result.ok) {
      report.rowsRejected += 1;
      if (report.errors.length < MAX_ERRORS_LOGGED) {
        report.errors.push({ line: row.lineNumber, error: result.error });
      }
      continue;
    }
    const record = result.record;
    if (seen.has(record.externalId)) {
      report.duplicates += 1;
      continue;
    }
    seen.add(record.externalId);

    currencies.add(record.currency);
    if (record.actual != null) report.withActual += 1;
    report.minTimestamp =
      report.minTimestamp == null
        ? record.timestamp
        : Math.min(report.minTimestamp, record.timestamp);
    report.maxTimestamp =
      report.maxTimestamp == null
        ? record.timestamp
        : Math.max(report.maxTimestamp, record.timestamp);

    batch.push(record);
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  report.currencies = [...currencies].sort();
  return report;
}

/** Reads just enough of a file to see its first line. */
async function readFirstLine(path: string): Promise<string | null> {
  const stream = createReadStream(path, { encoding: "utf8", start: 0, end: 4095 });
  try {
    for await (const chunk of stream) {
      const text = String(chunk);
      const newline = text.indexOf("\n");
      return newline === -1 ? text : text.slice(0, newline).replace(/\r$/, "");
    }
  } finally {
    stream.destroy();
  }
  return null;
}
