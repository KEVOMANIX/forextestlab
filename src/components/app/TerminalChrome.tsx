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
  Sun,
  Target,
  Trash2,
} from "lucide-react";

import { Logo } from "@/components/Logo";
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
}: {
  state: PublicSessionState;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onNewSession: () => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b app-border bg-[var(--app-panel)] px-2">
      <div className="hidden shrink-0 sm:block">
        <Logo className="h-5" />
      </div>
      <span className="hidden h-5 w-px shrink-0 bg-[var(--app-border)] sm:block" aria-hidden />
      <Link
        href="/app"
        aria-label="Back to dashboard"
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
        <span className="rounded-md border app-border bg-[var(--app-panel-2)] px-2 py-1 font-mono text-xs font-bold">
          {state.config.symbol}
        </span>
        {(state.config.symbols?.length ?? 1) > 1 && (
          <span className="rounded-md border app-border bg-[var(--app-panel-2)] px-2 py-1 text-[10px] font-semibold text-brand-300">
            +{(state.config.symbols?.length ?? 1) - 1} pairs
          </span>
        )}
        {state.demoData && (
          <span className="rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-300">
            DEMO
          </span>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!state.anonymous && (
          <Link
            href={`/app/results/${state.sessionId}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border app-border px-2.5 text-xs font-semibold hover:border-brand-400/40"
          >
            <BarChart3 size={14} aria-hidden />
            Analytics
          </Link>
        )}
        <button
          type="button"
          onClick={onNewSession}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500"
        >
          <RotateCcw size={14} aria-hidden />
          <span className="hidden sm:inline">New session</span>
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
}: {
  state: PublicSessionState;
  onNewSession: () => void;
}) {
  return (
    <aside
      aria-label="Workspace shortcuts"
      className="hidden w-11 shrink-0 flex-col items-center gap-1 border-l app-border bg-[var(--app-panel)] py-2 md:flex"
    >
      <Link
        href="/app"
        aria-label="Dashboard"
        title="Dashboard"
        className="grid h-9 w-9 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
      >
        <LayoutDashboard size={17} aria-hidden />
      </Link>
      <Link
        href="/app/history"
        aria-label="Session history"
        title="Session history"
        className="grid h-9 w-9 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
      >
        <BookOpenText size={17} aria-hidden />
      </Link>
      {!state.anonymous && (
        <Link
          href={`/app/results/${state.sessionId}`}
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
