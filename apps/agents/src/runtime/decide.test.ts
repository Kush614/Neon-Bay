import { describe, expect, it } from "vitest";
import { StubLlmClient } from "../llm/StubLlmClient.js";
import { decide, parseDecision } from "./decide.js";

const valid = { action: { type: "move_to", target: "bank" }, reason: "Scout it.", say: null, trustChanges: {} };

describe("decision parsing", () => {
  it("accepts a valid reply, including one wrapped in a code fence", async () => {
    const r = await decide(new StubLlmClient(["Sure!\n```json\n" + JSON.stringify(valid) + "\n```"]), "sys", "{}");
    expect(r.fellBack).toBe(false);
    expect(r.attempts).toBe(1);
    expect(r.decision.action).toEqual({ type: "move_to", target: "bank" });
  });

  it("retries once on invalid output, telling the model what was wrong", async () => {
    const stub = new StubLlmClient(["not json", JSON.stringify(valid)]);
    const r = await decide(stub, "sys", "{}");
    expect(r.attempts).toBe(2);
    expect(r.fellBack).toBe(false);
    expect(stub.calls[1]!.observation).toContain("previous reply was invalid");
  });

  it("falls back to wait after two invalid replies", async () => {
    const bad = JSON.stringify({ action: { type: "teleport" }, reason: "x", say: null, trustChanges: {} });
    const r = await decide(new StubLlmClient([bad, "{}"]), "sys", "{}");
    expect(r.fellBack).toBe(true);
    expect(r.decision.action).toEqual({ type: "wait" });
    expect(r.errors).toHaveLength(2);
  });

  it("rejects actions with bad arguments", () => {
    expect(parseDecision(JSON.stringify({ ...valid, action: { type: "move_to", target: "moon" } })).ok).toBe(false);
    expect(parseDecision(JSON.stringify({ ...valid, action: { type: "buy_stake", business: "citrus_grove", amount: -5 } })).ok).toBe(false);
  });

  it("clamps trust changes to ±20 per decision", async () => {
    const r = await decide(new StubLlmClient([JSON.stringify({ ...valid, trustChanges: { a: 95, b: -40, c: 5 } })]), "sys", "{}");
    expect(r.decision.trustChanges).toEqual({ a: 20, b: -20, c: 5 });
  });
});
