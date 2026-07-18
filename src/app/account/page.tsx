import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CreditCard } from "lucide-react";

import { AccountActions } from "@/components/account/AccountActions";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { BackLink } from "@/components/app/BackLink";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/account");
  await ensureUserProfile(user);

  return (
    <main id="main" className="app-shell min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
      <BackLink />
      <h1 className="mt-5 text-2xl font-bold tracking-tight">Account settings</h1>
      <div className="mt-6 rounded-xl border border-brand-400/25 bg-brand-400/[0.07] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><CreditCard size={18} aria-hidden /></span>
            <div><p className="text-xs app-muted">Current plan</p><h2 className="mt-1 font-semibold">Free</h2><p className="mt-1 text-xs app-muted">Review Pro options and international billing.</p></div>
          </div>
          <Link href="/account/billing" className="btn-primary shrink-0 px-4 py-2 text-xs">Manage billing <ArrowRight size={14} aria-hidden /></Link>
        </div>
      </div>
      <div className="panel mt-6 space-y-6 p-6">
        <div>
          <p className="text-xs app-muted">Email</p>
          <p className="mt-1">{user.email}</p>
        </div>
        <div>
          <p className="text-xs app-muted">Display name</p>
          <p className="mt-1">{user.user_metadata?.display_name || "Not set"}</p>
        </div>
        <Link href="/account/update-password" className="text-sm text-brand-300 hover:underline">
          Change password
        </Link>
        <AccountActions />
      </div>
      </div>
    </main>
  );
}
