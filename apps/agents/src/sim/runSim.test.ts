// M5 acceptance: a headless simulation with stubbed models completes all phases and
// produces a score for every player.
import { describe, expect, it } from "vitest";
import { StubLlmClient } from "../llm/StubLlmClient.js";
import { PERSONAS } from "../personas/index.js";
import { runSim } from "./runSim.js";

describe("M5: headless session", () => {
  it("completes every phase with stubbed models and scores every player", async () => {
    const r = await runSim({ seed: 1 });
    expect(r.completed).toBe(true);
    expect(r.phases).toEqual(["plan", "prepare", "heist", "getaway", "payout", "ended"]);
    expect(r.scores.map((s) => s.name).sort()).toEqual(["Burke", "Dex", "Marisol", "Opal", "Rico", "Vega"]);
    for (const s of r.scores) expect(Number.isFinite(s.score)).toBe(true);
    // Every decision reached the ledger, and the stubs actually played the heist.
    expect(r.ledgerRows).toBeGreaterThanOrEqual(r.decisions);
    expect(r.bagsBanked).toBeGreaterThan(0);
  }, 60_000);

  it("still completes when every model reply is invalid (agents fall back to wait)", async () => {
    const r = await runSim({ seed: 2, llmFor: () => new StubLlmClient(["not json"]) });
    expect(r.completed).toBe(true);
    expect(r.scores).toHaveLength(Object.keys(PERSONAS).length);
    expect(r.bagsBanked).toBe(0);
  }, 60_000);
});
