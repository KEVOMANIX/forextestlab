import "server-only";

import { billingEnabled } from "@/lib/billing/availability";
import { prisma } from "@/lib/db";
import { accessEndingSoonEmail } from "@/lib/lifecycle-email";
import { sendLifecycleEmail } from "@/lib/lifecycle-send";

const REMIND_BEFORE_MS = 3 * 86_400_000;

/**
 * Warns traders whose Pro ends within three days and will not renew by itself:
 * a Kenya pass, or access the team granted. Subscribers are skipped; their
 * renewal is the provider's job. While billing is switched off everyone has
 * Pro, so there is nothing to warn about.
 *
 * Run by the operations monitor every 15 minutes; the key (user and end date)
 * makes each reminder go once, and a new end date earns a new one.
 */
export async function sendAccessEndingReminders(now = new Date()): Promise<number> {
  if (!billingEnabled()) return 0;
  const ending = await prisma.userProfile.findMany({
    where: {
      proAccessUntil: { gt: now, lte: new Date(now.getTime() + REMIND_BEFORE_MS) },
      billingSubscriptions: { none: { status: { in: ["active", "trialing"] }, cancelAtPeriodEnd: false } },
    },
    select: { id: true, email: true, displayName: true, proAccessUntil: true },
    take: 200,
  });
  let sent = 0;
  for (const profile of ending) {
    const endsAt = profile.proAccessUntil!;
    if (await sendLifecycleEmail(`access_ending:${profile.id}:${endsAt.toISOString().slice(0, 10)}`, profile.email,
      accessEndingSoonEmail({ name: profile.displayName, endsAt }))) sent += 1;
  }
  return sent;
}
