import { transpile, compile, Context, rt } from "@nullarch/resin";
import { codeMask, convertPineV4, findCalls, isPineV4 } from "./pine-v4";
import { TIMEFRAME_MS, type Timeframe } from "@/lib/market-data/types";

/** Candle timeframes the data store serves for script feeds, smallest first (calendar months excluded). */
const FEED_TIMEFRAMES = (Object.entries(TIMEFRAME_MS) as [Timeframe, number][]).filter(([, ms]) => ms <= 7 * 86_400_000).sort((a, b) => a[1] - b[1]);
/** The stored timeframe a script timeframe is built from: the same one, else the largest that divides it. */
export function pineFeedTimeframe(ms: number): [Timeframe, number] | null {
  let best: [Timeframe, number] | null = null;
  for (const entry of FEED_TIMEFRAMES) if (entry[1] <= ms && ms % entry[1] === 0) best = entry;
  return best;
}
/** "OANDA:GBPUSD" → "GBPUSD". */
const tickerOf = (symbol: string) => (symbol.split(":").pop() ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Candles as parallel arrays; times are epoch milliseconds. */
export type PineSeriesInput = { time: Float64Array; open: Float64Array; high: Float64Array; low: Float64Array; close: Float64Array; volume: Float64Array };
export type PineDiagnostic = { line: number; message: string };

/** Per-candle colors, or null when the color never changes. Hex, with optional alpha. */
type Colors = (string | null)[] | null;
export type PinePlot = { title: string; style: string; color: string; colors: Colors; linewidth: number; histbase: number; offset: number; forceOverlay: boolean; values: (number | null)[] };
export type PineHline = { title: string | null; price: number | null; color: string; linestyle: string; linewidth: number };
export type PineFillRef = { kind: "plot" | "hline"; index: number };
export type PineFill = { title: string | null; a: PineFillRef; b: PineFillRef; color: string; colors: Colors };
export type PineBackground = { title: string | null; color: string | null; colors: Colors; offset: number; forceOverlay: boolean };
/**
 * One plotshape()/plotchar()/plotarrow() call: what it draws and where it
 * appears. `price` is the series value for location.absolute; `value` is the
 * plotarrow height (its sign gives the direction).
 */
export type PineShape = {
  kind: "shape" | "char" | "arrow";
  title: string | null;
  /** shape.* name, the character for plotchar, or "arrow". */
  style: string;
  location: string;
  size: string;
  text: string | null;
  textcolor: string | null;
  color: string | null;
  colors: Colors;
  /** plotarrow colors for rising / falling values. */
  colorup?: string;
  colordown?: string;
  overlay: boolean;
  points: { index: number; price?: number; value?: number }[];
};
/**
 * A label/line/box/table the script created and did not delete, in its final
 * state. Table cells are kept as `cell:<column>,<row>` text entries.
 */
export type PineDrawing = { kind: "label" | "line" | "box" | "table" | "polyline" | "linefill"; state: Record<string, number | string | null> };
/** barcolor(): recolors the chart's candles. */
export type PineBarColor = { title: string | null; offset: number; color: string | null; colors: Colors };
/** plotcandle()/plotbar(): candles the script draws itself. */
export type PineCandles = { kind: "candle" | "bar"; title: string | null; color: string | null; colors: Colors; wickcolor: string | null; bordercolor: string | null; forceOverlay: boolean; open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[] };
export type PineVisual = { converted?: boolean; overlay: boolean; plots: PinePlot[]; hlines: PineHline[]; fills: PineFill[]; backgrounds: PineBackground[]; shapes: PineShape[]; drawings: PineDrawing[]; barcolors?: PineBarColor[]; candles?: PineCandles[]; skipped: string[] };
/** Candles a script's request.security() needs from outside the chart: another market or a lower timeframe. */
export type PineFeedNeed = { key: string; symbol: string; timeframe: Timeframe; timeframeMs: number };
/** Those candles, keyed like PineFeedNeed.key; `timeframe` is their Pine timeframe ("15", "60", "D"). */
export type PineFeed = { time: number[]; open: number[]; high: number[]; low: number[]; close: number[]; volume: number[]; timeframe: string };
export type PineIndicatorResult = ({ ok: true } & PineVisual) | { ok: false; error: string; diagnostics?: PineDiagnostic[]; needs?: PineFeedNeed[] };

/*
 * The engine records every drawing a script creates but treats delete() and
 * table cells as no-ops. On the chart those matter (killzone scripts delete old
 * boxes; data tables are all cells), so they are recorded on the drawing's state.
 */
type Handle = { state?: Record<string, number | string | null> } | null | undefined;
const drawingApi = rt as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
for (const kind of ["label", "line", "box", "table", "polyline", "linefill"]) {
  if (drawingApi[kind]) drawingApi[kind].delete = (handle: unknown) => { const state = (handle as Handle)?.state; if (state) state.__deleted = 1; };
}
if (drawingApi.table) {
  const setCell = (handle: unknown, column: unknown, row: unknown, text: unknown) => {
    const state = (handle as Handle)?.state;
    if (state && typeof column === "number" && typeof row === "number") state[`cell:${column},${row}`] = text == null ? "" : String(text);
  };
  drawingApi.table.cell = setCell;
  drawingApi.table.cell_set_text = setCell;
  drawingApi.table.clear = (handle: unknown) => {
    const state = (handle as Handle)?.state;
    if (state) for (const key of Object.keys(state)) if (key.startsWith("cell:")) delete state[key];
  };
}
/*
 * The engine treats polyline.new() and linefill.new() as no-ops. They are made
 * real here: each gets a handle in the drawing log (borrowed from label.new,
 * then re-marked with __kind), polylines keep their points as JSON, and a
 * linefill remembers its two lines so it is drawn where they finally are.
 */
type PinePoint = { time?: number | null; index?: number | null; price?: number | null } | null;
type DrawingStateMap = Record<string, number | string | null>;
const linefillLines = new WeakMap<object, [Handle, Handle]>();
const colorValue = (value: unknown) => (typeof value === "string" && value ? value : null);
function borrowHandle(kind: string): { state: DrawingStateMap } | null {
  const handle = drawingApi.label?.new?.(NaN, NaN, "") as { state?: DrawingStateMap } | undefined;
  if (!handle?.state) return null;
  for (const key of Object.keys(handle.state)) delete handle.state[key];
  handle.state.__kind = kind;
  return handle as { state: DrawingStateMap };
}
if (drawingApi.polyline) {
  drawingApi.polyline.new = (points, curved, closed, xloc, lineColor, fillColor, lineStyle, lineWidth) => {
    const handle = borrowHandle("polyline");
    if (!handle) return null;
    const list = Array.isArray(points) ? (points as PinePoint[]) : [];
    const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    handle.state.points = JSON.stringify(list.slice(0, 10_000).map((point) => [finite(point?.index), finite(point?.time), finite(point?.price)]));
    handle.state.curved = curved === true ? 1 : 0;
    handle.state.closed = closed === true ? 1 : 0;
    handle.state.xloc = typeof xloc === "string" ? xloc : "bar_index";
    handle.state.line_color = lineColor === undefined ? "#2962FF" : colorValue(lineColor);
    handle.state.fill_color = colorValue(fillColor);
    handle.state.line_style = typeof lineStyle === "string" ? lineStyle : "solid";
    handle.state.line_width = typeof lineWidth === "number" && Number.isFinite(lineWidth) ? lineWidth : 1;
    return handle;
  };
}
if (drawingApi.linefill) {
  drawingApi.linefill.new = (line1, line2, color) => {
    const handle = borrowHandle("linefill");
    if (!handle) return null;
    handle.state.color = colorValue(color);
    linefillLines.set(handle.state, [line1 as Handle, line2 as Handle]);
    return handle;
  };
  drawingApi.linefill.set_color = (handle, color) => { const state = (handle as Handle)?.state; if (state) state.color = colorValue(color); };
  drawingApi.linefill.get_line1 = (handle) => { const state = (handle as Handle)?.state; return state ? linefillLines.get(state)?.[0] ?? null : null; };
  drawingApi.linefill.get_line2 = (handle) => { const state = (handle as Handle)?.state; return state ? linefillLines.get(state)?.[1] ?? null : null; };
}
/** A linefill drawn from its two lines' final coordinates, or null when either is gone. */
function linefillState(state: DrawingStateMap): DrawingStateMap | null {
  const lines = linefillLines.get(state);
  const a = lines?.[0]?.state, b = lines?.[1]?.state;
  if (!a || !b || a.__deleted || b.__deleted) return null;
  return { color: state.color ?? null, xloc: a.xloc ?? "bar_index", extend: a.extend ?? "none", ax1: a.x1 ?? null, ay1: a.y1 ?? null, ax2: a.x2 ?? null, ay2: a.y2 ?? null, bx1: b.x1 ?? null, by1: b.y1 ?? null, bx2: b.x2 ?? null, by2: b.y2 ?? null };
}
/** The positional order of polyline.new()/linefill.new(), so their named arguments reach the handlers above. */
const DRAWING_PARAMS: Record<string, string[]> = {
  "polyline.new": ["points", "curved", "closed", "xloc", "line_color", "fill_color", "line_style", "line_width", "force_overlay"],
  "linefill.new": ["line1", "line2", "color"],
};
/** Rewrites named arguments of those calls as positional ones (na for the gaps); line numbers are kept. */
export function positionalDrawingArgs(code: string): string {
  for (const [name, params] of Object.entries(DRAWING_PARAMS)) {
    for (const call of findCalls(code, name).reverse()) {
      const args = call.args.map((arg) => code.slice(arg.start, arg.end));
      const named = args.map((arg) => /^\s*([A-Za-z_]\w*)\s*=(?!=)([\s\S]*)$/.exec(arg));
      if (!named.some(Boolean)) continue;
      const slots: string[] = [];
      args.forEach((arg, index) => {
        const match = named[index];
        if (!match) { slots[index] = arg.trim(); return; }
        const slot = params.indexOf(match[1]!);
        if (slot >= 0) slots[slot] = match[2]!.trim();
      });
      const text = Array.from({ length: slots.length }, (_, index) => slots[index] ?? "na").join(", ");
      code = code.slice(0, call.open + 1) + text + code.slice(call.close);
    }
  }
  return code;
}
/*
 * TradingView reads session strings ("1900-0001") and hour/dayofweek… in the
 * exchange's timezone — New York for FX and gold. The engine always uses UTC,
 * which put killzone boxes five hours early, so both are read in New York time
 * unless the script names a timezone.
 */
export const PINE_EXCHANGE_TIMEZONE = "America/New_York";
const zoneFormatters = new Map<string, Intl.DateTimeFormat | null>();
const zoneOffsets = new Map<string, number>();
/** Milliseconds the zone's wall clock is ahead of UTC at `ms` (0 for unknown zones). */
export function pineZoneOffsetMs(ms: number, zone: string): number {
  const fixed = /^(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(zone.trim());
  if (fixed) return (fixed[1] === "-" ? -1 : 1) * (Number(fixed[2]) * 60 + Number(fixed[3] ?? 0)) * 60_000;
  if (/^(?:UTC|GMT|Etc\/UTC)$/i.test(zone.trim())) return 0;
  const hour = Math.floor(ms / 3_600_000);
  const cacheKey = `${zone}|${hour}`;
  const cached = zoneOffsets.get(cacheKey);
  if (cached !== undefined) return cached;
  let formatter = zoneFormatters.get(zone);
  if (formatter === undefined) {
    try { formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }); } catch { formatter = null; }
    zoneFormatters.set(zone, formatter);
  }
  let offset = 0;
  if (formatter) {
    const at = hour * 3_600_000;
    const parts: Record<string, number> = Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, Number(part.value)]));
    const part = (type: string) => parts[type] ?? 0;
    offset = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute")) - at;
  }
  if (zoneOffsets.size > 50_000) zoneOffsets.clear();
  zoneOffsets.set(cacheKey, offset);
  return offset;
}
type TimeFn = (ms: number, timeframe: string | null, session?: string | null, zone?: string | null) => number;
const timeApi = rt.time as unknown as { resolve: TimeFn; resolveClose: TimeFn };
const engineResolve = timeApi.resolve;
const inExchangeSession = (ms: number, session?: string | null, zone?: string | null) =>
  !session || !(ms > 0) || !Number.isNaN(engineResolve(ms + pineZoneOffsetMs(ms, zone || PINE_EXCHANGE_TIMEZONE), "1", session));
