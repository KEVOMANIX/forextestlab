import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Account deletion is not configured." },
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
