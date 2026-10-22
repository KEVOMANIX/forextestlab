/**
 * Keeping an emailed conversation in one thread.
 *
 * A customer's answer to our reply arrives as "Re: Billing question", and a
 * forwarded one as "Fwd: …". Matching subjects exactly split every such answer
 * into a new conversation. Mail clients also name the message they answer in
 * In-Reply-To and References, which is the reliable link when it is present.
 */

const REPLY_PREFIX = /^\s*(?:(?:re|fwd?|aw|sv|tr|antw)(?:\[\d+\])?\s*:\s*)+/i;

/** The subject without reply and forward prefixes, e.g. "Re: Fwd: X" → "X". */
export function baseSubject(subject: string): string {
  return subject.replace(REPLY_PREFIX, "").trim() || subject.trim();
}

export function sameThreadSubject(left: string, right: string): boolean {
  return baseSubject(left).toLowerCase() === baseSubject(right).toLowerCase();
}

/** Message-IDs named in In-Reply-To and References, newest first, without angle brackets. */
export function referencedMessageIds(headers: Record<string, string> | null | undefined): string[] {
  if (!headers) return [];
  const values: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (key === "in-reply-to") values.unshift(value);
    else if (key === "references") values.push(...value.split(/\s+/).reverse());
  }
  const ids = values.flatMap((value) => value.match(/<[^<>\s]+>/g) ?? []).map((id) => id.slice(1, -1));
  return [...new Set(ids)].slice(0, 20);
}

/** Both spellings a stored Message-ID may have, with and without brackets. */
export function messageIdVariants(ids: string[]): string[] {
  return ids.flatMap((id) => [id, `<${id}>`]);
}

/** A Message-ID in header form, or null for values that are not one (e.g. a widget's own id). */
export function asMessageIdHeader(id: string | null | undefined): string | null {
  const bare = id?.trim().replace(/^<|>$/g, "");
  return bare && /^[^\s<>@]+@[^\s<>@]+$/.test(bare) ? `<${bare}>` : null;
}
