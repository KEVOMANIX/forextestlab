import { describe, expect, it } from "vitest";

import { clusterEvents, type PlacedEvent } from "./cluster";
import type { CalendarEvent, EventImportance } from "./types";

function event(
  id: string,
  timestamp: number,
  importance: EventImportance = "medium",
): CalendarEvent {
  return {
    id,
    name: `Event ${id}`,
    currency: "USD",
    country: "United States",
    importance,
    timestamp,
    timeMode: "exact",
    actual: null,
    forecast: null,
    previous: null,
    unit: null,
    multiplier: null,
    digits: 0,
  };
}

function placed(items: Array<[string, number, number, EventImportance?]>): PlacedEvent[] {
  return items.map(([id, timestamp, x, importance]) => ({
    event: event(id, timestamp, importance),
    x,
  }));
}

describe("clusterEvents", () => {
  it("leaves badges alone when they have room", () => {
    const clusters = clusterEvents(placed([["a", 1, 40], ["b", 2, 200]]));
    expect(clusters).toHaveLength(2);
    expect(clusters.map((cluster) => cluster.x)).toEqual([40, 200]);
  });

  it("merges badges that would overlap", () => {
    // The 13:30 batch: five US figures on one minute.
    const clusters = clusterEvents(
      placed([
        ["a", 1, 300],
        ["b", 2, 300],
        ["c", 3, 304],
        ["d", 4, 306],
      ]),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.events.map((event) => event.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("takes the group's highest impact for the badge", () => {
    const clusters = clusterEvents(
      placed([
        ["filler", 1, 100, "low"],
        ["rates", 2, 106, "high"],
        ["more", 3, 110, "low"],
      ]),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.importance).toBe("high");
  });

  it("does not let a dense run drag one cluster across the axis", () => {
    // Each item is within the distance of the one before it but far from the
    // first. Chaining off the running edge would swallow the whole axis into a
    // single badge.
    const clusters = clusterEvents(
      placed([
        ["a", 1, 0],
        ["b", 2, 16],
        ["c", 3, 32],
        ["d", 4, 48],
      ]),
    );
    expect(clusters.length).toBeGreaterThan(1);
  });

  it("orders a cluster's events by time and keys it on the earliest", () => {
    const clusters = clusterEvents(
      placed([
        ["late", 500, 202],
        ["early", 100, 200],
      ]),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.events.map((event) => event.id)).toEqual(["early", "late"]);
    expect(clusters[0]!.id).toBe("early");
  });

  it("returns nothing for nothing", () => {
    expect(clusterEvents([])).toEqual([]);
  });
});
