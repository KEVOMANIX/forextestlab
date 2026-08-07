"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  Loader2,
  Lock,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";

import { fetchSymbols } from "@/lib/backtest/client";
import type { SymbolQuote } from "@/lib/backtest/symbol-quote";
import { describeSymbol, formatSymbol } from "@/lib/market-data/symbols";
import type { MarketSymbol } from "@/lib/market-data/types";
import { useModalBehavior } from "@/lib/ui/use-modal-behavior";
import { CurrencyFlag, hasCurrencyFlag } from "./CurrencyFlag";

/**
 * Symbol picker for a session in progress.
 *
 * Two groups, because they are two different decisions. The session's own
 * symbols carry live quotes and switching to one is instant — that is the common
 * case, so it sits at the top under the clock-bounded prices. Everything else in
 * the catalogue has no data loaded yet and joining it to the session is a change
 * to the session, so it lives below an explicit divider and reads as an action
 * rather than a tab.
 */

interface SymbolPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Symbols already attached to the session. */
  sessionSymbols: string[];
  /** The instrument orders are executed against; it can never be removed. */
  tradedSymbol: string;
  /** Symbol the focused chart is showing. */
  activeSymbol: string;
  quoteFor: (symbol: string) => SymbolQuote | null;
  precisionFor: (symbol: string) => number;
  /** Symbols with a series still loading. */
  loadingSymbols: string[];
  /** False when the plan caps a session at one symbol. */
  canAddSymbols: boolean;
  busy: boolean;
  error: string | null;
  onSelect: (symbol: string) => void;
  onAdd: (symbol: string) => void;
}

/**
 * Deterministic hue per currency, so a symbol's badge is the same colour every
 * time it appears without shipping a flag sprite for every market.
 */
function currencyHue(code: string): number {
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) % 360;
  }
  return hash;
}

/**
 * Currency-pair mark.
 *
 * A pair of both-sides-known currencies gets its two flags, base in front of
 * quote — the convention every other terminal uses, and far faster to find in a
 * list than reading six letters. The flags are the drawn {@link CurrencyFlag}
 * discs the calendar badges already use, so nothing is fetched and each carries
 * its own dark edge stroke, which is what separates the overlap on a row that
 * may be transparent, hovered or accent-washed.
 *
 * Everything else keeps the stacked codes: a metal, an index or a crypto pair
 * has no flag, and half a pair of flags looks broken rather than deliberate.
 */
function SymbolBadge({ symbol }: { symbol: string }) {
  const base = symbol.slice(0, 3);
  const quote = symbol.length > 3 ? symbol.slice(3, 6) : "";

  if (quote && hasCurrencyFlag(base) && hasCurrencyFlag(quote)) {
    return (
      <span className="relative block h-9 w-9 shrink-0" aria-hidden>
        <CurrencyFlag currency={quote} size={22} className="absolute bottom-0 right-0 block" />
        <CurrencyFlag currency={base} size={22} className="absolute left-0 top-0 block" />
      </span>
    );
  }

  return (
    <span
      className="flex h-9 w-9 shrink-0 flex-col overflow-hidden rounded-xl font-sans text-[9px] font-bold leading-none tracking-tight text-white"
      aria-hidden
    >
      <span
        className="grid flex-1 place-items-center"
        style={{ background: `hsl(${currencyHue(base)} 52% 33%)` }}
      >
        {base}
      </span>
      {quote && (
        <span
          className="grid flex-1 place-items-center"
          style={{ background: `hsl(${currencyHue(quote)} 52% 33%)` }}
        >
          {quote}
        </span>
      )}
    </span>
  );
}

function QuoteCells({
  quote,
  precision,
  loading,
}: {
  quote: SymbolQuote | null;
  precision: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <>
        <span className="hidden w-28 shrink-0 justify-end sm:flex">
          <Loader2 size={13} className="animate-spin app-muted" aria-hidden />
        </span>
        <span className="hidden w-28 shrink-0 sm:block" />
      </>
    );
  }
  if (!quote) {
    return (
      <>
        <span className="hidden w-28 shrink-0 text-right font-mono text-sm app-muted sm:block">
          —
        </span>
        <span className="hidden w-28 shrink-0 sm:block" />
      </>
    );
  }
  const change = quote.change;
  return (
    <>
      <span className="hidden w-28 shrink-0 text-right font-mono text-sm font-semibold sm:block">
        {quote.last.toFixed(precision)}
      </span>
      <span
        className={`hidden w-28 shrink-0 text-right font-mono text-sm sm:block ${
          change == null
            ? "app-muted"
            : change >= 0
              ? "text-[var(--app-accent-text)]"
              : "text-bear"
        }`}
      >
        {change == null
          ? "—"
          : `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(precision)}`}
      </span>
    </>
  );
}