/*
 * TradingView's FX/gold trading day runs 17:00–17:00 New York (weeks open
 * Sunday 17:00). The engine cuts days at UTC midnight, so on intraday charts
 * daily/weekly/monthly periods (time("D"), request.security(…, "D"),
 * time_tradingday) are cut at 17:00 New York instead. The trader's own D/W/M
 * chart candles are left as they are.
 */
const TRADING_DAY_ROLL_MS = 7 * 3_600_000;
let tradingDays = true;
const isDayTimeframe = (timeframe: string | null | undefined) => !!timeframe && (/^\d*[DWM]$/.test(timeframe) || (/^\d+$/.test(timeframe) && Number(timeframe) % 1440 === 0));
const tradingDayShift = (ms: number) => pineZoneOffsetMs(ms, PINE_EXCHANGE_TIMEZONE) + TRADING_DAY_ROLL_MS;
for (const name of ["resolve", "resolveClose"] as const) {
  const original = timeApi[name];
  timeApi[name] = (ms, timeframe, session, zone) => {
    if (!inExchangeSession(ms, session, zone)) return NaN;
    const shift = tradingDays && ms > 0 && isDayTimeframe(timeframe) ? tradingDayShift(ms) : 0;
    return original(ms + shift, timeframe) - shift;
  };
}
const datetimeApi = rt.datetime as unknown as Record<string, (ms: number, zone?: string | null) => number>;
for (const name of ["year", "month", "dayofmonth", "dayofweek", "hour", "minute", "second", "weekofyear"]) {
  const original = datetimeApi[name];
  if (original) datetimeApi[name] = (ms, zone) => original(ms, zone == null || zone === "" ? PINE_EXCHANGE_TIMEZONE : zone);
}
const engineTradingDay = datetimeApi.tradingDayStart!;
datetimeApi.tradingDayStart = (ms) => (tradingDays && ms > 0 ? engineTradingDay(ms + tradingDayShift(ms)) : engineTradingDay(ms));
type SecurityRows = { barMap: Int32Array; timeOpen: Float64Array; timeClose: Float64Array };
type ContextInternals = { rawData: { time?: ArrayLike<number> }; securityCache: (SecurityRows | undefined)[]; rebuildSecurityCache(slot: number, timeframe: string): void };
const contextApi = Context.prototype as unknown as ContextInternals;
const engineRebuild = contextApi.rebuildSecurityCache;
contextApi.rebuildSecurityCache = function (this: ContextInternals, slot: number, timeframe: string) {
  const raw = this.rawData, times = raw.time;
  if (!tradingDays || !times || !isDayTimeframe(timeframe)) return engineRebuild.call(this, slot, timeframe);
  this.rawData = { ...raw, time: Array.from(times, (ms) => (ms > 0 ? ms + tradingDayShift(ms) : ms)) };
  try { engineRebuild.call(this, slot, timeframe); } finally { this.rawData = raw; }
  const rows = this.securityCache[slot];
  if (!rows?.barMap || !rows.timeOpen) return;
  // Report each period's real opening time, not the shifted one.
  const seen = new Set<number>();
  for (let index = 0; index < rows.barMap.length; index++) {
    const period = rows.barMap[index]!;
    if (period >= 0 && !seen.has(period)) { seen.add(period); rows.timeOpen[period] = times[index]!; }
  }
  const count = rows.timeOpen.length;
  for (let period = 0; period < count; period++) {
    rows.timeClose[period] = period + 1 < count ? rows.timeOpen[period + 1]! : count > 1 ? rows.timeOpen[period]! + (rows.timeOpen[period]! - rows.timeOpen[period - 1]!) : rows.timeOpen[period]!;
  }
};

