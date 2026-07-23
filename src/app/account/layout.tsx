import { AppFooter } from "@/components/app/AppFooter";
import { AppNav } from "@/components/app/AppNav";
import { AppThemeProvider } from "@/components/app/ThemeContext";
import { getCurrentUser } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const displayName = [
    user?.user_metadata?.display_name,
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
  ].find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() ?? null;

  return (
    <AppThemeProvider>
      <AppNav signedIn={Boolean(user)} displayName={displayName} admin={isAdminUser(user)} />
      {children}
      <AppFooter />
    </AppThemeProvider>
  );
}
