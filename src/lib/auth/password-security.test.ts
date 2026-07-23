import { describe, expect, it } from "vitest";

import {
  isStrongPassword,
  MIN_PASSWORD_LENGTH,
  passwordRequirements,
} from "./password-security";

describe("password security", () => {
  it("requires length, mixed case, a number, and a symbol", () => {
    expect(isStrongPassword("short")).toBe(false);
    expect(isStrongPassword("alllowercase1!")).toBe(false);
    expect(isStrongPassword("ALLUPPERCASE1!")).toBe(false);
    expect(isStrongPassword("NoNumberHere!")).toBe(false);
    expect(isStrongPassword("NoSymbolHere1")).toBe(false);
    expect(isStrongPassword("A-secure-pass1")).toBe(true);
  });

  it("reports each requirement independently", () => {
    const results = passwordRequirements("Password123");
    expect(results.find((item) => item.key === "length")?.met).toBe(
      "Password123".length >= MIN_PASSWORD_LENGTH,
    );
    expect(results.find((item) => item.key === "uppercase")?.met).toBe(true);
    expect(results.find((item) => item.key === "lowercase")?.met).toBe(true);
    expect(results.find((item) => item.key === "number")?.met).toBe(true);
    expect(results.find((item) => item.key === "symbol")?.met).toBe(false);
  });
});
