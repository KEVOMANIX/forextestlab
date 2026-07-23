import "server-only";

import { createHash } from "node:crypto";

export const TRIAL_DEVICE_COOKIE = "ftl_trial_device";
export const TRIAL_SESSION_LIMIT = 3;

export function trialDeviceIdFromToken(token: string | undefined): string | null {
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const entry of header.split(";")) {
    const [key, ...parts] = entry.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(parts.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function trialDeviceIdFromRequest(request: Request): string | null {
  return trialDeviceIdFromToken(
    cookieValue(request, TRIAL_DEVICE_COOKIE) ?? undefined,
  );
}
