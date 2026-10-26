import type { DrawingJSON } from "./drawing/types";
import { defaultStyle as drawingDefaults } from "./drawing/types";
import type { IndicatorInstance } from "./indicator-defs";

export const TOOL_TEMPLATES_KEY = "forextestlab:individual-tool-templates";
export interface ToolTemplate {
  id: string;
  name: string;
  scope: string;
  settings: unknown;
  updatedAt: number;
  deleted?: boolean;
}
export function mergeToolTemplates(local: ToolTemplate[], remote: ToolTemplate[]): ToolTemplate[] {
  const byId = new Map<string, ToolTemplate>();
  for (const item of [...remote, ...local]) {
    if (!item || typeof item.id !== "string" || typeof item.scope !== "string") continue;
    if ((byId.get(item.id)?.updatedAt ?? -1) <= item.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}
export function drawingTemplate(value: DrawingJSON) {
  return { style: structuredClone(value.style), visibleTimeframes: value.visibleTimeframes ? [...value.visibleTimeframes] : null };
}
export function defaultDrawingTemplate(value: DrawingJSON) {
  return { style: drawingDefaults(value.kind), visibleTimeframes: null };
}
export function indicatorTemplate(value: IndicatorInstance) {
  return { inputs: structuredClone(value.inputs), style: structuredClone(value.style), visible: value.visible, precision: value.precision };
}
