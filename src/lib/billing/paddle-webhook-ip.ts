import "server-only";

import { isIP } from "node:net";

import { paddleMode } from "./paddle";

const CACHE_TTL_MS = 60 * 60 * 1000;

interface PaddleIpResponse {
  data?: { ipv4_cidrs?: unknown };
}

let cached: { addresses: Set<string>; expiresAt: number; environment: string } | null = null;

function endpoint(): string {
  return paddleMode() === "live" ? "https://api.paddle.com/ips" : "https://sandbox-api.paddle.com/ips";
}

function normalizeIpv4Cidrs(value: unknown): Set<string> {
  if (!Array.isArray(value)) throw new Error("Paddle IP response did not include ipv4_cidrs.");
  const addresses = new Set<string>();
  for (const cidr of value) {
    if (typeof cidr !== "string") continue;
    const [address, prefix] = cidr.split("/");
    if (prefix === "32" && address && isIP(address) === 4) addresses.add(address);
  }
  if (addresses.size === 0) throw new Error("Paddle returned no valid IPv4 /32 addresses.");
  return addresses;
}

async function paddleWebhookAddresses(): Promise<Set<string>> {
  const environment = paddleMode();
  if (cached && cached.environment === environment && cached.expiresAt > Date.now()) return cached.addresses;

  const response = await fetch(endpoint(), {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Paddle IP endpoint returned ${response.status}.`);
  const body = await response.json() as PaddleIpResponse;
  const addresses = normalizeIpv4Cidrs(body.data?.ipv4_cidrs);
  cached = { addresses, expiresAt: Date.now() + CACHE_TTL_MS, environment };
  return addresses;
}

export function requestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && isIP(first) === 4 ? first : null;
}

export async function isPaddleWebhookSource(request: Request): Promise<boolean> {
  const ip = requestIp(request);
  if (!ip) return false;
  const addresses = await paddleWebhookAddresses();
  return addresses.has(ip);
}

export function clearPaddleIpCacheForTests(): void {
  cached = null;
}
