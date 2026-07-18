import { redirect } from "next/navigation";

import { verifyAndRecordPayment } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

export default async function BillingCallbackPage({ searchParams }: { searchParams: { reference?: string; trxref?: string } }) {
  const reference = (searchParams.reference || searchParams.trxref || "").trim();
  if (!reference) redirect("/billing/failed");
  const result = await verifyAndRecordPayment(reference);
  redirect(`/billing/${result.status}?reference=${encodeURIComponent(reference)}`);
}
