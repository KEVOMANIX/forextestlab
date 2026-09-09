# ForexTestLab operational handover

Last updated: 2026-09-09 (Africa/Nairobi)

This document lets another coding agent continue local development, deploy to
AWS Lightsail, operate the data jobs, and diagnose production without asking the
owner to repeat the setup.

## Security rules

- Never paste, print, commit, or send the contents of a `.env` file or PEM key.
- Secret **locations and variable names** are documented below; their values are not.
- Never replace the production `.env` during a Git deployment. It is not in Git.
- Before deleting or recursively moving anything, resolve and verify the exact path.
- Preserve unrelated working-tree changes. Never use `git reset --hard`.
- Production changes should normally be implemented locally, tested, committed,
  pushed, pulled on Lightsail, built there, and then activated by restarting the service.

## Primary project

| Item | Value |
|---|---|
| Local repository | `E:\desktop\forextestlab` |
| Git branch | `aws-lightsail` |
| Git remote | `https://github.com/KEVOMANIX/forextestlab.git` |
| Production repository | `/home/ubuntu/forextestlab` |
| Production URL | `https://forextestlab.com` |
| Public IP/origin | `52.34.239.239` |
| SSH user | `ubuntu` |
| Lightsail SSH private key | `E:\Downloads\LightsailDefaultKey-us-west-2.pem` |
| Current deployed app revision | `209464a` |

The machine already has working Git credentials for the GitHub remote. Do not
create or expose a new GitHub token unless the existing credential manager stops working.

## Connect to Lightsail

From PowerShell:

```powershell
ssh -o StrictHostKeyChecking=accept-new `
  -i "E:\Downloads\LightsailDefaultKey-us-west-2.pem" `
  ubuntu@52.34.239.239
```

Run one remote command without opening an interactive shell:

```powershell
ssh -i "E:\Downloads\LightsailDefaultKey-us-west-2.pem" `
  ubuntu@52.34.239.239 "COMMAND"
```

AWS console/API credentials are not required for normal operation; SSH is the
management path. Ports 80 and 443 are served publicly by Nginx. Next.js listens
only on `127.0.0.1:3000`.

## Secrets and configuration locations

### Local development

- Main local secrets: `E:\desktop\forextestlab\.env`
- Local override: `E:\desktop\forextestlab\.env.local`
- `.env.local` currently contains a legacy `VERCEL_OIDC_TOKEN`. Vercel is no
  longer the production host and should not be reintroduced into deployment.

### Production

- Authoritative production environment: `/home/ubuntu/forextestlab/.env`
- Main systemd service reads that file through `EnvironmentFile=`.
- File permissions should remain restrictive and it must never be committed.

Important variable groups in the environment file:

- Database/Supabase: `DATABASE_URL`, `DIRECT_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`
- Historical migration references: variables prefixed `NEW_` and
  `OLD_DATABASE_URL`. These are not the active runtime names. Runtime uses the
  unprefixed variables above. This distinction previously caused the app to
  authenticate against a quota-exceeded Supabase project.
- Cloudflare R2 runtime access: `R2_ENDPOINT`, `R2_BUCKET_NAME`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- A Cloudflare account analytics token is **not** currently present in the
  production environment. R2 S3 credentials can read the bucket but cannot
  query Cloudflare's account-level operation analytics.
- Market data: `MARKET_DATA_PROVIDER`, `DUKASCOPY_DATA_AUTHORIZED`, provider flags/keys
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- AI: `GEMINI_API_KEY`, `GEMINI_MODEL`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`,
  `SMTP_PASSWORD`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`
- Billing: `PADDLE_*` and `PAYSTACK_*`
- Admin: `ADMIN_EMAILS`, `ADMIN_IMPORT_TOKEN`

Do not print values while diagnosing. To list variable names safely:

```bash
sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' /home/ubuntu/forextestlab/.env | sort
```

If Supabase is changed, update the unprefixed variables, rebuild/restart the app,
and configure the same project’s Auth URL settings for:

- Site URL: `https://www.forextestlab.com`
- Redirects: `https://www.forextestlab.com/**`,
  `https://forextestlab.com/**`, and
  `https://www.forextestlab.com/auth/callback`

## Standard implementation and deployment workflow

Run locally:

```powershell
cd E:\desktop\forextestlab
git status --short --branch
npm run typecheck
npm test
npm run build
git add <only-files-for-this-change>
git commit -m "Concise description"
git push origin aws-lightsail
```

Deploy after the push:

