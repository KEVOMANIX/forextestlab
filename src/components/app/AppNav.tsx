"use client";

import Link from "next/link";
import { LogIn, Moon, Sun, UserRound } from "lucide-react";

import { Logo } from "@/components/Logo";
import { useAppTheme } from "./ThemeContext";

const LINKS = [
  { label: "Dashboard", href: "/app" },
  { label: "New backtest", href: "/app/backtest" },
  { label: "History", href: "/app/history" },
  { label: "Pricing", href: "/pricing" },
];

export function AppNav({ email }: { email: string | null }) {
  const { theme, toggle } = useAppTheme();
  return (
    <header className="sticky top-0 z-40 border-b app-border bg-[var(--app-bg)]/85 backdrop-blur">
      <nav
        className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4"
        aria-label="Backtester"
      >
        <Logo className="h-7" />

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

        <div className="flex items-center gap-2">
          <Link
            href={email ? "/account" : "/sign-in"}
            className="inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs app-muted hover:text-brand-300"
          >
            {email ? <UserRound size={15} aria-hidden /> : <LogIn size={15} aria-hidden />}
            <span className="hidden sm:inline">{email ?? "Sign in"}</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border app-border"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </button>
        </div>
      </nav>
    </header>
  );
}
