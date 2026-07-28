import { describe, expect, it } from "vitest";

import { formatReplayRate } from "./ReplayDiagnosticsPanel";

describe("replay diagnostics labels", () => {
  it("reports market-time rates without changing their meaning", () => {
    expect(formatReplayRate(18)).toBe("0.3m/s");
    expect(formatReplayRate(60)).toBe("1.0m/s");
    expect(formatReplayRate(1_200)).toBe("20m/s");
    expect(formatReplayRate(3_600)).toBe("1.0h/s");
    expect(formatReplayRate(7_200)).toBe("2.0h/s");
  });
});
