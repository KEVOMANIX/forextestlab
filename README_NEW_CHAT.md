# ForexTestLab new-chat handover

Last reviewed: 2026-08-18 (Africa/Nairobi)

This is the copy-safe operational handover for a new coding chat. It contains
credential **locations and environment-variable names**, never credential
values. Read the whole file before changing or operating the application.

## Paste this into every new chat

```text
Read E:\desktop\forextestlab\README_NEW_CHAT.md completely before doing any
work. Treat it as the operational context for ForexTestLab. Inspect the current
Git state and relevant code instead of assuming the handover is current. Never
print, copy, expose, or commit secret values from .env files or the PEM key.

For an implementation request, make the change locally, run proportionate
checks, commit only task-related files, push aws-lightsail, deploy through the
documented SSH path, and verify both the Lightsail origin and public Cloudflare
URL unless I explicitly say local-only or do not deploy. Preserve unrelated
working-tree changes and never use git reset --hard.
```

## Non-negotiable security rules

- Never paste or print `.env`, `.env.local`, a private key, an API token, a
  database URL, an OAuth secret, an SMTP password, or a webhook secret.
- It is safe to report variable names and credential file paths, not values.
- Never commit `.env*` or `*.pem`. They are ignored by Git.
- Never replace the production `.env` as part of a Git deployment.
- Do not create new cloud keys while the existing credentials still work.
- Do not put secrets in commands where command history, logs, screenshots, or
  process listings can expose them.
- Preserve unrelated and untracked user files. Stage explicit paths only.
- Use `git revert` for a committed rollback. Never use `git reset --hard`.

## Project and access map

| Item | Location |
|---|---|
| Local repository | `E:\desktop\forextestlab` |
| Production branch | `aws-lightsail` |
| Git remote | `https://github.com/KEVOMANIX/forextestlab.git` |
| Production repository | `/home/ubuntu/forextestlab` |
| Production URL | `https://forextestlab.com` |
| Canonical `www` URL | `https://www.forextestlab.com` |
| Lightsail public IP | `52.34.239.239` |
| SSH user | `ubuntu` |
| SSH private-key path | `E:\Downloads\LightsailDefaultKey-us-west-2.pem` |
| Next.js origin | `127.0.0.1:3000` on Lightsail |
| Reverse proxy | Nginx on ports 80 and 443 |
| DNS/CDN | Cloudflare; registrar is Namecheap |
| Local bulk-data project | `E:\desktop\dukascopy-market-data` |

GitHub authentication is already configured locally and on the server. Normal
development and deployment do not require creating or revealing a GitHub token.
Vercel is not the production host.

Never trust a hard-coded revision in a handover. Compare the three live states:

```powershell
cd E:\desktop\forextestlab
git rev-parse --short HEAD
git rev-parse --short origin/aws-lightsail
ssh -i "E:\Downloads\LightsailDefaultKey-us-west-2.pem" ubuntu@52.34.239.239 `
  "cd /home/ubuntu/forextestlab && git rev-parse --short HEAD"
```

## Credential and configuration inventory

### Files containing secret values

| Scope | Authoritative location |
|---|---|
| Local application environment | `E:\desktop\forextestlab\.env` |
| Optional local overrides | `E:\desktop\forextestlab\.env.local` |
| Production application environment | `/home/ubuntu/forextestlab/.env` |
| Lightsail SSH private key | `E:\Downloads\LightsailDefaultKey-us-west-2.pem` |

The main systemd unit reads `/home/ubuntu/forextestlab/.env` through
`EnvironmentFile=`. Restrictive permissions must be retained.

List environment **names only** locally:

```powershell
Get-Content .env,.env.local -ErrorAction SilentlyContinue |
  ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') { $matches[1] } } |
  Sort-Object -Unique
