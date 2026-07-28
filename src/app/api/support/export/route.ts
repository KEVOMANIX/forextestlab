import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireSupportAgent } from "@/lib/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user } = await requireSupportAgent("/support-team");
  const conversationId = new URL(request.url).searchParams
    .get("conversationId")
    ?.trim()
    .slice(0, 100);
  if (!conversationId) {
    return NextResponse.json(
      { ok: false, message: "Conversation is required." },
      { status: 422 },
    );
  }

  const conversation = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    include: {
      assignedAgent: {
        select: { displayName: true, email: true, role: true },
      },
      tags: { include: { tag: true } },
      messages: {
        orderBy: { createdAt: "asc" },
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
    },
  });
  if (!conversation) {
    return NextResponse.json(
      { ok: false, message: "Conversation not found." },
      { status: 404 },
    );
  }

  const exportedAt = new Date().toISOString();
  await prisma.adminAuditEvent.create({
    data: {
      actorUserId: user.id,
      actorEmail: user.email ?? "unknown",
      action: "support.conversation_exported",
      targetType: "support_conversation",
      targetId: conversation.id,
    },
  });

  return NextResponse.json(
    {
      exportVersion: 1,
      exportedAt,
      conversation: {
        ...conversation,
        accessTokenHash: undefined,
        context: conversation.contextJson
          ? safeJson(conversation.contextJson)
          : null,
        contextJson: undefined,
      },
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="support-${conversation.id}.json"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
