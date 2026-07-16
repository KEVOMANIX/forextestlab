# ForexTestLab Production Product Definition

Status: Approved

Target: Official Version 1 launch

Last updated: 16 July 2026

## 1. Product decision

ForexTestLab will be an official web-based forex backtesting and market-replay
platform for individual traders who want to practise execution and evaluate
manual trading strategies using historical currency-market data.

It will be presented as an available product, not as a planned product, waitlist,
prototype, private beta, or public beta.

ForexTestLab remains simulation and analysis software:

- It is not a broker or dealer.
- It does not accept deposits or hold client money.
- It does not connect to live trading accounts in Version 1.
- It does not execute real-money orders.
- It does not provide financial advice, trade signals, or profit guarantees.

## 2. Target user

### Primary user

An individual retail forex trader who:

- understands basic forex concepts;
- wants to test a discretionary or rule-based manual strategy;
- wants to replay historical price action without seeing future candles;
- wants to practise entries, exits, stop-losses, take-profits, and position
  sizing;
- wants a private record of sessions, trades, notes, and results.

### Secondary users

- Trading students practising a documented process.
- Educators demonstrating historical trading scenarios.
- Experienced traders comparing variations of a manual strategy.

### Not a Version 1 target

- Brokers or prop firms requiring multi-tenant administration.
- Automated strategy developers requiring code execution or optimization.
- Users looking for live prices, signals, copy trading, or trade execution.
- Institutional users requiring tick-level execution modelling.

## 3. Core user promise

> Replay historical forex markets without future-price leakage, place simulated
> trades under defined risk rules, and keep a private record of the results.

The promise is about disciplined testing and review. It is not a promise of
trading performance.

## 4. Official Version 1 scope

### Access and accounts

- Visitors can view the marketing, methodology, support, and legal pages.
- A limited anonymous demonstration may be available.
- Registration is required to save sessions and view private history.
- Users can sign in, sign out, reset access, and manage their account.
- Every saved session, result, note, and import belongs to one user.
- Users can delete individual sessions and request account deletion.

### Backtesting workflow

- Select a supported currency pair.
- Select a supported timeframe and available historical period.
- Start a server-controlled replay with future candles protected.
- Pause, resume, step forward, restart, and change replay speed.
- Place simulated Buy and Sell trades.
- Use fixed-lot or account-risk-percent position sizing.
- Set stop-loss and take-profit levels.
- Close positions manually or through simulated SL/TP execution.
- Configure supported spread, commission, slippage, and execution assumptions.
- Track simulated balance, equity, and drawdown.

### Review and records

- Save completed and in-progress backtest sessions.
- View private session history.
- Add private session notes.
- Review trades, balance, equity curve, and performance statistics.
- Export trade history to CSV.
- Delete sessions that are no longer wanted.

### Supported market data

- Version 1 launches only with instruments for which ForexTestLab has a lawful,
  reliable historical-data source and the necessary storage/display rights.
- Initial target instruments:
  - EUR/USD
  - GBP/USD
  - USD/JPY
  - AUD/USD
  - USD/CAD
  - USD/CHF
  - NZD/USD
- Initial target timeframes:
  - 5 minutes
  - 15 minutes
  - 30 minutes
  - 1 hour
  - 4 hours
  - 1 day
- An instrument or timeframe is not advertised as supported until its dataset
  passes completeness and validation requirements.
- Generated demonstration data must always be visibly labelled and must never be
  described as real historical market data.

## 5. Version 1 exclusions

The following are deliberately outside the official Version 1 scope:

- Live trading or broker integration.
- Deposits, withdrawals, or custody of money.
- Trading signals, recommendations, or automated advice.
- Automated strategy code execution.
- Parameter optimization or mass strategy simulation.
- Tick-accurate replay or claims of tick-accurate execution.
- Multiple simultaneous open positions.
- Portfolio or multi-asset backtesting.
- Social trading, public profiles, or shared leaderboards.
- Native mobile applications.
- Team workspaces.
- Paid subscriptions at initial launch.

These exclusions prevent the first release from becoming too broad and keep its
claims aligned with the existing engine.

## 6. Commercial model

The recommended initial launch model is free access with reasonable usage
limits. Payments and subscriptions are postponed until product reliability,
data costs, support load, and user demand are understood.

The official site must not advertise a paid plan until billing, entitlement,
refund, cancellation, tax, and customer-support processes are operational.

Potential later plans may include:

- more stored sessions;
- more historical data;
- advanced analytics;
- strategy comparison;
- additional instruments;
- faster or larger replay sessions.

## 7. Product language

### Use

- Forex backtesting platform
- Historical market replay
- Simulated trading
- Strategy testing and review
- Available now
- Start backtesting
- Create an account
- Historical and simulated results

### Do not use after official launch

- Public Beta
- Private beta
- In development
- Planned platform
- Coming soon, unless it refers to a specific excluded future feature
- Join the waitlist
- Early access
- Prototype
- Non-functional mock-up, when referring to the real backtester