```

List environment **names only** on production:

```bash
sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' /home/ubuntu/forextestlab/.env | sort
```

### Environment-variable groups

Application and defaults:

- `NEXT_PUBLIC_APP_URL`
- `ENABLE_DEMO_DATA`
- `DEFAULT_ACCOUNT_BALANCE`
- `DEFAULT_COMMISSION_PER_LOT`
- `DEFAULT_SLIPPAGE_PIPS`
- `DEFAULT_SPREAD_PIPS`

Active Supabase/PostgreSQL runtime:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

Migration/reference variables—not active runtime names:

- `NEW_DATABASE_URL`
- `NEW_NEXT_PUBLIC_SUPABASE_URL`
- `NEW_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEW_SUPABASE_SECRET_KEY`
- `OLD_DATABASE_URL`

Always update the **unprefixed** Supabase names for the live application. Using
the prefixed migration variables previously left authentication pointing at an
old quota-exceeded project.

Cloudflare and R2:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (local build
  compatibility only; the AWS runtime uses normal PostgreSQL)

Google and AI:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`

Zoho/SMTP support and contact email:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `CONTACT_FROM_EMAIL`
- `CONTACT_TO_EMAIL`

Paddle billing:

- `PADDLE_MODE`
- `NEXT_PUBLIC_PADDLE_ENV`
- `PADDLE_LIVE_API_KEY`
- `PADDLE_LIVE_CLIENT_TOKEN`
- `PADDLE_LIVE_WEBHOOK_SECRET`
- `PADDLE_LIVE_PRO_MONTH_PRICE_ID`
- `PADDLE_LIVE_PRO_YEAR_PRICE_ID`
- Equivalent `PADDLE_SANDBOX_PRO_*` keys and price IDs

Paystack billing:

- `PAYSTACK_MODE`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_CHECKOUT_ENABLED`
- `PAYSTACK_CHECKOUT_PAUSED`
- `PAYSTACK_PRIMARY_CURRENCY`
- `PAYSTACK_KES_*` plan and price variables
- `PAYSTACK_USD_*` plan and price variables

Market-data providers:

- `MARKET_DATA_PROVIDER`
- `DUKASCOPY_DATA_AUTHORIZED`
- `TRADERMADE_ENABLED`
- `TRADERMADE_API_KEY`
- `TWELVE_DATA_ENABLED`
- `TWELVE_DATA_API_KEY`

Administration:

- `ADMIN_EMAILS`
- `ADMIN_IMPORT_TOKEN`

Legacy local configuration may contain `VERCEL_OIDC_TOKEN`. Vercel is no longer
used for production; do not restore Vercel deployment accidentally.

## Work automatically: standard implementation workflow

1. Read this file and inspect `git status --short --branch`.
2. Read the relevant routes, components, libraries, schema, tests, and deployment
   templates before editing.
3. Preserve unrelated changes. Use `apply_patch` for intentional edits.
4. Run the checks appropriate to the risk. For cross-cutting work run all three:

```powershell
cd E:\desktop\forextestlab
npm run typecheck
npm test -- --run
$env:NEXT_TELEMETRY_DISABLED='1'; npm run build
```

5. Stage only task-related files, review the staged diff, commit, and push:

```powershell
git diff --check
git add -- <explicit task files>
git diff --cached --check
git diff --cached --stat
git commit -m "Concise task description"
git push origin aws-lightsail
```

6. Deploy only the pushed revision. Do not upload a local `.env`:

```powershell
ssh -o StrictHostKeyChecking=accept-new `
  -i "E:\Downloads\LightsailDefaultKey-us-west-2.pem" `
  ubuntu@52.34.239.239 `
  "cd /home/ubuntu/forextestlab && git pull --ff-only origin aws-lightsail && NEXT_TELEMETRY_DISABLED=1 npm run build && sudo systemctl restart forextestlab"
```

7. Wait briefly, then verify origin, service, revision, and public traffic:

```powershell
ssh -i "E:\Downloads\LightsailDefaultKey-us-west-2.pem" ubuntu@52.34.239.239 `
  "cd /home/ubuntu/forextestlab && git rev-parse --short HEAD && systemctl is-active forextestlab && curl -fsS http://127.0.0.1:3000/api/version"

