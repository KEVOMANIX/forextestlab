"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";

import { fetchRanges, fetchSymbols, type CreateSessionBody } from "@/lib/backtest/client";
import { TIMEFRAMES, type MarketSymbol, type Timeframe } from "@/lib/market-data/types";

interface SessionSetupProps {
  onStart: (body: CreateSessionBody) => void;
  busy: boolean;
  error: string | null;
}

function toLocalInput(ms: number): string {
  // Render a UTC timestamp as a value for <input type="datetime-local"> (UTC).
  return new Date(ms).toISOString().slice(0, 16);
}

export function SessionSetup({ onStart, busy, error }: SessionSetupProps) {
  const [symbols, setSymbols] = useState<MarketSymbol[]>([]);
  const [symbol, setSymbol] = useState<string>("");
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [range, setRange] = useState<{ startTime: number; endTime: number } | null>(null);
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [loadingRange, setLoadingRange] = useState(false);

  useEffect(() => {
    void fetchSymbols().then((list) => {
      setSymbols(list);
      const firstEnabled = list.find((s) => s.enabled);
      if (firstEnabled) setSymbol(firstEnabled.symbol);
    });
  }, []);

  useEffect(() => {
    if (!symbol) return;
    setLoadingRange(true);
    setRange(null);
    void fetchRanges(symbol, timeframe).then((ranges) => {
      setLoadingRange(false);
      const r = ranges[0] ?? null;
      setRange(r);
      if (r) {
        // Default to a window from the start that yields a workable session.
        const span = Math.min(r.endTime - r.startTime, 3 * 24 * 60 * 60 * 1000);
        setStart(toLocalInput(r.startTime));
        setEnd(toLocalInput(r.startTime + span));
      }
    });
  }, [symbol, timeframe]);

  const enabledSymbols = useMemo(() => symbols.filter((s) => s.enabled), [symbols]);
  const disabledSymbols = useMemo(() => symbols.filter((s) => !s.enabled), [symbols]);

  const canStart = Boolean(symbol && range && start && end && !busy);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!range) return;
    const startTime = Date.parse(`${start}:00Z`);
    const endTime = Date.parse(`${end}:00Z`);
    onStart({ symbol, timeframe, startTime, endTime });
  }

  return (
    <form onSubmit={handleSubmit} className="panel mx-auto w-full max-w-xl p-6">
      <h2 className="text-lg font-semibold">Start a backtest session</h2>
      <p className="mt-1 text-sm app-muted">
        Pick a pair, timeframe, and historical period. Signed-in sessions are
        saved privately; anonymous demonstrations expire after 24 hours.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="setup-symbol" className="mb-1.5 block text-sm font-medium">
            Currency pair
          </label>
          <select
            id="setup-symbol"
            className="app-input w-full"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
          >
            {enabledSymbols.length === 0 && <option value="">No data available</option>}
            {enabledSymbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.displayName}
              </option>
            ))}
            {disabledSymbols.length > 0 && (
              <optgroup label="Data not yet available">
                {disabledSymbols.map((s) => (
                  <option key={s.symbol} value={s.symbol} disabled>
                    {s.displayName} (coming soon)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div>
          <label htmlFor="setup-timeframe" className="mb-1.5 block text-sm font-medium">
            Timeframe
          </label>
          <select
            id="setup-timeframe"
            className="app-input w-full"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="setup-start" className="mb-1.5 block text-sm font-medium">
              Start (UTC)
            </label>
            <input
              id="setup-start"
              type="datetime-local"
              className="app-input w-full"
              value={start}
              min={range ? toLocalInput(range.startTime) : undefined}
              max={range ? toLocalInput(range.endTime) : undefined}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="setup-end" className="mb-1.5 block text-sm font-medium">
              End (UTC)
            </label>
            <input
              id="setup-end"
              type="datetime-local"
              className="app-input w-full"
              value={end}
              min={range ? toLocalInput(range.startTime) : undefined}
              max={range ? toLocalInput(range.endTime) : undefined}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </div>
        </div>

        <p className="text-xs app-muted" aria-live="polite">
          {loadingRange
            ? "Checking available data…"
            : range
              ? `Available data: ${toLocalInput(range.startTime).replace("T", " ")} → ${toLocalInput(range.endTime).replace("T", " ")} UTC`
              : "No data available for this pair/timeframe yet."}
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-sm text-bear">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-6 w-full" disabled={!canStart}>
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden /> Starting…
          </>
        ) : (
          <>
            <Play size={16} aria-hidden /> Start session
          </>
        )}
      </button>
    </form>
  );
}
