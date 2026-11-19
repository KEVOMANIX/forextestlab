"use client";

import { Reply, StickyNote } from "lucide-react";
import { useState } from "react";

import { Composer } from "./Composer";

type ComposerProps = React.ComponentProps<typeof Composer>;

/**
 * Gmail-style: the thread ends with Reply / Internal note buttons, and the
 * composer only opens when one is clicked.
 */
export function ReplyLauncher(props: Omit<ComposerProps, "initialMode">) {
  const [mode, setMode] = useState<"reply" | "note" | null>(null);
  if (mode) return <Composer {...props} initialMode={mode} autoFocus />;
  return (
    <div className="flex shrink-0 gap-3 border-t app-border px-4 py-4 sm:pl-[84px]">
      <button
        type="button"
        onClick={() => setMode("reply")}
        disabled={props.closed}
        className="inline-flex items-center gap-2 rounded-full border app-border px-5 py-2 text-sm font-medium transition-colors hover:bg-white/[0.05] disabled:opacity-50"
      >
        <Reply size={16} aria-hidden /> Reply
      </button>
      <button
        type="button"
        onClick={() => setMode("note")}
        className="inline-flex items-center gap-2 rounded-full border app-border px-5 py-2 text-sm font-medium transition-colors hover:bg-white/[0.05]"
      >
        <StickyNote size={16} aria-hidden /> Internal note
      </button>
    </div>
  );
}
