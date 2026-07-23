import type { Metadata } from "next";

import { SupportSection } from "@/components/SupportSection";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Support",
  description: "Contact the ForexTestLab support team for help with your account, billing, and backtesting workspace.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return <PageShell><SupportSection /></PageShell>;
}
