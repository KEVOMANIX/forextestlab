/**
 * When the production monitor should email.
 *
 * Every status change used to send an alert. The economic-calendar check turns
 * degraded whenever the MT5 workstation has not sent a new export for 48 hours
 * and healthy again when it does, so a quiet week produced a dozen alerts and
 * trained everyone to ignore them. Failures still alert at once; a degraded
 * state must last before it is worth an email, and "recovered" is only sent
 * for an incident someone was told about.
 */

export type MonitorStatus = "healthy" | "degraded" | "failed";

export interface MonitorState {
  status: MonitorStatus;
  /** When the current status began. */
  since: string;
  lastAlertAt: string | null;
  /** Whether an alert went out during the current incident. */
  alerted: boolean;
}

const HOUR = 3_600_000;
export const DEGRADED_GRACE_MS = 12 * HOUR;
export const FAILED_REPEAT_MS = 6 * HOUR;
export const DEGRADED_REPEAT_MS = 24 * HOUR;

/** Reads the state file, including the older `{ status, lastAlertAt }` shape. */
export function parseMonitorState(raw: unknown, now: Date): MonitorState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<MonitorState>;
  if (value.status !== "healthy" && value.status !== "degraded" && value.status !== "failed") return null;
  const lastAlertAt = typeof value.lastAlertAt === "string" ? value.lastAlertAt : null;
  return {
    status: value.status,
    since: typeof value.since === "string" ? value.since : now.toISOString(),
    lastAlertAt,
    alerted: typeof value.alerted === "boolean" ? value.alerted : value.status !== "healthy" && lastAlertAt !== null,
  };
}

export function decideAlert(previous: MonitorState | null, status: MonitorStatus, now: Date): {
  send: "failed" | "degraded" | "recovered" | null;
  next: MonitorState;
} {
  const changed = previous?.status !== status;
  const since = changed || !previous ? now.toISOString() : previous.since;
  // Moving between degraded and failed is still the same incident.
  const sameIncident = status !== "healthy" && previous !== null && previous.status !== "healthy";
  const alerted = sameIncident ? previous.alerted : false;
  const lastAlert = previous?.lastAlertAt ? Date.parse(previous.lastAlertAt) : 0;
  const elapsed = now.getTime() - Date.parse(since);

  let send: "failed" | "degraded" | "recovered" | null = null;
  if (status === "healthy") {
    if (changed && previous && previous.status !== "healthy" && previous.alerted) send = "recovered";
  } else if (status === "failed") {
    if (changed || now.getTime() - lastAlert >= FAILED_REPEAT_MS) send = "failed";
  } else if (elapsed >= DEGRADED_GRACE_MS && (!alerted || now.getTime() - lastAlert >= DEGRADED_REPEAT_MS)) {
    send = "degraded";
  }

  return {
    send,
    next: {
      status,
      since,
      lastAlertAt: send ? now.toISOString() : previous?.lastAlertAt ?? null,
      alerted: status === "healthy" ? false : alerted || (send !== null && send !== "recovered"),
    },
  };
}
