import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { initials } from "@/components/support/team/format";
import { requireSupportAgent } from "@/lib/support";

export const metadata: Metadata = {
  title: "Support team",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The workspace owns the viewport: the shell never scrolls, so the queue rail,
 * conversation list and thread each scroll independently and the reply
 * composer stays on screen.
 */
export default async function SupportTeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { agent } = await requireSupportAgent();
  return (
    <AppThemeProvider>
      <div className="app-shell flex h-[100dvh] flex-col overflow-hidden bg-[var(--app-bg)]">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b app-border bg-[var(--app-panel)] px-4 sm:px-5">
          <Logo className="h-7" />
          <span className="h-5 w-px bg-[var(--app-border)]" />
          <span className="text-sm font-semibold">Support</span>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/admin"
              aria-label="Admin"
              className="grid h-8 w-8 place-items-center rounded-lg app-muted transition-colors hover:bg-white/[0.06] hover:text-[var(--app-text)] lg:hidden"
            >
              <LayoutDashboard size={15} aria-hidden />
            </Link>
            <span className="hidden text-xs app-muted sm:inline">
              {agent.displayName}
            </span>
            <span
              title={`${agent.displayName} · ${agent.role}`}
              className="grid h-8 w-8 place-items-center rounded-full bg-brand-400/15 text-[11px] font-semibold text-brand-200"
            >
              {initials(agent.displayName)}
            </span>
          </div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </AppThemeProvider>
  );
}
