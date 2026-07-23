"use client";

import Link from "next/link";
import { Loader2, LogIn, LogOut, Moon, Sun } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useAppTheme } from "./ThemeContext";

const LINKS = [
  { label: "Dashboard", href: "/app" },
  { label: "Backtester", href: "/app/backtest" },
  { label: "Sessions", href: "/app/history" },
  { label: "Pricing", href: "/pricing" },
];

function initials(displayName: string | null): string {
  if (!displayName) return "FT";
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "FT";
}

export function AppNav({
  signedIn,
  displayName,
}: {
  signedIn: boolean;
  displayName: string | null;
}) {
  const { theme, toggle } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase || signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

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
              aria-current={
                pathname === l.href ||
                (l.href !== "/app" && pathname.startsWith(`${l.href}/`))
                  ? "page"
                  : undefined
              }
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                pathname === l.href ||
                (l.href !== "/app" && pathname.startsWith(`${l.href}/`))
                  ? "bg-brand-400/10 text-brand-300"
                  : "app-muted hover:text-brand-300"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={signedIn ? "/account" : "/sign-in"}
            aria-label={signedIn ? "Open profile" : "Sign in"}
            title={signedIn ? "Profile" : "Sign in"}
            className={
              signedIn
                ? "group relative grid h-9 w-9 place-items-center rounded-full border border-brand-400/25 bg-gradient-to-br from-brand-400/20 to-brand-500/[0.04] text-[11px] font-bold text-brand-200 shadow-sm transition-all hover:border-brand-400/60 hover:shadow-glow"
                : "inline-flex h-9 items-center gap-2 rounded-lg border app-border px-3 text-xs app-muted hover:text-brand-300"
            }
          >
            {signedIn ? (
              <>
                <span aria-hidden>{initials(displayName)}</span>
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--app-bg)] bg-brand-400" aria-hidden />
              </>
            ) : (
              <>
                <LogIn size={15} aria-hidden />
                <span className="hidden sm:inline">Sign in</span>
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border app-border"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </button>
          {signedIn && (
            <div className="ml-1 border-l app-border pl-2">
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border app-border app-muted transition-colors hover:border-bear/35 hover:bg-bear/[0.06] hover:text-bear disabled:opacity-50"
              >
                {signingOut ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                ) : (
                  <LogOut size={15} aria-hidden />
                )}
              </button>
            </div>
          )}
        </div>
      </nav>
      <nav
        className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto border-t app-border px-3 py-1.5 md:hidden"
        aria-label="Mobile workspace"
      >
        {LINKS.map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== "/app" && pathname.startsWith(`${link.href}/`));
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
                active
                  ? "bg-brand-400/10 text-brand-300"
                  : "app-muted hover:text-brand-300"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
