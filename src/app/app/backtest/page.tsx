import type { Metadata } from "next";

import { BacktesterClient } from "@/components/app/BacktesterClient";
import { ensureUserProfile } from "@/lib/auth";
import { parseChallengeStart } from "@/lib/backtest/challenge-record";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import type { PlanEntitlements } from "@/lib/billing/entitlement-types";
import { FREE_MAX_REPLAY_SPEED, FREE_SESSION_DAYS, FREE_SYMBOLS } from "@/lib/billing/plan-limits";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Backtester",
  description:
    "Run a simulated forex backtest with historical market replay and execution tools.",
  alternates: { canonical: "/app/backtest" },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * A signed-out visitor sees the Free limits on sample data. Their sessions are
 * not saved (they expire after a day), so no monthly allowance is counted.
 */
const DEMO_ENTITLEMENTS: PlanEntitlements = {
  plan: "free",
  trialEndsAt: null,
  monthlySessions: null,
  allowedSymbols: FREE_SYMBOLS,
  maxSessionDays: FREE_SESSION_DAYS,
  maxPairsPerSession: 1,
  maxReplaySpeed: FREE_MAX_REPLAY_SPEED,
  fullAnalytics: false,
  exports: false,
  propFirmChallenges: false,
};

export default async function BacktestPage(
  props: {
    searchParams: Promise<{ session?: string; market?: string; mode?: string; phase?: string; size?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (user) await ensureUserProfile(user);
  const entitlements = user ? await getUserEntitlements(user.id) : DEMO_ENTITLEMENTS;
  const resumeSessionId =
    typeof searchParams.session === "string" && searchParams.session.length <= 100
      ? searchParams.session
      : null;
  return (
    <BacktesterClient
      resumeSessionId={resumeSessionId}
      initialMarket={typeof searchParams.market === "string" ? searchParams.market : null}
      initialChallenge={parseChallengeStart(searchParams)}
      entitlements={entitlements}
    />
  );
}
