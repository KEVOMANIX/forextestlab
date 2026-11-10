/**
 * Converts Pine Script v4 to v5, the way TradingView's "Convert to v5" does
 * for the common cases: namespaced built-ins, study() → indicator(), iff(),
 * typed input(), and transp= folded into color.new().
 */

const TA = [
  "sma", "ema", "wma", "vwma", "swma", "rma", "alma", "hma", "linreg", "rsi", "mom", "roc", "cci", "cmo", "mfi", "tsi", "wpr",
  "atr", "stoch", "macd", "bb", "bbw", "kc", "kcw", "dmi", "sar", "supertrend", "highest", "lowest", "highestbars", "lowestbars",
  "change", "stdev", "variance", "dev", "median", "mode", "range", "percentrank", "percentile_linear_interpolation",
  "percentile_nearest_rank", "correlation", "cross", "crossover", "crossunder", "falling", "rising", "barssince", "valuewhen",
  "pivothigh", "pivotlow", "cum", "cog",
];
/** v4 built-in variables that became ta.* in v5. */
const TA_VARIABLES = ["tr", "obv", "accdist", "iii", "nvi", "pvi", "pvt", "wad", "wvad", "vwap"];
const MATH = [
  "abs", "acos", "asin", "atan", "avg", "ceil", "cos", "exp", "floor", "log", "log10", "max", "min", "pow", "random",
  "round", "round_to_mintick", "sign", "sin", "sqrt", "sum", "tan", "todegrees", "toradians",
];
const RENAMES: Record<string, string> = {
  ...Object.fromEntries(TA.map((name) => [name, `ta.${name}`])),
  ...Object.fromEntries(MATH.map((name) => [name, `math.${name}`])),
  tostring: "str.tostring", tonumber: "str.tonumber",
  security: "request.security", financial: "request.financial", quandl: "request.quandl",
  splits: "request.splits", dividends: "request.dividends", earnings: "request.earnings",
  tickerid: "ticker.new", heikinashi: "ticker.heikinashi", renko: "ticker.renko", linebreak: "ticker.linebreak",
  kagi: "ticker.kagi", pointfigure: "ticker.pointfigure",
  study: "indicator",
};
const INPUT_TYPES: Record<string, string> = {
  "input.integer": "input.int", "input.float": "input.float", "input.bool": "input.bool", "input.string": "input.string",
  "input.source": "input.source", "input.resolution": "input.timeframe", "input.session": "input.session",
  "input.symbol": "input.symbol", "input.color": "input.color", "input.time": "input.time", "input.price": "input.price",
};
/** Positional index of the color argument, for calls whose transp= must move into color.new(). */
const COLOR_ARGUMENT: Record<string, number> = { plot: 2, bgcolor: 0, fill: 2, hline: 2, plotshape: 4, plotchar: 4, plotcandle: 5, plotbar: 5 };

/** Marks each character as code (true) or string/comment (false). */
export function codeMask(source: string): boolean[] {
  const mask = new Array<boolean>(source.length).fill(true);
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") mask[index++] = false;
    } else if (char === '"' || char === "'") {
      mask[index] = false;
      for (index++; index < source.length && source[index] !== char && source[index] !== "\n"; index++) {
        mask[index] = false;
        if (source[index] === "\\") mask[++index] = false;
      }
      if (index < source.length) mask[index] = false;
    }
  }
  return mask;
}

export type Call = { start: number; open: number; close: number; args: { start: number; end: number }[] };

