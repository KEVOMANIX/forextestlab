import type { Metadata } from "next";

import { SecurePasswordForm } from "@/components/account/SecurePasswordForm";
import { requireUser } from "@/lib/auth";
import { BackLink } from "@/components/app/BackLink";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Update password", robots: { index: false } };

export default async function UpdatePasswordPage() {
  const user = await requireUser("/account/update-password");
  return (
    <main id="main" className="min-h-[calc(100vh-3.5rem)] px-4 py-10 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <BackLink fallback="/account" label="Back to account" />
        <div className="mt-6">
          <SecurePasswordForm email={user.email ?? "your verified email"} />
        </div>
      </div>
    </main>
  );
}
