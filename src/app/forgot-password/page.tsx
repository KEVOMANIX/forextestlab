import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 py-12">
      <AuthForm mode="forgot-password" />
    </main>
  );
}
