export interface PlanEntitlements {
  plan: "free" | "pro";
  maxSavedSessions: 3 | null;
  maxSessionDays: 31 | null;
  maxPairsPerSession: 1 | null;
  maxReplaySpeed: 1200 | 28800;
  fullAnalytics: boolean;
  csvExports: boolean;
  trialSessionsRemaining: number | null;
  /** Compatibility flag used by the session setup's exhausted state. */
  freeSessionUsed: boolean;
}
