"use client";

import Link from "next/link";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { siteConfig } from "@/lib/site";

type Mode = "sign-in" | "sign-up" | "forgot-password";

const COPY: Record<Mode, { title: string; submit: string }> = {
  "sign-in": { title: "Sign in to ForexTestLab", submit: "Sign in" },
  "sign-up": { title: "Create your account", submit: "Create account" },
  "forgot-password": {
    title: "Reset your password",
    submit: "Send reset link",
  },
};

export function AuthForm({
  mode,
  nextPath,
  initialError,
}: {
  mode: Mode;
  nextPath?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const needsPassword = mode === "sign-in" || mode === "sign-up";
  const supportsGoogle = mode === "sign-in" || mode === "sign-up";

  function safeNextPath(): string {
    return nextPath?.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/app";
  }

  function callbackUrl(next: string): string {
    const callback = new URL("/auth/callback", siteConfig.url);
    callback.searchParams.set("next", next);
    return callback.toString();
  }

  async function continueWithGoogle() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError(
        `Sign-in is temporarily unavailable. Please contact ${siteConfig.emails.support}.`,
      );
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(safeNextPath()),
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError(
        `Sign-in is temporarily unavailable. Please contact ${siteConfig.emails.support}.`,
      );
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    let result: { error: { message: string } | null };

    if (mode === "sign-up") {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: callbackUrl(safeNextPath()),
        },
      });
      if (!result.error) {
        setMessage("Check your email to confirm your account.");
      }
    } else if (mode === "sign-in") {
      result = await supabase.auth.signInWithPassword({ email, password });
      if (!result.error) {
        router.replace(safeNextPath());
        router.refresh();
      }
    } else {
      result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl("/account/update-password"),
      });
      if (!result.error) {
        setMessage("If that account exists, a password-reset email has been sent.");
      }
    }

    if (result.error) setError(result.error.message);
    setBusy(false);
  }

  return (
    <div className="w-full">
      <form
        onSubmit={submit}
        className="panel overflow-hidden p-7 shadow-[0_30px_90px_-45px_rgba(0,0,0,0.95)] sm:p-9 lg:p-10"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
          {mode === "sign-up"
            ? "Create your workspace"
            : mode === "sign-in"
              ? "Welcome back"
              : "Account recovery"}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          {COPY[mode].title}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 app-muted">
          {mode === "sign-up"
            ? "Start with three one-month trial sessions on this device."
            : mode === "sign-in"
              ? "Access your private backtesting workspace."
              : mode === "forgot-password"
                ? "We will email you a secure password-reset link."
                : "We will email you a secure password-reset link."}
        </p>

        {supportsGoogle && (
          <>
            <button
              type="button"
              onClick={continueWithGoogle}
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border app-border bg-white px-4 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
                <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.54c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z" />
                <path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.49l3.34-2.62Z" />
                <path fill="#EA4335" d="M12 6c1.47 0 2.8.51 3.84 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.95 5.51l3.34 2.62C7.18 7.76 9.39 6 12 6Z" />
              </svg>
              {busy ? "Connecting…" : "Continue with Google"}
            </button>
            <div className="my-6 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-[var(--app-border)]" />
              <span className="text-xs font-medium uppercase tracking-wider app-muted">or use email</span>
              <span className="h-px flex-1 bg-[var(--app-border)]" />
            </div>
          </>
        )}

        <div className={supportsGoogle ? "space-y-5" : "mt-7 space-y-5"}>
          {mode === "sign-up" && (
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Display name</span>
              <input
                className="app-input h-12 w-full px-4"
                autoComplete="name"
                maxLength={120}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Email address</span>
            <input
              className="app-input h-12 w-full px-4"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          {needsPassword && (
            <div className="block">
              <label
                htmlFor="auth-password"
                className="mb-2 block text-sm font-medium"
              >
                Password
              </label>
              <span className="relative block">
                <input
                  id="auth-password"
                  className="app-input h-12 w-full px-4 pr-12"
                  type={showPassword ? "text" : "password"}
                  minLength={8}
                  autoComplete={
                    mode === "sign-up"
                      ? "new-password"
                      : "current-password"
                  }
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center app-muted transition-colors hover:text-[var(--app-text)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </span>
            </div>
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

        <button
          type="submit"
          className="btn-primary mt-7 min-h-12 w-full rounded-xl"
          disabled={busy}
        >
          {busy ? "Please wait…" : COPY[mode].submit}
        </button>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          {mode === "sign-in" && (
            <>
              <Link href="/forgot-password" className="text-brand-300 hover:underline">
                Forgot password?
              </Link>
              <Link href={`/sign-up?next=${encodeURIComponent(safeNextPath())}`} className="text-brand-300 hover:underline">
                Create account
              </Link>
            </>
          )}
          {mode === "sign-up" && (
            <Link href={`/sign-in?next=${encodeURIComponent(safeNextPath())}`} className="text-brand-300 hover:underline">
              Already have an account?
            </Link>
          )}
          {mode === "forgot-password" && (
            <Link href="/sign-in" className="text-brand-300 hover:underline">
              Return to sign in
            </Link>
          )}
        </div>

        {needsPassword && (
          <p className="mt-7 flex items-center justify-center gap-2 border-t app-border pt-5 text-xs app-muted">
            <LockKeyhole className="h-3.5 w-3.5 text-brand-300" aria-hidden />
            Your credentials are encrypted in transit.
          </p>
        )}
      </form>
    </div>
  );
}
