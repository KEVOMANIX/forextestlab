import { NextResponse } from "next/server";

import { canAccessSession } from "@/lib/backtest/session-access";
import { extendReplaySeries, loadSession } from "@/lib/backtest/session-store";
import { extendSessionSchema } from "@/lib/backtest/schemas";
import {
  FREE_SESSION_MAX_MS,
  getUserEntitlements,
} from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await loadSession(params.id);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  }

  const user = await getCurrentUser();
  const token = request.headers.get("x-session-token");
  if (!canAccessSession(session, user?.id ?? null, token)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 403 });
  }

  const limit = rateLimit(`extend:${params.id}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  try {
    let requestedEndTime: number | null = null;
    const rawBody = await request.text();
    if (rawBody) {
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { ok: false, error: "Invalid request." },
          { status: 400 },
        );
      }
      const parsed = extendSessionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: "Choose a valid later end date." },
          { status: 422 },
        );
      }
      requestedEndTime = parsed.data.endTime;
      if (requestedEndTime <= session.ctx.state.config.endTime) {
        return NextResponse.json(
          { ok: false, error: "The new end date must be later than the current end date." },
          { status: 422 },
        );
      }

      if (user) {
        const entitlements = await getUserEntitlements(user.id);
        if (
          entitlements.maxSessionDays !== null &&
          requestedEndTime - session.ctx.state.config.startTime > FREE_SESSION_MAX_MS
        ) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Free sessions can cover up to one month. Upgrade to Pro to extend this session further.",
            },
            { status: 403 },
          );
        }
      } else if (
        requestedEndTime - session.ctx.state.config.startTime >
        FREE_SESSION_MAX_MS
      ) {
        return NextResponse.json(
          { ok: false, error: "This session can cover up to one month." },
          { status: 403 },
        );
      }
    }

    const previousEndTime = session.ctx.state.config.endTime;
    if (requestedEndTime !== null) {
      session.ctx.state.config.endTime = requestedEndTime;
    }
    const page = await extendReplaySeries(session);
    if (requestedEndTime !== null && page.candles.length === 0) {
      session.ctx.state.config.endTime = previousEndTime;
      return NextResponse.json(
        {
          ok: false,
          error: "No additional market data is available for the selected period.",
        },
        { status: 422 },
      );
    }
    if (requestedEndTime !== null) {
      await prisma.backtestSession.update({
        where: { id: session.id },
        data: {
          endTime: BigInt(requestedEndTime),
          stateJson: JSON.stringify(session.ctx.state),
        },
      });
    }
    return NextResponse.json({ ok: true, ...page });
  } catch (error) {
    console.error("Replay extension failed:", error);
    return NextResponse.json(
      { ok: false, error: "More replay data could not be loaded." },
      { status: 500 },
    );
  }
}
