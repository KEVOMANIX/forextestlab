import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { safeNext } from "@/lib/auth/after-sign-in";
import { GOOGLE_STATE_COOKIE, googleDirectEnabled, googleRedirectUri } from "@/lib/auth/google-direct";
import { getPublicRequestOrigin } from "@/lib/request-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const origin = getPublicRequestOrigin(request);
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const failed = NextResponse.redirect(
    new URL(`/sign-in?error=authentication-callback-failed&next=${encodeURIComponent(next)}`, origin),
  );

  if (!googleDirectEnabled()) {
    // Previous flow: Supabase-hosted Google OAuth (PKCE verifier cookie set here).
    const supabase = await createServerSupabaseClient();
    if (!supabase) return failed;
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("next", next);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
        queryParams: { access_type: "offline", prompt: "select_account" },
      },
    });
    if (error || !data.url) return failed;
    return NextResponse.redirect(data.url);
  }

  const state = randomBytes(24).toString("base64url");
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  auth.searchParams.set("redirect_uri", googleRedirectUri(origin));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("prompt", "select_account");
  auth.searchParams.set("state", state);

  const response = NextResponse.redirect(auth);
  response.cookies.set(GOOGLE_STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/auth/google",
    maxAge: 600,
  });
  return response;
}
