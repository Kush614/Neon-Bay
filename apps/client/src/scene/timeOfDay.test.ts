import { describe, expect, it } from "vitest";
import { targetTimeOfDay } from "./timeOfDay.js";

describe("time of day", () => {
  it("stays sunny midday through every phase by default", () => {
    for (const phase of ["lobby", "plan", "prepare", "heist", "getaway", "payout", "ended"] as const) {
      expect(targetTimeOfDay(phase, 0)).toBe(0);
    }
  });
});