```powershell
ssh -i "E:\Downloads\LightsailDefaultKey-us-west-2.pem" ubuntu@52.34.239.239 `
  "cd /home/ubuntu/forextestlab && git pull --ff-only origin aws-lightsail && npm run build && sudo systemctl restart forextestlab && sleep 2 && systemctl is-active forextestlab && curl -sS --max-time 10 http://127.0.0.1:3000/api/version"
```

If `prisma/schema.prisma` changed, the deploy needs two more steps between the
pull and the build, in this order:

```bash
cd /home/ubuntu/forextestlab
npx prisma migrate deploy
npx prisma generate
```

`npx prisma generate` is not optional and is easy to miss. A Git pull does not
regenerate the client in `src/generated/prisma`, so the build fails with
`Object literal may only specify known properties` on the new column — which
reads like a source error rather than a stale client.

Then verify through Cloudflare:

```powershell
curl.exe -sS --max-time 30 -D - "https://forextestlab.com/api/version?fresh=$(Get-Date -Format yyyyMMddHHmmss)" -o NUL
```

Expected: HTTP 200, service `active`, and `{"version":"1.0.0"}`.

Do not use `prisma migrate dev` against production.

## Production services and files

Repository service templates are in `E:\desktop\forextestlab\deploy` locally
and `/home/ubuntu/forextestlab/deploy` on the server.

Installed systemd units:

- `/etc/systemd/system/forextestlab.service`
- `/etc/systemd/system/forextestlab-market-data.service`
- `/etc/systemd/system/forextestlab-market-data.timer`
- `/etc/systemd/system/forextestlab-market-data-backfill.service`
- `/etc/systemd/system/forextestlab-calendar-import.service`
- `/etc/systemd/system/forextestlab-calendar-import.timer`
- `/etc/systemd/system/forextestlab-monitor.service`
- `/etc/systemd/system/forextestlab-monitor.timer`
- `/etc/systemd/system/forextestlab-database-backup.service`
- `/etc/systemd/system/forextestlab-database-backup.timer`

Current schedules:

- Market refresh: Monday–Saturday at 00:20 UTC plus up to 10 minutes random delay
- Production monitor: every 15 minutes
- Calendar incoming-file check/import: every 30 minutes
- Critical database backup: Sunday at 02:30 UTC plus up to 10 minutes random delay

If a unit template changes, deploy it explicitly; Git pull alone does not update
`/etc/systemd/system`:

```bash
sudo cp deploy/<unit-name> /etc/systemd/system/<unit-name>
sudo systemctl daemon-reload
sudo systemctl enable --now <timer-or-service>
```

Useful service commands:

```bash
sudo systemctl --no-pager --full status forextestlab
sudo journalctl -u forextestlab -n 150 --no-pager
sudo journalctl -u forextestlab-market-data.service -n 150 --no-pager
sudo journalctl -u forextestlab-calendar-import.service -n 150 --no-pager
sudo journalctl -u forextestlab-monitor.service -n 150 --no-pager
sudo journalctl -u forextestlab-database-backup.service -n 150 --no-pager
systemctl list-timers --all --no-pager | grep forextestlab
free -h
sudo ss -ltnp | grep -E ':80|:443|:3000'
```

## Nginx, domain, TLS, and Cloudflare

- Repository configs: `deploy/nginx-forextestlab.conf` and
  `deploy/nginx-forextestlab-tls.conf`
- Installed site: `/etc/nginx/sites-available/forextestlab`
- Enabled symlink: `/etc/nginx/sites-enabled/forextestlab`
- Nginx logs: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- Origin certificate/key:
  `/etc/letsencrypt/live/forextestlab.com/fullchain.pem` and
  `/etc/letsencrypt/live/forextestlab.com/privkey.pem`
- Certbot auto-renewal is installed.

Validate changes before reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

The Nginx proxy buffers are intentionally enlarged because Supabase OAuth sets
multiple cookies. Removing them can reintroduce 502 errors on `/auth/callback`.

The domain registrar is Namecheap, but authoritative nameservers point to
Cloudflare. Cloudflare DNS uses proxied records for the apex and `www`, with the
origin at `52.34.239.239`. Email MX/TXT records must remain DNS-only.

## Cloudflare R2 market data

Production reads private monthly Parquet objects through the R2 S3-compatible API.

- Object layout: `market_data/<SYMBOL>/<YYYY>/<MM>.parquet`
- Reader: `src/lib/market-data/providers/r2-parquet-provider.ts`
- Synchronizer: `src/lib/market-data/r2-sync.ts`
- CLI: `scripts/sync-market-data-r2.ts`
- Symbol catalogue and flags: `src/lib/market-data/symbols.ts`
- App symbol health: `https://forextestlab.com/api/backtest/symbols`

