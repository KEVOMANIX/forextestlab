# ForexTestLab

Marketing site **and** a genuinely functional **public-beta forex backtester**,
built with the Next.js App Router, TypeScript, Tailwind CSS, and TradingView
Lightweight Charts™.

> **ForexTestLab is live in public beta.** Historical market replay, simulated
> trade execution, risk-management tools, and basic performance reporting are
> functional. Additional instruments, indicators, and analytics remain under
> development.
>
> ForexTestLab is educational and analytical **simulation** software. It is not
> a broker, does not execute real-money trades, and does not provide financial
> advice. It is an **independent project and is not affiliated with, sponsored
> by, or endorsed by TradingView** or any market-data provider.

---

## Public-beta scope

**Functional now**

- Public backtester at `/app/backtest` — no account, no payment.
- Currency-pair, timeframe, and historical-period selection.
- Server-controlled market replay (candle-by-candle; **future candles are never
  sent to the browser**).
- Start / pause / resume / next / previous / restart, with a 15×–600× real market-time speed slider.
- Each chart preloads roughly six months of hourly context before the selected 1-minute replay start; context candles never affect execution or analytics.
- Simulated Buy/Sell with stop-loss, take-profit, fixed-lot or risk-% sizing.
- Manual close and automatic SL/TP close (with a conservative intrabar policy).
- Configurable spread, commission, and slippage; balance and equity tracking.
- Trade history, performance statistics, equity curve, and CSV export of trades.

**Under development**

- More instruments (only EUR/USD ships with seeded demo data), indicators,
  advanced analytics, saved accounts/login, and authorised live data providers.

---

## Architecture

```
Browser (React, Lightweight Charts)
  │   fetch /api/backtest/* (session token in header for mutations)
  ▼
Next.js API routes  ──►  Zod validation ──►  Replay/trading engine (pure TS, decimal.js)
  │                                              │
  │  future-data protection: server holds the    │  framework-independent, unit-tested
  │  full candle series, exposes only revealed    ▼
  │  candles                                   Prisma
  ▼                                              │
Market-data provider factory                     ▼
  local_database (default) ─┐                PostgreSQL (prod) / SQLite (dev)
  demo (deterministic)  ────┤  ← candles + sessions + trades + equity
  local_csv (import)    ────┤
  external (disabled)   ────┘  twelvedata / tradermade / dukascopy (env-gated, server-only)
```

- **Prices are stored as strings and all money math uses `decimal.js`** — no JS
  floating-point arithmetic for balances, sizes, commission, risk, or P&L.
- **Engine** (`src/lib/backtest/`): `replay-engine.ts`, `execution.ts`,
  `position-sizing.ts`, `statistics.ts` — pure, no React/DB, fully unit-tested.
- **Market data** (`src/lib/market-data/`): provider interface + implementations,
  CSV parser/normalizer/validators, timeframe aggregation.

---

## Requirements

- Node.js 18.18+ (Node 20/22 recommended), npm.

## Install & run locally

```bash
npm install                 # installs deps + generates the Prisma client
cp .env.example .env         # then adjust values as needed
npm run db:push              # create the SQLite schema (dev)
npm run db:seed              # seed instruments + EUR/USD 5m demo data
npm run dev                  # http://localhost:3000  (backtester at /app/backtest)
```

### Common commands

```bash
npm install        # install dependencies
npm run dev        # dev server
npm run build      # production build
npm start          # run the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit tests
npm run test:e2e   # Playwright E2E (see below)
npm run db:push    # sync Prisma schema to the database
npm run db:seed    # seed demo data
npm run data:import -- ...  # import a CSV (see below)
```

## Environment variables

