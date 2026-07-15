# ForexTestLab — Landing Website

Production-ready marketing and waitlist site for **ForexTestLab**, a forex
backtesting and market-replay platform **in development**. Built with the
Next.js App Router, TypeScript, and Tailwind CSS, and ready to deploy on Vercel.

> ForexTestLab is an educational and analytical software platform. It is not a
> broker, does not provide financial advice, and does not guarantee trading
> results. It is not affiliated with, sponsored by, or endorsed by TradingView.

---

## Tech stack

- **Next.js 14** (App Router, Server Components)
- **TypeScript** (strict)
- **Tailwind CSS**
- **lucide-react** icons
- File-based SEO (`sitemap.xml`, `robots.txt`, JSON-LD structured data)
- Pluggable server-side storage layer for form submissions

---

## Getting started (local development)

Requirements: **Node.js 18.18+** (Node 20 or 22 recommended) and npm.

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

### Available commands

```bash
npm install    # install dependencies
npm run dev    # start the dev server (http://localhost:3000)
npm run build  # create an optimized production build
npm start      # run the production build locally
npm run lint   # run ESLint
```

---

## Project structure

```
forextestlab/
├── data/                      # Local mock DB (JSON) for form submissions (dev)
├── public/                    # Static assets (icon.svg, og-image.svg)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── waitlist/route.ts   # POST — validates + stores waitlist entries
│   │   │   └── contact/route.ts    # POST — validates + stores contact messages
│   │   ├── about/page.tsx
│   │   ├── contact/page.tsx
│   │   ├── privacy/page.tsx
│   │   ├── terms/page.tsx
│   │   ├── risk-disclosure/page.tsx
│   │   ├── waitlist/page.tsx
│   │   ├── layout.tsx              # Root layout + global metadata
│   │   ├── page.tsx                # Landing page (all sections)
│   │   ├── not-found.tsx           # Custom 404
│   │   ├── robots.ts               # Generates /robots.txt
│   │   ├── sitemap.ts              # Generates /sitemap.xml
│   │   └── globals.css
│   ├── components/                 # Reusable UI + section components
│   └── lib/
│       ├── site.ts                 # Central site config + navigation
│       ├── types.ts                # Shared TypeScript types
│       ├── validation.ts           # Server-side form validation
│       └── storage.ts              # Pluggable submission storage layer
├── .env.example
├── tailwind.config.ts
└── next.config.mjs
```

---

## Environment variables

Copy `.env.example` to `.env.local` and adjust as needed:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Public site URL used for canonical URLs, sitemap, and Open Graph. Defaults to `https://forextestlab.com`. |
| `STORAGE_PROVIDER` | No | Submission storage backend. `local` (default) writes JSON files under `/data`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | No | For a Supabase storage provider (see below). Secret — server only. |
| `RESEND_API_KEY`, `CONTACT_NOTIFICATION_TO` | No | For sending email notifications with Resend. |
| `MAILCHIMP_*`, `CONVERTKIT_*` | No | For syncing waitlist signups to an email marketing list. |

> **Never commit secrets.** `.env.local` is git-ignored. Only `NEXT_PUBLIC_*`
> variables are exposed to the browser — keep all keys/tokens without that prefix.

---

## Forms & data storage

Both the **waitlist** and **contact** forms:

1. Validate on the client for fast feedback, and
2. **Re-validate on the server** in their API routes (`src/lib/validation.ts`) —
   the server is the source of truth.

Submissions are persisted through a small `StorageProvider` interface in
[`src/lib/storage.ts`](src/lib/storage.ts). The default `local` provider appends
records to `data/waitlist.json` and `data/contact.json` (fine for local dev,
**not** for production — Vercel's filesystem is ephemeral).

### Replacing the mock storage with a real backend

Open [`src/lib/storage.ts`](src/lib/storage.ts) and implement a new
`StorageProvider`, then return it from `getStorageProvider()` based on
`STORAGE_PROVIDER`. A commented Supabase example is included. General steps:

1. Install the provider SDK (e.g. `npm install @supabase/supabase-js`).
2. Add its credentials to `.env.example` and to Vercel env vars.
3. Implement `saveWaitlist` / `saveContact`.
4. Set `STORAGE_PROVIDER` to your new provider key and enable the `case` in the switch.

### Connecting a real email provider

You can either notify yourself of new submissions or push them to a marketing list.

- **Resend (notifications):** install `resend`, add `RESEND_API_KEY`, and in your
  provider (or directly in the API route) send an email to
  `CONTACT_NOTIFICATION_TO` after a successful save.
- **Mailchimp / ConvertKit (lists):** add the relevant env vars and, inside
  `saveWaitlist`, call the provider's "add subscriber" API with the submitted
  name, email, and tags (experience level, preferred pairs).

Keep all provider calls **server-side** inside the storage layer or API routes so
credentials are never sent to the browser.

---

## Deploying to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. Go to <https://vercel.com/new> and **import** the repository.
3. Vercel auto-detects Next.js — keep the defaults:
   - Build command: `next build`
   - Output: `.next`
   - Install command: `npm install`
4. Add environment variables under **Project → Settings → Environment Variables**
   (at minimum `NEXT_PUBLIC_SITE_URL=https://forextestlab.com`, plus any provider
   keys). Add them to **Production**, **Preview**, and **Development** as needed.
5. Click **Deploy**.

### Connecting the domain `forextestlab.com`

1. In Vercel: **Project → Settings → Domains → Add** and enter
   `forextestlab.com` (and `www.forextestlab.com`).
2. Vercel will show the DNS records to set at your registrar:
   - **Apex (`forextestlab.com`):** an `A` record to Vercel's IP
     (`76.76.21.21`), or use Vercel's nameservers / an `ALIAS`/`ANAME` if your
     registrar supports it.
   - **`www`:** a `CNAME` to `cname.vercel-dns.com`.
3. Choose a primary domain and let Vercel redirect the other (commonly redirect
   `www` → apex, or vice-versa).
4. Wait for DNS to propagate; Vercel provisions HTTPS automatically.
5. Confirm `NEXT_PUBLIC_SITE_URL` matches the final primary domain so canonical
   URLs, the sitemap, and Open Graph tags are correct, then redeploy.

---

## SEO & accessibility notes

- Per-page titles, descriptions, canonical URLs, Open Graph, and Twitter cards
  via the Next.js Metadata API.
- `robots.txt` and `sitemap.xml` are generated (`src/app/robots.ts`, `sitemap.ts`).
- Organization + SoftwareApplication JSON-LD structured data in the root layout.
- Semantic HTML, labelled form fields, keyboard-accessible navigation, visible
  focus states, and `prefers-reduced-motion` support.
- Brand assets live in `public/`: `logo-full.png` (horizontal lockup, navbar +
  footer), `logo-mark.png` (flask mark, favicon/apple-icon), and `og-image.png`
  (1200×630 social share). These are generated from the source in `logo/` — see
  the checklist if you need to regenerate them.

---

## Pre-launch checklist

See [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) for the full list of items to
review before going live.
