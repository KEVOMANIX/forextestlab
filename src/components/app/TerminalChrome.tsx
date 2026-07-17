"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BookOpenText,
  ChevronDown,
  Expand,
  FolderOpen,
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
import logoMark from "../../../public/logo-mark.png";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const symbols = state.config.symbols?.length
    ? state.config.symbols
    : [state.config.symbol];

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const navigate = (href: string) => {
    setMenuOpen(false);
    onNavigate(href);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen can be blocked by browser or device policy.
    }
  };

  return (
    <header
      aria-label="Trading header"
      className="relative flex h-11 shrink-0 items-center gap-1.5 border-b app-border bg-[var(--app-panel)] px-1.5 shadow-[0_1px_0_rgba(255,255,255,0.03)]"
    >
      <button
        type="button"
        onClick={() => navigate("/app")}
        aria-label="Back to dashboard"
        title="Dashboard"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-[var(--app-panel-2)]"
      >
        <Image src={logoMark} alt="" className="h-6 w-6 object-contain" priority />
      </button>

      <span className="h-6 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className={`inline-flex h-8 max-w-28 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors sm:max-w-48 lg:max-w-56 ${
            menuOpen
              ? "border-brand-400/40 bg-brand-400/10 text-brand-300"
              : "app-border bg-[var(--app-panel-2)] hover:border-brand-400/25"
          }`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <FolderOpen size={14} className="shrink-0 app-muted" aria-hidden />
          <span className="truncate">{state.config.name || "Backtest session"}</span>
          <ChevronDown
            size={13}
            className={`shrink-0 app-muted transition-transform ${menuOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full z-[120] mt-1.5 w-64 overflow-hidden rounded-xl border app-border bg-[var(--app-panel)] p-1.5 shadow-2xl backdrop-blur-xl"
          >
            <p className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] app-muted">
              Session
            </p>
            <button type="button" role="menuitem" onClick={() => navigate("/app")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[var(--app-panel-2)]">
              <LayoutDashboard size={15} className="app-muted" aria-hidden /> Dashboard
            </button>
            <button type="button" role="menuitem" onClick={() => navigate("/app/history")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[var(--app-panel-2)]">
              <BookOpenText size={15} className="app-muted" aria-hidden /> Sessions
            </button>
            {!state.anonymous && (
              <button type="button" role="menuitem" onClick={() => navigate(`/app/results/${state.sessionId}`)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[var(--app-panel-2)]">
                <BarChart3 size={15} className="app-muted" aria-hidden /> Analytics
              </button>
            )}
            <div className="my-1 h-px bg-[var(--app-border)]" />
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onNewSession(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-brand-300 hover:bg-brand-400/10">
              <RotateCcw size={15} aria-hidden /> New session
            </button>
          </div>
        )}
      </div>

      <span className="h-6 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />
      <div className="flex shrink-0 items-center gap-1">
        <label className="sr-only" htmlFor="terminal-pair">Chart pair</label>
        <select
          id="terminal-pair"
          value={activeSymbol}
          onChange={(event) => onSwitchPair(event.target.value)}
          className="h-8 rounded-md border app-border bg-[var(--app-panel-2)] px-2.5 font-mono text-xs font-bold outline-none hover:border-brand-400/25"
        >
          {symbols.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
            </option>
          ))}
        </select>
      </div>

      <span className="h-6 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />
      {children}

      <div className="ml-auto flex shrink-0 items-center gap-0.5 border-l app-border pl-1.5">
        <button
          type="button"
          onClick={saveStatus === "error" ? onRetrySave : undefined}
          disabled={saveStatus !== "error"}
          className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-[10px] hover:bg-[var(--app-panel-2)] ${
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
          className="hidden h-8 w-8 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300 lg:grid"
        >
          <RotateCcw size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
          title="Fullscreen"
          className="hidden h-8 w-8 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300 sm:grid"
        >
          <Expand size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          className="grid h-8 w-8 place-items-center rounded-md app-muted hover:bg-[var(--app-panel-2)] hover:text-brand-300"
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
