import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
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
  // The device-trial cookie (`ftl_trial_device`) is no longer issued: the Free
  // allowance is counted per account. Existing cookies simply expire.
  return response;
}

export const config = {
  // Refresh before authenticated pages/API handlers read their session.
  // Static marketing pages and assets do not need auth middleware, and neither
  // does /api/version: every open app tab polls it each minute, and each poll
  // cost a Supabase Auth round trip.
  matcher: ["/app/:path*", "/account/:path*", "/admin/:path*", "/support-team/:path*", "/sign-in", "/sign-up", "/auth/:path*", "/api/((?!version$).*)"],
};
