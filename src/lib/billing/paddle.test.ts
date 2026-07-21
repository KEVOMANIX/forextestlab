import { afterEach, describe, expect, it, vi } from "vitest";

import { paddleBrowserEnvironment, paddleMode, requiredPaddleClientToken } from "./paddle";

afterEach(() => vi.unstubAllEnvs());

describe("Paddle environment safety", () => {
  it("fails instead of silently choosing an environment", () => {
    vi.stubEnv("PADDLE_MODE", "");
    expect(() => paddleMode()).toThrow(/explicitly set/);
  });

  it("rejects a sandbox and browser environment mismatch", () => {
    vi.stubEnv("PADDLE_MODE", "sandbox");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    expect(() => paddleBrowserEnvironment()).toThrow(/mismatch/);
  });

  it("requires a sandbox client token in sandbox mode", () => {
    vi.stubEnv("PADDLE_MODE", "sandbox");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
    vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "live_wrong");
    expect(() => requiredPaddleClientToken()).toThrow(/test_/);
    vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "test_valid");
    expect(requiredPaddleClientToken()).toBe("test_valid");
  });
});
