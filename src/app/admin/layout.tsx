import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/AdminNav";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <AppThemeProvider>
      <div className="app-shell min-h-screen lg:flex">
        <AdminNav email={user.email ?? "Administrator"} />
        <main id="main" className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
            {children}
          </div>
        </main>
      </div>
    </AppThemeProvider>
  );
}

