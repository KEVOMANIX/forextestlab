import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const trialCookieName = "ftl_trial_device";
  let newTrialToken: string | null = null;
  if (!request.cookies.get(trialCookieName)?.value) {
    newTrialToken = crypto.randomUUID();
    request.cookies.set(trialCookieName, newTrialToken);
  }

  const config = getSupabasePublicConfig();
  if (!config) {
    const response = NextResponse.next({ request });
    if (newTrialToken) {
      response.cookies.set(trialCookieName, newTrialToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
    }
    return response;
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Validate and refresh the cookie-backed session when necessary.
  await supabase.auth.getUser();
  if (newTrialToken) {
    response.cookies.set(trialCookieName, newTrialToken, {
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
