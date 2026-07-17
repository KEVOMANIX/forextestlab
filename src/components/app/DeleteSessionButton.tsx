"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";

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
  const [open, setOpen] = useState(false);

  async function remove() {
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
    <>
    <button
      type="button"
      className={iconOnly
        ? "ml-2 inline-grid h-8 w-8 place-items-center rounded-md text-bear/80 hover:bg-bear/10 hover:text-bear"
        : "btn-secondary py-2 text-xs"}
      onClick={() => setOpen(true)}
      disabled={busy}
      aria-label={iconOnly ? "Delete session" : undefined}
      title={iconOnly ? "Delete session" : undefined}
    >
      <Trash2 size={14} aria-hidden />
      {!iconOnly && "Delete"}
    </button>
    <ConfirmModal
      open={open}
      title="Delete session?"
      message="This session and its saved trades will be permanently deleted."
      confirmLabel="Delete session"
      danger
      busy={busy}
      onCancel={() => setOpen(false)}
      onConfirm={() => void remove()}
    />
    </>
  );
}
