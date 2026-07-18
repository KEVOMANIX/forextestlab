import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_API = "https://api.paystack.co";

export interface PaystackCustomer {
  customer_code?: string;
  email?: string;
}

export interface PaystackPlanRef {
  plan_code?: string;
  name?: string;
  interval?: string;
}

export interface PaystackTransaction {
  id: number | string;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel?: string;
  paid_at?: string | null;
  paidAt?: string | null;
  customer?: PaystackCustomer;
  plan?: PaystackPlanRef | string | null;
  metadata?: unknown;
}

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

export function isPaystackSecretKey(value: string | undefined): boolean {
  return Boolean(value && /^sk_(?:test|live)_[A-Za-z0-9]+$/.test(value.trim()));
}

export type PaystackMode = "live" | "test";

export function paystackMode(): PaystackMode {
  return process.env.PAYSTACK_MODE === "test" ? "test" : "live";
}

export function configuredPaystackSecretKey(): string | undefined {
  const value = paystackMode() === "test"
    ? process.env.PAYSTACK_TEST_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY
    : process.env.PAYSTACK_SECRET_KEY;
  return value?.trim();
}

function secretKey(): string {
  const value = configuredPaystackSecretKey();
  if (!value) throw new Error("Paystack is not configured.");
  if (!isPaystackSecretKey(value)) {
    throw new Error("The Paystack secret key is malformed. Configure exactly one server-side secret key.");
  }
  return value;
}

async function requestPaystack<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => null)) as PaystackEnvelope<T> | null;
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || "Paystack could not process this request.");
  }
  return payload.data;
}

export async function initializePaystackTransaction(input: {
  email: string;
  amount: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  productKey: string;
  userId: string;
  planCode?: string | null;
  channels: string[];
}): Promise<{ authorization_url: string; access_code: string; reference: string }> {
  return requestPaystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: String(input.amount),
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      plan: input.planCode || undefined,
      channels: input.channels,
      metadata: JSON.stringify({
        forexTestLabUserId: input.userId,
        productKey: input.productKey,
      }),
    }),
  });
}

export async function verifyPaystackTransaction(reference: string): Promise<PaystackTransaction> {
  return requestPaystack(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export async function getSubscriptionManageLink(subscriptionCode: string): Promise<string> {
  const data = await requestPaystack<{ link: string }>(
    `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`,
  );
  return data.link;
}

export function validPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const actualBuffer = Buffer.from(signature, "utf8");
  const keys = [process.env.PAYSTACK_SECRET_KEY, process.env.PAYSTACK_TEST_SECRET_KEY]
    .map((value) => value?.trim())
    .filter((value): value is string => isPaystackSecretKey(value));
  return [...new Set(keys)].some((key) => {
    const expectedBuffer = Buffer.from(createHmac("sha512", key).update(rawBody).digest("hex"), "utf8");
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  });
}
