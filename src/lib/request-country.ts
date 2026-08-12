export function countryCodeFromHeaders(headers: Pick<Headers, "get">): string | undefined {
  const value = headers.get("cf-ipcountry")?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) ? value : undefined;
}
