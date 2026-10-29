import Link from "next/link";
import { CreditCard, Crown, Shield, UserRound } from "lucide-react";

import { ensureUserProfile, requireUser } from "@/lib/auth";
import { getUserEntitlements, hasProAccess } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";

export type AccountTab = "general" | "security" | "billing";

const TABS: { tab: AccountTab; label: string; href: string; icon: typeof UserRound }[] = [
  { tab: "general", label: "General", href: "/account", icon: UserRound },
  { tab: "security", label: "Security", href: "/account/update-password", icon: Shield },
  { tab: "billing", label: "Billing", href: "/account/billing", icon: CreditCard },
];

const ACCESS_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FT";
}

/** Where an account's Pro comes from, so a grant or pass still reads as Pro. */
export function planNote(profile: { billingStatus: string; proAccessUntil: Date | null }, pro: boolean, freeLimit: number | null): string {
  if (!pro) return freeLimit ? `${freeLimit} sessions a month on the major pairs.` : "Core replay access.";
  if (profile.billingStatus === "non-renewing") return profile.proAccessUntil ? `Pro until ${ACCESS_DATE.format(profile.proAccessUntil)}, not renewing.` : "Pro until the end of the paid term.";
  if (["active", "attention"].includes(profile.billingStatus)) return "Pro subscription is active.";
  if (profile.proAccessUntil && hasProAccess(profile)) return `Pro access granted until ${ACCESS_DATE.format(profile.proAccessUntil)}.`;
  return "Full access while billing is off.";
}

/** Signed-in user, profile and plan for the account tabs. */
export async function loadAccount(path: string) {
  const user = await requireUser(path);
  await ensureUserProfile(user);
  const [profile, entitlements] = await Promise.all([
    prisma.userProfile.findUniqueOrThrow({ where: { id: user.id }, include: { _count: { select: { sessions: true } } } }),
    getUserEntitlements(user.id),
  ]);
  // Entitlements decide Pro, so a grant, a pass or an admin's Free preview all show as the app treats them.
  const pro = entitlements.plan === "pro";
  const displayName = profile.displayName || user.email?.split("@")[0] || "ForexTestLab trader";
  return { user, profile, entitlements, pro, displayName, note: planNote(profile, pro, entitlements.monthlySessions?.limit ?? null) };
}

export type AccountData = Awaited<ReturnType<typeof loadAccount>>;

export function AccountShell({ account, tab, children }: { account: AccountData; tab: AccountTab; children: React.ReactNode }) {
  const { user, profile, pro, displayName } = account;
  const joined = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" }).format(profile.createdAt);
  return (
    <main id="main" className="min-h-[calc(100dvh-3.5rem)] px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center gap-5">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-2xl font-bold text-surface-950">
            {initials(displayName)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{displayName}</h1>
              {pro
                ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-sm font-bold text-amber-200"><Crown size={14} aria-hidden />Pro</span>
                : <span className="rounded-full bg-[var(--app-panel-2)] px-3 py-1 text-sm font-semibold">Free</span>}
            </div>
            <p className="mt-1 truncate text-base app-muted">{user.email}</p>
            <p className="mt-1 text-sm app-muted">Member since {joined} · {profile._count.sessions} saved {profile._count.sessions === 1 ? "session" : "sessions"}</p>
          </div>
        </header>

        <nav aria-label="Account" className="mt-8 flex gap-2 overflow-x-auto shadow-[inset_0_-1px_0_var(--app-border)] [scrollbar-width:none]">
          {TABS.map(({ tab: id, label, href, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              aria-current={id === tab ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-base font-medium transition-colors ${id === tab ? "border-brand-400 text-[var(--app-text)]" : "border-transparent app-muted hover:text-[var(--app-text)]"}`}
            >
              <Icon size={18} aria-hidden />{label}
            </Link>
          ))}
        </nav>

        <div className="mt-8 space-y-6">{children}</div>
      </div>
    </main>
  );
}

/** A tab card: title and description on top, content below. */
export function AccountCard({ title, description, children, footer }: { title: string; description?: string; children?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <div className="p-6 sm:p-8">
        <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm app-muted sm:text-base">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
      {footer && <div className="border-t app-border bg-[var(--app-panel-2)]/40 px-6 py-4 sm:px-8">{footer}</div>}
    </section>
  );
}
