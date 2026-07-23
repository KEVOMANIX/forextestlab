import type { LucideIcon } from "lucide-react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 border-b app-border pb-6 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 app-muted">{description}</p>
      </div>
      {children}
    </header>
  );
}

export function AdminStat({
  label,
  value,
  detail,
  icon: Icon,
  tone = "text-brand-300",
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <article className="panel relative overflow-hidden p-5">
      <div aria-hidden className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-400/[0.06] blur-2xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium app-muted">{label}</p>
          <p className={`mt-3 text-2xl font-bold tracking-tight ${tone}`}>{value}</p>
          <p className="mt-2 text-xs app-muted">{detail}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-panel-2)]">
          <Icon size={18} className={tone} aria-hidden />
        </span>
      </div>
    </article>
  );
}

const statusTones: Record<string, string> = {
  active: "border-brand-400/25 bg-brand-400/10 text-brand-300",
  completed: "border-brand-400/25 bg-brand-400/10 text-brand-300",
  delivered: "border-brand-400/25 bg-brand-400/10 text-brand-300",
  resolved: "border-brand-400/25 bg-brand-400/10 text-brand-300",
  open: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  pending: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  attention: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  failed: "border-bear/25 bg-bear/10 text-bear",
  canceled: "border-white/10 bg-white/5 app-muted",
  inactive: "border-white/10 bg-white/5 app-muted",
};

export function AdminStatus({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusTones[normalized] ?? "border-accent-400/25 bg-accent-500/10 text-accent-400"}`}>
      {value.replaceAll("-", " ")}
    </span>
  );
}

export function AdminTable({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-xl border app-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">{label}</caption>
          {children}
        </table>
      </div>
    </div>
  );
}

export const adminTh = "bg-[var(--app-panel-2)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] app-muted";
export const adminTd = "border-t app-border px-4 py-3.5 align-middle";

