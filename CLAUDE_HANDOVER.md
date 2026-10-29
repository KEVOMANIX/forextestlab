## 2026-10-29 — Stop gaps, achieved R and payment reopening

- Stop-loss gaps now fill at the opening executable bid/ask. An opening stop or take-profit crossing takes precedence over later intrabar touches; ordinary ambiguous candles still follow the execution policy.
- Average achieved risk/reward uses signed, direction-aware price movement, so losses contribute negative R. Existing saved trade fills are not rewritten.
- The owner accepts the bounded future-candle replay buffer as an intentional design choice.
- Payment reopening: replaced the rejected production live API key using the owner's local key file. Verified live price reads ($10 monthly / $80 yearly base USD), localized pricing, draft checkout creation and the active production webhook's matching secret and platform traffic. Billing is enabled through production `BILLING_ENABLED=true`; this also activates Free/Pro entitlement limits. Both trial-price IDs are absent, so the current configuration offers ordinary paid subscriptions without a trial. Removed unconditional trial promises and corrected the obsolete per-device trial banner to describe the Free plan. No charge was made during verification.
- Validation: 1,212 tests across 133 files passed, including regression cases for long/short gaps, native quotes, opening-event precedence and signed R.

## 2026-10-26 — Analytics share links
- Added owner-managed Share dialog beside PDF export, public read-only Analytics snapshots (Overview, Trades, Reports), and 30-day expiry/revocation/token rotation.
- Snapshot payload is an explicit allowlist; excludes session name, real IDs, notes, journals and experimental trades, rebuilding balance/equity scope as needed. No live replay access. Uses latest persisted state.
- New additive AnalyticsShare table/migration; owner and exports entitlement checks; no analytics telemetry/support widget on token URLs.
- Verified 8 privacy/API tests, TypeScript and browser fixture: consent, create, revoke and shared charts. No actual customer report published.

# ForexTestLab operational handover

### 2026-10-29 — Permanent Pro for the sole administrator

- Confirmed `kelvinmwaniki62@gmail.com` is user `00b54d69-34c9-4c82-b010-9d8020754825`, already the sole `ADMIN_USER_IDS` entry. Production admin emails are empty. Permanent Pro now derives from that immutable configured admin ID at the shared entitlement boundary, independent of billing status, subscription/trial expiry or provider webhooks.
- Entitlement, Free-summary and trial-eligibility queries select the profile ID. Account copy explicitly says permanent administrator access. Other accounts still need their normal paid/trial/granted access; no customer billing rows or payment history were changed. The explicit administrator "View as Free" testing preview remains intentional and reversible.
- Regression tests cover expired/inactive owner access into the future, full capabilities, no trial offer for the owner, and unchanged restrictions for other accounts.

### 2026-10-29 — Obsidian Desk exit optimizer

- Owner selected Obsidian Desk. Replaced the stacked wizard/status boxes with one six-phase navigation, Configure/Results view switch, compact rule selection and a persistent test-scope/objective sidebar. Report view has a validated recommendation, four primary figures, responsive labeled equity comparison and candidate table. Extra metrics, all candidates and trade impacts remain available through disclosures.
- Context, robustness, review, device-local plan saving and JSON export reuse the existing phase components, now controllable by the workspace navigation. Objectives reuse the existing ranking logic and still select only validation-passing rules. No optimizer engine/API/entitlement changes; no mock performance values were shipped.
- Loading now reflects the active request without an invented progress percentage. Requests abort on session change/unmount and old reports clear on session changes. Unfinished sessions and sample-only mode still cannot run analysis. Failed/no-winner results remain explicit.
- Scoped styles follow existing dark/light app tokens; mobile stacks the report and scope without page overflow. `tests/ui/optimizer-desk.mjs` runs real components and report calculations with deterministic intercepted responses, covering selection payloads, ranking, all phases, trade focus, saving/export, request errors, no-winner state, session reset, full candidate disclosure, desktop/mobile and both themes. Windows: `PLAYWRIGHT_CHANNEL=msedge`.

### 2026-10-29 — Essential pricing and WELCOME20

- Checkout follow-up: production logged a 404 for a saved Paddle customer that no longer exists in the live account. The checkout helper now retries once without that customer reference only for the exact Paddle `not_found` customer error. Price, permission and server errors still fail normally. Account custom_data is preserved so the completion webhook can relink the current customer. No saved billing history or entitlement was reset. Regression tests cover the fallback and unrelated failures.

- Follow-up: owner requested the complete included-feature lists and equal card heights. Pricing now uses the full plan feature arrays, including execution/risk tools, replay speeds, analytics, AI, Challenges, CSV exports and PDF/sharing. Grid rows and cards use equal heights on desktop and mobile; Free still excludes Pro-only rows. Browser checks assert equal heights within one pixel at both widths.

