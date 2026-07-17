"use client";

import Link from "next/link";
import {
  BarChart3,
  ArrowLeft,
  BookOpenText,
  LayoutDashboard,
  LogOut,
  Minus,
  Moon,
  MousePointer2,
  RotateCcw,
  Save,
  Loader2,
  CloudOff,
  Sun,
  Target,
  Trash2,
} from "lucide-react";

import type { PublicSessionState } from "@/lib/backtest/types";

function RailButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${
        active
          ? "bg-brand-500 text-surface-950"
          : "app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
      }`}
    >
      {children}
    </button>
  );
}

export function TerminalTopBar({
  state,
  theme,
  onToggleTheme,
  onNewSession,
  activeSymbol,
  onSwitchPair,
  saveStatus,
  onNavigate,
  onRetrySave,
  children,
}: {
  state: PublicSessionState;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onNewSession: () => void;
  activeSymbol: string;
  onSwitchPair: (symbol: string) => void;
  saveStatus: "saved" | "saving" | "error";
  onNavigate: (href: string) => void;
  onRetrySave: () => void;
  children: React.ReactNode;
}) {
  const symbols = state.config.symbols?.length
    ? state.config.symbols
    : [state.config.symbol];
  return (
    <header aria-label="Trading header" className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b app-border bg-[var(--app-panel)] px-2 shadow-sm">
      <Link
        href="/app"
        aria-label="Back to dashboard"
        onClick={(event) => {
          event.preventDefault();
          onNavigate("/app");
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold hover:bg-[var(--app-panel-2)] sm:px-2"
      >
        <ArrowLeft size={14} aria-hidden />
        <span className="hidden max-w-52 truncate sm:inline">
          {state.config.name || "Backtest workspace"}
        </span>
        <span className="sm:hidden">Back</span>
      </Link>
      <span className="h-5 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />
      <div className="flex shrink-0 items-center gap-1">
        <label className="sr-only" htmlFor="terminal-pair">Chart pair</label>
        <select
          id="terminal-pair"
          value={activeSymbol}
          onChange={(event) => onSwitchPair(event.target.value)}
          className="h-8 rounded-md border app-border bg-[var(--app-panel-2)] px-2 font-mono text-xs font-bold outline-none"
        >
          {symbols.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
            </option>
          ))}
        </select>
      </div>

      <span className="h-5 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />
      {children}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={saveStatus === "error" ? onRetrySave : undefined}
          disabled={saveStatus !== "error"}
          className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-[10px] ${
            saveStatus === "error" ? "text-bear" : "app-muted"
          }`}
          aria-live="polite"
        >
          {saveStatus === "saving" ? (
            <Loader2 size={12} className="animate-spin" aria-hidden />
          ) : saveStatus === "error" ? (
            <CloudOff size={12} aria-hidden />
          ) : (
            <Save size={12} aria-hidden />
          )}
          <span className="hidden xl:inline">
            {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Retry save" : "Saved"}
          </span>
        </button>
        <button
          type="button"
          onClick={onNewSession}
          aria-label="New session"
          title="New session"
          className="grid h-8 w-8 place-items-center rounded-md border app-border app-muted hover:text-brand-300"
        >
          <RotateCcw size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          className="grid h-8 w-8 place-items-center rounded-md border app-border app-muted hover:text-brand-300"
        >
          {theme === "dark" ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
        </button>
      </div>
    </header>
  );
}

export function TerminalLeftRail({
  hasStop,
  hasTarget,
  onToggleStop,
  onToggleTarget,
  onClearProtection,
}: {
  hasStop: boolean;
  hasTarget: boolean;
  onToggleStop: () => void;
  onToggleTarget: () => void;
  onClearProtection: () => void;
}) {
  return (
    <aside
      aria-label="Chart drawing tools"
      className="hidden w-11 shrink-0 flex-col items-center gap-1 border-r app-border bg-[var(--app-panel)] py-2 sm:flex"
    >
      <RailButton label="Pointer tool" active>
        <MousePointer2 size={17} aria-hidden />
      </RailButton>
      <span className="my-1 h-px w-6 bg-[var(--app-border)]" aria-hidden />
      <RailButton label="Toggle stop-loss from tool rail" active={hasStop} onClick={onToggleStop}>
        <Minus size={17} aria-hidden />
      </RailButton>
      <RailButton label="Toggle take-profit from tool rail" active={hasTarget} onClick={onToggleTarget}>
        <Target size={17} aria-hidden />
      </RailButton>
      <RailButton label="Clear protection lines" onClick={onClearProtection}>
        <Trash2 size={16} aria-hidden />
      </RailButton>
    </aside>
  );
}

export function TerminalRightRail({
  state,
  onNewSession,
  onNavigate,
}: {
  state: PublicSessionState;
  onNewSession: () => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <aside
      aria-label="Workspace shortcuts"
      className="hidden w-11 shrink-0 flex-col items-center gap-1 border-l app-border bg-[var(--app-panel)] py-2 md:flex"
    >
      <Link
        href="/app"
        onClick={(event) => {
          event.preventDefault();
          onNavigate("/app");
        }}
        aria-label="Dashboard"
        title="Dashboard"
        className="grid h-9 w-9 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
      >
        <LayoutDashboard size={17} aria-hidden />
      </Link>
      <Link
        href="/app/history"
        onClick={(event) => {
          event.preventDefault();
          onNavigate("/app/history");
        }}
        aria-label="Session history"
        title="Session history"
        className="grid h-9 w-9 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
      >
        <BookOpenText size={17} aria-hidden />
      </Link>
      {!state.anonymous && (
        <Link
          href={`/app/results/${state.sessionId}`}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(`/app/results/${state.sessionId}`);
          }}
          aria-label="Session analytics"
          title="Session analytics"
          className="grid h-9 w-9 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
        >
          <BarChart3 size={17} aria-hidden />
        </Link>
      )}
      <span className="my-1 h-px w-6 bg-[var(--app-border)]" aria-hidden />
      <RailButton label="Exit to session setup" onClick={onNewSession}>
        <LogOut size={17} aria-hidden />
      </RailButton>
    </aside>
  );
}
