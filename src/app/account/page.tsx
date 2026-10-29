import type { Metadata } from "next";

import { AccountCard, AccountShell, loadAccount } from "@/components/account/AccountShell";
import { ProfileDetailsForm } from "@/components/account/ProfileDetailsForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default async function AccountPage() {
  const account = await loadAccount("/account");
  return (
    <AccountShell account={account} tab="general">
      <AccountCard title="General information" description="Update how your name appears across the app.">
        <ProfileDetailsForm initialDisplayName={account.displayName} email={account.user.email ?? ""} />
      </AccountCard>
    </AccountShell>
  );
}
