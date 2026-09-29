"use client";

import Link from "next/link";
import { BarChart3, BookOpenText, CircleHelp, CircleUserRound, CreditCard, LayoutDashboard, Loader2, LogIn, LogOut, Menu, Moon, PanelLeft, Plus, Sun } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useAppTheme } from "./ThemeContext";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard };

const WORKSPACE: NavItem[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "New backtest", href: "/app/backtest", icon: Plus },
  { label: "Sessions", href: "/app/history", icon: BookOpenText },
  { label: "Analytics", href: "/app/analytics", icon: BarChart3 },
];
const ACCOUNT: NavItem[] = [
  { label: "Account", href: "/account", icon: CircleUserRound },
  { label: "Billing", href: "/account/billing", icon: CreditCard },
];

function initials(displayName: string | null): string {
  if (!displayName) return "FT";
  return displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FT";
}

function isActive(pathname: string, href: string): boolean {
  const target = href.split("#")[0]!;
  return target === "/app" ? pathname === target : pathname.startsWith(target);
}

function DesktopLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href);
  return <Link href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-brand-400/10 text-brand-300" : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}><Icon size={16} aria-hidden />{item.label}</Link>;
}

export function AppNav({ signedIn, displayName }: { signedIn: boolean; displayName: string | null; admin?: boolean }) {
  const { theme, toggle } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase || signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return <>
    <aside className="hidden min-h-dvh flex-col border-r app-border bg-[var(--app-sidebar)] lg:sticky lg:top-0 lg:row-span-2 lg:h-dvh lg:self-start lg:flex">
      <div className="flex h-16 items-center border-b app-border px-5"><Logo className="h-7" /></div>
      <nav aria-label="Workspace navigation" className="flex-1 overflow-y-auto px-3 py-5">
        <div className="space-y-1">{WORKSPACE.map((item) => <DesktopLink key={item.href} item={item} pathname={pathname} />)}</div>
        <NavGroup label="Account" items={ACCOUNT} pathname={pathname} />
        <div className="mt-7"><p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] app-muted">Help</p><div className="space-y-1"><Link href="/faq" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium app-muted transition-colors hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"><CircleHelp size={16} aria-hidden />FAQ</Link></div></div>
      </nav>
      <div className="border-t app-border p-3"><Link href={signedIn ? "/account" : "/sign-in"} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-[var(--app-panel-2)]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-400/15 text-xs font-bold text-brand-200">{signedIn ? initials(displayName) : <LogIn size={16} aria-hidden />}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold">{signedIn ? displayName ?? "ForexTestLab trader" : "Sign in"}</span></span></Link>{signedIn && <button type="button" onClick={signOut} disabled={signingOut} className="mt-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium app-muted transition-colors hover:bg-loss/[0.06] hover:text-loss disabled:opacity-50">{signingOut ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}Sign out</button>}</div>
    </aside>

    <header className="sticky top-0 z-40 hidden h-16 items-center justify-between border-b app-border bg-[var(--app-bg)]/90 px-7 backdrop-blur lg:flex"><div className="flex min-w-0 items-center gap-3 text-sm"><span className="text-brand-300"><PanelLeft size={17} aria-hidden /></span><span className="app-muted">Workspace</span><span className="app-muted">/</span><span className="truncate font-semibold">{pathname.startsWith("/account") ? "Account" : pathname.startsWith("/app/backtest") ? "Backtester" : pathname.startsWith("/app/analytics") ? "Analytics" : pathname.startsWith("/app/history") ? "Sessions" : pathname.startsWith("/app/support") ? "Support" : "Dashboard"}</span></div><button type="button" onClick={toggle} className="grid h-9 w-9 place-items-center rounded-lg border app-border app-muted transition-colors hover:text-brand-300" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}</button></header>
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b app-border bg-[var(--app-bg)]/90 px-4 backdrop-blur lg:hidden"><Link href="/app"><Logo className="h-7" /></Link><div className="flex items-center gap-2"><button type="button" onClick={toggle} className="grid h-9 w-9 place-items-center rounded-lg border app-border" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}</button><Menu size={18} className="app-muted" aria-hidden /></div></header>
  </>;
}

function NavGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return <div className="mt-7"><p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] app-muted">{label}</p><div className="space-y-1">{items.map((item) => <DesktopLink key={item.href} item={item} pathname={pathname} />)}</div></div>;
}
