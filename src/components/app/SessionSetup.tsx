"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  LockKeyhole,
  Play,
  Tags,
} from "lucide-react";

import {
  fetchRanges,
  fetchSymbols,
  type CreateSessionBody,
} from "@/lib/backtest/client";
import type { PlanEntitlements } from "@/lib/billing/entitlement-types";
import { newYorkDateEnd, newYorkDateStart, toNewYorkDateInput } from "@/lib/date-time";
import { formatSymbol } from "@/lib/market-data/symbols";
import type { MarketSymbol } from "@/lib/market-data/types";

interface SessionSetupProps {
  onStart: (body: CreateSessionBody) => void;
  busy: boolean;
  error: string | null;
  entitlements: PlanEntitlements;
}

function toDateInput(ms: number): string {
  return toNewYorkDateInput(ms);
}

function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateInput(date.getTime());
}

function monthStart(value: string, fallback: string): Date {
  const source = value || fallback || toDateInput(Date.now());
  const date = new Date(`${source}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function friendlyDate(value: string): string {
  if (!value) return "Choose a date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
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
          {friendlyDate(value)}
        </span>
        <CalendarDays size={16} className="app-muted" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-3rem))] rounded-xl border app-border bg-[var(--app-panel)] p-3 shadow-2xl sm:left-0 sm:right-auto"
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
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day}>{day}</span>)}
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

export function SessionSetup({ onStart, busy, error, entitlements }: SessionSetupProps) {
  const [name, setName] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [symbols, setSymbols] = useState<MarketSymbol[]>([]);
  const [loadingSymbols, setLoadingSymbols] = useState(true);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [range, setRange] = useState<{ startTime: number; endTime: number } | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loadingRange, setLoadingRange] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchSymbols()
      .then((list) => {
        if (!active) return;
        setSymbols(list);
        const firstEnabled = list.find((item) => item.enabled);
        if (firstEnabled) setSelectedSymbols([firstEnabled.symbol]);
      })
      .catch(() => {
        if (active) setSymbols([]);
      })
      .finally(() => {
        if (active) setLoadingSymbols(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedSymbols.length === 0) {
      setRange(null);
      setStart("");
      setEnd("");
      setLoadingRange(false);
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
    )
      .then((ranges) => {
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
          return toDateInput(Math.min(commonRange.endTime, Math.max(commonRange.startTime, selected)));
        });
        setEnd((current) => {
          if (!current) return toDateInput(Math.min(commonRange.endTime, commonRange.startTime + threeDays));
          const selected = newYorkDateEnd(current);
          return toDateInput(Math.min(commonRange.endTime, Math.max(commonRange.startTime, selected)));
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingRange(false);
        setStart("");
        setEnd("");
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
  const availableEnd = range ? toDateInput(range.endTime) : "";
  const sessionEndMax =
    entitlements.maxSessionDays !== null && start
      ? [availableEnd, addCalendarDays(start, entitlements.maxSessionDays - 1)]
          .filter(Boolean)
          .sort()[0] ?? availableEnd
      : availableEnd;
  const canStart = Boolean(
    name.trim().length >= 2 &&
      selectedSymbols.length > 0 &&
      range &&
      start &&
      end &&
      end >= start &&
      !loadingRange &&
      !busy,
  );

  function toggleSymbol(symbol: string) {
    if (entitlements.maxPairsPerSession === 1) {
      setSelectedSymbols([symbol]);
      return;
    }
    setSelectedSymbols((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol],
    );
  }

  function handleStart(event: React.FormEvent) {
    event.preventDefault();
    if (!range || !canStart) return;
    onStart({
      name: name.trim(),
      tags,
      symbols: selectedSymbols,
      startTime: Math.max(range.startTime, newYorkDateStart(start)),
      endTime: Math.min(range.endTime, newYorkDateEnd(end)),
    });
  }

  if (entitlements.plan === "free" && entitlements.freeSessionUsed) {
    return (
      <div className="panel mx-auto w-full max-w-2xl p-7 text-center sm:p-10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-400/10 text-brand-300">
          <LockKeyhole size={22} aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl font-semibold">Your device trial is complete</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed app-muted">
          This device has used its three trial sessions. Upgrade for unlimited
          sessions, longer test periods, and the complete workspace.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/account/billing" className="btn-primary">Upgrade to Pro</Link>
          <Link href="/app/history" className="btn-secondary">View saved sessions</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleStart} className="panel mx-auto w-full max-w-5xl overflow-visible">
      <div className="flex flex-col gap-3 border-b app-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">New backtest</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Set up your session</h2>
        </div>
        <span className="w-fit rounded-full border border-brand-400/20 bg-brand-400/[0.07] px-3 py-1.5 text-xs font-semibold text-brand-300">
          {entitlements.plan === "free"
            ? `Trial · ${entitlements.trialSessionsRemaining ?? 0} of 3 left · 1 pair · 31 days`
            : "Pro workspace"}
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)]">
        <div className="space-y-7 px-5 py-6 sm:px-7 lg:border-r lg:border-[var(--app-border)]">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-400/10 text-xs font-bold text-brand-300">1</span>
              <h3 className="text-sm font-semibold">Name your session</h3>
            </div>
            <label htmlFor="setup-name" className="sr-only">Session name</label>
            <input
              id="setup-name"
              className="app-input w-full text-base"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. London breakout"
              minLength={2}
              maxLength={80}
              required
              autoFocus
            />
            <div className="relative mt-3">
              <Tags size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 app-muted" aria-hidden />
              <label htmlFor="setup-tags" className="sr-only">Strategy tags</label>
              <input
                id="setup-tags"
                className="app-input w-full pl-9 text-sm"
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="Optional tags: breakout, London, trend"
              />
            </div>
          </section>

          <fieldset>
            <legend className="mb-3 flex w-full items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-400/10 text-xs font-bold text-brand-300">2</span>
              <span className="text-sm font-semibold">Choose market{entitlements.maxPairsPerSession === 1 ? "" : "s"}</span>
              {selectedSymbols.length > 0 && (
                <span className="ml-auto text-xs font-medium text-brand-300">{selectedSymbols.length} selected</span>
              )}
            </legend>

            {loadingSymbols ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Loading markets">
                {Array.from({ length: 6 }, (_, index) => (
                  <span key={index} className="h-11 animate-pulse rounded-xl bg-white/[0.05]" />
                ))}
              </div>
            ) : enabledSymbols.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {enabledSymbols.map((item) => {
                  const selected = selectedSymbols.includes(item.symbol);
                  return (
                    <label
                      key={item.symbol}
                      className={`group flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-3 text-sm transition-all ${
                        selected
                          ? "border-brand-400/50 bg-brand-400/10 text-brand-200 shadow-sm"
                          : "app-border bg-[var(--app-panel-2)]/55 hover:border-brand-400/30 hover:bg-brand-400/[0.04]"
                      }`}
                    >
                      <input
                        type={entitlements.maxPairsPerSession === 1 ? "radio" : "checkbox"}
                        name={entitlements.maxPairsPerSession === 1 ? "session-pair" : undefined}
                        className="sr-only"
                        checked={selected}
                        onChange={() => toggleSymbol(item.symbol)}
                      />
                      <span className="font-mono font-semibold">{item.displayName}</span>
                      <span className={`grid h-5 w-5 place-items-center rounded-full border transition-colors ${
                        selected
                          ? "border-brand-400 bg-brand-500 text-surface-950"
                          : "app-border group-hover:border-brand-400/40"
                      }`}>
                        {selected && <Check size={12} strokeWidth={3} aria-hidden />}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border app-border bg-[var(--app-panel-2)]/55 p-4 text-sm app-muted">
                Markets are temporarily unavailable. Please refresh and try again.
              </p>
            )}
          </fieldset>
        </div>

        <div className="border-t app-border px-5 py-6 sm:px-7 lg:border-t-0">
          <section>
            <div className="mb-4 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-400/10 text-xs font-bold text-brand-300">3</span>
              <h3 className="text-sm font-semibold">Choose your replay period</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <SessionDatePicker
                id="setup-start"
                label="Start date"
                value={start}
                min={range ? toDateInput(range.startTime) : ""}
                max={range ? toDateInput(range.endTime) : ""}
                onChange={(value) => {
                  setStart(value);
                  const nextMax =
                    entitlements.maxSessionDays === null
                      ? availableEnd
                      : [availableEnd, addCalendarDays(value, entitlements.maxSessionDays - 1)]
                          .filter(Boolean)
                          .sort()[0] ?? availableEnd;
                  if (end && (end < value || end > nextMax)) setEnd(end < value ? value : nextMax);
                }}
              />
              <SessionDatePicker
                id="setup-end"
                label="End date"
                value={end}
                min={start || (range ? toDateInput(range.startTime) : "")}
                max={sessionEndMax}
                onChange={setEnd}
              />
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--app-panel-2)]/55 px-3 py-2.5 text-xs app-muted" aria-live="polite">
              {loadingRange ? (
                <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-brand-300" aria-hidden />
              ) : (
                <Clock3 size={14} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
              )}
              <span>
                {loadingRange
                  ? "Checking available market history…"
                  : range
                    ? `${friendlyDate(toDateInput(range.startTime))} – ${friendlyDate(toDateInput(range.endTime))} · New York time`
                    : "Choose a market to see available dates."}
              </span>
            </div>
          </section>

          <section className="mt-6 rounded-xl border app-border bg-[var(--app-panel-2)]/50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] app-muted">Session preview</p>
            <p className={`mt-2 font-semibold ${name.trim() ? "" : "app-muted"}`}>
              {name.trim() || "Your session name"}
            </p>
            <p className="mt-1 text-sm app-muted">
              {selectedSymbols.length > 0
                ? selectedSymbols.map(formatSymbol).join(", ")
                : "Choose at least one market"}
            </p>
            <p className="mt-1 text-sm app-muted">
              {start && end ? `${friendlyDate(start)} – ${friendlyDate(end)}` : "Select your replay dates"}
            </p>
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-brand-400/10 px-2 py-1 text-[10px] font-medium text-brand-300">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="border-t app-border px-5 py-4 sm:px-7">
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-sm text-bear">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs app-muted">Your session is saved automatically after it starts.</p>
          <button type="submit" className="btn-primary min-w-44" disabled={!canStart}>
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden /> Creating…
              </>
            ) : (
              <>
                <Play size={16} aria-hidden /> Start backtest
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
