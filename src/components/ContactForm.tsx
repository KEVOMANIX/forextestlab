"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import type { ApiResult } from "@/lib/types";

type FieldErrors = Record<string, string>;

const initialState = {
  name: "",
  email: "",
  subject: "",
  message: "",
  consent: false,
};

export function ContactForm() {
  const [form, setForm] = useState(initialState);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success">(
    "idle",
  );
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("submitting");
    setErrors({});
    setServerMessage(null);

    try {
      const res = await fetch("/api/contact", {
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
        <h3 className="mt-4 text-lg font-semibold text-white">Message sent</h3>
        <p className="mt-2 text-sm text-slate-300">{serverMessage}</p>
        <button
          type="button"
          className="btn-secondary mt-6"
          onClick={() => setStatus("idle")}
        >
          Send another message
        </button>
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

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="ct-name" className="field-label">
            Name
          </label>
          <input
            id="ct-name"
            name="name"
            type="text"
            autoComplete="name"
            className="field-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "ct-name-error" : undefined}
            required
          />
          {errors.name && (
            <p id="ct-name-error" className="field-error">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ct-email" className="field-label">
            Email
          </label>
          <input
            id="ct-email"
            name="email"
            type="email"
            autoComplete="email"
            className="field-input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "ct-email-error" : undefined}
            required
          />
          {errors.email && (
            <p id="ct-email-error" className="field-error">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="ct-subject" className="field-label">
          Subject
        </label>
        <input
          id="ct-subject"
          name="subject"
          type="text"
          className="field-input"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          aria-invalid={Boolean(errors.subject)}
          aria-describedby={errors.subject ? "ct-subject-error" : undefined}
          required
        />
        {errors.subject && (
          <p id="ct-subject-error" className="field-error">
            {errors.subject}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="ct-message" className="field-label">
          Message
        </label>
        <textarea
          id="ct-message"
          name="message"
          rows={5}
          className="field-input resize-y"
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "ct-message-error" : undefined}
          required
        />
        {errors.message && (
          <p id="ct-message-error" className="field-error">
            {errors.message}
          </p>
        )}
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5 h-4 w-4 accent-brand-500"
            checked={form.consent}
            onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? "ct-consent-error" : undefined}
            required
          />
          <span>
            I agree that ForexTestLab may use my details to respond to this
            enquiry, as described in the{" "}
            <a href="/privacy" className="text-brand-300 underline">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {errors.consent && (
          <p id="ct-consent-error" className="field-error">
            {errors.consent}
          </p>
        )}
      </div>

      <button
        type="submit"
        className="btn-primary w-full sm:w-auto"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Sending…
          </>
        ) : (
          "Send message"
        )}
      </button>
    </form>
  );
}
