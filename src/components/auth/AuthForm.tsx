"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type Mode = "sign-in" | "sign-up" | "forgot-password" | "update-password";

const COPY: Record<Mode, { title: string; submit: string }> = {
  "sign-in": { title: "Sign in to ForexTestLab", submit: "Sign in" },
  "sign-up": { title: "Create your account", submit: "Create account" },
  "forgot-password": {
    title: "Reset your password",
    submit: "Send reset link",
  },
  "update-password": {
    title: "Choose a new password",
    submit: "Update password",
  },
};

export function AuthForm({
  mode,
  nextPath,
}: {
  mode: Mode;
  nextPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsEmail = mode !== "update-password";
  const needsPassword =
    mode === "sign-in" || mode === "sign-up" || mode === "update-password";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError(
        "Authentication is not configured yet. Add the Supabase URL and publishable key.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    const origin = window.location.origin;
    let result: { error: { message: string } | null };

    if (mode === "sign-up") {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: `${origin}/auth/callback?next=/app`,
        },
      });
      if (!result.error) {
        setMessage("Check your email to confirm your account.");
      }
    } else if (mode === "sign-in") {
      result = await supabase.auth.signInWithPassword({ email, password });
      if (!result.error) {
        const safeNext =
          nextPath?.startsWith("/") && !nextPath.startsWith("//")
            ? nextPath
            : "/app";
        router.replace(safeNext);
        router.refresh();
      }
    } else if (mode === "forgot-password") {
      result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/account/update-password`,
      });
      if (!result.error) {
        setMessage("If that account exists, a password-reset email has been sent.");
      }
    } else {
      result = await supabase.auth.updateUser({ password });
      if (!result.error) {
        setMessage("Your password has been updated.");
        router.replace("/account");
        router.refresh();
      }
    }

    if (result.error) setError(result.error.message);
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <form onSubmit={submit} className="panel p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{COPY[mode].title}</h1>
        <p className="mt-2 text-sm app-muted">
          {mode === "sign-up"
            ? "Save private backtests, notes, and results."
            : mode === "sign-in"
              ? "Access your private backtesting workspace."
              : mode === "forgot-password"
                ? "We will email you a secure password-reset link."
                : "Use at least eight characters for your new password."}
        </p>

        <div className="mt-6 space-y-4">
          {mode === "sign-up" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Display name</span>
              <input
                className="app-input w-full"
                autoComplete="name"
                maxLength={120}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          )}

          {needsEmail && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Email</span>
              <input
                className="app-input w-full"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}

          {needsPassword && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                {mode === "update-password" ? "New password" : "Password"}
              </span>
              <input
                className="app-input w-full"
                type="password"
                minLength={8}
                autoComplete={
                  mode === "sign-up"
                    ? "new-password"
                    : mode === "update-password"
                      ? "new-password"
                      : "current-password"
                }
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-sm text-bear">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-4 rounded-lg border border-brand-400/30 bg-brand-400/10 px-3 py-2 text-sm text-brand-300">
            {message}
          </p>
        )}

        <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
          {busy ? "Please wait…" : COPY[mode].submit}
        </button>

        <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
          {mode === "sign-in" && (
            <>
              <Link href="/forgot-password" className="text-brand-300 hover:underline">
                Forgot password?
              </Link>
              <Link href="/sign-up" className="text-brand-300 hover:underline">
                Create account
              </Link>
            </>
          )}
          {mode === "sign-up" && (
            <Link href="/sign-in" className="text-brand-300 hover:underline">
              Already have an account?
            </Link>
          )}
          {mode === "forgot-password" && (
            <Link href="/sign-in" className="text-brand-300 hover:underline">
              Return to sign in
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