All 32 configured instruments are currently enabled: 28 traditional FX pairs,
XAUUSD, XAGUSD, BTCUSD, and DXY.

Supabase is not used to serve OHLC candles. This design protects Supabase egress;
historical candles are fetched from R2 monthly Parquet snapshots and cached in
the app process.

### R2 runtime request behaviour

The R2 provider has two process-local caches:

- Manifest TTL: 5 minutes
- Monthly candle TTL: 15 minutes
- Monthly candle cache capacity: currently **one object total**
  (`MAX_CACHED_MONTHS = 1`)

The one-object capacity matters for multi-pair replay. Alternating between two
symbols evicts the previous symbol's monthly Parquet object, so routine buffer
extensions can download both monthly files again. Do not interpret Nginx API
request counts as exact R2 billable operations: pair responses can come from the
session's in-memory series, while one app request can read more than one monthly
object at a month boundary.

Production load-test evidence from 2026-08-14:

- Approximately seven minutes at 2 simulated hours/second with two synchronized pairs
- No replay hangs or buffer starvation observed
- 73 exact app market-data requests: 30 `extend`, 33 `pair`, 9 `context`,
  and 1 pair mutation
- Estimated roughly 75 R2 object reads plus manifest scans; this is an inference,
  not an exact Cloudflare billing metric

For an exact historical operation count, use Cloudflare R2 Metrics or add
explicit SDK-operation instrumentation. The production host currently has no
Cloudflare analytics token, and Nginx cannot see the provider's S3 operations.

Before increasing the monthly cache, measure Parquet object sizes and Lightsail
memory. The server has about 2 GB RAM plus 2 GB swap, so a larger cache should be
bounded by bytes or per-symbol recency rather than made unlimited.

## Account funding and blown accounts

Equity is not allowed to run past zero unnoticed. When a revealed candle leaves
equity at or below zero, the engine flattens every open position, cancels every
resting order, records `state.accountBlown`, and leaves the session `paused` —
not `finished`. Trading and playback are both refused until the account is
funded again.

- Engine: `addFunds`, `depositedFunds`, `fundedBalance`, `MAX_TOP_UP` in
  `src/lib/backtest/replay-engine.ts`
- Prompt: `src/components/app/AccountBlownModal.tsx`
- Action: `add-funds`, validated in `src/lib/backtest/schemas.ts`

Two rules matter when changing anything that reads a balance:

1. **Profit is measured against the funded balance**, meaning the opening
   balance plus every demo top-up — never `config.startingBalance` alone, or a
   rescued account reports the rescue as a gain. The `depositedFunds` column
   mirrors the total for queries that must not parse the whole snapshot. This
   was wrong in five places at once (dashboard, history, results, the trading
   dock, and both AI context builders); grep for `startingBalance` before
   trusting any net-profit figure.
2. **Top-ups are indexed like trades.** Rewinding past one takes the money back
   with it, and un-blows the account. A challenge account cannot be topped up at
   all: a prop firm does not refund a failed evaluation.

## Replay progress is measured in days

`totalCandles` counts the candles **loaded so far**, not the session's range —
1,500 on a fresh session however many years it covers, growing as the replay
extends. It is therefore never a valid progress denominator, and using it as
one reported 91% on a session that was seventeen days into 2,408.

Progress is expressed in trading days by `src/lib/backtest/replay-progress.ts`
(`replayDayProgress`, `replayDayPercent`, `replayDayLabel`), which every bar and
label derives from so the two cannot disagree. This needs the replay clock, so
sessions persist `visibleTime` — the market timestamp of the revealed candle —
including on the checkpoint fast path, which loads no candles and so takes the
timestamp from the client. Rows saved before that column existed fall back to an
estimate of `startTime + visibleIndex x timeframe`, which loses every weekend
crossed.

## Synchronized multi-pair replay

The synchronized, tradable multi-pair engine is live in revisions `82915a8` and
`2911df4`.

Expected behaviour:

- Every active symbol shares the primary symbol's replay clock.
- Playing one chart advances all layouts together.
- A newly added symbol loads at the current replay time, not the session start.
- Every active symbol can receive simulated trades; secondary symbols are not
  reference-only charts.
- Primary buffer publication waits until active secondary buffers have reached
  the same runway. On a secondary fetch failure, the old complete buffer remains
  visible and the extension is retried instead of publishing an incomplete set.
