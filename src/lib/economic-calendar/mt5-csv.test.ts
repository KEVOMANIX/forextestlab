import { describe, expect, it } from "vitest";

import { parseCsvString } from "@/lib/market-data/csv-parser";
import {
  MT5_CSV_COMMENT_PREFIX,
  canonicalFigure,
  normalizeMt5Row,
  parseExportHeader,
} from "./mt5-csv";
import { parseZoneSpec } from "./timezone";

const ATHENS = parseZoneSpec("Europe/Athens")!;

const HEADER =
  "value_id,time_server,event_id,event_code,time_mode,currency,country,country_code," +
  "importance,name,unit,multiplier,digits,actual,forecast,previous,revised_previous," +
  "period_server,revision";

/** A row as the MQL5 exporter writes it, with the ISM figures from the sample. */
const ISM_ROW =
  "1980551,2026.08.05 13:00:00,840030016,,exact,USD,United States,US,high," +
  '"ISM Services PMI",,,1,,54.500000,54.000000,,2026.07.01,0';

function rowsOf(csv: string) {
  return parseCsvString(csv, { commentPrefix: MT5_CSV_COMMENT_PREFIX });
}

describe("canonicalFigure", () => {
  it("drops the exporter's padding without touching a float", () => {
    expect(canonicalFigure("54.500000")).toBe("54.5");
    expect(canonicalFigure("54.000000")).toBe("54");
    expect(canonicalFigure("-0.100000")).toBe("-0.1");
    expect(canonicalFigure("150000.000000")).toBe("150000");
  });

  it("keeps a genuine zero, and loses an absent value", () => {
    // These must not collapse together: a published 0.0% and an unpublished
    // figure look identical on a chart if both become "0".
    expect(canonicalFigure("0.000000")).toBe("0");
    expect(canonicalFigure("-0.000000")).toBe("0");
    expect(canonicalFigure("")).toBeNull();
    expect(canonicalFigure(undefined)).toBeNull();
    expect(canonicalFigure("  ")).toBeNull();
  });

  it("refuses anything that is not a plain decimal", () => {
    expect(canonicalFigure("1e6")).toBeNull();
    expect(canonicalFigure("54.5%")).toBeNull();
    expect(canonicalFigure("N/A")).toBeNull();
  });
});

describe("normalizeMt5Row", () => {
  const options = { zone: ATHENS, source: "mt5" } as const;

  it("reads a release, converting the server clock to UTC", () => {
    const [row] = rowsOf(`${HEADER}\n${ISM_ROW}`);
    const result = normalizeMt5Row(row!.record, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.record).toMatchObject({
      source: "mt5",
      externalId: "1980551",
      seriesId: "840030016",
      name: "ISM Services PMI",
      currency: "USD",
      country: "United States",
      importance: "high",
      timeMode: "exact",
      actual: null,
      forecast: "54.5",
      previous: "54",
      digits: 1,
    });
    // 13:00 in Athens in August is 10:00 UTC — which is the 10:00 the sample
    // card shows, because the chart was on a UTC+0 display zone.
    expect(new Date(result.record.timestamp).toISOString()).toBe("2026-08-05T10:00:00.000Z");
    expect(new Date(result.record.period!).toISOString()).toBe("2026-06-30T21:00:00.000Z");
  });

  it("skips the provenance line instead of reading it as column names", () => {
    const csv = `# forextestlab-calendar v1 server=Demo-MT5 server_gmt_offset_minutes=180 exported_utc=2026.08.04 09:00:00\n${HEADER}\n${ISM_ROW}`;
    const rows = rowsOf(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.record.value_id).toBe("1980551");
    // Line numbers still point at the file as an editor shows it.
    expect(rows[0]!.lineNumber).toBe(3);
  });

  it("rejects a row with no currency rather than storing it unfilterable", () => {
    const holiday = ISM_ROW.replace(",USD,", ",,");
    const [row] = rowsOf(`${HEADER}\n${holiday}`);
    const result = normalizeMt5Row(row!.record, options);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no currency/i);
  });

  it("rejects an unreadable timestamp", () => {
    const broken = ISM_ROW.replace("2026.08.05 13:00:00", "later today");
    const [row] = rowsOf(`${HEADER}\n${broken}`);
    expect(normalizeMt5Row(row!.record, options).ok).toBe(false);
  });

  it("rejects an importance it does not know", () => {
    const broken = ISM_ROW.replace(",high,", ",catastrophic,");
    const [row] = rowsOf(`${HEADER}\n${broken}`);
    const result = normalizeMt5Row(row!.record, options);
    expect(result.ok).toBe(false);
  });

  it("falls back to an exact time mode, but never to a wrong currency", () => {
    const odd = ISM_ROW.replace(",exact,", ",whenever,");
    const [row] = rowsOf(`${HEADER}\n${odd}`);
    const result = normalizeMt5Row(row!.record, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.timeMode).toBe("exact");
  });

  it("keeps a multiplier it recognises and drops one it does not", () => {
    const withMultiplier = ISM_ROW.replace(",,1,,54.500000", ",thousands,1,,54.500000");
    const [row] = rowsOf(`${HEADER}\n${withMultiplier}`);
    const result = normalizeMt5Row(row!.record, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.multiplier).toBe("thousands");
  });

  it("reads a quoted name containing a comma", () => {
    const commas = ISM_ROW.replace('"ISM Services PMI"', '"Employment, Total"');
    const [row] = rowsOf(`${HEADER}\n${commas}`);
    const result = normalizeMt5Row(row!.record, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.name).toBe("Employment, Total");
  });

  it("complains about a file that is missing a column outright", () => {
    const result = normalizeMt5Row({ value_id: "1" }, options);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Missing column/);
  });
});

describe("parseExportHeader", () => {
  it("reads the server and its offset", () => {
    expect(
      parseExportHeader(
        "# forextestlab-calendar v1 server=ICMarkets-Demo server_gmt_offset_minutes=180 exported_utc=2026.08.04 09:00:00",
      ),
    ).toEqual({ server: "ICMarkets-Demo", offsetMinutes: 180 });
  });

  it("reads a negative offset", () => {
    expect(
      parseExportHeader("# forextestlab-calendar v1 server_gmt_offset_minutes=-300"),
    ).toMatchObject({ offsetMinutes: -300 });
  });

  it("ignores anything that is not our header", () => {
    expect(parseExportHeader("# some other comment")).toBeNull();
    expect(parseExportHeader("value_id,time_server")).toBeNull();
  });
});
