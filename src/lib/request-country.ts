export function countryCodeFromHeaders(headers: Pick<Headers, "get">): string | undefined {
  const value = headers.get("x-vercel-ip-country")?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) ? value : undefined;
}
