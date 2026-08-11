import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const trialCookieName = "ftl_trial_device";
  const response = NextResponse.next();
  if (!request.cookies.get(trialCookieName)?.value) {
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
  // Only the trial/backtester area needs the durable device cookie. Public
  // pages are static assets and must bypass the Worker entirely on Free tier.
  matcher: ["/app/backtest/:path*"],
};
