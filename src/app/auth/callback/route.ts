import { NextResponse } from "next/server";

import { getPublicRequestOrigin } from "@/lib/request-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordProductEventOncePerUser } from "@/lib/product-analytics";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const publicOrigin = getPublicRequestOrigin(request);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/account/continue";
  const supabase = await createServerSupabaseClient();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await supabase.auth.getUser();
      if (data.user) await recordProductEventOncePerUser({ name: "signup_completed", userId: data.user.id, path: next }).catch(() => undefined);
      return NextResponse.redirect(new URL(next, publicOrigin));
    }
    console.error("Supabase authentication callback failed", {
      errorCode: error.code,
      message: error.message,
      callbackHost: url.host,
      redirectOrigin: publicOrigin,
    });
  } else {
    console.error("Supabase authentication callback was incomplete", {
      hasCode: Boolean(code),
      configured: Boolean(supabase),
      providerError: url.searchParams.get("error") ?? undefined,
      callbackHost: url.host,
      redirectOrigin: publicOrigin,
    });
  }

  return NextResponse.redirect(
    new URL(
      `/sign-in?error=authentication-callback-failed&next=${encodeURIComponent(next)}`,
      publicOrigin,
    ),
  );
}