const DRAWING_LIMIT_DEFAULT = 50;
/** TradingView keeps the newest N drawings of each kind (indicator(max_lines_count=…), default 50). */
function drawingLimits(code: string): Record<string, number> {
  const read = (name: string) => Math.min(500, Math.max(1, Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(code)?.[1] ?? DRAWING_LIMIT_DEFAULT)));
  return { label: read("max_labels_count"), line: read("max_lines_count"), box: read("max_boxes_count"), polyline: read("max_polylines_count"), linefill: 50, table: 50 };
}
/** chart.fg_color / chart.bg_color are compile-time constants; give them the chart's actual theme. */
function withThemeColors(code: string, theme: "dark" | "light"): string {
  const [fg, bg] = theme === "dark" ? ["#D1D4DC", "#131722"] : ["#131722", "#FFFFFF"];
  return code.replace(/\bchart\.fg_color\b/g, fg).replace(/\bchart\.bg_color\b/g, bg);
}

const MAX_PLOTS = 64;
const MAX_MARKERS = 3_000;
const PALETTE = ["#2962FF", "#FF6D00", "#7B1FA2", "#00A86B"];
const HLINE_DEFAULT = "#787B86";
const FILL_DEFAULT = "#2962FF33";

/** Pine's chart timeframe string ("1", "15", "60", "D", "W", "M") for a candle length. */
export function pineTimeframe(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1440) return String(Math.max(1, minutes));
  if (minutes < 10_080) return minutes === 1440 ? "D" : `${Math.round(minutes / 1440)}D`;
  if (minutes < 40_000) return minutes === 10_080 ? "W" : `${Math.round(minutes / 10_080)}W`;
  const months = Math.max(1, Math.round(minutes / 43_200));
  return months === 1 ? "M" : `${months}M`;
}

