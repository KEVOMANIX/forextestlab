import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";

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
    <main id="main" className="grid min-h-screen place-items-center px-4 py-12">
      <AuthForm
        mode="sign-in"
        nextPath={searchParams.next}
        initialError={callbackError}
      />
    </main>
  );
}
