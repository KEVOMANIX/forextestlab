import type { ChartSettings } from "@/components/app/ChartSettingsMenu";
import type { OrderRequest } from "./backtest/types";
import type { ToolTemplate } from "./chart/tool-templates";

export interface WorkspacePayload {
  settings: Partial<ChartSettings>;
  favorites: string[];
  layout: unknown;
  cellViews: Record<string, unknown>;
  drawings: Record<string, unknown[]>;
  toolDefaults: unknown;
  individualToolTemplates?: ToolTemplate[];
  sessionIndicatorDefault?: unknown;
  defaultChartView?: unknown;
  orderTicketDefaults: Omit<OrderRequest, "direction"> | null;
  replayToolbarPosition: { x: number; y: number } | null;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  payload: WorkspacePayload;
  updatedAt: string;
}

export interface SavedWorkspace {
  payload: WorkspacePayload;
  updatedAt: string;
}

export const EMPTY_WORKSPACE: WorkspacePayload = {
  settings: {},
  favorites: [],
  layout: null,
  cellViews: {},
  drawings: {},
  toolDefaults: null,
  orderTicketDefaults: null,
  replayToolbarPosition: null,
};
