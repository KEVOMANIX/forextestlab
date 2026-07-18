export interface PlanEntitlements {
  plan: "free" | "pro";
  maxSavedSessions: 1 | null;
  maxSessionDays: 31 | null;
  maxPairsPerSession: 1 | null;
  maxReplaySpeed: 300 | 7200;
  fullAnalytics: boolean;
  csvExports: boolean;
  freeSessionUsed: boolean;
}
