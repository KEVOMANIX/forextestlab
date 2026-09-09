"use client";

import dynamic from "next/dynamic";

import { PageLoader } from "@/components/PageLoader";
import { SupportTerminalAlert } from "@/components/support/SupportTerminalAlert";
import type { PlanEntitlements } from "@/lib/billing/entitlement-types";

/**
 * The terminal is a large client bundle, so it arrives after the page that
 * renders it. Its fallback is the same loader the route boundary and the
 * terminal itself use: it used to be a bare sentence centred inside the app
 * chrome, which put an unrelated-looking screen — nav, footer, one line of grey
 * text — between two full-screen loaders on the way into a session.
 */
const Backtester = dynamic(
  () => import("@/components/app/Backtester").then((module) => module.Backtester),
  {
    ssr: false,
    loading: () => <PageLoader message="Loading replay terminal…" />,
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
