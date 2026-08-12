import { describe, expect, it } from "vitest";

import { parseCliFlags } from "./cli-flags";

describe("CLI flags", () => {
  it("keeps a trailing standalone flag boolean", () => {
    expect(parseCliFlags(["--symbols=AUDCHF", "--from", "2026-08-10", "--dry-run"]))
      .toEqual({ symbols: "AUDCHF", from: "2026-08-10", "dry-run": "true" });
  });
});
