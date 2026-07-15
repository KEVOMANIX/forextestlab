"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";

import { Logo } from "@/components/Logo";
import { useAppTheme } from "./ThemeContext";

const LINKS = [
  { label: "Backtester", href: "/app/backtest" },
  { label: "History", href: "/app/history" },
  { label: "About", href: "/about" },
  { label: "Risk Disclosure", href: "/risk-disclosure" },
  { label: "Contact", href: "/contact" },
];

export function BetaBadge() {
  return (
    <span className="rounded-full border border-brand-400/40 bg-brand-400/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-300">
      Public Beta
    </span>
  );
}

export function AppNav() {
  const { theme, toggle } = useAppTheme();
  return (
    <header className="sticky top-0 z-40 border-b app-border bg-[var(--app-bg)]/85 backdrop-blur">
      <nav
        className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4"
        aria-label="Backtester"
      >
        <div className="flex items-center gap-3">
          <Logo className="h-7" />
          <BetaBadge />
        </div>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium app-muted transition-colors hover:text-brand-300"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border app-border"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </button>
      </nav>
    </header>
  );
}
