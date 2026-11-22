/**
 * Strategy Lab AI: turns a trader's description into Pine v6 that the Resin
 * runner accepts, or explains a test result. Pure helpers live here so they
 * can be tested without Gemini.
 */

export type AuthorTurn = { role: "user" | "model"; text: string };
export type AuthorMode = "answer" | "code";
export type AuthorResult = { mode: AuthorMode; message: string; rules: string[]; code: string | null };
export type ResultSummary = {
  symbol: string; timeframe: string; from: string; through: string;
  trades: number; longs: number; netPnl: number; netPercent: number; winRate: number;
  profitFactor: number | null; maxDrawdownPercent: number;
  byMonth?: { month: string; trades: number; pnl: number }[];
  byWeekday?: { day: string; trades: number; pnl: number }[];
  byHour?: { hour: number; trades: number; pnl: number }[];
};

export const AI_DAILY_LIMIT = { free: 5, pro: 100 } as const;

export const PINE_AUTHOR_INSTRUCTION = `You write and edit TradingView Pine Script v6 strategies for ForexTestLab's Strategy Lab, and explain their test results.

The scripts run in Resin, a Pine v6 runner, on historical FX or XAU/USD candles. Rules for every script you write:
- First line exactly: //@version=6
- Declare strategy("Name", overlay=true, initial_capital=10000, default_qty_type=strategy.fixed, default_qty_value=10000, margin_long=1, margin_short=1) unless the trader asks for different sizing. For XAUUSD use default_qty_value=10.
- Every strategy() argument must be a literal constant (a plain number, string or true/false), never a variable or expression.
- Never use import, request.* (no security, no other symbols or timeframes), use_bar_magnifier=true, calc_on_every_tick=true, or input.* widgets that need a UI.
- Sessions: use time(timeframe.period, "HHMM-HHMM", "Europe/London") or "America/New_York" / "Asia/Tokyo"; use na() to test it. Keep the session's own city time zone so daylight saving is handled.
- Pip size is syminfo.mintick * 10 for FX pairs.
- Always set exits with strategy.exit(stop=…, limit=…) when the trader mentions a stop or target. One trade at a time unless asked.
- plot() the key levels (ranges, moving averages) so the trader can see them on the chart.
- Keep it short and readable: clear variable names, a comment above each rule. Under 150 lines.
- When editing existing code, change only what the request needs and keep the rest, including the strategy name.

Decide the mode first:
- MODE: answer when the trader asks a question, wants a result or the code explained, or asks for advice. Do not include CODE in this mode, even if a change would help; describe the change and let them ask for it.
- MODE: code only when they ask you to create, change, fix, add or remove something in the strategy.

Reply in exactly this format:
MODE: <answer or code>
MESSAGE:
<one to three short sentences in plain words, no code>
RULES:
- <each rule the code follows, in trader language>
- ? <any assumption you made that the trader did not state>
CODE:
\`\`\`pine
<the full script>
\`\`\`

In answer mode, answer in MESSAGE (cite numbers from the test summary when there is one; say so when no test has run), leave RULES empty, and omit CODE. Never promise future profits; a backtest is practice on history.`;

export function authorPrompt(params: { prompt: string; code: string; summary?: ResultSummary | null }): string {
  const parts = [`Current script:\n\`\`\`pine\n${params.code.trim() || "(empty)"}\n\`\`\``];
  if (params.summary) parts.push(`Latest test result (JSON; byWeekday and byHour use UTC entry times; pnl in USD):\n${JSON.stringify(params.summary)}`);
  else parts.push("No test result yet for this script. If the question needs results (trades, hours, months, profit), say briefly that the trader should press Run test first and then ask again; do not describe yourself or your limits.");
  parts.push(`Trader's request:\n${params.prompt.trim()}`);
  return parts.join("\n\n");
}

export function fixPrompt(errors: string[]): string {
  return `The runner rejected that script:\n${errors.slice(0, 8).map(error => `- ${error}`).join("\n")}\nFix it and reply again in the same format with the full script.`;
}

