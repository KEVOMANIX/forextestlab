import { describe, expect, it } from "vitest";

import { detectServerZone, type ExportRow } from "./detect-zone";
import { formatInZone } from "@/lib/chart/timezones";

/**
 * The detector is built from synthetic exports whose true zone is known, because
 * that is the only way to check it: a real export tells you what it says, not
 * what it means.
 */

/** Releases at a fixed local time in `issuingZone`, written as `serverZone` wall clocks. */
function monthlyRelease(options: {
  currency: string;
  name: string;
  issuingZone: string;
  localHour: number;
  localMinute: number;
  serverZone: string;
  months: number;
  startYear?: number;
}): ExportRow[] {
  const rows: ExportRow[] = [];
  let year = options.startYear ?? 2024;
  let month = 1;
  for (let i = 0; i < options.months; i += 1) {
    // Find the UTC instant whose local time in the issuing zone is the scheduled
    // one, by searching the day's hours — the same problem the detector solves,
    // done here by brute force so the two do not share an implementation.
    const day = 5;
    let at: number | null = null;
    for (let utcHour = 0; utcHour < 48; utcHour += 1) {
      const guess = Date.UTC(year, month - 1, day, utcHour, options.localMinute);
      const local = formatInZone(guess, options.issuingZone, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        day: "2-digit",
      });
      if (local === `${String(day).padStart(2, "0")}, ${String(options.localHour).padStart(2, "0")}:${String(options.localMinute).padStart(2, "0")}`) {
        at = guess;
        break;
      }
    }
    if (at == null) throw new Error(`no instant found for ${year}-${month}`);

    const stamp = formatInZone(at, options.serverZone, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    // "08/05/2024, 15:30:00" -> "2024.08.05 15:30:00"
    const [datePart, timePart] = stamp.split(", ");
    const [mm, dd, yyyy] = datePart!.split("/");
    rows.push({
      currency: options.currency,
      name: options.name,
      timeServer: `${yyyy}.${mm}.${dd} ${timePart}`,
    });

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return rows;
}

describe("detectServerZone", () => {
  it("tells a seasonal broker clock from a fixed one on the same summer offset", () => {
    // The case that matters for a real import: EET reads +3 in August, exactly
    // like a fixed UTC+3, and differs from it every winter.
    const rows = monthlyRelease({
      currency: "USD",
      name: "Nonfarm Payrolls",
      issuingZone: "America/New_York",
      localHour: 8,
      localMinute: 30,
      serverZone: "Europe/Kyiv",
      months: 24,
    });

    // The header's offset, as the exporter records it: EEST in August.
    const result = detectServerZone(rows, {
      observedOffsetMinutes: 180,
      observedAt: Date.UTC(2026, 7, 4, 10, 45),
    });
    expect(result.anchor).toMatchObject({ currency: "USD", name: "Nonfarm Payrolls" });
    expect(result.best?.timezone).toBe("Europe/Kyiv");
    expect(result.best?.score).toBe(1);
    expect(result.best?.localTime).toBe("08:30");
    expect(result.confident).toBe(true);
    expect(result.offsetPinned).toBe(true);
    // A fixed +03:00 must not tie with it, or the whole exercise is pointless.
    expect(result.runnerUp?.score).toBeLessThan(1);
    // Nor may zones on a different offset be called interchangeable with it.
    expect(result.equivalent).not.toContain("Europe/London");
    expect(result.equivalent).not.toContain("Europe/Berlin");
    expect(result.equivalent).toContain("Europe/Athens");
  });

  it("without the header's offset, refuses to pick between zones sharing a DST calendar", () => {
    // London, Berlin and Kyiv all switch on the same dates, so a fixed-local-time
    // release looks perfectly consistent under all three while they sit one, two
    // and three hours apart. Guessing here is how an import goes quietly wrong.
    const rows = monthlyRelease({
      currency: "USD",
      name: "Nonfarm Payrolls",
      issuingZone: "America/New_York",
      localHour: 8,
      localMinute: 30,
      serverZone: "Europe/Kyiv",
      months: 24,
    });

    const result = detectServerZone(rows);
    expect(result.offsetPinned).toBe(false);
    expect(result.confident).toBe(false);
    expect(result.runnerUp?.score).toBe(1);
  });

  it("identifies a genuinely fixed server clock", () => {
    const rows = monthlyRelease({
      currency: "USD",
      name: "CPI",
      issuingZone: "America/New_York",
      localHour: 8,
      localMinute: 30,
      serverZone: "Europe/Moscow", // fixed UTC+3, no summer time
      months: 24,
    });

    const result = detectServerZone(rows, {
      observedOffsetMinutes: 180,
      observedAt: Date.UTC(2026, 7, 4, 10, 45),
    });
    expect(result.best?.score).toBe(1);
    // Moscow and a fixed +03:00 are the same clock; either answer imports
    // identically, so both are acceptable — a seasonal zone is not.
    expect(["Europe/Moscow", "+03:00"]).toContain(result.best?.timezone);
    expect(result.equivalent).toContain("+03:00");
    expect(result.equivalent).not.toContain("Europe/Kyiv");
    expect(result.confident).toBe(true);
  });

  it("works from a UK release too, not just a US one", () => {
    const rows = monthlyRelease({
      currency: "GBP",
      name: "Claimant Count Change",
      issuingZone: "Europe/London",
      localHour: 7,
      localMinute: 0,
      serverZone: "Europe/Kyiv",
      months: 24,
    });
    const result = detectServerZone(rows);
    expect(result.anchor?.issuingZone).toBe("Europe/London");
    expect(result.best?.timezone).toBe("Europe/Kyiv");
    expect(result.best?.score).toBe(1);
  });

  it("declines to guess when nothing recurs across a daylight-saving boundary", () => {
    // Summer releases alone cannot separate EET from a fixed +03:00.
    const rows = monthlyRelease({
      currency: "USD",
      name: "Nonfarm Payrolls",
      issuingZone: "America/New_York",
      localHour: 8,
      localMinute: 30,
      serverZone: "Europe/Kyiv",
      months: 24,
    }).filter((row) => {
      const month = Number(row.timeServer.slice(5, 7));
      return month >= 6 && month <= 8;
    });

    const result = detectServerZone(rows);
    expect(result.anchor).toBeNull();
    expect(result.best).toBeNull();
    expect(result.confident).toBe(false);
  });

  it("ignores a release that does not recur often enough to have a schedule", () => {
    const result = detectServerZone([
      { currency: "USD", name: "One Off", timeServer: "2024.01.10 15:30:00" },
      { currency: "USD", name: "One Off", timeServer: "2024.07.10 15:30:00" },
    ]);
    expect(result.anchor).toBeNull();
  });

  it("survives an event whose schedule moved, taking the majority", () => {
    const rows = monthlyRelease({
      currency: "USD",
      name: "FOMC Statement",
      issuingZone: "America/New_York",
      localHour: 14,
      localMinute: 0,
      serverZone: "Europe/Kyiv",
      months: 24,
    });
    // Two releases came out fifteen minutes late, as FOMC once did.
    rows[3]!.timeServer = rows[3]!.timeServer.replace(":00:00", ":15:00");
    rows[9]!.timeServer = rows[9]!.timeServer.replace(":00:00", ":15:00");

    const result = detectServerZone(rows);
    expect(result.best?.timezone).toBe("Europe/Kyiv");
    expect(result.best?.score).toBeGreaterThan(0.85);
    expect(result.best?.localTime).toBe("14:00");
  });
});
