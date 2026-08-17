import type { Metadata } from "next";

import { StaffSignIn } from "@/components/staff/StaffSignIn";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Support team sign-in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SupportSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; denied?: string }>;
}) {
  const { next, denied } = await searchParams;
  // Only trust an in-app destination, so the parameter cannot be used to bounce
  // a signed-in agent off to another origin.
  const nextPath = next?.startsWith("/") ? next : "/support-team";
  // "Denied" only means anything for someone who is signed in. Arriving here
  // with the flag but no session is just a stale link, and should offer the
  // form rather than an explanation of an account that is not there.
  const user = denied ? await getCurrentUser() : null;
  return (
    <StaffSignIn
      area="support"
      nextPath={nextPath}
      deniedFor={user?.email ?? null}
    />
  );
}
