import type { Metadata } from "next";

import { ChallengesView } from "@/components/app/ChallengesView";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { loadChallengesOverview } from "@/lib/backtest/challenge-queries";
import { getUserEntitlements } from "@/lib/billing/entitlements";

export const metadata: Metadata = {
  title: "Challenges",
  description: "Prop-firm challenges: progress against the rules and every attempt.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  const user = await requireUser("/app/challenges");
  const [overview, entitlements] = await Promise.all([
    loadChallengesOverview(user.id),
    ensureUserProfile(user).then(() => getUserEntitlements(user.id)),
  ]);
  return <ChallengesView overview={overview} locked={!entitlements.propFirmChallenges} />;
}
