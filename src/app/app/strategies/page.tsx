import type { Metadata } from "next";

import { StrategyLabDashboard } from "@/components/app/StrategyLabDashboard";
import { StrategyLabWorkspace } from "@/components/app/StrategyLabWorkspace";
import { getUserEntitlements } from "@/lib/billing/entitlements";
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
  if (!script) return <StrategyLabDashboard sampleMode={!user} />;
  const entitlements = user ? await getUserEntitlements(user.id) : null;
  return <StrategyLabWorkspace sampleMode={!user} allowedSymbols={entitlements?.allowedSymbols ?? (user ? null : ["EURUSD"])} />;
}
