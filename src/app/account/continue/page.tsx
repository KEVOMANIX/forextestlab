import { redirect } from "next/navigation";

import { ensureUserProfile, requireUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";

export default async function AccountContinuePage() {
  const user = await requireUser("/account/continue");
  await ensureUserProfile(user);

  const entitlements = await getUserEntitlements(user.id);
  redirect(
    entitlements.plan === "pro"
      ? "/app"
      : "/pricing?from=sign-in",
  );
}
