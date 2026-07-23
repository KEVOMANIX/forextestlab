"use client";

import { Check, Eye, EyeOff, KeyRound, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  isStrongPassword,
  passwordRequirements,
} from "@/lib/auth/password-security";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type Stage = "verify" | "change" | "complete";
const REAUTH_CODE_LENGTH = 8;

export function SecurePasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("verify");
  const [nonce, setNonce] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requirements = useMemo(() => passwordRequirements(password), [password]);
  const passwordsMatch = confirmation.length > 0 && confirmation === password;
  const codeComplete = nonce.length === REAUTH_CODE_LENGTH;

  async function requestCode() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError("Password security is temporarily unavailable.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: reauthenticationError } = await supabase.auth.reauthenticate();
    if (reauthenticationError) {
      setError(reauthenticationError.message);
    } else {
      setStage("change");
      setMessage(`A verification code was sent to ${email}.`);
    }
    setBusy(false);
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!new RegExp(`^\\d{${REAUTH_CODE_LENGTH}}$`).test(nonce.trim())) {
      setError(`Enter the ${REAUTH_CODE_LENGTH}-digit verification code from your email.`);
      return;
    }
    if (!isStrongPassword(password)) {
      setError("Your new password does not meet all security requirements.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError("Password security is temporarily unavailable.");
      return;
    }

    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      nonce: nonce.trim(),
    });
    if (updateError) {
      setError(
        updateError.code === "reauthentication_not_valid"
          ? "That verification code is incorrect or has expired. Request a new code and try again."
          : updateError.message,
      );
      setBusy(false);
      return;
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
    setStage("complete");
    setMessage(
      signOutError
        ? "Your password was updated successfully."
        : "Your password was updated and your other sessions were signed out.",
    );
    setBusy(false);
  }

  if (stage === "complete") {
    return (
      <section className="panel p-6 sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-400/10 text-brand-300">
          <ShieldCheck size={23} aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Password secured</h1>
        <p role="status" className="mt-2 text-sm leading-6 app-muted">{message}</p>
        <button
          type="button"
          className="btn-primary mt-6"
          onClick={() => {
            router.push("/account");
            router.refresh();
          }}
        >
          Return to account
        </button>
      </section>
    );
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b app-border p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-brand-300">
            <KeyRound size={20} aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Account security</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Change password</h1>
            <p className="mt-2 text-sm leading-6 app-muted">
              Verify your identity before choosing a new password.
            </p>
          </div>
        </div>
      </div>

      {stage === "verify" ? (
        <div className="p-6 sm:p-8">
          <div className="rounded-xl border app-border bg-[var(--app-panel-2)]/60 p-4">
            <div className="flex gap-3">
              <MailCheck size={19} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
              <div>
                <p className="text-sm font-semibold">Email verification</p>
                <p className="mt-1 text-sm leading-6 app-muted">
                  We will send a one-time code to {email}. The code confirms this change is really yours.
                </p>
              </div>
            </div>
          </div>
          {error && <Feedback kind="error">{error}</Feedback>}
          <button type="button" className="btn-primary mt-6 w-full" onClick={requestCode} disabled={busy}>
            {busy ? <><Loader2 size={15} className="animate-spin" /> Sending code…</> : "Send verification code"}
          </button>
        </div>
      ) : (
        <form onSubmit={updatePassword} className="p-6 sm:p-8">
          {message && <Feedback kind="success">{message}</Feedback>}

          <label className="mt-5 block">
            <span className="mb-1.5 block text-sm font-medium">Verification code</span>
            <input
              className="app-input w-full tracking-[0.35em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={REAUTH_CODE_LENGTH}
              pattern={`[0-9]{${REAUTH_CODE_LENGTH}}`}
              aria-describedby="verification-code-status"
              value={nonce}
              onChange={(event) => {
                setNonce(event.target.value.replace(/\D/g, "").slice(0, REAUTH_CODE_LENGTH));
                setError(null);
              }}
              required
            />
          </label>

          <p
            id="verification-code-status"
            role="status"
            className={`mt-2 flex items-center gap-2 text-xs ${codeComplete ? "text-brand-300" : "app-muted"}`}
          >
            <span className={`grid h-4 w-4 place-items-center rounded-full ${codeComplete ? "bg-brand-400/15" : "border app-border"}`}>
              {codeComplete && <Check size={11} strokeWidth={3} aria-hidden />}
            </span>
            {codeComplete
              ? "Code entered. You can now choose a new password."
              : `${nonce.length} of ${REAUTH_CODE_LENGTH} digits entered`}
          </p>

          {codeComplete && (
            <>
              <PasswordField
                label="New password"
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
                autoComplete="new-password"
              />
              <PasswordField
                label="Confirm new password"
                value={confirmation}
                onChange={setConfirmation}
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
                autoComplete="new-password"
              />

              <div className="mt-5 grid gap-2 rounded-xl border app-border bg-[var(--app-panel-2)]/55 p-4 sm:grid-cols-2">
                {requirements.map((requirement) => (
                  <p key={requirement.key} className={`flex items-center gap-2 text-xs ${requirement.met ? "text-brand-300" : "app-muted"}`}>
                    <span className={`grid h-4 w-4 place-items-center rounded-full ${requirement.met ? "bg-brand-400/15" : "border app-border"}`}>
                      {requirement.met && <Check size={11} strokeWidth={3} aria-hidden />}
                    </span>
                    {requirement.label}
                  </p>
                ))}
                <p className={`flex items-center gap-2 text-xs ${passwordsMatch ? "text-brand-300" : "app-muted"}`}>
                  <span className={`grid h-4 w-4 place-items-center rounded-full ${passwordsMatch ? "bg-brand-400/15" : "border app-border"}`}>
                    {passwordsMatch && <Check size={11} strokeWidth={3} aria-hidden />}
                  </span>
                  Passwords match
                </p>
              </div>
            </>
          )}

          {error && <Feedback kind="error">{error}</Feedback>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" className="btn-secondary" disabled={busy} onClick={requestCode}>
              Resend code
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || !codeComplete || !isStrongPassword(password) || !passwordsMatch}
            >
              {busy ? <><Loader2 size={15} className="animate-spin" /> Updating…</> : "Update password"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function PasswordField({
  label,
  value,
  visible,
  autoComplete,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label className="mt-5 block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <span className="relative block">
        <input
          className="app-input w-full pr-11"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center app-muted hover:text-[var(--app-text)]"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
        </button>
      </span>
    </label>
  );
}

function Feedback({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
        kind === "error"
          ? "border-bear/30 bg-bear/10 text-bear"
          : "border-brand-400/30 bg-brand-400/10 text-brand-300"
      }`}
    >
      {children}
    </p>
  );
}
