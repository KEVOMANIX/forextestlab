import type { LoadedSession } from "./session-store";

export function canAccessSession(
  session: Pick<
    LoadedSession,
    "userId" | "anonymous" | "anonymousExpiresAt" | "token"
  >,
  userId: string | null,
  token: string | null,
): boolean {
  if (session.userId) return session.userId === userId;
  if (!session.anonymous || token !== session.token) return false;
  return (
    session.anonymousExpiresAt === null ||
    session.anonymousExpiresAt.getTime() > Date.now()
  );
}