export function SymbolPickerModal({
  open,
  onClose,
  sessionSymbols,
  tradedSymbol,
  activeSymbol,
  quoteFor,
  precisionFor,
  loadingSymbols,
  canAddSymbols,
  busy,
  error,
  onSelect,
  onAdd,
}: SymbolPickerModalProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useModalBehavior<HTMLElement>({
    open,
    onClose,
    initialFocus: searchRef,
  });
  const [query, setQuery] = useState("");
  const [catalogue, setCatalogue] = useState<MarketSymbol[] | null>(null);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlight(0);
      return;
    }
    if (catalogue) return;
    let active = true;
    void fetchSymbols()
      .then((list) => active && setCatalogue(list))
      .catch(() => active && setCatalogue([]));
    return () => {
      active = false;
    };
  }, [open, catalogue]);

  const matches = (symbol: string) => {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    return (
      symbol.toLowerCase().includes(term) ||
      formatSymbol(symbol).toLowerCase().includes(term) ||
      describeSymbol(symbol).toLowerCase().includes(term)
    );
  };

  const attached = useMemo(
    () => sessionSymbols.filter(matches),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionSymbols, query],
  );
  const available = useMemo(
    () =>
      (catalogue ?? []).filter(
        (item) => !sessionSymbols.includes(item.symbol) && matches(item.symbol),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogue, sessionSymbols, query],
  );

  /** One flat list so ↑/↓ crosses the divider the way the eye does. */
  const rows = useMemo(
    () => [
      ...attached.map((symbol) => ({ symbol, attached: true, enabled: true })),
      ...available.map((item) => ({
        symbol: item.symbol,
        attached: false,
        enabled: item.enabled,
      })),
    ],
    [attached, available],
  );

  useEffect(() => {
    setHighlight((current) => Math.min(current, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  if (!open) return null;

  const choose = (symbol: string, isAttached: boolean, enabled: boolean) => {
    if (isAttached) {
      if (symbol !== activeSymbol) onSelect(symbol);
      onClose();
      return;
    }
    if (!enabled || !canAddSymbols || busy) return;
    onAdd(symbol);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        if (rows.length === 0) return 0;
        return (next + rows.length) % rows.length;
      });
      return;
    }
    if (event.key === "Enter") {
      const row = rows[highlight];
      if (!row) return;
      event.preventDefault();
      choose(row.symbol, row.attached, row.enabled);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-surface-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-picker-title"
        data-testid="symbol-picker"
        onKeyDown={onKeyDown}
        className="flex max-h-[min(46rem,90dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border app-border bg-[var(--app-panel-solid)] shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <h2 id="symbol-picker-title" className="text-lg font-semibold tracking-tight">
              Select your symbol
            </h2>
            <p className="mt-1 truncate text-xs app-muted">
              Trading {formatSymbol(tradedSymbol)}. Other symbols chart as reference.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close symbol picker"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg app-muted transition-colors hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="shrink-0 px-5 sm:px-6">
          {/* The wrapper carries the focus treatment, so the input suppresses its
              own ring — otherwise focus draws two nested outlines. */}
          <div className="flex h-12 items-center gap-2.5 rounded-xl border app-border bg-[var(--app-panel-2)] px-3.5 transition-colors focus-within:border-brand-400/70 focus-within:ring-2 focus-within:ring-brand-400/25">
            <Search size={17} className="shrink-0 app-muted" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              placeholder="Search symbol"
              aria-label="Search symbol"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:app-muted focus-visible:ring-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="grid h-6 w-6 shrink-0 place-items-center rounded app-muted hover:text-[var(--app-text)]"
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex shrink-0 items-center gap-3 border-y app-border bg-[var(--app-panel-2)]/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] app-muted sm:px-6">
          <span className="w-9 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">Symbol</span>
          <span className="hidden w-28 shrink-0 text-right sm:block">Last price</span>
          <span className="hidden w-28 shrink-0 text-right sm:block">Price change</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
          {rows.length === 0 && (
            <p className="px-4 py-10 text-center text-sm app-muted">
              {catalogue === null
                ? "Loading symbols…"
                : `No symbol matches “${query.trim()}”.`}
            </p>
          )}

          {attached.map((symbol, index) => {
            const isActive = symbol === activeSymbol;
            return (
              <button
                key={symbol}
                type="button"
                data-testid={`symbol-row-${symbol}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(symbol, true, true)}
                aria-current={isActive ? "true" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  highlight === index ? "bg-[var(--app-panel-2)]" : ""
                }`}
                style={isActive ? { background: "var(--app-accent-wash)" } : undefined}
              >
                <SymbolBadge symbol={symbol} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={`truncate font-mono text-sm font-bold ${
                        isActive ? "text-[var(--app-accent-text)]" : ""
                      }`}
                    >
                      {symbol}
                    </span>
                    {symbol === tradedSymbol && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--app-accent-text)]" style={{ background: "var(--app-accent-wash)" }}>
                        Trading
                      </span>
                    )}
                    {isActive && (
                      <Check size={14} className="shrink-0 text-[var(--app-accent-text)]" aria-hidden />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs app-muted">
                    {describeSymbol(symbol)}
                  </span>
                </span>
                <QuoteCells
                  quote={quoteFor(symbol)}
                  precision={precisionFor(symbol)}
                  loading={loadingSymbols.includes(symbol)}
                />
              </button>
            );
          })}

          {/* A divider needs content on both sides: when a search hides every
              session pair, the catalogue rows stand alone with their own Add. */}
          {available.length > 0 && attached.length > 0 && (
            <div className="relative my-3 flex items-center justify-center">
              <span className="absolute inset-x-3 top-1/2 h-px bg-[var(--app-border)]" aria-hidden />
              <span className="relative inline-flex items-center gap-2 rounded-full border app-border bg-[var(--app-panel-solid)] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] app-muted">
                {canAddSymbols ? (
                  <>
                    Add a symbol to this session
                    <ArrowDown size={12} aria-hidden />
                  </>
                ) : (
                  <>
                    <Lock size={11} aria-hidden />
                    More symbols on Pro
                  </>
                )}
              </span>
            </div>
          )}

          {available.map((item, index) => {
            const rowIndex = attached.length + index;
            const addable = item.enabled && canAddSymbols;
            return (
              <button
                key={item.symbol}
                type="button"
                data-testid={`symbol-row-${item.symbol}`}
                disabled={!addable || busy}
                onMouseEnter={() => setHighlight(rowIndex)}
                onClick={() => choose(item.symbol, false, item.enabled)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
                  highlight === rowIndex && addable ? "bg-[var(--app-panel-2)]" : ""
                } ${addable ? "" : "opacity-55"}`}
              >
                <SymbolBadge symbol={item.symbol} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-bold">
                    {item.symbol}
                  </span>
                  <span className="mt-0.5 block truncate text-xs app-muted">
                    {describeSymbol(item.symbol)}
                  </span>
                </span>
                {!item.enabled ? (
                  <span className="shrink-0 text-[11px] app-muted">No data</span>
                ) : (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      addable
                        ? "border-brand-400/40 text-[var(--app-accent-text)] group-hover:border-brand-400/70"
                        : "app-border app-muted"
                    }`}
                  >
                    {busy ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : addable ? (
                      <Plus size={12} aria-hidden />
                    ) : (
                      <Lock size={11} aria-hidden />
                    )}
                    Add
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <p
            role="alert"
            className="shrink-0 border-t border-bear/25 bg-bear/10 px-5 py-2.5 text-xs text-bear sm:px-6"
          >
            {error}
          </p>
        )}

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t app-border bg-[var(--app-panel-2)]/60 px-5 py-3 sm:px-6">
          {canAddSymbols ? (
            <p className="text-[11px] app-muted">
              <kbd className="rounded border app-border px-1.5 py-0.5 font-sans">↑↓</kbd>{" "}
              to move,{" "}
              <kbd className="rounded border app-border px-1.5 py-0.5 font-sans">Enter</kbd>{" "}
              to choose. Prices follow the replay clock.
            </p>
          ) : (
            <>
              <p className="flex min-w-0 items-center gap-2 text-xs">
                <Lock size={14} className="shrink-0 app-muted" aria-hidden />
                <span className="truncate app-muted">
                  Chart several symbols in one session with Pro.
                </span>
              </p>
              <Link
                href="/pricing?from=symbol-picker"
                className="btn-primary shrink-0 px-3.5 py-2 text-xs"
              >
                <Sparkles size={14} aria-hidden />
                Upgrade plan
              </Link>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
