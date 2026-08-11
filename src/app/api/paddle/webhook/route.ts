import { NextResponse } from "next/server";

import { configuredPaddleWebhookSecret, unmarshalPaddleWebhook } from "@/lib/billing/paddle";
import { processPaddleWebhook } from "@/lib/billing/paddle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature") ?? "";
  const rawBody = await request.text();
  const secret = configuredPaddleWebhookSecret() ?? "";
  if (!signature || !rawBody || !secret) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 400 });
  }
  try {
    const event = await unmarshalPaddleWebhook(rawBody, secret, signature);
    await processPaddleWebhook(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Paddle webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
