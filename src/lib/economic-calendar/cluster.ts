/**
 * Groups calendar badges that would overlap on the time axis.
 *
 * Releases arrive in batches — five US figures share 13:30 — and on a four-hour
 * chart a whole day of news falls inside one candle. Drawn literally that is a
 * pile of half-hidden discs, and the one that ends up on top is whichever sorted
 * last. So anything within a badge's width becomes a single badge carrying the
 * group's highest impact, and the card lists what is inside it.
 */

import { IMPORTANCE_RANK, type CalendarEvent, type EventImportance } from "./types";

export interface PlacedEvent {
  event: CalendarEvent;
  x: number;
}

export interface EventCluster {
  /** Stable across re-renders: the earliest event's id. */
  id: string;
  /** Badge centre, in pixels from the layer's left edge. */
  x: number;
  /** Ascending by time. */
  events: CalendarEvent[];
  importance: EventImportance;
}

/**
 * Badge diameter, its ring, and the count bubble that overhangs the top-right
 * corner of a clustered one. Sized to the bubble rather than the disc because two
 * clusters a disc apart still had their counts sitting on top of each other.
 */
export const CLUSTER_DISTANCE_PX = 22;

export function clusterEvents(
  placed: PlacedEvent[],
  distance = CLUSTER_DISTANCE_PX,
): EventCluster[] {
  const sorted = [...placed].sort(
    (a, b) => a.x - b.x || a.event.timestamp - b.event.timestamp,
  );

  const clusters: EventCluster[] = [];
  for (const item of sorted) {
    const open = clusters[clusters.length - 1];
    // Compared against the cluster's first badge, not its running mean: a dense
    // run of events would otherwise drag one cluster across the whole axis.
    if (open && item.x - open.x < distance) {
      open.events.push(item.event);
      if (IMPORTANCE_RANK[item.event.importance] > IMPORTANCE_RANK[open.importance]) {
        open.importance = item.event.importance;
      }
      continue;
    }
    clusters.push({
      id: item.event.id,
      x: item.x,
      events: [item.event],
      importance: item.event.importance,
    });
  }

  for (const cluster of clusters) {
    cluster.events.sort((a, b) => a.timestamp - b.timestamp);
    // The badge is named by its earliest release, and so is its key.
    cluster.id = cluster.events[0]!.id;
  }
  return clusters;
}