- Owner selected Essential from the new minimal previews. Pricing uses "Make your next move.", four included-only Free rows and five grouped Pro rows. Trial link sits beside the billing switch; discount strip below the cards has a copy button. Compact billing terms remain below it. Ineligible accounts keep a new-members trial-details link.
- Reactivated the existing WELCOME20 live discount: 20% off the first paid monthly payment, non-recurring, enabled for checkout, no expiry. Preserved existing price restrictions and added the live monthly trial price; yearly prices are excluded. A restricted JSON backup of the old discount is on Lightsail under `/home/ubuntu/.welcome20-before-essential-*.json`.
- Verified Paddle monthly pricing preview is $8 and a seven-day-trial draft checkout accepts the discount. Paddle carries a one-time discount past a free trial to the first paid billing period. No real subscription or charge was created. The discount seeder and local promotion copy now match the reactivated offer.
- Updated browser regression covers short feature rows, copy-code interaction, monthly/yearly switching, trial checkout and returning-account rendering on desktop/mobile.

### 2026-10-29 — Seven-day Pro trial and pricing cards

- Owner selected the Signature design: centered two-line heading and compact plan cards. Free lists included features only. The Pro card uses "Choose Pro". After spacing feedback, the trial callout sits above the cards, remains discoverable for ineligible accounts with an explicit eligibility message and FAQ link, and offers checkout only when eligible. Reduced hero/card spacing, widened the comparison and stopped stretching Free to the taller Pro card. Checkout eligibility is unchanged.

- The owner requested a 7-day Pro trial. Created/reused separate live monthly and yearly trial prices under the existing product, preserving the $10/month and $80/year renewal amounts, tax settings and plain paid prices. Saved `PADDLE_LIVE_PRO_MONTH_TRIAL_PRICE_ID` and `PADDLE_LIVE_PRO_YEAR_TRIAL_PRICE_ID` in production. Both prices have a free seven-day trial requiring a payment method; verified draft checkouts carry the correct trial. No real subscription or charge created.
- Added trialing, activated, past_due, paused, resumed and transaction.payment_failed to the existing production webhook subscriptions. Existing checkout eligibility still enforces one trial per account and excludes prior subscribers/current Pro accounts.
- Pricing cards use short matching feature rows with explicit Free exclusions for Advanced Analytics, AI Analyst, Prop Firm Challenges and CSV/PDF exports. Billing/renewal terms sit below the cards. Pricing section passes trial availability; pricing page still applies account eligibility. FAQ explains the trial.
- Browser regression `tests/ui/pricing-plans.mjs` covers desktop/mobile, eligible and returning accounts, monthly/yearly prices, exclusions and overflow; local Windows can use `PLAYWRIGHT_CHANNEL=msedge`. Screenshots are ignored under `.tmp/pricing-plans/`.

Last updated: 2026-10-21 (Africa/Nairobi)

This document lets another coding agent continue local development, deploy to
AWS Lightsail, operate the data jobs, and diagnose production without asking the
owner to repeat the setup.

## Agent usage discipline

Use the project's agent allowance carefully without weakening verification:

- Read this handover completely once at the start of a chat. After that, search
  for the relevant heading, command, or file path instead of rereading it.
- Treat findings and completed work already present in the current chat as
  reusable evidence. Do not repeat successful diagnostics, tests, builds, or
  deployments unless code changed or new evidence makes the result stale.
- Begin investigation with `git status --short --branch` and focused `rg`
  searches. Read only the relevant files and line ranges; avoid broad repository
  dumps and unrelated documentation.
- Run targeted tests for the changed behavior first. Expand to type checking,
  the full test suite, or a production build according to risk and the standard
  deployment workflow below, rather than running every check after every edit.
- Batch independent read-only checks when practical and limit command output to
  the evidence needed to make the next decision.
- Keep requests and progress updates concise. For a new unrelated objective,
  start a fresh chat and carry forward only the current revision, material
  decisions, completed work, and remaining task.
- Do not save tokens by skipping security checks, migration requirements,
  deployment health checks, or verification directly related to a change.

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
| Current deployed app revision | `b3430c6`, Pro locks redesigned (side panel and blurred previews), on top of the analytics PDF/share-link work and `d19fad8` fast market data |
| Instance size | 4 GB RAM (3.7 GiB usable) + 2 GB swap, 2 vCPUs, 80 GB disk |

The original workstation already has working Git credentials for the GitHub
remote. Do not create or expose a new GitHub token unless the existing credential
manager stops working.

## Workstations

