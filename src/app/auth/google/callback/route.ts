import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { afterSignIn, safeNext } from "@/lib/auth/after-sign-in";
import { GOOGLE_STATE_COOKIE, googleRedirectUri } from "@/lib/auth/google-direct";
import { getPublicRequestOrigin } from "@/lib/request-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getPublicRequestOrigin(request);
  const jar = await cookies();
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(jar.get(GOOGLE_STATE_COOKIE)?.value ?? "{}");
  } catch {
    saved = {};
  }
  jar.delete({ name: GOOGLE_STATE_COOKIE, path: "/auth/google" });
  const next = safeNext(saved.next);
  const fail = (reason: string, detail?: string) => {
    console.error("Direct Google sign-in failed", { reason, detail, callbackHost: url.host });
    return NextResponse.redirect(
      new URL(`/sign-in?error=authentication-callback-failed&next=${encodeURIComponent(next)}`, origin),
    );
  };

  const providerError = url.searchParams.get("error");
  if (providerError) return fail("provider", providerError);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !saved.state || state !== saved.state) return fail("state");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  }).catch(() => null);
  if (!tokenResponse?.ok) return fail("token-exchange", String(tokenResponse?.status ?? "network"));
  const { id_token: idToken } = (await tokenResponse.json()) as { id_token?: string };
  if (!idToken) return fail("no-id-token");

  const supabase = await createServerSupabaseClient();
  if (!supabase) return fail("supabase-unconfigured");
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
  if (error || !data.user) return fail("supabase-id-token", error?.message);

  await afterSignIn(data.user, next);
  return NextResponse.redirect(new URL(next, origin));
}
