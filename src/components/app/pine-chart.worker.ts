/// <reference lib="webworker" />
import { runPineIndicatorOn, type PineIndicatorResult, type PineSeriesInput } from "@/lib/chart/pine-runner";

type Request = { id: number; items: { id: string; code: string; timeframe?: string }[]; data: PineSeriesInput; symbol: string; timeframeMs: number; precision: number; theme?: "dark" | "light" };

// Runs the trader's own scripts off the main thread, so the chart keeps
// replaying while each candle recalculates.
self.onmessage = (event: MessageEvent<Request>) => {
  const { id, items, data, symbol, timeframeMs, precision, theme } = event.data;
  const results: Record<string, PineIndicatorResult> = {};
  const byCode = new Map<string, PineIndicatorResult>();
  for (const item of items) {
    const key = `${item.timeframe ?? ""}|${item.code}`;
    let result = byCode.get(key);
    if (!result) { result = runPineIndicatorOn(item.timeframe, item.code, data, { symbol, timeframeMs, precision, theme }); byCode.set(key, result); }
    results[item.id] = result;
  }
  (self as unknown as Worker).postMessage({ id, results });
};