/** Calls of `name(` in code (not after a dot or a word character), with top-level argument spans. */
export function findCalls(source: string, name: string): Call[] {
  const mask = codeMask(source);
  const calls: Call[] = [];
  const pattern = new RegExp(`(?<![\\w.])${name.replace(".", "\\.")}\\s*\\(`, "g");
  for (const match of source.matchAll(pattern)) {
    const start = match.index!;
    if (!mask[start]) continue;
    const open = start + match[0].length - 1;
    let depth = 0;
    let argStart = open + 1;
    const args: Call["args"] = [];
    for (let index = open; index < source.length; index++) {
      if (!mask[index]) continue;
      const char = source[index];
      if (char === "(" || char === "[") depth++;
      else if (char === ")" || char === "]") {
        depth--;
        if (depth === 0) {
          if (source.slice(argStart, index).trim()) args.push({ start: argStart, end: index });
          calls.push({ start, open, close: index, args });
          break;
        }
      } else if (char === "," && depth === 1) { args.push({ start: argStart, end: index }); argStart = index + 1; }
    }
  }
  return calls;
}

/**
 * Names the script defines itself. Its functions shadow built-in calls; its
 * variables and parameters shadow built-in variables. (v4 lets a variable
 * share a built-in function's name, as in `atr = atr(10)`.)
 */
function declaredNames(source: string): { variables: Set<string>; functions: Set<string> } {
  const names = new Set<string>();
  const functions = new Set<string>();
  const code = source.split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  for (const match of code.matchAll(/^\s*(?:var\s+|varip\s+)?(?:(?:int|float|bool|string|color|line|label|box|table)\s+)?([A-Za-z_]\w*)\s*(?::=|=(?![=>]))/gm)) names.add(match[1]!);
  for (const match of code.matchAll(/^\s*\[([^\]]+)\]\s*=/gm)) for (const name of match[1]!.split(",")) names.add(name.trim());
  for (const match of code.matchAll(/^\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*=>/gm)) {
    functions.add(match[1]!);
    for (const parameter of match[2]!.split(",")) { const name = parameter.trim().split(/\s*=/)[0]!.trim(); if (name) names.add(name); }
  }
  return { variables: names, functions };
}

function replaceCalls(source: string, name: string, rewrite: (call: Call, text: string) => string | null): string {
  // Last first, so nested calls are rewritten before the calls that contain them.
  for (let guard = 0; guard < 2000; guard++) {
    const calls = findCalls(source, name);
    let changed = false;
    for (let index = calls.length - 1; index >= 0; index--) {
      const call = calls[index]!;
      const replacement = rewrite(call, source);
      if (replacement == null) continue;
      source = source.slice(0, call.start) + replacement + source.slice(call.close + 1);
      changed = true;
      break;
    }
    if (!changed) return source;
  }
  return source;
}

export function isPineV4(code: string): boolean {
  return /^\s*\/\/\s*@version\s*=\s*4\s*$/m.test(code);
}

