import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function SignUpPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <AuthShell>
      <AuthForm mode="sign-up" nextPath={searchParams.next} />
    </AuthShell>
  );
}
