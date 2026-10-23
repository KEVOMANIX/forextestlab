/** What an account may do, decided on the server and passed to the UI. */
export interface PlanEntitlements {
  plan: "free" | "pro";
  /** An admin viewing the site as a Free account ("view as Free"). */
  preview?: boolean;
  /** Set while Pro comes from a provider trial: when it ends (ISO). */
  trialEndsAt: string | null;
  /** Free's monthly allowance of new sessions; null on Pro (unlimited). */
  monthlySessions: {
    limit: number;
    used: number;
    remaining: number;
    /** ISO start of the next UTC calendar month. */
    resetsAt: string;
  } | null;
  /** Symbols a new session may use; null means every supported market. */
  allowedSymbols: readonly string[] | null;
  maxSessionDays: 31 | null;
  maxPairsPerSession: 1 | null;
  maxReplaySpeed: 1200 | 7200;
  /** Advanced analytics reports and AI insights. */
  fullAnalytics: boolean;
  /** Trade and analytics exports. */
  exports: boolean;
  /** Prop Firm Challenge mode. */
  propFirmChallenges: boolean;
}