Two Windows computers work on the same `aws-lightsail` branch. Commands in this
handover use the original workstation's paths; on the second workstation,
substitute the paths below.

Scripts under `scripts\windows\` are in Git, so both workstations have them.
Their defaults point at the original workstation's `E:\` paths on purpose; leave
those defaults unchanged. On the second workstation:

- `sync-economic-calendar.ps1` runs with
  `-SshKey C:\Users\kelvi\.ssh\LightsailDefaultKey-us-west-2.pem`; FBS MT5 is
  installed at the same default path.
- `sync-market-data.ps1` runs with
  `-DownloaderRoot C:\Users\kelvi\forextestlab\dukascopy-market-data`.
- `run-market-data-backfill.ps1` hard-codes its `E:\` pipeline and `.env` paths
  with no parameter, so it runs only on the original workstation.
- The `install-*-task.ps1` scripts resolve paths relative to themselves; see the
  scheduled-task row below before running them there.

| Item | Original workstation | Second workstation (`KEVOMANIX`, user `kelvi`) |
|---|---|---|
| Local repository | `E:\desktop\forextestlab` | `C:\Users\kelvi\forextestlab` |
| Lightsail SSH private key | `E:\Downloads\LightsailDefaultKey-us-west-2.pem` | `C:\Users\kelvi\.ssh\LightsailDefaultKey-us-west-2.pem` (ACL: read-only for `kelvi`) |
| SSH shortcut | Full `ssh -i ... ubuntu@52.34.239.239` form | `ssh forextestlab` (alias in `C:\Users\kelvi\.ssh\config`). Quote remote commands in single quotes so PowerShell does not expand `$(...)` locally. |
| Local application environment | `E:\desktop\forextestlab\.env` | `C:\Users\kelvi\forextestlab\.env` (copied from the original workstation; not in Git) |
| Dukascopy bulk-data pipeline | `E:\desktop\dukascopy-market-data` | `C:\Users\kelvi\forextestlab\dukascopy-market-data`, inside the repository folder but excluded through `.git/info/exclude` (local only, so its `market_data` and `logs` are never staged) |
| Pipeline Python | `.validation-venv-py310` in the pipeline folder | Same name and location, built locally from Python 3.10.11 and `requirements.txt` |
| FBS MetaTrader 5 | `C:\Program Files\FBS MetaTrader 5\terminal64.exe` | Installed at the same path |
| Scheduled tasks `ForexTestLab Market Data` and `ForexTestLab Economic Calendar` | Installed and authoritative | Not installed; installing them here too would run each refresh and upload twice |
| Tooling | Existing setup | Git, GitHub CLI, Node.js 24 LTS, and Python 3.10 installed with `winget` |
| GitHub push access | Credential manager | `gh auth login`, then `gh auth setup-git` |
| Commit identity | Configured | Use the same name and email as existing commits (`git log -1 --format='%an <%ae>'`) |

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

Paths below are the original workstation's; see [Workstations](#workstations)
for the second workstation's equivalents. Run locally:

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

A long deploy can outlive the SSH session. If the connection drops, the remote
chain keeps running, but its first write to the dead session fails; under
`set -e`/`pipefail` that stops it after the build and before the restart. The
old process then serves a replaced `.next`. Check
`systemctl show forextestlab -p ActiveEnterTimestamp` against
`.next/BUILD_ID`'s time, and restart if the service is older. For long builds,
run the chain detached (`nohup bash -c '…' > ~/deploy.log 2>&1 &`) and poll the log.

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

- Market refresh: daily at 04:00 Africa/Nairobi through the Windows task
  `ForexTestLab Market Data`; missed runs start when the computer is next available
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

Email DNS (2026-10-23): Resend (us-east-1) signs with the single
`resend._domainkey` TXT record and uses `send.forextestlab.com` (MX + SPF
`include:amazonses.com`) as its return path. The apex SPF is `v=spf1 ~all`:
Zoho and Namecheap Private Email are retired. DMARC is `p=none`. The apex MX
points at Resend inbound. Resend also lists an unused eu-west-1 copy of the
domain ("not started"); its DKIM record was removed from DNS.

Cloudflare DNS can be changed through the API with the account's **Global API
Key** (sent as `X-Auth-Key` with `X-Auth-Email` set to the Cloudflare login),
kept on workstation 2 at `C:\Users\kelvi\OneDrive\Documents\Cloudfare key.txt`.
It controls the whole account: never print it, and prefer a scoped
"Edit zone DNS" token if one is created. The zone ID is
`f506f6cb422fb6253ceab9310ecae68f`.

## Cloudflare R2 market data

Production reads private monthly Parquet objects through the R2 S3-compatible API.

- Object layout: `market_data/<SYMBOL>/<YYYY>/<MM>.parquet`
- Reader: `src/lib/market-data/providers/r2-parquet-provider.ts`
- Synchronizer: `src/lib/market-data/r2-sync.ts`
- CLI: `scripts/sync-market-data-r2.ts`
- Symbol catalogue and flags: `src/lib/market-data/symbols.ts`
- App symbol health: `https://forextestlab.com/api/backtest/symbols`
- Backward chart context is paged independently of the replay start. Scrolling
  left can reach the provider's earliest candle; the session clock still clamps
  future context so unrevealed replay candles cannot leak into the chart.

