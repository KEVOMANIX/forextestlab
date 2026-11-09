import type { Indicator, Operand, ParseResult, StrategyDiagnostic, StrategySignal, StrategyTimeframe } from "./parser";

type Condition = Pick<StrategySignal, "left" | "comparison" | "right">;
const identifier = /^[A-Za-z_][A-Za-z_0-9]*$/;
const numeric = /^\d+(?:\.\d+)?$/;

/** A bounded Pine-inspired subset. The source never runs as JavaScript. */
export function parseScriptStrategy(source: string): ParseResult {
  const diagnostics: StrategyDiagnostic[] = [];
  if (source.length > 4_000) return { ok: false, diagnostics: [{ line: 1, message: "Script is limited to 4,000 characters." }] };
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 100) return { ok: false, diagnostics: [{ line: 1, message: "Script is limited to 100 lines." }] };
  const numbers = new Map<string, number>();
  const indicators = new Map<string, Indicator>();
  const conditions = new Map<string, Condition>();
  const signals: StrategySignal[] = [];
  let name: string | null = null;
  let timeframe: StrategyTimeframe | null = null;
  let riskPercent: number | null = null;
  let stopPips: number | null = null;
  let targetPips: number | null = null;
  let pendingIf: { condition: Condition; line: number } | null = null;
  const error = (line: number, message: string) => diagnostics.push({ line, message });
  const numberOf = (raw: string): number | null => numeric.test(raw.trim()) ? Number(raw.trim()) : numbers.get(raw.trim()) ?? null;
  const operandOf = (raw: string): Operand | null => {
    const text = raw.trim();
    if (numeric.test(text)) return { kind: "NUMBER", value: Number(text) };
    if (numbers.has(text)) return { kind: "NUMBER", value: numbers.get(text)! };
    if (text === "close") return { kind: "CLOSE" };
    if (indicators.has(text)) return indicators.get(text)!;
    const call = /^ta\.(ema|sma|rsi)\(\s*close\s*,\s*([A-Za-z_][A-Za-z_0-9]*|\d+)\s*\)$/i.exec(text);
    if (!call) return null;
    const period = numberOf(call[2]!);
    return period !== null && Number.isInteger(period) && period >= 2 && period <= 200 ? { kind: call[1]!.toUpperCase() as "EMA" | "SMA" | "RSI", period } : null;
  };
  const conditionOf = (raw: string): Condition | null => {
    const text = raw.trim();
    if (conditions.has(text)) return conditions.get(text)!;
    const cross = /^ta\.(crossover|crossunder)\(\s*([^,]+)\s*,\s*([^,]+)\s*\)$/i.exec(text);
    if (cross) {
      const left = operandOf(cross[2]!);
      const right = operandOf(cross[3]!);
      if (left && left.kind !== "NUMBER" && right) return { left, right, comparison: cross[1]!.toLowerCase() === "crossover" ? "CROSSES ABOVE" : "CROSSES BELOW" };
    }
    const compare = /^([A-Za-z_][A-Za-z_0-9]*|close)\s*([<>])\s*([A-Za-z_][A-Za-z_0-9]*|close|\d+(?:\.\d+)?)$/.exec(text);
    if (compare) {
      const left = operandOf(compare[1]!);
      const right = operandOf(compare[3]!);
      if (left && left.kind !== "NUMBER" && right) return { left, right, comparison: compare[2] === ">" ? "ABOVE" : "BELOW" };
    }
    return null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const raw = lines[index]!;
    const text = raw.trim();
    if (!text || text.startsWith("//")) continue;
    const indented = /^\s/.test(raw);
    if (pendingIf) {
      const entry = /^strategy\.entry\(\s*"[^"\n]{1,80}"\s*,\s*strategy\.(long|short)\s*\)$/.exec(text);
      if (!indented || !entry) {
        error(line, "An if condition must be followed by an indented strategy.entry(\"Name\", strategy.long or strategy.short).");
        pendingIf = null;
      } else {
        signals.push({ ...pendingIf.condition, side: entry[1] === "long" ? "BUY" : "SELL", line: pendingIf.line });
        pendingIf = null;
        continue;
      }
    }
    if (indented) { error(line, "Only strategy.entry inside an if block should be indented."); continue; }
    const declaration = /^strategy\(\s*"([^"\n]{2,80})"\s*,\s*timeframe\s*=\s*"(1h|4h|1d)"\s*,\s*risk_percent\s*=\s*([A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?)\s*\)$/.exec(text);
    if (declaration) {
      if (name) { error(line, "Declare strategy() once."); continue; }
      name = declaration[1]!;
      timeframe = declaration[2]! as StrategyTimeframe;
      riskPercent = numberOf(declaration[3]!);
      if (riskPercent === null || riskPercent < 0.1 || riskPercent > 5) error(line, "risk_percent must be 0.1–5.");
      continue;
    }
    const exit = /^strategy\.exit\(\s*"[^"\n]{1,80}"\s*,\s*stop_pips\s*=\s*([A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?)\s*,\s*take_profit_pips\s*=\s*([A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?)\s*\)$/.exec(text);
    if (exit) {
      if (stopPips !== null) { error(line, "Declare strategy.exit() once."); continue; }
      stopPips = numberOf(exit[1]!);
      targetPips = numberOf(exit[2]!);
      if (stopPips === null || stopPips < 1 || stopPips > 500) error(line, "stop_pips must be 1–500.");
      if (targetPips === null || targetPips < 1 || targetPips > 1_000) error(line, "take_profit_pips must be 1–1000.");
      continue;
    }
    const ifMatch = /^if\s+(.+)$/.exec(text);
    if (ifMatch) {
      const condition = conditionOf(ifMatch[1]!);
      if (!condition) error(line, "Use a defined condition, ta.crossover(), ta.crossunder(), or a simple > / < comparison.");
      else pendingIf = { condition, line };
      continue;
    }
    const assign = /^([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.+)$/.exec(text);
    if (assign) {
      const key = assign[1]!;
      const value = assign[2]!.trim();
      if (!identifier.test(key) || ["close", "strategy", "ta"].includes(key) || numbers.has(key) || indicators.has(key) || conditions.has(key)) { error(line, "Use a unique variable name."); continue; }
      const input = /^input\.(?:int|float)\(\s*(\d+(?:\.\d+)?)(?:\s*,\s*title\s*=\s*"[^"\n]{1,80}")?\s*\)$/.exec(value);
      if (input) { numbers.set(key, Number(input[1])); continue; }
      if (numeric.test(value)) { numbers.set(key, Number(value)); continue; }
      const operand = operandOf(value);
      if (operand && operand.kind !== "NUMBER") { indicators.set(key, operand); continue; }
      const condition = conditionOf(value);
      if (condition) { conditions.set(key, condition); continue; }
      error(line, "Unsupported expression. Use input.int/float, ta.ema/sma/rsi, ta.crossover/crossunder, or > / <.");
      continue;
    }
    error(line, "Unsupported script statement. Check the language reference.");
  }
  if (pendingIf) error(pendingIf.line, "Add an indented strategy.entry below this if.");
  if (!name) error(1, "Add strategy(\"Name\", timeframe=\"1h\", risk_percent=1).");
  if (stopPips === null || targetPips === null) error(1, "Add strategy.exit(\"Exit\", stop_pips=20, take_profit_pips=40).");
  if (!signals.length) error(1, "Add an if condition with strategy.entry().");
  if (signals.length > 8) error(signals[8]!.line, "Use at most eight entry conditions.");
  if (diagnostics.length) return { ok: false, diagnostics };
  return { ok: true, diagnostics: [], program: { name: name!, timeframe: timeframe!, signals, stopPips: stopPips!, targetPips: targetPips!, riskPercent: riskPercent! } };
}
