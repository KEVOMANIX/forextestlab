"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

export function ManageSubscriptionButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function manage() {
    setBusy(true); setError(null);
    try {
      const response=await fetch("/api/billing/manage",{method:"POST"});
      const payload=(await response.json()) as {url?:string;error?:string};
      if(!response.ok||!payload.url) throw new Error(payload.error||"Could not open subscription management.");
      window.location.assign(payload.url);
    } catch(cause) { setError(cause instanceof Error?cause.message:"Could not open subscription management."); setBusy(false); }
  }
  return <div><button type="button" onClick={manage} disabled={busy} className="btn-secondary w-full px-4 py-2 text-xs">{busy?<><Loader2 size={14} className="animate-spin"/>Opening…</>:<>Manage subscription <ExternalLink size={14}/></>}</button>{error&&<p role="alert" className="mt-2 text-xs text-bear">{error}</p>}</div>;
}