curl.exe -fsS "https://forextestlab.com/api/version?fresh=$(Get-Date -Format yyyyMMddHHmmss)"
```

8. Report the commit, tests, deployment result, and remaining risks.

Avoid piping a Windows CRLF here-string into a remote Bash script when a simple
one-line SSH command works; a trailing carriage return can corrupt URLs.

### Database migrations

When a task adds a Prisma migration, deploy it after the pull/build and before
the restart:

```bash
cd /home/ubuntu/forextestlab
npx prisma migrate status
npx prisma migrate deploy
```

Never use `prisma migrate dev` against production. Prisma schema and migrations
live in `prisma/schema.prisma` and `prisma/migrations/`.

### Rollback

Prefer a forward corrective commit. If an immediate rollback is required:

```powershell
git revert <bad-commit>
git push origin aws-lightsail
```

Then pull, build, restart, and verify through the standard deployment workflow.
Do not reset the shared branch or production repository destructively.

## Application map

| Concern | Primary path |
|---|---|
| Next.js routes and pages | `src/app/` |
| Product UI components | `src/components/` |
| Backtest/replay engine | `src/lib/backtest/` |
| Chart logic | `src/lib/chart/` and `src/components/app/` |
| Market-data providers | `src/lib/market-data/` |
| Economic calendar | `src/lib/economic-calendar/` |
| Supabase/auth helpers | `src/lib/supabase/` and auth routes under `src/app/` |
| Support customer UI | `src/components/support/` |
| Support agent workspace | `src/app/support-team/` and `src/components/support/team/` |
| Billing | `src/lib/billing/` and `src/app/api/billing/` |
| Database schema | `prisma/schema.prisma` |
| Operational scripts | `scripts/` |
| Systemd and Nginx templates | `deploy/` |
| Unit tests | colocated `*.test.ts`/`*.test.tsx` under `src/` |
| E2E tests | `tests/` and Playwright configs |

Useful package commands are defined in `package.json`. Important ones include
`typecheck`, `test`, `build`, `prisma:generate`, `data:sync-r2`,
`calendar:import`, `operations:monitor`, and `database:backup`.

## AWS Lightsail operations

Open an interactive session:

```powershell
ssh -o StrictHostKeyChecking=accept-new `
  -i "E:\Downloads\LightsailDefaultKey-us-west-2.pem" `
  ubuntu@52.34.239.239