/** Checks that apply before compiling: what this chart feed can and cannot supply. */
export function pineChartPrecheck(code: string, chartTimeframeMs?: number): string | null {
  if (code.length < 1 || code.length > 100_000) return "Pine code must contain 1 to 100,000 characters.";
  if (!/^\s*\/\/\s*@version\s*=\s*[56]\s*$/m.test(code)) return "Add //@version=4, 5 or 6 on its own line. Pine versions 1 to 3 are not supported.";
  if (/^\s*strategy\s*\(/m.test(code)) return "This is a strategy script. Run strategies in Strategy Lab; the chart shows indicator() scripts.";
  if (!/^\s*indicator\s*\(/m.test(code)) return "Declare the script with indicator(\"Name\").";
  if (/^\s*import\s+/m.test(code)) return "Imported Pine libraries are not available on the chart.";
  return requestProblem(code, chartTimeframeMs);
}

/** Milliseconds in a Pine timeframe string ("15", "60", "240", "D", "1W", "3M", "30S"), or null. */
export function pineTimeframeMs(value: string): number | null {
  const match = /^(\d*)([SDWM]?)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const count = match[1] ? Number(match[1]) : 1;
  const unit = match[2]!.toUpperCase();
  const minute = 60_000;
  return count * (unit === "S" ? 1000 : unit === "D" ? 1440 * minute : unit === "W" ? 10_080 * minute : unit === "M" ? 43_200 * minute : minute);
}

/**
 * request.security() on the chart's own market at the chart's or a higher
 * timeframe is built from the chart's candles, as TradingView does. Anything
 * the chart has no data for — another market, a lower timeframe, financials —
 * would silently read the chart's own candles, so it is refused instead.
 */
function requestProblem(code: string, chartTimeframeMs?: number): string | null {
  const mask = codeMask(code);
  for (const match of code.matchAll(/\brequest\s*\.\s*(\w+)/g)) {
    if (!mask[match.index!]) continue;
    if (match[1] !== "security") return `request.${match[1]}() needs data the chart does not have. request.security() is available, for this market or another one.`;
  }
  const own = (symbol: string): boolean => {
    const text = symbol.trim();
    if (/^(syminfo\.(tickerid|ticker)|""|'')$/.test(text)) return true;
    if (/^ticker\.(new|modify)\s*\(\s*(syminfo\.(prefix|tickerid|ticker))/.test(text)) return true;
    // A variable set to the chart's own ticker, or a symbol input left empty.
    const assigned = new RegExp(`^\\s*(?:var\\s+)?(?:string\\s+)?${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(.+)$`, "m").exec(code)?.[1];
    if (!assigned || assigned.trim() === text) return false;
    const input = /^input(?:\.symbol)?\s*\(\s*(?:defval\s*=\s*)?([^,)]+)/.exec(assigned.trim());
    return own(input ? input[1]! : assigned);
  };
  // A fixed market name ("GBPUSD", "OANDA:GBPUSD", or a symbol input's default) can be loaded.
  const fixed = (symbol: string): boolean => {
    const text = symbol.trim();
    if (/^["'][^"']+["']$/.test(text)) return true;
    const assigned = new RegExp(`^\\s*(?:var\\s+)?(?:string\\s+)?${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(.+)$`, "m").exec(code)?.[1];
    if (!assigned || assigned.trim() === text) return false;
    const input = /^input(?:\.symbol)?\s*\(\s*(?:defval\s*=\s*)?([^,)]+)/.exec(assigned.trim());
    return fixed(input ? input[1]! : assigned);
  };
  for (const call of findCalls(code, "request.security")) {
    const args = call.args.map((arg) => code.slice(arg.start, arg.end).trim().replace(/^(symbol|timeframe|expression)\s*=\s*/, ""));
    const symbol = args[0] ?? "";
    if (!own(symbol) && !fixed(symbol)) return `request.security() needs a fixed market name such as "GBPUSD" (got ${symbol.slice(0, 40)}).`;
    const timeframe = /^["']([^"']*)["']$/.exec(args[1] ?? "")?.[1];
    const ms = timeframe ? pineTimeframeMs(timeframe) : null;
    if (ms != null && ms < 60_000) return `request.security() asks for the ${timeframe} timeframe. The smallest timeframe available is 1 minute.`;
  }
  void chartTimeframeMs;
  return null;
}

/** One color for the whole series when it never changes, so it travels cheaply. */
function compact(colors: (string | null)[] | null | undefined, fallback: string | null): { color: string | null; colors: Colors } {
  if (!colors || colors.length === 0) return { color: fallback, colors: null };
  const first = colors[0] ?? null;
  if (colors.every((value) => value === first)) return { color: first, colors: null };
  return { color: colors.find((value) => value != null) ?? fallback, colors };
}

/**
 * The compiler keeps only a shown/hidden flag per candle for plotshape() and
 * plotchar(). For location.absolute the shape sits at the series value, so the
 * compiled code is patched to also keep the value it flags:
 *   rt.vizFlag(X)  →  rt.vizFlag((($.__ftlShapeValues ||= {})[slot] ||= [])[$.idx] = (X))
 */
function keepShapeValues(code: string, slots: Set<number>): string {
  if (slots.size === 0) return code;
  const pattern = /\$\.vizSeries\[(\d+)\]\[\$\.idx\] = rt\.vizFlag\(/g;
  let output = "";
  let last = 0;
  for (const match of code.matchAll(pattern)) {
    const slot = Number(match[1]);
    if (!slots.has(slot)) continue;
    const open = match.index! + match[0].length;
    let depth = 1;
    let index = open;
    let quote: string | null = null;
    for (; index < code.length && depth > 0; index++) {
      const char = code[index];
      if (quote) { if (char === "\\") index++; else if (char === quote) quote = null; continue; }
      if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "(") depth++;
      else if (char === ")") depth--;
    }
    if (depth !== 0) return code;
    const close = index - 1;
    output += code.slice(last, open) + `(($.__ftlShapeValues ||= {})[${slot}] ||= [])[$.idx] = (` + code.slice(open, close) + ")";
    last = close;
  }
  return output + code.slice(last);
}

/**
 * hline() prices the compiler leaves unresolved (negative numbers, inputs and
 * simple constants), read from the script in declaration order.
 */
export function hlinePricesFromSource(code: string): (number | null)[] {
  const source = code.replace(/\/\/.*$/gm, "");
  const constants = new Map<string, number>();
  const assignment = /^\s*(?:var\s+|const\s+)?(?:(?:int|float|simple\s+\w+)\s+)?([A-Za-z_]\w*)\s*:?=\s*(.+)$/gm;
  for (const match of source.matchAll(assignment)) {
    const value = valueOf(match[2]!, constants);
    if (value != null) constants.set(match[1]!, value);
  }
  return [...source.matchAll(/\bhline\s*\(\s*(?:price\s*=\s*)?([^,()]+(?:\([^()]*\))?[^,()]*)/g)].map((match) => valueOf(match[1]!, constants));
}
function valueOf(expression: string, constants: Map<string, number>): number | null {
  const text = expression.trim();
  const literal = /^([+-]?\s*\d+(?:\.\d+)?)$/.exec(text);
  if (literal) return Number(literal[1]!.replace(/\s+/g, ""));
  const input = /^input(?:\.(?:int|float|price))?\s*\(\s*(?:defval\s*=\s*)?([+-]?\s*\d+(?:\.\d+)?)/.exec(text);
  if (input) return Number(input[1]!.replace(/\s+/g, ""));
  const negated = /^-\s*([A-Za-z_]\w*)$/.exec(text);
  if (negated && constants.has(negated[1]!)) return -constants.get(negated[1]!)!;
  return constants.get(text) ?? null;
}

type Compiled = { result: Extract<ReturnType<typeof transpile>, { ok: true }>; run: ReturnType<typeof compile> };
const compiled = new Map<string, Compiled | PineIndicatorResult>();

/**
 * Compiles (cached per script, symbol and timeframe) and runs a Pine indicator
 * over the given candles, returning what it draws: plots in their styles,
 * horizontal levels, fills, background colors and markers.
 */
export function runPineIndicator(code: string, data: PineSeriesInput, options: { symbol: string; timeframeMs: number; precision: number; theme?: "dark" | "light"; feeds?: Record<string, PineFeed> }): PineIndicatorResult {
  code = withThemeColors(code, options.theme ?? "dark");
  // Version 4 scripts are converted to v5 first, the way TradingView's converter does.
  const converted = isPineV4(code);
  if (converted) code = convertPineV4(code);
  const problem = pineChartPrecheck(code, options.timeframeMs);
  if (problem) return { ok: false, error: problem };
  code = positionalDrawingArgs(code);
  if (data.close.length < 1) return { ok: false, error: "No candles to calculate on yet." };
  const priceScale = 10 ** Math.max(0, Math.min(8, Math.round(options.precision)));
  const key = JSON.stringify([code, options.symbol, options.timeframeMs, priceScale]);
  let entry = compiled.get(key);
  if (!entry) {
    const result = transpile(code, {
      chartTf: pineTimeframe(options.timeframeMs),
      syminfo: { ticker: options.symbol, prefix: "FTL", mintick: 1 / priceScale, minmove: 1, pricescale: priceScale, pointvalue: 1, type: options.symbol === "XAUUSD" ? "cfd" : "forex", timezone: PINE_EXCHANGE_TIMEZONE },
      strategy: { initial_capital: 10_000 },
    });
    entry = result.ok
      ? { result, run: compile(keepShapeValues(result.code, new Set([...result.viz.shapes, ...result.viz.chars].filter((shape: { location: string }) => shape.location === "absolute").map((shape: { conditionSlot: number }) => shape.conditionSlot)))) }
      : { ok: false, error: "Fix the Pine script errors.", diagnostics: result.errors.map((message: string) => ({ line: Number(/\(L(\d+):\d+\)/.exec(message)?.[1] ?? 1), message })) };
    compiled.set(key, entry);
    while (compiled.size > 16) compiled.delete(compiled.keys().next().value!);
  }
  if ("ok" in entry) return entry;
  const { result, run } = entry;
  // request.security() on another market, or below the chart's timeframe, reads candles loaded for it.
  const symbols = (result.securitySymbols ?? []) as (string | null)[];
  const needs = new Map<string, PineFeedNeed>();
  const fed = new Set<number>();
  (result.securityTfs as string[] | undefined ?? []).forEach((tf, slot) => {
    const symbol = symbols[slot];
    if (!symbol) return;
    const ticker = tickerOf(symbol);
    const ms = pineTimeframeMs(tf) ?? options.timeframeMs;
    if (ticker === options.symbol && ms >= options.timeframeMs) return;
    const stored = pineFeedTimeframe(ms);
    if (!stored) return;
    const key = `${symbol}:${tf}`;
    fed.add(slot);
    if (!needs.has(key)) needs.set(key, { key, symbol: ticker, timeframe: stored[0], timeframeMs: stored[1] });
  });
  const missing = [...needs.values()].filter((need) => !options.feeds?.[need.key]);
  if (missing.length) return { ok: false, error: `Loading ${missing.map((need) => `${need.symbol} ${need.timeframe}`).join(", ")} for request.security()…`, needs: [...needs.values()] };
  const series = {
    open: Array.from(data.open), high: Array.from(data.high), low: Array.from(data.low),
    close: Array.from(data.close), volume: Array.from(data.volume), time: Array.from(data.time),
  };
  try {
    tradingDays = options.timeframeMs < 86_400_000;
    const security = needs.size ? Object.fromEntries([...needs.keys()].map((key) => [key, options.feeds![key]!])) : undefined;
    const ctx = Context.from(result, series, security ? { security } : {});
    // Requests with a fixed timeframe are built with the context; rebuild their days on the trading day.
    if (tradingDays) (result.securityTfs as readonly string[] | undefined)?.forEach((tf, slot) => { if (isDayTimeframe(tf) && !fed.has(slot)) (ctx as unknown as ContextInternals).rebuildSecurityCache(slot, tf); });
    const bar = run(ctx);
    for (let index = 0; index < ctx.barCount; index++) { ctx.advance(); bar(); }
    if (ctx.plots.length > MAX_PLOTS) return { ok: false, error: `Indicators can draw at most ${MAX_PLOTS} plots.` };
    const viz = result.viz;
    const colorsOf = (slot: number | null) => (slot !== null ? ctx.plotColors[slot] : null);

    const plots: PinePlot[] = ctx.plots.map((plot: { toArray(): number[] }, index: number) => {
      const meta = viz.plots[index];
      const { color, colors } = compact(colorsOf(meta?.colorSlot ?? null), meta?.color ?? null);
      return {
        title: meta?.title ?? `Plot ${index + 1}`,
        style: meta?.style ?? "line",
        color: color ?? PALETTE[index % PALETTE.length]!,
        colors,
        linewidth: meta?.linewidth ?? 1,
        histbase: meta?.histbase ?? 0,
        offset: meta?.offset ?? 0,
        forceOverlay: Boolean(meta?.forceOverlay),
        values: plot.toArray().map((value) => (Number.isFinite(value) ? value : null)),
      };
    });
    // Kept in declaration order: fill() refers to levels by position.
    const sourcePrices = hlinePricesFromSource(code);
    const hlines: PineHline[] = viz.hlines.map((line: { title: string | null; price: number | null; color: string | null; linestyle: string; linewidth: number }, index: number) => {
      const price = line.price != null && Number.isFinite(line.price) ? line.price : sourcePrices[index] ?? null;
      return { title: line.title, price, color: line.color ?? HLINE_DEFAULT, linestyle: line.linestyle, linewidth: line.linewidth };
    });
    const fills: PineFill[] = viz.fills.flatMap((fill: { title: string | null; a: PineFillRef | null; b: PineFillRef | null; color: string | null; colorSlot: number | null }) => {
      if (!fill.a || !fill.b) return [];
      const { color, colors } = compact(colorsOf(fill.colorSlot), fill.color);
      return [{ title: fill.title, a: fill.a, b: fill.b, color: color ?? FILL_DEFAULT, colors }];
    });
    const backgrounds: PineBackground[] = viz.bgcolors.map((bg: { title: string | null; color: string | null; colorSlot: number | null; offset: number; forceOverlay: boolean }) => {
      const { color, colors } = compact(colorsOf(bg.colorSlot), bg.color);
      return { title: bg.title, color, colors, offset: bg.offset, forceOverlay: bg.forceOverlay };
    });

    const shapes: PineShape[] = [];
    const conditionOf = (slot: number) => ctx.vizSeries[slot] ?? [];
    const captured = (ctx as unknown as { __ftlShapeValues?: Record<number, unknown[]> }).__ftlShapeValues ?? {};
    const inRange = (index: number) => index >= 0 && index < ctx.barCount;
    type Marked = { style?: string; char?: string; title: string | null; location: string; size: string; text: string | null; textcolor: string | null; color: string | null; colorSlot: number | null; conditionSlot: number; offset: number; forceOverlay: boolean };
    const collect = (kind: "shape" | "char", item: Marked) => {
      const { color, colors } = compact(colorsOf(item.colorSlot), item.color);
      const values = captured[item.conditionSlot];
      const points: PineShape["points"] = [];
      conditionOf(item.conditionSlot).forEach((flag, index) => {
        if (flag !== 1 || !inRange(index + item.offset)) return;
        const raw = values?.[index];
        points.push({ index: index + item.offset, ...(typeof raw === "number" && Number.isFinite(raw) ? { price: raw } : {}) });
      });
      shapes.push({ kind, title: item.title, style: kind === "char" ? item.char ?? "★" : item.style ?? "xcross", location: item.location, size: item.size, text: item.text, textcolor: item.textcolor, color: color ?? (colors ? null : PALETTE[0]!), colors, overlay: viz.overlay || item.forceOverlay, points: points.slice(-MAX_MARKERS) });
    };
    for (const shape of viz.shapes as Marked[]) collect("shape", shape);
    for (const char of viz.chars as Marked[]) collect("char", char);
    for (const arrow of viz.arrows as { title: string | null; colorup: string | null; colordown: string | null; seriesSlot: number; offset: number; forceOverlay: boolean }[]) {
      const points: PineShape["points"] = [];
      conditionOf(arrow.seriesSlot).forEach((value, index) => {
        if (Number.isFinite(value) && value !== 0 && inRange(index + arrow.offset)) points.push({ index: index + arrow.offset, value });
      });
      shapes.push({ kind: "arrow", title: arrow.title, style: "arrow", location: "bar", size: "auto", text: null, textcolor: null, color: null, colors: null, colorup: arrow.colorup ?? "#4CAF50", colordown: arrow.colordown ?? "#FF5252", overlay: viz.overlay || arrow.forceOverlay, points: points.slice(-MAX_MARKERS) });
    }

    const skipped: string[] = [];
    const barcolors: PineBarColor[] = viz.barcolors.map((bar: { title: string | null; color: string | null; colorSlot: number | null; offset: number }) => {
      const { color, colors } = compact(colorsOf(bar.colorSlot), bar.color);
      return { title: bar.title, offset: bar.offset, color, colors };
    });
    const seriesOf = (slot: number) => Array.from((ctx.vizSeries[slot] ?? []) as ArrayLike<number>, (value) => (Number.isFinite(value) ? value : null));
    type CandleMeta = { title: string | null; color: string | null; colorSlot: number | null; wickcolor: string | null; bordercolor: string | null; forceOverlay: boolean; openSlot: number; highSlot: number; lowSlot: number; closeSlot: number };
    const candleSets: ["candle" | "bar", CandleMeta][] = [...(viz.candles as CandleMeta[]).map((item) => ["candle", item] as ["candle", CandleMeta]), ...(viz.plotbars as CandleMeta[]).map((item) => ["bar", item] as ["bar", CandleMeta])];
    const candles: PineCandles[] = candleSets.map(([kind, item]) => {
      const { color, colors } = compact(colorsOf(item.colorSlot), item.color);
      return { kind, title: item.title, color: color ?? (colors ? null : "#2962FF"), colors, wickcolor: item.wickcolor, bordercolor: item.bordercolor, forceOverlay: Boolean(item.forceOverlay), open: seriesOf(item.openSlot), high: seriesOf(item.highSlot), low: seriesOf(item.lowSlot), close: seriesOf(item.closeSlot) };
    });

    // Drawings still alive at the end, newest N per kind like TradingView's garbage collection.
    const limits = drawingLimits(code);
    const kept: Record<string, number> = {};
    const drawings: PineDrawing[] = [];
    for (let index = ctx.drawingLog.length - 1; index >= 0; index--) {
      const record = ctx.drawingLog[index]!;
      const kind = typeof record.state.__kind === "string" ? record.state.__kind : record.kind;
      if (!(kind in limits) || record.state.__deleted) continue;
      kept[kind] = (kept[kind] ?? 0) + 1;
      if (kept[kind]! > limits[kind]!) continue;
      const state = kind === "linefill" ? linefillState(record.state) : { ...record.state };
      if (state) drawings.push({ kind: kind as PineDrawing["kind"], state });
    }
    drawings.reverse();

    return { ok: true, converted, overlay: Boolean(viz.overlay), plots, hlines, fills, backgrounds, shapes, drawings, barcolors, candles, skipped };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The script stopped with an error." };
  }
}

/**
 * The settings dialog's "Indicator timeframe": the script runs on candles of a
 * higher timeframe built from the chart's own, and what it draws is laid back
 * over the chart's candles — each chart candle shows the value of the
 * higher-timeframe candle it belongs to, the forming one included, and markers
 * sit on the last chart candle of their period. The chart's timeframe or a
 * lower one runs the script as it is.
 */
export function runPineIndicatorOn(timeframe: string | undefined, code: string, data: PineSeriesInput, options: { symbol: string; timeframeMs: number; precision: number; theme?: "dark" | "light"; feeds?: Record<string, PineFeed> }): PineIndicatorResult {
  const targetMs = timeframe ? pineTimeframeMs(timeframe) : null;
  if (!timeframe || !targetMs || targetMs <= options.timeframeMs) return runPineIndicator(code, data, options);
  const count = data.time.length;
  tradingDays = options.timeframeMs < 86_400_000;
  const group = new Int32Array(count);
  const last: number[] = [];
  const time: number[] = [], open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = [];
  let key = NaN;
  for (let index = 0; index < count; index++) {
    const at = data.time[index]!;
    const start = timeApi.resolve(at, timeframe);
    const period = Number.isFinite(start) ? start : at;
    if (index === 0 || period !== key) {
      key = period;
      time.push(period); open.push(data.open[index]!); high.push(data.high[index]!); low.push(data.low[index]!); close.push(data.close[index]!); volume.push(data.volume[index]!);
      last.push(index);
    } else {
      const bar = time.length - 1;
      high[bar] = Math.max(high[bar]!, data.high[index]!); low[bar] = Math.min(low[bar]!, data.low[index]!);
      close[bar] = data.close[index]!; volume[bar] = volume[bar]! + data.volume[index]!;
      last[bar] = index;
    }
    group[index] = time.length - 1;
  }
  const result = runPineIndicator(code, {
    time: Float64Array.from(time), open: Float64Array.from(open), high: Float64Array.from(high),
    low: Float64Array.from(low), close: Float64Array.from(close), volume: Float64Array.from(volume),
  }, { ...options, timeframeMs: targetMs });
  if (!result.ok) return result;
  const spread = <T>(values: T[]): T[] => Array.from(group, (bar) => values[bar] as T);
  const spreadColors = (colors: Colors): Colors => (colors ? spread(colors) : null);
  const toChart = (bar: number) => last[Math.max(0, Math.min(last.length - 1, Math.round(bar)))] ?? bar;
  return {
    ...result,
    plots: result.plots.map((plot) => ({ ...plot, values: spread(plot.values), colors: spreadColors(plot.colors) })),
    fills: result.fills.map((fill) => ({ ...fill, colors: spreadColors(fill.colors) })),
    backgrounds: result.backgrounds.map((bg) => ({ ...bg, colors: spreadColors(bg.colors) })),
    barcolors: result.barcolors?.map((bar) => ({ ...bar, colors: spreadColors(bar.colors) })),
    candles: result.candles?.map((item) => ({ ...item, colors: spreadColors(item.colors), open: spread(item.open), high: spread(item.high), low: spread(item.low), close: spread(item.close) })),
    shapes: result.shapes.map((shape) => ({ ...shape, colors: spreadColors(shape.colors), points: shape.points.map((point) => ({ ...point, index: toChart(point.index) })) })),
    drawings: result.drawings.map((drawing) => {
      if (drawing.state.xloc === "bar_time" || drawing.kind === "table") return drawing;
      const state = { ...drawing.state };
      for (const name of ["x", "x1", "x2", "left", "right", "ax1", "ax2", "bx1", "bx2"]) if (typeof state[name] === "number") state[name] = toChart(state[name] as number);
      if (typeof state.points === "string") state.points = JSON.stringify((JSON.parse(state.points) as (number | null)[][]).map(([index, time, price]) => [index == null ? null : toChart(index), time, price]));
      return { ...drawing, state };
    }),
  };
}
