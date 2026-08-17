"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { sendSupportReplyNotification } from "@/lib/contact-email";
import { publishSupportConversationChanged } from "@/lib/support-realtime";
import {
  requireSupportAgent,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
} from "@/lib/support";

const clean = (value: FormDataEntryValue | null, max: number) =>
  String(value ?? "").trim().slice(0, max);

async function supportWriter() {
  const actor = await requireSupportAgent();
  if (actor.agent.role === "viewer") {
    throw new Error("This support role is read-only.");
  }
  return actor;
}

/**
 * Expected refusals are returned, not thrown. Next redacts the message of a
 * thrown Server Action error in production builds, so throwing left an agent
 * staring at "An error occurred in the Server Components render" with no idea
 * that the conversation simply belonged to a colleague.
 */
type WriteResult = { ok: boolean; message?: string };

async function audit(
  actor: { user: { id: string; email?: string | null } },
  action: string,
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.adminAuditEvent.create({
    data: {
      actorUserId: actor.user.id,
      actorEmail: actor.user.email ?? "unknown",
      action,
      targetType: "support_conversation",
      targetId,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

function refresh(conversationId?: string) {
  revalidatePath("/support-team");
  if (conversationId) {
    revalidatePath(`/support-team?conversation=${conversationId}`);
  }
}

export async function replyToConversation(formData: FormData): Promise<WriteResult> {
  const actor = await requireSupportAgent();
  if (actor.agent.role === "viewer") {
    return { ok: false, message: "Your support role is read-only." };
  }
  const conversationId = clean(formData.get("conversationId"), 100);
  const body = clean(formData.get("body"), 4_000);
  if (!conversationId || !body) {
    return { ok: false, message: "Write a reply before sending." };
  }
  const owner = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    select: { assignedAgentId: true, assignedAgentName: true },
  });
  if (!owner) return { ok: false, message: "This conversation no longer exists." };
  if (owner.assignedAgentId && owner.assignedAgentId !== actor.agent.id) {
    return {
      ok: false,
      message: `${owner.assignedAgentName ?? "Another agent"} is handling this conversation. Use Take over to reply.`,
    };
  }
  const now = new Date();
  const recipient = await prisma.$transaction(async (tx) => {
    const conversation = await tx.supportConversation.findUnique({
      where: { id: conversationId },
      select: {
        assignedAgentId: true,
        firstResponseAt: true,
        customerEmail: true,
        customerName: true,
        subject: true,
        customerLastReadAt: true,
        lastCustomerNotificationAt: true,
      },
    });
    if (!conversation) return null;
    await tx.supportMessage.create({
      data: {
        conversationId,
        senderType: "agent",
        senderId: actor.agent.id,
        senderName: actor.agent.displayName,
        body,
        deliveredAt: now,
      },
    });
    const shouldNotify =
      (!conversation.customerLastReadAt ||
        now.getTime() - conversation.customerLastReadAt.getTime() > 120_000) &&
      (!conversation.lastCustomerNotificationAt ||
        now.getTime() -
          conversation.lastCustomerNotificationAt.getTime() >
          600_000);
    await tx.supportConversation.update({
      where: { id: conversationId },
      data: {
        assignedAgentId: actor.agent.id,
        assignedAgentName: actor.agent.displayName,
        status: "waiting_customer",
        firstResponseAt: conversation.firstResponseAt ?? now,
        lastMessageAt: now,
        customerUnreadCount: { increment: 1 },
        agentUnreadCount: 0,
        agentLastReadAt: now,
        snoozedUntil: null,
        lastCustomerNotificationAt: shouldNotify ? now : undefined,
      },
    });
    return { ...conversation, shouldNotify };
  });
  publishSupportConversationChanged(conversationId);
  if (recipient?.customerEmail && recipient.shouldNotify) {
    try {
      await sendSupportReplyNotification({
        email: recipient.customerEmail,
        name: recipient.customerName ?? "Customer",
        subject: recipient.subject,
        preview: body.slice(0, 300),
      });
    } catch (error) {
      console.error("Support reply email notification failed:", error);
    }
  }
  await audit(actor, "support.reply_sent", conversationId);
  refresh(conversationId);
  return { ok: true };
}

export async function addInternalNote(formData: FormData): Promise<WriteResult> {
  const actor = await requireSupportAgent();
  if (actor.agent.role === "viewer") {
    return { ok: false, message: "Your support role is read-only." };
  }
  const conversationId = clean(formData.get("conversationId"), 100);
  const body = clean(formData.get("body"), 4_000);
  if (!conversationId || !body) {
    return { ok: false, message: "Write a note before saving it." };
  }
  await prisma.supportMessage.create({
    data: {
      conversationId,
      senderType: "agent",
      senderId: actor.agent.id,
      senderName: actor.agent.displayName,
      kind: "note",
      visibility: "internal",
      body,
      deliveredAt: new Date(),
    },
  });
  await audit(actor, "support.note_added", conversationId);
  publishSupportConversationChanged(conversationId);
  refresh(conversationId);
  return { ok: true };
}

export async function assignConversation(formData: FormData) {
  const actor = await supportWriter();
  const conversationId = clean(formData.get("conversationId"), 100);
  const requested = clean(formData.get("agentId"), 100);
  if (!conversationId) return;
  const agentId = requested === "self" ? actor.agent.id : requested || null;
  const agent = agentId
    ? await prisma.supportAgent.findFirst({
        where: { id: agentId, active: true },
      })
    : null;
  await prisma.supportConversation.update({
    where: { id: conversationId },
    data: {
      assignedAgentId: agent?.id ?? null,
      assignedAgentName: agent?.displayName ?? null,
      status: agent ? "active" : "open",
      agentUnreadCount: 0,
      agentLastReadAt: new Date(),
    },
  });
  await audit(actor, "support.assigned", conversationId, {
    assignedAgentId: agent?.id ?? null,
  });
  publishSupportConversationChanged(conversationId);
  refresh(conversationId);
}

export async function updateConversation(formData: FormData) {
  const actor = await supportWriter();
  const conversationId = clean(formData.get("conversationId"), 100);
  const status = clean(formData.get("status"), 40);
  const priority = clean(formData.get("priority"), 40);
  const category = clean(formData.get("category"), 40);
  if (!conversationId) return;
  const validStatus = SUPPORT_STATUSES.includes(
    status as (typeof SUPPORT_STATUSES)[number],
  );
  const validPriority = SUPPORT_PRIORITIES.includes(
    priority as (typeof SUPPORT_PRIORITIES)[number],
  );
  const validCategory = SUPPORT_CATEGORIES.includes(
    category as (typeof SUPPORT_CATEGORIES)[number],
  );
  const now = new Date();
  await prisma.supportConversation.update({
    where: { id: conversationId },
    data: {
      ...(validStatus ? { status } : {}),
      ...(validPriority ? { priority } : {}),
      ...(validCategory ? { category } : {}),
      ...(status === "resolved"
        ? { resolvedAt: now, snoozedUntil: null }
        : validStatus
          ? { resolvedAt: null }
          : {}),
      ...(status === "closed" ? { closedAt: now } : {}),
      agentUnreadCount: 0,
      agentLastReadAt: now,
    },
  });
  await audit(actor, "support.updated", conversationId, {
    status: validStatus ? status : undefined,
    priority: validPriority ? priority : undefined,
    category: validCategory ? category : undefined,
  });
  publishSupportConversationChanged(conversationId);
  refresh(conversationId);
}

export async function snoozeConversation(formData: FormData) {
  const actor = await supportWriter();
  const conversationId = clean(formData.get("conversationId"), 100);
  const minutes = Math.min(
    7 * 24 * 60,
    Math.max(15, Number(formData.get("minutes")) || 60),
  );
  if (!conversationId) return;
  const snoozedUntil = new Date(Date.now() + minutes * 60_000);
  await prisma.supportConversation.update({
    where: { id: conversationId },
    data: { status: "snoozed", snoozedUntil },
  });
  await audit(actor, "support.snoozed", conversationId, {
    minutes,
    snoozedUntil,
  });
  publishSupportConversationChanged(conversationId);
  refresh(conversationId);
}

export async function addConversationTag(formData: FormData) {
  const actor = await supportWriter();
  const conversationId = clean(formData.get("conversationId"), 100);
  const name = clean(formData.get("tag"), 40).toLowerCase();
  if (!conversationId || !name) return;
  const tag = await prisma.supportTag.upsert({
    where: { name },
    create: { name },
    update: {},
  });
  await prisma.supportConversationTag.upsert({
    where: {
      conversationId_tagId: { conversationId, tagId: tag.id },
    },
    create: { conversationId, tagId: tag.id },
    update: {},
  });
  await audit(actor, "support.tag_added", conversationId, { tag: name });
  publishSupportConversationChanged(conversationId);
  refresh(conversationId);
}

export async function saveReplyTemplate(formData: FormData) {
  const actor = await supportWriter();
  const title = clean(formData.get("title"), 100);
  const body = clean(formData.get("body"), 4_000);
  const category = clean(formData.get("category"), 40) || null;
  if (!title || !body) return;
  await prisma.supportSavedReply.upsert({
    where: { title },
    create: {
      title,
      body,
      category,
      createdBy: actor.agent.id,
    },
    update: { body, category, active: true },
  });
  await audit(actor, "support.saved_reply_upserted", title, { category });
  refresh();
}

export async function addSupportAgent(formData: FormData) {
  const actor = await supportWriter();
  if (!["supervisor", "owner"].includes(actor.agent.role)) return;
  const email = clean(formData.get("email"), 180).toLowerCase();
  const role = clean(formData.get("role"), 30);
  if (!email || !["agent", "supervisor", "viewer"].includes(role)) return;
  const profile = await prisma.userProfile.findUnique({ where: { email } });
  if (!profile) return;
  const created = await prisma.supportAgent.upsert({
    where: { userId: profile.id },
    create: {
      userId: profile.id,
      email: profile.email,
      displayName: profile.displayName || profile.email.split("@")[0] || "Agent",
      role,
    },
    update: { email: profile.email, role, active: true },
  });
  await prisma.adminAuditEvent.create({
    data: {
      actorUserId: actor.user.id,
      actorEmail: actor.user.email ?? "unknown",
      action: "support.agent_upserted",
      targetType: "support_agent",
      targetId: created.id,
      metadataJson: JSON.stringify({ email, role }),
    },
  });
  refresh();
}

/**
 * A recipient the team can start a conversation with.
 *
 * Deliberately limited to accounts that exist. A conversation is delivered by
 * writing it against a userId — that is how the customer widget finds it, since
 * it lists conversations by user — so an address with no account would produce
 * a thread nobody could open.
 */
export async function searchOutboundRecipients(
  query: string,
): Promise<Array<{ id: string; email: string; displayName: string | null }>> {
  await requireSupportAgent();
  const term = query.trim().slice(0, 120);
  if (term.length < 2) return [];
  return prisma.userProfile.findMany({
    where: {
      OR: [
        { email: { contains: term, mode: "insensitive" } },
        { displayName: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true, displayName: true },
    orderBy: { email: "asc" },
    take: 8,
  });
}

/**
 * Open a conversation the customer did not start.
 *
 * Everything downstream of this already existed: the widget lists a user's
 * conversations by userId, so the thread appears for them without any new
 * delivery mechanism, and the reply notification is the same mail the customer
 * gets for an inbound answer. What was missing was any way for the team to
 * speak first — until now a conversation could only begin with a complaint.
 *
 * The conversation is created assigned to its author and already answered:
 * status is waiting_customer and firstResponseAt is set, because the first
 * message is the response. Leaving it in the inbox would put the team's own
 * outbound message into the queue of things needing a reply.
 */
export async function startOutboundConversation(
  formData: FormData,
): Promise<WriteResult & { conversationId?: string }> {
  const actor = await supportWriter();
  const userId = clean(formData.get("userId"), 60);
  const subject = clean(formData.get("subject"), 160) || "Message from support";
  const body = clean(formData.get("body"), 8000);
  const category = clean(formData.get("category"), 40) || "other";
  const priority = clean(formData.get("priority"), 20) || "normal";

  if (!userId) return { ok: false, message: "Choose who to contact." };
  if (!body) return { ok: false, message: "Write a message before sending." };

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true },
  });
  if (!profile) {
    return { ok: false, message: "That account no longer exists." };
  }

  const now = new Date();
  const conversation = await prisma.$transaction(async (tx) => {
    const created = await tx.supportConversation.create({
      data: {
        userId: profile.id,
        customerEmail: profile.email,
        customerName: profile.displayName,
        subject,
        category: SUPPORT_CATEGORIES.includes(category as never) ? category : "other",
        priority: SUPPORT_PRIORITIES.includes(priority as never) ? priority : "normal",
        channel: "outbound",
        status: "waiting_customer",
        assignedAgentId: actor.agent.id,
        assignedAgentName: actor.agent.displayName,
        firstResponseAt: now,
        lastMessageAt: now,
        customerUnreadCount: 1,
        agentUnreadCount: 0,
        agentLastReadAt: now,
        lastCustomerNotificationAt: now,
      },
    });
    await tx.supportMessage.create({
      data: {
        conversationId: created.id,
        senderType: "agent",
        senderId: actor.agent.id,
        senderName: actor.agent.displayName,
        body,
        deliveredAt: now,
      },
    });
    return created;
  });

  await audit(actor, "support.outbound_started", conversation.id, {
    recipient: profile.email,
    subject,
  });
  publishSupportConversationChanged(conversation.id);

  try {
    await sendSupportReplyNotification({
      email: profile.email,
      name: profile.displayName ?? "Customer",
      subject,
      preview: body.slice(0, 300),
    });
  } catch (error) {
    // The thread is already delivered in the widget; a failed email must not
    // undo it or leave the agent thinking nothing was sent.
    console.error("Outbound support notification failed:", error);
  }

  refresh(conversation.id);
  return { ok: true, conversationId: conversation.id };
}
