"use client";

import { Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export const SUPPORT_THEME_COOKIE = "ftl_support_theme";

/** Light/dark switch for the support inbox only; the trading app keeps its own setting. */
export function SupportThemeToggle({ theme }: { theme: "light" | "dark" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        document.cookie = `${SUPPORT_THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="grid h-8 w-8 place-items-center rounded-full app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)] disabled:opacity-60"
    >
      {theme === "light" ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
    </button>
  );
}
