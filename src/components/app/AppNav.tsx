"use client";

import Image from "next/image";
import Link from "next/link";
import { BarChart3, BookOpenText, ChevronLeft, ChevronRight, CircleHelp, CircleUserRound, CreditCard, Crown, LayoutDashboard, Loader2, LogIn, LogOut, Menu, Moon, Plus, ShieldCheck, Sparkles, Sun, Trophy } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import logoMark from "../../../public/logo-mark.png";
import logoMarkLight from "../../../public/logo-mark-light.png";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { FreePlanSummary } from "@/lib/billing/entitlements";
import { FREE_SESSION_STARTED_EVENT, formatQuotaReset } from "@/lib/billing/plan-limits";
import { isFullScreenPath } from "@/lib/ui/full-screen";
import { NAV_COLLAPSED_COOKIE, NAV_COLLAPSED_MAX_AGE } from "@/lib/ui/nav";
import { ProLock } from "./ProLock";
import { useAppTheme } from "./ThemeContext";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; badge?: string; pro?: boolean; newTab?: boolean };

const WORKSPACE: NavItem[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "New backtest", href: "/app/backtest", icon: Plus },
  { label: "Sessions", href: "/app/history", icon: BookOpenText },
  { label: "Analytics", href: "/app/analytics", icon: BarChart3 },
  { label: "AI Analyst", href: "/app/ai", icon: Sparkles, badge: "New" },
  { label: "Challenges", href: "/app/challenges", icon: Trophy, badge: "New" },
];
const ACCOUNT: NavItem[] = [
  { label: "Account", href: "/account", icon: CircleUserRound },
  { label: "Billing", href: "/account/billing", icon: CreditCard },
];
/** Free accounts see these marked PRO in the menu. */
const PRO_HREFS = new Set(["/app/ai", "/app/challenges"]);
/** Pages whose NEW badge the trader has already opened; the badge stays away after that. */
const SEEN_NEW_STORAGE_KEY = "ftl.nav.seenNew";

function readSeenNew(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(SEEN_NEW_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((href): href is string => typeof href === "string") : [];
  } catch {
    return [];
  }
}

// The admin console and the FAQ open beside the workspace rather than replacing it.
const ADMIN: NavItem = { label: "Admin console", href: "/admin", icon: ShieldCheck, newTab: true };
const FAQ_ITEM: NavItem = { label: "FAQ", href: "/faq", icon: CircleHelp, newTab: true };
const NEW_TAB = { target: "_blank", rel: "noopener" } as const;

function initials(displayName: string | null): string {
  if (!displayName) return "FT";
  return displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FT";
}

function isActive(pathname: string, href: string): boolean {
  const target = href.split("#")[0]!;
  return target === "/app" ? pathname === target : pathname.startsWith(target);
}

function DesktopLink({ item, pathname, compact = false }: { item: NavItem; pathname: string; compact?: boolean }) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href);
  const tab = item.newTab ? NEW_TAB : {};
  if (compact) return <Link href={item.href} {...tab} aria-current={active ? "page" : undefined} aria-label={item.pro ? `${item.label} (Pro)` : item.label} title={item.label} className={`relative mx-auto grid h-10 w-10 place-items-center rounded-lg transition-colors ${active ? "bg-brand-400/10 text-brand-300" : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}><Icon size={17} aria-hidden />{item.pro && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden />}</Link>;
  return <Link href={item.href} {...tab} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-brand-400/10 text-brand-300" : "app-muted hover:bg-[var(--app-panel-2)] hover:text-[var(--app-text)]"}`}><Icon size={16} aria-hidden />{item.label}{(item.pro || item.badge) && <span className="ml-auto rounded-[5px] border border-brand-400/45 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.12em] text-brand-300">{item.pro ? "PRO" : item.badge}</span>}</Link>;
}