The enabled catalogue includes 28 traditional FX pairs, XAUUSD, XAGUSD,
BTCUSD, DXY, US30 (`USA30IDXUSD`), US500 (`USA500IDXUSD`), and NAS100
(`USATECHIDXUSD`). The Windows daily downloader refreshes these indices through
their Dukascopy feeds; targeted
historical backfills can be launched with `run-market-data-backfill.ps1 -Symbols`.

Supabase is not used to serve OHLC candles. This design protects Supabase egress;
historical candles are fetched from R2 monthly Parquet snapshots and cached in
the app process.

### R2 runtime request behaviour

The R2 provider's process-local caches (changed 2026-10-23 after measuring):

- Manifest: listed per symbol in parallel (~1 s instead of ~10 s for one
  sequential listing of 9,000 objects), served stale-while-revalidate with a
  5-minute refresh, and saved to `data/.r2-manifest.json` so a restart serves
  the saved copy at once. Before this, the first market pick after any
  5-minute idle waited ~11 s.
- Available ranges: cached per symbol for an hour, keyed by its first and last
  month objects (it decodes those two months to find the exact first and last
  candle).
- Monthly candle cache: 48 months (`MAX_CACHED_MONTHS`), ~5 MB each decoded
  (measured), TTL 15 minutes. It held one month, so every pair switch
  re-downloaded.
- R2 candles no longer carry bid copies of the OHLC (execution only uses bid
  fields when ask fields exist too, which this archive never has); responses
  are ~37% smaller. Cloudflare already compresses API JSON to browsers (the
  origin does not; nginx was left unchanged).

Chart rollups (`scripts/build-rollups-from-r2.ts`, `npm run data:build-r2-rollups`,
timer `forextestlab-rollups.timer` daily 03:15 UTC, incremental last 2
months; `-- --full` rebuilds all history):

- `market_data_rollups/1h/<SYMBOL>/<YYYY>/<MM>.parquet`: complete hours.
  1h/2h/4h/6h/12h charts read these and build only the stretch after the last
  complete hour (the hour in progress, or hours since the last build) from
  minutes. A month without a rollup falls back to minutes.
- `market_data_rollups/1d-ny/<SYMBOL>.parquet`: complete 17:00 New York days.
  The 1d chart reads it and builds the open day from minutes.
- `market_data_rollups/1d/<SYMBOL>.parquet` (UTC days, from the Windows
  `data:build-rollups`) still feeds weekly/calendar charts; it is not rebuilt
  automatically.
- Measured before rollups: 6 months of 1h took 2.4 s cold, 12 months of 1d
  6.5 s cold. `r2-rollups.test.ts` proves rollup output equals building from
  minutes and never passes the replay clock. Do not interpret Nginx API
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
memory. The server has 4 GB RAM plus 2 GB swap (upgraded from 2 GB on
2026-10-21), so a larger cache is now feasible but should still be bounded by
bytes or per-symbol recency rather than made unlimited.

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

## Prop-firm challenges are kept apart from practice

A challenge is a session whose `config.propFirm` is set. Its rule state is
mirrored onto the session row so lists and statistics never read snapshots:

- `challengeStatus` (`active` | `passed` | `breached`; **null on an ordinary
  backtest**), `challengeBreach`, `challengeDayKey`, `challengeDayStartEquity`
  and `challengeTradingDays`. Session creation and `persistSession` write them
  through `challengeColumns()` in `src/lib/backtest/challenge-record.ts`; set
  them nowhere else.
- `challengeStatus: null` is the practice filter. The dashboard's session list,
  last-30-trades figures and weekly trade count use it. Practice time and the
  streak still count challenge time.
- `/app/challenges` (`challenge-queries.ts`, `ChallengesView.tsx`) shows the
  running challenge as three gauges from `propFirmProgress`, computed from the
  row alone. Cursor-only checkpoints skip the engine save, which the client
  does only when no position or order exists, so a replay day that differs from
  `challengeDayKey` is treated as opening at the stored equity.
