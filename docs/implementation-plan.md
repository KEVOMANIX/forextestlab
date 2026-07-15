# ForexTestLab Public Beta — Implementation Plan

## 1. Starting point (inspection)

- **Framework:** Next.js `14.2.35` (App Router), React `18.3.1`, TypeScript strict, Tailwind CSS.
- **Existing routes to preserve:** `/`, `/about`, `/contact`, `/privacy`, `/terms`, `/risk-disclosure`, `/waitlist`, custom 404, `robots.ts`, `sitemap.ts`, and the `/api/waitlist` + `/api/contact` routes.
- **Existing components to preserve:** landing sections, `LegalPage`, `Navbar`, `Footer`, `Logo`, forms, brand assets in `public/`.
- **Add (this project):** a genuinely functional public-beta backtester under `/app`.

Nothing in the landing/legal layer is rewritten; the backtester is additive.

## 2. Key architecture decisions

| Concern | Decision | Rationale |
| --- | --- | --- |
| Prices | Stored as **strings** in the DB; all math via **decimal.js** | No JS float error for balances/P&L; portable across SQLite/Postgres |
| Database (dev + default build) | **SQLite** via Prisma | Zero-config, seedable, testable, builds out of the box |
| Database (production) | **PostgreSQL** (Neon/Vercel Postgres/Supabase) — one-line datasource change | Serverless write persistence; see README |
| Market data | **Local DB** provider by default; deterministic **Demo** provider fallback | No external API key required for the public beta |
| Replay control | **Server-authoritative**: server holds the full series, client only ever receives revealed candles | True future-data protection (not client-side hiding) |
| Session state | Persisted in DB, addressed by a server-issued **session token** | Public demo needs no login; ownership verified by token |
| Engine | Pure, framework-independent modules under `src/lib/backtest` | Unit-testable without React or DB |

## 3. Provider-independent market-data architecture

`MarketDataProvider` interface with implementations:

- `DemoDataProvider` — deterministic synthetic candles (labelled demonstration data).
- `LocalDatabaseProvider` — reads seeded/imported candles from the DB (**default**).
- `LocalCsvProvider` — imports CSV → DB.
- `ExternalApiProvider` — reusable interface for future authorised providers.
- `TwelveDataProvider`, `TraderMadeProvider` — **disabled** server-side adapters (env-gated).
- `DukascopyImportAdapter` — manual, authorised import only (env-gated).

Selected via `MARKET_DATA_PROVIDER` (default `local_database`, falling back to demo when a range has no data).

## 4. Phases

1. **Data foundation** — types, Prisma models, provider interfaces, deterministic EUR/USD 5m seed.
2. **Chart + candle loading** — Lightweight Charts component, backtester shell, initial candle load.
3. **Server-controlled replay** — replay engine + session endpoints; future-data protection.
4. **Simulated trading** — order/trade engine, SL/TP, spread/commission/slippage, position sizing.
5. **Statistics + results** — performance metrics, results page, trade history, CSV export.
6. **Legal, a11y, security, testing, docs, deploy** — notices, ARIA, rate limiting/headers, Vitest + Playwright, README + this plan.

## 5. Testing

- **Vitest** units: CSV parse, validation, duplicate detection, aggregation (all 7 TFs), pip calc, position sizing, long/short P&L, spread/commission/slippage, SL/TP execution, manual close, intrabar ambiguity, drawdown, profit factor, replay indexing, restart, future-data protection, provider fallback.
- **Playwright** e2e: full public workflow (open → session → replay → trade → SL/TP → close → balance → stats → history → restart → mobile → no login).

## 6. Public-beta scope & honesty

- Presented as **Public Beta**. Functional: replay, simulated execution, risk tools, basic stats.
- Under development: more instruments, indicators, analytics.
- No claim of TradingView affiliation/endorsement. Synthetic/imported data clearly labelled. Lightweight Charts attribution retained.
