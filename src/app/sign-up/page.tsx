import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function SignUpPage() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 py-12">
      <AuthForm mode="sign-up" />
    </main>
  );
}