Copy `.env.example` → `.env` (and `.env.local` for Next.js). Only `NEXT_PUBLIC_*`
is exposed to the browser — keep all keys/tokens without that prefix.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | â€” | Pooled PostgreSQL connection used by the application. |
| `DIRECT_URL` | â€” | Direct/session PostgreSQL connection used for schema operations. |
| `NEXT_PUBLIC_SITE_URL` | `https://forextestlab.com` | Public site URL and auth redirect base. |
| `NEXT_PUBLIC_SUPABASE_URL` | â€” | Supabase project URL used by Auth. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | â€” | Browser-safe Supabase publishable key. |
| `SUPABASE_SECRET_KEY` | â€” | Server-only key used for permanent account deletion. |
| `MARKET_DATA_PROVIDER` | `r2` | `r2` \| `local_database` \| `local_csv` \| `demo`. |
| `ENABLE_DEMO_DATA` | `false` | Fall back to deterministic demo data when no stored data. Keep disabled in production. |
| `R2_ENDPOINT` | â€” | Server-only Cloudflare R2 S3 endpoint. |
| `R2_BUCKET_NAME` | â€” | R2 bucket containing the monthly Parquet files. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | â€” | Server-only R2 API credentials. |
| `R2_PREFIX` | `market_data` | Object-key prefix before `<SYMBOL>/<YEAR>/<MONTH>.parquet`. |
| `TWELVE_DATA_ENABLED` / `TWELVE_DATA_API_KEY` | `false` / — | Disabled external adapter. |
| `TRADERMADE_ENABLED` / `TRADERMADE_API_KEY` | `false` / — | Disabled external adapter. |
| `DUKASCOPY_DATA_AUTHORIZED` | `false` | Manual, owner-authorised import gate. |
| `ADMIN_IMPORT_TOKEN` | — | Bearer token for any admin import endpoint. |
| `DEFAULT_ACCOUNT_BALANCE` / `DEFAULT_SPREAD_PIPS` / `DEFAULT_COMMISSION_PER_LOT` / `DEFAULT_SLIPPAGE_PIPS` | `10000` / `1.0` / `0` / `0` | Simulation defaults. |
| `PADDLE_MODE` | `sandbox` | Paddle environment: `sandbox` or `live`. |
| `PADDLE_SANDBOX_API_KEY` / `PADDLE_LIVE_API_KEY` | - | Server-only Paddle API keys. |
| `PADDLE_SANDBOX_CLIENT_TOKEN` / `PADDLE_LIVE_CLIENT_TOKEN` | - | Paddle.js client tokens selected by `PADDLE_MODE`. |
| `PADDLE_SANDBOX_WEBHOOK_SECRET` / `PADDLE_LIVE_WEBHOOK_SECRET` | - | Secrets used to verify `/api/paddle/webhook`. |
| `PADDLE_SANDBOX_<TIER>_<INTERVAL>_PRICE_ID` | - | Six sandbox recurring IDs for `STARTER`, `PRO`, and `ADVANCED`, each with `MONTH` and `YEAR`. Use the equivalent `PADDLE_LIVE_*` variables in live mode. |
| `PADDLE_<TIER>_<INTERVAL>_PRICE_USD_CENTS` | - | Six USD catalog amounts consumed only by `npm run paddle:seed`. |

Never commit real credentials. `.env*` is git-ignored.

### Supabase Auth setup

1. In Supabase, enable Email authentication and decide whether email
   confirmation is required.
2. Add `http://localhost:3000/auth/callback` and
   `https://forextestlab.com/auth/callback` to the allowed redirect URLs.
3. Set the three Supabase Auth variables above in local and deployment
   environments.
4. Configure a production SMTP provider before launch; Supabase's default email
   service is intended only for limited testing.
5. In the Supabase email provider settings, enable **Secure password change**.
   The account security screen requests Supabase's one-time reauthentication
   code before accepting a new password.

Authenticated sessions are private and linked to the Supabase user UUID.
Anonymous sessions are temporary 24-hour demonstrations, require their opaque
session token for API access, cannot save notes, and do not appear in history or
saved results.

### Paddle billing setup

Billing uses Paddle overlay checkout, verified webhooks, and Paddle's hosted
customer portal. Start in sandbox and keep API keys and webhook secrets
server-side.

1. Set all six `PADDLE_<TIER>_<INTERVAL>_PRICE_USD_CENTS` values, add
   `PADDLE_SANDBOX_API_KEY` locally, and run `npm run paddle:seed`. The command
   creates Starter, Pro, and Advanced SaaS products with monthly and yearly
   recurring prices, then prints all six `pri_...` IDs.
2. Create a sandbox client token beginning with `test_` and set
   `PADDLE_SANDBOX_CLIENT_TOKEN`.
3. Store the printed IDs in the matching
   `PADDLE_SANDBOX_<TIER>_<INTERVAL>_PRICE_ID` variables.
4. In **Paddle > Checkout > Checkout settings**, set the default payment link
   to the sandbox checkout page. Localhost is valid in sandbox. A production
   default payment link must use the real, approved domain.
5. In Paddle, create a notification destination for
   `https://forextestlab.com/api/paddle/webhook`. Subscribe to customer,
   subscription, and `transaction.completed` events, then store its endpoint
   secret as `PADDLE_SANDBOX_WEBHOOK_SECRET`.
