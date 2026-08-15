import { NextResponse } from "next/server";

import { sendContactEmail, sendContactReceipt } from "@/lib/contact-email";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  canAccessSupportConversation,
  CUSTOMER_CLOSED_MESSAGE,
  hashSupportToken,
  isCustomerClosed,
  SUPPORT_CATEGORIES,
  supportToken,
} from "@/lib/support";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const publicInclude = {
  messages: {
    where: { visibility: "customer", deletedAt: null },
    orderBy: { createdAt: "asc" as const },
    include: {
      attachments: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          size: true,
          createdAt: true,
        },
      },
    },
  },
  tags: { include: { tag: true } },
} as const;

async function conversationFor(id: string) {
  return prisma.supportConversation.findUnique({
    where: { id },
    include: publicInclude,
  });
}

function publicConversation<T extends {
  accessTokenHash?: string | null;
  contextJson?: string | null;
}>(conversation: T) {
  const {
    accessTokenHash: _accessTokenHash,
    contextJson,
    ...safe
  } = conversation;
  void _accessTokenHash;
  let context: unknown = null;
  if (contextJson) {
    try {
      context = JSON.parse(contextJson);
    } catch {
      context = null;
    }
  }
  return {
    ...safe,
    context,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("conversationId"), 80);
  const visitorId = clean(url.searchParams.get("visitorId"), 120);
  const user = await getCurrentUser();

  if (!id && url.searchParams.get("list") === "1") {
    if (!user && !visitorId) {
      return NextResponse.json({ ok: true, conversations: [] });
    }
    const conversations = await prisma.supportConversation.findMany({
      where: user ? { userId: user.id } : { visitorId },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      select: {
        id: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        customerUnreadCount: true,
        assignedAgentName: true,
        updatedAt: true,
        lastMessageAt: true,
        messages: {
          where: { visibility: "customer", deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
      },
    });
    return NextResponse.json({ ok: true, conversations });
  }

  if (!id) return NextResponse.json({ ok: true, conversation: null });
  const conversation = await conversationFor(id);
  if (
    !conversation ||
    !(await canAccessSupportConversation(
      request,
      conversation,
      visitorId,
    ))
  ) {
    return NextResponse.json(
      { ok: false, message: "Conversation not found." },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    conversation: publicConversation(conversation),
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(
    `support:${clientIp(request)}`,
    40,
    60_000,
  );
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, message: "Too many messages. Please wait a moment." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid request." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, message: "Invalid request." },
      { status: 400 },
    );
  }

  const input = body as Record<string, unknown>;
  const action = clean(input.action, 30);
  const visitorId = clean(input.visitorId, 120);
  const user = await getCurrentUser();
  const userId = user?.id ?? null;
  const conversationId = clean(input.conversationId, 80);
  const message = clean(input.message, 4_000);

  if (action === "start") {
    if (!message) {
      return NextResponse.json(
        { ok: false, message: "Please enter a message." },
        { status: 422 },
      );
    }
    const customerName =
      clean(input.name, 120) ||
      String(user?.user_metadata?.display_name ?? "Customer").slice(0, 120);
    const customerEmail = clean(input.email, 180) || user?.email || "";
    if (
      !customerEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "A valid email address is required so support can reply.",
        },
        { status: 422 },
      );
    }
    const categoryInput = clean(input.category, 40);
    const category = SUPPORT_CATEGORIES.includes(
      categoryInput as (typeof SUPPORT_CATEGORIES)[number],
    )
      ? categoryInput
      : "other";
    const subject =
      clean(input.subject, 160) ||
      message.split(/\s+/).slice(0, 10).join(" ");
    const token = supportToken();
    const context =
      input.context && typeof input.context === "object"
        ? JSON.stringify(input.context).slice(0, 20_000)
        : null;
    const clientMessageId = clean(input.clientMessageId, 120) || null;
    const conversation = await prisma.supportConversation.create({
      data: {
        userId,
        visitorId: visitorId || null,
        accessTokenHash: hashSupportToken(token),
        customerName,
        customerEmail,
        subject,
        category,
        status: "new",
        channel: clean(input.channel, 30) || "widget",
        linkedSessionId: clean(input.linkedSessionId, 100) || null,
        contextJson: context,
        agentUnreadCount: 1,
        messages: {
          create: {
            clientMessageId,
            senderType: "customer",
            senderId: userId,
            senderName: customerName,
            body: message,
            deliveredAt: new Date(),
          },
        },
      },
      include: publicInclude,
    });
    const submission = {
      name: customerName,
      email: customerEmail,
      subject: `Support: ${subject}`,
      message,
      consent: true as const,
    };
    try {
      await sendContactEmail(submission);
      await sendContactReceipt(submission);
    } catch (error) {
      console.error("Failed to deliver support notification:", error);
    }
    return NextResponse.json(
      {
        ok: true,
        accessToken: token,
        conversation: publicConversation(conversation),
      },
      { status: 201 },
    );
  }

  if (!conversationId) {
    return NextResponse.json(
      { ok: false, message: "Conversation details are required." },
      { status: 422 },
    );
  }
  const conversation = await conversationFor(conversationId);
  if (
    !conversation ||
    !(await canAccessSupportConversation(
      request,
      conversation,
      visitorId,
    ))
  ) {
    return NextResponse.json(
      { ok: false, message: "Conversation not found." },
      { status: 404 },
    );
  }

  if (action === "read") {
    await prisma.$transaction([
      prisma.supportConversation.update({
        where: { id: conversationId },
        data: {
          customerUnreadCount: 0,
          customerLastReadAt: new Date(),
        },
      }),
      prisma.supportMessage.updateMany({
        where: {
          conversationId,
          senderType: "agent",
          visibility: "customer",
          readAt: null,
        },
        data: { readAt: new Date() },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (action === "satisfaction") {
    const score = Number(input.score);
    if (![1, 2, 3, 4, 5].includes(score)) {
      return NextResponse.json(
        { ok: false, message: "Choose a satisfaction score." },
        { status: 422 },
      );
    }
    await prisma.supportConversation.update({
      where: { id: conversationId },
      data: {
        satisfactionScore: score,
        satisfactionComment: clean(input.comment, 1_000) || null,
        satisfactionAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action !== "message" || !message) {
    return NextResponse.json(
      { ok: false, message: "Please enter a message." },
      { status: 422 },
    );
  }
  if (isCustomerClosed(conversation.status)) {
    return NextResponse.json(
      { ok: false, message: CUSTOMER_CLOSED_MESSAGE },
      { status: 409 },
    );
  }
  const clientMessageId = clean(input.clientMessageId, 120) || null;
  if (clientMessageId) {
    const duplicate = await prisma.supportMessage.findUnique({
      where: { clientMessageId },
    });
    if (duplicate) {
      return NextResponse.json({
        ok: true,
        conversation: publicConversation(conversation),
      });
    }
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.supportMessage.create({
      data: {
        conversationId,
        clientMessageId,
        senderType: "customer",
        senderId: userId,
        senderName: clean(input.name, 120) || conversation.customerName || "Customer",
        body: message,
        deliveredAt: new Date(),
      },
    });
    return tx.supportConversation.update({
      where: { id: conversationId },
      data: {
        status: "waiting_support",
        resolvedAt: null,
        lastMessageAt: new Date(),
        agentUnreadCount: { increment: 1 },
      },
      include: publicInclude,
    });
  });
  return NextResponse.json({
    ok: true,
    conversation: publicConversation(updated),
  });
}
