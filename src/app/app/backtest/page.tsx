import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Backtester } from "@/components/app/Backtester";
import { ensureUserProfile } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import type { PlanEntitlements } from "@/lib/billing/entitlement-types";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  TRIAL_DEVICE_COOKIE,
  trialDeviceIdFromToken,
} from "@/lib/trial-device";

export const metadata: Metadata = {
  title: "Backtester",
  description:
    "Run a simulated forex backtest with historical market replay and execution tools.",
  alternates: { canonical: "/app/backtest" },
};

const DEMO_ENTITLEMENTS: PlanEntitlements = {
  plan: "free",
  maxSavedSessions: 3,
  maxSessionDays: 31,
  maxPairsPerSession: 1,
  maxReplaySpeed: 1200,
  fullAnalytics: false,
  csvExports: false,
  trialSessionsRemaining: 3,
  freeSessionUsed: false,
};

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: { session?: string; trial?: string };
}) {
  const user = await getCurrentUser();
  if (user) await ensureUserProfile(user);
  const entitlements = user
    ? await getUserEntitlements(
        user.id,
        trialDeviceIdFromToken(cookies().get(TRIAL_DEVICE_COOKIE)?.value),
      )
    : DEMO_ENTITLEMENTS;
  const resumeSessionId =
    typeof searchParams.session === "string" && searchParams.session.length <= 100
      ? searchParams.session
      : null;
  return (
    <Backtester
      resumeSessionId={resumeSessionId}
      entitlements={entitlements}
      autoStartTrial={
        !resumeSessionId &&
        searchParams.trial === "instant" &&
        entitlements.plan === "free"
      }
    />
  );
}
