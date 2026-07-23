export interface PlanEntitlements {
  plan: "free" | "pro";
  maxSavedSessions: 1 | null;
  maxSessionDays: 31 | null;
  maxPairsPerSession: 1 | null;
  maxReplaySpeed: 1200 | 28800;
  fullAnalytics: boolean;
  csvExports: boolean;
  freeSessionUsed: boolean;
}
