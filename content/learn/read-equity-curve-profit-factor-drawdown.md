---
title: How to read equity, profit factor, and drawdown together
description: Use the analytics overview to spot the path behind a result, then check trade count and risk before drawing conclusions.
category: Analytics
date: 2026-11-07
cover: /product/session-analytics-light-20261102.webp
coverAlt: ForexTestLab analytics overview with equity curve, drawdown, win rate, and profit factor
ctaLabel: Open analytics
ctaHref: /app/analytics
takeaways:
  - An ending profit does not show the losses or drawdowns experienced along the way.
  - Profit factor is gross winning P/L divided by the magnitude of gross losing P/L.
  - Read percentages and ratios beside the trade count and the actual trade list.
---
## Start with the shape, not the ending number

Open a completed session in [Analytics](/app/analytics). The Overview shows the realised equity curve after closed trades and a drawdown strip below it. The ending value tells you where the session finished. The path shows whether the result came steadily, after a long decline, or from a small number of late wins.

![Analytics overview showing session metrics, a realised equity curve, and drawdown below the chart](/product/session-analytics-light-20261102.webp "Read the equity curve and drawdown together before judging the final P/L.")

Drawdown measures the fall from a previous equity high. If an account rises to $10,800 and then falls to $10,200, that decline is $600, even though the account may still be above its $10,000 starting balance. The drawdown strip helps you see **when** the account was below its earlier peak. Check the deepest decline and how long recovery took.

## Read profit factor with the trade count

Profit factor divides total profit on winning trades by the magnitude of total loss on losing trades. For example, $1,200 of gross wins and $800 of gross losses give a profit factor of **1.50**. It does not mean every trade made 1.5 times its risk. If there are no losing trades, the ratio has no denominator and should be read as unavailable, not as an infinite edge.

Next, look at the closed-trade count and win rate. Four wins out of eight trades is 50%; forty wins out of eighty is also 50%, but the latter describes a larger sample. Neither percentage tells you how large the wins and losses were. Open **Trades** to see whether one unusual winner accounts for most of the net result, then inspect the Journal for any rule breaks.

![Session dashboard showing cumulative P/L and activity alongside the session record](/product/session-dashboard-light-20261102.webp "A second view of the session helps connect summary statistics to its activity and P/L path.")

## Use a short review checklist

1. **Result:** What were net P/L and profit factor, and what costs were included in the replay?
2. **Path:** What was the deepest drawdown, and was the recovery concentrated in a few trades?
3. **Sample:** How many eligible trades produced the numbers, across what period and market?
4. **Process:** Did the trades follow the entry and exit rules recorded before the test?

If any answer is unclear, inspect the trades before changing a strategy. A profitable backtest is evidence about that simulated sample, not a forecast of future returns.
