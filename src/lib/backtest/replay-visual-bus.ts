export interface ReplayVisualUpdate {
  sessionId: string;
  currentTime: number;
  visibleIndex: number;
  currentPrice: number;
  /**
   * Tick replay: market time reached inside the next candle (ms), while it is
   * still forming. Charts draw that candle from its tick path up to here.
   * Absent on whole-candle steps and when replay stops.
   */
  formingAt?: number;
}

type ReplayVisualListener = (update: ReplayVisualUpdate) => void;

const listeners = new Map<string, Set<ReplayVisualListener>>();
/** The newest update that showed a forming candle, per session, for charts that mount later (e.g. after a reload mid-minute). */
const lastForming = new Map<string, ReplayVisualUpdate>();

export function publishReplayVisual(update: ReplayVisualUpdate): void {
  if (update.formingAt != null) lastForming.set(update.sessionId, update);
  else lastForming.delete(update.sessionId);
  for (const listener of listeners.get(update.sessionId) ?? []) {
    listener(update);
  }
}

export function subscribeReplayVisual(
  sessionId: string,
  listener: ReplayVisualListener,
): () => void {
  const sessionListeners = listeners.get(sessionId) ?? new Set();
  sessionListeners.add(listener);
  listeners.set(sessionId, sessionListeners);
  const forming = lastForming.get(sessionId);
  if (forming) listener(forming);
  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0) listeners.delete(sessionId);
  };
}
