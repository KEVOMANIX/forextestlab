---
title: Win rate, reward-to-risk, and expectancy explained
description: Read the frequency and size of outcomes together, with a worked example.
category: Analytics
date: 2026-10-05
cover: /product/session-analytics-20261008.webp
coverAlt: Session analytics showing win rate and expectancy
featured: true
ctaLabel: Open analytics
ctaHref: /app/analytics
takeaways:
  - Win rate says how often trades win, not how much they win or lose.
  - A planned 2:1 reward-to-risk is a plan; realized payoff is what actually happened.
  - Expectancy combines both, so read it with the trade count and drawdown.
---
## Win rate answers one question

Win rate describes how often eligible closed trades win. ForexTestLab excludes experimental trades from performance analysis. In session statistics, break-even trades count toward the total eligible trades but do not count as wins.

For example, 12 wins and 8 losses give a 60% win rate: 12 ÷ 20. Adding two break-even trades to that record gives 12 wins out of 22 eligible trades, or about 54.5%. That number does not describe the size of the wins or losses. Always inspect the trade count and classification alongside a percentage.

## Planned risk is different from realized payoff

A planned reward-to-risk ratio compares the distance from entry to target with the distance from entry to stop. A target twice as far away as the stop represents a planned 2:1 ratio. It is a plan, not a guarantee that each winning trade returns twice each loss.

Realized payoff compares actual average winning and losing results. Partial exits, early closes, costs, and execution assumptions can make it differ from the ratio planned at entry.

## Combine frequency with outcome size

For a simple example without break-even trades, expectancy per trade is win probability × average win − loss probability × average loss. If 40% of trades win $150 and 60% lose $80, the expectancy is $60 − $48 = $12 per trade. These are illustrative numbers, not ForexTestLab user results.

Use consistently measured results after the costs included in your simulation. A positive average from a small sample can change with more trades. Review drawdown, the distribution of outcomes, and the testing period alongside expectancy; an average alone cannot describe the full record.
