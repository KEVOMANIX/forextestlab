import { describe, expect, it } from "vitest";

import { isLowerBetter } from "./polarity";

describe("isLowerBetter", () => {
  it("recognises unemployment and claims figures, in whichever country's naming", () => {
    expect(isLowerBetter("Unemployment Rate")).toBe(true);
    expect(isLowerBetter("ILO Unemployment Rate")).toBe(true);
    expect(isLowerBetter("German Unemployment Change")).toBe(true);
    expect(isLowerBetter("Initial Jobless Claims")).toBe(true);
    expect(isLowerBetter("Continuing Claims")).toBe(true);
    expect(isLowerBetter("Challenger Job Cuts")).toBe(true);
    expect(isLowerBetter("Redundancies")).toBe(true);
    expect(isLowerBetter("Personal Bankruptcies")).toBe(true);
  });

  it("leaves job-creation figures at the default — they are not unemployment", () => {
    // These must not match on "employment" alone, or Nonfarm Payrolls would
    // invert and a beat would show red.
    expect(isLowerBetter("Nonfarm Payrolls")).toBe(false);
    expect(isLowerBetter("ADP Nonfarm Employment Change")).toBe(false);
    expect(isLowerBetter("Employment Change")).toBe(false);
  });

  it("leaves everything else, including the deliberately-unguessed ones, at the default", () => {
    expect(isLowerBetter("GDP q/q")).toBe(false);
    expect(isLowerBetter("Retail Sales m/m")).toBe(false);
    expect(isLowerBetter("CPI y/y")).toBe(false);
    expect(isLowerBetter("ISM Services PMI")).toBe(false);
  });
});
