import type { Metadata } from "next";
import { Headphones, LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/Logo";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { requireSupportAgent } from "@/lib/support";

export const metadata: Metadata = {
  title: "Support team",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SupportTeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { agent } = await requireSupportAgent();
  return (
    <AppThemeProvider>
      <div className="app-shell min-h-[100dvh]">
        <header className="flex h-16 items-center gap-4 border-b app-border bg-[var(--app-panel)] px-4 sm:px-6">
          <Logo className="h-7" />
          <span className="h-6 w-px bg-[var(--app-border)]" />
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Headphones size={16} className="text-brand-300" />
            Support team
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs app-muted sm:inline">
              {agent.displayName} · {agent.role}
            </span>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-lg border app-border px-3 py-2 text-xs font-semibold app-muted hover:text-[var(--app-text)]"
            >
              <LayoutDashboard size={14} /> Admin
            </Link>
          </div>
        </header>
        {children}
      </div>
    </AppThemeProvider>
  );
}
