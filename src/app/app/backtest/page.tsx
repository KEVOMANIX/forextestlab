import type { Metadata } from "next";

import { Backtester } from "@/components/app/Backtester";

export const metadata: Metadata = {
  title: "Backtester",
  description:
    "Run a simulated forex backtest with historical market replay and execution tools.",
  alternates: { canonical: "/app/backtest" },
};

export default function BacktestPage({
  searchParams,
}: {
  searchParams: { session?: string };
}) {
  const resumeSessionId =
    typeof searchParams.session === "string" && searchParams.session.length <= 100
      ? searchParams.session
      : null;
  return <Backtester resumeSessionId={resumeSessionId} />;
}
