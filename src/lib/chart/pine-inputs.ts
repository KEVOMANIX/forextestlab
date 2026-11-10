import { findCalls } from "./pine-v4";

/**
 * A script's input.*() declarations, read from its source the way
 * TradingView lists them in an indicator's Inputs tab. A changed value is
 * applied by rewriting that input's default in a copy of the code, which
 * works for every input type (sources and timeframes included).
 */
export type PineInputKind = "int" | "float" | "bool" | "string" | "source" | "color" | "timeframe" | "session" | "symbol" | "other";
export type PineInputValue = number | boolean | string;
export type PineInput = {
  /** Position among the script's inputs; the key settings are stored under. */
  key: string;
  kind: PineInputKind;
  /** The title, or the variable it is assigned to when the script gives none. */
  title: string;
  /** The title exactly as written ("" when the script leaves it blank, as inline rows often do). */
  rawTitle: string;
  /** group= section heading and inline= row key, as TradingView lays inputs out. */
  group?: string;
  inline?: string;
  tooltip?: string;
  /** The default as written, when it is a plain literal; otherwise null (shown, not editable). */
  defval: PineInputValue | null;
  defvalText: string;
  minval?: number;
  maxval?: number;
  step?: number;
  options?: PineInputValue[];
  /** Span of the default in the source, for rewriting. */
  span: { start: number; end: number };
};

export const PINE_SOURCES = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4", "hlcc4", "volume"] as const;
const SOURCE_SET = new Set<string>(PINE_SOURCES);
const NAMED_COLORS: Record<string, string> = {
  "color.aqua": "#00BCD4", "color.black": "#363A45", "color.blue": "#2196F3", "color.fuchsia": "#E040FB", "color.gray": "#787B86",
  "color.green": "#4CAF50", "color.lime": "#00E676", "color.maroon": "#880E4F", "color.navy": "#311B92", "color.olive": "#808000",
  "color.orange": "#FF9800", "color.purple": "#9C27B0", "color.red": "#FF5252", "color.silver": "#B2B5BE", "color.teal": "#00897B",
  "color.white": "#FFFFFF", "color.yellow": "#FFEB3B",
};
const FUNCTIONS: Record<string, PineInputKind> = {
  "input.int": "int", "input.float": "float", "input.bool": "bool", "input.string": "string", "input.text_area": "string",
  "input.source": "source", "input.color": "color", "input.timeframe": "timeframe", "input.session": "session",
  "input.symbol": "symbol", "input.price": "float", "input.time": "other", "input.enum": "other",
};
const V4_TYPES: Record<string, PineInputKind> = {
  "input.integer": "int", "input.float": "float", "input.bool": "bool", "input.string": "string", "input.source": "source",
  "input.resolution": "timeframe", "input.session": "session", "input.symbol": "symbol", "input.color": "color",
};

type Constants = Map<string, PineInputValue>;

/** Opacity byte for a Pine transparency (0 = opaque, 100 = invisible). */
const alphaHex = (transparency: number) => Math.round(((100 - Math.min(100, Math.max(0, transparency))) / 100) * 255).toString(16).padStart(2, "0").toUpperCase();

function literal(text: string, kind: PineInputKind, constants: Constants = new Map()): PineInputValue | null {
  const value = text.trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(value) || /^[+-]?\.\d+$/.test(value)) return Number(value);
  if (value === "true" || value === "false") return value === "true";
  const quoted = /^(["'])((?:\\.|(?!\1).)*)\1$/.exec(value);
  if (quoted) return quoted[2]!.replace(/\\n/g, "\n").replace(/\\(.)/g, "$1");
  if (SOURCE_SET.has(value)) return value;
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return value.toUpperCase();
  if (NAMED_COLORS[value]) return NAMED_COLORS[value]!;
  // color.new(color.blue, 60) / color.new(#2962FF, transparency) / color.rgb(r, g, b[, t])
  const colorNew = /^color\.new\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(value);
  if (colorNew) {
    const base = literal(colorNew[1]!, "color", constants);
    const transparency = literal(colorNew[2]!, "float", constants);
    if (typeof base === "string" && base.startsWith("#") && typeof transparency === "number") return base.slice(0, 7) + alphaHex(transparency);
  }
  const rgb = /^color\.rgb\s*\(([^)]*)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1]!.split(",").map((part) => literal(part, "float", constants));
    if (parts.length >= 3 && parts.every((part) => typeof part === "number")) {
      const [r, g, b, t] = parts as number[];
      return `#${[r!, g!, b!].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}${alphaHex(t ?? 0)}`.toUpperCase();
    }
  }
  if (constants.has(value)) return constants.get(value)!;
  void kind;
  return null;
}

/** Simple constants the script declares (var g_KZ = "Killzones", default_transparency = 60), for groups and defaults. */
function readConstants(code: string): Constants {
  const constants: Constants = new Map();
  const source = code.replace(/\/\/.*$/gm, "");
  for (const match of source.matchAll(/^\s*(?:var\s+|varip\s+|const\s+)?(?:(?:int|float|bool|string|color)\s+)?([A-Za-z_]\w*)\s*=(?!=)\s*(.+?)\s*$/gm)) {
    if (/\binput\b/.test(match[2]!)) continue;
    const value = literal(match[2]!, "other", constants);
    if (value != null) constants.set(match[1]!, value);
  }
  return constants;
}

