/**
 * Pluggable storage layer for waitlist + contact submissions.
 *
 * The default provider ("local") appends records to JSON files under /data,
 * which is fine for local development. It is intentionally isolated behind a
 * small interface so you can swap in Supabase, Resend, Mailchimp, ConvertKit,
 * or any other backend without touching the API routes.
 *
 * To add a real provider:
 *   1. Implement the `StorageProvider` interface (see `supabaseProvider` stub).
 *   2. Return it from `getStorageProvider()` based on STORAGE_PROVIDER.
 *   3. Add the relevant env vars to `.env.example` and Vercel.
 *
 * IMPORTANT: this module is server-only. Never import it from a client
 * component — it touches the filesystem and reads secret env vars.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  ContactSubmission,
  StoredRecord,
  WaitlistSubmission,
} from "./types";

export interface StorageProvider {
  saveWaitlist(
    submission: WaitlistSubmission,
  ): Promise<StoredRecord<WaitlistSubmission>>;
  saveContact(
    submission: ContactSubmission,
  ): Promise<StoredRecord<ContactSubmission>>;
}

const DATA_DIR = path.join(process.cwd(), "data");

async function appendJson<T>(fileName: string, record: T): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, fileName);

  let existing: T[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) existing = parsed as T[];
  } catch {
    // File does not exist yet or is empty/corrupt — start fresh.
    existing = [];
  }

  existing.push(record);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf8");
}

function withMeta<T>(submission: T): StoredRecord<T> {
  return {
    ...submission,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

/** Local JSON-file provider (development default). */
const localProvider: StorageProvider = {
  async saveWaitlist(submission) {
    const record = withMeta(submission);
    await appendJson("waitlist.json", record);
    return record;
  },
  async saveContact(submission) {
    const record = withMeta(submission);
    await appendJson("contact.json", record);
    return record;
  },
};

/**
 * Example stub for a Supabase-backed provider. Uncomment, install
 * `@supabase/supabase-js`, and complete the implementation when ready.
 *
 * const supabaseProvider: StorageProvider = {
 *   async saveWaitlist(submission) {
 *     const { createClient } = await import("@supabase/supabase-js");
 *     const supabase = createClient(
 *       process.env.SUPABASE_URL!,
 *       process.env.SUPABASE_SERVICE_ROLE_KEY!,
 *     );
 *     const record = withMeta(submission);
 *     const { error } = await supabase.from("waitlist").insert(record);
 *     if (error) throw error;
 *     return record;
 *   },
 *   async saveContact(submission) {
 *     // ...same pattern against a `contact_messages` table
 *   },
 * };
 */

/** Returns the active provider based on the STORAGE_PROVIDER env var. */
export function getStorageProvider(): StorageProvider {
  switch (process.env.STORAGE_PROVIDER) {
    // case "supabase":
    //   return supabaseProvider;
    case "local":
    default:
      return localProvider;
  }
}
