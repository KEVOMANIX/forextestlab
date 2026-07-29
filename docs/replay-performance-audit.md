# Replay performance audit

## Scope and invariants

The replay speed is elapsed market time per wall-clock second. STEP controls
the size of a user-visible jump; it does not permit skipping execution work.
Every source candle continues to pass through the deterministic replay engine.
The chart may coalesce those logical candles into one visual update per display
frame. Network latency is not part of the replay clock.

Charts keep their own lightweight-charts instance, visible range, crosshair and
follow-latest flag. No cross-chart time/crosshair synchronization is present.

## Precise hot path

1. `useBacktester.startLocalScheduler` receives an animation-frame timestamp,
   adds elapsed wall time to its accumulator and asks `nextReplayBatch` how many
   replay steps are due. Debt is capped per batch, not discarded.
2. `stepRef` converts the selected STEP into source-candle count and calls
   `revealNext` once for every logical candle.
3. `revealNext` increments the visible index, evaluates pending activation and
   expiry, updates excursion, evaluates SL/TP, tightens trailing stops,
   performs fills and recomputes balance/equity/drawdown. It appends one equity
   point per candle.
4. One compact replay visual message publishes the latest session clock.
   Each `PriceChart` advances its own source-series cursor to that clock and
   schedules at most one chart update on the next animation frame.
5. The non-chart React UI receives a public state snapshot at most every
   100 ms, plus immediate snapshots on pause, finish and error. Pausing
   checkpoints the exact local engine index.
6. Every three seconds, a checkpoint captures the local visible index and
   queues a `sync` action. The action queue prevents overlapping checkpoint
   requests. Playback does not await that request.

Chunk extension is the only market-data network operation near the logical
path. An adaptive reservoir now starts fetching before the loaded boundary,
appends completed 1,500-candle pages immediately, and retries transient
failures with backoff. At 7,200x on one-minute data it targets at least 3,600
ready candles (30 seconds); the target expands to four observed fetch
round-trips when latency is worse. If the reservoir is ever exhausted by a
longer outage, playback retains its market-time debt and catches up after data
returns instead of skipping candles or turning the fetch into a terminal
replay error. Persistent browser chunk caching remains follow-up work.

## Work frequency

| Frequency | Work |
| --- | --- |
| Every logical candle | Pending orders; fills; SL/TP; trailing stop; excursion; unrealized P&L; equity, peak and drawdown; equity-curve append |
| Every scheduler frame with debt | Bounded logical batch; compact visual clock publication |
| Every rendered chart frame | Incremental source cursor; higher-timeframe tail aggregation; numeric tail conversion; price-series tail update; live price/position coordinates; active indicator controller update; optional drawing environment update; optional follow-latest scroll |
| At most 10 times/s | Public state publication and the surrounding backtester React commit |
| Every 3 seconds | Serialized background session checkpoint |
| Every 2 seconds when changed | Workspace diff check; remote workspace save only when preferences/layout/drawings changed |

## Attribution

Deterministic production harness: four charts, one 15-minute cell, 4× CPU
throttle, 20 seconds, 20 one-minute candles/s.

| Metric | Attributed control | Decoupled visual feed |
| --- | ---: | ---: |
| FPS | 22 | 27 |
| p95 frame | 83.3 ms | 50.1 ms |
| Long tasks | 68 | 23 |
| Long-task time | 4,021 ms | 1,313 ms |
| Observed candles/s | 20 | 20 |
| React render/commit time | 3,066 ms | 1,246 ms |
| Engine time | 37 ms | 28 ms |
| State publication | 249 ms | 86 ms |
| Chart update calls | 437 ms | 439 ms |
| Aggregation | 49 ms | 44 ms |

The replay engine is not the main-thread bottleneck in this profile. Moving
only its clock or calculations to a worker would leave the dominant React and
canvas work in place while adding state-transfer cost.

With RSI and EMA enabled in the 15-minute cell, the same post-change profile
measured 20 FPS, 83.4 ms p95, 106 long tasks and 6,855 ms of long-task time.
Indicator formulas consumed only 1.1 ms. The added lightweight-charts pane and
series/canvas work, including full-series `setData`, is the indicator-specific
bottleneck. Incremental indicator-series rendering must be implemented by
indicator class because Zig Zag, pivots and regression can revise historical
points; a blanket tail-only update would be incorrect.

Drawings were inactive in the control and did not contribute. Their combined
context/replay timeline is skipped when no drawing exists and caches the
history prefix when active. Workspace persistence did not issue remote writes.
Checkpoint latency was asynchronous and serialized; it did not change the
observed replay rate.

Final unthrottled acceptance on the production build measured 30 FPS, 50 ms
p95, zero long tasks, 399 candles advanced in 20 seconds (20 candles/s after
rounding), and 20.7 ms average mocked checkpoint latency. The checkpoint value
validates non-overlap and local-clock independence only; it is not a production
R2/database latency claim. The supplied real-profile save latencies (2.3 s
healthy and 4.5 s slow) remain the production baseline until the deployed
version is sampled from those same authenticated profiles.

The chunked acceptance harness starts with only ten candles beyond the replay
cursor and injects one failed extension request. It retried without displaying
the former data-load error, issued three extension requests to fill the
reservoir, and advanced 397 candles in 20 seconds (20 candles/s). Its measured
44 FPS, 33.4 ms p95 frame time, five long tasks and 336 ms total long-task time
include the deliberately undersized initial buffer and injected failure; real
sessions begin with a complete 1,500-candle page.

## Instrumentation

`replay-metrics.ts` aggregates replay-engine execution, state publication,
indicator calculation, aggregation, chart updates, React commits, session
saves and workspace saves. The Playwright performance harness reports those
buckets alongside FPS, p95 frame time, long tasks and observed candle rate.
