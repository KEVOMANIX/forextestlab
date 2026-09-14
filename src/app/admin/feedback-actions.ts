"use server";

import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { feedbackDraftSchema, feedbackRecipients } from "@/lib/feedback-email";
import { feedbackEmailContent, sendFeedbackEmail } from "@/lib/contact-email";

const path = "/admin/emails";

export async function searchFeedbackUsers(query: string, page = 0) {
  await requireAdmin(path);
  const q = query.trim().slice(0, 120);
  return prisma.userProfile.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] } : {},
    select: { id: true, email: true, displayName: true }, orderBy: { id: "asc" },
    skip: Math.max(0, Math.min(10000, Math.floor(page) || 0)) * 50, take: 50,
  });
}

export async function createFeedbackDraft(input: unknown) {
  const actor = await requireAdmin(path);
  const draft = feedbackDraftSchema.parse(input);
  const existing = await prisma.feedbackCampaign.findUnique({ where: { id: draft.id }, select: { id: true } });
  if (existing) return existing.id;
  const [profiles, optOuts] = await Promise.all([
    prisma.userProfile.findMany({ where: draft.audience === "all" ? {} : { id: { in: draft.userIds } }, select: { email: true, displayName: true } }),
    prisma.feedbackEmailOptOut.findMany({ select: { email: true } }),
  ]);
  const recipients = feedbackRecipients(profiles, optOuts.map((o) => o.email));
  if (!recipients.length) throw new Error("No eligible recipients. They may have unsubscribed.");
  await prisma.$transaction(async (tx) => {
    await tx.feedbackCampaign.create({ data: { id: draft.id, subject: draft.subject, body: draft.body, actorId: actor.id } });
    // Keep insert statements bounded for larger audiences.
    for (let i = 0; i < recipients.length; i += 250) {
      await tx.feedbackRecipient.createMany({ data: recipients.slice(i, i + 250).map((r) => ({ ...r, campaignId: draft.id, token: randomBytes(24).toString("hex") })) });
    }
    await tx.adminAuditEvent.create({ data: { actorUserId: actor.id, actorEmail: actor.email ?? "unknown", action: "feedback.drafted", targetType: "feedback_campaign", targetId: draft.id, metadataJson: JSON.stringify({ count: recipients.length }) } });
  }, { timeout: 30000 });
  return draft.id;
}

export async function feedbackCampaignDetails(id: string) {
  await requireAdmin(path);
  const campaign = await prisma.feedbackCampaign.findUniqueOrThrow({ where: { id } });
  const [groups, recipients] = await Promise.all([
    prisma.feedbackRecipient.groupBy({ by: ["status"], where: { campaignId: id }, _count: true }),
    prisma.feedbackRecipient.findMany({ where: { campaignId: id }, select: { email: true, name: true, status: true }, orderBy: { email: "asc" }, take: 100 }),
  ]);
  const counts: Record<string, number> = {};
  groups.forEach((g) => { counts[g.status] = g._count; });
  return { id, subject: campaign.subject, body: campaign.body, status: campaign.status, counts, recipients,
    previewHtml: feedbackEmailContent(recipients[0]?.name ?? "Trader", campaign.subject, campaign.body, "#unsubscribe-preview").html };
}

export async function setFeedbackCampaignStatus(id: string, status: "sending" | "paused") {
  const actor = await requireAdmin(path);
  if (status !== "sending" && status !== "paused") throw new Error("Invalid status.");
  await prisma.$transaction(async (tx) => {
    await tx.feedbackCampaign.updateMany({ where: { id, status: { in: ["draft", "paused", "sending"] } }, data: { status } });
    await tx.adminAuditEvent.create({ data: { actorUserId: actor.id, actorEmail: actor.email ?? "unknown", action: `feedback.${status}`, targetType: "feedback_campaign", targetId: id } });
  });
}

/** A durable batch: reloading/resuming never resends an attempted recipient. */
export async function sendFeedbackBatch(id: string) {
  await requireAdmin(path);
  const leaseUntil = new Date(Date.now() + 120000);
  const acquired = await prisma.feedbackCampaign.updateMany({
    where: { id, status: "sending", OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseUntil },
  });
  if (!acquired.count) return;
  try {
    const campaign = await prisma.feedbackCampaign.findUniqueOrThrow({ where: { id } });
    const recipients = await prisma.feedbackRecipient.findMany({ where: { campaignId: id, status: "pending" }, orderBy: { id: "asc" }, take: 5 });
    for (const recipient of recipients) {
      const live = await prisma.feedbackCampaign.findUnique({ where: { id }, select: { status: true } });
      if (live?.status !== "sending") break;
      const claimed = await prisma.feedbackRecipient.updateMany({ where: { id: recipient.id, status: "pending" }, data: { status: "sending", attemptedAt: new Date() } });
      if (!claimed.count) continue;
      const optedOut = await prisma.feedbackEmailOptOut.findUnique({ where: { email: recipient.email } });
      if (optedOut) {
        await prisma.feedbackRecipient.update({ where: { id: recipient.id }, data: { status: "skipped" } });
        continue;
      }
      try {
        await sendFeedbackEmail({ ...recipient, subject: campaign.subject, body: campaign.body });
        await prisma.feedbackRecipient.update({ where: { id: recipient.id }, data: { status: "sent", sentAt: new Date() } });
      } catch {
        // A network error can occur after acceptance. Never retry automatically.
        await prisma.feedbackRecipient.update({ where: { id: recipient.id }, data: { status: "unconfirmed" } });
        await prisma.feedbackCampaign.updateMany({ where: { id, status: "sending" }, data: { status: "paused" } });
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const pending = await prisma.feedbackRecipient.count({ where: { campaignId: id, status: "pending" } });
    if (!pending) await prisma.feedbackCampaign.updateMany({ where: { id, status: "sending" }, data: { status: "completed" } });
  } finally {
    await prisma.feedbackCampaign.updateMany({ where: { id, leaseUntil }, data: { leaseUntil: null } });
  }
}
