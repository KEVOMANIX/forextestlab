---
title: How to run a blind backtest without date clues
description: Use a random replay period, record decisions before outcomes, and review the process after the test.
category: Backtesting
date: 2026-11-07
cover: /learn/blind-backtest-setup-20261107.png
coverAlt: New backtest form with Blind backtest selected and calendar dates hidden
ctaLabel: Start a blind backtest
ctaHref: /app/backtest
takeaways:
  - Blind backtest chooses a random window from the selected market's available history.
  - Write the entry, stop, exit, and risk rules before starting.
  - Judge rule following separately from whether an individual trade won.
---
## Why hide the dates?

Knowing that a chart is from a famous crash or rally can change what you think you would have done. A blind backtest removes the calendar clue and lets you respond to the candles presented during replay. It cannot remove every kind of hindsight, so define the decision rules first.

Write down four things before opening the chart: the setup that permits an entry, the price that invalidates it, the exit rule, and the amount you are prepared to risk in the simulation. For example, “enter only after a close beyond the range and a retest; stop beyond the opposite side of the retest” is testable. “Enter when it feels strong” is hard to review fairly.

## Start the random window

In [New backtest](/app/backtest), choose a market and set the replay length. Under **Replay period**, turn on **Blind backtest**. The date fields disappear and the setup explains that a period will be selected when you start. In the screenshot below, the Free plan selects a 31-day period; available lengths depend on your plan.

![New backtest setup with Blind backtest checked and a message that dates remain hidden during replay](/learn/blind-backtest-setup-20261107.png "The date picker is replaced by a random-period explanation.")

Start the replay and make decisions only from information the chart has revealed. Step through candles when an entry condition needs a close to confirm it. Put the planned stop and target into the order ticket rather than reconstructing them after the outcome. The replay workspace provides the chart, order controls, and Journal for that record.

![ForexTestLab replay workspace with two charts, simulated order controls, and journal access](/product/market-replay-light-20261102.webp "Use the replay controls to advance the market and record each simulated decision.")

## Review the process after the session

For each trade, compare the entry and exit with the rules you wrote before starting. Mark a rule break as an execution issue even if it made money. Mark a rule-following loss as a valid observation, not automatically a mistake. In the Journal, note what was visible at the decision point and one action you could repeat or improve.

At the end, review the trade count, distribution of outcomes, and drawdown. A good result over one random window is a reason to test another independent window, not proof that the strategy will work in live markets. The [CFTC's guide to trading systems](https://www.cftc.gov/LearnAndProtect/AdvisoriesAndArticles/fraudadv_tradingsystem.html) explains why hypothetical results need particular care when compared with live trading.

> [!NOTE]
> A random historical window is still historical data. Repeatedly starting new blind sessions until one looks good can reintroduce selection bias. Keep a record of every window you test.
