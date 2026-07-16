import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { requireUser } from "@/lib/auth";
import { BackLink } from "@/components/app/BackLink";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Update password", robots: { index: false } };

export default async function UpdatePasswordPage() {
  await requireUser("/account/update-password");
  return (
    <main id="main" className="mx-auto min-h-screen max-w-2xl px-4 py-12">
      <BackLink fallback="/account" label="Back to account" />
      <div className="mt-6">
        <AuthForm mode="update-password" />
      </div>
    </main>
  );
}
