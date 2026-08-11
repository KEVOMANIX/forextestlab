import "server-only";

export type PaddleMode = "sandbox" | "live";

export function paddleMode(): PaddleMode {
  const value = process.env.PADDLE_MODE?.trim().toLowerCase();
  if (value !== "sandbox" && value !== "live") {
    throw new Error("PADDLE_MODE must be explicitly set to sandbox or live.");
  }
  return value;
}

export type PaddleBrowserEnvironment = "sandbox" | "production";

export function paddleBrowserEnvironment(): PaddleBrowserEnvironment {
  const value = process.env.NEXT_PUBLIC_PADDLE_ENV?.trim().toLowerCase();
  if (value !== "sandbox" && value !== "production") {
    throw new Error("NEXT_PUBLIC_PADDLE_ENV must be explicitly set to sandbox or production.");
  }
  const expected = paddleMode() === "sandbox" ? "sandbox" : "production";
  if (value !== expected) {
    throw new Error(`Paddle environment mismatch: PADDLE_MODE requires NEXT_PUBLIC_PADDLE_ENV=${expected}.`);
  }
  return value;
}

export function configuredPaddleApiKey(): string | undefined {
  return (paddleMode() === "live"
    ? process.env.PADDLE_LIVE_API_KEY
    : process.env.PADDLE_SANDBOX_API_KEY
  )?.trim() || process.env.PADDLE_API_KEY?.trim();
}

export function configuredPaddleWebhookSecret(): string | undefined {
  return (paddleMode() === "live"
    ? process.env.PADDLE_LIVE_WEBHOOK_SECRET
    : process.env.PADDLE_SANDBOX_WEBHOOK_SECRET
  )?.trim() || process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET?.trim();
}

export function configuredPaddleClientToken(): string | undefined {
  return (paddleMode() === "live"
    ? process.env.PADDLE_LIVE_CLIENT_TOKEN
    : process.env.PADDLE_SANDBOX_CLIENT_TOKEN
  )?.trim() || process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
}

export function paddleClientReady(): boolean {
  const token = configuredPaddleClientToken();
  const environment = paddleBrowserEnvironment();
  return Boolean(
    token &&
      (token.startsWith("test_") || token.startsWith("live_")) &&
      environment === (paddleMode() === "live" ? "production" : "sandbox"),
  );
}

export function requiredPaddleClientToken(): string {
  const token = configuredPaddleClientToken();
  const expectedPrefix = paddleMode() === "sandbox" ? "test_" : "live_";
  if (!token || !token.startsWith(expectedPrefix)) {
    throw new Error(`The configured Paddle client token must begin with ${expectedPrefix}.`);
  }
  return token;
}

function paddleApiBase(): string {
  return paddleMode() === "live"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

async function paddleApiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const apiKey = configuredPaddleApiKey();
  if (!apiKey) throw new Error("Paddle API credentials are not configured.");
  const response = await fetch(`${paddleApiBase()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as {
    data?: T;
    error?: { detail?: string };
  } | null;
  if (!response.ok || payload?.data === undefined) {
    throw new Error(payload?.error?.detail || `Paddle API returned ${response.status}.`);
  }
  return payload.data;
}

export interface PaddleSubscription {
  id: string;
  customer_id: string;
  status: string;
  scheduled_change: { action?: string } | null;
}

export interface PaddleWebhookEvent {
  eventId: string;
  eventType: string;
  data: Record<string, unknown>;
}

export function getPaddleSubscription(id: string): Promise<PaddleSubscription> {
  return paddleApiRequest(`/subscriptions/${encodeURIComponent(id)}`);
}

export function cancelPaddleSubscription(id: string): Promise<PaddleSubscription> {
  return paddleApiRequest(`/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ effective_from: "next_billing_period" }),
  });
}

export function resumePaddleSubscriptionRenewal(id: string): Promise<PaddleSubscription> {
  return paddleApiRequest(`/subscriptions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ scheduled_change: null }),
  });
}

export async function createPaddlePortalSession(
  customerId: string,
  subscriptionIds: string[],
): Promise<string> {
  const session = await paddleApiRequest<{
    urls: { general: { overview: string } };
  }>(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
    method: "POST",
    body: JSON.stringify({ subscription_ids: subscriptionIds.slice(0, 25) }),
  });
  return session.urls.general.overview;
}

function hexBytes(value: string): ArrayBuffer | null {
  if (!/^[a-f\d]{64}$/i.test(value)) return null;
  return Uint8Array.from(
    value.match(/.{2}/g) ?? [],
    (byte) => Number.parseInt(byte, 16),
  ).buffer as ArrayBuffer;
}

/** Verify and parse a Paddle webhook without bundling the full Node SDK. */
export async function unmarshalPaddleWebhook(
  rawBody: string,
  secret: string,
  signatureHeader: string,
): Promise<PaddleWebhookEvent> {
  const values = new Map<string, string[]>();
  for (const part of signatureHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const timestamp = values.get("ts")?.[0];
  const signatures = values.get("h1") ?? [];
  const timestampSeconds = Number(timestamp);
  if (
    !timestamp ||
    !Number.isFinite(timestampSeconds) ||
    Math.abs(Date.now() / 1000 - timestampSeconds) > 5 ||
    signatures.length === 0
  ) {
    throw new Error("Paddle webhook signature is missing or expired.");
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedPayload = encoder.encode(`${timestamp}:${rawBody}`);
  let verified = false;
  for (const signature of signatures) {
    const bytes = hexBytes(signature);
    if (bytes && await crypto.subtle.verify("HMAC", key, bytes, signedPayload)) {
      verified = true;
      break;
    }
  }
  if (!verified) throw new Error("Paddle webhook signature is invalid.");

  const raw = JSON.parse(rawBody) as {
    event_id?: unknown;
    event_type?: unknown;
    data?: unknown;
  };
  if (
    typeof raw.event_id !== "string" ||
    typeof raw.event_type !== "string" ||
    !raw.data ||
    typeof raw.data !== "object"
  ) {
    throw new Error("Paddle webhook payload is invalid.");
  }
  return {
    eventId: raw.event_id,
    eventType: raw.event_type,
    data: raw.data as Record<string, unknown>,
  };
}
