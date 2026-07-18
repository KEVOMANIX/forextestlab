import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CircleCheck } from "lucide-react";

import { BillingResultCard } from "@/components/billing/BillingResultCard";
import { verifyAndRecordPayment } from "@/lib/billing/service";

export const metadata: Metadata = { title: "Payment successful", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BillingSuccessPage({ searchParams }: { searchParams: { reference?: string } }) {
  const reference=searchParams.reference?.trim()||"";
  if(!reference) redirect("/billing/failed");
  const result=await verifyAndRecordPayment(reference);
  if(result.status!=="success") redirect(`/billing/${result.status}?reference=${encodeURIComponent(reference)}`);
  return <BillingResultCard icon={CircleCheck} tone="success" eyebrow="Payment confirmed" title="Your Pro workspace is active" message="Your payment was verified and Pro access has been applied to your ForexTestLab account." reference={reference}><div className="grid gap-3 sm:grid-cols-2"><Link href="/app" className="btn-primary">Open dashboard <ArrowRight size={15} aria-hidden/></Link><Link href="/account/billing" className="btn-secondary">View billing</Link></div></BillingResultCard>;
}
