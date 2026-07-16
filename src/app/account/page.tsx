import type { Metadata } from "next";
import Link from "next/link";

import { AccountActions } from "@/components/account/AccountActions";
import { ensureUserProfile, requireUser } from "@/lib/auth";
import { BackLink } from "@/components/app/BackLink";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/account");
  await ensureUserProfile(user);

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <BackLink />
      <h1 className="mt-5 text-2xl font-bold tracking-tight">Account settings</h1>
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
    </main>
  );
}
