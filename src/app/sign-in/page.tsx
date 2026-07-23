import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const callbackError = searchParams.error
    ? "Google sign-in could not be completed. Please try again."
    : undefined;
  return (
    <AuthShell>
      <AuthForm
        mode="sign-in"
        nextPath={searchParams.next}
        initialError={callbackError}
      />
    </AuthShell>
  );
}
