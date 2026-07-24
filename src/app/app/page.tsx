import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  ChartNoAxesCombined,
  ShieldCheck,
} from "lucide-react";

import { SignedInDashboard } from "@/components/app/SignedInDashboard";
import { ensureUserProfile } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TRIAL_SIGN_UP_PATH } from "@/lib/site";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Backtesting dashboard",
  description:
    "Review private forex backtesting sessions, trading performance, and recent strategy-testing activity.",
  robots: { index: false, follow: false },
};

function SignedOutDashboard() {
  const previewCards = [
    {
      icon: ChartNoAxesCombined,
      label: "Session performance",
      text: "Track net P/L, win rate, expectancy, and drawdown across your tests.",
    },
    {
      icon: BookOpenCheck,
      label: "Private history",
      text: "Return to saved sessions, trade decisions, notes, and results.",
    },
    {
      icon: ShieldCheck,
      label: "Your workspace",
      text: "Account sessions are private and visible only to you.",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <section className="relative overflow-hidden rounded-3xl border border-brand-400/20 bg-[linear-gradient(135deg,rgba(34,195,160,0.13),rgba(17,23,37,0.7)_48%,rgba(59,107,255,0.08))] p-7 shadow-card sm:p-10">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl"
        />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
            <BarChart3 size={14} aria-hidden />
            Backtesting dashboard
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
            Turn every backtest into a clearer trading process.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed app-muted sm:text-lg">
            Save private sessions, resume replay, and review every decision from
            one focused workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={TRIAL_SIGN_UP_PATH} className="btn-primary shadow-glow">
              Start free trial <ArrowRight size={16} aria-hidden />
            </Link>
            <Link
              href="/sign-in?next=%2Faccount%2Fcontinue"
              className="btn-secondary"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
          Your testing record
        </p>
        <h2 className="mt-2 text-xl font-semibold">
          Everything needed to continue and review
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {previewCards.map(({ icon: Icon, label, text }) => (
            <article key={label} className="panel p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-5 font-semibold">{label}</h3>
              <p className="mt-2 text-sm leading-relaxed app-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function AppHome({
  searchParams,
}: {
  searchParams?: {
    performance?: string;
    session?: string;
  };
}) {
  const user = await getCurrentUser();
  if (!user) return <SignedOutDashboard />;

  await ensureUserProfile(user);
  const sessions = await prisma.backtestSession.findMany({
    where: { userId: user.id, anonymous: false },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const legacySelectedId = searchParams?.performance?.startsWith("session:")
    ? searchParams.performance.slice("session:".length)
    : null;
  const selectedId = searchParams?.session ?? legacySelectedId;

  const displayName =
    typeof user.user_metadata?.display_name === "string" &&
    user.user_metadata.display_name.trim()
      ? user.user_metadata.display_name.trim()
      : user.email?.split("@")[0] ?? "Trader";

  return (
    <SignedInDashboard
      sessions={sessions}
      displayName={displayName}
      selectedId={selectedId}
    />
  );
}
