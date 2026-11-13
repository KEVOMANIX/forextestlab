import { NextResponse } from "next/server";

import { billingEnabled } from "@/lib/billing/availability";
import { proTrialEligible } from "@/lib/billing/checkout";
import { proTrialPricesConfigured } from "@/lib/billing/tiers";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether to advertise the Pro trial to this visitor: signed out, any new
 * account could take it; signed in, the checkout eligibility rule decides.
 * Advisory only: checkout applies the same rule again.
 */
export async function GET() {
  if (!billingEnabled()) return NextResponse.json({ eligible: false, signedIn: false });
  const user = await getCurrentUser();
  const eligible = user ? await proTrialEligible(user.id) : proTrialPricesConfigured();
  return NextResponse.json({ eligible, signedIn: Boolean(user) }, { headers: { "Cache-Control": "private, no-store" } });
}
