# ForexTestLab — Review Findings (Backlog)

> Captured from a full project review on 2026-07-24. Health at time of review:
> `tsc --noEmit` clean · 139 unit tests passing (21 files) · `next lint` clean ·
> zero `any` casts · no `TODO`/`FIXME` markers.
>
> Items are grouped by severity. Each has a file reference, a concrete failure
> scenario, and a suggested fix. Check the box when resolved.

---

## 🔴 Critical

### [ ] C1 — Future candles are sent to the browser (breaks the core no-lookahead guarantee)
- **Where:** `src/app/api/backtest/sessions/[id]/route.ts:36`, plus the create
  route (`sessions/route.ts:76`) and trial route (`trial/route.ts:109`).
  Helper `visibleCandles()` in `session-store.ts` is correct, but every endpoint
  ships `replayCandles: session.ctx.candles` — the **complete** replay window —
  right alongside the correctly-truncated `candles`.
- **Confirmed:** verified directly in source. The E2E test even asserts this as
  intended: `tests/e2e/backtester.spec.ts:28`
  (`expect(body.replayCandles.length).toBe(body.state.totalCandles)`).
- **Failure scenario:** Open a session, inspect the network response for
  `GET /api/backtest/sessions/{id}`. `replayCandles` contains OHLC for candles at
  indices `> visibleIndex` — the not-yet-revealed future. A user reads upcoming
  highs/lows/closes from the JSON and trades with perfect foresight. This is the
  exact promise made to TradingView in the reapplication checklist.
- **Fix:** Never send unrevealed candles. Send only `visibleCandles(ctx)` and
  rely on the server-authoritative `POST .../action` (`next`/`targetIndex`),
  which already returns one `newCandle` at a time after processing SL/TP
  server-side. If latency-free local playback is a hard requirement it is
  fundamentally incompatible with the guarantee — at minimum stream candles
  progressively (one per tick) rather than dumping the window. Update
  `backtester.spec.ts:28` to assert `replayCandles.length === visibleIndex + 1`.
- **Priority:** Blocks launch / TradingView reapplication.

---

## 🟠 High

### [ ] H2 (security) — Unauthenticated email amplifier (support chat)
- **Where:** `src/app/api/support/chat/route.ts:43-61` → `sendContactReceipt`
  in `src/lib/contact-email.ts:104-114`.
- **Failure scenario:** The `start` action is unauthenticated and takes an
  attacker-controlled `email` (regex-validated only). Each call fires two emails,
  one of them **to the attacker-supplied address**, with no rate limit or CAPTCHA.
  A loop mailbombs any victim from your domain/SMTP, burns the SMTP quota, and
  gets the sending domain blacklisted. Each call also writes
  `SupportConversation` + `SupportMessage` + `ContactMessage` rows (DB/inbox flood).
- **Fix:** Require an authenticated user (or proof-of-work/CAPTCHA) for `start`;
  rate-limit per IP and per email; only send receipts to a verified/authenticated
  address, never to a free-form request field.

### [ ] H3 (correctness) — `averageRiskReward` counts losses as positive reward
- **Where:** `src/lib/backtest/statistics.ts:97-107` (confirmed — line 103 uses
  `exit.minus(entry).abs()`).
- **Failure scenario:** Long entry 1.1000, stop 1.0900 (risk 100 pips), exits at
  the stop 1.0900 (a full −1R loss). `reward = |1.0900 − 1.1000| = 0.0100`, ratio
  `= +1.00` — identical to a +1R winner. The metric systematically overstates R:R
  and can show a healthy figure for a strategy that only loses. The existing test
  masks it with internally inconsistent fixture data (a "loser" whose exit is
  above entry for a long).
- **Fix:** Use a signed, direction-aware reward:
  ```ts
  const reward = trade.direction === "long" ? exit.minus(entry) : entry.minus(exit);
  riskRewardSum = riskRewardSum.plus(reward.dividedBy(risk)); // negative for losers
  ```
  Add a test with a genuine losing trade asserting a negative R contribution.

### [ ] H4 (correctness) — SL/TP fills ignore gaps; no exit-side slippage
- **Where:** `src/lib/backtest/execution.ts:125-167` (`checkStopTakeProfit`).
  Entry slippage exists (`execution.ts:93`) but there is **no** stop-loss slippage.
- **Failure scenario:** Long entry 1.1000, SL 1.0990. Weekend gap-down candle
  opens 1.0900 (low 1.0850). Engine records the exit at 1.0990 (−10 pips) even
  though the market never traded there after the gap. Realistic fill ≈ 1.0900
  (−100 pips) — reported loss is ~10× too small. Biases every stopped-out loss
  down and flatters drawdown / net P&L.
