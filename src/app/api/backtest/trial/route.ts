import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The old device trial (three random EUR/USD sessions per browser) has been
 * replaced by the Free plan: three sessions a month on any major pair, chosen
 * in the normal setup. Kept as a clear answer for any cached client.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Free sessions are now set up from the session form: pick a major pair and up to 31 days." },
    { status: 410 },
  );
}
