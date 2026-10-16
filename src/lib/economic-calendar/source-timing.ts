export interface SourceReleaseTime {
  externalId: string;
  seriesId: string | null;
  currency: string;
  period: number | null;
  timestamp: number;
}

/** Match replacement forecast ids only when the source proves one release
 * time for the same indicator/currency/reference period. Ambiguity is a miss. */
export class SourceTimingIndex {
  private ids = new Map<string, SourceReleaseTime>();
  private periods = new Map<string, Set<number>>();

  private key(series: string, currency: string, period: number): string {
    return JSON.stringify([series, currency, period]);
  }

  get size(): number { return this.ids.size; }

  add(row: SourceReleaseTime): void {
    this.ids.set(row.externalId, row);
    if (!row.seriesId || row.period == null) return;
    const key = this.key(row.seriesId, row.currency, row.period);
    const times = this.periods.get(key) ?? new Set<number>();
    times.add(row.timestamp);
    this.periods.set(key, times);
  }

  find(row: Omit<SourceReleaseTime, "timestamp">, exportOffsetMinutes?: number): { timestamp: number; basis: string } | null {
    const direct = this.ids.get(row.externalId);
    if (direct && direct.currency === row.currency && (!row.seriesId || direct.seriesId === row.seriesId)) {
      return { timestamp: direct.timestamp, basis: "source-id" };
    }
    if (!row.seriesId || row.period == null) return null;
    const periods = [row.period];
    // The failed UTC fallback shifted reference periods as well as release
    // times. Consider both stored interpretations, accepting only one result.
    if (exportOffsetMinutes != null) periods.push(row.period - exportOffsetMinutes * 60_000);
    const candidates = new Set(periods.flatMap(period =>
      [...(this.periods.get(this.key(row.seriesId!, row.currency, period)) ?? [])]));
    return candidates.size === 1 ? { timestamp: [...candidates][0]!, basis: "source-series-period" } : null;
  }
}