- The dashboard shows a strip for a running challenge. History has
  All/Practice/Challenges views and a Challenge tag; the Analytics picker tags
  challenges. `/app/backtest?mode=challenge` opens setup in challenge mode;
  `&phase=2&market=GBPUSD&size=10000` also preselect the phase, market and
  account size (`challengeStartHref` / `parseChallengeStart`). With nothing
  running, the page offers the next step from the latest attempt
  (`nextChallengeStep`): Start Phase 2, Try again, or both phases passed.
- Migration `202610210001_challenge_columns` marks every challenge from its
  compact config and fills runtime fields from inline snapshots. Sessions whose
  snapshot is in R2 need `npm run challenges:backfill` once after it.

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
- Autoplay skips empty intervals on the focused secondary market (including
  US30 and NAS100) to its next downloaded candle. `focusedMarketResumeIndex`
  selects the destination without guessing opening hours or treating an unloaded
  tail as a closure. The shared clock still processes every intervening primary
  candle when positions, pending orders, or a challenge require accounting;
  an idle account uses the existing guarded fast-forward path. Manual next/back
  controls keep their existing timeframe behavior.
  PriceChart rebuilds forward whitespace in the same render when new display
  bars cross a gap; retaining the cached pre-jump placeholders would temporarily
  leave empty logical slots between the close and reopening candles.
  Gaps over four days (or twice the base timeframe for higher-frame sessions)
  are treated as missing data and pause replay rather than auto-skipping weeks.
  A source-data repair does not change existing immutable session candle copies:
  `scripts/repair-session-candle-gap.ts` audits and, with a backup and the app
  stopped, inserts verified missing bars and remaps saved indexes by timestamp.
  It preserves trade prices/results and replay time. Rebuild affected chart
  rollups with `data:build-r2-rollups -- --symbols=EURUSD --from-month=2026-07`.
- A newly added symbol loads at the current replay time, not the session start.
- Every active symbol can receive simulated trades; secondary symbols are not
  reference-only charts.
- Primary buffer publication waits until active secondary buffers have reached
  the same runway. On a secondary fetch failure, the old complete buffer remains
  visible and the extension is retried instead of publishing an incomplete set.
- Server-side pair pagination continues until the primary tail is covered.
  `fetchPairRunway` uses larger internal pages and no 100-page cutoff; the old
  150,000-bar ceiling silently left secondary charts in June when a resumed
  primary clock was in July. Public responses still clamp to the clock/buffer.
- Pair buffers use `mergePairSeries` at commit time, including on the server, so
  late/short responses cannot replace a newer tail. Async extension publication
  rechecks session/engine identity after all secondary fetches complete.
- ChartGrid reports its visible symbols. Automatic closure skips are allowed
  only when no other visible market has candles in the skipped interval; a
  closed US30 pane must not fast-forward an open forex pane. Trades still use
  their own symbol's candles while replay time and account equity stay shared.
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

The same local pipeline is now authoritative for daily incremental updates:

- Windows task: `ForexTestLab Market Data`
- Schedule: daily at 04:00 local time, with `StartWhenAvailable`
- Repository runner: `scripts/windows/sync-market-data.ps1`
- Task installer: `scripts/windows/install-market-data-task.ps1`
- Pipeline command: `main.py --refresh-current --workers 1 --upload`
- Run log: `E:\desktop\dukascopy-market-data\logs\daily-refresh.log`
- The refresh rebuilds only the current UTC month and atomically replaces the
  corresponding R2 object. Existing historical months remain untouched.
- The Lightsail `forextestlab-market-data.timer` is disabled. The server's
  Dukascopy requests were consistently rejected with HTTP 429 and its fail-fast
  ordering starved every symbol after EUR/USD.

The Windows computer must be powered on, connected to the internet, and signed
in to the `KEVO_MANIX` account. If it is off at 04:00, Task Scheduler starts the
missed run when Windows is next available after sign-in.
Run a single-market check without printing credentials:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  E:\desktop\forextestlab\scripts\windows\sync-market-data.ps1 `
  -Symbols EURUSD
```

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

Do not restart or re-enable the AWS market-data timer while Dukascopy rejects the
Lightsail IP. Use the local Jetta pipeline for both daily current-month refreshes
and bulk history.

## Current product state

### UI colour semantics

The visual system deliberately separates product identity from trading results:

- Teal `brand-*` utilities are reserved for ForexTestLab identity, primary
  actions, selection, and focus.
- `profit`/`bull` is green, `loss`/`bear` is coral red, `entry` is blue, and
  `exit` is gold. These semantic Tailwind colours use theme-aware RGB variables
  declared in `src/app/globals.css`.
