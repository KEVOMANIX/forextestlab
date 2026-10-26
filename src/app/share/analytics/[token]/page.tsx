import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AnalyticsDesignPrototype } from "@/components/app/AnalyticsDesignPrototype";
import type { AnalyticsShareSnapshot } from "@/lib/analytics/share-snapshot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared analytics", description: "A shared simulated trading performance report.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } }, referrer: "no-referrer",
};

export default async function SharedAnalytics({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const share = await prisma.analyticsShare.findUnique({ where: { token } });
  if (!share || share.expiresAt <= new Date()) notFound();
  const snapshot = JSON.parse(share.snapshotJson) as AnalyticsShareSnapshot;
  return <div className="app-theme-surface min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
    <AnalyticsDesignPrototype {...snapshot} mode="live" readOnly fullAccess showReturn={false}
      notice={<p className="text-xs app-muted">ForexTestLab · Shared simulated performance · Snapshot saved {share.createdAt.toISOString().slice(0, 10)}. This report does not update live.</p>} />
  </div>;
}
