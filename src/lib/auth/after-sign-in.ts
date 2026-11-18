import { after } from "next/server";
import type { User } from "@supabase/supabase-js";

import { welcomeEmail } from "@/lib/lifecycle-email";
import { accountName, sendLifecycleEmail } from "@/lib/lifecycle-send";
import { recordProductEventOncePerUser } from "@/lib/product-analytics";

/** Shared follow-up for every completed sign-in (analytics + welcome email). */
export async function afterSignIn(user: User, next: string) {
  await recordProductEventOncePerUser({ name: "signup_completed", userId: user.id, path: next }).catch(() => undefined);
  // Only accounts created in the last two days are welcomed: every
  // sign-in comes through here, and older accounts never had one.
  if (Date.now() - Date.parse(user.created_at) < 2 * 86_400_000) {
    after(() => sendLifecycleEmail(`welcome:${user.id}`, user.email, welcomeEmail(accountName(user))));
  }
}

export function safeNext(requested: string | null | undefined): string {
  return requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/account/continue";
}