function inferKind(value: PineInputValue | null, text: string): PineInputKind {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return /\./.test(text) ? "float" : "int";
  if (typeof value === "string") return SOURCE_SET.has(text.trim()) ? "source" : value.startsWith("#") ? "color" : "string";
  return "other";
}

const parsed = new Map<string, PineInput[]>();

/** The script's inputs (cached per code, since the legend asks on every crosshair move). */
export function parsePineInputs(code: string): PineInput[] {
  let inputs = parsed.get(code);
  if (!inputs) {
    inputs = readInputs(code);
    parsed.set(code, inputs);
    while (parsed.size > 32) parsed.delete(parsed.keys().next().value!);
  }
  return inputs;
}

function readInputs(code: string): PineInput[] {
  const constants = readConstants(code);
  const calls = [...Object.keys(FUNCTIONS), "input"].flatMap((name) => findCalls(code, name).map((call) => ({ name, call })));
  calls.sort((left, right) => left.call.start - right.call.start);
  return calls.flatMap(({ name, call }, index): PineInput[] => {
    const args = call.args.map((arg) => {
      const text = code.slice(arg.start, arg.end);
      const named = /^\s*([A-Za-z_]\w*)\s*=(?!=)\s*/.exec(text);
      const lead = text.length - text.trimStart().length;
      return named
        ? { name: named[1]!, text: text.slice(named[0].length).trim(), start: arg.start + named[0].length, end: arg.start + text.trimEnd().length }
        : { name: null, text: text.trim(), start: arg.start + lead, end: arg.start + text.trimEnd().length };
    });
    const positional = args.filter((arg) => arg.name == null);
    const named = (key: string) => args.find((arg) => arg.name === key);
    const defArg = named("defval") ?? positional[0];
    if (!defArg) return [];
    let kind: PineInputKind = FUNCTIONS[name] ?? "other";
    if (name === "input") {
      const type = named("type")?.text ?? (positional[2] && /^input\.\w+$/.test(positional[2].text) ? positional[2].text : undefined);
      kind = type ? V4_TYPES[type] ?? "other" : inferKind(literal(defArg.text, "other", constants), defArg.text);
    }
    const titleText = named("title")?.text ?? (positional[1] && /^["']/.test(positional[1].text) ? positional[1].text : undefined);
    const titleValue = titleText ? literal(titleText, "string", constants) : null;
    const textOf = (key: string) => { const arg = named(key); const value = arg ? literal(arg.text, "string", constants) : null; return typeof value === "string" ? value : undefined; };
    const lineStart = code.lastIndexOf("\n", call.start) + 1;
    const variable = /([A-Za-z_]\w*)\s*:?=\s*$/.exec(code.slice(lineStart, call.start))?.[1];
    const number = (text: string | undefined) => (text != null && /^[+-]?\d*\.?\d+$/.test(text.trim()) ? Number(text) : undefined);
    // input.int/float(defval, title, minval, maxval, step) also take limits by position.
    const byPosition = (slot: number) => (name === "input.int" || name === "input.float") && !/^\[/.test(positional[2]?.text ?? "") ? positional[slot]?.text : undefined;
    const optionsText = named("options")?.text ?? (/^\[/.test(positional[2]?.text ?? "") ? positional[2]!.text : undefined);
    const options = optionsText ? optionsText.replace(/^\[|\]$/g, "").split(",").map((item) => literal(item, kind, constants)).filter((item): item is PineInputValue => item != null) : undefined;
    const rawTitle = typeof titleValue === "string" ? titleValue : "";
    const defval = literal(defArg.text, kind, constants);
    return [{
      key: String(index),
      kind,
      title: rawTitle || variable || `Input ${index + 1}`,
      rawTitle,
      group: textOf("group"),
      inline: textOf("inline"),
      tooltip: textOf("tooltip"),
      // A color default must resolve to a color; anything else stays code.
      defval: kind === "color" && !(typeof defval === "string" && defval.startsWith("#")) ? null : defval,
      defvalText: defArg.text,
      minval: number(named("minval")?.text ?? byPosition(2)),
      maxval: number(named("maxval")?.text ?? byPosition(3)),
      step: number(named("step")?.text ?? byPosition(4)),
      options: options?.length ? options : undefined,
      span: { start: defArg.start, end: defArg.end },
    }];
  });
}

/** The Pine text for a value of the given kind, or null when it is not valid for that kind. */
export function formatPineInput(kind: PineInputKind, value: PineInputValue): string | null {
  switch (kind) {
    case "int": return Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : null;
    case "float": return Number.isFinite(Number(value)) ? String(Number(value)) : null;
    case "bool": return value === true || value === "true" ? "true" : "false";
    case "source": return SOURCE_SET.has(String(value)) ? String(value) : null;
    case "color": return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(String(value)) ? String(value) : null;
    case "string": case "timeframe": case "session": case "symbol": return JSON.stringify(String(value));
    default: return null;
  }
}

/** The code with each overridden input's default replaced by its new value. */
export function applyPineInputs(code: string, values: Record<string, PineInputValue> | undefined): string {
  if (!values || Object.keys(values).length === 0) return code;
  const edits = parsePineInputs(code).flatMap((input) => {
    // Defaults written as expressions stay as the script wrote them.
    if (!(input.key in values) || input.defval == null) return [];
    const text = formatPineInput(input.kind, values[input.key]!);
    return text == null ? [] : [{ ...input.span, text }];
  });
  let result = code;
  for (const edit of edits.sort((left, right) => right.start - left.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}
