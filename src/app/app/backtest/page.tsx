import type { Metadata } from "next";

import { Backtester } from "@/components/app/Backtester";
import { ensureUserProfile } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import type { PlanEntitlements } from "@/lib/billing/entitlement-types";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Backtester",
  description:
    "Run a simulated forex backtest with historical market replay and execution tools.",
  alternates: { canonical: "/app/backtest" },
};

const DEMO_ENTITLEMENTS: PlanEntitlements = {
  plan: "free",
  maxSavedSessions: 1,
  maxSessionDays: 31,
  maxPairsPerSession: 1,
  maxReplaySpeed: 1200,
  fullAnalytics: false,
  csvExports: false,
  freeSessionUsed: false,
};

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: { session?: string };
}) {
  const user = await getCurrentUser();
  if (user) await ensureUserProfile(user);
  const entitlements = user
    ? await getUserEntitlements(user.id)
    : DEMO_ENTITLEMENTS;
  const resumeSessionId =
    typeof searchParams.session === "string" && searchParams.session.length <= 100
      ? searchParams.session
      : null;
  return <Backtester resumeSessionId={resumeSessionId} entitlements={entitlements} />;
}
