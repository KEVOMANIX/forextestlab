import { z } from "zod";

export const feedbackDraftSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().trim().min(1).max(160).refine((s) => !/[\r\n]/.test(s)),
  body: z.string().trim().min(1).max(8000),
  audience: z.enum(["all", "selected"]),
  userIds: z.array(z.string().min(1).max(100)).max(1000),
}).refine((d) => d.audience === "all" || d.userIds.length > 0, "Select at least one user.");

export const FEEDBACK_SUBJECT = "How is ForexTestLab working for you?";
export const FEEDBACK_BODY = `Thanks for trying ForexTestLab!

Have you run into anything that doesn't work as expected? Or is there a feature or improvement you'd like to see?

Just reply to this email. If you're reporting a bug, a quick description of what happened—and a screenshot if possible—will help us investigate.

You can also reach us through the support chat inside the app.

Thanks for helping us improve ForexTestLab.

Kevin`;

export function feedbackRecipients(
  profiles: { email: string; displayName: string | null }[],
  optOuts: string[],
) {
  const excluded = new Set(optOuts.map((email) => email.trim().toLowerCase()));
  const unique = new Map<string, { email: string; name: string }>();
  for (const profile of profiles) {
    const email = profile.email.trim().toLowerCase();
    if (!z.string().email().safeParse(email).success || excluded.has(email)) continue;
    unique.set(email, { email, name: profile.displayName?.trim() || email.split("@")[0]! });
  }
  return [...unique.values()];
}
