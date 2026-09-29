"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  Loader2,
  LockKeyhole,
  Plus,
  Play,
  Search,
  Shuffle,
  Tags,
  Trophy,
  X,
} from "lucide-react";

import {
  fetchRanges,
  fetchSymbols,
  type CreateSessionBody,
} from "@/lib/backtest/client";
import type { PlanEntitlements } from "@/lib/billing/entitlement-types";
import {
  PROP_FIRM_ACCOUNT_SIZES,
  PROP_FIRM_PRESETS,
} from "@/lib/backtest/prop-firm";
import { newYorkDateEnd, newYorkDateStart, toNewYorkDateInput } from "@/lib/date-time";
import { describeSymbol, formatSymbol } from "@/lib/market-data/symbols";
import type { MarketSymbol } from "@/lib/market-data/types";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";

interface SessionSetupProps {
  onStart: (body: CreateSessionBody) => void;
  busy: boolean;
  error: string | null;
  entitlements: PlanEntitlements;
}

// Ordered by catalogue size so the busiest filters sit closest to "All". A
// category with no enabled symbols is never rendered, so the row stays short
// enough to wrap instead of scrolling off the edge of the column.
const MARKET_CATEGORIES = ["All", "Forex", "Indices", "Crypto", "Metals", "Energies", "Futures", "Stocks"] as const;
type MarketCategory = (typeof MARKET_CATEGORIES)[number];
type MarketGroup = Exclude<MarketCategory, "All">;

const FIAT_CURRENCIES = ["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"];

function categoryForMarket(item: MarketSymbol): MarketGroup {
  if (["BTC", "ETH", "LTC", "ADA"].includes(item.baseCurrency)) return "Crypto";
  if (["XAU", "XAG"].includes(item.baseCurrency)) return "Metals";
  if (item.symbol.includes("IDX") || item.symbol === "DXY") return "Indices";
  if (FIAT_CURRENCIES.includes(item.baseCurrency) && FIAT_CURRENCIES.includes(item.quoteCurrency)) return "Forex";
  return "Stocks";
}

/**
 * Market chooser for step 2.
 *
 * The catalogue is far longer than the column is tall, so discovery has to work
 * three ways at once: filter by category, search by name or code, and keep the
 * current selection visible even when it has been filtered out of the list.
 */
