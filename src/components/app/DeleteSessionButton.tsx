"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export function DeleteSessionButton({
  sessionId,
  iconOnly = false,
  redirectAfterDelete = true,
}: {
  sessionId: string;
  iconOnly?: boolean;
  redirectAfterDelete?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this saved session permanently?")) return;
    setBusy(true);
    const response = await fetch(`/api/backtest/sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      if (redirectAfterDelete) router.replace("/app/history");
      router.refresh();
      return;
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      className={iconOnly
        ? "ml-2 inline-grid h-8 w-8 place-items-center rounded-md text-bear/80 hover:bg-bear/10 hover:text-bear"
        : "btn-secondary py-2 text-xs"}
      onClick={remove}
      disabled={busy}
      aria-label={iconOnly ? "Delete session" : undefined}
      title={iconOnly ? "Delete session" : undefined}
    >
      <Trash2 size={14} aria-hidden />
      {!iconOnly && "Delete"}
    </button>
  );
}
