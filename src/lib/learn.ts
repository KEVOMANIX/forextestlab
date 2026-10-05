export interface LearnArticle {
  slug: string;
  title: string;
  description: string;
  category: string;
  updated: string;
  sections: { title: string; paragraphs: string[] }[];
  action: { label: string; href: string };
}

export const learnArticles: LearnArticle[] = [
  {
    slug: "your-first-backtest",
    title: "Your first backtest in ForexTestLab",
    description: "Choose a market, define your rules, and complete a replay session you can review.",
    category: "Getting started", updated: "2026-10-05",
    sections: [
      { title: "Give the test one question", paragraphs: ["Start with a rule you can recognize before the next candle appears. For example: does your entry follow a defined breakout and retest? Write down the entry condition, the invalidation condition, and the exit rule before replaying. Changing these after seeing the outcome makes different trades hard to compare.", "Choose an instrument and a date range supported by its available history. A trial includes three sessions per device, with up to 31 calendar days of historical data in each session. These are historical testing windows, not 31 days of subscription access."] },
      { title: "Set up the replay", paragraphs: ["Open New backtest, choose your market and dates, and set the account and execution assumptions. Spread, commission, and slippage can change the result, so keep them consistent across tests you intend to compare.", "Check the chart time zone and timeframe before starting. Use Play to advance continuously or step through candles when a decision needs attention. Go to can move to a date, session opening or closing, or a price level; reaching a destination pauses the replay."] },
      { title: "Complete a decision, then review it", paragraphs: ["Place a simulated order only when your recorded conditions appear. Define position size, stop, and target using the order ticket. After closing the trade, open Journal and record what you saw and whether you followed the plan.", "Review several trades rather than treating one result as evidence of a reliable method. Keep the test rules and execution assumptions beside your results. Historical simulation is a practice record; it does not establish what a live account will earn."] },
    ], action: { label: "Start a backtest", href: "/app/backtest" },
  },
  {
    slug: "avoid-future-candles",
    title: "How to test without seeing future candles",
    description: "Keep your decisions tied to information available at the replay moment.",
    category: "Backtesting", updated: "2026-10-05",
    sections: [
      { title: "Decide before advancing", paragraphs: ["A replay is useful when the entry decision uses only information available at that moment. Write the reason for entering before revealing the next move. Returning to a winning trade and constructing a reason afterward measures hindsight instead of the original decision.", "Keep your setup rules fixed during one test. If you discover a useful change, record it as a new version and test that version on another period."] },
      { title: "Be careful with higher timeframes", paragraphs: ["A higher-timeframe candle covers many smaller candles. While that period is still unfolding, its high, low, close, and volume can change. Its final shape should not inform an earlier entry. Treat an unfinished candle as provisional when comparing timeframes.", "In an interactive trade chart, check the trade's review moment before drawing conclusions. If you suspect that switching timeframe exposes later data, report the session, trade, selected timeframe, and unexpected timestamp to support."] },
      { title: "Use navigation deliberately", paragraphs: ["Go to runs forward through the replay when reaching a later destination. Moving backward can undo trades opened after the destination. Write down the intended test sequence so a rewind does not quietly turn an initial decision into a second attempt.", "Record missed setups and losing trades as carefully as winners. A review that contains only memorable successes gives an incomplete account of the test."] },
    ], action: { label: "Open your workspace", href: "/app" },
  },
  {
    slug: "review-a-trade",
    title: "How to review a trade in the journal",
    description: "Separate setup, execution, outcome, and lesson when reviewing a decision.",
    category: "Journaling", updated: "2026-10-05",
    sections: [
      { title: "Start with the setup", paragraphs: ["Select the trade from the journal's trade list. Record the strategy or playbook and the evidence visible before entry. A useful thesis names an observable condition rather than simply saying that price looked bullish or bearish.", "Choose Valid, Invalid, or Experimental based on your testing rules. Experimental trades are excluded from performance metrics. Use that classification for trials outside your established rules, not as a way to remove ordinary losses from a strategy's record."] },
      { title: "Separate execution from outcome", paragraphs: ["In Execution, explain whether entry, size, stop, and exit followed the plan. A profitable trade can still contain poor execution; a losing trade can follow the rules exactly. Keeping these observations separate helps identify what should change.", "Use the interactive chart link to revisit market context. For example: 'Entered before the retest completed; next time wait for the specified confirmation.' That is more actionable than 'be patient.'"] },
      { title: "Finish with one usable lesson", paragraphs: ["Record the outcome, then write one lesson that can be checked in the next session. Avoid rewriting the entire strategy after one trade. Look for repeated observations across the trade list before changing a rule.", "Session notes can capture conditions shared by several trades, such as a difficult range or repeated execution errors. Trade notes should describe the individual decision. Keep both concise enough to revisit."] },
    ], action: { label: "Review your sessions", href: "/app/history" },
  },
  {
    slug: "win-rate-and-expectancy",
    title: "Win rate, reward-to-risk, and expectancy explained",
    description: "Read the frequency and size of outcomes together, with a worked example.",
    category: "Analytics", updated: "2026-10-05",
    sections: [
      { title: "Win rate answers one question", paragraphs: ["Win rate describes how often eligible closed trades win. ForexTestLab excludes experimental trades from performance analysis. In session statistics, break-even trades count toward the total eligible trades but do not count as wins.", "For example, 12 wins and 8 losses give a 60% win rate: 12 ÷ 20. Adding two break-even trades to that record gives 12 wins out of 22 eligible trades, or about 54.5%. That number does not describe the size of the wins or losses. Always inspect the trade count and classification alongside a percentage."] },
      { title: "Planned risk is different from realized payoff", paragraphs: ["A planned reward-to-risk ratio compares the distance from entry to target with the distance from entry to stop. A target twice as far away as the stop represents a planned 2:1 ratio. It is a plan, not a guarantee that each winning trade returns twice each loss.", "Realized payoff compares actual average winning and losing results. Partial exits, early closes, costs, and execution assumptions can make it differ from the ratio planned at entry."] },
      { title: "Combine frequency with outcome size", paragraphs: ["For a simple example without break-even trades, expectancy per trade is win probability × average win − loss probability × average loss. If 40% of trades win $150 and 60% lose $80, the expectancy is $60 − $48 = $12 per trade. These are illustrative numbers, not ForexTestLab user results.", "Use consistently measured results after the costs included in your simulation. A positive average from a small sample can change with more trades. Review drawdown, the distribution of outcomes, and the testing period alongside expectancy; an average alone cannot describe the full record."] },
    ], action: { label: "Open analytics", href: "/app/analytics" },
  },
  {
    slug: "sessions-and-time-zones",
    title: "Trading sessions, time zones, and daylight saving",
    description: "Set session hours and understand why UTC offsets can change during historical replay.",
    category: "Chart tools", updated: "2026-10-05",
    sections: [
      { title: "Distinguish chart time from session time", paragraphs: ["The chart time zone controls the clock labels you read on the chart. A trading session has its own local opening and closing hours. London hours quoted in London time do not become New York hours when you change the chart display.", "Before comparing trades across sessions, decide which clock you are using and keep that convention in your notes. A screenshot without its time-zone context can make the same trade appear to happen at a different hour."] },
      { title: "Set your own session windows", paragraphs: ["Open Go to, then Settings. Set the opening time, closing time, and time zone for London, New York, Asian, and Silver Bullet. Save settings to use those windows for Go to session destinations. Restore defaults returns to the built-in definitions.", "Search the time-zone picker by city or UTC offset. Choose the city that matches the intended local hours. Go to session settings configure navigation; configure the Sessions indicator separately if you also want its chart ranges to use different hours."] },
      { title: "Read offsets at the historical date", paragraphs: ["Some cities change their UTC offset during daylight saving. New York commonly uses UTC−5 in winter and UTC−4 during daylight saving. A fixed offset and a city time zone therefore express different rules over a full year.", "ForexTestLab resolves the displayed offsets at the replay moment. When reviewing a period around a clock change, check the exact date instead of assuming that today's offset applies. London and New York change clocks on different schedules, so their relative timing can shift."] },
    ], action: { label: "Open a replay session", href: "/app/history" },
  },
];
