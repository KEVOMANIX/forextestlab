/**
 * Plain-English definitions for every number the analytics screens show.
 *
 * This exists because the reports are dense on purpose: a trader wants the
 * figures side by side, not a paragraph between each one. The prose still has
 * to live somewhere, so it lives here and surfaces on demand behind an (i).
 *
 * Three fields, and the split matters:
 *
 *  - `what` answers "what am I looking at" in one sentence.
 *  - `how` answers "where did this number come from", so a reader who doubts
 *    it can check the arithmetic rather than distrust the whole report.
 *  - `read` answers "so what" — the threshold, and the trap. Most trading
 *    metrics have a way of flattering you (profit factor loves a small sample,
 *    recovery factor loves a shallow drawdown), and a definition that omits
 *    that is worse than none.
 *
 * Keys are matched loosely — see `explainMetric` — so a label can be
 * capitalised or punctuated for the UI without breaking the lookup.
 */

export interface MetricExplainer {
  /** One sentence: what this number is. */
  what: string;
  /** How it is calculated here, when that is not obvious from the name. */
  how?: string;
  /** How to read it, including the way it commonly misleads. */
  read?: string;
}

const GLOSSARY: Record<string, MetricExplainer> = {
  // ── Headline results ────────────────────────────────────────────────
  "net profit / loss": {
    what: "Everything you made or lost over the whole test, after simulated costs.",
    how: "Ending balance minus starting balance. Spread, commission and slippage are already taken out.",
  },
  "net realised p/l": {
    what: "Profit and loss from trades that are closed. Open positions are not counted.",
    read: "This can differ from your equity change if a position is still open.",
  },
  "ending balance": {
    what: "What the account was worth when the test finished.",
  },
  "ending equity": {
    what: "Account value including any position still open at the end.",
  },
  "account equity": {
    what: "Balance plus the running profit or loss of anything still open.",
  },
  "current balance": {
    what: "Closed-trade money in the account, ignoring open positions.",
  },
  return: {
    what: "Net profit as a percentage of what you started with.",
    read: "Always read it next to maximum drawdown. A 20% return that survived a 30% drawdown is not the same result as a 20% return that never fell 3%.",
  },
  "total trades": {
    what: "How many trades you have closed.",
    read: "Below about 30 the other numbers on this page are indicative rather than reliable — one outlier moves everything.",
  },
  "closed trades": {
    what: "How many trades you have closed.",
    read: "Below about 30 the other numbers on this page are indicative rather than reliable — one outlier moves everything.",
  },

  // ── Quality of the edge ─────────────────────────────────────────────
  "win rate": {
    what: "The share of your closed trades that made money.",
    read: "A high win rate is not an edge on its own. Cutting winners early raises it while shrinking profit — read it beside payoff ratio.",
  },
  "profit factor": {
    what: "How many dollars you won for every dollar you lost.",
    how: "Gross profit divided by gross loss.",
    read: "Above 1.0 means the strategy made money. 1.5 or better is usually considered solid; anything above 3 on a small sample is more likely luck than edge.",
  },
  expectancy: {
    what: "What one average trade is worth to you, win or lose.",
    how: "Total profit from trades divided by the number of trades.",
    read: "This is the number to multiply by your expected trade count. If it is negative, more trading loses more money.",
  },
  "average trade": {
    what: "Net profit spread evenly across every closed trade.",
    read: "It must comfortably exceed your typical spread and commission, or the costs are eating the edge.",
  },
  "payoff ratio": {
    what: "How much bigger your average win is than your average loss.",
    how: "Average win divided by average loss.",
    read: "Below 1 you need to win more often than you lose just to break even. Read it with win rate: the two together decide whether you make money.",
  },
  "avg risk / reward": {
    what: "How far the average trade travelled compared with what it risked.",
    how: "For each trade with a stop, the distance from entry to exit divided by the distance from entry to stop, then averaged.",
  },
  "average r": {
    what: "The average trade result measured in units of risk.",
    how: "Each trade's profit divided by the money it had at risk, then averaged. +1R means it made exactly what it risked.",
    read: "R strips out position size, so it compares a 0.2-lot trade with a 2-lot trade fairly.",
  },
  "r-multiple": {
    what: "A trade's result measured in units of what it risked.",
    how: "Profit divided by the initial risk. Risking $200 and making $400 is +2R.",
    read: "Trades without a recorded initial risk cannot be converted and are left out of R-based charts.",
  },
  "gross profit": {
    what: "Everything the winning trades made, before losses are subtracted.",
  },
  "gross loss": {
    what: "Everything the losing trades cost, before wins are added.",
  },
  "average win": { what: "The typical size of a winning trade." },
  "average loss": { what: "The typical size of a losing trade." },
  "average win / loss": {
    what: "The typical winner beside the typical loser.",
    read: "If the loser is bigger, the strategy needs a high win rate to survive.",
  },
  "largest win": {
    what: "The single best trade.",
    read: "If it is a large share of net profit, the result rests on one trade rather than a repeatable edge.",
  },
  "largest loss": {
    what: "The single worst trade.",
    read: "Compare it with your intended risk per trade. A largest loss well above it means a stop was moved, skipped, or gapped.",
  },
  "best trade": { what: "The single most profitable trade in the test." },
  "worst trade": { what: "The single biggest losing trade in the test." },

  // ── Risk ────────────────────────────────────────────────────────────
  "max drawdown": {
    what: "The deepest fall from a high point to the low that followed it.",
    how: "Measured on the equity curve, so it includes the damage from open positions, not just closed ones.",
    read: "This is the money you had to be willing to lose to earn the result. Assume the future holds a worse one.",
  },
  "maximum drawdown": {
    what: "The deepest fall from a high point to the low that followed it.",
    how: "Measured on the equity curve, so it includes the damage from open positions, not just closed ones.",
    read: "This is the money you had to be willing to lose to earn the result. Assume the future holds a worse one.",
  },
  "max drawdown %": {
    what: "The deepest fall, as a percentage of the account's high point at the time.",
    read: "Percentages travel between account sizes; dollars do not. This is the number to compare against a prop firm's limit.",
  },
  "maximum depth": {
    what: "The worst point of the largest drawdown.",
  },
  "recovery factor": {
    what: "How much profit the strategy produced for each dollar of its worst drawdown.",
    how: "Net profit divided by maximum drawdown.",
    read: "Higher is better: 3.0 means you earned three times the pain you had to sit through. Below 1.0 the deepest drawdown was larger than everything you made. It flatters a test that got lucky and never had a bad run, so read it beside the length of the test.",
  },
  "return / drawdown": {
    what: "Profit measured against the worst decline it took to get there.",
    how: "Net profit divided by maximum drawdown — the same idea as recovery factor.",
    read: "It answers whether the reward justified the ride.",
  },
  "maximum lot used": {
    what: "The biggest position you opened during the test.",
    read: "If it is far above your typical size, one trade carried unusual risk and may be distorting the results.",
  },
  "profit concentration": {
    what: "How much of your profit came from just a handful of trades.",
    how: "The three largest winners as a share of all winning profit.",
    read: "Lower is better. High concentration means the edge has not repeated — remove those three trades and ask whether the strategy still works.",
  },
  "top-three contribution": {
    what: "The share of winning profit produced by your three best trades.",
    read: "Above roughly 50% the result depends on outliers rather than a repeatable process.",
  },
  "statistical confidence": {
    what: "Whether you have enough trades for the numbers to mean something.",
    read: "Around 30 closed trades is the point where win rate and profit factor stop swinging wildly with each new trade. It is a floor, not a guarantee.",
  },
  "sample quality": {
    what: "Whether the test has collected enough trades to judge.",
    read: "Below 30 trades, treat every figure on this page as a question rather than an answer.",
  },

  // ── Streaks and consistency ─────────────────────────────────────────
  "consecutive wins": { what: "The longest run of winning trades in a row." },
  "consecutive losses": {
    what: "The longest run of losing trades in a row.",
    read: "This is the run you have to be able to trade through without changing the plan. Expect a longer one eventually.",
  },
  "best win streak": { what: "The longest run of winning trades in a row." },
  "worst loss streak": {
    what: "The longest run of losing trades in a row.",
    read: "This is the run you have to be able to trade through without changing the plan. Expect a longer one eventually.",
  },
  "current streak": {
    what: "How many trades in a row have gone the same way, most recent first.",
  },
  "winning / losing": {
    what: "How many trades finished in profit, and how many in loss.",
    read: "Trades that closed exactly flat count as neither.",
  },
  "positive months": {
    what: "How many calendar months ended in profit.",
    read: "Consistency matters as much as total profit — a year made in one month is harder to trade than the same year spread evenly.",
  },
  "monthly returns": {
    what: "Each month's profit as a percentage of the starting balance.",
  },

  // ── Coverage and frequency ──────────────────────────────────────────
  "days processed": {
    what: "Calendar days between your first entry and your last exit.",
  },
  "months processed": {
    what: "The span of the test in months.",
    read: "A strategy tested over less than a few months has only met one kind of market.",
  },
  "trading days": {
    what: "The number of distinct days on which you actually opened a trade.",
  },
  "trades / active day": {
    what: "How many trades you take on a day you trade at all.",
  },
  "trades / month": {
    what: "Your trading rate, which sets how fast a real sample would accumulate.",
    read: "At 5 trades a month, a 30-trade sample takes half a year to gather live.",
  },
  "profit / month": {
    what: "Net profit divided by the months the test covers.",
    read: "A projection from this test, not a forecast. It assumes the market keeps behaving as it did.",
  },
  "avg hold": {
    what: "How long the average trade stayed open, from entry to exit.",
  },
  "replay progress": {
    what: "How far through the historical period this session has been replayed.",
  },

  // ── Time ────────────────────────────────────────────────────────────
  "new york time": {
    what: "Every date, weekday and calendar cell in this report is New York time.",
    how: "New York runs at UTC−5 in winter and UTC−4 during daylight saving. The report follows the clock a New York trader reads, so the changeover is handled for you rather than shifting your results twice a year.",
    read: "The forex day is cut at the New York 5pm rollover, which is why the reports are anchored there. It also means a result never moves because you travelled or changed a chart's zone.",
  },

  // ── Exit quality ────────────────────────────────────────────────────
  "typical give-back": {
    what: "How much profit the average trade showed on screen and then handed back before you closed it.",
    how: "The gap between a trade's best unrealised point and what you actually kept, in units of risk. A losing trade can only give back the profit it briefly had, never more.",
    read: "Some give-back is unavoidable — you cannot exit at the exact high. A large figure suggests targets or trailing stops are set too far away.",
  },
  "gave back over 1r": {
    what: "How many trades surrendered a whole unit of risk in open profit before closing.",
    read: "These are the trades where a different exit rule would have changed the result most.",
  },
  "winners dipped to": {
    what: "How far your eventual winners went against you before they worked.",
    read: "If this is close to your stop, winning trades were nearly stopped out — the stop may be tighter than the setup needs.",
  },
};

/** Aliases: one definition, several labels across the screens. */
const ALIASES: Record<string, string> = {
  "net p/l": "net realised p/l",
  "net profit": "net profit / loss",
  "maximum drawdown %": "max drawdown %",
  "max drawdown percent": "max drawdown %",
  "drawdown and recovery": "maximum drawdown",
  "r-multiple distribution": "r-multiple",
  "average risk / reward": "avg risk / reward",
  "avg risk/reward": "avg risk / reward",
  "average hold": "avg hold",
  "trades per month": "trades / month",
  "trades per active day": "trades / active day",
};

/**
 * Case, spacing and trailing punctuation vary between screens; the definition
 * should not. Normalise before looking anything up.
 */
function normalise(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ").replace(/[:.?]+$/, "");
}

export function explainMetric(term: string): MetricExplainer | null {
  const key = normalise(term);
  return GLOSSARY[key] ?? GLOSSARY[ALIASES[key] ?? ""] ?? null;
}

/** Every term with a definition, for the test that guards against drift. */
export function definedMetrics(): string[] {
  return [...Object.keys(GLOSSARY), ...Object.keys(ALIASES)];
}
