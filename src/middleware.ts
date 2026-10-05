import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const trialCookieName = "ftl_trial_device";
  let response = NextResponse.next({ request });
  const authConfig = getSupabasePublicConfig();
  const hasAuthCookie = request.cookies.getAll().some(({ name }) =>
    /^sb-.+-auth-token(?:\.\d+)?$/.test(name),
  );
  if (authConfig && hasAuthCookie) {
    const supabase = createServerClient(authConfig.url, authConfig.publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          // Server Components need the new tokens in this request, and the
          // browser needs the rotated refresh token on its next visit.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          const previousCookies = response.cookies.getAll();
          response = NextResponse.next({ request });
          previousCookies.forEach((cookie) => response.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          response.headers.set("Cache-Control", "private, no-store");
        },
      },
    });
    await supabase.auth.getUser();
  }
  if (request.nextUrl.pathname.startsWith("/app/backtest") && !request.cookies.get(trialCookieName)?.value) {
    response.cookies.set(trialCookieName, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  }
  return response;
}

export const config = {
  // Refresh before authenticated pages/API handlers read their session.
  // Static marketing pages and assets do not need auth middleware.
  matcher: ["/app/:path*", "/account/:path*", "/admin/:path*", "/support-team/:path*", "/sign-in", "/sign-up", "/auth/:path*", "/api/:path*"],
};
