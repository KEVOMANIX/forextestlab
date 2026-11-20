---
title: How to test without seeing future candles
description: Keep each decision tied to what the chart showed at that moment, and use rewinds and higher timeframes without leaking hindsight.
category: Backtesting
date: 2026-10-05
updated: 2026-11-20
cover: /learn/go-to-rewind-20261120.png
coverAlt: Go to panel with Backward selected and the warning that rewinding undoes trades opened after the destination
ctaLabel: Start a blind backtest
ctaHref: /app/backtest
takeaways:
  - Write the reason for a trade before you advance the chart, not after.
  - Treat an unfinished higher-timeframe candle as provisional; its final shape belongs to the future.
  - Rewinding undoes later trades, so log every rewind instead of quietly taking a second attempt.
---
## Decide before advancing

A replay only measures your method when each entry uses information available at that moment. Write the reason for entering, the stop, and the target before you step forward. If you go back to a winning trade and build a reason afterwards, you are measuring hindsight, not the original decision.

Keep your setup rules fixed for the whole test. If you find a change worth trying, save it as a new version of the rule and test it on a different period.

> [!TIP]
> Not knowing the date helps too. A [blind backtest](/learn/blind-backtesting-without-hindsight) replays a random window of real history with the dates hidden, so you cannot recall what happened next.

## Be careful with higher timeframes

A 4-hour or daily candle is built from many smaller candles. While that period is still forming, its high, low, and close keep changing. When you switch timeframe during a replay, the current higher-timeframe candle shows only the part of the period that has already played; its final shape must not inform an earlier entry.

If you think switching timeframe has shown you prices from after the replay time, note the session, trade, timeframe, and the timestamp that looked wrong, and send it to [support](/support).

## Rewind deliberately

**Go to** moves the replay to a session open or close, a date and time, or a price level. Moving **Forward** plays through to the destination. Moving **Backward** rewinds, and the panel warns that rewinding undoes trades opened after the destination.

![Go to panel on the Date & time tab with Backward selected, listing Previous day, Previous week, and Pick a date and time](/learn/go-to-rewind-20261120.png "Backward destinations rewind the replay. Trades opened after that point are removed.")

A rewind is useful for checking how a setup formed. It is not a way to retake a trade you already saw play out. If you rewind and trade the same move again, write in the journal that it was a second attempt, or mark it **Experimental** so it stays out of your performance figures.

## Record the misses as well as the wins

Log setups you missed and trades that lost with the same care as the winners. A review that only contains memorable successes gives a false picture of the test. In the journal, describe what the chart showed at the decision point; you can check it later on the trade's interactive chart.
