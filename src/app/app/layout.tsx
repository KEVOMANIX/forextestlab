import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppFooter } from "@/components/app/AppFooter";
import { AppNav } from "@/components/app/AppNav";
import { DeploymentRefresh } from "@/components/app/DeploymentRefresh";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { THEME_COOKIE, isAppTheme } from "@/lib/ui/app-theme";
import { getCurrentUser } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Backtester",
  description:
    "Run simulated forex backtests with historical market replay, execution tools, and performance reporting.",
  alternates: { canonical: "/app" },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const displayName = [
    user?.user_metadata?.display_name,
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
  ].find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() ?? null;
  const storedTheme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <AppThemeProvider initialTheme={isAppTheme(storedTheme) ? storedTheme : null}>
      <DeploymentRefresh />
      <AppNav signedIn={Boolean(user)} displayName={displayName} admin={isAdminUser(user)} />
      <main id="main" className="min-h-[calc(100dvh-3.5rem)]">
        {children}
      </main>
      <AppFooter />
    </AppThemeProvider>
  );
}
