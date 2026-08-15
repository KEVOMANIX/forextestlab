import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publishSupportConversationChanged } from "@/lib/support-realtime";
import {
  canAccessSupportConversation,
  CUSTOMER_CLOSED_MESSAGE,
  isCustomerClosed,
} from "@/lib/support";

export const runtime = "nodejs";

const allowedTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/json",
]);
const maxBytes = 2 * 1_024 * 1_024;

export async function POST(request: Request) {
  if (!rateLimit(`support-upload:${clientIp(request)}`, 10, 60_000).ok) {
    return NextResponse.json(
      { ok: false, message: "Upload limit reached. Try again shortly." },
      { status: 429 },
    );
  }
  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "").slice(0, 100);
  const visitorId = String(form.get("visitorId") ?? "").slice(0, 120);
  const caption = String(form.get("caption") ?? "").trim().slice(0, 1_000);
  const file = form.get("file");
  if (!conversationId || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, message: "Choose a file to upload." },
      { status: 422 },
    );
  }
  if (!allowedTypes.has(file.type) || file.size <= 0 || file.size > maxBytes) {
    return NextResponse.json(
      {
        ok: false,
        message: "Use PNG, JPEG, WebP, PDF, TXT or JSON files up to 2 MB.",
      },
      { status: 422 },
    );
  }
  const conversation = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
  });
  if (
    !conversation ||
    !(await canAccessSupportConversation(request, conversation, visitorId))
  ) {
    return NextResponse.json(
      { ok: false, message: "Conversation not found." },
      { status: 404 },
    );
  }
  if (isCustomerClosed(conversation.status)) {
    return NextResponse.json(
      { ok: false, message: CUSTOMER_CLOSED_MESSAGE },
      { status: 409 },
    );
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: {
        conversationId,
        senderType: "customer",
        senderName: conversation.customerName ?? "Customer",
        kind: "attachment",
        body: caption || `Attached ${file.name}`,
        deliveredAt: now,
        attachments: {
          create: {
            fileName: file.name.slice(0, 180),
            mimeType: file.type,
            size: file.size,
            data: bytes,
          },
        },
      },
      include: {
        attachments: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            size: true,
          },
        },
      },
    });
    await tx.supportConversation.update({
      where: { id: conversationId },
      data: {
        status: "waiting_support",
        agentUnreadCount: { increment: 1 },
        lastMessageAt: now,
      },
    });
    return created;
  });
  publishSupportConversationChanged(conversationId);
  return NextResponse.json({ ok: true, message }, { status: 201 });
}
