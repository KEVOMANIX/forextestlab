import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppFooter } from "@/components/app/AppFooter";
import { AppNav } from "@/components/app/AppNav";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { getCurrentUser } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { freePlanSummary } from "@/lib/billing/entitlements";
import { NAV_COLLAPSED_COOKIE } from "@/lib/ui/nav";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const displayName = [
    user?.user_metadata?.display_name,
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
  ].find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() ?? null;
  const freePlan = user ? await freePlanSummary(user.id) : null;
  const navCollapsed = (await cookies()).get(NAV_COLLAPSED_COOKIE)?.value === "1";

  return (
    <AppThemeProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
        <AppNav signedIn={Boolean(user)} displayName={displayName} admin={isAdminUser(user)} freePlan={freePlan} initialCollapsed={navCollapsed} />
        <div className="min-w-0 lg:col-start-2">
          {children}
          <AppFooter />
        </div>
      </div>
    </AppThemeProvider>
  );
}
