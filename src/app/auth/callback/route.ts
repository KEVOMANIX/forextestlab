import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/app";
  const supabase = createServerSupabaseClient();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    console.error("Supabase authentication callback failed", {
      errorCode: error.code,
      message: error.message,
      callbackHost: url.host,
    });
  } else {
    console.error("Supabase authentication callback was incomplete", {
      hasCode: Boolean(code),
      configured: Boolean(supabase),
      providerError: url.searchParams.get("error") ?? undefined,
      callbackHost: url.host,
    });
  }

  return NextResponse.redirect(
    new URL(
      `/sign-in?error=authentication-callback-failed&next=${encodeURIComponent(next)}`,
      url.origin,
    ),
  );
}
