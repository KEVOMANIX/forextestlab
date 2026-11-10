export const PINE_SCRIPTS_KEY = "forextestlab:pine-scripts:v1";
export type PineScript = { id: string; name: string; code: string; updatedAt: number };

export function readPineScripts(): PineScript[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PINE_SCRIPTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is PineScript => Boolean(item && typeof item.id === "string" && typeof item.name === "string" && typeof item.code === "string")) : [];
  } catch { return []; }
}

export function savePineScript(script: PineScript): void {
  const scripts = readPineScripts().filter(item => item.id !== script.id);
  localStorage.setItem(PINE_SCRIPTS_KEY, JSON.stringify([script, ...scripts]));
  window.dispatchEvent(new Event("forextestlab:pine-scripts-changed"));
}
