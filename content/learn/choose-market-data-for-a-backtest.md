---
title: How to choose a market and data source for a backtest
description: Pick a market, compare available history, and keep the same data source when testing a strategy.
category: Getting started
date: 2026-11-07
cover: /learn/choose-markets-20261107.png
coverAlt: ForexTestLab market picker listing EUR/USD from Dukascopy and HistData
ctaLabel: Choose a market
ctaHref: /app/backtest
takeaways:
  - The same symbol can appear more than once because each row identifies a data provider.
  - Check the available dates after selection; history varies by market and source.
  - Keep the source, period, and replay settings consistent across tests you want to compare.
---
## Pick a market, then inspect its history

Open [New backtest](/app/backtest) and select **Choose markets**. Search for a symbol or use a category such as Forex, Metals, or Energies. A repeated symbol is intentional: EUR/USD from Dukascopy and EUR/USD from HistData are separate listings. The provider name is shown at the right of each row. One replay uses one provider; selecting a second market from a different provider is not a way to blend their prices.

![Market picker showing separate Dukascopy and HistData rows for the same currency pairs](/learn/choose-markets-20261107.png "The provider label is part of the market choice. Click the image to inspect the full screenshot.")

After selecting the market, look at **Available** below the replay period. That range tells you what this listing can currently replay. Choose a start and end date inside it. Do not assume that two providers cover identical dates or have identical quotes just because the symbol matches.

![New backtest setup with EUR/USD selected, a one-month replay period, and the available date range](/learn/new-backtest-setup-20261107.png "The available range appears under the period controls after you select a market.")

## Make comparisons fair

If you are comparing two entry rules, test them over the same market, provider, period, and execution assumptions. Otherwise, a different result may reflect a changed data sample rather than a better rule. Give each session a name that records the rule and period so you can find it again.

If you deliberately compare providers, treat it as a data sensitivity check. Review whether signals, stop hits, and results change; do not combine the two records into one uninterrupted price history. Historical quotes and simulated execution are useful for practice, but they do not reproduce every condition of a live trade.

> [!TIP]
> For a first comparison, use one market, one provider, one replay period, and one written rule. Change one variable at a time.