6. Deploy and test each tier with Paddle's sandbox card. Successful checkout
   redirects to `/welcome`; subscription provisioning still comes from the
   verified webhook.

For production, add the corresponding `PADDLE_LIVE_*` values, approve the live
domain in Paddle, set `PADDLE_MODE=live`, and redeploy. Sandbox and live catalog
IDs are separate.

To recreate the approved Starter, Pro, and Advanced catalog in live, create a
live API key with product, price, and discount read/write access, set
`PADDLE_LIVE_API_KEY`, then run `npm run paddle:migrate-live`. The idempotent
script skips junk/test entities and writes the old-to-new IDs to
`.tmp/paddle-live-id-map.json`. Webhook requests are checked against Paddle's current
environment-specific `/ips` response before signature verification.

## Database setup & migration

The Prisma datasource is configured for **PostgreSQL** (works locally and on
Vercel). Recommended: **Supabase** (or Neon / Vercel Postgres).

1. Create the database and copy two connection strings into `.env`
   (Supabase → Project Settings → Database → **Connection pooling**):
   - `DATABASE_URL` → **pooled**, port `6543`, with `?pgbouncer=true&connection_limit=1`
     (used by the app; required for serverless).
   - `DIRECT_URL` → **session** pooler, port `5432` (used by `db push` / migrations).
   > URL-encode special characters in the password (e.g. `#` → `%23`). Use the
   > **pooler** host (`aws-0-<region>.pooler.supabase.com`), not the IPv6-only
   > direct `db.<ref>.supabase.co` host.
2. `npm run db:push` to create the tables, then `npm run db:seed` for EUR/USD
   demo data. No column-type changes are needed — prices are stored as strings.

To develop fully offline instead, switch the datasource `provider` to `sqlite`
and set `DATABASE_URL="file:./dev.db"`.

## Seed data & demonstration data

`npm run db:seed` upserts the instrument catalogue and generates a
**deterministic EUR/USD 5-minute** dataset (~4,000 candles over a fixed 2-week
window). This data is **generated, not committed**, so no large dataset lives in
the repo. It is clearly labelled in the UI:

> “This session uses generated demonstration data and does not represent an
> actual market feed.”

Larger timeframes (15m/30m/1h/4h/1d) are **aggregated on the server** from the
stored 5m candles. `1m` requires finer source data and is unavailable for demo.

## CSV import

Import historical CSV files you have lawfully obtained:

```bash
npm run data:import -- \
  --file ./data/EURUSD_5m.csv \
  --symbol EURUSD \
  --timeframe 5m \
  --timezone UTC \
  --source manual-import
```

Optional header mapping: `--map.open=Open --map.timestamp=Date`. Supported
columns include `timestamp` / `date` / `time`, `open|high|low|close`, `volume`,
and `bid_* / ask_*`. The importer streams the file, validates every row (numeric
prices, valid OHLC relationships, present timestamps), converts to UTC,
deduplicates, imports in batches, detects gaps, and writes an audit `DataImport`
row. Paths are restricted to the project directory (no traversal) and must be
`.csv`.

## Testing

**Unit (Vitest):** `npm test` — CSV parse, candle validation, duplicate
detection, timeframe aggregation (all 7), pip/position sizing, long/short P&L,
spread/commission/slippage, SL/TP execution, manual close, intrabar ambiguity,
drawdown, profit factor, replay indexing, restart.

**E2E (Playwright):** first build, create/seed the DB, and start the server:

```bash
npm run build && npm run db:push && npm run db:seed
npx playwright install    # one-time browser download
npm start &               # or let Playwright start it
npm run test:e2e
```

The E2E suite opens the public backtester, starts a EUR/USD session, asserts
future candles are not returned early, places a Buy with SL/TP, advances, closes,
checks balance/stats/history, restarts, and tests the mobile flow — all without
login.

## Production build

```bash
npm run build
npm start
```

## Deploying to Vercel

1. Push the repo to GitHub, then import it at <https://vercel.com/new>.
2. **Provision Postgres** (Supabase / Neon / Vercel Postgres). The schema is
   already PostgreSQL.
3. Add env vars in **Project → Settings → Environment Variables**: `DATABASE_URL`
   (pooled), `DIRECT_URL` (direct/session), `NEXT_PUBLIC_APP_URL`,
   `MARKET_DATA_PROVIDER=r2`, `ENABLE_DEMO_DATA=false`, and the five `R2_*`
   variables documented above. Use `R2_PREFIX=market_data` for the downloader's
   default upload structure.