```

Main service:

- Template: `deploy/forextestlab.service`
- Installed unit: `/etc/systemd/system/forextestlab.service`
- Working directory: `/home/ubuntu/forextestlab`
- Environment: `/home/ubuntu/forextestlab/.env`
- Listener: `127.0.0.1:3000`
- Restart policy: on failure, after five seconds

Useful checks:

```bash
sudo systemctl --no-pager --full status forextestlab
sudo journalctl -u forextestlab -n 200 --no-pager
systemctl is-active forextestlab nginx
free -h
df -h
sudo ss -ltnp | grep -E ':80|:443|:3000'
curl -fsS http://127.0.0.1:3000/api/version
```

Installed automation:

| Job | Units | Schedule |
|---|---|---|
| Market-data refresh | `forextestlab-market-data.service/.timer` | Mon-Sat 00:20 UTC, up to 10m random delay |
| Economic-calendar incoming import | `forextestlab-calendar-import.service/.timer` | Every 30 minutes |
| Production monitor | `forextestlab-monitor.service/.timer` | Every 15 minutes |
| Critical database backup | `forextestlab-database-backup.service/.timer` | Sunday 02:30 UTC, up to 10m random delay |
| Manual market backfill | `forextestlab-market-data-backfill.service` | Started manually |

Check all jobs:

```bash
systemctl list-timers --all --no-pager | grep forextestlab
sudo journalctl -u forextestlab-market-data.service -n 150 --no-pager
sudo journalctl -u forextestlab-calendar-import.service -n 150 --no-pager
sudo journalctl -u forextestlab-monitor.service -n 150 --no-pager
sudo journalctl -u forextestlab-database-backup.service -n 150 --no-pager
```

Changing a template in Git does not update `/etc/systemd/system` automatically:

```bash
sudo cp deploy/<unit-name> /etc/systemd/system/<unit-name>
sudo systemctl daemon-reload
sudo systemctl enable --now <timer-or-service>
```

## Nginx, Cloudflare, TLS, and Namecheap

- Git templates: `deploy/nginx-forextestlab.conf` and
  `deploy/nginx-forextestlab-tls.conf`
- Installed Nginx site: `/etc/nginx/sites-available/forextestlab`
- Enabled site: `/etc/nginx/sites-enabled/forextestlab`
- Logs: `/var/log/nginx/access.log` and `/var/log/nginx/error.log`
- Let's Encrypt certificate:
  `/etc/letsencrypt/live/forextestlab.com/fullchain.pem`
- Let's Encrypt private key:
  `/etc/letsencrypt/live/forextestlab.com/privkey.pem`
- Certbot renewal is scheduled automatically.

Validate before every reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Cloudflare is authoritative DNS. Apex and `www` point to `52.34.239.239` and are
proxied. Namecheap is only the registrar. Email MX/TXT/DMARC records remain
DNS-only. Do not delete email DNS records while editing website DNS.

The Nginx proxy buffers are deliberately enlarged because Supabase OAuth can set
multiple cookies. Removing them can cause `upstream sent too big header` and a
502 on `/auth/callback`.

## Supabase, authentication, and egress policy

The application uses Supabase/PostgreSQL for accounts, sessions, trades,
analytics, calendar cache, support messages, and other application records.
Historical OHLC candles are served from R2, not Supabase.

Supabase Auth URL configuration for the active project should include:

- Site URL: `https://www.forextestlab.com`
- Redirect: `https://www.forextestlab.com/**`
- Redirect: `https://forextestlab.com/**`
- Redirect: `https://www.forextestlab.com/auth/callback`

After changing active Supabase variables, rebuild and restart because public
environment values are embedded during the Next.js build. Test OAuth in an
incognito window to avoid stale cookies.

Egress rules:

- Select only required columns and avoid frequent full-table/full-thread polls.
- Keep OHLC and regenerable bulk data out of Supabase request paths.
- Support text messages are small; attachments are the larger support egress
  risk if their binary bodies are stored in PostgreSQL. Prefer R2 for blobs.
- Typing/presence should remain ephemeral and must not create a database write
  per keystroke.
- The weekly R2 backup intentionally excludes large/regenerable tables.

## Cloudflare R2 market data

- Object layout: `market_data/<SYMBOL>/<YYYY>/<MM>.parquet`
- R2 reader: `src/lib/market-data/providers/r2-parquet-provider.ts`
- Synchronizer: `src/lib/market-data/r2-sync.ts`
- Sync CLI: `scripts/sync-market-data-r2.ts`
- Symbol catalogue/flags: `src/lib/market-data/symbols.ts`
- Public symbol health: `https://forextestlab.com/api/backtest/symbols`

The configured catalogue includes traditional FX pairs and selected non-FX
instruments. Inspect the source rather than relying on a stale count.

All bulk, historical, earliest-available, and new-symbol downloads must use the
local Jetta/Dukascopy pipeline. The Node R2 synchronizer is reserved for the
small scheduled incremental refresh; its CLI rejects bulk start-date flags.
This also avoids the HTTP 429 responses previously received from the AWS
origin during large downloads:

| Item | Path |
|---|---|
| Project | `E:\desktop\dukascopy-market-data` |
| Python | `.validation-venv-py310\Scripts\python.exe` |
| Data | `market_data` |
| Configuration | `config.py` |
| Downloader | `main.py` |
| Upload-only tool | `upload.py` |
| Validator/repair tool | `verify.py` |
| Main log | `logs\download.log` |
| Background output | `logs\cross-download.out.log` |
| Error log | `logs\errors.log` |

