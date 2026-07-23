"use client";

import {
  Activity,
  ArrowLeft,
  BarChart3,
  Database,
  FileClock,
  Mail,
  ReceiptText,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/Logo";

const links = [
  { label: "Overview", href: "/admin", icon: BarChart3 },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Subscriptions", href: "/admin/subscriptions", icon: ReceiptText },
  { label: "Sessions", href: "/admin/sessions", icon: Activity },
  { label: "Market data", href: "/admin/market-data", icon: Database },
  { label: "Enquiries", href: "/admin/enquiries", icon: Mail },
  { label: "Audit log", href: "/admin/audit", icon: FileClock },
] as const;

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r app-border bg-[var(--app-panel-2)]/55 lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b app-border px-5">
          <Logo className="h-7" />
        </div>
        <div className="px-4 pb-3 pt-5">
          <div className="flex items-center gap-3 rounded-xl border border-brand-400/20 bg-brand-400/[0.07] p-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-400/15 text-brand-300">
              <ShieldCheck size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold">Admin console</p>
              <p className="truncate text-[11px] app-muted">{email}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Admin">
          {links.map(({ label, href, icon: Icon }) => {
            const active =
              pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-400/12 text-brand-300"
                    : "app-muted hover:bg-white/[0.035] hover:text-[var(--app-text)]"
                }`}
              >
                <Icon size={16} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t app-border p-3">
          <Link
            href="/app"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm app-muted hover:bg-white/[0.035] hover:text-[var(--app-text)]"
          >
            <ArrowLeft size={16} aria-hidden />
            Return to workspace
          </Link>
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b app-border bg-[var(--app-bg)]/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between">
          <Logo className="h-7" />
          <Link href="/app" className="inline-flex items-center gap-2 text-xs font-semibold app-muted">
            <ArrowLeft size={14} aria-hidden /> Workspace
          </Link>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto pb-1" aria-label="Admin">
          {links.map(({ label, href, icon: Icon }) => {
            const active =
              pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                  active ? "bg-brand-400/12 text-brand-300" : "app-muted"
                }`}
              >
                <Icon size={14} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
