import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Update password", robots: { index: false } };

export default async function UpdatePasswordPage() {
  await requireUser("/account/update-password");
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 py-12">
      <AuthForm mode="update-password" />
    </main>
  );
}
