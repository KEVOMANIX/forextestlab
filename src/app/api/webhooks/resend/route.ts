import { NextResponse } from "next/server";
import { Resend } from "resend";
import { Webhook } from "svix";

import { prisma } from "@/lib/db";
import { recordEmailFailure } from "@/lib/email-failures";
import { baseSubject, messageIdVariants, referencedMessageIds, sameThreadSubject } from "@/lib/support-email-threading";
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

/** Remove the previous message that mail clients append to replies. */
function stripQuotedReply(value: string) {
  const text = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return text;

  // Gmail, Apple Mail and many mobile clients introduce the quoted section
  // with one of these delimiter lines.
  const delimiter = text.search(
    /^\s*(?:On .{1,240}wrote:\s*|.{1,180}\s+wrote:\s*|[-_]{5,}\s*Original Message\s*[-_]{0,})\s*$/im,
  );
  const withoutDelimiter = delimiter >= 0 ? text.slice(0, delimiter) : text;
  const lines = withoutDelimiter.split("\n");
  const cleaned: string[] = [];
  let quotedRun = 0;
  for (const line of lines) {
    if (/^\s*>/.test(line)) {
      quotedRun += 1;
      continue;
    }
    // Some clients omit the delimiter and only prefix every quoted line.
    if (quotedRun > 0 && !line.trim()) continue;
    quotedRun = 0;
    cleaned.push(line);
  }
  return cleaned.join("\n").trim();
}

/**
 * A copy for the team's own mailbox, as a heads-up. Answers belong in the
 * support inbox: a reply sent from a personal mailbox is never recorded, so the
 * conversation would still look unanswered.
 */
async function forwardInboundEmail({
  resend,
  from,
  subject,
  text,
  html,
  conversationId,
}: {
  resend: Resend;
  from: string;
  subject: string;
  text: string;
  html?: string | null;
  conversationId: string;
}) {
  const forwardTo = process.env.RESEND_INBOUND_FORWARD_TO?.trim();
  if (!forwardTo) return;

  const forwardFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (!forwardFrom) {
    throw new Error("RESEND_FROM_EMAIL is required when inbound forwarding is enabled.");
  }

  const inbox = `${(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://forextestlab.com").replace(/\/$/, "")}/support-team?conversation=${conversationId}`;
  const notice = `Answer in the support inbox so the reply is tracked: ${inbox}`;
  const result = await resend.emails.send({
    from: forwardFrom,
    to: [forwardTo],
    replyTo: from,
    subject: `[ForexTestLab] ${subject}`,
    text: [
      notice,
      "",
      `Original sender: ${from}`,
      `Received at: ${new Date().toISOString()}`,
      "",
      text,
    ].join("\n"),
    ...(html
      ? { html: `<p style="margin:0 0 16px;padding:10px 14px;border-radius:8px;background:#fff7e0;font-family:Arial,sans-serif;font-size:14px">Answer in the <a href="${inbox}">support inbox</a> so the reply is tracked.</p>${html}` }
      : {}),
  });

  if (result.error) {
    throw new Error(`Inbound email forwarding failed: ${result.error.message}`);
  }
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
  let event: ReceivedEvent;
  try {
    event = new Webhook(secret).verify(raw, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    }) as ReceivedEvent;
  } catch {
    // Unsigned or forged requests are noise, not failures worth a stack trace.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
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
    const body = stripQuotedReply(
      email.text || plainText(email.html) || "(Email contained no readable text.)",
    ).slice(0, 20_000);
    const referenced = referencedMessageIds(email.headers);

    const profile = await prisma.userProfile.findUnique({
      where: { email: customerEmail },
      select: { id: true, displayName: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.supportMessage.findUnique({
        where: { clientMessageId: messageId },
        select: { conversationId: true },
      });
      if (duplicate) return { conversationId: duplicate.conversationId, isNew: false };

      const openEmailThread = {
        channel: "email",
        customerEmail: { equals: customerEmail, mode: "insensitive" as const },
        status: { not: "closed" },
      };
      // The message this one answers is the surest link; then the subject
      // without its "Re:" or "Fwd:" prefixes.
      const answered = referenced.length
        ? await tx.supportMessage.findFirst({
            where: { clientMessageId: { in: messageIdVariants(referenced) }, conversation: openEmailThread },
            orderBy: { createdAt: "desc" },
            select: { conversationId: true },
          })
        : null;
      const candidates = answered
        ? []
        : await tx.supportConversation.findMany({
            where: openEmailThread,
            orderBy: { lastMessageAt: "desc" },
            take: 50,
            select: { id: true, subject: true },
          });
      const existingId = answered?.conversationId ?? candidates.find((candidate) => sameThreadSubject(candidate.subject, subject))?.id;
      if (existingId) {
        await tx.supportMessage.create({
          data: {
            conversationId: existingId,
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
          where: { id: existingId },
          data: {
            status: "waiting_support",
            lastMessageAt: new Date(),
            agentUnreadCount: { increment: 1 },
          },
        });
        return { conversationId: existingId, isNew: true };
      }

      const now = new Date();
      const conversation = await tx.supportConversation.create({
        data: {
          userId: profile?.id,
          customerName: profile?.displayName ?? senderName(from, customerEmail),
          customerEmail,
          // Stored without "Re:" so our answer's subject reads "Re: <subject>".
          subject: baseSubject(subject),
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
      return { conversationId: conversation.id, isNew: true };
    });

    publishSupportConversationChanged(result.conversationId);
    // Only after the message is stored, and only once: Resend retries a
    // webhook it is unsure about, and each retry used to forward the email again.
    // A failed forward is recorded, not retried, because the message is safe.
    if (result.isNew) {
      await forwardInboundEmail({ resend, from, subject, text: body, html: email.html, conversationId: result.conversationId })
        .catch((error) => recordEmailFailure("inbound_forward", result.conversationId, error));
    }
    return NextResponse.json({
      ok: true,
      conversationId: result.conversationId,
    });
  } catch (error) {
    console.error("Resend inbound webhook failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
