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
  Settings,
  Loader2,
  CloudOff,
  Sun,
  Target,
  Trash2,
} from "lucide-react";

import type { PublicSessionState } from "@/lib/backtest/types";
import logoMark from "../../../public/logo-mark.png";
import logoMarkLight from "../../../public/logo-mark-light.png";

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
  saveStatus,
  onNavigate,
  onRetrySave,
  endControls,
  tradeControls,
  children,
}: {
  state: PublicSessionState;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onNewSession: () => void;
  saveStatus: "saved" | "saving" | "error";
  onNavigate: (href: string) => void;
  onRetrySave: () => void;
  /** Controls that must stay pinned at the far-right end of the trading header. */
  endControls?: React.ReactNode;
  /**
   * Trading actions, seated after the chart controls in the middle of the bar.
   * They sit there rather than beside the session menu because the header reads
   * left to right as "which session → what am I looking at → what am I doing".
   */
  tradeControls?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const saveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "error"
        ? "Save failed — retry"
        : "Saved";

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
        <Image
          src={theme === "light" ? logoMarkLight : logoMark}
          alt=""
          data-testid="terminal-logo-mark"
          className="h-6 w-6 object-contain"
          priority
        />
      </button>

      <span className="h-6 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className={`inline-flex h-8 max-w-24 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors sm:max-w-48 lg:max-w-56 ${
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

      <span className="hidden h-6 w-px shrink-0 bg-[var(--app-border)] md:block" aria-hidden />
      {/* `min-w-0` lets the chart controls shrink (their timeframe row scrolls
          internally) so the cluster on the right is never pushed off the edge.
          The trade actions follow them, so the order is timeframes, chart type,
          indicators, then what to do about any of it. */}
      <div className="flex min-w-0 flex-1 items-center">
        {children}
        {tradeControls && (
          <>
            <span className="mx-1.5 h-6 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />
            <div className="flex shrink-0 items-center gap-1">{tradeControls}</div>
          </>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5 border-l app-border pl-1.5">
        {endControls}
        <button
          type="button"
          onClick={saveStatus === "error" ? onRetrySave : undefined}
          disabled={saveStatus !== "error"}
          title={saveLabel}
          className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${
            saveStatus === "error"
              ? "border border-bear/40 bg-bear/10 text-bear hover:bg-bear/20"
              : "app-muted hover:bg-[var(--app-panel-2)]"
          }`}
        >
          {saveStatus === "saving" ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : saveStatus === "error" ? (
            <CloudOff size={13} aria-hidden />
          ) : (
            <Save size={13} aria-hidden />
          )}
          {/* A failed save always shows its label — losing work is not something
              to communicate with a 13px icon. Success stays icon-only when narrow. */}
          <span className={saveStatus === "error" ? "inline" : "hidden lg:inline"}>
            {saveLabel}
          </span>
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {saveLabel}
        </span>
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
  onOpenSettings,
}: {
  state: PublicSessionState;
  onNewSession: () => void;
  onNavigate: (href: string) => void;
  /** Opens the session's settings dialog. */
  onOpenSettings: () => void;
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
      {/*
        Settings live on the rail rather than in the header. The header is read
        while trading and every pixel of it competes with the chart controls;
        settings are opened between decisions, not during one, so the rail — which
        already holds the other "leave what you are doing" actions — is where it
        belongs.
      */}
      <RailButton label="Settings" onClick={onOpenSettings}>
        <Settings size={17} aria-hidden />
      </RailButton>
      <span className="my-1 h-px w-6 bg-[var(--app-border)]" aria-hidden />
      <RailButton label="Exit to session setup" onClick={onNewSession}>
        <LogOut size={17} aria-hidden />
      </RailButton>
    </aside>
  );
}
