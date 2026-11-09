import type { Metadata } from "next";

import { StrategyLab } from "@/components/app/StrategyLab";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Strategy Lab",
  description: "Write and test rule-based strategies on historical candles.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function StrategiesPage() {
  const user = await getCurrentUser();
  const entitlements = user ? await getUserEntitlements(user.id) : null;
  const maxDays = entitlements ? Math.min(90, entitlements.maxSessionDays ?? 90) : 14;
  return <StrategyLab sampleMode={!user} maxDays={maxDays} allowedSymbols={entitlements?.allowedSymbols ?? (user ? null : ["EURUSD"])} />;
}
