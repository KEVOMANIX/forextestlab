import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignUpPage(
  props: {
    searchParams: Promise<{ next?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return (
    <AuthShell>
      <AuthForm mode="sign-up" nextPath={searchParams.next} />
    </AuthShell>
  );
}
