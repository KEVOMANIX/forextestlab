import type { Metadata } from "next";

import { AnalyticsDesignPrototype } from "@/components/app/AnalyticsDesignPrototype";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Analytics design prototype",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AnalyticsDesignLabPage() {
  await requireUser("/app/design-lab/analytics");
  return <AnalyticsDesignPrototype />;
}
