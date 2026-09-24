import { describe, expect, it } from "vitest";

import { resolveDashboardSessionId } from "@/lib/dashboard-session";

describe("resolveDashboardSessionId", () => {
  const sessions = ["latest", "chosen", "older"];

  it("restores the remembered session when the URL has no selection", () => {
    expect(resolveDashboardSessionId(null, "chosen", sessions)).toBe("chosen");
  });

  it("lets an explicit valid URL selection override the remembered session", () => {
    expect(resolveDashboardSessionId("older", "chosen", sessions)).toBe("older");
  });

  it("never restores a session outside the user's available sessions", () => {
    expect(resolveDashboardSessionId(null, "someone-elses-session", sessions)).toBe("latest");
  });
});
