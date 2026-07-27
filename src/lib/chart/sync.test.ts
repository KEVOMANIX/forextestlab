import { describe, expect, it, vi } from "vitest";
import type { Time } from "lightweight-charts";

import { ChartSync } from "./sync";

describe("ChartSync", () => {
  it("never exposes viewport synchronization", () => {
    const sync = new ChartSync();
    expect("broadcastRange" in sync).toBe(false);
  });

  it("can disable crosshair synchronization without touching chart viewports", () => {
    const sync = new ChartSync();
    const setCrosshairPosition = vi.fn();
    const clearCrosshairPosition = vi.fn();
    const chart = { setCrosshairPosition, clearCrosshairPosition };
    const series = { data: () => [{ time: 100, value: 1 }] };

    sync.register("one", {
      chart: chart as never,
      series: () => series as never,
    });
    sync.register("two", {
      chart: chart as never,
      series: () => series as never,
    });
    sync.setCrosshairEnabled(false);
    sync.broadcastCrosshair("one", 100 as Time);

    expect(setCrosshairPosition).not.toHaveBeenCalled();
    expect(clearCrosshairPosition).not.toHaveBeenCalled();
  });
});
