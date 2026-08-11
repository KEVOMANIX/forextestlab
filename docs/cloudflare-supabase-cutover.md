# Cloudflare and Supabase cutover

This runbook moves the application from Vercel to Cloudflare Workers and clones
the current Supabase project into a newly created project. Keep the old services
unchanged until the verification section passes.

## Cost and quota decision

- Start on **Cloudflare Workers Free**. Wrangler minification reduces the
  current Worker to about 2,962 KiB compressed, below the 3,072 KiB limit.
  The margin is only about 110 KiB, so run the dry-run size check below before
  every deployment and optimize again if the bundle grows.
- The new Supabase project can start on **Free**, but this is not extra permanent
  capacity. The traffic fixes in this branch are what make Free plausible.
- Keep market parquet files in the existing Cloudflare R2 bucket
  `forex-history`; they are not part of the Supabase database migration.

## Values needed from the new Supabase project

Create the project in the desired region, then collect these values without
committing them:

- Project reference
- Project URL
- Publishable/anon key
- Secret/service-role key
- Database password
- Session-pooler connection string (port 5432)

Use PowerShell variables for the migration session. Do not paste secrets into
tracked files:

```powershell
$env:OLD_DB_URL = '<old Supabase session-pooler URL>'
$env:NEW_DB_URL = '<new Supabase session-pooler URL>'
```

## 1. Back up the old project

Install the Supabase CLI and Docker Desktop, then follow Supabase's supported
logical backup format:

```powershell
npx supabase db dump --db-url $env:OLD_DB_URL -f roles.sql --role-only
npx supabase db dump --db-url $env:OLD_DB_URL -f schema.sql
npx supabase db dump --db-url $env:OLD_DB_URL -f data.sql --use-copy --data-only -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
```

Store these dump files outside the repository. They contain production data.
Do not use `prisma migrate deploy` as a substitute for this step: Prisma
migrations create the application schema but do not migrate Supabase Auth users.

## 2. Restore into the new project

Restore the roles, schema, and data as one transaction with triggers disabled:

```powershell
psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname $env:NEW_DB_URL
```

Then apply the new waitlist migration added with this change:

```powershell
$env:DATABASE_URL = $env:NEW_DB_URL
npx prisma migrate deploy
```

If the restored database already records or contains every Prisma migration,
inspect `npx prisma migrate status` before changing migration history. Do not
force or reset a production schema.

## 3. Verify before cutover

Run these against both databases and compare results:

```sql
select count(*) from auth.users;
select schemaname, relname, n_live_tup
from pg_stat_user_tables
order by schemaname, relname;
```

Also verify in the new project:

- A migrated user can sign in. A new project has a different JWT secret by
  default, so existing browser sessions will be invalid and users must sign in
  again. Password hashes are migrated with `auth.users`.
- Email templates, redirect URLs, SMTP, OAuth providers, webhooks, Realtime
  publications, and any non-default extensions match the old project.
- Row-level-security policies and grants are present.
- `npm run typecheck`, `npm test`, and `npm run build:cf` pass with the new
  environment values.

## 4. Configure Cloudflare

The R2 binding is already declared in `wrangler.jsonc`. Create a Hyperdrive
configuration using the new Supabase database connection and place its ID in the
commented `HYPERDRIVE` section of that file. Hyperdrive is strongly recommended
for connection reuse; its Free allowance is 100,000 database statements/day.

Add every runtime environment value as a Cloudflare secret or encrypted
deployment variable. At minimum, replace:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- all payment, AI, and SMTP secrets used by enabled features

Set the new Supabase Auth site URL and redirect allow-list to the Cloudflare
preview hostname first, then add the production domain.

Build and preview:

```powershell
npm run build:cf
npx wrangler deploy --dry-run
npm run preview:cf
```

Test sign-up, sign-in, password reset, account, calendar, waitlist, a full replay
session, billing status, and webhooks. Update Paddle/Paystack webhook URLs only
after the Cloudflare preview passes.

## 5. Production switch and rollback

1. Lower the domain DNS TTL ahead of the cutover.
2. Put writes into a short maintenance window.
3. Take a final dump and restore it to capture writes since the rehearsal.
4. Deploy Cloudflare and switch DNS.
5. Monitor Worker errors, Supabase egress, database connections, auth failures,
   and payment webhooks.
6. Keep Vercel and the old Supabase project intact for at least 48 hours.

Rollback is DNS plus environment reversal: point the domain back to Vercel and
restore the old Supabase variables. Do not delete either old service during the
observation window.
