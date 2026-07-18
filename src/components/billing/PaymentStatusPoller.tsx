"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function PaymentStatusPoller({ reference }: { reference: string }) {
  const router=useRouter(); const checkingRef=useRef(false); const [checking,setChecking]=useState(false); const [message,setMessage]=useState("We will update this page when Paystack confirms the payment.");
  const check=useCallback(async () => {
    if(checkingRef.current) return; checkingRef.current=true; setChecking(true);
    try { const response=await fetch(`/api/billing/status?reference=${encodeURIComponent(reference)}`,{cache:"no-store"}); const payload=(await response.json()) as {status?:string;message?:string}; if(payload.status==="success") {router.replace(`/billing/success?reference=${encodeURIComponent(reference)}`);return;} if(payload.status==="failed") {router.replace(`/billing/failed?reference=${encodeURIComponent(reference)}`);return;} setMessage(payload.message||"Payment confirmation is still pending."); } catch {setMessage("We could not refresh the payment yet. Your reference is safe—try again shortly.");} finally {checkingRef.current=false;setChecking(false);}
  },[reference,router]);
  useEffect(()=>{const timer=window.setInterval(()=>{void check();},8000);return()=>window.clearInterval(timer);},[check]);
  return <div><button type="button" onClick={()=>void check()} disabled={checking} className="btn-secondary w-full">{checking?<RefreshCw size={15} className="animate-spin" aria-hidden/>:<RefreshCw size={15} aria-hidden/>}{checking?"Checking…":"Check payment status"}</button><p aria-live="polite" className="mt-3 text-xs text-slate-500">{message}</p></div>;
}