- Canvas and SVG charts use the matching literal values because chart renderers
  do not consistently resolve CSS variables.
- Palette definitions live in `tailwind.config.ts`; do not use the brand colour
  to represent positive P/L or bullish candles.

- The dashboard (`src/app/app/page.tsx`, `SignedInDashboard.tsx`) reads top to
  bottom: greeting and named Continue button, the running-challenge strip,
  "Backtest results" (`PerformanceOverview.tsx`), then sessions. App copy says
  "backtest" for non-challenge work, never "practice" (code names and the
  History `?view=practice` link keep the old word). The results
  heading is a verdict from `performanceVerdict()`: "Too early to call" under
  `EARLY_DAYS_TRADES` (30), then profitable, down, or break-even (profit
  factor within 0.95–1.05). It shows no trade count. Results
  cover 30 days, 90 days or all time (`?period=`, remembered in the
  `ftl_performance_period` cookie; default all time) and exclude challenges
  and experimental trades. `loadPracticePerformance()` in
  `practice-performance-query.ts` computes them in PostgreSQL: totals, plus a
  cumulative curve sampled to about 200 points that always keeps the last
  trade and the drawdown trough, so egress does not grow with history.
  `describePerformance()` derives the rest. Each figure is shown once.
- Dashboard motion (`reveal-x`, `grow-x`, `fade-in`, `underline-in` in `tailwind.config.ts`)
  sits behind `motion-reduce:`. Animate absolutely positioned chart markers
  with opacity only: a transform turns the animated wrapper into their
  containing block and moves them off the plot.
- Email (`src/lib/contact-email.ts`) sends through Resend whenever
  `RESEND_API_KEY` is set; the `SMTP_*` settings on the server are an unused
  fallback. Sign-up and password-reset mail comes from Supabase Auth, not this
  code. Rules:
  - Inbound mail (`/api/webhooks/resend`) joins an open email conversation by
    the In-Reply-To/References Message-IDs first, then by subject without
    `Re:`/`Fwd:` prefixes (`support-email-threading.ts`). Email replies set
    In-Reply-To to the customer's last Message-ID so the next answer links back.
  - The copy to `RESEND_INBOUND_FORWARD_TO` is sent once, after the message is
    stored, and says to answer in `/support-team`, never from that mailbox.
  - Sends after a saved record (contact form, widget receipts) run in
    `after()` and never report failure to the visitor. Every failed send is
    recorded with `recordEmailFailure()` as an `email.failed` audit event; the
    agent sees a warning, and the operations `email` check turns degraded.
  - The `email` check also asks Resend whether the key works and the
    `RESEND_FROM_EMAIL` domain is verified.
  - Notices for the team (monitor alerts, contact-form copies) go to
    `RESEND_INBOUND_FORWARD_TO`, never to the support address: that address
    feeds the support inbox. The webhook ignores mail from the site's own
    `RESEND_FROM_EMAIL`, which once filed alerts as tickets.
- Plans (prepared 2026-10-23, live only when `BILLING_ENABLED=true`; until
  then `isProPlan()` gives every account Pro):
  - Rules live in `src/lib/billing/plan-limits.ts` (limits), `plan-copy.ts`
    (wording) and `entitlements.ts` (`planEntitlements`, `assertSessionAllowed`).
  - Free: 3 new sessions per account per **UTC calendar month** (renews 00:00
    UTC on the 1st), counted in `FreeSessionUsage` by an atomic conditional
    increment inside `createSession`; deleting a session does not refund it.
    Seven USD majors (`FREE_SYMBOLS`), ≤31 days from any start date, 1 pair,
    speed ≤1200, no full analytics/AI/exports/challenges. Duplicates and
    branches count as new sessions. There is no saved-session cap
    (`maxSavedSessions` was never enforced and was removed). The old device
    trial (`TrialDevice`, cookie `ftl_trial_device`, `/api/backtest/trial`) is
    retired; the table is kept and the route answers 410.
  - Server enforcement: `assertSessionAllowed` (create/duplicate/branch),
    pair and extend routes, action route (speed; continuing a challenge needs
    Pro), AI route, `/api/backtest/sessions/[id]/export` (CSV is built there),
    and exit-quality reports are computed only for Pro. UI locks use
    `ProLock` (`src/components/app/ProLock.tsx`) and are explanations only.
    Chosen design ("Peek", 2026-10-26): every lock opens a right-side Pro
    panel with the reached-for feature pinned first; `ProPeek` blurs larger
    areas (locked markets, Reports tab, Challenges page) under one unlock
    card. Blurred reports use sample trades only, never the trader's own.
  - Pro trial: Paddle is canonical (Paystack has no native trials and keeps
    only its legacy webhook/manage paths). A 7-day card-required trial is a
    separate Paddle price per interval: `PADDLE_<MODE>_PRO_<MONTH|YEAR>_TRIAL_PRICE_ID`.
    `/api/billing/checkout` creates the Paddle transaction and picks the price
    (`checkout.ts` `proTrialEligible`: one trial per account, never after a
    subscription), so a trial cannot be claimed twice from the browser.
    `subscriptionAccess()` in `paddle-service.ts` maps statuses: trialing = Pro
    until `trialEndsAt` (no grace); active = Pro + 5-day grace; past_due after
    a trial = Free; past_due on a paying plan = grace; canceled = Free.
    Cancelling uses `effective_from: next_billing_period`, which during a trial
    ends at the trial's end with no charge (verify in the Paddle sandbox).
    Zero-total trial transactions are not recorded as payments.
  - Admin "View as Free" (admin console banner) sets the `ftl_plan_preview`
    cookie; `freePreviewActive()` (`plan-preview.ts`) then gives that admin
    Free entitlements everywhere, server checks included, while billing stays
    off for everyone else. The app shows an "Exit preview" banner.
