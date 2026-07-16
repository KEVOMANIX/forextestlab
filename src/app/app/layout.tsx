import type { Metadata } from "next";

import { AppFooter } from "@/components/app/AppFooter";
import { AppNav } from "@/components/app/AppNav";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Backtester (Public Beta)",
  description:
    "Run a real simulated forex backtest in the browser — historical market replay, simulated execution, risk tools, and performance reporting. Public beta.",
  alternates: { canonical: "/app" },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <AppThemeProvider>
      <AppNav email={user?.email ?? null} />
      <main id="main" className="min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
      <AppFooter />
    </AppThemeProvider>
  );
}
