"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type MarketingTheme = "light" | "dark";
const STORAGE_KEY = "forextestlab-marketing-theme";

function applyTheme(theme: MarketingTheme) {
  document.querySelectorAll<HTMLElement>(".marketing-site").forEach((site) => {
    site.classList.toggle("marketing-light", theme === "light");
  });
}

/** Visitor-controlled theme for public marketing pages. */
export function MarketingThemeToggle({ mobile = false }: { mobile?: boolean }) {
  const [theme, setTheme] = useState<MarketingTheme>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial: MarketingTheme = saved === "dark" ? "dark" : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      className={mobile
        ? "mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/5"
        : "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white"}
    >
      {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
      {mobile && <span>{dark ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
