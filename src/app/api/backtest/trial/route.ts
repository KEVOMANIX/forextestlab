import { NextResponse } from "next/server";

import { ensureUserProfile } from "@/lib/auth";
import {
  createSession,
  toPublicState,
  visibleCandles,
} from "@/lib/backtest/session-store";
import { selectTrialWindow } from "@/lib/backtest/trial-window";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { getMarketDataProvider } from "@/lib/market-data";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";
import { trialDeviceIdFromRequest } from "@/lib/trial-device";

const TRIAL_SYMBOL = "EURUSD";
const MAX_WINDOW_ATTEMPTS = 5;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in to start your free trial." },
      { status: 401 },
    );
  }
  await ensureUserProfile(user);

  const trialDeviceId = trialDeviceIdFromRequest(request);
  if (!trialDeviceId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Your trial device could not be verified. Refresh and try again.",
      },
      { status: 400 },
    );
  }
  const entitlements = await getUserEntitlements(user.id, trialDeviceId);
  if (entitlements.plan !== "free") {
    return NextResponse.json(
      { ok: false, error: "Your account already has full session access." },
      { status: 409 },
    );
  }
  if ((entitlements.trialSessionsRemaining ?? 0) <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "This device has used its three trial sessions.",
      },
      { status: 403 },
    );
  }

  const limit = rateLimit(
    `instant-trial:${trialDeviceId}:${clientIp(request)}`,
    6,
    60 * 60_000,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Please wait before starting another trial session." },
      { status: 429 },
    );
  }

  const ranges = await getMarketDataProvider().getAvailableRanges(
    TRIAL_SYMBOL,
    "1m",
  );
  if (ranges.length === 0) {
    return NextResponse.json(
      { ok: false, error: "EUR/USD trial data is temporarily unavailable." },
      { status: 503 },
    );
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_WINDOW_ATTEMPTS; attempt += 1) {
    const window = selectTrialWindow(ranges);
    if (!window) break;
    try {
      const session = await createSession({
        name: `EUR/USD Trial · ${new Intl.DateTimeFormat("en", {
          month: "short",
          year: "numeric",
          timeZone: "America/New_York",
        }).format(window.startTime)}`,
        symbols: [TRIAL_SYMBOL],
        symbol: TRIAL_SYMBOL,
        timeframe: "1m",
        startTime: window.startTime,
        endTime: window.endTime,
        userId: user.id,
        trialDeviceId,
        trialSession: true,
      });
      return NextResponse.json(
        {
          ok: true,
          sessionId: session.id,
          token: session.token,
          state: toPublicState(session.ctx, session.anonymous),
          candles: visibleCandles(session.ctx),
          replayCandles: session.ctx.candles,
          contextCandles: session.contextCandles,
        },
        { status: 201 },
      );
    } catch (error) {
      lastError = error;
    }
  }

  console.error("Instant trial session could not be created:", lastError);
  return NextResponse.json(
    {
      ok: false,
      error: "A trial period could not be prepared. Please try again.",
    },
    { status: 503 },
  );
}
