# Pine v6 runtime proof of concept

This experiment runs an unchanged Pine v6 strategy with the community [Resin](https://github.com/nullarch/resin) compiler on ForexTestLab's deterministic EURUSD 1h demo candles. It does not change the live Strategy Lab or claim TradingView parity.

## Reproduce

Run from the repository root with Node 22.18 or newer and installed project dependencies:

```powershell
git clone --depth 1 https://github.com/nullarch/resin.git .tmp/resin-poc
git -C .tmp/resin-poc checkout fa683a0ce81bf54832805f3e386c504c144d451a
node --import tsx experiments/pine-resin/run.mjs
```

The runner checks the pinned commit, compiles `ema-crossover.pine`, converts ForexTestLab candle strings to Resin's numeric OHLCV arrays, and checks each closed trade's entry and exit against the next bar after the plotted EMA crossing. It also checks trade timestamps and aggregate realized P/L.

Observed with Resin `fa683a0`: 242 demo candles, 21 long entry signals, 20 closed trades, one open position, and −$15.84 realized P/L. The first trade entered at bar 8 at 1.08376 and exited at bar 23 at 1.08594 for +$2.18.

## Before product integration

- Export the same OHLCV bars and trade list from TradingView, then compare fill times, prices, quantities, and P/L. These demo candles have not been run through TradingView, so this experiment does not establish parity.
- Verify symbol point value, spread, commissions, FX currency conversion, market sessions, and intrabar fill behavior on actual ForexTestLab market data.
- Isolate and constrain execution of user scripts. Resin generates JavaScript through `new Function`; this prototype runs only its fixed, repository-owned script.
- Plan how to load long date ranges without holding all candles and plots in memory, and how to expose unsupported data dependencies such as unavailable `request.*` feeds.

## Strategy Lab integration

The Strategy Lab permanently uses the dedicated Pine v6 endpoint and editor. The endpoint accepts every enabled ForexTestLab FX pair plus XAU/USD, 15m/1h/4h/1d candles, and at most 30,000 bars. The web app sends each test over the private `/run/forextestlab-pine.sock` Unix socket. Systemd launches one short-lived worker per connection under a dynamic user, with no app environment file, no home directory, no network, read-only system files, a 384 MB memory ceiling, and a 35-second runtime ceiling. The app also limits requests to 30 seconds and 8 MB of output. The unit files are `deploy/forextestlab-pine.socket` and `deploy/forextestlab-pine@.service`; `sudo bash deploy/install-pine-runner.sh` installs the worker and enables the socket. Run `node experiments/pine-resin/probe-sandbox.mjs` on the host to verify a fixed XAU/USD test through the socket. Run `node experiments/pine-resin/probe-public.mjs` to verify the public endpoint with sample candles; set `PINE_TEST_URL=http://127.0.0.1:3000` to test the origin.

`request.*` scripts are rejected because secondary data feeds are not wired up; allowing them to silently use the wrong data would produce misleading results. The old FTL Script API remains for compatibility, but Strategy Lab no longer exposes the FTL editor or execution path. The Linux socket service is required; there is no unisolated fallback.

### Supported compatibility scope

This is the permanent Strategy Lab engine and a dedicated **historical Pine Script v6 subset**, not a TradingView replacement. It supports v6 `strategy()` scripts with historical order processing, sizing, pyramiding, commissions, slippage, market/limit/stop orders, and bracket exits. It also supports v6 `indicator()` scripts with up to 12 `plot()` series, including overlay and separate-pane previews. Both use the selected chart's OHLCV series and Resin's language and `ta.*` implementation. The selected ForexTestLab symbol settings and candles determine plot values, fills, and P/L.

The runner deliberately rejects Pine v5 or older scripts, imported libraries, every `request.*` call, `use_bar_magnifier=true`, and `calc_on_every_tick=true`. Those features need library resolution, secondary/lower-timeframe feeds, or realtime ticks that ForexTestLab does not currently supply. Indicator previews currently render numeric `plot()` lines; TradingView drawing objects, fills, markers, alerts, per-bar colors, and realtime updates are not rendered yet. FX account-currency conversion, arbitrary TradingView broker feeds, and parity for an arbitrary third-party script are not guaranteed.

Run `npm run test:pine-compat` before deploying runner changes. The suite executes the real worker as a child process and covers v6 EMA reversals, next-bar historical fills, a commission/slippage bracket trade, report accounting, unsupported-feature rejection, and malformed-candle rejection. It then runs the original EUR/USD and XAU/USD regression probes.

The exact bidirectional EMA 3/7 Pine v6 example supplied for TradingView is in `ema-gold-15m.pine`. To check the runner's order behavior on ForexTestLab's **synthetic sample** gold candles, run `node --import tsx experiments/pine-resin/run-gold-15m.mjs`. It verifies next-bar entries, opposite-signal reversals, one-unit sizing, and dollar P/L arithmetic. In the user's FOREXCOM:XAUUSD screenshot, the first short moved from 4064.41 to 4059.69, giving +$4.72 for one unit; the next long moved from 4059.69 to 4057.56, giving −$2.13. The test confirms this arithmetic, not matching prices or totals: the sample candles are synthetic, and the real ForexTestLab Dukascopy/HistData feeds differ from FOREXCOM. A same-candle trade export would be needed to establish TradingView parity.

The systemd worker has been checked to reject reads of the app's `.env` file and outbound network access. Keep the socket and service restrictions in place when deploying. TradingView result parity remains unverified.