export function convertPineV4(code: string): string {
  let source = code.replace(/^(\s*\/\/\s*@version\s*=\s*)4(\s*)$/m, "$15$2");
  const own = declaredNames(source);

  // iff(cond, a, b) → (cond ? a : b)
  source = replaceCalls(source, "iff", (call, text) => {
    if (call.args.length !== 3) return null;
    const [condition, whenTrue, whenFalse] = call.args.map((arg) => text.slice(arg.start, arg.end).trim());
    return `(${condition} ? ${whenTrue} : ${whenFalse})`;
  });

  // input(..., type=input.integer, ...) → input.int(...)
  source = replaceCalls(source, "input", (call, text) => {
    const args = call.args.map((arg) => text.slice(arg.start, arg.end).trim());
    let typeIndex = args.findIndex((arg) => /^type\s*=/.test(arg));
    // input(defval, title, type) also took the type as its third positional argument.
    if (typeIndex < 0 && args[2] && /^input\.\w+$/.test(args[2]) && !/^\w+\s*=(?!=)/.test(args[1] ?? "")) typeIndex = 2;
    if (typeIndex < 0) return null;
    const kind = INPUT_TYPES[args[typeIndex]!.replace(/^type\s*=\s*/, "")];
    if (!kind) return null;
    args.splice(typeIndex, 1);
    return `${kind}(${args.join(", ")})`;
  });

  // transp=N on plotting calls → color=color.new(<color>, N)
  for (const [name, position] of Object.entries(COLOR_ARGUMENT)) {
    source = replaceCalls(source, name, (call, text) => {
      const args = call.args.map((arg) => text.slice(arg.start, arg.end).trim());
      const transpIndex = args.findIndex((arg) => /^transp\s*=/.test(arg));
      const named = args.findIndex((arg) => /^color\s*=/.test(arg));
      const positional = args.slice(0, position + 1).every((arg) => !/^\w+\s*=(?!=)/.test(arg)) && args.length > position ? position : -1;
      if (transpIndex < 0) {
        // v4's fill() and bgcolor() are 90% transparent unless told otherwise; v5 has no
        // such default, so it moves into the color. Colors that carry their own
        // transparency (color.new, #RRGGBBAA) or na are left alone.
        if (name !== "fill" && name !== "bgcolor") return null;
        const color = named >= 0 ? args[named]!.replace(/^color\s*=\s*/, "") : positional >= 0 ? args[positional]! : null;
        if (!color || /^color\.new\s*\(/.test(color) || /^#[0-9a-f]{8}$/i.test(color) || color === "na") return null;
        if (named >= 0) args[named] = `color=color.new(${color}, 90)`;
        else args[positional] = `color.new(${color}, 90)`;
        return `${name}(${args.join(", ")})`;
      }
      const transp = args[transpIndex]!.replace(/^transp\s*=\s*/, "");
      args.splice(transpIndex, 1);
      return withTransp(name, args, position, transp);
    });
  }

  // study(..., resolution=...) → indicator(..., timeframe=...)
  source = replaceCalls(source, "study", (call, text) => {
    const args = call.args.map((arg) => text.slice(arg.start, arg.end).trim().replace(/^resolution\s*=/, "timeframe="));
    return `indicator(${args.join(", ")})`;
  });
  return renameBuiltins(source, own);
}

function withTransp(name: string, args: string[], position: number, transp: string): string {
  const named = args.findIndex((arg) => /^color\s*=/.test(arg));
  const positional = args.slice(0, position + 1).every((arg) => !/^\w+\s*=(?!=)/.test(arg)) && args.length > position ? position : -1;
  if (named >= 0) args[named] = `color=color.new(${args[named]!.replace(/^color\s*=\s*/, "")}, ${transp})`;
  else if (positional >= 0) args[positional] = `color.new(${args[positional]}, ${transp})`;
  else if (name !== "fill" && name !== "bgcolor") args.push(`color=color.new(color.blue, ${transp})`);
  return `${name}(${args.join(", ")})`;
}

function renameBuiltins(source: string, own: { variables: Set<string>; functions: Set<string> }): string {
  // Namespaced built-ins (calls), skipping names the script defines itself.
  const mask = codeMask(source);
  let output = "";
  let last = 0;
  for (const match of source.matchAll(/(?<![\w.])([A-Za-z_]\w*)(?=\s*\()/g)) {
    const name = match[1]!;
    const target = RENAMES[name];
    if (!target || own.functions.has(name) || !mask[match.index!]) continue;
    output += source.slice(last, match.index!) + target;
    last = match.index! + name.length;
  }
  source = output + source.slice(last);

  // Built-in variables that moved to ta.* (tr, obv, vwap, ...).
  const variableMask = codeMask(source);
  output = ""; last = 0;
  for (const match of source.matchAll(new RegExp(`(?<![\\w.])(${TA_VARIABLES.join("|")})(?![\\w])`, "g"))) {
    const name = match[1]!;
    const isCall = /^\s*\(/.test(source.slice(match.index! + name.length));
    if ((isCall ? own.functions : own.variables).has(name) || !variableMask[match.index!]) continue;
    output += source.slice(last, match.index!) + `ta.${name}`;
    last = match.index! + name.length;
  }
  return output + source.slice(last);
}
