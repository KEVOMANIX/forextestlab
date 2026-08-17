import Link from "next/link";
import { Headphones, LayoutDashboard, ShieldAlert } from "lucide-react";

import { AuthForm } from "@/components/auth/AuthForm";
import { Logo } from "@/components/Logo";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { SwitchAccountButton } from "@/components/staff/SwitchAccountButton";

const AREAS = {
  support: {
    label: "Support",
    icon: Headphones,
    eyebrow: "Support workspace",
    title: "Support team sign-in",
    description:
      "The shared inbox for customer conversations. Accounts are granted access by an administrator.",
    denied:
      "This account is not an active support agent. Ask an administrator to add it to the support team, or switch to an account that has access.",
    home: "/support-team",
  },
  admin: {
    label: "Admin",
    icon: LayoutDashboard,
    eyebrow: "Administration",
    title: "Administrator sign-in",
    description:
      "Operations, billing and market-data controls. Restricted to configured administrators.",
    denied:
      "This account is not a configured administrator. Administrator access is set on the server, not from inside the app.",
    home: "/admin",
  },
} as const;

export type StaffArea = keyof typeof AREAS;

/**
 * The staff entry point, for both halves of "you cannot come in".
 *
 * Previously an unauthorised visit to either area returned a bare 404, which is
 * indistinguishable from a broken link: a support agent whose account had not
 * been activated yet had no way to tell whether they were signed in as the
 * wrong person, not yet granted access, or looking at the wrong URL. This says
 * which, and offers the one action that helps.
 *
 * It is worth being clear about what this is not: the credentials are the same
 * Supabase accounts the app uses, so a separate URL grants nothing and blocks
 * nothing. What it buys is a correct destination after sign-in, staff-shaped
 * wording, no dead-end route to creating an account, and an honest answer when
 * access is missing. The pages are noindex, but they do confirm the area exists
 * to anyone already signed in — a trade for being comprehensible.
 */
export function StaffSignIn({
  area,
  nextPath,
  deniedFor,
}: {
  area: StaffArea;
  /** Where to land after a successful sign-in. */
  nextPath?: string;
  /** Set when the visitor is signed in but has no access here. */
  deniedFor?: string | null;
}) {
  const config = AREAS[area];
  const Icon = config.icon;

  return (
    <AppThemeProvider>
      <div className="app-shell grid min-h-[100dvh] place-items-center bg-[var(--app-bg)] px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-3">
            <Logo className="h-7" />
            <span className="h-5 w-px bg-[var(--app-border)]" />
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] app-muted">
              <Icon size={13} aria-hidden /> {config.label}
            </span>
          </div>

          {deniedFor ? (
            <div className="panel p-7 text-center sm:p-9">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-amber-300/10 text-amber-200">
                <ShieldAlert size={22} aria-hidden />
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">
                No {config.label.toLowerCase()} access
              </h1>
              <p className="mt-3 text-sm leading-6 app-muted">{config.denied}</p>
              <p className="mt-4 rounded-lg bg-[var(--app-panel-2)] px-3 py-2 font-mono text-xs app-muted">
                Signed in as {deniedFor}
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <SwitchAccountButton returnTo={`/${area === "admin" ? "admin" : "support-team"}/sign-in`} />
                <Link
                  href="/app"
                  className="inline-flex h-10 items-center justify-center rounded-lg border app-border px-4 text-sm font-semibold app-muted transition-colors hover:bg-white/[0.05] hover:text-[var(--app-text)]"
                >
                  Go to the app
                </Link>
              </div>
            </div>
          ) : (
            <AuthForm
              mode="sign-in"
              nextPath={nextPath ?? config.home}
              staffCopy={{
                eyebrow: config.eyebrow,
                title: config.title,
                description: config.description,
              }}
            />
          )}
        </div>
      </div>
    </AppThemeProvider>
  );
}