- Server-side pair pagination continues until the primary tail is covered.
- Chart viewport storage is symbol-specific, preventing one pair's saved view
  from displacing another pair.

Relevant implementation paths:

- Session data loading/alignment: `src/lib/backtest/session-store.ts`
- Browser request helpers: `src/lib/backtest/client.ts`
- Pair API: `src/app/api/backtest/sessions/[id]/pair/route.ts`
- Buffer API: `src/app/api/backtest/sessions/[id]/extend/route.ts`
- R2 reader/cache: `src/lib/market-data/providers/r2-parquet-provider.ts`

When changing this flow, preserve the atomic buffer rule and test adding a pair
after replay has advanced. A useful manual stress test is two pairs at 2 hours/s
for at least seven minutes, including a monthly boundary and adding a third pair
mid-session.

### Reliable local Dukascopy backfill pipeline

The reliable bulk downloader is a separate, currently non-Git directory:

- Project: `E:\desktop\dukascopy-market-data`
- Python: `E:\desktop\dukascopy-market-data\.validation-venv-py310\Scripts\python.exe`
- Data: `E:\desktop\dukascopy-market-data\market_data`
- Main log: `E:\desktop\dukascopy-market-data\logs\download.log`
- Cross-pair run output: `E:\desktop\dukascopy-market-data\logs\cross-download.out.log`
- Errors: `E:\desktop\dukascopy-market-data\logs\errors.log`
- Configuration: `E:\desktop\dukascopy-market-data\config.py`
- Download entry point: `main.py`
- Upload-only entry point: `upload.py`
- Verification/repair: `verify.py`

It uses `https://jetta.dukascopy.com/v1`, produces schema-compatible ZSTD Parquet,
and uploads directly to the existing R2 object layout. Prefer this local pipeline
for large backfills because the AWS origin IP previously received Dukascopy HTTP
429 responses.

The completed 21-cross backfill processed 2,940 months with 0 failures; 2,939
were downloaded locally, one was already present, and 2,883 were newly uploaded
while the remaining objects already existed in R2.

Example safe resumable command (environment values are loaded from the main
project `.env`; never paste them into source):

```powershell
cd E:\desktop\dukascopy-market-data
.\.validation-venv-py310\Scripts\python.exe main.py --symbol EURAUD --workers 1 --upload
```

Valid existing local files and existing R2 objects are skipped. For a large run,
use a hidden background process with redirected output and check for an existing
`main.py` process first so duplicate jobs do not run.

## Economic calendar automation

The calendar source is exported by a Windows scheduled task from FBS MetaTrader 5.

- Scheduled task: `ForexTestLab Economic Calendar`
- State at handover: `Ready`
- Schedule: daily at 11:00 local Windows time (Africa/Nairobi)
- Installer: `scripts/windows/install-calendar-task.ps1`
- Sync/export bridge: `scripts/windows/sync-economic-calendar.ps1`
- MT5 exporter source: `scripts/mt5/ExportEconomicCalendar.mq5`
- MT5 executable: `C:\Program Files\FBS MetaTrader 5\terminal64.exe`
- Local MT5 output: `%APPDATA%\MetaQuotes\Terminal\Common\Files\forextestlab-calendar.csv`
- Server incoming file: `/home/ubuntu/forextestlab/data/forextestlab-calendar.csv.incoming`
- Activated server file: `/home/ubuntu/forextestlab/data/forextestlab-calendar.csv`

