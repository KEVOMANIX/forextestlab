"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this saved session permanently?")) return;
    setBusy(true);
    const response = await fetch(`/api/backtest/sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      router.replace("/app/history");
      router.refresh();
      return;
    }
    setBusy(false);
  }

  return (
    <button type="button" className="btn-secondary py-2 text-xs" onClick={remove} disabled={busy}>
      <Trash2 size={14} aria-hidden />
      Delete
    </button>
  );
}
