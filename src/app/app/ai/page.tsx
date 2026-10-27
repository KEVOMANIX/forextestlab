import type { Metadata } from "next";

import { AiAnalystView } from "@/components/app/AiAnalystView";
import { PORTFOLIO_SUGGESTED_QUESTIONS, SESSION_SUGGESTED_QUESTIONS } from "@/lib/ai/context";
import { buildFindings } from "@/lib/ai/findings";
import { loadPortfolioSessions } from "@/lib/ai/portfolio";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { formatSymbol } from "@/lib/market-data/symbols";

export const metadata: Metadata = {
  title: "AI Analyst",
  description: "Findings from your trades and an AI analyst to ask about them.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AiAnalystPage() {
  const user = await requireUser("/app/ai");
  await ensureUserProfile(user);
  const entitlements = await getUserEntitlements(user.id);
  const suggestions = { sessionSuggestions: SESSION_SUGGESTED_QUESTIONS, portfolioSuggestions: PORTFOLIO_SUGGESTED_QUESTIONS };
  if (!entitlements.fullAnalytics) return <AiAnalystView locked sessions={[]} findings={[]} {...suggestions} />;

  const sessions = (await loadPortfolioSessions(user.id)).filter((session) => !session.archived);
  const findings = buildFindings(sessions.flatMap((session) => session.trades
    .filter((trade) => trade.validity !== "experimental")
    .map((trade) => ({ symbol: formatSymbol(session.symbol), pnl: Number(trade.pnl), entryTime: Number(trade.entryTime) }))));
  return <AiAnalystView locked={false} sessions={sessions.map((session) => ({ id: session.id, name: session.name }))} findings={findings} {...suggestions} />;
}
