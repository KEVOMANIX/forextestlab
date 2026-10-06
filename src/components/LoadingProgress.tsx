"use client";

export function LoadingProgress({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="w-full">
      <div className="mb-2.5 flex items-center justify-between gap-4 text-xs">
        <span className="text-[var(--app-muted,#94a3b8)]">{label}</span>
        <span className="font-mono font-semibold tabular-nums text-brand-400">{percent}%</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-brand-400/10">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
