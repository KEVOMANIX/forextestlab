---
title: Build and test a strategy with AI
description: Describe a strategy in plain words, let the AI write the Pine Script, check the rules it used, and improve the strategy one change at a time.
category: Strategy
date: 2026-11-22
cover: /learn/ai-strategy-builder-20261122.png
coverAlt: Strategy Lab with the AI chat on the left, the London breakout test on the chart, and the generated Pine code on the right
ctaLabel: Open Strategy Lab
ctaHref: /app/strategies
takeaways:
  - Describe the entry, stop, target, and trading hours; the AI turns them into Pine Script v6.
  - Read the rules list before trusting a result. Lines marked with ? are assumptions you did not state.
  - Change one thing per message, compare the before and after numbers, and use Versions to go back.
---
## Open the AI in Strategy Lab

Open [Strategy Lab](/app/strategies) and create or open a strategy. On a wide screen the AI chat sits on the left, the chart and test results in the middle, and the code on the right. On a smaller screen, press **AI** at the top to open the chat over the chart, and press it again to close it.

You don't need to know Pine Script. Every change the AI makes is ordinary code in the editor, so you can read it, edit it yourself, and save it like any other script.

![Strategy Lab with the AI chat, the London breakout test on the chart, and the generated Pine code](/learn/ai-strategy-builder-20261122.png "The AI lists the rules it used, checks the code, and shows the test result in the chat.")

## Describe the strategy

Write the rule the way you would explain it to another trader. A good description covers:

1. **Entry**: what has to happen before you buy or sell, for example "a 15-minute close above the Asian range".
2. **Stop**: where the idea is wrong, in pips or at a price level.
3. **Target or exit**: a fixed number of pips, a multiple of the risk such as 2R, or an exit signal.
4. **When to trade**: session hours, days of the week, or how many trades a day.

For example: *"London breakout of the Asian range. Stop at the other side of the range, target 2R, one trade a day."* If you are not sure where to start, pick one of the example strategies shown in the empty chat.

## Check the rules it used

The AI answers with a short explanation and a list of the rules in the code. A ✓ is a rule you asked for. A **?** is an assumption the AI made because the description did not say, such as whether to enter on the candle close or on the first touch.

Read the list before you look at the result. If an assumption is wrong, say so in your next message ("enter on the first touch of the range instead"); the code is changed and tested again.

Before the code reaches the editor, it is run on sample prices to catch errors. If the run fails, the AI gets the error and fixes the code, up to two times. The chat says **checked, no errors** when the code passed. If errors remain, they are shown in the chat; ask the AI to fix them or correct the line yourself.

> [!NOTE]
> Strategy Lab runs Pine Script v6 on ForexTestLab's own price history. Imported libraries and request.* feeds that pull in other symbols or timeframes are not supported, so the AI writes scripts without them.

## Run the test and read the result

On **Pro**, the test runs automatically after each AI change. On **Free**, press **Run test** in the chat message when you are ready; each run counts toward your daily test limit, so you choose when to spend one.

The result appears on the chart, in the tester below it, and in the chat as trades, profit factor, and net profit. After a change, the chat shows the previous and new numbers side by side, for example *Trades 63 → 38 · PF 1.08 → 1.41*. Use [How to read an equity curve, profit factor, and drawdown](/learn/read-equity-curve-profit-factor-drawdown) to judge whether the change helped.

A few trades over two weeks, like the example above, are not enough to judge a rule. Lengthen the period before drawing conclusions; see [How to choose a market and data source](/learn/choose-market-data-for-a-backtest).

## Improve it one change at a time

Ask follow-up questions in the same chat:

- **Explain this result**: the AI reads the test summary, including results by month, weekday, and hour, and points out where the money was made or lost.
- **Which hours lose the most?**: useful before adding a time filter.
- **Add a trailing stop** or **Only trade Tuesday to Thursday**: the AI changes only the lines needed and keeps the rest.

Change one thing per message. If you change the entry, the stop, and the session at once, you cannot tell which change made the difference.

> [!WARNING]
> Each filter you add because of one losing period makes the test fit the past more closely. Test any change on a different period before trusting it. A backtest is practice on history; it does not show what a live account will earn.

## Go back to an earlier version

Every code change from the AI is saved in the **Versions** tab of the tester, together with the code from before the first change. Press **Restore** to put an earlier version back in the editor. Press **Save** at the top when you want to keep the current code in **My strategies**.

## Limits

Free includes 5 AI requests a day and Pro includes 100. Both reset at midnight UTC, and the chat shows how many you have left. Test runs use your normal Strategy Lab limits. Your chat and versions are kept in this browser for each strategy; saved code is kept in your account. [Compare plans](/pricing).