Example resumable download using credentials loaded from the main project
environment—never paste keys into source:

```powershell
cd E:\desktop\dukascopy-market-data
.\.validation-venv-py310\Scripts\python.exe main.py --symbol EURAUD --workers 1 --upload
```

Preferred resumable launcher:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  E:\desktop\forextestlab\scripts\windows\run-market-data-backfill.ps1
```

The preferred launcher loads credentials from the main project environment
without printing them, checks for an existing `main.py` process, starts at the
earliest configured month for each instrument, uses one worker to reduce
provider throttling, validates completed Parquet files, and uploads them using
the established `market_data/<SYMBOL>/<YYYY>/<MM>.parquet` layout. Existing
valid local files and R2 objects are skipped.

## Economic-calendar automation

- Windows task: `ForexTestLab Economic Calendar`
- Intended export time: daily at 11:00 Africa/Nairobi
- Task installer: `scripts/windows/install-calendar-task.ps1`
- Sync bridge: `scripts/windows/sync-economic-calendar.ps1`
- MT5 exporter: `scripts/mt5/ExportEconomicCalendar.mq5`
- MT5 terminal: `C:\Program Files\FBS MetaTrader 5\terminal64.exe`
- Local output:
  `%APPDATA%\MetaQuotes\Terminal\Common\Files\forextestlab-calendar.csv`
- Server incoming file:
  `/home/ubuntu/forextestlab/data/forextestlab-calendar.csv.incoming`
- Server active file:
  `/home/ubuntu/forextestlab/data/forextestlab-calendar.csv`

Manual Windows run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  E:\desktop\forextestlab\scripts\windows\sync-economic-calendar.ps1
```

Close all MT5 terminal windows first. The bridge compiles the exporter, runs MT5,
uploads atomically with SCP, and lets the server timer import the incoming file.

## Email operation

Application email is sent through the SMTP variables in the environment. The
visible sender is controlled by `CONTACT_FROM_EMAIL`; changing only the mailbox
provider without updating and rebuilding the production environment can leave
old branding or sender information active.

When testing email:

1. Confirm variable **names and presence**, never print values.
2. Verify the sender domain has correct SPF, DKIM, and DMARC in Cloudflare DNS.
3. Send through the application path so the branded HTML template is exercised.
4. Check application logs and the provider's sent/delivery logs.
5. Never log the SMTP password or OAuth credentials.

## Common incidents

Cloudflare 521 means the origin cannot be reached:

```bash
systemctl is-active forextestlab nginx
sudo ss -ltnp | grep -E ':80|:443|:3000'
curl -fsS http://127.0.0.1:3000/api/version
sudo tail -n 100 /var/log/nginx/error.log
```

Cloudflare/Nginx 502 during OAuth:

- Look for `upstream sent too big header` in the Nginx error log.
- Retain `proxy_buffer_size 32k`, `proxy_buffers 8 32k`, and
  `proxy_busy_buffers_size 64k`.
- Validate and reload Nginx.

Service active but port 3000 unavailable immediately after restart:

- Wait two seconds, inspect `journalctl`, then retry.
- Do not treat a curl issued in the same millisecond as restart as proof of
  failure.

Old Supabase project during login:

- Check the unprefixed production variables.
- Rebuild/restart.
- Check Auth redirects in that same Supabase project.
- Retest in an incognito browser.

Market-data HTTP 429:

- Do not repeatedly restart the AWS backfill service.
- Use the local Jetta pipeline for bulk history and keep AWS refreshes small.

## Keep this handover current

After any infrastructure, credential-location, deployment, scheduled-job, data
pipeline, or architecture change, update this file in the same commit. Never add
secret values. Record durable facts and verification commands, not temporary
screenshots or a revision that will immediately become stale.
