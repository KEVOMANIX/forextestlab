/** Sends Pine script changes to the account one at a time, so a later edit never lands before an earlier one. */
let queue: Promise<unknown> = Promise.resolve();
let lastError: string | null = null;

/** The account's reason for the last refused change (a plan limit, say), if it gave one. */
export function pineSyncError(): string | null { return lastError; }

export function sendPine(method: "PUT" | "DELETE", body?: unknown, query = ""): Promise<boolean> {
  const request = queue.then(async () => {
    try {
      const response = await fetch(`/api/pine-scripts${query}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) lastError = await response.json().then((body: { error?: unknown }) => (typeof body?.error === "string" ? body.error : null), () => null);
      return response.ok;
    } catch { lastError = null; return false; }
  });
  queue = request;
  return request;
}

/** Resolves once every change sent so far has been answered. */
export function pineSyncIdle(): Promise<unknown> { return queue; }
