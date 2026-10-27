import type { Metadata } from "next";

import { AiAnalystView } from "@/components/app/AiAnalystView";
import { analystSessionCard } from "@/lib/ai/analyst";
import { buildFindings } from "@/lib/ai/findings";
import { loadPortfolioSessions } from "@/lib/ai/portfolio";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { formatSymbol } from "@/lib/market-data/symbols";

export const metadata: Metadata = {
  title: "AI Analyst",
  description: "An AI analyst that reviews your backtests and answers questions about your trades.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** How many recent sessions the welcome screen offers to review. */
const WELCOME_CARDS = 4;

export default async function AiAnalystPage() {
  const user = await requireUser("/app/ai");
  await ensureUserProfile(user);
  const [entitlements, rows] = await Promise.all([getUserEntitlements(user.id), loadPortfolioSessions(user.id)]);
  const sessions = rows.filter((session) => !session.archived);
  const locked = !entitlements.fullAnalytics;
  const cards = sessions
    .filter((session) => session.trades.some((trade) => trade.validity !== "experimental"))
    .slice(0, WELCOME_CARDS)
    .map(analystSessionCard);
  const findings = locked ? [] : buildFindings(sessions.flatMap((session) => session.trades
    .filter((trade) => trade.validity !== "experimental")
    .map((trade) => ({ symbol: formatSymbol(session.symbol), pnl: Number(trade.pnl), entryTime: Number(trade.entryTime) }))));
  return (
    <AiAnalystView
      locked={locked}
      cards={cards}
      sessions={sessions.map((session) => ({ id: session.id, name: session.name }))}
      findings={findings}
    />
  );
}