- Page speed rules (2026-10-23): never use `prisma.$transaction([...])` for
  independent reads on a page (it runs them one by one, ~23 ms each); use
  `Promise.all`. `ensureUserProfile()` is cached per request and writes only
  when the profile is missing or changed. The middleware skips `/api/version`
  (polled each minute by every app tab). `/admin/operations` shows the
  monitor's stored snapshot (`data/.operations-snapshot.json`, written every
  15 minutes by `operations:monitor`; refreshed live when older than 30
  minutes or on "Check now"), because a fresh one lists all of R2 (~10 s).
  The checks inside a snapshot run in parallel.
- Support workspace (`/support-team`): every action re-renders the page on the
  server, so keep its reads in `Promise.all`, not `prisma.$transaction` (a
  transaction runs them one by one: ~270 ms vs ~25 ms). Customer emails from
  agent actions go out in `after()`; a failure is posted as an internal note.
  Form buttons use `SubmitButton` from `controls.tsx` to show progress.
  - Customer lifecycle emails (`src/lib/lifecycle-email.ts`, sent through
    `sendLifecycleEmail()` in `lifecycle-send.ts`, which sends each key once
    and records `email.lifecycle_sent` audit events): welcome (auth callback,
    accounts under 2 days old), Pro activated / payment failed / cancelled /
    Pro ended (Paddle `syncSubscription` and Paystack webhooks, on a change of
    state only; receipts stay with the providers), access ending in 3 days
    (`access-reminders.ts`, run by the monitor, only while `BILLING_ENABLED`),
    access granted / revoked (admin users), support team added or role changed,
    conversation resolved, password changed (`/api/account/password-changed`,
    called by the password form) and account deleted. Deleting an account
    first cancels live Paddle/Paystack subscriptions; a refusal is audited as
    `billing.cancel_on_delete_failed` and alerts the team.
  - Supabase sends sign-up, reset, email-change, magic-link, invite and
    reauthentication mail through Resend SMTP (`noreply@forextestlab.com`),
    with the branded templates in `docs/email-templates/supabase/` (regenerate
    with `scripts/export-auth-email-templates.ts` and paste into Supabase).
  - Monitor alerts (`src/lib/operations/alerting.ts`): failed alerts at once
    and every 6 hours; degraded only after 12 hours, then daily; "recovered"
    only for an incident that alerted. The state file is
    `data/.operations-monitor.json`.
- Deployment host: AWS Lightsail behind Cloudflare; Vercel is not used.
- On 2026-10-21 the instance was replaced by a 4 GB instance created from a
  snapshot of the 2 GB one. The static IP `52.34.239.239` moved to the new
  instance, so DNS, Nginx, TLS, and `.env` were unchanged. The old instance was
  stopped and is pending deletion. Verified on the new instance: revision
  `8ea5a51` with a clean tree, `forextestlab` and `nginx` active, the calendar
  import, monitor, and database-backup timers scheduled, the market-data timer
  still disabled, and `/api/version` plus all 38 symbols served through both
  the origin and Cloudflare. The only failed unit was Ubuntu's unrelated
  `fwupd-refresh.service`.
- New SSH host keys came with the new instance. A workstation that connected
  before the move clears the stale entry with `ssh-keygen -R 52.34.239.239`.
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

## 2026-10-26 — Chart readability and reusable templates

