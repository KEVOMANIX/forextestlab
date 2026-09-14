import "server-only";

import { normalizeSessionState } from "./replay-engine";
import { readSessionSnapshot } from "./state-snapshot-store";
import type { SessionState } from "./types";

/** Dashboard and results must read the same authoritative replay snapshot. */
export async function readSavedSessionState(row: {
  stateJson: string;
  stateObjectKey: string | null;
}): Promise<SessionState> {
  const json = await readSessionSnapshot(row.stateJson, row.stateObjectKey);
  return normalizeSessionState(JSON.parse(json) as SessionState);
}
