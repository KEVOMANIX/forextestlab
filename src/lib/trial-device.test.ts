import { describe, expect, it } from "vitest";

import {
  TRIAL_SESSION_LIMIT,
  trialDeviceIdFromRequest,
  trialDeviceIdFromToken,
} from "./trial-device";

describe("trial device identity", () => {
  it("uses a stable one-way identifier for the same opaque device token", () => {
    const token = "26728e90-74bb-4a14-93fc-c114cac10548";
    const first = trialDeviceIdFromToken(token);
    const second = trialDeviceIdFromRequest(
      new Request("https://forextestlab.com", {
        headers: { cookie: `other=value; ftl_trial_device=${token}` },
      }),
    );

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(first).not.toContain(token);
  });

  it("rejects missing or malformed device tokens", () => {
    expect(trialDeviceIdFromToken(undefined)).toBeNull();
    expect(trialDeviceIdFromToken("short")).toBeNull();
    expect(
      trialDeviceIdFromRequest(
        new Request("https://forextestlab.com", {
          headers: { cookie: "ftl_trial_device=%E0%A4%A" },
        }),
      ),
    ).toBeNull();
  });

  it("defines three trial sessions per device", () => {
    expect(TRIAL_SESSION_LIMIT).toBe(3);
  });
});