- **Fix:** When the candle's open (bid for long / ask for short) is already beyond
  the stop, fill at the open, not the level: `exitPrice = worse_of(level, gappedOpen)`.
  Optionally apply `slippagePips` adversely to stop fills for consistency with
  entry. No test currently covers gap-through-stop.

---

## 🟡 Medium

### [ ] M1 (security) — IDOR: support conversations readable by ID alone
- **Where:** `src/app/api/support/chat/route.ts:11-13, 27-28`.
- **Failure scenario:** Intended auth is "know both `conversationId` and
  `visitorId`", but when `visitorId` is omitted the scoping clause disappears and
  the conversation is returned by `id` only. GET is unauthenticated. Anyone who
  obtains/guesses a conversation `cuid` retrieves the full thread including
  `customerName`, `customerEmail`, and all messages.
- **Fix:** Make `visitorId` (or an authenticated `userId` match) mandatory; return
  404 when absent. Better: bind reads to the authenticated user or a signed token.

### [ ] M2 (security) — No rate limiting on `/api/contact` and support chat
- **Where:** `src/app/api/contact/route.ts:11`, `src/app/api/support/chat/route.ts:31`.
- **Failure scenario:** Unauthenticated, unthrottled endpoints each send an email
  and write a DB row → scriptable inbox/DB flood and SMTP-quota exhaustion.
- **Fix:** Apply `rateLimit(clientIp(request), …)`; consider a CAPTCHA on public
  unauthenticated forms.

### [ ] M3 (security) — Rate-limit bypass via spoofable client IP + per-process buckets
- **Where:** `src/lib/rate-limit.ts:42-46` (`clientIp`) and `:11` (in-memory `buckets`).
- **Failure scenario:** `clientIp` returns the first `x-forwarded-for` entry, which
  the client can set — rotating a spoofed `X-Forwarded-For` defeats every limit
  keyed on it (session create, trial). Per-process `Map` also barely constrains a
  distributed caller on serverless.
- **Fix:** Derive the IP from the trusted platform header only (e.g.
  `x-vercel-forwarded-for`, as `paddle-webhook-ip.ts` already does) and back the
  limiter with Redis/Upstash for production.

### [ ] M4 (correctness) — `maxDrawdownPercent` is percent at max *dollar* drawdown, not max percent
- **Where:** `src/lib/backtest/statistics.ts:168-197`; mirrored in
  `src/lib/backtest/replay-engine.ts:216-222`.
- **Failure scenario:** On non-monotonic curves the largest *percentage* drawdown
  can occur at a different (lower-equity) peak than the largest *dollar* drawdown,
  so the field labelled "max drawdown percent" is not actually the maximum.
- **Fix:** Track max percent independently — at each point compute
  `(peak − equity)/peak` and keep its own running max.

### [ ] M5 (correctness) — Equity curve omits points at manual/session-end closes
- **Where:** `src/lib/backtest/replay-engine.ts:333` (session-end),
  `:573` (`closePosition`); curve only appended in `revealNext` (`:224-231`).
- **Failure scenario:** Manual closes and the forced end-of-session close mutate
  balance/equity without appending an equity point. Results recompute stats from
  the sparse curve (`results.ts:38-43`), so `stats.maxDrawdown` can diverge from
  the engine's live `state.maxDrawdown`, and a trough from a between-candle close
  may never appear.
- **Fix:** Append (or update) an equity point whenever balance changes, or compute
  the stats drawdown from `state.maxDrawdown` rather than re-deriving.

### [ ] M6 (correctness) — Risk-% orders with no stop silently get a phantom 20-pip stop
- **Where:** `src/lib/backtest/replay-engine.ts:433-446` (temp 20-pip SL / 40-pip
  TP) → `calculatePositionSize` (`:448-459`); the phantom stop becomes the real
  `stopLoss` at `:490`.
- **Failure scenario:** A risk-% order without an explicit stop does not get the
  `MIN_LOTS` fallback — instead a 20-pip stop is injected, 1% risk is sized over
  20 pips (a large position), and that stop/target is installed silently. Real
  risk is anchored to an arbitrary 20 pips the user never chose.
- **Fix:** Reject/flag risk-% orders lacking an explicit stop, or surface the
  injected default in the order response so the client can display it.

---

## 🟢 Low / Informational

### [ ] L1 (security) — Trial-cap bypass via client-controlled device cookie
- `src/app/api/backtest/trial/route.ts:32`, `src/lib/trial-device.ts:29-33`.
  The 3-session cap keys on a SHA-256 of the `ftl_trial_device` cookie; a direct
  API caller supplies any value matching `/^[A-Za-z0-9_-]{20,100}$/` to mint a
  fresh "device" and reset the counter (free demo data only — low impact).
  **Fix:** also enforce a per-user trial cap on `UserProfile`.

