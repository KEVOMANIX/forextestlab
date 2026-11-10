export const PINE_SCRIPTS_KEY = "forextestlab:pine-scripts:v1";
export const PINE_SCRIPTS_CHANGED = "forextestlab:pine-scripts-changed";
export type PineScript = { id: string; name: string; code: string; updatedAt: number };

/** A Pine script placed on a chart. The code is copied so the plot survives the saved script being edited or deleted. */
export type PineChartIndicator = { id: string; scriptId: string | null; name: string; code: string; visible: boolean };

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
  if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.code !== "string" || item.code.length > 20_000) return null;
  return { id: item.id, scriptId: typeof item.scriptId === "string" ? item.scriptId : null, name: item.name.slice(0, 80), code: item.code, visible: item.visible !== false };
}
