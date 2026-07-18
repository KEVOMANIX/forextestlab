import type { Metadata } from "next";
import Link from "next/link";
import { CircleX, RotateCcw } from "lucide-react";

import { BillingResultCard } from "@/components/billing/BillingResultCard";

export const metadata: Metadata = { title: "Payment not completed", robots: { index: false } };

export default function BillingFailedPage({ searchParams }: { searchParams: { reference?: string } }) {
  return <BillingResultCard icon={CircleX} tone="failed" eyebrow="Payment incomplete" title="Your Pro access was not activated" message="The payment was cancelled, failed, or could not be verified against the selected plan. If your bank shows a charge, keep the reference below and contact support before trying again." reference={searchParams.reference}><div className="grid gap-3 sm:grid-cols-2"><Link href="/account/billing" className="btn-primary"><RotateCcw size={15} aria-hidden/>Try again</Link><Link href="/pricing" className="btn-secondary">View plans</Link></div></BillingResultCard>;
}
