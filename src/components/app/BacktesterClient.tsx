"use client";

import dynamic from "next/dynamic";

import { SupportTerminalAlert } from "@/components/support/SupportTerminalAlert";
import type { PlanEntitlements } from "@/lib/billing/entitlement-types";

const Backtester = dynamic(
  () => import("@/components/app/Backtester").then((module) => module.Backtester),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[calc(100dvh-3.5rem)] place-items-center bg-[var(--app-bg)]">
        <p className="text-sm app-muted">Loading replay terminal…</p>
      </div>
    ),
  },
);

export function BacktesterClient({
  resumeSessionId,
  entitlements,
  autoStartTrial,
}: {
  resumeSessionId: string | null;
  entitlements: PlanEntitlements;
  autoStartTrial: boolean;
}) {
  return (
    <>
      <Backtester
        resumeSessionId={resumeSessionId}
        entitlements={entitlements}
        autoStartTrial={autoStartTrial}
      />
      {/* The terminal hides the floating launcher, so support activity reaches
          the trader through this instead. */}
      <SupportTerminalAlert />
    </>
  );
}
