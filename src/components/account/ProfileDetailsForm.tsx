"use client";

import { Check, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProfileDetailsFormProps {
  initialDisplayName: string;
  email: string;
}

export function ProfileDetailsForm({
  initialDisplayName,
  email,
}: ProfileDetailsFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [savedDisplayName, setSavedDisplayName] = useState(initialDisplayName);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const unchanged = displayName.trim() === savedDisplayName;

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        displayName?: string;
      };

      if (!response.ok || !data.ok || !data.displayName) {
        setError(data.error ?? "Your profile could not be updated.");
        setStatus("idle");
        return;
      }

      setDisplayName(data.displayName);
      setSavedDisplayName(data.displayName);
      setStatus("saved");
      router.refresh();
      window.setTimeout(() => setStatus("idle"), 2200);
    } catch {
      setError("Your profile could not be updated. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={saveProfile}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-name" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] app-muted">
            Display name
          </label>
          <input
            id="profile-name"
            className="app-input h-11 w-full px-4"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              if (status === "saved") setStatus("idle");
            }}
            minLength={2}
            maxLength={80}
            autoComplete="name"
            required
          />
        </div>

        <div>
          <label htmlFor="profile-email" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] app-muted">
            Email address
          </label>
          <input
            id="profile-email"
            className="app-input h-11 w-full cursor-not-allowed px-4 opacity-70"
            value={email}
            readOnly
            aria-describedby="profile-email-help"
          />
          <p id="profile-email-help" className="mt-2 text-xs app-muted">
            This is the address connected to your sign-in.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t app-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite">
          {error && <p role="alert" className="text-sm text-bear">{error}</p>}
          {status === "saved" && (
            <p className="inline-flex items-center gap-1.5 text-sm text-brand-300">
              <Check size={15} aria-hidden />
              Profile updated
            </p>
          )}
        </div>
        <button
          type="submit"
          className="btn-primary h-10 px-4 py-2 text-xs"
          disabled={status === "saving" || unchanged || displayName.trim().length < 2}
        >
          {status === "saving" ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <Save size={15} aria-hidden />
          )}
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
