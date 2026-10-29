"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { PLAN_PREVIEW_COOKIE } from "@/lib/billing/plan-preview";

import type { AccessResult } from "@/components/admin/AccessGrantControls";
import { requireAdmin } from "@/lib/admin";
import { billingEnabled } from "@/lib/billing/availability";
import { sendSupportEmailReply, sendSupportMessageNotification } from "@/lib/contact-email";
import { prisma } from "@/lib/db";
import { formatNewYorkDateTime } from "@/lib/date-time";
import { recordEmailFailure } from "@/lib/email-failures";
import { accessGrantedEmail, accessRevokedEmail } from "@/lib/lifecycle-email";
import { sendLifecycleEmail, sendResolvedEmail } from "@/lib/lifecycle-send";

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

/**
 * Admin "view as Free": treats this admin's account as Free across the app
 * (limits, locks and server checks) without changing billing for anyone else.
 */
export async function setPlanPreview(formData: FormData) {
  await requireAdmin("/admin");
  const store = await cookies();
  if (formData.get("mode") === "free") {
    store.set(PLAN_PREVIEW_COOKIE, "free", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 60 * 60 });
    redirect("/app/backtest");
  }
  store.delete(PLAN_PREVIEW_COOKIE);
  redirect(String(formData.get("returnTo") ?? "").startsWith("/") ? String(formData.get("returnTo")) : "/app");
}

const SELF_CHANGE = "You can't change your own access. Ask another admin to do it.";

export async function grantManualAccess(_previous: AccessResult, formData: FormData): Promise<AccessResult> {
  const actor = await requireAdmin("/admin/users");
  const userId = String(formData.get("userId") ?? "");
  const days = Number(formData.get("days") ?? 30);
  if (userId === actor.id) return { ok: false, message: SELF_CHANGE };
  if (!userId || ![30, 90, 365].includes(days)) return { ok: false, message: "Choose 30 days, 90 days or 1 year." };

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { proAccessUntil: true, email: true, displayName: true },
  });
  if (!profile) return { ok: false, message: "This account no longer exists." };
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
  after(() => sendLifecycleEmail(`access_granted:${userId}:${accessUntil.toISOString()}`, profile.email,
    accessGrantedEmail({ name: profile.displayName, until: accessUntil, days })));
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { ok: true, message: `Pro granted until ${formatNewYorkDateTime(accessUntil)}.` };
}

export async function revokeManualAccess(_previous: AccessResult, formData: FormData): Promise<AccessResult> {
  const actor = await requireAdmin("/admin/users");
  const userId = String(formData.get("userId") ?? "");
  if (userId === actor.id) return { ok: false, message: SELF_CHANGE };
  if (!userId) return { ok: false, message: "No account was selected." };
  const profile = await prisma.userProfile.update({
    where: { id: userId },
    data: { proAccessUntil: null },
    select: { email: true, displayName: true },
  });
  await audit("access.manual_revoked", "user", userId);
  // While billing is off everyone has Pro, so "your Pro has ended" would be untrue.
  if (billingEnabled()) {
    after(() => sendLifecycleEmail(`access_revoked:${userId}:${Date.now()}`, profile.email, accessRevokedEmail(profile.displayName)));
  }
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return { ok: true, message: "Grant removed." };
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
  const [, conversation] = await prisma.$transaction([
    prisma.supportMessage.create({ data: { conversationId, senderType: "agent", senderName: String(agentName).slice(0, 120), body } }),
    prisma.supportConversation.update({
      where: { id: conversationId },
      data: { status: "active", assignedAgentName: String(agentName).slice(0, 120), lastMessageAt: new Date() },
      select: { customerEmail: true, customerName: true, subject: true, channel: true },
    }),
  ]);
  await audit("support.reply_sent", "support_conversation", conversationId);
  // A reply saved here used to reach nobody: the customer was never emailed.
  const email = conversation.customerEmail;
  if (email) {
    after(() => (conversation.channel === "email"
      ? sendSupportEmailReply({ email, name: conversation.customerName ?? "Customer", subject: conversation.subject, body })
      : sendSupportMessageNotification({ email, name: conversation.customerName ?? "Customer", subject: conversation.subject, preview: body.slice(0, 300) })
    ).catch((error) => recordEmailFailure("support_conversation", conversationId, error)));
  }
  revalidatePath("/admin/enquiries");
}

export async function resolveSupportConversation(formData: FormData) {
  await requireAdmin("/admin/enquiries");
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return;
  const conversation = await prisma.supportConversation.update({
    where: { id: conversationId },
    data: { status: "resolved" },
    select: { customerEmail: true, customerName: true, subject: true },
  });
  await audit("support.conversation_resolved", "support_conversation", conversationId);
  after(() => sendResolvedEmail(conversationId, conversation));
  revalidatePath("/admin/enquiries");
}
