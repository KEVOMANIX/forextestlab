---
title: How to test without seeing future candles
description: Keep your decisions tied to information available at the replay moment.
category: Backtesting
date: 2026-10-05
ctaLabel: Open your workspace
ctaHref: /app
---
## Decide before advancing

A replay is useful when the entry decision uses only information available at that moment. Write the reason for entering before revealing the next move. Returning to a winning trade and constructing a reason afterward measures hindsight instead of the original decision.

Keep your setup rules fixed during one test. If you discover a useful change, record it as a new version and test that version on another period.

## Be careful with higher timeframes

A higher-timeframe candle covers many smaller candles. While that period is still unfolding, its high, low, close, and volume can change. Its final shape should not inform an earlier entry. Treat an unfinished candle as provisional when comparing timeframes.

In an interactive trade chart, check the trade's review moment before drawing conclusions. If you suspect that switching timeframe exposes later data, report the session, trade, selected timeframe, and unexpected timestamp to support.

## Use navigation deliberately

Go to runs forward through the replay when reaching a later destination. Moving backward can undo trades opened after the destination. Write down the intended test sequence so a rewind does not quietly turn an initial decision into a second attempt.

Record missed setups and losing trades as carefully as winners. A review that contains only memorable successes gives an incomplete account of the test.
