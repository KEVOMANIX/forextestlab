"use client";

import { useEffect, useState } from "react";

export type TrialOfferState = { eligible: boolean; signedIn: boolean };

let pending: Promise<TrialOfferState> | null = null;

/** One request per page load, shared by every trial advert on it. */
export function fetchTrialOffer(): Promise<TrialOfferState> {
  pending ??= fetch("/api/billing/trial", { credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : { eligible: false, signedIn: false }))
    .catch(() => ({ eligible: false, signedIn: false }));
  return pending;
}

/** Null until known; adverts stay hidden until then. */
export function useTrialOffer(enabled = true): TrialOfferState | null {
  const [state, setState] = useState<TrialOfferState | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void fetchTrialOffer().then((value) => { if (active) setState(value); });
    return () => { active = false; };
  }, [enabled]);
  return state;
}
