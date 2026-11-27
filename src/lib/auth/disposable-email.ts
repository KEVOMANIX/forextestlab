import { DISPOSABLE_DOMAINS_RAW } from "./disposable-domains";

let domains: Set<string> | null = null;

function blocklist(): Set<string> {
  domains ??= new Set(
    DISPOSABLE_DOMAINS_RAW.split("\n").map((d) => d.trim().toLowerCase()).filter(Boolean),
  );
  return domains;
}

/**
 * True when the address uses a throwaway inbox provider. Subdomains count too
 * (x.mailinator.com). Privacy providers people keep long-term are not listed.
 */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const parts = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "").split(".");
  const list = blocklist();
  for (let i = 0; i < parts.length - 1; i++) {
    if (list.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export const DISPOSABLE_EMAIL_MESSAGE =
  "Please use a permanent email address. Temporary inboxes aren't accepted.";