- Session axis labels yield when the crosshair is within their label area; off-plot session labels are culled. Price axes update after symbol metadata arrives and index axes omit trailing zeros while retaining sub-point tick precision.
- Spread moved beside both the chart quote buttons and floating replay buttons. Index spreads are converted from configured pips into actual points. Lot-size popovers remain available.
- News clusters reserve 36 px for flags/counts and cap visible counts at 99+ (the full events remain in the tooltip). Added a per-chart Auto price-scale button, compact instrument display names, and an explicit Session caption with the current replay date.
- Fixed account workspace capture to include symbol-qualified cell keys and layouts with more than four cells. Initial chart persistence no longer overwrites saved indicators with an empty mount state. Session indicator inputs are remembered for the next addition and included in account sync.
- Settings > Templates saves/applies/deletes named preferences through the existing authenticated workspace API, with local templates for unsigned users. Templates contain chart appearance, per-cell indicators, favourites and drawing-tool defaults; they do not copy drawing coordinates, market selection, replay state or orders. Existing drawings retain their per-symbol keys. The applied first chart style is the default for newly opened charts.
- Validation: 12 focused unit tests, TypeScript, production build, and a two-chart browser fixture: session label/crosshair visibility, delayed precision correction, template save/remove/apply, and indicator persistence after reload. Browser fixture lives under ignored .tmp/chart-ui-check.

## 2026-10-26 — US30 September exhausted-tail repair

- The September R2 files were truncated: US30 ended Sep 22 05:37 UTC (20,126 rows), US100 ended Sep 22 05:36 UTC (20,152 rows), and EURUSD ended Sep 29 07:32 UTC. Downloaded missing tails through the official browser exporter and uploaded verified merged files: US30 29,130; US100 29,160; EURUSD 31,500 rows, all ending Sep 30 23:59 UTC. Rebuilt hourly and New York daily rollups for all three from September (0 failures).
- Reported session f4326e8b-174a-4032-b09a-7e5acdc2a60d had saved primary time Sep 24 20:59 UTC, beyond the US30 data tail. No trade records or saved progress were rewritten.
- Playback now checks the tails of every visible/focused/traded secondary market independently of the primary runway. It requests a fresh pair tail before advancing; if no further candles are returned, it pauses with an explicit message and preserves the clock. Buffered normal closures still skip to their reopening candle. Refresh merges existing history and keeps per-pair context.
- Validation: all 369 backtest tests, TypeScript, browser hook fixture showing missing tail pauses at index 0 after one refresh, and recoverable tail resumes at the normal reopening index 106.
- Local external downloader now accepts --month=YYYY-MM; the root Windows sync wrapper accepts -Month, allowing older truncated months to be repaired without resetting the normal current-month updater.

### 2026-10-26 — Individual indicator and drawing templates
- Added per-type Template menus in every indicator settings dialog, drawing settings dialog, and selected drawing toolbar. Save as, apply defaults, apply named preset, and delete; matching names update that type's preset.
- Drawing presets include style and timeframe visibility, never IDs/anchors/locking. Optional style fields absent from the preset are cleared when applied through the merging drawing engine.
- Saved in forextestlab:individual-tool-templates and included in account workspace sync. Timestamp merge and deletion tombstones preserve newer local edits during restore.
- Verified 56 targeted tests (including all 48 drawing types), TypeScript, and real browser dialog fixtures: Fibonacci save/reload/apply, anchor preservation, per-type isolation, Sessions timezone restore.

## 2026-10-27 — AI Analyst page

- `/app/ai` is a full-screen page (the main menu shrinks to icons there; the
  menu's own collapse toggle is in the top bar on every other page, kept in
  the `ftl-nav-collapsed` cookie). Help launcher is hidden on it.
- Chats are stored in the new `AiChat` table and the trader's rules in
  `TradingPlan` (migration `20261027120000_ai_chats_and_trading_plan`,
  additive). `/api/ai/insights` with a `chatId` reads history from the chat
  and saves the answer itself when the stream ends, even if the tab closed.
- The AI answers through Gemini function calling (`lib/ai/gemini.ts`
  `streamGeminiWithTools`, tools in `lib/ai/tools.ts`, pure maths in
  `lib/ai/trade-query.ts`): find/group trades, what-if-skipped, and
  what-if-levels (re-runs a finished session's trades on real candles via
  `testTradePlan`). Tools read the 40 most recently used sessions' states.
- Gemini 2.5 thinking has its own 1,024-token budget and answers get 8,192
  tokens; before this, thinking used the 1,200 limit and cut answers off.
- Citations `[#12@abc123]` (abc123 = last six of the session id) link to
  `/app/analytics?session=…&trade=12`; ```chart JSON blocks render as bar charts.
- Deploys that change `prisma/schema.prisma` must run `npx prisma migrate
  deploy && npx prisma generate` before the build (see above).
