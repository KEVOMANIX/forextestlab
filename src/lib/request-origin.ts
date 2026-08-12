import { siteConfig } from "@/lib/site";

function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(",", 1)[0]?.trim() || undefined;
}

function hostnameOf(host: string): string | undefined {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Resolve the browser-facing origin for redirects made behind a reverse proxy.
 * Only the production site hostnames (or a genuine local-development host) are
 * trusted, preventing a forged Host header from becoming an open redirect.
 */
export function getPublicRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = firstHeaderValue(
    request.headers.get("x-forwarded-host"),
  );
  const host = forwardedHost ?? firstHeaderValue(request.headers.get("host"));
  const hostname = host ? hostnameOf(host) : undefined;
  const isProductionHost =
    hostname === siteConfig.domain || hostname === `www.${siteConfig.domain}`;
  const isLocalRequest =
    (requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1") &&
    (hostname === "localhost" || hostname === "127.0.0.1");

  if (!host || (!isProductionHost && !isLocalRequest)) return siteConfig.url;

  const forwardedProto = firstHeaderValue(
    request.headers.get("x-forwarded-proto"),
  );
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : isProductionHost
        ? "https"
        : requestUrl.protocol.replace(":", "");

  return `${protocol}://${host}`;
}
