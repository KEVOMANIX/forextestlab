import { NextResponse } from "next/server";

import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "@/lib/auth/disposable-email";

export const runtime = "nodejs";

/** Pre-sign-up check: rejects throwaway inboxes before Supabase sends a confirmation. */
export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email : "";
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }
  if (isDisposableEmail(email)) {
    return NextResponse.json({ ok: false, message: DISPOSABLE_EMAIL_MESSAGE }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
