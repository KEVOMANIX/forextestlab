/** Lightweight checkpoints persist the clock independently of stateJson. */
export function historyCutoff(
  before: number,
  engineClock: number,
  checkpointClock: bigint | number | null | undefined,
): number {
  const saved = checkpointClock == null ? engineClock : Number(checkpointClock);
  const clock = Number.isFinite(saved) ? saved : engineClock;
  return Math.min(before, clock + 1);
}
