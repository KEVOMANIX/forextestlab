import { NextResponse } from "next/server";

import { configuredPaddleWebhookSecret, getPaddleInstance } from "@/lib/billing/paddle";
import { processPaddleWebhook } from "@/lib/billing/paddle-service";
import { isPaddleWebhookSource } from "@/lib/billing/paddle-webhook-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!await isPaddleWebhookSource(request)) {
      return NextResponse.json({ error: "Webhook source is not allowed." }, { status: 403 });
    }
  } catch (error) {
    console.error("Unable to refresh Paddle webhook IP allowlist", error);
    return NextResponse.json({ error: "Webhook source verification is unavailable." }, { status: 503 });
  }
  const signature = request.headers.get("paddle-signature") ?? "";
  const rawBody = await request.text();
  const secret = configuredPaddleWebhookSecret() ?? "";
  if (!signature || !rawBody || !secret) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 400 });
  }
  try {
    const event = await getPaddleInstance().webhooks.unmarshal(rawBody, secret, signature);
    if (event) await processPaddleWebhook(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Paddle webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
