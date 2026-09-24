export const DASHBOARD_SESSION_COOKIE = "forextestlab_dashboard_session";
export const DASHBOARD_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Resolve a dashboard preference only against sessions the current user owns.
 * A URL selection wins so shared/deep links remain deterministic; the saved
 * browser preference is used when the dashboard is opened without one.
 */
export function resolveDashboardSessionId(
  requestedId: string | null | undefined,
  rememberedId: string | null | undefined,
  availableIds: readonly string[],
): string | null {
  const available = new Set(availableIds);
  if (requestedId && available.has(requestedId)) return requestedId;
  if (rememberedId && available.has(rememberedId)) return rememberedId;
  return availableIds[0] ?? null;
}
