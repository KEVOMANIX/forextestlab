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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketCategory>("All");

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

  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 flex w-full items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-400/10 text-xs font-bold text-brand-300">2</span>
        <span className="text-sm font-semibold">Choose market{singleSelect ? "" : "s"}</span>
        {selected.length > 0 && (
          <span className="rounded-full bg-brand-400/12 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
            {selected.length} selected
          </span>
        )}
      </legend>

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 app-muted" aria-hidden />
        <label htmlFor="setup-market-search" className="sr-only">Search markets</label>
        <input
          id="setup-market-search"
          type="search"
          className="app-input w-full py-2 pl-9 pr-9 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={loading ? "Loading markets…" : `Search ${enabled.length} markets`}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear market search"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md app-muted transition-colors hover:bg-[var(--app-panel-2)] hover:text-brand-300"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {categories.length > 1 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter markets by category">
          {categories.map((item) => {
            const active = category === item;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(item)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-brand-400/45 bg-brand-400/12 text-brand-200"
                    : "app-border bg-[var(--app-panel-2)]/55 app-muted hover:border-brand-400/35 hover:text-brand-200"
                }`}
              >
                {item}
                <span className={active ? "text-brand-300/80" : "opacity-60"}>{counts.get(item)}</span>
              </button>
            );
          })}
        </div>
      )}

      {!singleSelect && selectedItems.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {selectedItems.map((item) => (
            <span
              key={item.symbol}
              className="inline-flex items-center gap-1 rounded-md border border-brand-400/35 bg-brand-400/10 py-0.5 pl-2 pr-0.5 text-[11px] font-semibold text-brand-200"
            >
              <span className="font-mono">{item.displayName}</span>
              <button
                type="button"
                aria-label={`Remove ${item.displayName}`}
                onClick={() => onToggle(item.symbol)}
                className="grid h-4 w-4 place-items-center rounded transition-colors hover:bg-brand-400/25"
              >
                <X size={11} strokeWidth={2.5} aria-hidden />
              </button>
            </span>
          ))}
          {selectedItems.length > 1 && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium app-muted underline-offset-2 transition-colors hover:text-brand-300 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <div className="relative mt-2.5">
        {loading ? (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1" aria-label="Loading markets">
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index} className="h-[46px] animate-pulse rounded-lg bg-white/[0.05]" />
            ))}
          </div>
        ) : visible.length > 0 ? (
          <>
            <div className="grid max-h-[17rem] grid-cols-1 gap-1.5 overflow-y-auto overscroll-contain pb-3 pr-1 sm:grid-cols-2 lg:grid-cols-1">
              {visible.map((item) => {
                const active = selected.includes(item.symbol);
                const description = describeSymbol(item.symbol);
                return (
                  <label
                    key={item.symbol}
                    title={description}
                    className={`group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400/60 ${
                      active
                        ? "border-brand-400/50 bg-brand-400/10"
                        : "app-border bg-[var(--app-panel-2)]/55 hover:border-brand-400/30 hover:bg-brand-400/[0.04]"
                    }`}
                  >
                    <input
                      type={singleSelect ? "radio" : "checkbox"}
                      name={singleSelect ? "session-pair" : undefined}
                      className="sr-only"
                      checked={active}
                      onChange={() => onToggle(item.symbol)}
                    />
                    <span
                      aria-hidden
                      className={`grid h-[18px] w-[18px] shrink-0 place-items-center border transition-colors ${
                        singleSelect ? "rounded-full" : "rounded-[5px]"
                      } ${
                        active
                          ? "border-brand-400 bg-brand-500 text-surface-950"
                          : "app-border group-hover:border-brand-400/40"
                      }`}
                    >
                      {active && <Check size={11} strokeWidth={3.5} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-mono text-[13px] font-semibold leading-tight ${active ? "text-brand-200" : ""}`}>
                        {item.displayName}
                      </span>
                      {description !== item.displayName && (
                        <span className="mt-0.5 block truncate text-[11px] leading-tight app-muted">
                          {description}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[var(--app-panel)] to-transparent"
            />
          </>
        ) : (
          <p className="rounded-lg border app-border bg-[var(--app-panel-2)]/55 px-3 py-4 text-sm app-muted">
            {enabled.length === 0
              ? "Markets are temporarily unavailable. Please refresh and try again."
              : query.trim()
                ? `No markets match “${query.trim()}”.`
                : `No ${category.toLowerCase()} markets are available yet.`}
          </p>
        )}
      </div>

      {!loading && enabled.length > 0 && (
        <p className="mt-2 text-[11px] app-muted">
          {visible.length === enabled.length
            ? `${enabled.length} markets available`
            : `Showing ${visible.length} of ${enabled.length} markets`}
          {singleSelect && " · trial sessions replay one market at a time"}
        </p>
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
      !busy && Number(accountSize) > 0,
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
    const rules = challengePreset ? PROP_FIRM_PRESETS[challengePreset] : undefined;
    onStart({
      name: name.trim(),
      tags,
      symbols: selectedSymbols,
      startTime: Math.max(range.startTime, newYorkDateStart(start)),
      endTime: Math.min(range.endTime, newYorkDateEnd(end)),
      // Both free practice and challenges start from the balance shown here.
      startingBalance: accountSize,
      propFirm: rules,
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
    <form onSubmit={handleStart} className="panel mx-auto w-full max-w-6xl overflow-visible">
      <div className="flex flex-col gap-2 border-b app-border px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">New backtest</p>
          <h2 className="mt-0.5 text-xl font-bold tracking-tight">Set up your session</h2>
        </div>
        <span className="w-fit rounded-full border border-brand-400/20 bg-brand-400/[0.07] px-3 py-1.5 text-xs font-semibold text-brand-300">
          {entitlements.plan === "free"
            ? `Trial · ${entitlements.trialSessionsRemaining ?? 0} of 3 left · 1 pair · 31 days`
            : "Pro workspace"}
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 overflow-hidden px-5 py-4 sm:px-6 lg:border-r lg:border-[var(--app-border)]">
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
            <div className="relative mt-2">
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

          <MarketPicker
            symbols={symbols}
            loading={loadingSymbols}
            selected={selectedSymbols}
            singleSelect={entitlements.maxPairsPerSession === 1}
            onToggle={toggleSymbol}
            onReset={() => setSelectedSymbols([])}
          />
        </div>

        <div className="min-w-0 overflow-hidden border-t app-border bg-[linear-gradient(180deg,rgba(34,195,160,.035),transparent_45%)] px-5 py-4 sm:px-6 lg:border-r lg:border-t-0 lg:border-[var(--app-border)]">
          <fieldset>
            <legend className="mb-3 flex w-full items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-400/10 text-xs font-bold text-brand-300">3</span>
              <span className="text-sm font-semibold">Session type</span>
            </legend>
            <p className="-mt-1 mb-3 pl-9 text-xs leading-relaxed app-muted">Choose a relaxed replay or test yourself against challenge rules.</p>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <ModeCard
                icon={Plus}
                title="Backtesting session"
                detail="Start a session"
                info="Replay historical markets and test a strategy without challenge rules."
                selected={challengePreset === null}
                onSelect={() => setChallengePreset(null)}
              />
              <ModeCard
                icon={Trophy}
                title="Prop firm session"
                detail="Start a challenge"
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
              <div className="mt-3 rounded-xl border app-border bg-[var(--app-panel-2)]/50 p-3">
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
                <p className="mt-1.5 text-[11px] app-muted">Use any positive balance for an unrestricted replay.</p>
              </div>
            )}

            {challengePreset && (
              <div className="mt-3 rounded-xl border app-border bg-[var(--app-panel-2)]/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="text-xs font-semibold">Choose account size</p><p className="mt-0.5 text-[11px] app-muted">Select an included prop-firm balance.</p></div>
                  <span className="rounded-full bg-brand-400/10 px-2 py-1 text-[10px] font-semibold text-brand-300">Required</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {PROP_FIRM_ACCOUNT_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setAccountSize(size)}
                      aria-pressed={accountSize === size}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
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
                <p className="mt-2 text-[11px] app-muted">
                  Limits are measured on equity, including open trades, and are
                  enforced candle by candle. A challenge cannot be rewound.
                </p>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-brand-400/15 bg-brand-400/[0.04] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-brand-200">Workspace capabilities</p>
                  <p className="mt-0.5 text-[11px] app-muted">Everything you need to review a setup with confidence.</p>
                </div>
                <span className="rounded-full bg-brand-400/10 px-2 py-1 text-[10px] font-semibold text-brand-300">{entitlements.maxPairsPerSession === 1 ? "Free" : "Pro"}</span>
              </div>
              <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-1">
                {["Historical replay controls", "Trade journal and analytics", "Automatic session preview"].map((item) => (
                  <li key={item} className="flex items-center gap-2 app-muted">
                    <Check size={14} className="shrink-0 text-brand-300" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </fieldset>
        </div>

        <div className="min-w-0 overflow-hidden border-t app-border px-5 py-4 sm:px-6 lg:border-t-0">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-400/10 text-xs font-bold text-brand-300">4</span>
              <h3 className="text-sm font-semibold">Choose your replay period</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
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

          <section className="mt-4 rounded-xl border app-border bg-[var(--app-panel-2)]/50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] app-muted">Session preview</p>
            <p className={`mt-1.5 truncate font-semibold ${name.trim() ? "" : "app-muted"}`}>
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
            <p className="mt-1 text-sm app-muted">
              Starting balance: {accountSize && Number(accountSize) > 0
                ? `$${Number(accountSize).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "Enter a positive balance"}
            </p>
            {tags.length > 0 && (
              <div className="mt-2 flex max-h-12 flex-wrap gap-1.5 overflow-hidden">
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

      <div className="border-t app-border px-5 py-3 sm:px-6">
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
  detail: string;
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
      className={`min-w-0 flex min-h-[100px] items-center gap-3 rounded-xl border px-4 py-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
        selected
          ? "border-brand-400/50 bg-brand-400/10 shadow-[0_12px_28px_-18px_rgba(45,212,191,.9)]"
          : "app-border bg-[var(--app-panel-2)]/55 hover:border-brand-400/30"
      }`}
    >
      {Icon && <Icon size={21} strokeWidth={1.8} className={selected ? "text-brand-300" : "app-muted"} aria-hidden />}
      <span className="min-w-0 flex-1"><span className={`flex items-center gap-1.5 text-sm font-semibold ${selected ? "text-brand-200" : ""}`}>{title}{info && <span title={info} aria-label={info}><Info size={12} className="app-muted" aria-hidden /></span>}</span><span className="mt-0.5 block text-xs app-muted">{detail}</span></span>
    </button>
  );
}
