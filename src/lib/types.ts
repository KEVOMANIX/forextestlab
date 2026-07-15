/** Shared domain types for form submissions and API responses. */

export type ExperienceLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "professional";

export interface WaitlistSubmission {
  name: string;
  email: string;
  experience: ExperienceLevel;
  pairs: string[];
  consent: true;
}

export interface ContactSubmission {
  name: string;
  email: string;
  subject: string;
  message: string;
  consent: true;
}

/** Discriminated union returned by the form API routes. */
export type ApiResult =
  | { ok: true; message: string }
  | { ok: false; message: string; errors?: Record<string, string> };

/** Stored record shape (adds metadata to a submission). */
export type StoredRecord<T> = T & {
  id: string;
  createdAt: string;
};
