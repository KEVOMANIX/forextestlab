import type { Metadata } from "next";

import { StrategyLabDashboard } from "@/components/app/StrategyLabDashboard";
import { StrategyLabWorkspace } from "@/components/app/StrategyLabWorkspace";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { FREE_PINE_LIMITS } from "@/lib/billing/plan-limits";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Strategy Lab",
  description: "Write and test rule-based strategies on historical candles.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** Strategy Lab opens on the saved scripts; ?script=<id> opens one in the editor. */
export default async function StrategiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { script } = await searchParams;
  const user = await getCurrentUser();
  const entitlements = user ? await getUserEntitlements(user.id) : null;
  const limits = entitlements?.pine ?? FREE_PINE_LIMITS;
  if (!script) return <StrategyLabDashboard sampleMode={!user} scriptLimit={limits.savedScripts} pro={entitlements?.plan === "pro"} />;
  return <StrategyLabWorkspace sampleMode={!user} allowedSymbols={entitlements?.allowedSymbols ?? (user ? null : ["EURUSD"])} limits={limits} />;
}
