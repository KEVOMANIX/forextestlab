/// <reference lib="webworker" />
import { runPineIndicator, type PineIndicatorResult, type PineSeriesInput } from "@/lib/chart/pine-runner";

type Request = { id: number; items: { id: string; code: string }[]; data: PineSeriesInput; symbol: string; timeframeMs: number; precision: number };

// Runs the trader's own scripts off the main thread, so the chart keeps
// replaying while each candle recalculates.
self.onmessage = (event: MessageEvent<Request>) => {
  const { id, items, data, symbol, timeframeMs, precision } = event.data;
  const results: Record<string, PineIndicatorResult> = {};
  const byCode = new Map<string, PineIndicatorResult>();
  for (const item of items) {
    let result = byCode.get(item.code);
    if (!result) { result = runPineIndicator(item.code, data, { symbol, timeframeMs, precision }); byCode.set(item.code, result); }
    results[item.id] = result;
  }
  (self as unknown as Worker).postMessage({ id, results });
};
