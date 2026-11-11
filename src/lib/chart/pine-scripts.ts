import { PINE_LEGACY_RESULTS_KEY, setPineResultsCache } from "./pine-results";
import { pineSyncIdle, sendPine } from "./pine-sync";

/** Browser storage, used only while signed out; moved into the account on the next signed-in visit. */
export const PINE_SCRIPTS_KEY = "forextestlab:pine-scripts:v1";
export const PINE_SCRIPTS_CHANGED = "forextestlab:pine-scripts-changed";
/** The workspace rail asks the focused chart to open or close its Pine Editor. */
export const PINE_EDITOR_TOGGLE = "forextestlab:pine-editor-toggle";
/** The focused chart reports whether its Pine Editor is open (detail: boolean). */
export const PINE_EDITOR_STATE = "forextestlab:pine-editor-state";
export type PineScript = { id: string; name: string; code: string; updatedAt: number };

/** Style tab overrides, keyed by each plot's / hline's position in the script. */
/** Replacement for each of an element's colors ("Color 0", "Color 1", …), keyed by the script's color (upper-case hex). */
export type PineColorMap = Record<string, string>;
export type PinePlotStyle = { visible?: boolean; colors?: PineColorMap; linewidth?: number; /** Earlier single-color override. */ color?: string };
export type PineStyle = {
  plots?: Record<string, PinePlotStyle>;
  shapes?: Record<string, { visible?: boolean; colors?: PineColorMap; location?: string }>;
  hlines?: Record<string, { visible?: boolean; color?: string }>;
  fillItems?: Record<string, { visible?: boolean; colors?: PineColorMap }>;
  backgroundItems?: Record<string, { visible?: boolean; colors?: PineColorMap }>;
  /** Output values: decimals for values (null = chart default), price-scale labels, status-line values. */
  precision?: number | null;
  priceLabels?: boolean;
  statusValues?: boolean;
  /** Input values after the name in the legend. */
  inputsInStatus?: boolean;
  /** label/line/box/table drawings. */
  drawings?: boolean;
  /** Earlier all-or-nothing toggles. */
  fills?: boolean;
  backgrounds?: boolean;
  markers?: boolean;
  /** barcolor() candle colors. */
  barColors?: boolean;
  /** plotcandle()/plotbar() candles, by position. */
  candles?: Record<string, { visible?: boolean }>;
};

/** The script's color with the user's replacement applied, keeping the script's transparency. */
export function remapPineColor(color: string | null | undefined, map: PineColorMap | undefined): string | null {
  if (!color) return null;
  const replacement = map?.[color.toUpperCase()];
  if (!replacement) return color;
  const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(color)?.[1];
  return alpha && /^#[0-9a-f]{6}$/i.test(replacement) ? replacement + alpha : replacement;
}

/** The distinct colors an element uses, in order of first appearance — its "Color 0", "Color 1", … */
export function distinctPineColors(item: { color: string | null; colors: (string | null)[] | null }, limit = 8): string[] {
  const seen: string[] = [];
  for (const color of item.colors ?? [item.color]) {
    if (!color) continue;
    const key = color.toUpperCase();
    if (!seen.includes(key)) seen.push(key);
    if (seen.length >= limit) break;
  }
  return seen;
}
export type PineInputSetting = number | boolean | string;

/** A Pine script placed on a chart. The code is copied so the plot survives the saved script being edited or deleted. */
export type PineChartIndicator = {
  id: string; scriptId: string | null; name: string; code: string; visible: boolean;
  /** Inputs tab values, keyed by the input's position (see parsePineInputs). */
  inputs?: Record<string, PineInputSetting>;
  style?: PineStyle;
  /** Settings → Indicator timeframe ("240", "D"…); unset runs on the chart's timeframe. */
  timeframe?: string;
};

export const PINE_INDICATOR_TEMPLATE = `//@version=6
indicator("My script", overlay=true)

length = input.int(20, "Length")
basis = ta.sma(close, length)

plot(basis, "Basis", color=color.blue, linewidth=2)
`;

const isScript = (item: unknown): item is PineScript => {
  const value = item as PineScript | null;
  return Boolean(value && typeof value.id === "string" && typeof value.name === "string" && typeof value.code === "string");
};

function readLocal(): PineScript[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PINE_SCRIPTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(isScript) : [];
  } catch { return []; }
}

/*
 * Saved scripts live in the account (/api/pine-scripts). This module keeps them in memory for the page.
 * Signed out (sample mode) they stay in this browser and move into the account at the next signed-in visit.
 */
let cache: PineScript[] = [];
let mode: "loading" | "cloud" | "local" = "loading";
let loading: Promise<PineScript[]> | null = null;
let edits = 0;
const notify = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(PINE_SCRIPTS_CHANGED)); };

/** True once the account's scripts (or, signed out, this browser's) have been read. */
export function pineScriptsLoaded(): boolean { return mode !== "loading"; }

export function readPineScripts(): PineScript[] {
  if (mode === "local") return readLocal();
  if (mode === "loading") void loadPineScripts();
  return cache.slice();
}

async function importLocalScripts(): Promise<void> {
  const scripts = readLocal();
  if (!scripts.length) return;
  let results: unknown = {};
  try { results = JSON.parse(localStorage.getItem(PINE_LEGACY_RESULTS_KEY) ?? "{}"); } catch { /* scripts still move */ }
  if (await sendPine("PUT", { action: "import", scripts, results })) {
    localStorage.removeItem(PINE_SCRIPTS_KEY);
    localStorage.removeItem(PINE_LEGACY_RESULTS_KEY);
  }
}

