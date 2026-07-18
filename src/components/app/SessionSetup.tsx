"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
} from "lucide-react";

import {
  fetchRanges,
  fetchSymbols,
  type CreateSessionBody,
} from "@/lib/backtest/client";
import { newYorkDateEnd, newYorkDateStart, toNewYorkDateInput } from "@/lib/date-time";
import type { MarketSymbol } from "@/lib/market-data/types";
import { formatSymbol } from "@/lib/market-data/symbols";

interface SessionSetupProps {
  onStart: (body: CreateSessionBody) => void;
  busy: boolean;
  error: string | null;
}

function toDateInput(ms: number): string {
  return toNewYorkDateInput(ms);
}

function monthStart(value: string, fallback: string): Date {
  const source = value || fallback || toDateInput(Date.now());
  const date = new Date(`${source}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function SessionDatePicker({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => monthStart(value, min));

  useEffect(() => {
    if (open) setViewMonth(monthStart(value, min));
  }, [open, value, min]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const year = viewMonth.getUTCFullYear();
  const month = viewMonth.getUTCMonth();
  const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month, index - offset + 1));
    return {
      value: toDateInput(date.getTime()),
      day: date.getUTCDate(),
      currentMonth: date.getUTCMonth() === month,
    };
  });
  const previousMonth = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month + 1, 1));
  const minMonth = monthStart(min, min);
  const maxMonth = monthStart(max, max);
  const years = Array.from(
    { length: maxMonth.getUTCFullYear() - minMonth.getUTCFullYear() + 1 },
    (_, index) => minMonth.getUTCFullYear() + index,
  );

  function changeVisibleMonth(nextYear: number, nextMonth: number) {
    const requested = new Date(Date.UTC(nextYear, nextMonth, 1));
    setViewMonth(
      requested < minMonth ? minMonth : requested > maxMonth ? maxMonth : requested,
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <button
        id={id}
        type="button"
        className="app-input flex w-full items-center justify-between text-left"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? "font-medium" : "app-muted"}>
          {value || "Choose a date"}
        </span>
        <CalendarDays size={16} className="app-muted" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className="absolute left-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-3rem))] rounded-xl border app-border bg-[var(--app-panel)] p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              disabled={previousMonth < minMonth}
              onClick={() => setViewMonth(previousMonth)}
              className="grid h-8 w-8 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] disabled:opacity-30"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <div className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor={`${id}-month`}>Calendar month</label>
              <select
                id={`${id}-month`}
                aria-label="Calendar month"
                value={month}
                onChange={(event) => changeVisibleMonth(year, Number(event.target.value))}
                className="h-8 rounded-md border app-border bg-[var(--app-panel-2)] px-2 text-xs font-semibold outline-none"
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index}>{name}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`${id}-year`}>Calendar year</label>
              <select
                id={`${id}-year`}
                aria-label="Calendar year"
                value={year}
                onChange={(event) => changeVisibleMonth(Number(event.target.value), month)}
                className="h-8 rounded-md border app-border bg-[var(--app-panel-2)] px-2 text-xs font-semibold outline-none"
              >
                {years.map((availableYear) => (
                  <option key={availableYear} value={availableYear}>{availableYear}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              aria-label="Next month"
              disabled={nextMonth > maxMonth}
              onClick={() => setViewMonth(nextMonth)}
              className="grid h-8 w-8 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] disabled:opacity-30"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase app-muted">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((date) => {
              const disabled = date.value < min || date.value > max;
              const selected = date.value === value;
              return (
                <button
                  key={date.value}
                  type="button"
                  disabled={disabled}
                  aria-label={date.value}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(date.value);
                    setOpen(false);
                  }}
                  className={`grid h-9 place-items-center rounded-md text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-20 ${
                    selected
                      ? "bg-brand-500 font-bold text-surface-950"
                      : date.currentMonth
                        ? "hover:bg-[var(--app-panel-2)]"
                        : "app-muted hover:bg-[var(--app-panel-2)]"
                  }`}
                >
                  {date.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionSetup({ onStart, busy, error }: SessionSetupProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [tagsText, setTagsText] = useState("");
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
      setStart((current) => {
        if (!current) return toDateInput(commonRange.startTime);
        const selected = newYorkDateStart(current);
        return toDateInput(
          Math.min(commonRange.endTime, Math.max(commonRange.startTime, selected)),
        );
      });
      setEnd((current) => {
        if (!current) {
          return toDateInput(
            Math.min(commonRange.endTime, commonRange.startTime + threeDays),
          );
        }
        const selected = newYorkDateEnd(current);
        return toDateInput(
          Math.min(commonRange.endTime, Math.max(commonRange.startTime, selected)),
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSymbols]);

  const enabledSymbols = useMemo(
    () => symbols.filter((item) => item.enabled),
    [symbols],
  );
  const tags = tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
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

  function handleStart() {
    if (!range || !canStart) return;
    onStart({
      name: name.trim(),
      tags,
      symbols: selectedSymbols,
      startTime: Math.max(
        range.startTime,
        newYorkDateStart(start),
      ),
      endTime: Math.min(
        range.endTime,
        newYorkDateEnd(end),
      ),
    });
  }

  return (
    <div className="panel mx-auto w-full max-w-2xl p-6 sm:p-7">
      <h2 className="text-xl font-semibold">Start a backtest session</h2>

      <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Session setup progress">
        {["Name", "Pairs", "Dates"].map((label, index) => {
          const number = index + 1;
          return (
            <li
              key={label}
              className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold ${
                step === number
                  ? "border-brand-400/50 bg-brand-400/10 text-brand-300"
                  : number < step
                    ? "border-brand-400/20 text-brand-300"
                    : "app-border app-muted"
              }`}
            >
              {number}. {label}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 min-h-72">
        {step === 1 && (
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
            <label htmlFor="setup-tags" className="mb-1.5 mt-5 block text-sm font-medium">
              Strategy tags <span className="font-normal app-muted">(optional)</span>
            </label>
            <input
              id="setup-tags"
              className="app-input w-full"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="breakout, London, trend"
            />
          </div>
        )}

        {step === 2 && (
          <fieldset>
            <legend className="text-sm font-medium">Currency pairs</legend>
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
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SessionDatePicker
                id="setup-start"
                label="Start date"
                value={start}
                min={range ? toDateInput(range.startTime) : ""}
                max={range ? toDateInput(range.endTime) : ""}
                onChange={(value) => {
                  setStart(value);
                  if (end && end < value) setEnd(value);
                }}
              />
              <SessionDatePicker
                id="setup-end"
                label="End date"
                value={end}
                min={start || (range ? toDateInput(range.startTime) : "")}
                max={range ? toDateInput(range.endTime) : ""}
                onChange={setEnd}
              />
            </div>
            <p className="text-xs app-muted" aria-live="polite">
              {loadingRange
                ? "Checking the common data range for the selected pairs…"
                : range
                  ? `Available dates: ${toDateInput(range.startTime)} to ${toDateInput(range.endTime)} New York time`
                  : "Select at least one pair with available historical data."}
            </p>
            <div className="rounded-xl border app-border bg-[var(--app-panel-2)] p-4">
              <p className="font-semibold">{name}</p>
              <p className="mt-1 text-sm app-muted">
                {selectedSymbols
                  .map(formatSymbol)
                  .join(", ")}
                {start && end ? ` · ${start} to ${end}` : ""}
              </p>
              {tags.length > 0 && (
                <p className="mt-2 text-xs text-brand-300">{tags.join(" · ")}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-sm text-bear">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        {step > 1 && (
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => setStep((current) => current - 1)}
          >
            <ArrowLeft size={16} aria-hidden /> Back
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={
              (step === 1 && name.trim().length < 2) ||
              (step === 2 && selectedSymbols.length === 0)
            }
            onClick={() => setStep((current) => current + 1)}
          >
            Continue <ArrowRight size={16} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!canStart}
            onClick={handleStart}
          >
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
        )}
      </div>
    </div>
  );
}
