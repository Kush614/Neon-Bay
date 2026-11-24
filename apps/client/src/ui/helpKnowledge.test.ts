import { describe, expect, it } from "vitest";
import { answer, nextStep, TOPICS } from "./helpKnowledge.js";

describe("help bot knowledge", () => {
  it.each([
    ["How do I open the vault?", "vault"],
    ["where is the marina pier", "marina"],
    ["how do i launder my dirty cash", "launder"],
    ["what are the controls", "controls"],
    ["can the cops arrest me", "police"],
    ["how do I steal a car", "car"],
    ["what happens if someone betrays me", "betray"],
  ])("%s -> %s", (q, id) => {
    expect(answer(q)?.id).toBe(id);
  });

  it("returns null for nonsense", () => {
    expect(answer("zzqx blorp")).toBeNull();
  });

  it("never mentions the planted laundering exploit", () => {
    for (const t of TOPICS) expect(t.answer.toLowerCase()).not.toMatch(/exploit|without deduct|while carrying a bag credits/);
  });

  it("next step follows the phase and the bag", () => {
    expect(nextStep("heist", false, false)).toMatch(/vault/);
    expect(nextStep("heist", true, false)).toMatch(/marina/);
    expect(nextStep("lobby", false, false)).toMatch(/R/);
  });
});
