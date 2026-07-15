"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import type { ApiResult } from "@/lib/types";
import { EXPERIENCE_LEVELS, FOREX_PAIRS } from "@/lib/validation";

type FieldErrors = Record<string, string>;

const initialState = {
  name: "",
  email: "",
  experience: "",
  pairs: [] as string[],
  consent: false,
};

export function WaitlistForm() {
  const [form, setForm] = useState(initialState);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success">(
    "idle",
  );
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  function togglePair(pair: string) {
    setForm((prev) => ({
      ...prev,
      pairs: prev.pairs.includes(pair)
        ? prev.pairs.filter((p) => p !== pair)
        : [...prev.pairs, pair],
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("submitting");
    setErrors({});
    setServerMessage(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data: ApiResult = await res.json();

      if (!res.ok || !data.ok) {
        if (!data.ok && data.errors) setErrors(data.errors);
        setServerMessage(data.message);
        setStatus("idle");
        return;
      }

      setStatus("success");
      setServerMessage(data.message);
      setForm(initialState);
    } catch {
      setServerMessage("Network error. Please check your connection and retry.");
      setStatus("idle");
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-brand-400/30 bg-brand-400/10 p-8 text-center"
      >
        <CheckCircle2
          size={40}
          className="mx-auto text-brand-300"
          aria-hidden
        />
        <h3 className="mt-4 text-lg font-semibold text-white">
          You&apos;re on the waitlist
        </h3>
        <p className="mt-2 text-sm text-slate-300">{serverMessage}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {serverMessage && (
        <p
          role="alert"
          className="rounded-lg border border-bear/30 bg-bear/10 px-4 py-3 text-sm text-bear"
        >
          {serverMessage}
        </p>
      )}

      <div>
        <label htmlFor="wl-name" className="field-label">
          Name
        </label>
        <input
          id="wl-name"
          name="name"
          type="text"
          autoComplete="name"
          className="field-input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "wl-name-error" : undefined}
          required
        />
        {errors.name && (
          <p id="wl-name-error" className="field-error">
            {errors.name}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="wl-email" className="field-label">
          Email address
        </label>
        <input
          id="wl-email"
          name="email"
          type="email"
          autoComplete="email"
          className="field-input"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "wl-email-error" : undefined}
          required
        />
        {errors.email && (
          <p id="wl-email-error" className="field-error">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="wl-experience" className="field-label">
          Trader experience level
        </label>
        <select
          id="wl-experience"
          name="experience"
          className="field-input"
          value={form.experience}
          onChange={(e) => setForm({ ...form, experience: e.target.value })}
          aria-invalid={Boolean(errors.experience)}
          aria-describedby={
            errors.experience ? "wl-experience-error" : undefined
          }
          required
        >
          <option value="" disabled>
            Select your experience level
          </option>
          {EXPERIENCE_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
        {errors.experience && (
          <p id="wl-experience-error" className="field-error">
            {errors.experience}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="field-label">Preferred forex pairs</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FOREX_PAIRS.map((pair) => {
            const checked = form.pairs.includes(pair);
            return (
              <label
                key={pair}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  checked
                    ? "border-brand-400/50 bg-brand-400/10 text-white"
                    : "border-white/10 bg-surface-900 text-slate-300 hover:border-white/20"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-500"
                  checked={checked}
                  onChange={() => togglePair(pair)}
                />
                <span className="font-mono">{pair}</span>
              </label>
            );
          })}
        </div>
        {errors.pairs && <p className="field-error">{errors.pairs}</p>}
      </fieldset>

      <div>
        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5 h-4 w-4 accent-brand-500"
            checked={form.consent}
            onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? "wl-consent-error" : undefined}
            required
          />
          <span>
            I agree to be contacted about ForexTestLab early access and accept
            the{" "}
            <a href="/privacy" className="text-brand-300 underline">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {errors.consent && (
          <p id="wl-consent-error" className="field-error">
            {errors.consent}
          </p>
        )}
      </div>

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Joining…
          </>
        ) : (
          "Join the Waitlist"
        )}
      </button>

      <p className="text-center text-xs text-slate-500">
        We&apos;ll only use your details to contact you about ForexTestLab. No
        spam.
      </p>
    </form>
  );
}
