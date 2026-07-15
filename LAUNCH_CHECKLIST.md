# Pre-launch checklist

Review every item before pointing `forextestlab.com` at production traffic.

## Legal & compliance
- [ ] Have a **qualified legal professional** review the Privacy Policy, Terms of
      Use, and Risk Disclosure for your jurisdiction.
- [ ] Fill in the **governing-law placeholder** in `src/app/terms/page.tsx`.
- [ ] Confirm all risk and "not financial advice" disclosures are accurate for
      the markets you operate in.
- [ ] Verify no claim implies the product is already available, licensed,
      approved, profitable, or endorsed by any third party (incl. TradingView).
- [ ] Update the "Last updated" dates on the legal pages.

## Data & forms
- [ ] Replace the local JSON storage with a real backend (Supabase or similar) —
      the Vercel filesystem is ephemeral and will lose local writes.
      See `src/lib/storage.ts`.
- [ ] Connect an email provider (Resend / Mailchimp / ConvertKit) if you want
      notifications or a marketing list.
- [ ] Confirm both forms validate and submit successfully in production.
- [ ] Add spam protection (rate limiting, honeypot, or CAPTCHA) to the API routes.
- [ ] Confirm consent language matches how you actually process data.

## Environment & config
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the final production domain.
- [ ] Add all required environment variables in Vercel (Production/Preview).
- [ ] Confirm no secrets are committed and `.env.local` is git-ignored.

## SEO & metadata
- [ ] Confirm brand assets in `public/` (`logo-full.png`, `logo-mark.png`,
      `og-image.png`) are the final versions. They were generated from
      `logo/logo (2).png`; regenerate with `sharp` if the source logo changes.
- [ ] Verify titles, meta descriptions, and canonical URLs on every route.
- [ ] Validate structured data (Google Rich Results Test).
- [ ] Check `/robots.txt` and `/sitemap.xml` resolve on production.
- [ ] Update social-media links in `src/lib/site.ts` (currently placeholders).

## Quality & performance
- [ ] `npm run build` completes with no TypeScript or lint errors.
- [ ] Run Lighthouse (mobile + desktop); address any regressions.
- [ ] Test every route: `/`, `/about`, `/contact`, `/waitlist`, `/privacy`,
      `/terms`, `/risk-disclosure`, and a 404.
- [ ] Test mobile navigation (open/close, Escape key, links).
- [ ] Test keyboard navigation and focus visibility across the site.
- [ ] Verify `prefers-reduced-motion` disables non-essential animation.
- [ ] Cross-browser check (Chrome, Firefox, Safari, mobile Safari).

## Domain & deploy
- [ ] Domain `forextestlab.com` added and verified in Vercel.
- [ ] HTTPS active; `www` ↔ apex redirect configured.
- [ ] Confirm the deployed canonical URLs match the live domain.