function MarketPicker({
  symbols,
  loading,
  selected,
  singleSelect,
  onToggle,
  onReset,
}: {
  symbols: MarketSymbol[];
  loading: boolean;
  selected: string[];
  singleSelect: boolean;
  onToggle: (symbol: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketCategory>("All");
  const dialogRef = useModalBehavior<HTMLElement>({
    open,
    onClose: () => setOpen(false),
  });

  const enabled = useMemo(() => symbols.filter((item) => item.enabled), [symbols]);

  const counts = useMemo(() => {
    const totals = new Map<MarketCategory, number>([["All", enabled.length]]);
    for (const item of enabled) {
      const group = categoryForMarket(item);
      totals.set(group, (totals.get(group) ?? 0) + 1);
    }
    return totals;
  }, [enabled]);

  const categories = useMemo(
    () => MARKET_CATEGORIES.filter((item) => (counts.get(item) ?? 0) > 0),
    [counts],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return enabled.filter((item) => {
      if (category !== "All" && categoryForMarket(item) !== category) return false;
      if (!needle) return true;
      return `${item.symbol} ${item.displayName} ${describeSymbol(item.symbol)}`
        .toLowerCase()
        .includes(needle);
    });
  }, [category, enabled, query]);

  const selectedItems = useMemo(
    () => selected.map((symbol) => enabled.find((item) => item.symbol === symbol)).filter(Boolean) as MarketSymbol[],
    [enabled, selected],
  );

  const closePicker = () => {
    setOpen(false);
    setQuery("");
    setCategory("All");
  };

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 flex w-full items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md border app-border bg-[var(--app-panel-2)] text-xs font-semibold app-muted">2</span>
        <span className="text-sm font-semibold">Markets</span>
        <span className="text-[11px] font-medium app-muted">{selected.length} selected</span>
      </legend>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border app-border bg-[var(--app-panel-2)]/45 px-3.5 py-3 text-left transition-colors hover:border-brand-400/45 hover:bg-[var(--app-panel-2)]"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-400/10 text-brand-300"><Search size={16} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{loading ? "Loading markets…" : "Choose markets"}</span>
          <span className="mt-0.5 block truncate text-xs app-muted">
            {selectedItems.length > 0 ? selectedItems.map((item) => item.displayName).join(", ") : "Search the complete market catalogue"}
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 app-muted" aria-hidden />
      </button>

      {selectedItems.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <span key={item.symbol} className="inline-flex items-center gap-1 rounded-md border app-border px-2 py-1 font-mono text-[11px] font-semibold">
              {item.displayName}
              {!singleSelect && <button type="button" aria-label={`Remove ${item.displayName}`} onClick={() => onToggle(item.symbol)}><X size={11} aria-hidden /></button>}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
          <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="market-picker-title" className="panel flex max-h-[min(42rem,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden shadow-2xl">
            <header className="flex items-center justify-between gap-4 border-b app-border px-5 py-4">
              <div>
                <h2 id="market-picker-title" className="text-lg font-semibold">Choose markets</h2>
                <p className="mt-0.5 text-xs app-muted">{selected.length} selected · {enabled.length} available</p>
              </div>
              <button type="button" onClick={closePicker} aria-label="Close market picker" className="grid h-9 w-9 place-items-center rounded-lg border app-border app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"><X size={17} aria-hidden /></button>
            </header>

            <div className="border-b app-border px-5 py-3">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 app-muted" aria-hidden />
                <label htmlFor="setup-market-search" className="sr-only">Search markets</label>
                <input id="setup-market-search" type="search" className="app-input w-full py-2 pl-9 pr-9 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${enabled.length} markets`} autoComplete="off" />
                {query && <button type="button" aria-label="Clear market search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)]"><X size={14} aria-hidden /></button>}
              </div>
              {categories.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter markets by category">
                  {categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${category === item ? "border-brand-400/50 bg-brand-400/10 text-brand-200" : "app-border app-muted hover:bg-[var(--app-panel-2)]"}`}>{item} <span className="opacity-70">{counts.get(item)}</span></button>)}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: 8 }, (_, index) => <span key={index} className="h-12 animate-pulse rounded-lg bg-white/[0.05]" />)}</div>
              ) : visible.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {visible.map((item) => {
                    const active = selected.includes(item.symbol);
                    const description = describeSymbol(item.symbol);
                    return <label key={item.symbol} className={`group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${active ? "border-brand-400/60 bg-brand-400/10" : "app-border hover:bg-[var(--app-panel-2)]"}`}>
                      <input type={singleSelect ? "radio" : "checkbox"} name={singleSelect ? "session-pair" : undefined} className="sr-only" checked={active} onChange={() => { onToggle(item.symbol); if (!active) setQuery(""); if (singleSelect) closePicker(); }} />
                      <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center border ${singleSelect ? "rounded-full" : "rounded-md"} ${active ? "border-brand-400 bg-brand-500 text-surface-950" : "app-border"}`}>{active && <Check size={12} strokeWidth={3.5} />}</span>
                      <span className="min-w-0"><span className="block truncate font-mono text-sm font-semibold">{item.displayName}</span><span className="block truncate text-xs app-muted">{description}</span></span>
                    </label>;
                  })}
                </div>
              ) : <p className="py-10 text-center text-sm app-muted">No markets match your search.</p>}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t app-border px-5 py-3">
              <button type="button" onClick={onReset} disabled={selected.length === 0} className="text-xs font-medium app-muted hover:text-[var(--app-text)] disabled:opacity-40">Clear selection</button>
              <button type="button" onClick={closePicker} className="btn-primary px-5 py-2">Done · {selected.length}</button>
            </footer>
          </section>
        </div>
      )}
    </fieldset>
  );
}

function toDateInput(ms: number): string {
  return toNewYorkDateInput(ms);
}

function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateInput(date.getTime());
}

