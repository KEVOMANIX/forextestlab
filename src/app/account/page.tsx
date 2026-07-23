import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AccountActions } from "@/components/account/AccountActions";
import { ProfileDetailsForm } from "@/components/account/ProfileDetailsForm";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { BackLink } from "@/components/app/BackLink";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile", robots: { index: false } };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "FT";
}

function planName(value: string): string {
  const tier = value.split("_")[0] || "free";
  return `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  await ensureUserProfile(user);
  const profile = await prisma.userProfile.findUniqueOrThrow({
    where: { id: user.id },
    include: { _count: { select: { sessions: true } } },
  });
  const hasPro = ["active", "attention", "non-renewing"].includes(profile.billingStatus) || Boolean(profile.proAccessUntil && profile.proAccessUntil > new Date());
  const displayName = profile.displayName || user.email?.split("@")[0] || "ForexTestLab trader";
  const currentPlan = hasPro ? planName(profile.billingPlan) : "Free";
  const joined = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(profile.createdAt);
  const verified = Boolean(user.email_confirmed_at);

  return (
    <main id="main" className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden px-4 py-8 sm:py-10">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-80 w-[54rem] -translate-x-1/2 rounded-full bg-brand-500/[0.07] blur-3xl" />
      <div className="relative mx-auto max-w-6xl">
        <BackLink label="Back to dashboard" fallback="/app" />

        <section className="mt-6 overflow-hidden rounded-2xl border app-border bg-[var(--app-panel)]">
          <div className="relative px-5 py-7 sm:px-8 sm:py-9">
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/70 to-transparent" />
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-brand-400/25 bg-gradient-to-br from-brand-400/20 to-brand-500/5 text-xl font-bold text-brand-200 shadow-glow sm:h-20 sm:w-20 sm:text-2xl">
                  {initials(displayName)}
                  <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--app-panel)] bg-brand-500 text-surface-950">
                    <BadgeCheck size={14} aria-hidden />
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">Profile</p>
                    <span className="rounded-full border app-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider app-muted">
                      {currentPlan}
                    </span>
                  </div>
                  <h1 className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">{displayName}</h1>
                  <p className="mt-1.5 flex min-w-0 items-center gap-2 text-sm app-muted">
                    <Mail size={14} className="shrink-0" aria-hidden />
                    <span className="truncate">{user.email}</span>
                  </p>
                </div>
              </div>
              <Link href="/app" className="btn-primary h-11 shrink-0 px-5 py-2.5 text-xs">
                <LayoutDashboard size={16} aria-hidden />
                Open workspace
              </Link>
            </div>
          </div>

          <div className="grid border-t app-border sm:grid-cols-3">
            {[
              { label: "Current plan", value: currentPlan, icon: Sparkles },
              { label: "Saved sessions", value: String(profile._count.sessions), icon: CircleUserRound },
              { label: "Member since", value: joined, icon: CalendarDays },
            ].map(({ label, value, icon: Icon }, index) => (
              <div key={label} className={`flex items-center gap-3 px-5 py-4 sm:px-6 ${index > 0 ? "border-t app-border sm:border-l sm:border-t-0" : ""}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-400/10 text-brand-300">
                  <Icon size={16} aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] app-muted">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]">
          <section className="panel p-5 sm:p-7">
            <div className="mb-6 flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-brand-300">
                <CircleUserRound size={19} aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">Personal information</h2>
                <p className="mt-1 text-sm app-muted">Manage how your identity appears across your workspace.</p>
              </div>
            </div>
            <ProfileDetailsForm initialDisplayName={displayName} email={user.email ?? ""} />
          </section>

          <aside className="space-y-4">
            <section className="panel overflow-hidden">
              <div className="border-b app-border px-5 py-4">
                <h2 className="text-sm font-semibold">Account overview</h2>
              </div>
              <div className="divide-y divide-[var(--app-border)]">
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={17} className={verified ? "text-brand-300" : "app-muted"} aria-hidden />
                    <div><p className="text-sm font-medium">Email</p><p className="text-xs app-muted">{verified ? "Verified" : "Verification pending"}</p></div>
                  </div>
                  {verified && <BadgeCheck size={17} className="text-brand-300" aria-label="Verified" />}
                </div>
                <Link href="/account/billing" className="group flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-brand-400/[0.05]">
                  <div className="flex items-center gap-3">
                    <CreditCard size={17} className="text-brand-300" aria-hidden />
                    <div><p className="text-sm font-medium">Billing</p><p className="text-xs app-muted">{currentPlan} plan</p></div>
                  </div>
                  <ChevronRight size={16} className="app-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
                <Link href="/account/update-password" className="group flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-brand-400/[0.05]">
                  <div className="flex items-center gap-3">
                    <KeyRound size={17} className="text-brand-300" aria-hidden />
                    <div><p className="text-sm font-medium">Password</p><p className="text-xs app-muted">Security settings</p></div>
                  </div>
                  <ChevronRight size={16} className="app-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            </section>

            <section className="rounded-xl border border-brand-400/20 bg-brand-400/[0.06] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">Your plan</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div><p className="text-xl font-bold">{currentPlan}</p><p className="mt-1 text-xs app-muted">{hasPro ? "Paid workspace access is active." : "Core replay access."}</p></div>
                <Sparkles size={22} className="text-brand-300" aria-hidden />
              </div>
              <Link href="/account/billing" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-300 hover:text-brand-200">
                Manage subscription <ArrowRight size={14} aria-hidden />
              </Link>
            </section>
          </aside>
        </div>

        <section className="panel mt-6 p-5 sm:p-7">
          <div className="mb-5">
            <h2 className="font-semibold">Account management</h2>
            <p className="mt-1 text-sm app-muted">Control your active session or permanently remove your account.</p>
          </div>
          <AccountActions />
        </section>
      </div>
    </main>
  );
}
