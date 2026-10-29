import type { Metadata } from "next";

import { DeleteAccountSection, SessionActions } from "@/components/account/AccountActions";
import { AccountCard, AccountShell, loadAccount } from "@/components/account/AccountShell";
import { SecurePasswordForm } from "@/components/account/SecurePasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Security", robots: { index: false } };

// The password-reset email lands here too, so it stays at this address.
export default async function SecurityPage() {
  const account = await loadAccount("/account/update-password");
  return (
    <AccountShell account={account} tab="security">
      <SecurePasswordForm email={account.user.email ?? "your verified email"} />
      <AccountCard title="Active sessions" description="Control where you're signed in.">
        <SessionActions />
      </AccountCard>
      <DeleteAccountSection />
    </AccountShell>
  );
}