const REPLAY_PERIODS = [
  { days: 31, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function periodEnd(start: string, days: number, availableEnd: string): string {
  if (!start) return "";
  const desired = addCalendarDays(start, Math.max(0, days - 1));
  return availableEnd && desired > availableEnd ? availableEnd : desired;
}

function inclusiveDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const first = new Date(`${start}T12:00:00Z`).getTime();
  const last = new Date(`${end}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((last - first) / DAY_MS) + 1);
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
  const [periodDays, setPeriodDays] = useState(() =>
    entitlements.maxSessionDays !== null && entitlements.maxSessionDays < 365
      ? Math.min(31, entitlements.maxSessionDays)
      : 365,
  );
  const [customPeriod, setCustomPeriod] = useState(false);
  const [loadingRange, setLoadingRange] = useState(false);
  /** Null = free practice. Otherwise the challenge phase being attempted. */
  const [challengePreset, setChallengePreset] =
    useState<"ftmo-phase-1" | "ftmo-phase-2" | null>(null);
  // Free practice may use any positive starting balance. Challenge presets
  // reuse this value and constrain it to the supported account-size buttons.
  const [accountSize, setAccountSize] = useState<string>("10000");

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
        setStart((current) => {
          if (!current) return toDateInput(commonRange.startTime);
          const selected = newYorkDateStart(current);
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

  const availableEnd = range ? toDateInput(range.endTime) : "";
  const allowedPeriodDays = Math.min(
    periodDays,
    entitlements.maxSessionDays ?? periodDays,
  );

  useEffect(() => {
    if (!range || !start) return;
    const minimum = toDateInput(range.startTime);
    const maximum = toDateInput(range.endTime);
    if (!customPeriod) {
      setEnd(periodEnd(start, allowedPeriodDays, maximum));
      return;
    }
    setEnd((current) => {
      if (!current || current < start) return start;
      const planMaximum = entitlements.maxSessionDays === null
        ? maximum
        : periodEnd(start, entitlements.maxSessionDays, maximum);
      return current > planMaximum ? planMaximum : current < minimum ? minimum : current;
    });
  }, [allowedPeriodDays, customPeriod, entitlements.maxSessionDays, range, start]);

  const tags = tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
  const sessionEndMax =
    entitlements.maxSessionDays !== null && start
      ? [availableEnd, addCalendarDays(start, entitlements.maxSessionDays - 1)]
          .filter(Boolean)
          .sort()[0] ?? availableEnd
      : availableEnd;
  const canStart = Boolean(
    selectedSymbols.length > 0 &&
      range &&
      start &&
      end &&
      end >= start &&
      !loadingRange &&
      !busy && Number(accountSize) > 0,
  );

  const generatedName = selectedSymbols.length > 0
    ? `${selectedSymbols.map(formatSymbol).join(", ")} · ${start ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T12:00:00Z`)) : "Backtest"}`
    : "New backtest";

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
    const rules = challengePreset ? PROP_FIRM_PRESETS[challengePreset] : undefined;
    onStart({
      name: name.trim() || generatedName,
      tags,
      symbols: selectedSymbols,
      startTime: Math.max(range.startTime, newYorkDateStart(start)),
      endTime: Math.min(range.endTime, newYorkDateEnd(end)),
      // Both free practice and challenges start from the balance shown here.
      startingBalance: accountSize,
      propFirm: rules,
    });
  }

  function selectPeriod(days: number) {
    setCustomPeriod(false);
    setPeriodDays(Math.min(days, entitlements.maxSessionDays ?? days));
  }

  function chooseRandomStart() {
    if (!range) return;
    const first = new Date(`${toDateInput(range.startTime)}T12:00:00Z`).getTime();
    const last = new Date(`${toDateInput(range.endTime)}T12:00:00Z`).getTime();
    const days = customPeriod ? Math.max(1, inclusiveDays(start, end)) : allowedPeriodDays;
    const latestStart = Math.max(first, last - Math.max(0, days - 1) * DAY_MS);
    const slots = Math.max(0, Math.floor((latestStart - first) / DAY_MS));
    const offset = slots > 0 ? Math.floor(Math.random() * (slots + 1)) : 0;
    setStart(toDateInput(first + offset * DAY_MS));
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
    <form onSubmit={handleStart} className="panel mx-auto w-full max-w-7xl overflow-visible lg:flex lg:h-[calc(100dvh-5.5rem)] lg:max-h-[48rem] lg:flex-col lg:overflow-hidden">
      <div className="flex shrink-0 flex-col gap-1 border-b app-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <h2 className="text-xl font-semibold tracking-tight">New backtest</h2>
        <span className="w-fit text-xs font-medium app-muted">
          {entitlements.plan === "free"
            ? `Trial · ${entitlements.trialSessionsRemaining ?? 0} of 3 remaining`
            : "Pro workspace"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="grid shrink-0 gap-4 border-b app-border px-5 py-3 sm:px-6 lg:grid-cols-2 lg:items-start">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md border app-border bg-[var(--app-panel-2)] text-xs font-semibold app-muted">1</span>
              <h3 className="text-sm font-semibold">Session details</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1.1fr_.9fr]">
              <div>
                <label htmlFor="setup-name" className="sr-only">Session name</label>
                <input id="setup-name" className="app-input w-full text-sm" value={name} onChange={(event) => setName(event.target.value)} placeholder={generatedName} maxLength={80} autoFocus />
              </div>
              <div className="relative">
                <Tags size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 app-muted" aria-hidden />
                <label htmlFor="setup-tags" className="sr-only">Strategy tags</label>
                <input id="setup-tags" className="app-input w-full pl-9 text-sm" value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="Optional tags" />
              </div>
            </div>
          </section>

          <MarketPicker
            symbols={symbols}
            loading={loadingSymbols}
            selected={selectedSymbols}
            singleSelect={entitlements.maxPairsPerSession === 1}
            onToggle={toggleSymbol}
            onReset={() => setSelectedSymbols([])}
          />
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2">
        <div className="px-5 py-3 sm:px-6 lg:border-r lg:border-[var(--app-border)]">
          <fieldset>
            <legend className="mb-2 flex w-full items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md border app-border bg-[var(--app-panel-2)] text-xs font-semibold app-muted">3</span>
              <span className="text-sm font-semibold">Session type</span>
            </legend>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <ModeCard
                icon={Plus}
                title="Backtesting session"
                info="Replay historical markets and test a strategy without challenge rules."
                selected={challengePreset === null}
                onSelect={() => setChallengePreset(null)}
              />
              <ModeCard
                icon={Trophy}
                title="Prop firm session"
                info="Trade under prop-firm profit target and drawdown rules."
                selected={challengePreset !== null}
                onSelect={() => setChallengePreset((current) => current ?? "ftmo-phase-1")}
              />
            </div>

            {challengePreset && (
              <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                <ModeCard
                  title="Phase 1"
                  detail="10% profit target"
                  selected={challengePreset === "ftmo-phase-1"}
                  onSelect={() => setChallengePreset("ftmo-phase-1")}
                />
                <ModeCard
                  title="Phase 2"
                  detail="5% profit target"
                  selected={challengePreset === "ftmo-phase-2"}
                  onSelect={() => setChallengePreset("ftmo-phase-2")}
                />
              </div>
            )}

            {!challengePreset && (
              <div className="mt-3 rounded-lg border app-border p-3">
                <label htmlFor="setup-account-balance" className="mb-1.5 block text-xs font-medium app-muted">
                  Starting account balance (USD)
                </label>
                <div className="flex items-center gap-2">
                  <span className="app-muted">$</span>
                  <input
                    id="setup-account-balance"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={accountSize}
                    onChange={(event) => setAccountSize(event.target.value)}
                    className="app-input min-w-0 flex-1 py-1.5 text-sm font-mono"
                  />
                </div>
              </div>
            )}

            {challengePreset && (
              <div className="mt-3 rounded-lg border app-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Account size</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {PROP_FIRM_ACCOUNT_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setAccountSize(size)}
                      aria-pressed={accountSize === size}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                        accountSize === size
                          ? "border-brand-400/50 bg-brand-400/10 text-brand-200"
                          : "app-border hover:border-brand-400/30"
                      }`}
                    >
                      {Number(size).toLocaleString()}
                    </button>
                  ))}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <RuleLine
                    label="Profit target"
                    value={ruleSummary(accountSize, PROP_FIRM_PRESETS[challengePreset].profitTargetPercent)}
                  />
                  <RuleLine
                    label="Max daily loss"
                    value={ruleSummary(accountSize, PROP_FIRM_PRESETS[challengePreset].maxDailyLossPercent)}
                  />
                  <RuleLine
                    label="Max total loss"
                    value={ruleSummary(accountSize, PROP_FIRM_PRESETS[challengePreset].maxTotalLossPercent)}
                  />
                  <RuleLine label="Daily reset" value="00:00 Prague" />
                </dl>
              </div>
            )}

          </fieldset>
        </div>

        <div className="min-w-0 border-t app-border px-5 py-3 sm:px-6 lg:border-t-0">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md border app-border bg-[var(--app-panel-2)] text-xs font-semibold app-muted">4</span>
              <h3 className="text-sm font-semibold">Replay period</h3>
            </div>

            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Replay duration">
              {REPLAY_PERIODS.map((item) => {
                const disabled = entitlements.maxSessionDays !== null && item.days > entitlements.maxSessionDays;
                const active = !customPeriod && periodDays === item.days;
                return (
                  <button
                    key={item.days}
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    title={disabled ? `Your plan supports up to ${entitlements.maxSessionDays} days` : item.label}
                    onClick={() => selectPeriod(item.days)}
                    className={`rounded-md border px-2 py-2 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${active ? "border-brand-400/50 bg-[var(--app-panel-2)] text-brand-200" : "app-border app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}
                  >
                    {item.label}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={customPeriod}
                onClick={() => setCustomPeriod(true)}
                className={`rounded-md border px-2 py-2 text-[11px] font-semibold transition-colors ${customPeriod ? "border-brand-400/50 bg-[var(--app-panel-2)] text-brand-200" : "app-border app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}
              >
                Custom
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SessionDatePicker
                id="setup-start"
                label="Start date"
                value={start}
                min={range ? toDateInput(range.startTime) : ""}
                max={range ? toDateInput(range.endTime) : ""}
                onChange={setStart}
              />
              {customPeriod ? (
                <SessionDatePicker
                  id="setup-end"
                  label="End date"
                  value={end}
                  min={start || (range ? toDateInput(range.startTime) : "")}
                  max={sessionEndMax}
                  onChange={setEnd}
                />
              ) : (
                <div>
                  <span className="mb-1.5 block text-sm font-medium">End date</span>
                  <div className="app-input flex min-h-10 items-center justify-between">
                    <span className={end ? "font-medium" : "app-muted"}>{friendlyDate(end)}</span>
                    <span className="text-[10px] font-medium app-muted">Automatic</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t app-border pt-3 text-xs app-muted" aria-live="polite">
              <span className="flex min-w-0 items-start gap-2">
                {loadingRange ? (
                  <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-brand-300" aria-hidden />
                ) : (
                  <Clock3 size={14} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
                )}
                <span>
                  {loadingRange
                    ? "Checking available market history…"
                    : range
                      ? `Available ${friendlyDate(toDateInput(range.startTime))} – ${friendlyDate(toDateInput(range.endTime))}`
                      : "Choose a market to see available dates."}
                </span>
              </span>
              <button
                type="button"
                disabled={!range || loadingRange}
                onClick={chooseRandomStart}
                className="inline-flex items-center gap-1.5 rounded-md border app-border px-2 py-1 text-[10px] font-semibold text-brand-300 hover:bg-brand-400/10 disabled:opacity-35"
              >
                <Shuffle size={11} aria-hidden /> Random start
              </button>
            </div>
          </section>
        </div>
        </div>
      </div>

      <div className="shrink-0 border-t app-border px-5 py-2.5 sm:px-6">
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary h-10 min-w-44 py-0" disabled={!canStart}>
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

/** A percentage rule with its cash value, so the numbers are concrete up front. */
function ruleSummary(balance: string, percent: number): string {
  const amount = (Number(balance) * percent) / 100;
  if (!Number.isFinite(amount)) return `${percent}%`;
  return `${percent}% (${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })})`;
}

function RuleLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="app-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </>
  );
}

function ModeCard({
  icon: Icon,
  title,
  detail,
  info,
  selected,
  disabled = false,
  onSelect,
}: {
  icon?: typeof Plus;
  title: string;
  detail?: string;
  info?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`min-w-0 flex min-h-[64px] items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        selected
          ? "border-brand-400/50 bg-[var(--app-panel-2)]"
          : "app-border hover:bg-[var(--app-panel-2)]"
      }`}
    >
      {Icon && <Icon size={21} strokeWidth={1.8} className={selected ? "text-brand-300" : "app-muted"} aria-hidden />}
      <span className="min-w-0 flex-1"><span className={`flex items-center gap-1.5 text-sm font-semibold ${selected ? "text-brand-200" : ""}`}>{title}{info && <span title={info} aria-label={info}><Info size={12} className="app-muted" aria-hidden /></span>}</span>{detail && <span className="mt-0.5 block text-xs app-muted">{detail}</span>}</span>
    </button>
  );
}
