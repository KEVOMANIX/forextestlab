/** Presentation helpers shared by the support workspace. Pure functions only,
 * so both server and client components can use them. */

export function initials(value: string) {
  return (
    value
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Compact age used on conversation cards: 45s, 12m, 4h, 6d, then a date. */
export function shortAgo(value: Date, now: number) {
  const seconds = Math.max(0, Math.round((now - value.getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

/**
 * Status colours stay muted: teal marks conversations the team is actively
 * holding, amber marks ones parked or waiting, and slate marks finished work.
 */
export function statusTone(status: string) {
  if (status === "resolved" || status === "closed") {
    return { dot: "bg-slate-500", text: "app-muted" };
  }
  if (status === "snoozed") return { dot: "bg-amber-300/80", text: "text-amber-200/90" };
  if (status === "waiting_customer") return { dot: "bg-slate-400", text: "app-muted" };
  return { dot: "bg-brand-400", text: "text-brand-200" };
}

export function priorityTone(priority: string) {
  if (priority === "urgent") return "border-bear/35 text-bear";
  if (priority === "high") return "border-amber-300/35 text-amber-200";
  if (priority === "low") return "app-border app-muted";
  return "app-border app-muted";
}

export function slaHours(priority: string) {
  return priority === "urgent" ? 1 : priority === "high" ? 2 : priority === "low" ? 8 : 4;
}

export function isOverdue(
  conversation: { priority: string; createdAt: Date; firstResponseAt: Date | null },
  now: number,
) {
  return (
    !conversation.firstResponseAt &&
    now - conversation.createdAt.getTime() > slaHours(conversation.priority) * 3_600_000
  );
}

export function formatBytes(size: number) {
  if (size < 1_024) return `${size} B`;
  if (size < 1_024 * 1_024) return `${Math.ceil(size / 1_024)} KB`;
  return `${(size / (1_024 * 1_024)).toFixed(1)} MB`;
}

/** Groups a thread into day buckets so the view can show date separators. */
export function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
