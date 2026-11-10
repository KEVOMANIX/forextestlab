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
  /** label/line/box/table drawings. */
  drawings?: boolean;
  /** Earlier all-or-nothing toggles. */
  fills?: boolean;
  backgrounds?: boolean;
  markers?: boolean;
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
};

export const PINE_INDICATOR_TEMPLATE = `//@version=6
indicator("My script", overlay=true)

length = input.int(20, "Length")
basis = ta.sma(close, length)

plot(basis, "Basis", color=color.blue, linewidth=2)
`;

export function readPineScripts(): PineScript[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PINE_SCRIPTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is PineScript => Boolean(item && typeof item.id === "string" && typeof item.name === "string" && typeof item.code === "string")) : [];
  } catch { return []; }
}

export function savePineScript(script: PineScript): void {
  const scripts = readPineScripts().filter(item => item.id !== script.id);
  localStorage.setItem(PINE_SCRIPTS_KEY, JSON.stringify([script, ...scripts]));
  window.dispatchEvent(new Event(PINE_SCRIPTS_CHANGED));
}

/** The title declared in indicator("…") or strategy("…"), if any. */
export function pineDeclaredName(code: string): string | null {
  return /^\s*(?:indicator|strategy)\s*\(\s*(?:title\s*=\s*)?"([^"]{1,80})"/m.exec(code)?.[1]?.trim() || null;
}

export function hydratePineIndicator(value: unknown): PineChartIndicator | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.code !== "string" || item.code.length > 100_000) return null;
  const inputs = item.inputs && typeof item.inputs === "object" && !Array.isArray(item.inputs)
    ? Object.fromEntries(Object.entries(item.inputs as Record<string, unknown>).filter((entry): entry is [string, PineInputSetting] => ["number", "boolean", "string"].includes(typeof entry[1])))
    : undefined;
  const style = item.style && typeof item.style === "object" && !Array.isArray(item.style) ? item.style as PineStyle : undefined;
  return { id: item.id, scriptId: typeof item.scriptId === "string" ? item.scriptId : null, name: item.name.slice(0, 80), code: item.code, visible: item.visible !== false, ...(inputs ? { inputs } : {}), ...(style ? { style } : {}) };
}
