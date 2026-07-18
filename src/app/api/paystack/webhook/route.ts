import { NextResponse } from "next/server";

import { validPaystackSignature } from "@/lib/billing/paystack";
import { processPaystackWebhook } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validPaystackSignature(rawBody, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let event: { event?: string; data?: unknown };
  try {
    event = JSON.parse(rawBody) as { event?: string; data?: unknown };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    await processPaystackWebhook(rawBody, event);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