/** Reads the MESSAGE / RULES / CODE reply. Missing sections come back empty. */
export function parseAuthorReply(text: string): AuthorResult {
  const fence = /```(?:pine(?:script)?)?[ \t]*\r?\n([\s\S]*?)```/i.exec(text);
  const found = fence?.[1]?.trim() ? fence[1].replace(/\r\n/g, "\n").trim() + "\n" : null;
  // An answer never touches the editor, even if the model attached code anyway.
  const mode: AuthorMode = replyMode(text) ?? (found ? "code" : "answer");
  const code = mode === "code" ? found : null;
  const withoutCode = (fence ? text.slice(0, fence.index) : text).replace(/^\s*MODE:.*$/im, "");
  const section = (name: string, next: string[]) => {
    const match = new RegExp(`${name}:\\s*([\\s\\S]*?)(?=${next.map(item => `\\n\\s*${item}:`).join("|") || "$"}|$)`, "i").exec(withoutCode);
    return match?.[1]?.trim() ?? "";
  };
  let message = section("MESSAGE", ["RULES", "CODE"]);
  const rules = section("RULES", ["CODE"]).split("\n").map(line => line.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 12);
  if (!message) message = withoutCode.replace(/^\s*(RULES|CODE):[\s\S]*$/im, "").trim();
  if (!message && code) message = "Here is the script.";
  return { mode, message: message.slice(0, 1200), rules: mode === "code" ? rules : [], code };
}

/** The declared mode, readable as soon as its line has streamed in. */
export function replyMode(text: string): AuthorMode | null {
  const match = /^\s*MODE:\s*(answer|code)\b/im.exec(text);
  return match ? (match[1]!.toLowerCase() as AuthorMode) : null;
}

type ReportTrade = { direction: "long" | "short"; entryTime: number; pnl: number };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The compact test summary the AI reads (times grouped in UTC). */
export function summarizeReport(report: { symbol: string; startingBalance: number; netPnl: number; winRate: number; profitFactor: number | null; trades: ReportTrade[] }, setup: { timeframe: string; from: string; through: string; maxDrawdownPercent: number }): ResultSummary {
  const group = <K extends string | number>(key: (trade: ReportTrade) => K) => {
    const map = new Map<K, { trades: number; pnl: number }>();
    for (const trade of report.trades) { const item = map.get(key(trade)) ?? { trades: 0, pnl: 0 }; item.trades++; item.pnl += trade.pnl; map.set(key(trade), item); }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => ({ key: k, trades: v.trades, pnl: Math.round(v.pnl * 100) / 100 }));
  };
  return {
    symbol: report.symbol, timeframe: setup.timeframe, from: setup.from, through: setup.through,
    trades: report.trades.length, longs: report.trades.filter(trade => trade.direction === "long").length,
    netPnl: Math.round(report.netPnl * 100) / 100, netPercent: Math.round(report.netPnl / report.startingBalance * 10_000) / 100,
    winRate: Math.round(report.winRate * 100) / 100, profitFactor: report.profitFactor === null ? null : Math.round(report.profitFactor * 100) / 100,
    maxDrawdownPercent: Math.round(setup.maxDrawdownPercent * 100) / 100,
    byMonth: group(trade => new Date(trade.entryTime).toISOString().slice(0, 7)).slice(-36).map(({ key, ...rest }) => ({ month: key, ...rest })),
    byWeekday: group(trade => new Date(trade.entryTime).getUTCDay()).map(({ key, ...rest }) => ({ day: WEEKDAYS[key]!, ...rest })),
    byHour: group(trade => new Date(trade.entryTime).getUTCHours()).map(({ key, ...rest }) => ({ hour: key, ...rest })),
  };
}

/** Number of lines that differ, for "Changed 3 lines". */
export function changedLines(before: string, after: string): number {
  const a = before.split("\n"), b = after.split("\n");
  // Longest common subsequence on lines; scripts are short.
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  return Math.max(a.length, b.length) - dp[0]![0]!;
}
