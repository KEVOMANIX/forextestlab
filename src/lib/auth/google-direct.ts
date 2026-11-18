/**
 * Direct Google sign-in: Google redirects back to our own domain, so its
 * account chooser says "continue to forextestlab.com" instead of the Supabase
 * project host. The ID token is then handed to Supabase (signInWithIdToken).
 *
 * Off unless GOOGLE_DIRECT_SIGNIN=on, so it can be switched back instantly.
 * Requires <origin>/auth/google/callback as an authorised redirect URI on the
 * Google OAuth client, and that client ID accepted by Supabase's Google provider.
 */
export const GOOGLE_STATE_COOKIE = "ftl_google_state";

export function googleDirectEnabled(): boolean {
  return (
    process.env.GOOGLE_DIRECT_SIGNIN === "on" &&
    Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  );
}

export function googleRedirectUri(origin: string): string {
  return new URL("/auth/google/callback", origin).toString();
}