Run manually:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  E:\desktop\forextestlab\scripts\windows\sync-economic-calendar.ps1
```

The script requires all MT5 terminal windows to be closed. It compiles the
exporter, runs MT5 headlessly, uploads atomically with SCP, and the server timer
imports the incoming file. The app only reads the database calendar cache.

## Backups and egress policy

The weekly database backup is deliberately a critical-data backup, not a full
dump. It excludes large/regenerable tables such as market candles, economic
events, imports, product events, and operational checks. Four weekly copies are
retained in private R2. Do not restore large database backups or reintroduce OHLC
reads from Supabase without first estimating egress.

Manual backup test:

```bash
cd /home/ubuntu/forextestlab
npm run database:backup
```

## Common incident checks

### Cloudflare 521

Check Lightsail, Nginx, firewall/listeners, then origin locally:

```bash
systemctl is-active forextestlab nginx
sudo ss -ltnp | grep -E ':80|:443|:3000'
curl -I http://127.0.0.1:3000/api/version
```

### Cloudflare/Nginx 502 on OAuth callback

Look for `upstream sent too big header` in `/var/log/nginx/error.log`. Confirm
the installed site retains `proxy_buffer_size 32k`, `proxy_buffers 8 32k`, and
`proxy_busy_buffers_size 64k`, then validate and reload Nginx.

### App service active but port 3000 briefly unavailable

Wait two seconds after restart, inspect `journalctl`, then retry localhost. Do
not conclude the service failed from a curl issued in the same millisecond as restart.

### Old Supabase project appears during login

Verify the unprefixed production variables, rebuild/restart, verify Supabase Auth
redirect settings, then test in an incognito browser to avoid stale auth cookies.

### Market download rate limiting

Do not repeatedly restart the AWS backfill service. Use the local Jetta pipeline
for bulk history and leave the AWS timer for small daily overlaps.

## Current product state

- Deployment host: AWS Lightsail behind Cloudflare; Vercel is not used.
- Production branch and server were deployed and verified at revision `209464a`
  on 2026-09-09. The service was active and `/api/version` returned HTTP 200 on
  both localhost and the Cloudflare URL.
- An account that reaches zero equity is flattened, marked blown, and prompts
  for demo funds; see the account-funding section above before touching any
  balance or profit figure.
- Replay progress is reported in trading days, never candle counts.
- Every surface that hides the chart or takes the trader's focus holds playback
  through the shared hold in `Backtester.tsx`: the order ticket, position
  editor, confirmations, Go To, the analytics screen, the challenge verdict, the
  symbol picker, the settings dialog, and the blown-account prompt. A new
  full-screen or modal surface must add its own reason to `ReplayInteraction`.
- Trade records carry their own symbol. Anything listing trades shows the pair
  each was executed on, never the session's joined pair list; the CSV export
  carries `symbol` as its first column.
- The support launcher stands down on `/sign-in`, `/sign-up` and
  `/forgot-password` as well as the trading and support routes.
- Authentication uses a 25rem card over the replay desk in
  `public/product/replay-desk-20260909.webp`, blurred past legibility so the
  plate's own interface cannot compete with the real chrome. The four-pane
  marketing screenshot is still used by the hero and product preview.
- The backtester keeps the floating launcher hidden; support activity reaches
  a trader through SupportTerminalAlert, mounted in BacktesterClient.
- The support launcher polls for replies while a visitor has an open
  conversation (15s visible, 45s hidden), chimes, badges, and writes the unread
  count into the tab title. Desktop notifications are opt-in from the widget.
- Resolving a support conversation closes it for the customer: the chat and
  attachment APIs refuse customer writes on `resolved`/`closed`. An agent reply
  or reopen unlocks it.
- `/support-team` is a three-column workspace (queue rail, conversation list,
  conversation) with customer detail in an on-demand right drawer. Support-team
  access management lives in `/admin/users`.
- The dashboard has the premium Pro command center, compact action group,
  premium session cards, tabbed Insights/Activity/AI workspace, richer chart,
  and Pro account styling.
- Analytics includes a compact week/month trading activity calendar.
- Full analytics uses the approved production report design; sample data toggles
  in place across Overview, Trades, Journal, and Reports without navigating to a
  separate prototype.
- Product terminology uses `Prop firm` rather than a named prop-firm brand and
  `sample data` rather than `demo data` in user-facing copy.
- Marketing previews use current Replay, Dashboard, and Analytics screenshots
  in matching framed dimensions.
- Go To navigation returns to the chart immediately, performs an atomic jump,
  shows its loading state on the right side of the chart, and offers Undo after
  a successful jump.
- Chart timeframes include the multi-month 3M, 4M, and 6M options.
- Multi-pair layouts are synchronized and all active pairs are tradable.
- Journal interruption prompts are off by default.
- Backtester hides the chart until workspace, chart canvas, pair data, and initial
  timeframe history are ready.
- Full suite at handover: 619 tests passed; type checking and local/Lightsail
  production builds passed.
- All production services and four timers listed above were active at handover.

## Working conventions for the next agent

1. Inspect existing code and current Git status before editing.
2. Use `apply_patch` for intentional source edits.
3. Keep Supabase egress low: query only needed columns; do not move market candles
   back into Supabase request paths.
4. Run type checking and proportionate tests; for major UI/data changes run all
   tests and a production build.
5. Commit only task-related files, push `aws-lightsail`, and deploy through SSH.
6. Verify both localhost on Lightsail and the Cloudflare public URL.
7. Report the commit, verification performed, and any remaining operational risk.
