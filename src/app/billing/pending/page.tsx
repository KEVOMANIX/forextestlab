import type { Metadata } from "next";
import Link from "next/link";
import { Clock3 } from "lucide-react";

import { BillingResultCard } from "@/components/billing/BillingResultCard";
import { PaymentStatusPoller } from "@/components/billing/PaymentStatusPoller";

export const metadata: Metadata = { title: "Payment pending", robots: { index: false } };

export default function BillingPendingPage({ searchParams }: { searchParams: { reference?: string } }) {
  const reference=searchParams.reference?.trim()||"";
  return <BillingResultCard icon={Clock3} tone="pending" eyebrow="Confirmation pending" title="We are checking your payment" message="Some payment methods take a little longer to confirm. Do not start another payment while this reference is pending." reference={reference||undefined}>{reference?<PaymentStatusPoller reference={reference}/>:<Link href="/pricing" className="btn-secondary w-full">Return to pricing</Link>}</BillingResultCard>;
}
