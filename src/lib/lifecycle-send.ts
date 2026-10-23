import "server-only";

import type { User } from "@supabase/supabase-js";

import { sendBrandedEmail } from "@/lib/contact-email";
import { prisma } from "@/lib/db";
import { recordEmailFailure } from "@/lib/email-failures";
import { conversationResolvedEmail, type LifecycleEmail } from "@/lib/lifecycle-email";

const SENT_ACTION = "email.lifecycle_sent";

/**
 * Sends a lifecycle email at most once per key, e.g. `welcome:<userId>` or
 * `pro:<payment reference>`. Payment webhooks are retried and statuses are
 * re-synced, so the key, not the caller, decides whether it was already sent.
 * A failed send is recorded for the operations email check and never thrown:
 * the payment, grant or deletion that triggered it has already happened.
 */
export async function sendLifecycleEmail(key: string, to: string | null | undefined, email: LifecycleEmail): Promise<boolean> {
  if (!to) return false;
  const kind = key.split(":")[0]!;
  try {
    const sent = await prisma.adminAuditEvent.findFirst({
      where: { targetType: kind, targetId: key, action: SENT_ACTION },
      select: { id: true },
    });
    if (sent) return false;
    await sendBrandedEmail({ to, subject: email.subject, text: email.text, options: email.options });
    await prisma.adminAuditEvent.create({
      data: { actorUserId: "system", actorEmail: "system", action: SENT_ACTION, targetType: kind, targetId: key },
    });
    return true;
  } catch (error) {
    await recordEmailFailure("lifecycle", key, error);
    return false;
  }
}

/** Tells the customer their conversation was resolved, each time it is. */
export async function sendResolvedEmail(
  conversationId: string,
  conversation: { customerEmail: string | null; customerName: string | null; subject: string },
): Promise<void> {
  await sendLifecycleEmail(`resolved:${conversationId}:${Date.now()}`, conversation.customerEmail,
    conversationResolvedEmail({ name: conversation.customerName, subject: conversation.subject }));
}

/** The name an account goes by, from Supabase metadata. */
export function accountName(user: Pick<User, "user_metadata">): string | null {
  const metadata = user.user_metadata ?? {};
  const value = [metadata.display_name, metadata.full_name, metadata.name].find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value.trim() : null;
}
