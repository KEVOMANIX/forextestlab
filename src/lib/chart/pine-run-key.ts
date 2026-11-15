/** The candle a chart's Pine run key is built from (any candle shape with these fields). */
type KeyCandle = { timestamp: number; open: unknown; high: unknown; low: unknown; close: unknown };

/**
 * What a chart's Pine scripts are recalculated on. Scripts run on the loaded
 * history followed by the revealed replay candles, so the key covers both:
 * the newest candle (price moves, a new candle) and the history revision.
 * Older candles arriving after the scripts were restored (the opening history
 * page, a cached snapshot, a scroll-back page) never move the newest candle;
 * without the revision, a chart opened straight on 1D kept the first run made
 * on the replay candles alone and showed almost none of the historical signals.
 */
export function pineCandleKey(newest: KeyCandle | undefined, revealedCount: number, initialCount: number, historyRevision: number): string {
  if (!newest) return "";
  return `${newest.timestamp}:${newest.open}:${newest.high}:${newest.low}:${newest.close}:${revealedCount}:${initialCount}:h${historyRevision}`;
}

/** The market and timeframe a Pine run was calculated on. */
export type PineRunScope = { symbol: string; timeframeMs: number };

/** A run's output belongs on the chart only while the chart still shows its market and timeframe. */
export function samePineScope(run: Partial<PineRunScope> | undefined, chart: PineRunScope): boolean {
  return !!run && run.symbol === chart.symbol && run.timeframeMs === chart.timeframeMs;
}
