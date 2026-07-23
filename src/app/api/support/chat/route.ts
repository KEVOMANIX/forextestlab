import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { sendContactEmail, sendContactReceipt } from "@/lib/contact-email";

export const runtime = "nodejs";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function conversationFor(id: string, visitorId: string) {
  return prisma.supportConversation.findFirst({ where: { id, ...(visitorId ? { visitorId } : {}) }, include: { messages: { orderBy: { createdAt: "asc" } } } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("conversationId"), 80);
  const visitorId = clean(url.searchParams.get("visitorId"), 120);
  if (!id) return NextResponse.json({ ok: true, conversation: null });
  const conversation = await conversationFor(id, visitorId);
  return NextResponse.json({ ok: true, conversation });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const action = clean(input.action, 30);
  const visitorId = clean(input.visitorId, 120);
  const user = await getCurrentUser();
  const userId = user?.id ?? null;
  const conversationId = clean(input.conversationId, 80);
  const message = clean(input.message, 2000);

  if (action === "start") {
    if (!message) return NextResponse.json({ ok: false, message: "Please enter a message." }, { status: 422 });
    const customerName = clean(input.name, 120) || "Customer";
    const customerEmail = clean(input.email, 180) || user?.email || "";
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return NextResponse.json({ ok: false, message: "A valid email address is required so support can reply." }, { status: 422 });
    const conversation = await prisma.supportConversation.create({
      data: { userId, visitorId: visitorId || null, customerName, customerEmail, status: "open", messages: { create: { senderType: "customer", senderName: customerName, body: message } } },
      include: { messages: true },
    });
    const submission = { name: customerName, email: customerEmail, subject: "Live support chat request", message, consent: true as const };
    try {
      await sendContactEmail(submission);
      await sendContactReceipt(submission);
      await prisma.contactMessage.create({ data: { ...submission, deliveryStatus: "delivered" } });
    } catch (error) {
      console.error("Failed to deliver live support request:", error);
      await prisma.contactMessage.create({ data: { ...submission, deliveryStatus: "failed" } }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, conversation }, { status: 201 });
  }

  if (!conversationId || !message || !visitorId) return NextResponse.json({ ok: false, message: "Conversation details are required." }, { status: 422 });
  const conversation = await conversationFor(conversationId, visitorId);
  if (!conversation || conversation.status === "resolved") return NextResponse.json({ ok: false, message: "This conversation is closed." }, { status: 404 });
  const updated = await prisma.$transaction(async (tx) => {
    await tx.supportMessage.create({ data: { conversationId, senderType: "customer", senderName: clean(input.name, 120) || "Customer", body: message } });
    return tx.supportConversation.update({ where: { id: conversationId }, data: { status: conversation.assignedAgentName ? "active" : "open" }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  });
  return NextResponse.json({ ok: true, conversation: updated });
}
