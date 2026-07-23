"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

async function audit(
  action: string,
  targetType: string,
  targetId: string | null,
  metadata?: Record<string, unknown>,
) {
  const actor = await requireAdmin();
  await prisma.adminAuditEvent.create({
    data: {
      actorUserId: actor.id,
      actorEmail: actor.email ?? "unknown",
      action,
      targetType,
      targetId,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

export async function grantManualAccess(formData: FormData) {
  const actor = await requireAdmin("/admin/users");
  const userId = String(formData.get("userId") ?? "");
  const days = Number(formData.get("days") ?? 30);
  if (!userId || ![30, 90, 365].includes(days) || userId === actor.id) return;

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { proAccessUntil: true },
  });
  if (!profile) return;
  const base =
    profile.proAccessUntil && profile.proAccessUntil > new Date()
      ? profile.proAccessUntil
      : new Date();
  const accessUntil = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  await prisma.userProfile.update({
    where: { id: userId },
    data: { proAccessUntil: accessUntil },
  });
  await audit("access.granted", "user", userId, { days, accessUntil });
  revalidatePath("/admin");
  revalidatePath("/admin/users");
}

export async function revokeManualAccess(formData: FormData) {
  const actor = await requireAdmin("/admin/users");
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === actor.id) return;
  await prisma.userProfile.update({
    where: { id: userId },
    data: { proAccessUntil: null },
  });
  await audit("access.manual_revoked", "user", userId);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
}

export async function updateEnquiryStatus(formData: FormData) {
  await requireAdmin("/admin/enquiries");
  const enquiryId = String(formData.get("enquiryId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!enquiryId || !["open", "in-progress", "resolved"].includes(status)) return;
  await prisma.contactMessage.update({
    where: { id: enquiryId },
    data: { status },
  });
  await audit("enquiry.status_changed", "contact_message", enquiryId, { status });
  revalidatePath("/admin");
  revalidatePath("/admin/enquiries");
}

export async function replyToSupportConversation(formData: FormData) {
  const actor = await requireAdmin("/admin/enquiries");
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!conversationId || !body) return;
  const agentName = actor.user_metadata?.display_name || actor.user_metadata?.full_name || "ForexTestLab Support";
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { conversationId, senderType: "agent", senderName: String(agentName).slice(0, 120), body } }),
    prisma.supportConversation.update({ where: { id: conversationId }, data: { status: "active", assignedAgentName: String(agentName).slice(0, 120) } }),
  ]);
  await audit("support.reply_sent", "support_conversation", conversationId);
  revalidatePath("/admin/enquiries");
}

export async function resolveSupportConversation(formData: FormData) {
  await requireAdmin("/admin/enquiries");
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return;
  await prisma.supportConversation.update({ where: { id: conversationId }, data: { status: "resolved" } });
  await audit("support.conversation_resolved", "support_conversation", conversationId);
  revalidatePath("/admin/enquiries");
}
