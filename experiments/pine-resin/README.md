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

## Experimental Strategy Lab integration

The app now has a separate Pine v6 endpoint and editor mode, hidden unless `PINE_V6_EXPERIMENTAL=true` is set on the server. This is a development gate, **not a production sandbox**. The endpoint currently accepts EUR/USD, 1h/4h/1d candles, and at most 30,000 bars. It runs Resin in a child process with a 256 MB V8 heap limit and a 30-second timeout. `request.*` scripts are rejected because the secondary data feeds are not wired up; allowing them to silently use the wrong data would produce misleading results. Existing FTL Script tests continue through the previous endpoint.

Do not enable the flag on a public server yet. The child process has the server's filesystem and network privileges despite its time, memory, and environment limits. Deploying user-supplied scripts requires OS-level isolation or a separately permissioned execution service, followed by an audit of the script compiler and output limits. TradingView result parity remains unverified.
