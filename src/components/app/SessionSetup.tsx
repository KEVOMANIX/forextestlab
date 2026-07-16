"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";

import {
  fetchRanges,
  fetchSymbols,
  type CreateSessionBody,
} from "@/lib/backtest/client";
import type { MarketSymbol } from "@/lib/market-data/types";

interface SessionSetupProps {
  onStart: (body: CreateSessionBody) => void;
  busy: boolean;
  error: string | null;
}

function toDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function SessionSetup({ onStart, busy, error }: SessionSetupProps) {
  const [name, setName] = useState("");
  const [symbols, setSymbols] = useState<MarketSymbol[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [range, setRange] = useState<{
    startTime: number;
    endTime: number;
  } | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loadingRange, setLoadingRange] = useState(false);

  useEffect(() => {
    void fetchSymbols().then((list) => {
      setSymbols(list);
      const firstEnabled = list.find((item) => item.enabled);
      if (firstEnabled) setSelectedSymbols([firstEnabled.symbol]);
    });
  }, []);

  useEffect(() => {
    if (selectedSymbols.length === 0) {
      setRange(null);
      setStart("");
      setEnd("");
      return;
    }

    let cancelled = false;
    setLoadingRange(true);
    setRange(null);

    void Promise.all(
      selectedSymbols.map(async (symbol) => {
        const ranges = await fetchRanges(symbol);
        return ranges[0] ?? null;
      }),
    ).then((ranges) => {
      if (cancelled) return;
      setLoadingRange(false);
      if (ranges.some((item) => item === null)) {
        setStart("");
        setEnd("");
        return;
      }

      const available = ranges as { startTime: number; endTime: number }[];
      const commonRange = {
        startTime: Math.max(...available.map((item) => item.startTime)),
        endTime: Math.min(...available.map((item) => item.endTime)),
      };
      if (commonRange.endTime <= commonRange.startTime) {
        setStart("");
        setEnd("");
        return;
      }

      setRange(commonRange);
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      setStart(toDateInput(commonRange.startTime));
      setEnd(
        toDateInput(
          Math.min(commonRange.endTime, commonRange.startTime + threeDays),
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [selectedSymbols]);

  const enabledSymbols = useMemo(
    () => symbols.filter((item) => item.enabled),
    [symbols],
  );
  const canStart = Boolean(
    name.trim().length >= 2 &&
      selectedSymbols.length > 0 &&
      range &&
      start &&
      end &&
      !busy,
  );

  function toggleSymbol(symbol: string) {
    setSelectedSymbols((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol],
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!range) return;
    const startTime = Math.max(
      range.startTime,
      Date.parse(`${start}T00:00:00Z`),
    );
    const endTime = Math.min(
      range.endTime,
      Date.parse(`${end}T23:59:59.999Z`),
    );
    onStart({
      name: name.trim(),
      symbols: selectedSymbols,
      startTime,
      endTime,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="panel mx-auto w-full max-w-2xl p-6 sm:p-7">
      <h2 className="text-xl font-semibold">Start a backtest session</h2>
      <p className="mt-1 text-sm app-muted">
        Name your session, select one or more pairs, and choose the historical
        period you want to test.
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <label htmlFor="setup-name" className="mb-1.5 block text-sm font-medium">
            Session name
          </label>
          <input
            id="setup-name"
            className="app-input w-full"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. London breakout strategy"
            minLength={2}
            maxLength={80}
            required
            autoFocus
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Currency pairs</legend>
          <p className="mt-1 text-xs app-muted">
            Select all pairs included in this session. The first selected pair
            opens first in the replay workspace.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {enabledSymbols.map((item) => {
              const selected = selectedSymbols.includes(item.symbol);
              return (
                <label
                  key={item.symbol}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    selected
                      ? "border-brand-400/50 bg-brand-400/10 text-brand-300"
                      : "app-border bg-[var(--app-panel-2)] hover:border-brand-400/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-400"
                    checked={selected}
                    onChange={() => toggleSymbol(item.symbol)}
                  />
                  <span className="font-mono font-semibold">{item.displayName}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="setup-start" className="mb-1.5 block text-sm font-medium">
              Start date
            </label>
            <input
              id="setup-start"
              type="date"
              className="app-input w-full"
              value={start}
              min={range ? toDateInput(range.startTime) : undefined}
              max={range ? toDateInput(range.endTime) : undefined}
              onChange={(event) => setStart(event.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="setup-end" className="mb-1.5 block text-sm font-medium">
              End date
            </label>
            <input
              id="setup-end"
              type="date"
              className="app-input w-full"
              value={end}
              min={start || (range ? toDateInput(range.startTime) : undefined)}
              max={range ? toDateInput(range.endTime) : undefined}
              onChange={(event) => setEnd(event.target.value)}
              required
            />
          </div>
        </div>

        <p className="text-xs app-muted" aria-live="polite">
          {loadingRange
            ? "Checking the common data range for the selected pairs…"
            : range
              ? `Available dates: ${toDateInput(range.startTime)} to ${toDateInput(range.endTime)} UTC`
              : "Select at least one pair with available historical data."}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-sm text-bear"
        >
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-6 w-full" disabled={!canStart}>
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden /> Creating…
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
