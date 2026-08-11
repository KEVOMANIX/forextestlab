import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import type { ApiResult } from "@/lib/types";
import { validateWaitlist } from "@/lib/validation";

// Run on the Node.js runtime — the local storage provider uses the filesystem.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse<ApiResult>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid request body." },
      { status: 400 },
    );
  }

  const result = validateWaitlist(payload);
  if (!result.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Please correct the highlighted fields.",
        errors: result.errors,
      },
      { status: 422 },
    );
  }

  try {
    await prisma.waitlistEntry.upsert({
      where: { email: result.data.email.trim().toLowerCase() },
      create: {
        name: result.data.name,
        email: result.data.email.trim().toLowerCase(),
        experience: result.data.experience,
        pairsJson: JSON.stringify(result.data.pairs),
        consent: result.data.consent,
      },
      update: {
        name: result.data.name,
        experience: result.data.experience,
        pairsJson: JSON.stringify(result.data.pairs),
        consent: result.data.consent,
      },
    });
  } catch (error) {
    console.error("Failed to save waitlist submission:", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Something went wrong on our side. Please try again later.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message:
        "You're on the list. We'll email you as early access becomes available.",
    },
    { status: 201 },
  );
}
