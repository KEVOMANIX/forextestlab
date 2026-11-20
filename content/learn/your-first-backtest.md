---
title: Your first backtest in ForexTestLab
description: Choose a market, write your rules, and complete a replay session you can review, step by step.
category: Getting started
date: 2026-10-05
updated: 2026-11-20
cover: /learn/new-backtest-setup-20261107.png
coverAlt: The New backtest form with EUR/USD selected and a one-month replay period
ctaLabel: Start a backtest
ctaHref: /app/backtest
takeaways:
  - Give the test one question and write the entry, stop, and exit rules before you start.
  - Free includes three new sessions a month on the seven major pairs, each up to 31 days of history.
  - Review several trades in the journal before deciding a rule works.
---
## Give the test one question

Start with a rule you can recognise before the next candle appears. For example: does a breakout and retest of the Asian range work on EUR/USD? Write down the entry condition, what proves the idea wrong (your stop), and the exit rule before replaying. If you change them after seeing the outcome, the trades are no longer comparable.

## Set up the session

Open [New backtest](/app/backtest). Fill in four sections:

1. **Session details**: a name that records the rule and period, such as "EUR/USD · Asian range retest", plus optional tags.
2. **Markets**: choose a market and its data provider. See [How to choose a market and data source](/learn/choose-market-data-for-a-backtest).
3. **Session type**: a normal backtesting session, or a prop firm session with profit target and drawdown rules (Pro).
4. **Replay period**: pick a length and dates inside the **Available** range, or turn on **Blind backtest** to replay a random window with the dates hidden.

Set the **Starting account balance**, then press **Start backtest**.

![New backtest form with Session details, Markets, Session type, starting balance, and Replay period](/learn/new-backtest-setup-20261107.png "The New backtest form. The available range appears after you choose a market.")

> [!NOTE]
> The Free plan gives you three new sessions each calendar month on the seven major pairs, each covering up to 31 days of history from any point in the past. Those 31 days are the length of the test, not a time limit on your account. [Compare plans](/pricing).

## Replay and trade

Check the chart time zone and timeframe first. Press **Play** to advance continuously, or step one candle at a time when a decision needs attention. **Go to** jumps to a session open or close, a date, or a price level, and pauses when it gets there. See [Trading sessions and time zones](/learn/sessions-and-time-zones).

![ForexTestLab replay workspace with charts, replay controls, and the order panel](/product/market-replay-light-20261102.webp "The replay workspace: chart, replay controls, and order ticket.")

Place a simulated order only when the conditions you wrote down appear. Set the position size, stop, and target in the order ticket before you continue. Open positions, with their stop, target, and commission, are listed in the panel under the chart.

## Review the session

After closing trades, open the journal and [review each trade](/learn/review-a-trade): the setup, whether you followed the plan, the outcome, and one lesson. Then look at the session's [analytics](/learn/win-rate-and-expectancy).

Judge the rule on several trades, not one result. Historical simulation is practice; it does not show what a live account will earn.
