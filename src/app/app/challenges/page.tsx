import type { Metadata } from "next";

import { ChallengesView } from "@/components/app/ChallengesView";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { loadChallengesOverview } from "@/lib/backtest/challenge-queries";

export const metadata: Metadata = {
  title: "Challenges",
  description: "Prop-firm challenge practice: progress against the rules and every attempt.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  const user = await requireUser("/app/challenges");
  await ensureUserProfile(user);
  return <ChallengesView overview={await loadChallengesOverview(user.id)} />;
}
