import { SupportSection } from "@/components/SupportSection";
import { PageShell } from "@/components/PageShell";
import { marketingMetadata } from "@/lib/marketing-metadata";

export const metadata = marketingMetadata({
  title: "Support",
  description: "Contact the ForexTestLab support team for help with your account, billing, and backtesting workspace.",
  path: "/support",
});

export default function SupportPage() {
  return <PageShell><SupportSection /></PageShell>;
}
