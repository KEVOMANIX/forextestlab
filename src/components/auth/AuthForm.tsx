"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { siteConfig } from "@/lib/site";

type Mode = "sign-in" | "sign-up" | "forgot-password";

const COPY: Record<Mode, { title: string; submit: string }> = {
  "sign-in": { title: "Welcome back", submit: "Sign in" },
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
  staffCopy,
}: {
  mode: Mode;
  nextPath?: string;
  initialError?: string;
  /**
   * Staff sign-in. The words change, and the route to creating an account
   * disappears: support and admin access is granted, never self-served, so
   * offering "Create account" here would only send staff down a dead end.
   */
  staffCopy?: { eyebrow: string; title: string; description: string };
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  /**
   * Which action is in flight, not merely whether one is. A single flag put the
   * Google button into "Connecting…" during an email sign-in, so a password
   * submit looked like a hung OAuth redirect.
   */
  const [busy, setBusy] = useState<"google" | "form" | null>(null);
  const pending = busy !== null;
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);

  useEffect(() => {
    if (initialError || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).has("error")) {
      setError("Google sign-in could not be completed. Please try again.");
    }
  }, [initialError]);

  const needsPassword = mode === "sign-in" || mode === "sign-up";
  const supportsGoogle = mode === "sign-in" || mode === "sign-up";

  function safeNextPath(): string {
    const requested = nextPath ?? (typeof window === "undefined"
      ? undefined
      : new URLSearchParams(window.location.search).get("next") ?? undefined);
    return requested?.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/account/continue";
  }

  function callbackUrl(next: string): string {
    // OAuth must return to the public origin that initiated the flow.
    const origin =
      typeof window === "undefined" ? siteConfig.url : window.location.origin;
    const callback = new URL("/auth/callback", origin);
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

    setBusy("google");
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
      setBusy(null);
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

    setBusy("form");
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
        /*
          A full navigation, not a client transition.

          `router.replace` followed immediately by `router.refresh` raced: the
          refresh refetched /sign-in while the replace was still in flight, and
          the router settled on /account/continue holding an empty payload
          instead of following that page's redirect — a blank screen under the
          account chrome. The session cookie has just changed anyway, so every
          server component above this one has to re-render with it, which is
          exactly what a document load does. Returning here leaves the button
          reading "Please wait…" until the page unloads.
        */
        window.location.assign(safeNextPath());
        return;
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
    setBusy(null);
  }

  return (
    <div className="w-full">
      <form
        onSubmit={submit}
        className="relative rounded-[1.25rem] border border-white/[0.09] bg-[rgba(17,26,43,.88)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,.65)] ring-1 ring-inset ring-white/[0.04] backdrop-blur-xl sm:p-8"
      >
        <div>
        {staffCopy && (
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">{staffCopy.eyebrow}</p>
        )}
        <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[1.75rem]">
          {staffCopy ? staffCopy.title : COPY[mode].title}
        </h1>
        <p className="mt-1.5 text-sm leading-5 app-muted">
          {staffCopy ? staffCopy.description : mode === "sign-up"
            ? "Free: three new sessions a month on the major pairs. No card required."
            : mode === "sign-in"
              ? "Sign in to your backtesting workspace."
              : "We will email you a secure password-reset link."}
        </p>

        {supportsGoogle && (
          <>
            <button
              type="button"
              onClick={continueWithGoogle}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-white px-4 text-[15px] font-semibold text-slate-900 shadow-sm transition-all hover:-translate-y-px hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
                <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
                <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.54c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z" />
                <path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.49l3.34-2.62Z" />
                <path fill="#EA4335" d="M12 6c1.47 0 2.8.51 3.84 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.95 5.51l3.34 2.62C7.18 7.76 9.39 6 12 6Z" />
              </svg>
              {busy === "google" ? "Connecting…" : "Continue with Google"}
            </button>
            <div className="my-5 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-[var(--app-border)]" />
              <span className="text-xs app-muted">or with email</span>
              <span className="h-px flex-1 bg-[var(--app-border)]" />
            </div>
          </>
        )}

        <div className={supportsGoogle ? "space-y-4" : "mt-6 space-y-4"}>
          {mode === "sign-up" && (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold">Display name</span>
              <input
                className="app-input h-12 w-full rounded-xl px-3.5 text-sm focus:ring-2 focus:ring-brand-400/20"
                autoComplete="name"
                maxLength={120}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold">Email address</span>
            <input
              className="app-input h-12 w-full rounded-xl px-3.5 text-sm focus:ring-2 focus:ring-brand-400/20"
              type="email"
              autoComplete="email"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "auth-form-error" : undefined}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          {needsPassword && (
            <div className="block">
              <span className="mb-1.5 flex items-center justify-between">
                <label htmlFor="auth-password" className="text-[13px] font-semibold">
                  Password
                </label>
                {mode === "sign-in" && (
                  <Link href="/forgot-password" className="text-[13px] text-brand-300 hover:underline">
                    Forgot password?
                  </Link>
                )}
              </span>
              <span className="relative block">
                <input
                  id="auth-password"
                  className="app-input h-12 w-full rounded-xl px-3.5 pr-11 text-sm focus:ring-2 focus:ring-brand-400/20"
                  type={showPassword ? "text" : "password"}
                  minLength={8}
                  autoComplete={
                    mode === "sign-up"
                      ? "new-password"
                      : "current-password"
                  }
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "auth-form-error" : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center app-muted transition-colors hover:text-[var(--app-text)]"
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
          <p id="auth-form-error" role="alert" className="mt-3.5 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-[13px] text-loss">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-3.5 rounded-lg border border-brand-400/30 bg-brand-400/10 px-3 py-2 text-[13px] text-brand-300">
            {message}
          </p>
        )}

        <button
          type="submit"
          className="btn-primary mt-6 min-h-12 w-full rounded-xl text-[15px] shadow-[0_10px_24px_-14px_rgba(69,214,168,.85)] transition-transform hover:-translate-y-px"
          disabled={pending}
        >
          {busy === "form" ? "Please wait…" : COPY[mode].submit}
        </button>

        <p className="mt-5 text-center text-[13px] app-muted">
          {mode === "sign-in" && (staffCopy ? (
            <Link href="/app" className="font-semibold text-brand-300 hover:underline">
              Not staff? Go to the app
            </Link>
          ) : (
            <>
              New here?{" "}
              <Link href={`/sign-up?next=${encodeURIComponent(safeNextPath())}`} className="font-semibold text-brand-300 hover:underline">
                Create a free account
              </Link>
            </>
          ))}
          {mode === "sign-up" && (
            <>
              Already have an account?{" "}
              <Link href={`/sign-in?next=${encodeURIComponent(safeNextPath())}`} className="font-semibold text-brand-300 hover:underline">
                Sign in
              </Link>
            </>
          )}
          {mode === "forgot-password" && (
            <Link href="/sign-in" className="font-semibold text-brand-300 hover:underline">
              Return to sign in
            </Link>
          )}
        </p>
        </div>
      </form>
    </div>
  );
}