### Disclosures that must remain

- ForexTestLab is simulation and analysis software.
- ForexTestLab is not a broker and does not execute real-money trades.
- ForexTestLab does not provide financial advice.
- Historical and simulated results do not guarantee future performance.
- Candle-based replay may not determine the sequence of intrabar events.
- Market-data source and demonstration-data status must be stated accurately.
- ForexTestLab is independent and not endorsed by TradingView or data providers.

## 8. Required public pages

Official Version 1 should expose:

- Home
- Product/features
- Backtester
- Sign up
- Sign in
- Private session history
- Private session results
- Account settings
- Data methodology
- Execution methodology
- Supported instruments
- Help or documentation
- Contact/support
- About
- Privacy Policy
- Terms of Use
- Risk Disclosure
- Service status or a clearly documented incident channel

The waitlist page should be removed or redirected once registration is open.

## 9. Launch acceptance criteria

ForexTestLab can remove all beta/pre-launch language only when:

### Product

- A new user can create an account and sign in.
- Saved sessions and results are private to their owner.
- A user can complete the core replay and simulated-trade workflow.
- Sessions survive refreshes, deployments, and ordinary server restarts.
- Users can delete their sessions and request account deletion.

### Data

- Every advertised instrument has an approved and validated historical dataset.
- Dataset sources and licences have been reviewed.
- Demo and real historical data cannot be confused in the UI or API.
- Backtests record a stable dataset or dataset version for reproducibility.

### Reliability

- Production build, lint, typecheck, unit tests, and E2E tests pass in CI.
- The full desktop and mobile trading workflows pass reliably.
- Database migrations, backups, monitoring, and recovery procedures exist.
- Concurrent actions cannot silently overwrite session state.

### Security and privacy

- Every private read and mutation checks authenticated ownership.
- Global rate limiting and form abuse controls are enabled.
- Secrets and session credentials are not exposed in browser bundles or logs.
- Privacy, retention, and deletion behaviour matches the published policies.

### Legal and support

- Legal placeholders are removed.
- Terms, Privacy Policy, and Risk Disclosure have been reviewed for the chosen
  operating jurisdiction.
- Support contact and incident-handling processes are operational.
- Required charting and market-data attribution is visible.

### Experience

- Marketing copy describes the implemented product accurately.
- The waitlist and development-roadmap positioning are removed.
- Supported browsers and devices have been tested.
- Critical user flows meet accessibility and performance expectations.

## 10. Current implementation compared with Version 1

| Area | Current state | Version 1 requirement |
| --- | --- | --- |
| Backtester | Functional public workflow | Retain and harden |
| Future-data protection | Server-controlled | Retain and regression-test |
| Trading engine | Functional single-position simulation | Validate and document assumptions |
| Accounts | None | Add authentication and account management |
| Session ownership | Mutation token only | Authenticated ownership for reads and writes |
| History/results | Public deployment-wide access | Private per-user access |
| Market data | Seeded/generated EUR/USD plus import architecture | Licensed and validated advertised datasets |
| Dataset reproducibility | Range and source stored | Store stable dataset version |
| Contact/waitlist | Local JSON files | Durable database/email workflow |
| Payments | None | Keep out of initial Version 1 |
| Marketing | Pre-launch/waitlist language | Available-product language |
| Testing | Unit/build checks pass; full E2E is unreliable | All CI checks consistently pass |
| Legal | Governing-law placeholder remains | Complete professional review |
| Operations | Basic headers and per-instance limiting | Monitoring, backups, global limiting, incident process |

## 11. Approved owner decisions

The product owner approved the following Version 1 decisions on 16 July 2026:

1. Initial access model: free accounts, with an optional limited anonymous demo.
2. Payments: no subscriptions in the first official release.
3. Sessions: private by default.
4. Data: only lawfully sourced historical data is marketed as real backtest
   data; generated data is demonstration-only.
5. Instruments: launch with validated major forex pairs, not every catalogue
   entry automatically.
6. Product boundary: simulation only, with no broker connection or live trading.
7. Primary audience: individual retail forex traders.

These decisions are the implementation baseline. Any material change should be
recorded in this document before related engineering or marketing work begins.

The historical-data provider remains pending. Dukascopy is being contacted for
written commercial authorization covering storage, customer-facing display,
aggregation, replay, and derived backtest results. Generated data remains
demonstration-only unless and until an approved historical-data agreement is in
place.

## 12. Next implementation phase

The first production engineering milestone is in progress:

1. Supabase Auth selected.
2. User profiles and session ownership added to the Prisma schema.
3. History, session reads, results, notes, and mutations protected by ownership.
4. Sign-up, sign-in, password reset, account settings, session deletion,
   account deletion, and sign-out implemented.
5. Anonymous access limited to temporary demonstration sessions.

Deployment configuration, production SMTP, authenticated browser E2E coverage,
and final Supabase dashboard configuration remain before this milestone is
operational in production.
