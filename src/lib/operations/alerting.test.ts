import { describe, expect, it } from "vitest";

import { decideAlert, parseMonitorState, type MonitorState, type MonitorStatus } from "./alerting";

const HOUR = 3_600_000;
const start = Date.parse("2026-10-20T00:00:00Z");

/** Runs the monitor every 15 minutes through a list of [hours, status] steps. */
function run(steps: Array<[number, MonitorStatus]>) {
  let state: MonitorState | null = { status: "healthy", since: new Date(start).toISOString(), lastAlertAt: null, alerted: false };
  const sent: Array<[number, string]> = [];
  let t = start;
  for (const [hours, status] of steps) {
    const end = t + hours * HOUR;
    for (; t < end; t += HOUR / 4) {
      const decision = decideAlert(state, status, new Date(t));
      if (decision.send) sent.push([(t - start) / HOUR, decision.send]);
      state = decision.next;
    }
  }
  return sent;
}

describe("decideAlert", () => {
  it("stays quiet when a degraded check recovers within 12 hours, however often it flips", () => {
    expect(run([[8, "degraded"], [2, "healthy"], [7, "degraded"], [3, "healthy"]])).toEqual([]);
  });

  it("alerts once a degraded state has lasted 12 hours, repeats daily, and reports recovery", () => {
    expect(run([[40, "degraded"], [1, "healthy"]])).toEqual([[12, "degraded"], [36, "degraded"], [40, "recovered"]]);
  });

  it("alerts on a failure at once and every 6 hours while it lasts", () => {
    expect(run([[13, "failed"], [1, "healthy"]])).toEqual([[0, "failed"], [6, "failed"], [12, "failed"], [13, "recovered"]]);
  });

  it("alerts straight away when degraded escalates to failed, and recovers the whole incident", () => {
    expect(run([[2, "degraded"], [1, "failed"], [2, "degraded"], [1, "healthy"]])).toEqual([[2, "failed"], [5, "recovered"]]);
  });

  it("reads the older state file shape", () => {
    const now = new Date(start);
    expect(parseMonitorState({ status: "degraded", lastAlertAt: "2026-10-19T20:00:00Z" }, now)).toEqual({
      status: "degraded", since: now.toISOString(), lastAlertAt: "2026-10-19T20:00:00Z", alerted: true,
    });
    expect(parseMonitorState({ status: "nonsense" }, now)).toBeNull();
    expect(parseMonitorState(null, now)).toBeNull();
  });
});
