import "server-only";

import { prisma } from "@/lib/db";

/**
 * Failed sends are recorded as system audit events so they are counted by the
 * operations email check and visible to admins. Before this they only reached
 * the server log, so a customer who never got a reply looked answered.
 */
export const EMAIL_FAILURE_ACTION = "email.failed";

export type EmailFailureKind = "contact_message" | "support_conversation" | "support_direct" | "feedback" | "inbound_forward" | "lifecycle";

export async function recordEmailFailure(kind: EmailFailureKind, targetId: string | null, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  console.error(`Email delivery failed (${kind}${targetId ? ` ${targetId}` : ""}): ${message}`);
  try {
    await prisma.adminAuditEvent.create({
      data: {
        actorUserId: "system",
        actorEmail: "system",
        action: EMAIL_FAILURE_ACTION,
        targetType: kind,
        targetId,
        metadataJson: JSON.stringify({ message }),
      },
    });
  } catch (recordError) {
    console.error("Could not record the email failure:", recordError);
  }
}
