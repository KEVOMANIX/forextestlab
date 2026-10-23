import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppFooter } from "@/components/app/AppFooter";
import { AppNav } from "@/components/app/AppNav";
import { DeploymentRefresh } from "@/components/app/DeploymentRefresh";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { THEME_COOKIE, isAppTheme } from "@/lib/ui/app-theme";
import { getCurrentUser } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { freePreviewActive } from "@/lib/billing/plan-preview";
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
  const storedTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const previewFree = user ? await freePreviewActive(user.id) : false;
  return (
    <AppThemeProvider initialTheme={isAppTheme(storedTheme) ? storedTheme : null}>
      <DeploymentRefresh />
      <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <AppNav signedIn={Boolean(user)} displayName={displayName} admin={isAdminUser(user)} />
        <div className="min-w-0 lg:col-start-2">
          <main id="main" className="min-h-[calc(100dvh-4rem)]">
            {previewFree && (
              <form action={setPlanPreview} className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs text-amber-100">
                <span><strong>Free plan preview.</strong> You&apos;re seeing the app as a Free account does. Only your account is affected.</span>
                <input type="hidden" name="mode" value="off" />
                <input type="hidden" name="returnTo" value="/app" />
                <button type="submit" className="rounded-md border border-amber-200/40 px-2.5 py-1 font-semibold hover:bg-amber-200/10">Exit preview</button>
              </form>
            )}
            {children}
          </main>
          <AppFooter />
        </div>
      </div>
    </AppThemeProvider>
  );
}
