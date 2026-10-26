import type { WorkspacePayload } from "@/lib/workspace";

/** A reload before background sync must not replace a newer local edit. */
export function newestChartView(local: unknown, remote: unknown): unknown {
  const stamp = (value: unknown) => value && typeof value === "object" &&
    typeof (value as Record<string, unknown>).preferencesUpdatedAt === "number"
    ? (value as { preferencesUpdatedAt: number }).preferencesUpdatedAt : 0;
  return stamp(local) > stamp(remote) ? local : remote;
}

/** Reusable visual preferences never include market coordinates or orders. */
export function templateView(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const view = value as Record<string, unknown>;
  return {
    ...(typeof view.chartType === "string" ? { chartType: view.chartType } : {}),
    ...(Array.isArray(view.indicators) ? { indicators: view.indicators } : {}),
  };
}

export function reusableWorkspace(payload: WorkspacePayload): WorkspacePayload {
  return {
    ...payload,
    layout: null,
    drawings: {},
    cellViews: Object.fromEntries(Object.entries(payload.cellViews).map(([key, view]) => [key, templateView(view)])),
    orderTicketDefaults: null,
    replayToolbarPosition: null,
  };
}
