import { describe, expect, it } from "vitest";

import { countryCodeFromHeaders } from "./request-country";

function withCountry(value: string | null): Pick<Headers, "get"> {
  return { get: () => value };
}

describe("countryCodeFromHeaders", () => {
  it("normalizes a valid Vercel country header", () => {
    expect(countryCodeFromHeaders(withCountry("ke"))).toBe("KE");
  });

  it("does not invent or forward an unknown country", () => {
    expect(countryCodeFromHeaders(withCountry(null))).toBeUndefined();
    expect(countryCodeFromHeaders(withCountry("OTHERS"))).toBeUndefined();
    expect(countryCodeFromHeaders(withCountry("unknown"))).toBeUndefined();
  });
});
