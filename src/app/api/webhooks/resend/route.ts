import { NextResponse } from "next/server";
import { Resend } from "resend";
import { Webhook } from "svix";

import { prisma } from "@/lib/db";
import { publishSupportConversationChanged } from "@/lib/support-realtime";

export const runtime = "nodejs";

const ADDRESS_CATEGORIES: Record<string, string> = {
  support: "other",
  hello: "other",
  billing: "billing",
  admin: "account",
};

type ReceivedEvent = {
  type?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
  };
};

function address(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function senderName(value: string, email: string) {
  const name = value
    .replace(/<[^>]+>/, "")
    .replace(/^\"|\"$/g, "")
    .trim();
  return name || email.split("@")[0] || "Customer";
}

function plainText(html: string | null | undefined) {
  return (html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!secret || !apiKey) {
    return NextResponse.json(
      { ok: false, message: "Resend is not configured." },
      { status: 503 },
    );
  }

  const raw = await request.text();
  try {
    const headers = {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    };
    const event = new Webhook(secret).verify(raw, headers) as ReceivedEvent;
    if (event.type !== "email.received" || !event.data?.email_id) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const data = event.data;
    const emailId = data.email_id ?? "";

    const resend = new Resend(apiKey);
    const received = await resend.emails.receiving.get(emailId);
    if (received.error || !received.data) {
      console.error(
        "Unable to retrieve received Resend email:",
        received.error,
      );
      return NextResponse.json({ ok: false }, { status: 502 });
    }

    const email = received.data;
    const messageId = email.message_id || data.message_id || emailId;
    const from = email.from || data.from || "unknown@example.com";
    const customerEmail = address(from);
    const subject = (email.subject || data.subject || "Support request")
      .trim()
      .slice(0, 160);
    const recipients = (email.to?.length ? email.to : (data.to ?? [])).map(
      address,
    );
    const localPart = (recipients[0]?.split("@")[0] ?? "support").toLowerCase();
    const category = ADDRESS_CATEGORIES[localPart] ?? "other";
    const body = (
      email.text ||
      plainText(email.html) ||
      "(Email contained no readable text.)"
    ).slice(0, 20_000);
    const profile = await prisma.userProfile.findUnique({
      where: { email: customerEmail },
      select: { id: true, displayName: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.supportMessage.findUnique({
        where: { clientMessageId: messageId },
        select: { conversationId: true },
      });
      if (duplicate) return { conversationId: duplicate.conversationId };

      const existing = await tx.supportConversation.findFirst({
        where: {
          channel: "email",
          customerEmail,
          subject,
          status: { not: "closed" },
        },
        orderBy: { lastMessageAt: "desc" },
        select: { id: true },
      });
      if (existing) {
        await tx.supportMessage.create({
          data: {
            conversationId: existing.id,
            clientMessageId: messageId,
            senderType: "customer",
            senderName: senderName(from, customerEmail),
            body,
            metadataJson: JSON.stringify({
              resendEmailId: emailId,
              recipients,
            }),
            deliveredAt: new Date(),
          },
        });
        await tx.supportConversation.update({
          where: { id: existing.id },
          data: {
            status: "waiting_support",
            lastMessageAt: new Date(),
            agentUnreadCount: { increment: 1 },
          },
        });
        return { conversationId: existing.id };
      }

      const now = new Date();
      const conversation = await tx.supportConversation.create({
        data: {
          userId: profile?.id,
          customerName: profile?.displayName ?? senderName(from, customerEmail),
          customerEmail,
          subject,
          category,
          channel: "email",
          status: "open",
          agentUnreadCount: 1,
          lastMessageAt: now,
          messages: {
            create: {
              clientMessageId: messageId,
              senderType: "customer",
              senderName: senderName(from, customerEmail),
              body,
              metadataJson: JSON.stringify({
                resendEmailId: emailId,
                recipients,
              }),
              deliveredAt: now,
            },
          },
        },
        select: { id: true },
      });
      return { conversationId: conversation.id };
    });

    publishSupportConversationChanged(result.conversationId);
    return NextResponse.json({
      ok: true,
      conversationId: result.conversationId,
    });
  } catch (error) {
    console.error("Resend inbound webhook failed:", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