/** Reads the account's scripts; `refresh` reads them again (another tab or device may have changed them). */
export function loadPineScripts(refresh = false): Promise<PineScript[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  if (refresh && loading && mode !== "loading") loading = null;
  loading ??= (async () => {
    try {
      await pineSyncIdle();
      const edited = edits;
      const response = await fetch("/api/pine-scripts", { cache: "no-store" });
      if (response.status === 401) { mode = "local"; notify(); return readLocal(); }
      if (readLocal().length) {
        await importLocalScripts();
        loading = null;
        return loadPineScripts();
      }
      // A save made while this was loading is newer than the answer; keep it.
      if (edited !== edits) { loading = null; return loadPineScripts(); }
      const body = await response.json() as { ok?: boolean; scripts?: unknown[]; results?: Record<string, unknown> };
      if (!response.ok || !body.ok) throw new Error("load failed");
      cache = (body.scripts ?? []).filter(isScript);
      setPineResultsCache(body.results ?? {});
      mode = "cloud";
      notify();
    } catch { loading = null; }
    return cache.slice();
  })();
  return loading;
}

/** Saves to the account; resolves false when the account could not be reached. */
export function savePineScript(script: PineScript): Promise<boolean> {
  if (mode === "local") {
    try { localStorage.setItem(PINE_SCRIPTS_KEY, JSON.stringify([script, ...readLocal().filter(item => item.id !== script.id)])); } catch { return Promise.resolve(false); }
    notify();
    return Promise.resolve(true);
  }
  const existed = cache.some(item => item.id === script.id);
  cache = [script, ...cache.filter(item => item.id !== script.id)];
  edits += 1;
  notify();
  return sendPine("PUT", { action: "save", script: { id: script.id, name: script.name, code: script.code } }).then(ok => {
    // A new script the account refused (the plan's script limit) is taken back off the list.
    if (!ok && !existed) { cache = cache.filter(item => item.id !== script.id); notify(); }
    return ok;
  });
}

export function deletePineScript(id: string): Promise<boolean> {
  if (mode === "local") {
    try { localStorage.setItem(PINE_SCRIPTS_KEY, JSON.stringify(readLocal().filter(item => item.id !== id))); } catch { /* nothing saved */ }
    notify();
    return Promise.resolve(true);
  }
  cache = cache.filter(item => item.id !== id);
  edits += 1;
  notify();
  return sendPine("DELETE", undefined, `?id=${encodeURIComponent(id)}`);
}

if (typeof window !== "undefined") {
  // Pick up changes made in another tab or on another device when the user comes back.
  window.addEventListener("focus", () => { if (mode === "cloud") void loadPineScripts(true); });
}

/** True for a strategy() script, false for an indicator. */
export function isPineStrategy(code: string): boolean {
  return /^\s*strategy\s*\(/m.test(code);
}

export const PINE_STRATEGY_TEMPLATE = `//@version=6
strategy("My strategy", overlay=true, initial_capital=10000, default_qty_type=strategy.fixed, default_qty_value=10000, margin_long=1, margin_short=1)
fast = ta.ema(close, 9)
slow = ta.ema(close, 21)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.entry("Short", strategy.short)
plot(fast, "Fast EMA", color=color.blue)
plot(slow, "Slow EMA", color=color.orange)
`;

/** The script with its indicator("…")/strategy("…") title replaced by `name`. */
export function withPineTitle(code: string, name: string): string {
  return code.replace(/^(\s*(?:indicator|strategy|study)\s*\(\s*(?:title\s*=\s*)?)(["'])[^"'\n]*\2/m, (_, start: string) => `${start}${JSON.stringify(name.replace(/["\\\n]/g, ""))}`);
}

/** The title declared in indicator("…") or strategy("…"), if any. */
export function pineDeclaredName(code: string): string | null {
  return /^\s*(?:indicator|strategy|study)\s*\(\s*(?:title\s*=\s*)?["']([^"']{1,80})["']/m.exec(code)?.[1]?.trim() || null;
}

/** What TradingView's legend shows for a script: its shorttitle, else its title. */
export function pineLegendTitle(code: string): string | null {
  const call = /^\s*(?:indicator|study)\s*\(([^\n]*)/m.exec(code)?.[1];
  if (!call) return null;
  const named = /\bshorttitle\s*=\s*["']([^"']{1,60})["']/.exec(call)?.[1];
  if (named) return named.trim();
  // indicator("Title", "Short", …): a second plain string is the short title.
  const positional = /^\s*["'][^"']*["']\s*,\s*["']([^"']{1,60})["']/.exec(call)?.[1];
  return positional?.trim() || pineDeclaredName(code);
}

export function hydratePineIndicator(value: unknown): PineChartIndicator | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.code !== "string" || item.code.length > 100_000) return null;
  const inputs = item.inputs && typeof item.inputs === "object" && !Array.isArray(item.inputs)
    ? Object.fromEntries(Object.entries(item.inputs as Record<string, unknown>).filter((entry): entry is [string, PineInputSetting] => ["number", "boolean", "string"].includes(typeof entry[1])))
    : undefined;
  const style = item.style && typeof item.style === "object" && !Array.isArray(item.style) ? item.style as PineStyle : undefined;
  return { id: item.id, scriptId: typeof item.scriptId === "string" ? item.scriptId : null, name: item.name.slice(0, 80), code: item.code, visible: item.visible !== false, ...(inputs ? { inputs } : {}), ...(style ? { style } : {}), ...(typeof item.timeframe === "string" && /^\d{0,4}[SDWM]?$/.test(item.timeframe) && item.timeframe ? { timeframe: item.timeframe } : {}) };
}
