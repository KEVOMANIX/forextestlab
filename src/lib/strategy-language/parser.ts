/** Strategy source is parsed into a fixed execution plan; never evaluated as JavaScript. */
import { parseScriptStrategy } from "./script-parser";
export type StrategyTimeframe = "1h" | "4h" | "1d";
export type Indicator = { kind: "CLOSE" } | { kind: "EMA" | "SMA" | "RSI"; period: number };
export type Operand = Indicator | { kind: "NUMBER"; value: number };
export type Comparison = "ABOVE" | "BELOW" | "CROSSES ABOVE" | "CROSSES BELOW";
export interface StrategySignal {
  side: "BUY" | "SELL";
  left: Indicator;
  comparison: Comparison;
  right: Operand;
  line: number;
}
export interface StrategyProgram {
  name: string;
  timeframe: StrategyTimeframe;
  signals: StrategySignal[];
  stopPips: number;
  targetPips: number;
  riskPercent: number;
}
export interface StrategyDiagnostic { line: number; message: string }
export type ParseResult = { ok: true; program: StrategyProgram; diagnostics: [] } | { ok: false; diagnostics: StrategyDiagnostic[] };

const INDICATOR = /^(CLOSE|(?:EMA|SMA|RSI)\(\d+\))$/i;
const SIGNAL = /^(BUY|SELL)\s+WHEN\s+(CLOSE|(?:EMA|SMA|RSI)\(\d+\))\s+(CROSSES\s+ABOVE|CROSSES\s+BELOW|ABOVE|BELOW)\s+(CLOSE|(?:EMA|SMA|RSI)\(\d+\)|\d+(?:\.\d+)?)$/i;

function parseIndicator(raw: string): Indicator | null {
  const value = raw.toUpperCase();
  if (!INDICATOR.test(value)) return null;
  if (value === "CLOSE") return { kind: "CLOSE" };
  const match = /^(EMA|SMA|RSI)\((\d+)\)$/.exec(value)!;
  const period = Number(match[2]);
  if (!Number.isInteger(period) || period < 2 || period > 200) return null;
  return { kind: match[1] as "EMA" | "SMA" | "RSI", period };
}

export function parseStrategy(source: string): ParseResult {
  if (/^\s*(?:\/\/[^\n]*\n\s*)*strategy\s*\(/i.test(source)) return parseScriptStrategy(source);
  const diagnostics: StrategyDiagnostic[] = [];
  if (source.length > 4_000) return { ok: false, diagnostics: [{ line: 1, message: "Strategy is limited to 4,000 characters." }] };
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 50) return { ok: false, diagnostics: [{ line: 1, message: "Strategy is limited to 50 lines." }] };
  const values = new Map<string, { value: string; line: number }>();
  const signals: StrategySignal[] = [];

  for (let index = 0; index < lines.length; index++) {
    const text = lines[index]!.trim();
    if (!text || text.startsWith("#")) continue;
    const line = index + 1;
    const signal = SIGNAL.exec(text);
    if (signal) {
      const left = parseIndicator(signal[2]!);
      const right = parseIndicator(signal[4]!) ?? (/^\d+(?:\.\d+)?$/.test(signal[4]!) ? { kind: "NUMBER" as const, value: Number(signal[4]) } : null);
      if (!left || !right || (right.kind === "NUMBER" && !Number.isFinite(right.value))) diagnostics.push({ line, message: "Use indicator periods from 2–200 and finite comparison values." });
      else signals.push({ side: signal[1]!.toUpperCase() as "BUY" | "SELL", left, comparison: signal[3]!.toUpperCase().replace(/\s+/g, " ") as Comparison, right, line });
      continue;
    }
    const statement = /^(STRATEGY|TIMEFRAME|STOP|TARGET|RISK)\s+(.+)$/i.exec(text);
    if (!statement) { diagnostics.push({ line, message: "Unknown rule. Use a statement from the language reference." }); continue; }
    const key = statement[1]!.toUpperCase();
    if (values.has(key)) { diagnostics.push({ line, message: `${key} can only be declared once.` }); continue; }
    values.set(key, { value: statement[2]!.trim(), line });
  }

  const required = (key: string): { value: string; line: number } => {
    const found = values.get(key);
    if (!found) diagnostics.push({ line: 1, message: `Add ${key}.` });
    return found ?? { value: "", line: 1 };
  };
  const name = required("STRATEGY");
  const nameMatch = /^"([^"\n]{2,80})"$/.exec(name.value);
  if (name.value && !nameMatch) diagnostics.push({ line: name.line, message: 'Use STRATEGY "Name" (2–80 characters).' });
  const timeframe = required("TIMEFRAME");
  if (timeframe.value && !["1h", "4h", "1d"].includes(timeframe.value)) diagnostics.push({ line: timeframe.line, message: "TIMEFRAME must be 1h, 4h, or 1d." });
  const numeric = (key: string, suffix: string, min: number, max: number): number => {
    const entry = required(key);
    const match = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${suffix}$`, "i").exec(entry.value);
    const number = match ? Number(match[1]) : NaN;
    if (entry.value && (!Number.isFinite(number) || number < min || number > max)) diagnostics.push({ line: entry.line, message: `${key} must be ${min}–${max} ${suffix === "%" ? "%" : "pips"}.` });
    return number;
  };
  const stopPips = numeric("STOP", "PIPS", 1, 500);
  const targetPips = numeric("TARGET", "PIPS", 1, 1_000);
  const riskPercent = numeric("RISK", "%", 0.1, 5);
  if (!signals.length) diagnostics.push({ line: 1, message: "Add at least one BUY WHEN or SELL WHEN rule." });
  if (signals.length > 8) diagnostics.push({ line: signals[8]!.line, message: "Use at most eight entry rules." });
  if (diagnostics.length) return { ok: false, diagnostics };
  return { ok: true, diagnostics: [], program: { name: nameMatch![1]!, timeframe: timeframe.value as StrategyTimeframe, signals, stopPips, targetPips, riskPercent } };
}

export const STRATEGY_EXAMPLES = {
  crossover: `//@version=1\nstrategy("EMA crossover", timeframe="1h", risk_percent=1)\n\nfast = ta.ema(close, 9)\nslow = ta.ema(close, 21)\nlongSignal = ta.crossover(fast, slow)\nshortSignal = ta.crossunder(fast, slow)\n\nif longSignal\n    strategy.entry("Long", strategy.long)\nif shortSignal\n    strategy.entry("Short", strategy.short)\n\nstrategy.exit("Exit", stop_pips=20, take_profit_pips=40)`,
  pullback: `//@version=1\nstrategy("RSI pullback", timeframe="4h", risk_percent=0.5)\n\nrsiValue = ta.rsi(close, 14)\nlongSignal = ta.crossunder(rsiValue, 30)\nshortSignal = ta.crossover(rsiValue, 70)\n\nif longSignal\n    strategy.entry("Long", strategy.long)\nif shortSignal\n    strategy.entry("Short", strategy.short)\n\nstrategy.exit("Exit", stop_pips=35, take_profit_pips=70)`,
} as const;
