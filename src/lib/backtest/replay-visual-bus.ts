export interface ReplayVisualUpdate {
  sessionId: string;
  currentTime: number;
  visibleIndex: number;
  currentPrice: number;
}

type ReplayVisualListener = (update: ReplayVisualUpdate) => void;

const listeners = new Map<string, Set<ReplayVisualListener>>();

export function publishReplayVisual(update: ReplayVisualUpdate): void {
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
  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0) listeners.delete(sessionId);
  };
}