### [ ] L2 (security) — Non-constant-time anon session token compare
- `src/lib/backtest/session-access.ts:12` uses `token !== session.token`.
  Theoretical timing side-channel (high-entropy token; network jitter dominates).
  **Fix:** `crypto.timingSafeEqual` over fixed-length buffers.

### [ ] L3 (correctness) — Normalizer accepts impossible calendar dates
- `src/lib/market-data/normalizer.ts:133,152` checks only `day<1||day>31`, then
  `Date.UTC(...)` silently rolls `2024-02-30` → `2024-03-01`. **Fix:** after
  `Date.UTC`, verify the resulting UTC Y/M/D match the parsed components; reject
  on mismatch.

### [ ] L4 (correctness) — Daily aggregation buckets on UTC midnight, not FX convention
- `src/lib/market-data/aggregation.ts:14-20`. Most FX dailies align to 17:00 NY
  (~21:00/22:00 UTC); aggregated `1d` candles won't match broker dailies. Domain
  note, not a code defect. (`1h`/`4h`/etc. UTC alignment is fine.)

### [ ] L5 (correctness) — Dead/incorrect NaN guard in `closeAt`
- `src/lib/backtest/replay-engine.ts:273` — `money(exitPrice) === "NaN"` can never
  be true (`money()` throws on non-numeric input). Harmless but misleading.
  **Fix:** remove it or guard with `isFiniteNumeric(exitPrice)`.

### [ ] L6 (correctness) — `profitFactor` returns "Not available" when there are wins but zero losses
- `src/lib/backtest/statistics.ts:128-130`. A perfectly winning strategy is
  indistinguishable from "no trades". Defensible (avoids Infinity) but arguably
  should be an explicit "no losses" sentinel. (Confirmed intended by tests.)

### [ ] I1 (info) — Paddle webhook IP allowlist relies on a spoofable fallback
- `src/lib/billing/paddle-webhook-ip.ts:47-51` falls back to `x-forwarded-for`.
  Defense-in-depth only; the route also verifies the Paddle signature, so IP
  spoofing alone cannot forge a webhook. No action required beyond awareness.

### [ ] I2 (info) — CSV import path scope (not web-reachable today)
- `src/lib/market-data/import.ts:51-61` blocks traversal outside `process.cwd()`
  and enforces `.csv`, but allows reading any `.csv` under the project root. Only
  reachable from the CLI script — no HTTP route invokes it. If an admin upload
  endpoint is ever added, restrict to a dedicated uploads directory.

---

## Verified clean (no issue found)
- Backtest session routes (`[id]`, `action`, `extend`, `context`, `pair`,
  `duplicate`, `results`): ownership enforced via `canAccessSession` /
  `userId`-filtered queries — no IDOR.
- Paddle & Paystack webhooks: signatures verified before processing; idempotency
  via `billingWebhookEvent`; amount/currency/plan re-validated in
  `recordSuccessfulTransaction` (`service.ts:143`).
- `billing/renewal` verifies Paddle subscription ownership; `billing/status`
  checks `payment.userId === user.id`.
- Admin: `requireAdmin`/`isAdminUser` gate the layout and all server actions;
  audit rows are written.
- External market-data providers hit fixed hostnames with server-only keys — no
  SSRF; no user-controlled URLs.
- Secrets: no server secret in `NEXT_PUBLIC_*`, client bundles, or responses.
- Decimal money math: all price/balance/PnL/commission/risk math routes through
  `decimal.js`; native `Number()` only on timestamps/indices/speed.
- Position sizing / pip value: quote===account, base===account, and
  cross-currency approximation each handled correctly; round-DOWN lot sizing
  never over-risks.
- Intrabar conservative policy: direction/side, ambiguity detection, and
  conservative-vs-optimistic selection are correct (only gap is H4).
- Replay indexing / restart / extend and timeframe aggregation: correct.

---

## Suggested fix order
1. **C1** — future-candle leak (blocks launch / TradingView reapplication).
2. **H2** — email amplifier (actively abusable today).
3. **H3, H4** — engine bugs that make reported performance look better than reality.
4. Mediums — rate limiting (M2/M3), IDOR (M1), drawdown accuracy (M4/M5).
5. Lows / info as time permits.

> Separate, unrelated but urgent: a GitHub personal access token is stored in
> plaintext in `~/.claude/settings.json` (permissions allowlist). Revoke it at
> <https://github.com/settings/tokens> and switch to `gh auth login` / a git
> credential helper.
