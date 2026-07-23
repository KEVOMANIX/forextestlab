import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const value = (payload as { displayName?: unknown } | null)?.displayName;
  const displayName = typeof value === "string" ? value.trim() : "";
  if (displayName.length < 2 || displayName.length > 80) {
    return NextResponse.json(
      { ok: false, error: "Display name must be between 2 and 80 characters." },
      { status: 422 },
    );
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Profile updates are temporarily unavailable." },
      { status: 503 },
    );
  }

  const { error } = await supabase.auth.updateUser({
    data: { display_name: displayName },
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Your profile could not be updated." }, { status: 500 });
  }

  await prisma.userProfile.update({
    where: { id: user.id },
    data: { displayName },
  });

  return NextResponse.json({ ok: true, displayName });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Account deletion is temporarily unavailable. Please contact support." },
      { status: 503 },
    );
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // The database relation cascades sessions, orders, trades, and equity rows.
  await prisma.userProfile.deleteMany({ where: { id: user.id } });
  return NextResponse.json({ ok: true });
}
