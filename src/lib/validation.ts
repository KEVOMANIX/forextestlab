/**
 * Framework-free validation helpers. Used by the API routes for server-side
 * validation and re-exported constants for the client forms so both sides
 * agree on allowed values.
 */

import type {
  ContactSubmission,
  ExperienceLevel,
  WaitlistSubmission,
} from "./types";

export const EXPERIENCE_LEVELS: {
  value: ExperienceLevel;
  label: string;
}[] = [
  { value: "beginner", label: "Beginner (0–1 years)" },
  { value: "intermediate", label: "Intermediate (1–3 years)" },
  { value: "advanced", label: "Advanced (3+ years)" },
  { value: "professional", label: "Professional / institutional" },
];

export const FOREX_PAIRS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "USD/CHF",
  "AUD/USD",
  "USD/CAD",
  "NZD/USD",
  "EUR/GBP",
  "EUR/JPY",
  "GBP/JPY",
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 5000;

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string> };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validate an unknown payload as a WaitlistSubmission. */
export function validateWaitlist(
  input: unknown,
): ValidationResult<WaitlistSubmission> {
  const errors: Record<string, string> = {};
  const data = (input ?? {}) as Record<string, unknown>;

  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const experience = data.experience;
  const pairs = Array.isArray(data.pairs) ? data.pairs : [];
  const consent = data.consent;

  if (!isNonEmptyString(name)) {
    errors.name = "Please enter your name.";
  } else if (name.length > 120) {
    errors.name = "Name must be 120 characters or fewer.";
  }

  if (!isNonEmptyString(email)) {
    errors.email = "Please enter your email address.";
  } else if (!EMAIL_RE.test(email) || email.length > 254) {
    errors.email = "Please enter a valid email address.";
  }

  const validExperience = EXPERIENCE_LEVELS.some(
    (level) => level.value === experience,
  );
  if (!validExperience) {
    errors.experience = "Please select your experience level.";
  }

  const cleanedPairs = pairs
    .filter((p): p is string => typeof p === "string")
    .filter((p) => (FOREX_PAIRS as readonly string[]).includes(p));
  if (cleanedPairs.length === 0) {
    errors.pairs = "Please select at least one preferred pair.";
  }

  if (consent !== true) {
    errors.consent = "You must agree before joining the waitlist.";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      name,
      email: email.toLowerCase(),
      experience: experience as ExperienceLevel,
      pairs: cleanedPairs,
      consent: true,
    },
  };
}

/** Validate an unknown payload as a ContactSubmission. */
export function validateContact(
  input: unknown,
): ValidationResult<ContactSubmission> {
  const errors: Record<string, string> = {};
  const data = (input ?? {}) as Record<string, unknown>;

  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const subject = typeof data.subject === "string" ? data.subject.trim() : "";
  const message = typeof data.message === "string" ? data.message.trim() : "";
  const consent = data.consent;

  if (!isNonEmptyString(name)) {
    errors.name = "Please enter your name.";
  } else if (name.length > 120) {
    errors.name = "Name must be 120 characters or fewer.";
  }

  if (!isNonEmptyString(email)) {
    errors.email = "Please enter your email address.";
  } else if (!EMAIL_RE.test(email) || email.length > 254) {
    errors.email = "Please enter a valid email address.";
  }

  if (!isNonEmptyString(subject)) {
    errors.subject = "Please enter a subject.";
  } else if (subject.length > 160) {
    errors.subject = "Subject must be 160 characters or fewer.";
  }

  if (!isNonEmptyString(message)) {
    errors.message = "Please enter a message.";
  } else if (message.length > MAX_TEXT) {
    errors.message = `Message must be ${MAX_TEXT} characters or fewer.`;
  }

  if (consent !== true) {
    errors.consent = "You must agree before submitting.";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      name,
      email: email.toLowerCase(),
      subject,
      message,
      consent: true,
    },
  };
}