4. Create + seed the tables against Postgres — run `npm run db:push` and
   `npm run db:seed` locally with the production `DATABASE_URL`/`DIRECT_URL` in
   your `.env` (a one-off). `postinstall` runs `prisma generate` on Vercel.
5. Deploy.

### Connect the domain `forextestlab.com`

**Project → Settings → Domains → Add** `forextestlab.com` (+ `www`). At your
registrar set the records Vercel shows — apex `A` → `76.76.21.21`, `www` `CNAME`
→ `cname.vercel-dns.com`. HTTPS is provisioned automatically. Set
`NEXT_PUBLIC_APP_URL` to the final domain and redeploy.

## Cloudflare R2 historical-data provider

- `R2ParquetProvider` lists uploaded monthly objects and only enables symbols
  that currently exist in R2.
- Parquet files remain private. The server downloads and decodes them; R2
  credentials and object URLs are never sent to the browser.
- Source data is one-minute UTC OHLCV with ZSTD compression. Replay requests are
  aggregated to the requested timeframe on the server.
- The expected object layout is
  `market_data/<SYMBOL>/<YEAR>/<two-digit-month>.parquet`.

## Replacing the local provider / adding an authorised external provider

- The active provider is chosen by `MARKET_DATA_PROVIDER`; unknown symbols/ranges
  fall back to deterministic demo data when `ENABLE_DEMO_DATA=true`.
- To add an authorised provider, implement the `ExternalApiProvider` interface in
  `src/lib/market-data/providers/`. The contract is: **fetch server-side →
  validate → normalise → store in the DB → serve replay from the DB**
  (`persistExternalCandles` helps). Disabled `twelvedata` and `tradermade`
  adapters are included as templates.

### API-key security requirements

- All third-party requests are made **server-side only**. Never place provider
  credentials in client JS, `NEXT_PUBLIC_*`, HTML, network responses, source
  maps, or logs.
- External adapters are env-gated and disabled by default; they fail safely and
  fall back to local data. Do not call an external API during candle replay —
  ingest into the DB first, then replay from the DB.

### ⚠️ Market-data licensing warning

> Free API access does not automatically include public-display, redistribution,
> or commercial-use rights. Before enabling an external provider on the public
> ForexTestLab platform, the project owner must review the provider’s current
> terms and obtain any required written permission or commercial licence.

The Dukascopy adapter supports **manual import of files you have lawfully
downloaded yourself** only. It performs no automatic download or scraping, and
Dukascopy is not an authorised ForexTestLab partner.

## Lightweight Charts licence & attribution

The app uses **TradingView Lightweight Charts™** (`lightweight-charts`, Apache
2.0). The required attribution is displayed in the app footer and **must remain
visible** — do not remove or obscure it. Review the library’s current licence and
trademark/attribution requirements before launch. No TradingView Advanced Charts,
source files, screenshots, or branding are used.

## Public-beta limitations

- Only EUR/USD ships with seeded demo data; other pairs appear disabled until
  data is added.
- Candle data cannot always reveal whether SL or TP was hit first within one
  candle — the **conservative** policy (assume the adverse level first) is the
  default and such trades are flagged as ambiguous. Results are **not**
  tick-accurate.
- One open position at a time in the beta.
- In-memory rate limiting is per-instance; back it with Redis for scale.

## TradingView reapplication checklist

- [ ] ForexTestLab is publicly accessible.
- [ ] The backtester is functional.
- [ ] EUR/USD demonstration session works.
- [ ] Replay controls work.
- [ ] Future candles are protected server-side.
- [ ] Simulated Buy and Sell trades work.
- [ ] Stop-loss and take-profit work.
- [ ] Results and statistics work.
- [ ] Mobile layout works.
- [ ] Legal pages are published.
- [ ] Contact email works.
- [ ] No major broken links exist.
- [ ] Market-data source is described accurately.
- [ ] Demonstration data is clearly labelled.
- [ ] Lightweight Charts attribution is visible where required.
- [ ] ForexTestLab does not claim TradingView affiliation.
- [ ] The public demo does not require payment.
- [ ] A short product demonstration video is ready.
- [ ] A test account is available only if optional account features require it.
- [ ] The application URL is ready for review.

See [`docs/implementation-plan.md`](docs/implementation-plan.md) for the phased
build plan, [`docs/production-product-definition.md`](docs/production-product-definition.md)
for the proposed official Version 1 scope, and
[`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) for the pre-launch review list.
