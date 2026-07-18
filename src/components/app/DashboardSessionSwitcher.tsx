"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function DashboardSessionSwitcher({
  sessions,
  selectedId,
}: {
  sessions: { id: string; name: string }[];
  selectedId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <label className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
      <span className="shrink-0 text-xs font-semibold app-muted">Change session</span>
      <select
        className="app-input min-w-0 py-2 text-sm sm:w-64"
        value={selectedId}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("session", event.target.value);
          next.delete("performance");
          router.push(`/app?${next.toString()}`);
        }}
        aria-label="Session shown on dashboard"
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>{session.name}</option>
        ))}
      </select>
    </label>
  );
}
