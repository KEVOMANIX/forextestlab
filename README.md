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
- Start / pause / resume / next / previous / restart, with real market-time
  replay up to 1,200× on Free and 28,800× on Pro. Ultra-fast settings batch
  candles per animation frame while preserving candle-by-candle execution.
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
AWS Lightsail: Next.js API routes ──► replay/trading engine
  │                                      │
  │  future-data protection              ├──► Supabase PostgreSQL
  │  exposes only revealed candles       │    accounts, sessions, trades
  ▼                                      │
Cloudflare R2 monthly Parquet files ◄────┘
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
npm run db:push              # create/update the PostgreSQL schema
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
npm run data:import -- ...      # import a CSV (see below)
npm run data:sync-r2 -- ...     # incrementally refresh authorised Dukascopy data
npm run calendar:import -- ...  # import an MT5 economic calendar export
npm run calendar:sync -- ...    # import an export only when its checksum changes
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
| `MARKET_DATA_PROVIDER` | `r2` | `r2` \| `demo`. Production reads R2 through its S3-compatible API. |
| `ENABLE_DEMO_DATA` | `false` | Fall back to deterministic demo data when no stored data. Keep disabled in production. |
| `R2_ENDPOINT` | â€” | Server-only Cloudflare R2 S3 endpoint. |
| `R2_BUCKET_NAME` | â€” | R2 bucket containing the monthly Parquet files. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | â€” | Server-only R2 API credentials. |
| `R2_PREFIX` | `market_data` | Object-key prefix before `<SYMBOL>/<YEAR>/<MONTH>.parquet`. |
| `DUKASCOPY_DATA_AUTHORIZED` | `false` | Safety acknowledgement required before the automated downloader will run. Enable only after confirming public-display/redistribution rights. |
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

The Prisma datasource is configured for **PostgreSQL**. Production uses
Supabase through its pooled connection endpoint.

1. Create the database and copy two connection strings into `.env`
   (Supabase → Project Settings → Database → **Connection pooling**):
   - `DATABASE_URL` → **pooled**, port `6543`, with `?pgbouncer=true&connection_limit=1`
     (used by the app).
   - `DIRECT_URL` → **session** pooler, port `5432` (used by `db push` / migrations).
   > URL-encode special characters in the password (e.g. `#` → `%23`). Use the
   > **pooler** host (`aws-0-<region>.pooler.supabase.com`), not the IPv6-only
   > direct `db.<ref>.supabase.co` host.
2. `npm run db:push` to create the tables, then `npm run db:seed` for EUR/USD
   demo data. No column-type changes are needed — prices are stored as strings.

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

## Economic calendar import

Releases are badged on the chart's time axis, with actual / forecast / previous
on hover. The data comes from MetaTrader 5's built-in calendar, which carries
years of history for every major economy at no cost.

