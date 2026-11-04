import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppFooter } from "@/components/app/AppFooter";
import { AppNav } from "@/components/app/AppNav";
import { DeploymentRefresh } from "@/components/app/DeploymentRefresh";
import { HiddenOnFullScreen } from "@/components/app/HiddenOnFullScreen";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { THEME_COOKIE, isAppTheme } from "@/lib/ui/app-theme";
import { NAV_COLLAPSED_COOKIE } from "@/lib/ui/nav";
import { getCurrentUser } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { freePreviewActive } from "@/lib/billing/plan-preview";
import { freePlanSummary } from "@/lib/billing/entitlements";
import { setPlanPreview } from "@/app/admin/actions";

export const metadata: Metadata = {
  title: "Backtester",
  robots: { index: false, follow: false },
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
  const cookieStore = await cookies();
  const storedTheme = cookieStore.get(THEME_COOKIE)?.value;
  const navCollapsed = cookieStore.get(NAV_COLLAPSED_COOKIE)?.value === "1";
  const [previewFree, freePlan] = user ? await Promise.all([freePreviewActive(user.id), freePlanSummary(user.id)]) : [false, null];
  return (
    <AppThemeProvider initialTheme={isAppTheme(storedTheme) ? storedTheme : null}>
      <DeploymentRefresh />
      <div className="min-h-dvh lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
        <AppNav signedIn={Boolean(user)} displayName={displayName} admin={isAdminUser(user)} freePlan={freePlan} initialCollapsed={navCollapsed} />
        <div className="min-w-0 lg:col-start-2">
          <main id="main" className="min-h-[calc(100dvh-4rem)]">
            {previewFree && (
              <form action={setPlanPreview} className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-[var(--app-text)]">
                <span><strong>Free plan preview.</strong> You&apos;re seeing the app as a Free account does. Only your account is affected.</span>
                <input type="hidden" name="mode" value="off" />
                <input type="hidden" name="returnTo" value="/admin" />
                <button type="submit" className="rounded-md border border-amber-400/50 px-2.5 py-1 font-semibold hover:bg-amber-400/15">Exit preview</button>
              </form>
            )}
            {children}
          </main>
          <HiddenOnFullScreen><AppFooter /></HiddenOnFullScreen>
        </div>
      </div>
    </AppThemeProvider>
  );
}
