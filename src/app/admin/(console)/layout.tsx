import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/AdminNav";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { requireAdmin } from "@/lib/admin";

import { setPlanPreview } from "../actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <AppThemeProvider>
      <div className="app-shell min-h-[100dvh] lg:flex">
        <AdminNav email={user.email ?? "Administrator"} />
        <main id="main" className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
            <form action={setPlanPreview} className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-sm">
              <span className="app-muted"><strong className="text-[var(--app-text)]">Preview the Free plan.</strong> See the app exactly as a Free account does: limits, 🔒 Pro locks and server checks. Only your account is affected.</span>
              <input type="hidden" name="mode" value="free" />
              <button type="submit" className="btn-secondary px-4 py-2 text-xs">View as Free</button>
            </form>
            {children}
          </div>
        </main>
      </div>
    </AppThemeProvider>
  );
}