**1. Export from MT5.** Copy `scripts/mt5/ExportEconomicCalendar.mq5` into
`MQL5\Scripts\` in your terminal's data folder (File → Open Data Folder), refresh
the Navigator, open the Calendar tab and scroll back through the years you want —
the terminal only holds what it has downloaded — then drag the script onto any
chart. It writes a CSV to `Terminal\Common\Files\`.

The calendar is read a month at a time. Asking for the whole history in one call
fails with error 5401, `ERR_CALENDAR_TIMEOUT` — which reads like "no data" but means
the request exceeded the server's time limit. The script narrows the window further
wherever history is slow, sleeps between requests because the calendar server
rate-limits, and reports in the Experts log any day it could not read at all.

**The first run is slow.** The terminal fetches each window from MetaQuotes as it is
asked for, so a full 2007-onwards export takes on the order of half an hour, writing
as it goes — watch the file grow rather than the log, which only reports per year.
Once that history is cached locally, later runs finish in under a minute.

To refresh it unattended — from a scheduled task, say — launch the terminal with a
startup config instead of dragging the script:

```ini
; ftl-calendar.ini
[StartUp]
Symbol=EURUSD
Period=M15
Script=ExportEconomicCalendar
```

```
terminal64.exe /config:C:\path\to\ftl-calendar.ini
```

MT5 skips the inputs dialog for a script started this way, so it runs to completion
on its own. Close any existing instance of that terminal first; MT5 allows one per
data folder.

**2. Import it.**

```bash
npm run calendar:import -- --file ./data/forextestlab-calendar.csv
```

No timezone needed: the importer works out the broker's server zone from the file.
MetaTrader reports calendar times in trade-server time, and "GMT+3" is ambiguous in
exactly the way that matters — a server on a fixed UTC+3 and one on EET summer time
read the same in August and differ by an hour every winter. So the importer combines
two pieces of evidence in the file: the offset the exporting terminal recorded in the
header, which pins the offset at one instant, and the release schedules themselves.
Statistical agencies publish at a fixed *local* time — US nonfarm payrolls is 08:30
in New York whatever the season — so only the true zone makes every release land on
the same local minute.

It reports what it concluded and what it rested on:

```
Anchor: USD Nonfarm Payrolls, 214 releases.
Under Europe/Kyiv, 100% of them land on 08:30 in America/New_York.
Same clock as: Europe/Athens, Europe/Helsinki, Europe/Riga.
```

Pass `--timezone` to override, and it will warn if the file disagrees with you.
`--dry-run` checks a file without writing. If no release in the file recurs on both
sides of a daylight-saving change there is nothing to anchor on, so it falls back to
UTC and says so loudly rather than guessing.

Re-running an export updates releases in place, keyed on the provider's own id —
which is the point of re-running it, since a release exported before it happened
carried a forecast and no actual.

Note on redistribution: this data is MetaQuotes-sourced. It is fine for your own
testing; shipping it to customers is a licensing question, and for that
FRED/ALFRED (US only, public domain, with point-in-time vintages) is the safe
source.

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

## Deploying to AWS Lightsail

Production runs as a long-lived Next.js Node process behind Nginx. The checked-in
service and reverse-proxy templates are in `deploy/`.

```bash
git pull origin aws-lightsail
npm ci
npx prisma migrate deploy
npm run build
sudo systemctl restart forextestlab
sudo systemctl --no-pager --full status forextestlab
```

Keep production variables in `/home/ubuntu/forextestlab/.env`. The application
needs the pooled Supabase `DATABASE_URL`, `DIRECT_URL`, Supabase Auth values,
`MARKET_DATA_PROVIDER=r2`, `ENABLE_DEMO_DATA=false`, and the five `R2_*` values.

Cloudflare remains the authoritative DNS and HTTPS proxy. Its proxied apex `A`
record points to the Lightsail static IP, and `www` is a proxied CNAME to the
apex. Nginx also has a Let's Encrypt origin certificate for both hostnames.

## Cloudflare R2 historical-data provider

- `R2ParquetProvider` lists uploaded monthly objects and only enables symbols
  that currently exist in R2.
- Parquet files remain private. The server downloads and decodes them; R2
  credentials and object URLs are never sent to the browser.
- Source data is one-minute UTC OHLCV with ZSTD or Snappy compression. Replay requests are
  aggregated to the requested timeframe on the server.
- The expected object layout is
  `market_data/<SYMBOL>/<YEAR>/<two-digit-month>.parquet`.

### Automated data refresh

The catalogue contains the seven USD majors and all 21 standard non-USD
crosses. Currency pairs automatically use the two code-drawn currency flags in
the symbol picker. A pair becomes selectable as soon as at least one monthly R2
object exists for it.

`npm run data:sync-r2` downloads authorised one-minute Dukascopy bid candles,
validates their timestamps and OHLC relationships, merges a two-day overlap,
deduplicates by timestamp, writes a monthly Snappy Parquet object, reads that
object back for verification, and only then uploads it to R2. Existing history
is never fetched during replay.

```bash
# Normal incremental update for all 28 FX pairs. New pairs begin in 2015;
# interrupted pairs resume from their newest stored month.
npm run data:sync-r2 -- --bootstrap-from=2015-01-01 --overlap-days=2

# Explicit backfill or a no-write verification run.
npm run data:sync-r2 -- --symbols=AUDCAD,GBPJPY --from=2015-01-01
npm run data:sync-r2 -- --symbols=AUDCAD --from=2026-08-01 --dry-run
```

The checked-in `forextestlab-market-data.timer` runs at 00:20 UTC Monday
through Saturday. Install it on Lightsail only after
`DUKASCOPY_DATA_AUTHORIZED=true` has deliberately been set:

```bash
sudo cp deploy/forextestlab-market-data.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now forextestlab-market-data.timer
```

Calendar refresh has two halves. On Windows, `scripts/windows/sync-economic-calendar.ps1`
compiles and launches the rolling MT5 exporter, then atomically uploads its CSV
to Lightsail. `install-calendar-task.ps1` schedules that bridge every 30
minutes. On Lightsail, the matching timer checks the uploaded file every 30
minutes; a SHA-256 checksum prevents repeat imports, while database upserts
change only releases whose forecast, actual, revision, or metadata changed.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-calendar-task.ps1
```

```bash
mkdir -p /home/ubuntu/forextestlab/data
sudo cp deploy/forextestlab-calendar-import.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now forextestlab-calendar-import.timer
```

## Adding an authorised external provider

- The active provider is chosen by `MARKET_DATA_PROVIDER`; unknown symbols/ranges
  fall back to deterministic demo data when `ENABLE_DEMO_DATA=true`.
- New providers should fetch server-side, validate and normalize their data,
  write monthly Parquet objects to R2, and serve replay through the existing R2
  provider. Confirm public-display and redistribution rights before integration.

### API-key security requirements

- All third-party requests are made **server-side only**. Never place provider
  credentials in client JS, `NEXT_PUBLIC_*`, HTML, network responses, source
  maps, or logs.
- Do not call an external data API during candle replay. Import data into R2
  first, then replay from the private R2 bucket.

### ⚠️ Market-data licensing warning

> Free API access does not automatically include public-display, redistribution,
> or commercial-use rights. Before enabling an external provider on the public
> ForexTestLab platform, the project owner must review the provider’s current
> terms and obtain any required written permission or commercial licence.

Only import files you are legally permitted to use and redistribute.

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