/** `freePlan`: set for a Free account, so Pro-only destinations carry the Pro mark and the plan card shows. */
export function AppNav({ signedIn, displayName, admin = false, freePlan = null, initialCollapsed = false }: { signedIn: boolean; displayName: string | null; admin?: boolean; freePlan?: FreePlanSummary | null; initialCollapsed?: boolean }) {
  const free = Boolean(freePlan);
  const { theme, toggle } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [seenNew, setSeenNew] = useState<string[]>([]);

  // Opening a page marks its NEW badge as seen.
  useEffect(() => {
    const seen = readSeenNew();
    const opened = WORKSPACE.find((item) => item.badge && isActive(pathname, item.href) && !seen.includes(item.href));
    if (opened) {
      seen.push(opened.href);
      try {
        window.localStorage.setItem(SEEN_NEW_STORAGE_KEY, JSON.stringify(seen));
      } catch {
        // Blocked storage just means the badge shows again next visit.
      }
    }
    setSeenNew(seen);
  }, [pathname]);

  const menuItem = (item: NavItem): NavItem => {
    if (free && PRO_HREFS.has(item.href)) return { ...item, pro: true };
    return item.badge && seenNew.includes(item.href) ? { ...item, badge: undefined } : item;
  };
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const fullScreen = isFullScreenPath(pathname);
  // Full-screen pages start with the menu as icons whatever the saved choice;
  // opening it there lasts until the trader leaves the page.
  const [openOnFullScreen, setOpenOnFullScreen] = useState(false);
  useEffect(() => setOpenOnFullScreen(false), [fullScreen]);
  const compact = fullScreen ? !openOnFullScreen : collapsed;

  function toggleCollapsed() {
    if (fullScreen) {
      setOpenOnFullScreen((open) => !open);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COLLAPSED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=${NAV_COLLAPSED_MAX_AGE}; samesite=lax`;
  }

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase || signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return <>
    <aside className={`hidden min-h-dvh flex-col border-r app-border bg-[var(--app-sidebar)] lg:sticky lg:top-0 lg:z-30 lg:row-span-2 lg:h-dvh lg:self-start lg:flex ${compact ? "lg:w-14" : "lg:w-56"}`}>
      <button type="button" onClick={toggleCollapsed} aria-label={compact ? "Expand menu" : "Collapse menu"} title={compact ? "Expand menu" : "Collapse menu"} aria-expanded={!compact} className="absolute -right-3 top-1/2 z-10 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border app-border bg-[var(--app-panel-solid)] app-muted shadow-md transition-colors hover:border-brand-400/60 hover:text-brand-300">{compact ? <ChevronRight size={14} strokeWidth={2.4} aria-hidden /> : <ChevronLeft size={14} strokeWidth={2.4} aria-hidden />}</button>
      {compact
        ? <div className="flex h-16 items-center justify-center border-b app-border"><Link href="/" aria-label="ForexTestLab home"><Image src={theme === "light" ? logoMarkLight : logoMark} alt="" className="h-7 w-7 object-contain" /></Link></div>
        : <div className="flex h-16 items-center border-b app-border px-5"><Logo className="h-7" /></div>}
      <nav aria-label="Workspace navigation" className={`flex-1 overflow-y-auto ${compact ? "px-2 py-3" : "px-3 py-4"}`}>
        {compact ? <>
          <div className="space-y-1">{WORKSPACE.map((item) => <DesktopLink key={item.href} item={menuItem(item)} pathname={pathname} compact />)}</div>
          <NavGroup label="Account" items={ACCOUNT} pathname={pathname} compact />
          {admin && <NavGroup label="Administration" items={[ADMIN]} pathname={pathname} compact />}
          <NavGroup label="Help" items={[FAQ_ITEM]} pathname={pathname} compact />
        </> : <>
          <div className="space-y-1">{WORKSPACE.map((item) => <DesktopLink key={item.href} item={menuItem(item)} pathname={pathname} />)}</div>
          <NavGroup label="Account" items={ACCOUNT} pathname={pathname} />
          {admin && <NavGroup label="Administration" items={[ADMIN]} pathname={pathname} />}
          <NavGroup label="Help" items={[FAQ_ITEM]} pathname={pathname} />
          </>}
      </nav>
      {compact ? (
        <div className="flex flex-col items-center gap-1 border-t app-border py-3">
          {signedIn && !free && <ProPlanLine compact />}
          <button type="button" onClick={toggle} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="grid h-9 w-9 place-items-center rounded-lg app-muted transition-colors hover:bg-[var(--app-panel-2)] hover:text-brand-300">{theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}</button>
          <Link href={signedIn ? "/account" : "/sign-in"} title={signedIn ? displayName ?? "Account settings" : "Sign in"} aria-label={signedIn ? "Account settings" : "Sign in"} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--app-accent-wash)] text-[11px] font-bold text-brand-300 ring-1 ring-brand-400/25">{signedIn ? initials(displayName) : <LogIn size={15} aria-hidden />}</Link>
          {signedIn && <button type="button" onClick={signOut} disabled={signingOut} aria-label="Sign out" title="Sign out" className="grid h-9 w-9 place-items-center rounded-lg app-muted transition-colors hover:bg-loss/[0.08] hover:text-loss disabled:cursor-wait disabled:opacity-50">{signingOut ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}</button>}
        </div>
      ) : (
      <div className="border-t app-border">
        {freePlan ? <FreePlanLine plan={freePlan} /> : signedIn ? <ProPlanLine /> : null}
        <div className={`flex items-center gap-1 px-2 pb-3 ${freePlan ? "pt-1" : "pt-3"}`}>
          <Link href={signedIn ? "/account" : "/sign-in"} className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[var(--app-hover)]">
            <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--app-accent-wash)] text-[11px] font-bold text-brand-300 ring-1 ring-brand-400/25">
              {signedIn ? initials(displayName) : <LogIn size={15} aria-hidden />}
              {signedIn && <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-[var(--app-sidebar)] bg-profit" aria-label="Signed in" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-[var(--app-text)]">{signedIn ? displayName ?? "ForexTestLab trader" : "Sign in"}</span>
              <span className="block truncate text-[10px] app-muted">{signedIn ? "Account settings" : "Access your workspace"}</span>
            </span>
          </Link>
          {signedIn && <button type="button" onClick={signOut} disabled={signingOut} aria-label="Sign out" title="Sign out" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg app-muted transition-colors hover:bg-loss/[0.08] hover:text-loss disabled:cursor-wait disabled:opacity-50">{signingOut ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}</button>}
        </div>
      </div>
      )}
    </aside>

    {!fullScreen && <header className="sticky top-0 z-40 hidden h-16 items-center justify-between border-b app-border bg-[var(--app-bg)]/90 px-7 backdrop-blur lg:flex"><div className="flex min-w-0 items-center gap-3 text-sm"><span className="app-muted">Workspace</span><span className="app-muted">/</span><span className="truncate font-semibold">{pathname.startsWith("/account") ? "Account" : pathname.startsWith("/app/backtest") ? "Backtester" : pathname.startsWith("/app/analytics") ? "Analytics" : pathname.startsWith("/app/history") ? "Sessions" : pathname.startsWith("/app/challenges") ? "Challenges" : pathname.startsWith("/app/ai") ? "AI Analyst" : pathname.startsWith("/app/support") ? "Support" : "Dashboard"}</span></div><button type="button" onClick={toggle} className="grid h-9 w-9 place-items-center rounded-lg border app-border app-muted transition-colors hover:text-brand-300" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}</button></header>}
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b app-border bg-[var(--app-bg)]/90 px-4 backdrop-blur lg:hidden"><Link href="/app"><Logo className="h-7" /></Link><div className="flex items-center gap-2"><button type="button" onClick={toggle} className="grid h-9 w-9 place-items-center rounded-lg border app-border" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}</button><Menu size={18} className="app-muted" aria-hidden /></div></header>
  </>;
}

/** The server's plan summary is authoritative for both paid and permanent Pro. */
function ProPlanLine({ compact = false }: { compact?: boolean }) {
  return <Link href="/account/billing" aria-label="Pro plan" title="Pro plan" data-testid="sidebar-pro-plan" className={compact ? "flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-semibold text-amber-200" : "mx-4 mb-1 mt-3 flex items-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2 text-xs font-semibold text-amber-200"}>
    <Crown size={compact ? 14 : 15} aria-hidden /><span>Pro</span>
  </Link>;
}

/** Free accounts: this month's sessions and one way into Pro, above the profile. */
function FreePlanLine({ plan }: { plan: FreePlanSummary }) {
  // Sessions started since the layout loaded; the layout survives client navigation.
  const [started, setStarted] = useState(0);
  useEffect(() => {
    const count = () => setStarted((value) => value + 1);
    window.addEventListener(FREE_SESSION_STARTED_EVENT, count);
    return () => window.removeEventListener(FREE_SESSION_STARTED_EVENT, count);
  }, []);
  const used = Math.min(plan.limit, plan.used + started);
  const left = plan.limit - used;
  return <div className="px-4 pb-1.5 pt-3">
    <div className="flex items-baseline justify-between gap-2 text-[11px] app-muted">
      <span className="truncate" title={`Renews ${formatQuotaReset(plan.resetsAt)}`}><span className="font-semibold text-[var(--app-text)]">Free</span> · {left} of {plan.limit} left</span>
      <ProLock feature="sessions" className="shrink-0 rounded text-[11px] font-semibold text-brand-300 transition-colors hover:text-brand-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">Upgrade →</ProLock>
    </div>
    <div className="mt-1.5 flex gap-[3px]" role="meter" aria-label="Free sessions used this month" aria-valuemin={0} aria-valuemax={plan.limit} aria-valuenow={used}>
      {Array.from({ length: plan.limit }, (_, index) => <span key={index} className={`h-1 flex-1 rounded-full ${index < used ? "bg-brand-400" : "bg-[var(--app-border)]"}`} />)}
    </div>
  </div>;
}

function NavGroup({ label, items, pathname, compact = false }: { label: string; items: NavItem[]; pathname: string; compact?: boolean }) {
  if (compact) return <div className="mt-3 space-y-1 border-t app-border pt-3">{items.map((item) => <DesktopLink key={item.href} item={item} pathname={pathname} compact />)}</div>;
  return <div className="mt-5"><p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] app-muted">{label}</p><div className="space-y-1">{items.map((item) => <DesktopLink key={item.href} item={item} pathname={pathname} />)}</div></div>;
}
